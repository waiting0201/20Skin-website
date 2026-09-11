// 驗收閘：樣式必須照抄 mockup
//
// 四項斷言，對應四種會讓「照抄」悄悄失效的方式：
//   1. public/assets 的樣式與 mockup 逐 byte 相同  ← 有人直接改了同步後的檔案
//   2. app/ 底下的 .vue 不得有 <style> 區塊        ← 有人在元件裡補樣式
//   3. app/ 底下不得有自己的 .css                  ← 有人另開一支樣式表
//   4. 前台用到的 class 必須來自 base.css 或該頁的 mockup 標記 ← 有人發明了新 class
//      （發明新 class 必然伴隨新樣式，否則那個 class 什麼都不做）
//
// app/admin/** 與 app/pages/admin/** 不受 1–4 管：後台沒有 mockup 設計稿，
// 是依功能切的（docs/09 §8）。

import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const MOCKUP = join(ROOT, '..', 'mockup', 'assets')
const SYNCED = join(ROOT, 'public', 'assets')
const APP = join(ROOT, 'app')

const failures = []
const notes = []

// ── 1. 逐 byte 比對 ────────────────────────────────────────────────────
let compared = 0
for await (const file of walk(MOCKUP)) {
  const rel = relative(MOCKUP, file)
  if (!/\.(css|js)$|^fonts[/\\]/.test(rel)) continue
  compared++
  const mine = await readFile(join(SYNCED, rel)).catch(() => null)
  if (mine === null) {
    failures.push(`同步缺檔：public/assets/${rel}（跑 pnpm sync:assets）`)
    continue
  }
  const theirs = await readFile(file)
  if (!mine.equals(theirs)) {
    failures.push(`與 mockup 不一致：public/assets/${rel} —— 樣式要改請改 mockup/assets/${rel} 再同步`)
  }
}
notes.push(`逐 byte 比對 ${compared} 個樣式／腳本／字型檔`)

// ── 2 & 3. app/ 底下不得有自己的樣式 ──────────────────────────────────
const vueFiles = []
for await (const file of walk(APP)) {
  const rel = relative(APP, file).replace(/\\/g, '/')
  // 後台不受照抄規則管：路由在 pages/admin/**、共用元件在 admin/**、
  // 版面在 layouts/admin.vue。用路徑片段比對，免得日後多一個位置又漏掉。
  if (/(^|\/)admin(\/|\.vue$)/.test(rel)) continue
  if (rel.endsWith('.css')) {
    failures.push(`app/${rel}：前台不得有自己的 CSS，樣式一律來自 mockup`)
    continue
  }
  if (!rel.endsWith('.vue')) continue
  vueFiles.push({ rel, file })
  const src = await readFile(file, 'utf8')
  if (/^\s*<style[\s>]/m.test(src)) {
    failures.push(`app/${rel}：前台元件不得有 <style> 區塊，樣式一律來自 mockup`)
  }
}

// ── 4. class 詞彙表 ───────────────────────────────────────────────────
//
// 詞彙來源是 **mockup 的 HTML**，不是 CSS —— mockup 裡有幾個 class 沒有自己的
// CSS 規則（c-footer__col、nf-hero__copy、c-consult__label），是靠父層選擇器上
// 樣式的結構性 hook。拿 CSS 當詞彙表會把它們誤判成「發明的 class」，
// 而拿 HTML 當詞彙表驗的才是我們真正要的東西：標記照抄。
const MOCKUP_HTML = join(ROOT, '..', 'mockup')
const htmlClasses = new Map() // 檔名 → Set<class>
for await (const file of walk(MOCKUP_HTML)) {
  const rel = relative(MOCKUP_HTML, file)
  if (!/^[\w-]+\.html$/.test(rel)) continue
  htmlClasses.set(rel, staticClassesIn(await readFile(file, 'utf8')))
}
const allMockupClasses = new Set([...htmlClasses.values()].flatMap((s) => [...s]))

// base.css 宣告過的 class ＝ 共用設計系統。用它們是正當的，即使某一頁的 mockup
// 標記剛好沒用到（例如 .container--narrow 只出現在部分頁面）。
// 真正要擋的是「頁面級」的 class 跨頁互抄，而那些只存在於 assets/pages/*.css，
// 不在 base.css 裡 —— 所以這一項放寬不會讓閘失效。
const baseClasses = classesInCss(await readFile(join(MOCKUP, 'base.css'), 'utf8'))

// 頁面樣式檔 → 對應的 mockup 頁面。首頁的頁面樣式是從 index.html 抽出來的。
const cssToHtml = (css) => (css === '01-home.css' ? 'index.html' : css.replace(/\.css$/, '.html'))

// JS 狀態 class 與框架自有 class 不在 mockup 標記裡出現也合理
const ALLOW = /^(is-|has-|js-|nuxt-|router-|page-|layout-|v-)/

for (const { rel, file } of vueFiles) {
  const src = await readFile(file, 'utf8')
  const isPage = rel.startsWith('pages/')

  // 該頁宣告自己吃哪一支 mockup 頁面樣式（寫在 usePageHead 的 pageCss 裡）
  const declared = [...src.matchAll(/\/assets\/pages\/([\w-]+\.css)/g)].map((m) => m[1])

  // 頁面：只准用「自己那一頁 ＋ 共用外框（index.html 的 header/footer）」的詞彙，
  //      這樣才驗得出「A 頁抄了 B 頁的區塊」。
  // 共用元件（components / layouts）：外框在每一頁都一樣，用全站聯集即可。
  let allowed
  if (isPage && declared.length) {
    allowed = new Set([...baseClasses, ...(htmlClasses.get('index.html') ?? [])])
    for (const css of declared) {
      const html = cssToHtml(css)
      const set = htmlClasses.get(html)
      if (!set) {
        failures.push(`app/${rel}：宣告的 /assets/pages/${css} 對不到 mockup/${html}`)
        continue
      }
      for (const c of set) allowed.add(c)
    }
  } else {
    allowed = allMockupClasses
  }

  for (const cls of staticClassesIn(src)) {
    if (ALLOW.test(cls) || allowed.has(cls)) continue
    failures.push(
      `app/${rel}：class "${cls}" 在 mockup 的標記裡找不到` +
        (isPage && !declared.length ? '（這一頁還沒宣告 pageCss）' : ''),
    )
  }
}
notes.push(`比對 ${vueFiles.length} 個前台元件的 class 與 ${htmlClasses.size} 頁 mockup 標記`)

// ── 結果 ──────────────────────────────────────────────────────────────
for (const n of notes) console.log(`· ${n}`)
if (failures.length) {
  console.error(`\n✗ verify:css 有 ${failures.length} 項不通過：\n`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('\n✓ verify:css 全數通過：樣式與 mockup 一致，前台沒有自建樣式。')

// ── helpers ───────────────────────────────────────────────────────────
async function* walk(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (entry.isFile()) yield full
  }
}

/** CSS 選擇器裡宣告過的 class。刻意寬鬆 —— 這只是詞彙表，不是語法檢查。 */
function classesInCss(css) {
  const out = new Set()
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const m of stripped.matchAll(/\.([A-Za-z_][\w-]*)/g)) out.add(m[1])
  return out
}

/** 模板裡寫死的 class。動態綁定（:class）不在此列，由 code review 把關。 */
function staticClassesIn(src) {
  const out = new Set()
  for (const m of src.matchAll(/(?<![:\w-])class=["']([^"']+)["']/g)) {
    for (const c of m[1].split(/\s+/)) if (c) out.add(c)
  }
  return out
}
