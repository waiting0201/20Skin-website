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

import { copyFile, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
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

// ── 2. 大小 ───────────────────────────────────────────────────────────
const WARN = 180 * 1024 * 1024
const FAIL = 230 * 1024 * 1024

let total = 0
for await (const file of walk(OUT)) total += (await stat(file)).size

const mb = (n) => (n / 1024 / 1024).toFixed(1) + ' MB'
console.log(`· 產物大小 ${mb(total)}（SWA Free 單一環境上限 250 MB）`)

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
