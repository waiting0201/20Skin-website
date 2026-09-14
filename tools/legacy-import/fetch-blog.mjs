#!/usr/bin/env node
// 階段二之二：抓 blog 站 —— 20skinblog.com 是 WordPress，走 REST API，不爬 HTML。
//
// 用法：node tools/legacy-import/fetch-blog.mjs
//
// ⚠️ **不要改回爬 HTML。** 這站掛了 NitroPack，前台輸出是被改寫過的快取版本
//    （圖片換成 lazy 佔位、內文被搬進 inline script），REST API 給的才是原始內容。
//
// 🔴 **篇數不是 101。** 規劃書（docs/06 §部落格站）寫的 101 來自 2026-07-29 讀
//    Yoast `post-sitemap.xml`，實際上有 **391 篇**（2026-09-14 由 `x-wp-total` 實數確認，
//    其中只有 19 篇是 07-29 之後才發佈的）。101 是低估約 3.7 倍，
//    跟主站「250 篇」那次低估是同一類錯誤。
//
// ⚠️ **有兩篇的 date 年份是 `0206`**（`2026` 打錯），WP 照收不誤。
//    解析階段以 `modified` 修正，見 parse-blog.mjs。

import { writeFileSync } from 'node:fs'

const BASE = 'https://20skinblog.com/wp-json/wp/v2'
const DIR = 'tools/legacy-import/.cache/blog'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const DELAY_MS = 800
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function get(url, attempt = 1) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return { body: await res.json(), totalPages: Number(res.headers.get('x-wp-totalpages') ?? 1) }
  } catch (e) {
    if (attempt >= 3) throw new Error(`${url} 連續 3 次失敗：${e.message}`)
    await sleep(DELAY_MS * attempt * 3)
    return get(url, attempt + 1)
  }
}

/** 依 x-wp-totalpages 走完所有分頁。per_page 上限是 100，WP 硬性規定。 */
async function all(resource, extra = '') {
  const out = []
  let page = 1
  let totalPages = 1
  do {
    const { body, totalPages: tp } = await get(`${BASE}/${resource}?per_page=100&page=${page}${extra}`)
    totalPages = tp
    out.push(...body)
    process.stdout.write(`\r  ${resource}　第 ${page}/${totalPages} 頁　累計 ${out.length}`)
    page++
    if (page <= totalPages) await sleep(DELAY_MS)
  } while (page <= totalPages)
  console.log(`\r  ${resource}　${out.length} 筆`.padEnd(44))
  return out
}

const posts = await all('posts')
await sleep(DELAY_MS)
const categories = await all('categories')
await sleep(DELAY_MS)
const tags = await all('tags')

// 精選圖：只抓文章真的引用到的那些，不要把整個媒體庫拉下來。
const mediaIds = [...new Set(posts.map((p) => p.featured_media).filter(Boolean))]
const media = []
for (let i = 0; i < mediaIds.length; i += 100) {
  const chunk = mediaIds.slice(i, i + 100)
  const { body } = await get(`${BASE}/media?per_page=100&include=${chunk.join(',')}`)
  media.push(...body)
  process.stdout.write(`\r  media　${media.length}/${mediaIds.length}`)
  await sleep(DELAY_MS)
}
console.log(`\r  media　${media.length} 筆`.padEnd(44))

for (const [name, data] of [['posts', posts], ['categories', categories], ['tags', tags], ['media', media]]) {
  writeFileSync(`${DIR}/${name}.json`, JSON.stringify(data, null, 2) + '\n')
}

const missingMedia = mediaIds.length - media.length
console.log(`\n文章 ${posts.length}　分類 ${categories.length}　標籤 ${tags.length}　精選圖 ${media.length} → ${DIR}/`)
console.log(`  沒有精選圖的文章：${posts.filter((p) => !p.featured_media).length} 篇`)
if (missingMedia > 0) console.log(`  ⚠️ ${missingMedia} 個 featured_media 的 id 取不到媒體（檔案已被刪除，內文圖不受影響）`)
