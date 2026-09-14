#!/usr/bin/env node
// 階段五：把解析好的舊站文章寫進資料庫。
//
// 用法：
//   API_BASE_URL=… ADMIN_USER=… ADMIN_PASSWORD=… node tools/legacy-import/import.mjs [--dry-run] [--limit N]
//
// 🔴 **走真正的 API，不直寫 SQL**（理由見 tools/content-import/api.mjs 檔頭）——
//    版本快照、UrlPath 計算、欄位驗證全部只有一份實作。
//
// ⚠️ **可重跑**：以 slug 認人，已存在就更新。blob 路徑是決定性的，重跑不會生出孤兒檔。
//
// ⚠️ **發布一定要在寫關聯之後**：寫關聯會把內容打回草稿，先發布等於發布了一份
//    沒有標籤的快照，而建置期匯出只讀快照（docs/09 §3）—— 前台的標籤會整批消失。
//
// ⚠️ **圖片上傳是另一支**（upload-images.mjs）。兩支算的 blob 路徑是同一組，
//    所以先後順序無所謂，但**兩支都要跑完**前台才不會破圖。

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { ApiClient } from '../content-import/api.mjs'
import { imageField } from './blob.mjs'
import { normalizeSlug } from './slugs.mjs'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const limit = Number(args[args.indexOf('--limit') + 1]) || Infinity

const BASE = process.env.API_BASE_URL ?? 'http://localhost:7071/api/v1'
const USER = process.env.ADMIN_USER ?? 'admin'
const PASSWORD = process.env.ADMIN_PASSWORD
const NEW_PASSWORD = process.env.ADMIN_NEW_PASSWORD

/**
 * 同時處理幾篇文章。
 * ⚠️ **這不是為了趕時間，是因為瓶頸在往返延遲。** 匯入走本機 `func` 打 westus2 的
 *    Azure SQL，每個 API 請求內部要跑幾十趟 SQL round trip，一篇就要 3 秒 ——
 *    而資料庫的 DTU 只用到 4%（2026-09-14 實測）。序列跑 1100 篇要一個小時，
 *    而那一小時裡幾乎都在等網路。
 * ⚠️ 不要再往上加：Azure SQL Basic 是 5 DTU，並行度拉太高會開始出現逾時，
 *    那時失敗的是「建到一半」的內容，比慢更麻煩。
 */
const CONCURRENCY = 8

const TERM_TYPE = { articleCategory: 2, articleTag: 4 }
const SOURCE_SITE = { main: 1, blog: 2 }
/** 舊站四個分類 → 站內 termType=2 的 slug。blog 的 46 個分類在 parse-blog.mjs 就壓好了。 */
const MAIN_CATEGORY_SLUG = { 醫美新知: 'medical-aesthetics', 皮膚新知: 'dermatology', 媒體報導: 'media', 演講授課: 'lectures' }

/**
 * 署名。
 * ⚠️ **不要掛到醫師身上。** blog 站的 WP 作者是行銷代理商的帳號
 *    （`goodhoday`、`20skineditor`、`art-vestrong`…），不是院內醫師；
 *    主站則根本沒有作者欄位。憑文章裡提到某位醫師就把他設成作者是捏造署名。
 */
const AUTHOR_NAME = '編輯部'

// ── 讀輸入 ──────────────────────────────────────────────────────────
const read = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null)
const main = read('tools/legacy-import/parsed-main.json')
const blog = read('tools/legacy-import/parsed-blog.json')
const images = read('tools/legacy-import/images.json') ?? {}
if (!main && !blog) { console.error('找不到 parsed-*.json，先跑 parse-main.mjs／parse-blog.mjs。'); process.exit(1) }

// ── 正規化成一份待匯入清單 ───────────────────────────────────────────
const CJK_PER_MINUTE = 400 // 中文閱讀速度，估算用
const textOfBlocks = (blocks) => blocks.map((b) => b.text ?? (b.items ?? []).join('') ?? '').join('')

const slugWarnings = []
const articles = []

for (const a of main?.articles ?? []) {
  articles.push(buildArticle({
    slug: a.slug,
    title: a.title,
    categorySlug: MAIN_CATEGORY_SLUG[a.category],
    date: a.date,
    cover: a.cover ? { src: a.cover, alt: a.title } : null,
    blocks: a.blocks,
    tagNames: [],
    sourceSite: SOURCE_SITE.main,
    legacyUrl: a.legacyUrl,
    legacyPath: `/share_info.php?no=${a.legacyId}`,
  }))
}

for (const a of blog?.articles ?? []) {
  const slug = normalizeSlug(a.slug) ?? `post-${a.legacyId}`
  if (slug !== a.slug) slugWarnings.push({ from: a.slug, to: slug })
  articles.push(buildArticle({
    slug,
    title: a.title,
    categorySlug: a.category,
    date: a.date,
    cover: a.cover,
    blocks: a.blocks,
    tagNames: a.tagNames,
    excerpt: a.excerpt,
    sourceSite: SOURCE_SITE.blog,
    legacyUrl: a.legacyUrl,
    // blog 是跨網域，站內 301 只處理「slug 被正規化過」造成的位移
    legacyPath: slug !== a.slug ? `/blog/${a.slug}/` : null,
  }))
}

function buildArticle(a) {
  const usage = `article/${a.slug}`
  const meta = (src) => (src ? images[src] : null)

  // 內文區塊：把舊站網址換成 blob 網址，尺寸用檔案裡讀出來的實際值。
  // ⚠️ 抓不到圖的 figure **整個拿掉**，不要留一個指向舊站的 <img>：
  //    舊站遲早會關，那時前台會出現一批破圖，而且沒有任何地方會報錯。
  let figureIndex = 0
  const dropped = []
  const blocks = []
  for (const b of a.blocks) {
    if (b.type !== 'figure') { blocks.push(b); continue }
    const i = figureIndex++
    const m = meta(b.image.src)
    if (!m) { dropped.push(b.image.src); continue }
    const field = imageField(`${usage}/body-${i}`, b.image.src, { ...m, alt: b.image.alt || a.title })
    blocks.push({ ...b, image: { src: field.url, alt: field.alt, width: m.width, height: m.height } })
  }

  const text = textOfBlocks(blocks)
  const summary = (a.excerpt || firstParagraph(blocks) || a.title).slice(0, 200)
  const coverMeta = meta(a.cover?.src)

  return {
    slug: a.slug,
    sourceSite: a.sourceSite,
    legacyUrl: a.legacyUrl,
    legacyPath: a.legacyPath,
    tagNames: a.tagNames,
    droppedImages: dropped,
    body: {
      title: a.title.slice(0, 200),
      summary,
      categorySlug: a.categorySlug,
      authorDoctorId: null,
      authorName: AUTHOR_NAME,
      reviewerDoctorId: null,
      reviewedOn: null,
      // 🔴 DisplayDate ≠ PublishAt：前者是對外顯示與 datePublished 的來源（CLAUDE.md 關鍵數字）。
      displayDate: a.date,
      cover: coverMeta ? imageField(`${usage}/cover`, a.cover.src, { ...coverMeta, alt: a.cover.alt || a.title }) : null,
      // ⚠️ **送陣列本身，不要包成 `{ blocks: [...] }`。**
      //    前台是 `JSON.parse(f.bodyBlocks) as ArticleBodyBlock[]`
      //    （app/data/articles.ts:201）—— 包一層的話 `article.body` 會是一個物件，
      //    `v-if="article.body?.length"` 判定為 falsy，**整篇內文靜靜地不渲染**。
      //    （頁面 page 的 bodyBlocks 才是物件，那是另一種形狀。）
      bodyBlocks: blocks.length ? blocks : null,
      readingMinutes: Math.max(1, Math.round(text.length / CJK_PER_MINUTE)),
      sourceSite: a.sourceSite,
    },
  }
}

function firstParagraph(blocks) {
  const p = blocks.find((b) => b.type === 'paragraph' && b.text.length > 20)
  return p ? p.text.slice(0, 120) : null
}

// ── 摘要輸出 ────────────────────────────────────────────────────────
const wanted = articles.slice(0, limit)
const totalFigures = wanted.reduce((n, a) => n + (a.body.bodyBlocks ?? []).filter((b) => b.type === 'figure').length, 0)
const totalDropped = wanted.reduce((n, a) => n + a.droppedImages.length, 0)
const allTags = [...new Set(wanted.flatMap((a) => a.tagNames))]

console.log(`待匯入 ${wanted.length} 篇（主站 ${wanted.filter((a) => a.sourceSite === 1).length}　blog ${wanted.filter((a) => a.sourceSite === 2).length}）`)
console.log(`  封面 ${wanted.filter((a) => a.body.cover).length} 篇　內文圖 ${totalFigures} 張　標籤 ${allTags.length} 個`)
if (totalDropped) console.log(`  ⚠️ ${totalDropped} 張內文圖抓不到檔案，已從內文移除（見檔頭說明）`)
if (slugWarnings.length) console.log(`  ⚠️ ${slugWarnings.length} 篇的 slug 被正規化（底線等不合法字元），會補站內 301`)

// ── 轉址表 ──────────────────────────────────────────────────────────
// 舊站文章內頁是 `share_info.php?no=NNN`（2026-09-14 實地確認）。
const redirects = wanted.filter((a) => a.legacyPath).map((a) => ({
  fromPath: a.legacyPath,
  toPath: `/blog/${a.slug}/`,
  statusCode: 301,
  isActive: true,
  source: 1, // 1 = 遷移工具產生（docs/08 §H）
}))
const csv = ['FromPath,ToPath,StatusCode,IsActive',
  ...redirects.map((r) => `${r.fromPath},${r.toPath},${r.statusCode},${r.isActive ? 1 : 0}`)].join('\n') + '\n'
writeFileSync('tools/legacy-import/redirects.csv', csv)
console.log(`  轉址 ${redirects.length} 條 → tools/legacy-import/redirects.csv`)

if (dryRun) {
  console.log('\n--dry-run：沒有寫入任何東西。')
  for (const a of wanted.slice(0, 3)) {
    console.log(`\n  ${a.slug}　${a.body.title}`)
    console.log(`    ${a.body.categorySlug}　${a.body.displayDate}　${a.body.readingMinutes} 分鐘　區塊 ${a.body.bodyBlocks?.length ?? 0}`)
    console.log(`    摘要：${a.body.summary.slice(0, 60)}…`)
    console.log(`    封面：${a.body.cover?.url ?? '（無）'}`)
  }
  process.exit(0)
}

// ── 寫入 ────────────────────────────────────────────────────────────
if (!PASSWORD) { console.error('請以 ADMIN_PASSWORD 提供密碼。'); process.exit(1) }
const api = new ApiClient(BASE)
const me = await api.login(USER, PASSWORD, NEW_PASSWORD)
console.log(`\n已登入：${me.displayName ?? USER}`)

// 分類：四個都應該已經在（種子資料）。找不到就是資料庫不對，直接停。
// ⚠️ **清單摘要不含 termType，只能逐筆取詳情** —— 但要並行。
//    content-import 那支是序列跑的（當時只有 20 筆）；搬進 386 個標籤之後
//    變成 400 多趟往返，光啟動就要等好幾分鐘，而且每次重跑都要再等一次。
const termIndex = new Map()
{
  const rows = await api.list('term')
  const queue = [...rows]
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const row = queue.shift()
      if (!row) return
      const full = await api.detail('term', row.id)
      termIndex.set(`${full.fields.termType}:${row.slug}`, full)
    }
  }))
  console.log(`  term       既有 ${termIndex.size} 筆`)
}
const termByTitle = new Map([...termIndex.values()].filter((t) => t.fields.termType === TERM_TYPE.articleTag).map((t) => [t.title, t]))

const categoryIds = new Map()
for (const slug of new Set(wanted.map((a) => a.body.categorySlug))) {
  const t = termIndex.get(`${TERM_TYPE.articleCategory}:${slug}`)
  if (!t) { console.error(`🔴 資料庫裡沒有文章分類 ${slug} —— 種子資料不完整，停止。`); process.exit(1) }
  categoryIds.set(slug, t.id)
}

// 標籤：**先以標題比對**現有的（種子的「皮秒雷射」與 WP 的「皮秒雷射」是同一個東西，
// 只是 slug 不同），比不到才新建。照 slug 比會建出一堆同名的重複標籤。
let tagsCreated = 0
const failedTags = []
const tagIds = new Map()

// slug 先一次算完並保證唯一 —— 並行建立時若在迴圈裡才決定 slug，
// 兩個同時進行的請求會算出同一個 slug 而撞上唯一索引。
const toCreate = []
for (const name of allTags) {
  const hit = termByTitle.get(name)
  if (hit) { tagIds.set(name, hit.id); continue }
  const base = normalizeSlug(name) ?? `tag-${toCreate.length + 1}`
  let unique = base
  for (let n = 2; termIndex.has(`${TERM_TYPE.articleTag}:${unique}`); n++) unique = `${base}-${n}`
  termIndex.set(`${TERM_TYPE.articleTag}:${unique}`, { id: null }) // 佔位，讓後面的名字避開這個 slug
  toCreate.push({ name, slug: unique })
}

{
  const queue = [...toCreate]
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const t = queue.shift()
      if (!t) return
      // ⚠️ 一筆失敗不可以中斷整批 —— 在 Promise.all 裡丟例外會讓其他 worker 的
      //    進度全部作廢，而已經建好的標籤仍留在資料庫，下次重跑要重新對帳。
      try {
        // ⚠️ 標籤預設 IncludeInSitemap=0 ＋ NoIndex=1（docs/08 §C-9），由 API 依 termType 處理，不覆寫。
        const item = await api.post('/admin/term', { slug: t.slug, title: t.name, termType: TERM_TYPE.articleTag })
        termIndex.set(`${TERM_TYPE.articleTag}:${t.slug}`, item)
        termByTitle.set(t.name, item)
        tagIds.set(t.name, item.id)
        await api.ensurePublished('term', item)
        tagsCreated++
      } catch (e) {
        failedTags.push({ tag: t.name, error: e.message })
      }
      if (tagsCreated % 25 === 0) process.stdout.write(`\r  term       新建標籤 ${tagsCreated}/${toCreate.length}　失敗 ${failedTags.length}`)
    }
  }))
}
console.log(`\r  term       新建標籤 ${tagsCreated}　沿用 ${allTags.length - tagsCreated - failedTags.length}　失敗 ${failedTags.length}`.padEnd(60))
if (failedTags.length) {
  // ⚠️ 建不出來的標籤，對應的文章關聯會少掉那一個 —— 重跑本腳本會補上。
  console.log(`  ⚠️ ${failedTags.length} 個標籤沒建成功，這些標籤的關聯會缺；重跑本腳本會補。`)
  for (const f of failedTags.slice(0, 5)) console.log(`     ${f.tag}：${f.error}`)
}

const existing = await api.indexBySlug('article')
let created = 0, updated = 0, done = 0
const failed = []
const publishQueue = []

/** 從佇列取出工作跑到空為止。共用計數器在單執行緒的 JS 裡不需要鎖。 */
async function pool(items, label, work) {
  const queue = [...items]
  done = 0
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const item = queue.shift()
      if (item === undefined) return
      await work(item)
      done++
      if (done % 25 === 0) process.stdout.write(`\r  ${label}    ${done}/${items.length}　失敗 ${failed.length}`)
    }
  }))
}

await pool(wanted, 'article', async (a) => {
  const body = { ...a.body, categoryTermId: categoryIds.get(a.body.categorySlug) }
  delete body.categorySlug
  try {
    const item = existing.has(a.slug)
      ? (updated++, await api.put(`/admin/article/${existing.get(a.slug).id}`, body))
      : (created++, await api.post('/admin/article', { slug: a.slug, ...body }))

    // ⚠️ **關聯端點收的是裸陣列，不是 `{ relations: [...] }`**
    //    （ContentHandler.UpdateRelationsAsync 讀 `List<RelationSaveItem>`）。
    //    包一層物件會讓反序列化丟 JsonException，而錯誤訊息是
    //    「請求內容不是有效的 JSON」—— 看起來像 JSON 壞掉，其實是形狀不對。
    //    2026-09-14 踩到：391 篇 blog 全部卡在這一步，連帶沒有進發布佇列。
    // ⚠️ 建不出來的標籤要濾掉，否則 toContentItemId 是 undefined，
    //    JSON.stringify 會直接把那個鍵丟掉，伺服器收到一筆沒有目標的關聯。
    const relations = a.tagNames
      .map((t) => tagIds.get(t))
      .filter((id) => id != null)
      .map((toContentItemId, sortOrder) => ({ relationType: 11, toContentItemId, sortOrder }))
    if (relations.length) await api.relations('article', item.id, relations)
    publishQueue.push(item.id)
  } catch (e) {
    failed.push({ slug: a.slug, error: e.message })
  }
})
console.log(`\r  article    新建 ${created}　更新 ${updated}　失敗 ${failed.length}`.padEnd(60))

// 🔴 發布放最後 —— 寫關聯會把內容打回草稿（見檔頭）。
let published = 0
await pool(publishQueue, 'publish', async (id) => {
  try {
    const item = await api.detail('article', id)
    if (item.status === 3 && item.publishedVersionId) return
    await api.publish('article', id)
    published++
  } catch (e) {
    failed.push({ slug: `id=${id}`, error: `發布失敗：${e.message}` })
  }
})
console.log(`\r  publish    發布 ${published} 筆`.padEnd(60))

if (failed.length) {
  writeFileSync('tools/legacy-import/.cache/import-failed.json', JSON.stringify(failed, null, 2) + '\n')
  console.log(`\n⚠️ ${failed.length} 筆失敗 → .cache/import-failed.json`)
  for (const f of failed.slice(0, 8)) console.log(`   ${f.slug}：${f.error}`)
}
console.log('\n完成。轉址表要另外匯入：POST /admin/redirect/import（tools/legacy-import/redirects.csv）')
