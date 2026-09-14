#!/usr/bin/env node
// 把 .cache/treatments/ 的原始頁面解析成 treatments.json。不連網，改規則就重跑。
//
// 用法：node tools/legacy-import/parse-treatments.mjs
//
// 舊站的療程資料分散在兩種頁面，**兩種都要**：
//   · 分類頁 product0N.php  —— 28 項全都有：分類、英文名、中文名、適應症、
//                              **醫療器材許可證字號**、產品圖、more 連結
//   · 細節頁 product0N-dNN.php —— 只有 14 頁：小標題 ＋ 段落，一頁 2–4 組。
//                              這些正好對應 Treatments.Indications 的 items（title ＋ desc）
//
// ⚠️ **28 項，不是 27**。舊站把 RADIESSE（再生針）與 Ellanse（洢蓮絲）列成兩項，
//    而資料庫只有一筆 `radiesse`、標題卻寫「Radiesse 洢蓮絲」—— 是兩個不同廠牌的
//    不同產品被併成一筆。這支**不替它做決定**：`radiesse` 與 `ellanse` 都留在
//    輸出裡並標記 `conflict`，由人決定要不要補第 28 筆。
//
// ⚠️ 另外 12 項的 more 指向 20skinblog.com。那些文章已經在資料庫裡（parse-blog.mjs），
//    所以這裡只記下 blog 網址，供日後建立療程↔文章關聯，不重抓。

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'tools/legacy-import/.cache/treatments'
const OUT = 'tools/legacy-import/treatments.json'
const CATEGORY_PAGES = ['product01.php', 'product02.php', 'product03.php', 'product04.php']

const decode = (s) => s
  .replace(/&nbsp;|&ensp;|&emsp;/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;/g, "'")

const text = (html) => decode(html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''))
  .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n')

const grab = (block, cls) => {
  const m = block.match(new RegExp(`<div class="[^"]*\\b${cls}\\b[^"]*">([\\s\\S]*?)</div>`))
  return m ? text(m[1]) : null
}

// 英文名 → 新站 slug。以英文名認人，中文名在舊站與 mockup 之間有出入（見 README）。
const SLUG_OF = {
  'Picosure® Pro': 'picosure-pro', 'Capri': 'capri-blue', 'D.O.E HELIOS III': 'helios-iii',
  'Er：YAG Laser': 'er-yag', 'EMFACE': 'emface', 'DermaV': 'dermav', 'BTL Embody': 'btl-embody',
  'TargetCool': 'targetcool', 'hyperbaric oxygen therapy': 'hbot', 'ONDA': 'onda',
  'EMSELLA G動椅': 'emsella', 'Sculptra': 'sculptra', 'RADIESSE': 'radiesse',
  'BELOTERO REVIVE': 'belotero-revive', 'Restylane': 'restylane', 'Xeomin': 'xeomin',
  'Ellanse': null, 'POTENZA': 'potenza', 'LightSheer DUET': 'lightsheer-duet',
  'MiraDry': 'miradry', 'Thermage FLX': 'thermage-flx', 'Sylfirm': 'sylfirm',
  'Ulthera': 'ulthera', 'Regenera Activa': 'regenera-activa', 'HydraFacial': 'hydrafacial',
  'Neostrata': 'neostrata-peel', 'NEOSTRATA': 'retinol-peel', 'NEO-TEC': 'neo-tec',
}

// 細節頁：小標題（title-t）＋ 段落（text-block）成對出現，一頁 1–4 組。
function parseDetail(file) {
  const html = readFileSync(join(DIR, file), 'utf8')
  const main = html.match(/<main id="main">([\s\S]*?)<\/main>/)?.[1] ?? ''
  const sections = []
  for (const m of main.matchAll(/<div class="title-t">([\s\S]*?)<\/div>[\s\S]*?<div class="text-block">([\s\S]*?)<\/div>/g)) {
    const title = text(m[1])
    // ⚠️ 舊站的段落是靠 <br> 斷行排版的（product02-d02 每行 11 個字），
    //    那是版面不是內容 —— 接回一段，只保留真正的空行。
    const body = text(m[2]).replace(/\n/g, '')
    if (title && body) sections.push({ title, body })
  }
  return sections
}

const items = []
for (const page of CATEGORY_PAGES) {
  const html = readFileSync(join(DIR, page), 'utf8')
  const main = html.match(/<main id="main">([\s\S]*?)<\/main>/)[1]
  for (const block of main.split('<div class="item-block">').slice(1)) {
    const nameEn = grab(block, 'en-title-block')
    if (!nameEn) continue
    if (!(nameEn in SLUG_OF)) throw new Error(`${page}：沒有對照的英文名「${nameEn}」，請更新 SLUG_OF`)
    const more = block.match(/<div class="more-btn">\s*<a href="([^"]+)"/)?.[1] ?? null
    const license = grab(block, 'name-text')
    const indicationText = [...block.matchAll(/<div class="title">([\s\S]*?)<\/div>[\s\S]*?<div class="text">([\s\S]*?)<\/div>/g)]
      .filter((m) => text(m[1]) === '適應症').map((m) => text(m[2]))[0] ?? ''

    items.push({
      slug: SLUG_OF[nameEn],
      categoryPage: page,
      // ｜光療美顏｜ → 光療美顏
      category: (grab(block, 'small-title-block') ?? '').replace(/[｜|]/g, '').trim(),
      nameEn,
      nameZh: grab(block, 'ch-title-block'),
      // 「黑色素、痘疤、皺紋」→ 逐項。頓號與換行都是分隔符。
      indications: indicationText.split(/[、,\n]/).map((s) => s.trim()).filter(Boolean),
      deviceLicense: license && /第/.test(license) ? license.replace(/\s+/g, '') : null,
      image: block.match(/<img[^>]+src="(images\/product\/[^"]+)"/)?.[1] ?? null,
      detailPage: more && more.endsWith('.php') ? more : null,
      blogUrl: more && more.startsWith('http') ? more : null,
      sections: more && more.endsWith('.php') ? parseDetail(more) : [],
    })
  }
}

// 🔴 舊站有 28 項而資料庫只有 27 筆，差在 RADIESSE／Ellanse 被併成一筆。
const conflict = items.find((i) => i.nameEn === 'Ellanse')
if (conflict) conflict.conflict = 'radiesse：資料庫的 `radiesse` 標題寫「Radiesse 洢蓮絲」，但洢蓮絲是 Ellanse、再生針才是 RADIESSE，兩者不同廠牌。需要人決定要不要補這第 28 筆。'

writeFileSync(OUT, JSON.stringify({
  _source: 'https://www.20skin.tw/product01.php … product04.php ＋ 14 個 product0N-dNN.php',
  _capturedAt: '2026-09-14',
  _producedBy: 'node tools/legacy-import/parse-treatments.mjs（不連網；原始頁面由 fetch-treatments.mjs 抓）',
  items,
}, null, 2) + '\n')

const withDetail = items.filter((i) => i.sections.length).length
const withBlog = items.filter((i) => i.blogUrl).length
console.log(`${items.length} 項：站內細節頁 ${withDetail} 項、外連 blog ${withBlog} 項、` +
  `許可證字號 ${items.filter((i) => i.deviceLicense).length} 項、產品圖 ${items.filter((i) => i.image).length} 項`)
console.log(`→ ${OUT}`)
