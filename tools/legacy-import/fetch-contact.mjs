#!/usr/bin/env node
// 抓舊站 contact.php —— 三個院區的地址／電話／LINE／交通／空間照 → .cache/contact/
//
// 用法：node tools/legacy-import/fetch-contact.mjs
//
// 這支跟 fetch-main／fetch-blog 不同：只有一頁，沒有分階段。
// 抓回來的東西分兩類，**解析結果在 contact.json，圖片只存不改**：
//   .cache/contact/contact.php.html   原始頁面（要改解析規則就重跑 parse，不必再敲對方主機）
//   .cache/contact/img/*              頁面用到的圖（門診時段表、地圖、空間照）
//   tools/legacy-import/contact.json  解析出來的結構化資料（進版控）
//
// 🔴 **門診時段只存在圖片裡**（四季與二林各一張 admin/goods_pic/*.jpg、
//    允赫齒科是 images/contact/dental-time.png）。頁面上沒有任何一段文字寫營業時間，
//    所以 contact.json 的 businessHours 一定是空的 —— 要靠人看圖填，
//    而且看圖之前先確認那張表是不是過期的（檔名的日期是上傳日，不是內容生效日）。
//
// ⚠️ **Mod_Security 的第二道關卡**：除了 CLAUDE.md 記的「非瀏覽器 UA 一律 406」，
//    這一頁還會回 **409 ＋ 一段設 cookie 後 reload 的 JS**。帶 `humans_21909=1`
//    這個 cookie 就直接 200。fetch-main.mjs 沒踩到是因為它打的是別的路徑。

import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const BASE = 'https://www.20skin.tw'
const DIR = 'tools/legacy-import/.cache/contact'
const IMG_DIR = join(DIR, 'img')
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const HEADERS = { 'User-Agent': UA, Referer: `${BASE}/contact.php`, Cookie: 'humans_21909=1' }
const DELAY_MS = 800
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

mkdirSync(IMG_DIR, { recursive: true })

const res = await fetch(`${BASE}/contact.php`, { headers: HEADERS })
if (!res.ok) throw new Error(`contact.php HTTP ${res.status}`)
const html = await res.text()
if (!html.includes('contact-item')) throw new Error('回應裡沒有 contact-item，疑似被擋或改版')
writeFileSync(join(DIR, 'contact.php.html'), html)
console.log(`contact.php  ${html.length} bytes`)

// 只要院區自己的圖：門診時段表、地圖、空間照。
// 排除 contact-fb／contact-line 這種共用小圖示（是舊站的版面素材，新站不沿用）。
const srcs = [...new Set([...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]))]
  .filter((s) => /^(\.\/)?(admin\/goods_pic|images\/contact)\//.test(s))
  .filter((s) => !/contact-(fb|line|looknumber|spry|dr)\./.test(s))

let ok = 0
const failed = []
for (const src of srcs) {
  const rel = src.replace(/^\.\//, '')
  const name = rel.replace(/\//g, '__')
  const path = join(IMG_DIR, name)
  if (existsSync(path)) { ok++; continue }
  try {
    const r = await fetch(`${BASE}/${rel}`, { headers: HEADERS })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const buf = Buffer.from(await r.arrayBuffer())
    writeFileSync(path, buf)
    console.log(`  ${name}  ${buf.length} bytes`)
    ok++
  } catch (e) {
    failed.push({ src, error: e.message })
  }
  await sleep(DELAY_MS)
}

console.log(`圖片 ${ok}/${srcs.length} 張`)
if (failed.length) console.error('失敗：', failed)
