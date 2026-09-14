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

import { copyFile, readFile, readdir, stat, writeFile } from 'node:fs/promises'
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

// ── 1. 404 ────────────────────────────────────────────────────────────
const generated = join(OUT, '404', 'index.html')
if (existsSync(generated)) {
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
const ASSET_REF = /\/assets\/[A-Za-z0-9/_.-]+?\.(?:css|js|jpg|jpeg|png|svg|webp|woff2?)/g
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
