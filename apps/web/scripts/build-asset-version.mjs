// 產生 /assets/** 的內容雜湊對照表，供**算繪時**在網址後面加上 ?v=<雜湊>。
//
// 為什麼需要這支：`staticwebapp.config.json` 給 `/assets/*` 的是
// `max-age=31536000, immutable`，但那批檔案是逐 byte 照抄 mockup 的、
// **檔名裡沒有內容雜湊**。少了版號，改了樣式永遠不會失效 —— 2026-09-14 實際
// 踩過：據點頁的 Google 地圖 iframe 少了尺寸規則，退回原生 300×150 擠在左上角，
// 而**兩邊的檔案都是對的**，只有快取是舊的；immutable 還讓它連重新整理都不問。
//
// 🔴 **這支是 SSR 化之後才需要的。** 在那之前這件事由 `postbuild.mjs` 做：
//    建置產出實體 HTML，事後把裡面的 `/assets/...` 全部改寫一次就好。
//    改成執行期算繪之後**沒有建置期 HTML 可以改寫**，那個做法整個失效，
//    所以改成「建置時算好對照表，算繪時查表」。
//
// ⚠️ 來源是 `public/assets`，不是 `.output/public/assets` —— 這支在建置**前**跑，
//    那時候還沒有產物。兩者內容相同（後者是前者的複製），雜湊因此一致。
//
// ⚠️ CSS 內部參照的字型不在這裡處理（改寫 CSS 會破壞「逐 byte 照抄」的前提，
//    `verify:css` 會當場擋下）—— 字型改走較短的 TTL，見 nuxt.config 的路由設定。

import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const ASSETS = join(ROOT, 'public', 'assets')
const OUT = join(ROOT, 'app', 'assets-version.json')

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (entry.isFile()) yield full
  }
}

if (!existsSync(ASSETS)) {
  console.error('✗ 找不到 public/assets，請先跑 npm run sync:assets')
  process.exit(1)
}

const version = {}
for await (const file of walk(ASSETS)) {
  const url = '/' + relative(join(ROOT, 'public'), file).split(sep).join('/')
  version[url] = createHash('md5').update(await readFile(file)).digest('hex').slice(0, 8)
}

// 排序後再寫入：內容沒變時檔案就沒變，不會每次建置都產生假的差異。
const sorted = Object.fromEntries(Object.entries(version).sort(([a], [b]) => a.localeCompare(b)))
await writeFile(OUT, JSON.stringify(sorted, null, 2) + '\n')
console.log(`✓ 資產版號 ${Object.keys(sorted).length} 個檔案 → app/assets-version.json`)
