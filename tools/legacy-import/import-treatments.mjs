#!/usr/bin/env node
// 把 treatments.json 的療程資料寫進資料庫。
//
// 前置：node tools/legacy-import/fetch-treatments.mjs && node tools/legacy-import/parse-treatments.mjs
// 用法：node tools/legacy-import/import-treatments.mjs [--api http://localhost:7077/api/v1] [--dry-run]
//
// 寫三樣東西，**都是舊站上真的有的**：
//   ① indications —— 站內細節頁的「小標題 ＋ 段落」直接對應 items 的 title ＋ desc（14 項），
//      其餘的只有分類頁那行逗號分隔的適應症，就只寫 title、desc 留空。
//   ② deviceInfo —— **醫療器材許可證字號**，27 項全部照搬。
//      ⚠️ **其中 16 項在舊站上與別項重複** —— `衛署醫器輸字第028717號` 一個號碼掛在
//      光繞雷射、EMFACE、BTL Embody、高壓氧艙、EMSELLA 五項身上，分屬不同廠商的不同機器。
//      許可證字號核發給**單一品項**，重複代表至少有一項是錯的。
//      **仍然照搬是刻意的決定（2026-09-14）**：新站的療程資料一律以舊站為準，
//      而這些字號現在就公開在舊站上，搬過來不是產生新的宣稱。
//      每次執行都會把重複清單印出來，請院方逐項核對；敘述請以主管機關函釋及院方法務意見為準。
//   ④ title —— 中文名改採舊站的說法（新站原本用的是市場通稱）。
//      **只換中文那一段，英文前綴保留** —— 標題格式在 27 筆之間本來就不一致
//      （有 5 筆根本沒有英文前綴），統一格式是設計決定，不是資料搬遷該做的事。
//   ⑤ cover —— 舊站的去背產品圖。路徑由 content-import/images.mjs 的決定性雜湊算出，
//      檔案上傳走 `node tools/content-import/upload-images.mjs`（對照表已含這 28 筆）。
//   ⑥ Ellansé —— 舊站有 28 項，資料庫只有 27 筆，缺的那筆在這裡補建。
//   ③ 療程 → 文章的關聯 —— 舊站那 12 個「more」按鈕指向 20skinblog.com，
//      而那些文章已經在資料庫裡了。改成站內關聯，權重就不再送去外部網域（docs/01 §決策二）。
//
// 🔴 **不寫的東西更重要**：facts／aftercare／contraindications／mechanism／
//    durationText／sessionsText 舊站**完全沒有**。它們是療程時間、恢復期、術後照護與禁忌症 ——
//    要醫師寫。這支腳本跑完，療程頁**仍然是「內容建置中」而且 noindex**
//    （判斷式在 pages/treatments/[category]/[slug].vue：`summary && facts?.length`），
//    這是對的：一個對外說「建置中」的療程頁，比沒有那一頁更糟。
//
// ⚠️ **已經有內容的欄位不覆蓋。** picosure-pro 的 indications 是人寫的、比舊站完整。
//
// ⚠️ **分類不動。** 舊站的四個分類（光療美顏／微針美容／光電美容／醫學美容護膚）與新站的
//    laser／photoelectric／microneedle／skincare **不是同一套切法**。分類是 docs/01 §1 的
//    定案值，而且決定 urlPath —— 改它等於改 27 個網址，是資訊架構的決定，不是資料搬遷。

import { readFileSync } from 'node:fs'
import { ApiClient } from '../content-import/api.mjs'
import { imageField } from '../content-import/images.mjs'

const rest = process.argv.slice(2)
const apiArg = rest.indexOf('--api')
const BASE = apiArg >= 0 ? rest[apiArg + 1] : 'http://localhost:7077/api/v1'
const DRY = rest.includes('--dry-run')
const LICENSE_LABEL = '醫療器材許可字號'
const REL_TREATMENT_TO_ARTICLE = 3

const { items } = JSON.parse(readFileSync(new URL('./treatments.json', import.meta.url), 'utf8'))

// 🔴 見檔頭②：同一個字號出現在兩項以上，就代表舊站自己填錯了，不搬。
const licenseCount = new Map()
for (const i of items) {
  if (i.deviceLicense) licenseCount.set(i.deviceLicense, (licenseCount.get(i.deviceLicense) ?? 0) + 1)
}
const duplicated = new Set([...licenseCount].filter(([, n]) => n > 1).map(([lic]) => lic))

const api = new ApiClient(BASE)
await api.login('sa@system.local', process.env.SKIN20_IMPORT_PASSWORD ?? 'Import@2026x').catch(async (e) => {
  if (!String(e).includes('AUTH_INVALID_CREDENTIALS')) throw e
  return api.login('sa@system.local', process.env.SKIN20_SEED_PASSWORD ?? 'Admin@123',
    process.env.SKIN20_IMPORT_PASSWORD ?? 'Import@2026x')
})

const treatments = await api.indexBySlug('treatment')

// slug → ContentItem id 的對照取自 apps/web/content/articles.json。
// ⚠️ **不走 `api.indexBySlug('article')`** —— 清單端點的 keyword 只比對 Title 不比對 Slug
//    （ContentReadService.ListAsync），所以查一篇也得把 1111 篇分 12 頁全部拉下來。
//    那份 JSON 是同一個資料庫的匯出，而且下面每一筆都會再 GET 一次驗證 slug 對得上，
//    對不上就當場停下來 —— 用過期的匯出檔會被抓出來，不會默默關聯到別篇文章。
const ARTICLES_JSON = new URL('../../apps/web/content/articles.json', import.meta.url)
const articleIdBySlug = new Map(
  JSON.parse(readFileSync(ARTICLES_JSON, 'utf8')).map((a) => [a.slug, a.id]),
)

/** 舊站的 more 連結 → 站內文章 slug。底線改連字號是匯入時就做過的事（README ③）。 */
function articleSlugOf(blogUrl) {
  const m = blogUrl?.match(/^https:\/\/20skinblog\.com\/([^?]+)\/?$/)
  if (!m) return null                       // ?s=… 搜尋頁
  const parts = m[1].replace(/\/$/, '').split('/')
  if (parts[0] === 'category') return null  // 分類頁不是文章
  return parts[parts.length - 1].replace(/_/g, '-')
}

// ── 標題：只換中文那一段 ────────────────────────────────────────────
//
// 新站的標題格式在 27 筆之間本來就不一致：有 'POTENZA 黃金電波'、'Thermage FLX 鳳凰電波'，
// 也有 '鉑金版蜂巢皮秒雷射'、'A醇煥膚' 這種完全沒有英文前綴的。統一格式是設計決定，
// 所以這裡**保留現有的英文前綴，只把中文換成舊站的說法**。
const CJK = /[\u3400-\u9fff\uf900-\ufaff]/

function titleFrom(currentTitle, nameZh) {
  if (!nameZh) return currentTitle
  // ⚠️ 前綴必須是**用空白與中文隔開**的一段，否則 'A醇煥膚' 的 'A' 會被當成前綴，
  //    剝掉再接回去就變成 'A 醇煥膚'（2026-09-14 dry-run 抓到）。
  const prefix = (currentTitle.match(/^(.*?\S)\s+(?=[\u3400-\u9fff\uf900-\ufaff])/) ?? [])[1] ?? ''
  // 舊站的中文名常是「瑞絲朗 / 彈麗玻」這種並列，斜線統一成全形。
  let zh = nameZh.replace(/\s*[/／]\s*/g, '／').trim()
  // ⚠️ 前綴常常已經出現在中文名裡（'HBOT高壓氧艙'、'昂達ONDA 超微波'）——
  //    不剝掉就會變成 'HBOT HBOT高壓氧艙'。
  if (prefix) {
    zh = zh.replace(new RegExp(prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '').replace(/\s+/g, ' ').trim()
    // 剝掉中間的英文之後會留下一個中文之間的空格（'昂達ONDA 超微波' → '昂達 超微波'）。
    zh = zh.replace(/(?<=[\u3400-\u9fff\uf900-\ufaff]) +(?=[\u3400-\u9fff\uf900-\ufaff])/g, '')
  }
  return zh ? [prefix, zh].filter(Boolean).join(' ') : currentTitle
}

/** PNG 的寬高就在 IHDR 裡（第 16–24 個位元組），為了 28 張圖不值得引入影像函式庫。 */
function pngSize(file) {
  const b = readFileSync(file)
  if (b.length < 24 || b.readUInt32BE(12) !== 0x49484452) return { width: null, height: null }
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
}

const LEGACY_IMG_DIR = new URL('./.cache/treatments/img/', import.meta.url)

function coverField(slug, image, title) {
  if (!image) return null
  const name = image.replace(/^\.\//, '').split('/').pop()
  const { width, height } = pngSize(new URL(`images__product__${name}`, LEGACY_IMG_DIR))
  // ⚠️ src 要寫成與 image-sources.json 同一個字串 —— 雜湊吃的是 basename，
  //    但對照表查得到就以對照表為準，兩邊不一致會算出兩條路徑（images.mjs 檔頭）。
  return imageField(`treatment/${slug}/cover`, `/legacy/treatments/${name}`,
    { alt: `${title}產品圖`, width, height })
}

const stats = { indications: 0, device: 0, relations: 0, titles: 0, covers: 0, created: 0, skipped: [], licenseConflicts: [] }

// 🔴 舊站 28 項、資料庫 27 筆 —— 缺的是 Ellansé（洢蓮絲）。
//    `radiesse` 那筆的標題原本寫「Radiesse 洢蓮絲」，但洢蓮絲是 Ellansé（PCL）、
//    再生針才是 Radiesse（CaHA），兩個廠牌的兩種產品。標題由 titleFrom() 改回「再生針」，
//    洢蓮絲在這裡補建成獨立的一筆。
const NEW_TREATMENTS = {
  Ellanse: { slug: 'ellanse', afterSlug: 'xeomin' },
}

for (const raw of items) {
  let slug = raw.slug
  let row = slug ? treatments.get(slug) : null

  if (!row && NEW_TREATMENTS[raw.nameEn]) {
    const spec = NEW_TREATMENTS[raw.nameEn]
    slug = spec.slug
    row = treatments.get(slug)
    if (!row && DRY) {
      // ⚠️ --dry-run 不可以寫任何東西。2026-09-14 第一版把建立寫在這個判斷之前，
      //    結果一次 dry-run 就真的在資料庫裡建了一筆。
      console.log(`${slug.padEnd(18)} 會新建（舊站有、資料庫沒有）（--dry-run，未建立）`)
      continue
    }
    if (!row) {
      // 分類沿用同一個分類裡既有的那筆（舊站的四個分類與新站的切法不同，見檔頭）。
      const sibling = await api.detail('treatment', treatments.get(spec.afterSlug).id)
      const created = await api.post('/admin/treatment', {
        slug,
        title: `${raw.nameEn} ${titleFrom('', raw.nameZh)}`.trim(),
        categoryTermId: sibling.fields.categoryTermId,
        sortOrder: sibling.sortOrder,
      })
      row = { id: created.id, slug }
      treatments.set(slug, row)
      stats.created++
      console.log(`${slug.padEnd(18)} 新建（舊站有、資料庫沒有）`)
    }
  }

  if (!slug) { stats.skipped.push(`${raw.nameEn}（沒有對應的 slug）`); continue }
  if (!row) { stats.skipped.push(`${slug}（資料庫查無此 slug）`); continue }
  const item = { ...raw, slug }

  const before = await api.detail('treatment', row.id)
  const f = before.fields
  const body = {}
  const notes = []

  // ① 適應症
  if (f.indications) {
    notes.push('適應症已有內容，不覆蓋')
  } else {
    const list = item.sections.length
      ? item.sections.map((s) => ({ title: s.title, desc: s.body }))
      : item.indications.map((t) => ({ title: t, desc: '' }))
    if (list.length) {
      // 中文名常常是「瑞絲朗 / 彈麗玻」這種並列，標題只取第一個。
      const shortName = (item.nameZh ?? '').split(/[\/／]/)[0].trim() || before.title
      body.indications = JSON.stringify({ heading: `${shortName}可以處理哪些問題？`, items: list })
      notes.push(`適應症 ${list.length} 項${item.sections.length ? '（含說明）' : '（僅名稱）'}`)
      stats.indications++
    }
  }

  // ④ 標題：中文採舊站的說法
  const wantTitle = titleFrom(before.title, item.nameZh)
  if (wantTitle && wantTitle !== before.title) {
    body.title = wantTitle
    notes.push(`標題「${before.title}」→「${wantTitle}」`)
    stats.titles++
  }

  // ⑤ 封面：舊站的去背產品圖
  if (!f.cover) {
    const cover = coverField(item.slug, item.image, wantTitle || before.title)
    if (cover) {
      body.cover = cover
      notes.push(`封面 ${item.image.split('/').pop()}（${cover.width}×${cover.height}）`)
      stats.covers++
    }
  }

  // ② 許可證字號。已有的其他列（原廠廠牌、機型）保留，只換這一列的值。
  if (item.deviceLicense && duplicated.has(item.deviceLicense)) {
    stats.licenseConflicts.push(`${item.slug}　${item.deviceLicense}（與另外 ${licenseCount.get(item.deviceLicense) - 1} 項相同）`)
  }
  if (item.deviceLicense) {
    const rows = f.deviceInfo ? JSON.parse(f.deviceInfo) : []
    const idx = rows.findIndex((r) => r.label === LICENSE_LABEL)
    const old = idx >= 0 ? rows[idx].value : null
    if (old !== item.deviceLicense) {
      if (idx >= 0) rows[idx] = { label: LICENSE_LABEL, value: item.deviceLicense }
      else rows.push({ label: LICENSE_LABEL, value: item.deviceLicense })
      body.deviceInfo = JSON.stringify(rows)
      notes.push(`許可證字號 ${old ? `${old} → ` : ''}${item.deviceLicense}`)
      stats.device++
    }
  }

  // ③ 療程 → 文章
  const articleSlug = articleSlugOf(item.blogUrl)
  const articleId = articleSlug ? articleIdBySlug.get(articleSlug) : null
  const article = articleId ? { id: articleId, slug: articleSlug } : null
  if (item.blogUrl && !article) notes.push(`⚠ 外連 ${item.blogUrl} 對不到站內文章`)
  if (article) {
    const check = await api.detail('article', article.id)
    if (check.slug !== article.slug) {
      throw new Error(`articles.json 過期：id ${article.id} 在資料庫是 ${check.slug}，不是 ${article.slug}。` +
        '請先重跑 pnpm --filter web export:content。')
    }
  }

  if (!Object.keys(body).length && !article) {
    console.log(`${item.slug.padEnd(18)} —　${notes.join('；') || '沒有可補的資料'}`)
    continue
  }
  console.log(`${item.slug.padEnd(18)} ${notes.join('；')}`)
  if (DRY) continue

  if (Object.keys(body).length) await api.put(`/admin/treatment/${row.id}`, body)

  if (article) {
    // 🔴 只寫回正向關聯（見 content-import/import.mjs 的 forwardRelations 註解）：
    //    反向那幾筆的 From 端是對方，原樣寫回去整個請求會被退回。
    const current = (await api.detail('treatment', row.id)).relations
      .filter((r) => !r.isReverse)
      .map((r) => ({ relationType: r.relationType, toContentItemId: r.toContentItemId, sortOrder: r.sortOrder, note: r.note }))
    if (!current.some((r) => r.relationType === REL_TREATMENT_TO_ARTICLE && r.toContentItemId === article.id)) {
      current.push({ relationType: REL_TREATMENT_TO_ARTICLE, toContentItemId: article.id, sortOrder: current.length, note: null })
      await api.relations('treatment', row.id, current.map((r, i) => ({ ...r, sortOrder: i })))
      stats.relations++
      console.log(`${''.padEnd(18)} 關聯文章：${article.slug}`)
    }
  }

  // 🔴 PUT 與寫關聯都會把已發布的內容打回草稿，所以最後一定要重新發布。
  await api.publish('treatment', row.id)
}

console.log(`\n新建 ${stats.created} 筆、標題 ${stats.titles} 項、適應症 ${stats.indications} 項、` +
  `許可證字號 ${stats.device} 項、封面 ${stats.covers} 項、關聯文章 ${stats.relations} 筆`)
if (stats.skipped.length) console.log('未處理：\n  ' + stats.skipped.join('\n  '))
if (stats.licenseConflicts.length) {
  console.log(`\n🔴 照搬自舊站、但**舊站自己就重複**的許可證字號（${stats.licenseConflicts.length} 項，請院方逐項核對）：`)
  console.log('  ' + stats.licenseConflicts.join('\n  '))
}
console.log(`
⚠️ 還是沒有的（舊站完全沒有這些資料，要醫師寫）：
   facts／durationText／sessionsText／aftercare／contraindications／mechanism
   在它們補齊之前，療程細節頁仍然是「內容建置中」而且 noindex —— 這是刻意的。`)
