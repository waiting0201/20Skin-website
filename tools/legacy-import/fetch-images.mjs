#!/usr/bin/env node
// 階段四：把解析結果裡引用到的圖片全部抓下來，並讀出真實尺寸。
//
// 用法：node tools/legacy-import/fetch-images.mjs [parsed-*.json ...]
//
// 🔴 **兩台主機分開限速。** www.20skin.tw 與 20skinblog.com 是兩台不同的機器，
//    各自排隊、各自延遲，不要讓其中一台承受兩份流量。
//
// ⚠️ **可續跑**：已在 .cache/img 的檔案跳過。檔名用來源網址的 sha1，
//    所以同一張圖不會因為出現在多篇文章而抓兩次。
//
// ⚠️ **尺寸一律從檔案讀，不信 HTML 的 width/height。** 舊站的 `width="100%"`、
//    WordPress 換過 srcset 之後留下的舊尺寸，兩種都會寫出對不上的值；
//    前台的 `<img width height>` 寫錯會造成版面跳動（CLS）。

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, extname } from 'node:path'
import { imageSize } from './imagesize.mjs'

const SRCS = process.argv.slice(2)
if (!SRCS.length) SRCS.push('tools/legacy-import/parsed-main.json', 'tools/legacy-import/parsed-blog.json')
const DIR = 'tools/legacy-import/.cache/img'
const OUT = 'tools/legacy-import/images.json'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const DELAY_MS = 200
/**
 * 每台主機同時開幾條連線。
 * ⚠️ **不要再往上加** —— 6 條正是瀏覽器對單一主機的上限，
 *    等同於有人開著對方的文章頁在看（一頁本來就同時載十幾張圖）。
 * ⚠️ 會需要並行，是因為對方**單一連線只給 88 KB/s**（2026-09-14 實測，
 *    TTFB 也要 1 秒）。序列抓完 700 MB 要三個多小時，而那三小時裡
 *    對方主機一直被佔著一條連線 —— 並行反而讓佔用時間短得多。
 */
const CONCURRENCY = 6
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

mkdirSync(DIR, { recursive: true })

// ── 收集所有引用到的圖片網址 ─────────────────────────────────────────
const urls = new Set()
for (const src of SRCS) {
  if (!existsSync(src)) { console.log(`  （略過不存在的 ${src}）`); continue }
  for (const a of JSON.parse(readFileSync(src, 'utf8')).articles) {
    const cover = typeof a.cover === 'string' ? a.cover : a.cover?.src
    if (cover) urls.add(cover)
    for (const b of a.blocks) if (b.type === 'figure' && b.image.src) urls.add(b.image.src)
  }
}

const key = (url) => createHash('sha1').update(url).digest('hex')
/** ⚠️ 副檔名要從路徑取，不能從整個網址取 —— query string 裡的點會被 extname 當副檔名。 */
const extOf = (url) => {
  const e = extname(new URL(url).pathname).toLowerCase()
  return /^\.(jpe?g|png|gif|webp|bmp|avif)$/.test(e) ? e : '.bin'
}

const byHost = new Map()
for (const url of urls) {
  let host
  try { host = new URL(url).host } catch { continue }
  if (!byHost.has(host)) byHost.set(host, [])
  byHost.get(host).push(url)
}

const results = {}
const failed = []
let done = 0

async function fetchOne(url, attempt = 1) {
  // ⚠️ **連線層的錯誤也要重試。** 原本只在 `!res.ok` 時退避，
  //    而 `fetch` 連不上時是**拋例外**不是回非 200 —— 那條路完全沒有重試，
  //    2373 張裡有 5 張就這樣被記成永久失敗，其實再打一次就有（2026-09-14）。
  let res
  try {
    res = await fetch(url, { headers: { 'User-Agent': UA, Referer: `https://${new URL(url).host}/`, Accept: 'image/*,*/*' } })
  } catch (e) {
    if (attempt >= 3) throw new Error(`${e.message}（3 次）`)
    await sleep(DELAY_MS * attempt * 5)
    return fetchOne(url, attempt + 1)
  }
  if (!res.ok) {
    // 404／403 不重試 —— 舊站有一堆內文引用到已刪除的檔案，重試三次只是浪費時間
    if (res.status === 404 || res.status === 403) throw new Error(`HTTP ${res.status}`)
    if (attempt >= 3) throw new Error(`HTTP ${res.status}（3 次）`)
    await sleep(DELAY_MS * attempt * 5)
    return fetchOne(url, attempt + 1)
  }
  return Buffer.from(await res.arrayBuffer())
}

async function runHost(host, list) {
  const queue = [...list]
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)))
}

async function worker(queue) {
  for (;;) {
    const url = queue.shift()
    if (!url) return
    const file = join(DIR, key(url) + extOf(url))
    try {
      let buf
      if (existsSync(file)) buf = readFileSync(file)
      else {
        buf = await fetchOne(url)
        writeFileSync(file, buf)
        await sleep(DELAY_MS)
      }
      const size = imageSize(buf)
      if (!size) throw new Error(`讀不出尺寸（${buf.length} bytes，可能不是圖片）`)
      results[url] = { file, bytes: buf.length, width: size.width, height: size.height, type: size.type }
    } catch (e) {
      failed.push({ url, error: e.message })
    }
    done++
    if (done % 25 === 0) process.stdout.write(`\r  ${done}/${urls.size}　成功 ${Object.keys(results).length}　失敗 ${failed.length}`)
  }
}

console.log(`要抓 ${urls.size} 張圖，分佈在 ${byHost.size} 台主機：`)
for (const [h, l] of byHost) console.log(`  ${h}　${l.length} 張`)

await Promise.all([...byHost].map(([h, l]) => runHost(h, l)))

writeFileSync(OUT, JSON.stringify(results, null, 2) + '\n')
const totalBytes = Object.values(results).reduce((n, r) => n + r.bytes, 0)
console.log(`\r  ${done}/${urls.size}　成功 ${Object.keys(results).length}　失敗 ${failed.length}`.padEnd(60))
console.log(`\n成功 ${Object.keys(results).length} 張（${(totalBytes / 1048576).toFixed(0)} MB）→ ${OUT}`)
if (failed.length) {
  writeFileSync('tools/legacy-import/.cache/img-failed.json', JSON.stringify(failed, null, 2) + '\n')
  console.log(`⚠️ ${failed.length} 張抓不到 → .cache/img-failed.json（多半是舊站自己就已經失連的圖）`)
  for (const f of failed.slice(0, 8)) console.log(`   ${f.error}　${f.url.slice(-70)}`)
}
