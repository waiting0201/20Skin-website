// 驗收閘：產出的 HTML 裡沒有指不到東西的站內連結。
//
// 對象是 .output/public 的實際產物，不是原始碼 —— 靜態分析猜不準（型別宣告、
// 樣板字串組出來的網址都會漏），而這個站有約 950 個 URL 與約 770 條 301，
// 「連結指到不存在的頁」會直接變成軟性 404 與流失的權重。
//
// 另外統計 href="#"：那是 mockup 留下的佔位連結，不算錯誤（有些是刻意保留，
// 例如還沒有內容的案例），但數量要看得見，不能無聲增加。

import { readdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const OUT = join(ROOT, '.output', 'public')

if (!existsSync(OUT)) {
  console.error('✗ 找不到 .output/public，請先跑 pnpm build')
  process.exit(1)
}

// 這些不是頁面路由，不必解析成 HTML
const SKIP = /^\/(assets|_nuxt|api)\//

const broken = new Map() // 目標路徑 → 來源頁面集合
let placeholders = 0
let checked = 0
let pages = 0

for await (const file of walk(OUT)) {
  if (!file.endsWith('.html')) continue
  pages++
  const from = '/' + posix.relative(OUT, file).replace(/index\.html$/, '')
  const html = await readFile(file, 'utf8')

  for (const m of html.matchAll(/<a\b[^>]*?\shref="([^"]*)"/g)) {
    const raw = m[1]
    if (raw === '#' || raw.startsWith('#')) {
      placeholders++
      continue
    }
    // 外部連結、mailto、tel 不在範圍
    if (/^([a-z]+:)?\/\//i.test(raw) || /^(mailto|tel):/i.test(raw)) continue
    if (!raw.startsWith('/')) continue
    if (SKIP.test(raw)) continue

    const path = raw.split(/[?#]/)[0]
    checked++
    if (!resolves(path)) {
      if (!broken.has(path)) broken.set(path, new Set())
      broken.get(path).add(from)
    }
  }
}

console.log(`· 掃描 ${pages} 頁，檢查 ${checked} 個站內連結`)

// 🔴 **沒有東西可掃的時候一定要當掉，不可以回報通過。**
//    2026-09-15 改成執行期 SSR 之後踩到：產物裡不再有頁面 HTML，這支於是
//    「掃描 1 頁、檢查 0 個連結」然後印出「✓ 全數通過」。一道什麼都沒檢查、
//    卻給綠燈的閘，比沒有這道閘更危險 —— CI 會一路綠燈放行。
//    ⚠️ 這只是讓它不能說謊。真正的修法是改成對執行中的 SSR 站爬連結，
//    排在第 3 段（sitemap／robots 改成執行期路由）一起做。
const MIN_PAGES = 50
if (pages < MIN_PAGES) {
  console.error(
    `\n✗ 只掃到 ${pages} 頁（門檻 ${MIN_PAGES}），這不是「沒有斷鏈」，是「沒有東西可檢查」。\n`
    + '  執行期 SSR 的產物裡沒有頁面 HTML，這支要改成對執行中的站台爬連結才有意義。',
  )
  process.exit(1)
}
console.log(`· href="#" 佔位連結 ${placeholders} 個（mockup 遺留，不算錯誤）`)

if (broken.size) {
  console.error(`\n✗ verify:links 有 ${broken.size} 個指不到的站內連結：\n`)
  for (const [target, sources] of [...broken].sort()) {
    const list = [...sources].slice(0, 3).join('、')
    const more = sources.size > 3 ? ` 等 ${sources.size} 頁` : ''
    console.error(`  - ${target}  ← ${list}${more}`)
  }
  process.exit(1)
}
console.log('\n✓ verify:links 全數通過：沒有指不到的站內連結。')

/** 預渲染產物的三種落點：目錄式、.html、以及根目錄的檔案。 */
function resolves(path) {
  const p = path.replace(/^\//, '')
  return (
    existsSync(join(OUT, p, 'index.html')) ||
    existsSync(join(OUT, p.endsWith('/') ? p.slice(0, -1) + '.html' : p + '.html')) ||
    existsSync(join(OUT, p))
  )
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (entry.isFile()) yield full
  }
}
