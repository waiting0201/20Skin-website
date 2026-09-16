// 驗收閘：站上沒有指不到東西的站內連結。
//
// 🔴 **2026-09-16 改成對「執行中的站台」爬連結。** 原本掃的是 `.output/public` 裡的
//    預渲染 HTML —— 全站改成執行期 SSR 之後那些檔案不存在了，這支於是變成
//    「掃描 1 頁、檢查 0 個連結」然後印出「✓ 全數通過」。
//    一道什麼都沒檢查卻給綠燈的閘，比沒有這道閘更危險：CI 會一路綠燈放行。
//
// ⚠️ **這支需要一個跑著的站台，而那個站台需要一個跑得動的 API。**
//    這是 SSR 換來的成本，不是可以繞過的設定問題 —— 頁面是算繪當下才存在的，
//    沒有 API 就沒有 HTML 可檢查。用法見下方 usage()。
//
// ⚠️ **種子同時來自 sitemap，不是只從首頁爬。** 兩個理由：
//    ① 爬蟲只走得到「有連結指過去」的頁，孤兒頁掃不到；
//    ② 🔴 順帶檢查 **sitemap 收的網址是不是真的打得開** —— 這正是 2026-09-16
//       發現的那個洞：sitemap 收著 `/new-chinese-aesthetics/` 與 `/makeup-style/`
//       兩個 404 網址（資料庫 `UrlPath` 錯，STATUS §八）。
//       靜態時代 `postbuild.mjs` 的過濾器會把它們默默刪掉，等於幫資料錯誤遮了一層。
//
// 另外統計 href="#"：那是 mockup 留下的佔位連結，不算錯誤（有些是刻意保留，
// 例如還沒有內容的案例），但數量要看得見，不能無聲增加。

const BASE = (process.env.VERIFY_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const CONCURRENCY = Number(process.env.VERIFY_CONCURRENCY ?? 8)
const MAX_PAGES = Number(process.env.VERIFY_MAX_PAGES ?? 5000)
const MIN_PAGES = 50

function usage() {
  return [
    '  用法：先在另一個終端機把站台跑起來，再跑這支。',
    '',
    '    # 1. API（站台每一個請求都會打它）',
    '    cd functions && func start',
    '',
    '    # 2. 站台',
    '    cd apps/web && NUXT_PUBLIC_API_BASE_URL=http://localhost:7071/api/v1 npx nuxt dev',
    '',
    '    # 3. 這支',
    '    VERIFY_BASE_URL=http://localhost:3000 pnpm --filter web verify:links',
  ].join('\n')
}

// 這些不是頁面路由，不必爬進去
const SKIP = /^\/(assets|_nuxt|api|admin)\//
// 這些是檔案，不是 HTML 頁面
const FILE_EXT = /\.(xml|txt|json|js|css|png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf|pdf)$/i

/** 取一個網址。回 `{ status, html }`；連不上回 status 0。 */
async function fetchPath(path, { html: wantHtml = true } = {}) {
  try {
    const res = await fetch(BASE + path, {
      // ⚠️ 不要自動跟隨轉址 —— 「連結指到一個會轉址的網址」與「連結指到最終網址」
      //    是兩件不同的事，自動跟隨會把前者藏起來。
      redirect: 'manual',
      headers: { Accept: 'text/html,*/*' },
      signal: AbortSignal.timeout(30_000),
    })
    const type = res.headers.get('content-type') ?? ''
    const body = wantHtml && type.includes('text/html') ? await res.text() : ''
    return { status: res.status, html: body }
  }
  catch (error) {
    return { status: 0, html: '', error: String(error?.message ?? error) }
  }
}

/** sitemap 索引 → 所有 `<loc>` 的路徑。拿不到回空陣列（由呼叫端決定要不要當掉）。 */
async function sitemapSeeds() {
  const index = await fetchPath('/sitemap.xml', { html: false })
  if (index.status !== 200) return { ok: false, paths: [] }

  const indexXml = await (await fetch(BASE + '/sitemap.xml')).text()
  const files = [...indexXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])

  const paths = new Set()
  for (const file of files) {
    const xml = await (await fetch(file.replace(/^https?:\/\/[^/]+/, BASE))).text()
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      paths.add(m[1].replace(/^https?:\/\/[^/]+/, ''))
    }
  }
  return { ok: true, paths: [...paths] }
}

const seen = new Set()            // 已排入佇列的路徑
const queue = []                  // 待爬
const sources = new Map()         // 路徑 → 是哪些頁連過去的
const fromSitemap = new Set()     // 這個路徑是 sitemap 收的
const broken = new Map()          // 路徑 → { status, from:Set }
const redirected = new Map()      // 路徑 → { status, from:Set }
let placeholders = 0
let checkedLinks = 0
let pages = 0

function enqueue(path, from) {
  if (!seen.has(path)) {
    seen.add(path)
    queue.push(path)
  }
  if (from) {
    if (!sources.has(path)) sources.set(path, new Set())
    sources.get(path).add(from)
  }
}

/** 從一頁的 HTML 收出站內連結。 */
function linksIn(html, from) {
  const out = []
  for (const m of html.matchAll(/<a\b[^>]*?\shref="([^"]*)"/g)) {
    const raw = m[1]
    if (raw === '#' || raw.startsWith('#')) { placeholders++; continue }
    if (/^([a-z]+:)?\/\//i.test(raw) || /^(mailto|tel):/i.test(raw)) continue
    if (!raw.startsWith('/')) continue
    if (SKIP.test(raw)) continue

    const path = raw.split('#')[0]
    checkedLinks++
    out.push(path)
  }
  // ⚠️ 同一頁重複連到同一個目標很常見（麵包屑＋卡片＋頁尾），去重之後才排隊
  return [...new Set(out)].map((p) => ({ path: p, from }))
}

console.log(`· 目標站台 ${BASE}`)

const probe = await fetchPath('/')
if (probe.status === 0) {
  console.error(`\n✗ 連不上 ${BASE} —— 這支需要一個跑著的站台。\n\n${usage()}`)
  process.exit(1)
}
if (probe.status >= 500) {
  console.error(
    `\n✗ 首頁回 ${probe.status}。SSR 之下這通常代表 **API 連不上**（前台每一個請求都會打它）。\n\n${usage()}`,
  )
  process.exit(1)
}

const seeds = await sitemapSeeds()
if (!seeds.ok) {
  console.error('\n✗ 拿不到 /sitemap.xml —— 它也是執行期由 API 產生的，同樣需要 API 活著。')
  process.exit(1)
}
for (const p of seeds.paths) { fromSitemap.add(p); enqueue(p, null) }
console.log(`· sitemap 種子 ${seeds.paths.length} 條`)
enqueue('/', null)

// 廣度優先，固定並行度。⚠️ 不要無上限併發 —— 每一個請求背後都是一次
//    `Nuxt → Function App → SQL` 的往返，打太快只會把自己的 API 打掛，
//    然後得到一堆看起來像斷鏈的 5xx。
async function worker() {
  while (queue.length) {
    const path = queue.shift()
    if (pages >= MAX_PAGES) return
    const isFile = FILE_EXT.test(path.split('?')[0])
    const res = await fetchPath(path, { html: !isFile })
    pages++
    if (pages % 200 === 0) console.log(`  … 已檢查 ${pages} 頁，佇列剩 ${queue.length}`)

    const record = (map) => {
      if (!map.has(path)) map.set(path, { status: res.status, from: new Set() })
      for (const s of sources.get(path) ?? []) map.get(path).from.add(s)
      if (fromSitemap.has(path)) map.get(path).from.add('(sitemap)')
    }

    if (res.status === 0 || res.status >= 400) { record(broken); continue }
    if (res.status >= 300) { record(redirected); continue }
    if (!res.html) continue

    for (const { path: target } of linksIn(res.html, path)) enqueue(target, path)
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker))

console.log(`\n· 檢查 ${pages} 頁、${checkedLinks} 個站內連結`)
console.log(`· href="#" 佔位連結 ${placeholders} 個（mockup 遺留，不算錯誤）`)

// 🔴 **沒有東西可掃的時候一定要當掉，不可以回報通過。**（理由見檔頭）
if (pages < MIN_PAGES) {
  console.error(`\n✗ 只檢查到 ${pages} 頁（門檻 ${MIN_PAGES}），這不是「沒有斷鏈」，是「沒有東西可檢查」。`)
  process.exit(1)
}

let failed = false

// ⚠️ sitemap 收的網址只要不是 200 就是錯的 —— 會轉址的網址不該出現在 sitemap，
//    那等於告訴爬蟲「請收錄這個」然後又說「其實在別的地方」。
const sitemapRedirects = [...redirected].filter(([p]) => fromSitemap.has(p))
if (redirected.size) {
  console.log(`\n· ${redirected.size} 個連結指向會轉址的網址：`)
  for (const [target, info] of [...redirected].sort().slice(0, 10)) {
    console.log(`  - ${target}  (${info.status})  ← ${[...info.from].slice(0, 2).join('、')}`)
  }
  if (redirected.size > 10) console.log(`  …等 ${redirected.size} 個`)
}
if (sitemapRedirects.length) {
  console.error(`\n✗ sitemap 收了 ${sitemapRedirects.length} 個會轉址的網址（sitemap 只該收最終網址）：`)
  for (const [target, info] of sitemapRedirects.slice(0, 10)) console.error(`  - ${target}  (${info.status})`)
  failed = true
}

if (broken.size) {
  console.error(`\n✗ ${broken.size} 個指不到的網址：\n`)
  for (const [target, info] of [...broken].sort()) {
    const list = [...info.from].slice(0, 3).join('、')
    const more = info.from.size > 3 ? ` 等 ${info.from.size} 處` : ''
    console.error(`  - ${target}  (${info.status || '連不上'})  ← ${list}${more}`)
  }
  failed = true
}

if (failed) process.exit(1)
console.log('\n✓ verify:links 全數通過：沒有指不到的站內連結，sitemap 收的網址都打得開。')
