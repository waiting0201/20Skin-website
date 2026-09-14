#!/usr/bin/env node
// 產生「文章以外」的 301 對照表 → tools/legacy-import/redirects-pages.csv
//
// 用法：node tools/legacy-import/build-redirects.mjs
//
// 🔴 **不要寫進 redirects.csv** —— 那支是 import.mjs 每次跑都會整份覆寫的產物
//    （1100 篇文章內頁 ＋ 71 條 blog slug 改寫）。兩份分開，各自可以重跑。
//
// 涵蓋四類，全部是舊站上**真的存在**的網址，不是推測出來的：
//   ① 固定頁 —— index／index2／doctor／contact／make-up-style／news-art
//   ② 療程 —— 4 個分類頁 ＋ 14 個細節頁（細節頁的對應來自 treatments.json）
//   ③ 臻美分享列表 —— share.php 的 class／page／year 三種 query 組合
//   ④ 舊站列表的分頁
//
// ⚠️ **分頁一律轉到第 1 頁，不是同一個頁碼。** 舊站一頁 10 篇、新站一頁 12 篇，
//    第 7 頁根本不是同一批文章 —— 照頁碼轉會把人送到不相干的內容，比轉到第 1 頁糟。
//
// ⚠️ **七條與 `staticwebapp.config.json` 重複的規則刻意保持一模一樣。**
//    SWA 的 routes 先於 navigationFallback，所以那七條實際上永遠走設定檔、
//    資料庫這幾列是備份。兩邊給不同答案是最難查的那種錯 —— 沒有人會去比對，
//    而且改了資料庫看起來沒生效。
//
// ⚠️ **product01.php 轉到 /treatments/ 總覽，不是某個分類。**
//    舊站的四個分類與新站的 laser／photoelectric／microneedle／skincare 不是同一套切法。
//    實際分布（2026-09-14 逐項對照）：product01「光療美顏」11 項散在
//    laser 4／photoelectric 5／skincare 2 —— 轉去 laser 會讓其中 7 項的訪客落在錯的分類頁。
//    另外三個是乾淨的（02→microneedle 6/7、03→photoelectric 6/6、04→skincare 4/4），照設定檔。
//    設定檔的 product01 原本指 /treatments/laser/，一併改成 /treatments/。
//
// ⚠️ 仍然不完整：CLAUDE.md「待客戶提供」的完整 product*.php 清單還沒拿到，
//    孤兒頁面無從盤點。docs/06 §6 的「約 770 條是下限」依然成立。

import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const OUT = 'tools/legacy-import/redirects-pages.csv'
const rows = []
const add = (fromPath, toPath) => rows.push({ fromPath, toPath })

// ── ① 固定頁 ─────────────────────────────────────────────────────────
// index.php 是舊站的入口動畫頁、index2.php 才是真正的首頁，兩個都轉到 /。
add('/index.php', '/')
add('/index2.php', '/')
add('/doctor.php', '/team/')
// contact.php 的內容是三個院區的地址、交通與空間照 —— 對應的是據點頁而不是聯絡表單頁。
add('/contact.php', '/clinics/')
// 🔴 這兩頁的實際網址是 `/about/{slug}/`，**不是** `ContentItems.UrlPath` 記的 `/{slug}/` ——
//    前台把長版故事放在 /about/ 底下（app/pages/about/[slug].vue），選單與 canonical 都是那個。
//    資料庫那邊沒跟上，於是 sitemap 收了兩個會 404 的網址（見下方的 assertToPathExists）。
add('/make-up-style.php', '/about/makeup-style/')
// news-art.php 的標題是「新中式美學」（2026-09-14 實際抓取確認），不是新聞頁。
add('/news-art.php', '/about/new-chinese-aesthetics/')

// ── ② 療程 ───────────────────────────────────────────────────────────
const { items } = JSON.parse(readFileSync('tools/legacy-import/treatments.json', 'utf8'))
const PRODUCT_PAGES = {
  'product01.php': '/treatments/',                 // 光療美顏：跨三個新分類，只能指總覽
  'product02.php': '/treatments/microneedle/',
  'product03.php': '/treatments/photoelectric/',
  'product04.php': '/treatments/skincare/',
}
for (const [page, to] of Object.entries(PRODUCT_PAGES)) add(`/${page}`, to)
const urlPathOf = new Map(
  JSON.parse(readFileSync('apps/web/content/treatments.json', 'utf8')).map((t) => [t.slug, t.urlPath]),
)
const missing = []
for (const item of items) {
  if (!item.detailPage) continue
  const slug = item.slug ?? 'ellanse'
  const urlPath = urlPathOf.get(slug)
  if (!urlPath) { missing.push(`${item.detailPage} → ${slug}`); continue }
  add(`/${item.detailPage}`, urlPath)
}
if (missing.length) {
  console.error('🔴 這些細節頁對不到新站網址（先跑 export:content？）：\n  ' + missing.join('\n  '))
  process.exit(1)
}

// ── ③④ 臻美分享的列表 ────────────────────────────────────────────────
//
// 舊站一頁 10 篇。頁數 = ceil(篇數 / 10)，篇數是 discovered-main.json 的實數。
// ⚠️ 分類頁的分頁器**不帶 class**（產生的是 share.php?page=N），所以兩種都要收。
// 年份清單逐一取自舊站各分類頁上真正列出的連結（2026-09-14 抓取），不是推測的範圍。
const CLASSES = {
  醫美新知: { slug: 'medical-aesthetics', years: ['2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'] },
  皮膚新知: { slug: 'dermatology', years: ['2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026'] },
  媒體報導: { slug: 'media', years: ['2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'] },
  演講授課: { slug: 'lectures', years: ['2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'] },
}
const { perClass, count } = JSON.parse(readFileSync('tools/legacy-import/discovered-main.json', 'utf8'))
const PER_PAGE = 10

add('/share.php', '/blog/')
// 不分類的分頁與年份篩選（舊站的年份連結是 class 留空的形式）。
for (let p = 2; p <= Math.ceil(count / PER_PAGE); p++) add(`/share.php?page=${p}`, '/blog/')
for (const y of ['2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025']) {
  add(`/share.php?class=&year=${y}`, '/blog/')
}

for (const [cls, { slug, years }] of Object.entries(CLASSES)) {
  const to = `/blog/${slug}/`
  add(`/share.php?class=${cls}`, to)
  for (let p = 2; p <= Math.ceil((perClass[cls] ?? 0) / PER_PAGE); p++) add(`/share.php?class=${cls}&page=${p}`, to)
  for (const y of years) add(`/share.php?class=${cls}&year=${y}`, to)
}

// ── 輸出 ─────────────────────────────────────────────────────────────
// ⚠️ FromPath 寫**未編碼**的原樣文字（中文就是中文）。/api/fallback 兩種形式都會查，
//    但解碼後的那一筆優先（api/Fallback.cs），CSV 也比較讀得懂。
// 🔴 **每個 ToPath 都必須在建置產物裡真的存在。**
//    轉址表最糟的失效方式不是漏掉一條，是把人從一個舊網址 301 到一個新的 404 ——
//    搜尋引擎會把兩邊都丟掉，而且沒有任何測試會發現。2026-09-14 就是這樣抓到
//    /makeup-style/ 與 /new-chinese-aesthetics/ 其實在 /about/ 底下。
const OUTPUT_DIR = 'apps/web/.output/public'
if (existsSync(OUTPUT_DIR)) {
  const missingTargets = [...new Set(rows.map((r) => r.toPath))].filter((t) => {
    const file = t === '/' ? `${OUTPUT_DIR}/index.html` : `${OUTPUT_DIR}/${t.replace(/^\/|\/$/g, '')}/index.html`
    return !existsSync(file)
  })
  if (missingTargets.length) {
    console.error(`🔴 ${missingTargets.length} 個轉址目標在建置產物裡不存在 —— 會把人 301 到 404：`)
    for (const t of missingTargets) console.error(`   ${t}`)
    process.exit(1)
  }
} else {
  console.log(`⚠️ 找不到 ${OUTPUT_DIR}，跳過「目標是否存在」的檢查 —— 先跑一次 build 才驗得到。`)
}

const seen = new Set()
const unique = rows.filter((r) => !seen.has(r.fromPath) && seen.add(r.fromPath))
if (unique.length !== rows.length) console.log(`（去掉 ${rows.length - unique.length} 條重複）`)

writeFileSync(OUT, ['FromPath,ToPath,StatusCode,IsActive',
  ...unique.map((r) => `${r.fromPath},${r.toPath},301,1`)].join('\n') + '\n')

const byKind = {
  固定頁: unique.filter((r) => !/share\.php|product/.test(r.fromPath)).length,
  療程: unique.filter((r) => r.fromPath.includes('product')).length,
  分享列表: unique.filter((r) => r.fromPath.includes('share.php')).length,
}
console.log(`${unique.length} 條 → ${OUT}`)
console.log(`  固定頁 ${byKind.固定頁}　療程 ${byKind.療程}　分享列表 ${byKind.分享列表}`)
