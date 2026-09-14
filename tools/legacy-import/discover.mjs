#!/usr/bin/env node
// 階段一：探勘 —— 把舊站所有文章的網址與列表資訊抓下來。
//
// 用法：node tools/legacy-import/discover.mjs [輸出路徑]
//
// 🔴 **對方是營運中的網站。** 每次請求之間固定延遲（見 DELAY_MS），失敗重試也退避。
//    這支腳本一次會發約 80 個請求，不要為了快而把延遲拿掉。
//
// 🔴 **文章內頁是 `share_info.php?no=NNN`，不是 `share.php?id=N`。**
//    2026-09-14 實地確認。STATUS.md §三 記的「文章內頁的舊網址型態尚未確認」到此解決 ——
//    而 301 種子裡那 689 筆合成佔位用的是 `share.php?id=N`，**型態是錯的**。
//
// ⚠️ **預設的 `share.php`（不帶 class）不是「全部文章」**，它只有 91 篇。
//    真正的內容在四個分類底下（合計約 730 篇），所以探勘一律逐分類進行。
//
// ⚠️ **主機的 Mod_Security 對非瀏覽器 UA 一律回 406**（CLAUDE.md）。帶瀏覽器 UA 才拿得到。

import { writeFileSync } from 'node:fs'

const OUT = process.argv[2] ?? 'tools/legacy-import/discovered.json'
const BASE = 'https://www.20skin.tw'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const CLASSES = ['醫美新知', '皮膚新知', '媒體報導', '演講授課']

/** ⚠️ 這是對正式站的禮貌，不是效能參數。調小之前先想清楚。 */
const DELAY_MS = 1200
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function get(url, attempt = 1) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: `${BASE}/share.php` } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } catch (e) {
    // 退避重試。⚠️ 不要無限重試 —— 對方掛了就該停下來，不是一直敲。
    if (attempt >= 3) throw new Error(`${url} 連續 3 次失敗：${e.message}`)
    await sleep(DELAY_MS * attempt * 3)
    return get(url, attempt + 1)
  }
}

/**
 * 從列表頁抽出文章。
 *
 * ⚠️ **列表裡的文章不是 `<a href>`。** 每一列是
 * `<tr onclick='location.href="share_info.php?no=842"'>`，連結藏在 onclick 裡 ——
 * 抓 `<a>` 標籤會得到 0 筆而且不會報錯（2026-09-14 實際踩到）。
 *
 * ⚠️ **標題那格的 `<th>` 沒有閉合**就直接 `</tr>`（舊站的 HTML 本來就壞的），
 * 所以只能抓到 `</tr>` 為止再剝標籤，不能用成對標籤配對。
 *
 * ⚠️ **列表的日期只有 MM-DD，沒有年份** —— 這裡收下來只作對帳用，
 * 真正的日期在內頁的 `.day`（完整的 `YYYY-MM-DD`），以那邊為準。
 */
function parseList(html) {
  const out = []
  const re = /onclick='location\.href="share_info\.php\?no=(\d+)"'\s*>([\s\S]*?)<\/tr>/g
  let m
  while ((m = re.exec(html)) !== null) {
    const [, no, inner] = m
    const cells = inner
      .replace(/<[^>]*>/g, '\n')
      .replace(/&nbsp;/g, ' ')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    const mmdd = cells.find((c) => /^\d{1,2}-\d{1,2}$/.test(c)) ?? null
    const title = cells.find((c) => c !== mmdd) ?? null
    out.push({ no: Number(no), title, listDate: mmdd })
  }
  return out
}

const articles = new Map()
const perClass = {}

for (const cls of CLASSES) {
  let page = 1
  let count = 0
  for (;;) {
    const url = `${BASE}/share.php?class=${encodeURIComponent(cls)}&page=${page}`
    const found = parseList(await get(url))
    if (found.length === 0) break
    for (const a of found) {
      // ⚠️ 一篇文章可能同時屬於多個分類嗎？目前看是單一分類，但還是以先到的為準並記錄衝突。
      if (articles.has(a.no) && articles.get(a.no).category !== cls) {
        console.warn(`  ⚠️ no=${a.no} 同時出現在「${articles.get(a.no).category}」與「${cls}」`)
      }
      if (!articles.has(a.no)) articles.set(a.no, { ...a, category: cls })
    }
    count += found.length
    process.stdout.write(`\r  ${cls}　第 ${page} 頁　累計 ${count} 篇`)
    page++
    await sleep(DELAY_MS)
  }
  perClass[cls] = count
  console.log(`\r  ${cls}　${page - 1} 頁　${count} 篇`.padEnd(48))
}

const list = [...articles.values()].sort((a, b) => a.no - b.no)
const noTitle = list.filter((a) => !a.title).length
const noDate = list.filter((a) => !a.listDate).length

writeFileSync(OUT, JSON.stringify({
  source: 'www.20skin.tw',
  discoveredAt: new Date().toISOString(),
  perClass,
  count: list.length,
  articles: list,
}, null, 2) + '\n')

console.log(`\n合計 ${list.length} 篇（no 範圍 ${list[0]?.no}–${list.at(-1)?.no}）→ ${OUT}`)
if (noTitle) console.log(`⚠️ ${noTitle} 篇沒抓到標題`)
if (noDate) console.log(`⚠️ ${noDate} 篇沒抓到日期`)
