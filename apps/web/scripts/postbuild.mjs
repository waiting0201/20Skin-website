// 建置後處理。
//
// 1) 404 頁：Nuxt 把路由 /404 產成 404/index.html，但兩個消費者都要的是根目錄的
//    404.html —— SWA 的靜態 404，以及 api/fallback 那支 function（它會
//    File.ReadAllText(AppContext.BaseDirectory + "404.html") 把內容原樣送出，
//    見 docs/templates/Fallback.cs）。這裡複製一份出去。
//    ⚠️ Nuxt 自己也會產一支 404.html（它的預設錯誤頁），所以是覆蓋而不是新增。
//
// 2) 產物大小閘：SWA Free 單一環境上限 250 MB（docs/07-deployment.md §3）。
//    範本訂的門檻是 180 MB 警告、230 MB 擋下。
//    ⚠️ 現在量到的數字**含 mockup 的 11 MB 示意圖**，正式站的圖片在 Blob，
//    不進這包 —— 所以目前的數值偏高，不要拿來當上線預估。
//
// 3) /assets 的快取破壞。staticwebapp.config.json 給 /assets/* 的是
//    `max-age=31536000, immutable`，但那批檔案是照抄 mockup 的、**檔名沒有內容
//    雜湊**，於是改了樣式永遠不會失效：HTML 只快取 30 秒、CSS 卻是一年，
//    瀏覽器拿到「新 HTML 配舊 CSS」。2026-09-14 實際踩到 —— 據點頁的 Google
//    地圖 iframe 少了尺寸規則，退回原生 300×150 擠在左上角，而**兩邊的檔案
//    都是對的**，只有快取是舊的。immutable 還讓它連重新整理都不會去問。
//    這裡在 HTML（與 _nuxt 的 JS，client 端換頁會用到那些字串）裡把
//    /assets/... 補上 ?v=<內容雜湊>：內容變了網址就變，舊快取當場失效，
//    immutable 也才名副其實。
//    ⚠️ CSS 內部參照的字型不在這裡處理（改寫 CSS 會破壞「逐 byte 照抄」的
//    前提）—— 字型改走較短的 TTL，見 public/staticwebapp.config.json。
//
// 4) sitemap 對齊實際產出：拿掉指向 noindex 頁面、或根本沒產出頁面的網址。
//    2026-09-15 發現 sitemap 收了 **29 個 noindex 的網址**（27 個「內容建置中」
//    的療程頁 ＋ /terms/ 與 /medical-disclaimer/ 兩個無條文的骨架頁）。
//    Search Console 會把這個組合直接報成錯誤（"Submitted URL marked 'noindex'"），
//    也白白吃掉爬取預算 —— 而 1108 篇文章的索引預算是這個站最緊的資源（docs/06）。
//
//    ⚠️ **兩邊都沒有寫錯，是兩個系統不知道對方的存在**：
//      · 進不進 sitemap → tools/content-export 讀資料庫的 IncludeInSitemap（建置**前**）
//      · 要不要 noindex → 前台頁面在**算繪時**依內容完不完整自己決定
//        （treatments/[category]/[slug].vue 的 !hasFullContent、legal.vue 的 sections.length === 0）
//    匯出那一端看不到前台的判斷式，所以它照 IncludeInSitemap 照收。
//
//    ⚠️ **不要改用「把那幾筆的 IncludeInSitemap 關掉」來修。** 那是手動值，
//    醫師把療程內容寫完的那一天沒有人會記得去打開它 —— 頁面變成可索引了卻不在
//    sitemap 裡，問題只是換了個方向，而且更難發現。這裡以**建置產物**為準：
//    它是「這一頁到底 index 不 index」唯一的真相，而且內容補完、頁面不再 noindex
//    的那一刻，網址會自己回到 sitemap，不需要任何人記得。

import { copyFile, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const OUT = join(ROOT, '.output', 'public')

if (!existsSync(OUT)) {
  console.error('✗ 找不到 .output/public，請先跑 pnpm build')
  process.exit(1)
}

// 🔴 **2026-09-15 起前台是執行期 SSR，產物裡沒有任何頁面 HTML。**
//    這支腳本有兩步是拿「產物裡有沒有那一頁」當判斷依據的，SSR 下那個依據
//    整個消失 —— 不是失準，是會**主動造成傷害**：sitemap 那一步會把 1191 條
//    網址全部當成「沒有產出頁面」刪掉，只剩 sitemap-pages.xml 的幾條。
//    所以這裡直接以「有沒有 SSR server」分流，而不是讓那兩步在錯誤的前提下跑。
const IS_SSR = existsSync(join(ROOT, '.output', 'server'))

// ── 1. 404 ────────────────────────────────────────────────────────────
// ⚠️ SSR 下這一步不需要：`/api/fallback` 已經不存在（301 改由 server middleware
//    處理），404 也由 Nuxt 即時算繪。preset 自己會在產物根目錄放一支 404.html
//    當 SWA 的靜態錯誤頁。
const generated = join(OUT, '404', 'index.html')
if (IS_SSR) {
  console.log('· SSR：404 落點由 preset 產生的 404.html 負責，跳過複製')
} else if (existsSync(generated)) {
  await copyFile(generated, join(OUT, '404.html'))
  console.log('✓ 404/index.html → 404.html')
} else {
  console.warn('⚠ 沒有 404/index.html —— /404 沒有被預渲染，檢查 nuxt.config 的 prerender.routes')
}

// ── 3. /assets 加內容雜湊查詢字串 ────────────────────────────────────
const ASSETS = join(OUT, 'assets')
const version = new Map()   // '/assets/base.css' → 'a1b2c3d4'
if (existsSync(ASSETS)) {
  for await (const file of walk(ASSETS)) {
    const url = '/' + relative(OUT, file).split(sep).join('/')
    version.set(url, createHash('md5').update(await readFile(file)).digest('hex').slice(0, 8))
  }
}

// 只認得出現在標記／腳本裡的副檔名；沒登記在 version 裡的路徑原樣保留。
// ⚠️ 尾巴的 `(?!\?v=)` 是為了讓這支腳本**重跑安全**：少了它，對同一份產物再跑
//    一次會變成 `/assets/base.css?v=ab12?v=ab12`，而且第二個查詢字串會被
//    當成值的一部分，檔案照樣載得到、看不出有錯。
const ASSET_REF = /\/assets\/[A-Za-z0-9/_.-]+?\.(?:css|js|jpg|jpeg|png|svg|webp|woff2?)(?!\?v=)/g
const stamp = (text) => text.replace(ASSET_REF, (m) => (version.has(m) ? `${m}?v=${version.get(m)}` : m))

let stamped = 0
for await (const file of walk(OUT)) {
  if (!/\.html$/.test(file) && !(file.includes(`${sep}_nuxt${sep}`) && file.endsWith('.js'))) continue
  const before = await readFile(file, 'utf8')
  const after = stamp(before)
  if (after !== before) {
    await writeFile(file, after)
    stamped++
  }
}
console.log(`✓ /assets 加上內容雜湊：${version.size} 個檔案，改寫 ${stamped} 份產物`)

// ── 4. sitemap 對齊實際產出 ──────────────────────────────────────────
// 🔴 **SSR 下整步跳過，而且不是「暫時不做」而是「依據不存在」。**
//    它原本的價值是拿建置產物當「這一頁 index 不 index」的真相；SSR 沒有產物，
//    真相只剩執行期算繪的那一刻。第 3 段會把 sitemap 本身改成執行期路由，
//    由同一份資料算出可索引的頁面，那時一致性是天然成立的，不需要事後過濾。
//    ⚠️ 在第 3 段完成前，sitemap 仍是 export:content 產的靜態檔 ——
//    也就是說「收了 29 個 noindex 網址」那個問題在這條分支上是**回來的**。
const ORIGIN = 'https://20skin.tw'
const INDEX = join(OUT, 'sitemap.xml')
const NOINDEX = /<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i

/** 網址 → 建置產物的路徑。'/a/b/' → a/b/index.html，'/a.xml' → a.xml。 */
function pageFile(loc) {
  const path = loc.replace(ORIGIN, '').replace(/^\//, '')
  return join(OUT, path.endsWith('/') || path === '' ? join(path, 'index.html') : path)
}

let removedNoindex = 0
const missing = []   // 收進 sitemap 卻沒有產出頁面的網址 —— 這是別的 bug 的徵兆
const emptied = []

for (const name of IS_SSR ? [] : (await readdir(OUT)).filter((f) => /^sitemap-.+\.xml$/.test(f))) {
  const file = join(OUT, name)
  const xml = await readFile(file, 'utf8')

  // 逐個 <url>…</url> 區塊處理。格式是匯出工具自己產的、固定縮排，
  // 不需要動用 XML 解析器；真要改格式，這個正規式會整批漏掉而不是悄悄少幾筆。
  const kept = []
  const blocks = [...xml.matchAll(/[ \t]*<url>[\s\S]*?<\/url>\n?/g)]
  for (const m of blocks) {
    const loc = m[0].match(/<loc>([^<]+)<\/loc>/)?.[1]
    const target = loc && pageFile(loc)
    if (!target || !existsSync(target)) { missing.push(loc ?? '(無 loc)'); continue }
    if (NOINDEX.test(await readFile(target, 'utf8'))) { removedNoindex++; continue }
    kept.push(m[0])
  }

  if (kept.length === blocks.length) continue

  if (kept.length === 0) {
    // 整個分檔空掉：連檔案帶索引裡那一筆一起拿掉，不要留一個空的 urlset。
    emptied.push(name)
    await rm(file)
    continue
  }
  const head = xml.slice(0, blocks[0].index)
  await writeFile(file, head + kept.join('') + '</urlset>\n')
}

if (emptied.length && existsSync(INDEX)) {
  const idx = await readFile(INDEX, 'utf8')
  await writeFile(
    INDEX,
    idx.replace(/[ \t]*<sitemap>[\s\S]*?<\/sitemap>\n?/g, (block) =>
      emptied.some((n) => block.includes(`/${n}<`)) ? '' : block),
  )
}

if (removedNoindex || missing.length || emptied.length) {
  console.log(
    `✓ sitemap 對齊產出：移除 ${removedNoindex} 個 noindex 網址`
    + (emptied.length ? `，並拿掉空掉的 ${emptied.join('／')}` : ''),
  )
} else if (IS_SSR) {
  console.log('· SSR：sitemap 的一致性改由第 3 段的執行期路由保證，跳過過濾')
} else {
  console.log('· sitemap 與產出一致，沒有要移除的網址')
}

// ⚠️ 「收進 sitemap 卻沒有產出頁面」跟 noindex 不是同一件事，**不要一起帶過**。
//    noindex 是刻意的（內容還沒寫完）；這一種是**有東西沒被預渲染**，
//    多半是路由沒列進 prerender、或匯出與建置讀到不同批資料。
//    這裡照樣把它從 sitemap 拿掉（讓爬蟲吃 404 更糟），但一定要叫出來。
if (missing.length) {
  console.warn(`⚠ sitemap 有 ${missing.length} 個網址沒有對應的產出頁面，已移除 —— 這不是 noindex，是有頁面沒產出來：`)
  for (const loc of missing.slice(0, 10)) console.warn(`    ${loc}`)
  if (missing.length > 10) console.warn(`    …另外 ${missing.length - 10} 筆`)
}

// ── 2. 大小 ───────────────────────────────────────────────────────────
const WARN = 350 * 1024 * 1024
const FAIL = 450 * 1024 * 1024

let total = 0
for await (const file of walk(OUT)) total += (await stat(file)).size

const mb = (n) => (n / 1024 / 1024).toFixed(1) + ' MB'
console.log(`· 產物大小 ${mb(total)}（SWA Standard 單一環境上限 500 MB）`)

if (total > FAIL) {
  console.error(`✗ 超過 ${mb(FAIL)}，不可部署。見 docs/07-deployment.md §3`)
  process.exit(1)
}
if (total > WARN) {
  console.warn(`⚠ 已超過 ${mb(WARN)}，餘裕不多，而且會隨文章數成長`)
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (entry.isFile()) yield full
  }
}
