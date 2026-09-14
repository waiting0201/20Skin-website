#!/usr/bin/env node
// 抓舊站的療程頁 —— 4 個分類頁 ＋ 站內細節頁 ＋ 產品圖 → .cache/treatments/
//
// 用法：node tools/legacy-import/fetch-treatments.mjs
//
// 🔴 **分類頁本身就是最有價值的來源**，不是只有細節頁。
//    每個項目在分類頁上就帶了：分類、英文名、中文名、適應症、**衛部（署）醫器許可證字號**、
//    產品圖。27 項全都有 —— 而站內細節頁只有 14 頁。
//    docs/06 §3 說的「12 項需從零撰寫」講的是**細節頁的內文**，不是連名字都沒有。
//
// ⚠️ **另外 12 項的 more 連結指向 20skinblog.com**，而那 391 篇已經在資料庫裡了
//    （tools/legacy-import/parse-blog.mjs）。所以那 12 項不必重抓，
//    是「把療程與既有文章關聯起來」的問題。對照表在 parse-treatments.mjs。
//
// ⚠️ 連 contact.php 那道 409 cookie 關卡一樣要帶（見 fetch-contact.mjs 檔頭）。

import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const BASE = 'https://www.20skin.tw'
const DIR = 'tools/legacy-import/.cache/treatments'
const IMG_DIR = join(DIR, 'img')
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const HEADERS = { 'User-Agent': UA, Referer: `${BASE}/product01.php`, Cookie: 'humans_21909=1' }
const DELAY_MS = 900
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

mkdirSync(IMG_DIR, { recursive: true })

async function get(path, attempt = 1) {
  try {
    const r = await fetch(`${BASE}/${path}`, { headers: HEADERS })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r
  } catch (e) {
    if (attempt >= 3) throw e
    await sleep(DELAY_MS * attempt * 3)
    return get(path, attempt + 1)
  }
}

const CATEGORIES = ['product01.php', 'product02.php', 'product03.php', 'product04.php']
const detailPages = new Set()
const images = new Set()

for (const page of CATEGORIES) {
  const html = await (await get(page)).text()
  if (!html.includes('product-item')) throw new Error(`${page} 回應裡沒有 product-item，疑似被擋或改版`)
  writeFileSync(join(DIR, page), html)
  console.log(`${page}  ${html.length} bytes`)
  for (const m of html.matchAll(/href="(product\d\d-d[^"]*\.php)"/g)) detailPages.add(m[1])
  for (const m of html.matchAll(/<img[^>]+src="(images\/product\/[^"]+)"/g)) images.add(m[1])
  await sleep(DELAY_MS)
}

console.log(`站內細節頁 ${detailPages.size} 頁`)
for (const page of [...detailPages].sort()) {
  const path = join(DIR, page)
  if (existsSync(path)) continue
  const html = await (await get(page)).text()
  writeFileSync(path, html)
  for (const m of html.matchAll(/<img[^>]+src="(images\/product\/[^"]+)"/g)) images.add(m[1])
  console.log(`  ${page}  ${html.length} bytes`)
  await sleep(DELAY_MS)
}

console.log(`產品圖 ${images.size} 張`)
for (const src of [...images].sort()) {
  const name = src.replace(/^\.\//, '').replace(/\//g, '__')
  const path = join(IMG_DIR, name)
  if (existsSync(path)) continue
  const buf = Buffer.from(await (await get(src)).arrayBuffer())
  writeFileSync(path, buf)
  console.log(`  ${name}  ${buf.length} bytes`)
  await sleep(DELAY_MS)
}
