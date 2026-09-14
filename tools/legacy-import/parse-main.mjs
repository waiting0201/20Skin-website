#!/usr/bin/env node
// 階段三之一：主站快取 HTML → 正規化的文章 JSON。
//
// 用法：node tools/legacy-import/parse-main.mjs [discovered-main.json] [輸出]
//
// ⚠️ **不連網。** 只讀 .cache/main —— 解析規則改了重跑就好。
//
// ⚠️ **日期以內頁的 `.day` 為準**（完整 YYYY-MM-DD）。
//    列表頁只有 MM-DD，拿來當對帳用，不足以決定年份。

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseHTML, textOf, walk } from './html.mjs'
import { htmlToBlocks } from './blocks.mjs'

const SRC = process.argv[2] ?? 'tools/legacy-import/discovered-main.json'
const OUT = process.argv[3] ?? 'tools/legacy-import/parsed-main.json'
const DIR = 'tools/legacy-import/.cache/main'
const BASE = 'https://www.20skin.tw'

/** `./admin/goods_pic/x.jpg` → 絕對網址。⚠️ 舊站到處是 `./` 開頭的相對路徑。 */
const absolute = (src) => {
  if (!src) return null
  if (/^https?:\/\//i.test(src)) return src
  return `${BASE}/${src.replace(/^\.?\//, '')}`
}

const { articles } = JSON.parse(readFileSync(SRC, 'utf8'))
const out = []
const warnings = []

for (const a of articles) {
  const path = join(DIR, `${a.no}.html`)
  if (!existsSync(path)) { warnings.push({ no: a.no, warn: '沒有快取檔，先跑 fetch-main.mjs' }); continue }
  const html = readFileSync(path, 'utf8')

  const item = [...walk(parseHTML(html))].find((n) => n.tag === 'div' && (n.attrs.class ?? '').includes('item') && (n.children ?? []).some((c) => (c.attrs?.class ?? '') === 'title'))
  if (!item) { warnings.push({ no: a.no, warn: '找不到 .item 容器' }); continue }
  const byClass = (name) => (item.children ?? []).find((c) => (c.attrs?.class ?? '').split(/\s+/).includes(name))

  const title = byClass('title') ? textOf(byClass('title')).trim() : a.title
  const day = byClass('day') ? textOf(byClass('day')).trim() : null

  const picNode = byClass('pic') && [...walk(byClass('pic'))].find((n) => n.tag === 'img')
  let cover = picNode ? absolute(picNode.attrs.src) : null
  // ⚠️ 沒有封面時舊站塞的是 defpic.jpg（onerror 的 fallback），那不是內容，別搬。
  if (cover && /defpic\.jpg$/i.test(cover)) cover = null

  // 內文容器。⚠️ id 是 img-responsive、class 是 text，兩個都要對，
  //    只認 class="text" 會撈到別的東西。
  const bodyNode = [...walk(item)].find((n) => n.attrs?.id === 'img-responsive')
  const bodyHtml = bodyNode ? bodyNode.children.map((c) => serialize(c)).join('') : ''
  const blocks = bodyNode ? htmlToBlocks(bodyHtml) : []
  for (const b of blocks) if (b.type === 'figure') b.image.src = absolute(b.image.src)

  if (!blocks.length) warnings.push({ no: a.no, warn: '內文是空的' })
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) warnings.push({ no: a.no, warn: `日期不正常：${day}` })
  if (day && a.listDate && day.slice(5) !== a.listDate.replace(/\b(\d)\b/g, '0$1')) {
    warnings.push({ no: a.no, warn: `內頁日期 ${day} 與列表 ${a.listDate} 對不上` })
  }

  out.push({
    source: 'main',
    legacyId: a.no,
    legacyUrl: `${BASE}/share_info.php?no=${a.no}`,
    slug: `share-${a.no}`, // 舊站沒有 slug，只有 no —— 見檔頭說明
    title,
    category: a.category,
    date: day,
    cover,
    blocks,
  })
}

/** 把樹節點還原成 HTML 字串 —— htmlToBlocks 吃的是 HTML，這裡只是把子樹切出來。 */
function serialize(n) {
  if (n.text !== undefined) return n.text.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const attrs = Object.entries(n.attrs ?? {}).map(([k, v]) => ` ${k}="${String(v).replace(/"/g, '&quot;')}"`).join('')
  const inner = (n.children ?? []).map(serialize).join('')
  return `<${n.tag}${attrs}>${inner}</${n.tag}>`
}

writeFileSync(OUT, JSON.stringify({ source: 'www.20skin.tw', parsedAt: new Date().toISOString(), count: out.length, articles: out }, null, 2) + '\n')

const images = new Set(out.flatMap((a) => [a.cover, ...a.blocks.filter((b) => b.type === 'figure').map((b) => b.image.src)]).filter(Boolean))
console.log(`解析 ${out.length} 篇 → ${OUT}`)
console.log(`  有封面 ${out.filter((a) => a.cover).length} 篇　內文圖 ${out.reduce((n, a) => n + a.blocks.filter((b) => b.type === 'figure').length, 0)} 張　唯一圖片 ${images.size} 張`)
console.log(`  空內文 ${out.filter((a) => !a.blocks.length).length} 篇　平均區塊 ${(out.reduce((n, a) => n + a.blocks.length, 0) / out.length).toFixed(1)}`)
if (warnings.length) {
  writeFileSync('tools/legacy-import/.cache/main-parse-warnings.json', JSON.stringify(warnings, null, 2) + '\n')
  console.log(`  ⚠️ ${warnings.length} 筆警告 → .cache/main-parse-warnings.json`)
  for (const w of warnings.slice(0, 8)) console.log(`     no=${w.no}：${w.warn}`)
}
