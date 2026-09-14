#!/usr/bin/env node
// 階段二之一：抓主站文章內頁 —— share_info.php?no=NNN → .cache/main/{no}.html
//
// 用法：node tools/legacy-import/fetch-main.mjs [discovered-main.json]
//
// 🔴 **對方是營運中的網站**，709 次請求固定間隔 DELAY_MS。不要調小。
//
// ⚠️ **可續跑**：已存在的快取檔直接跳過。中途斷了就再跑一次，不會重抓。
//    反過來說，要重抓某一篇得先刪掉它的快取檔。
//
// ⚠️ **只存檔，不解析**。解析在 parse-main.mjs —— 拆開的用意是
//    「解析規則改了不必再敲對方主機」，1100 次請求發第二遍是不必要的打擾。

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const SRC = process.argv[2] ?? 'tools/legacy-import/discovered-main.json'
const DIR = 'tools/legacy-import/.cache/main'
const BASE = 'https://www.20skin.tw'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const DELAY_MS = 1200
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

mkdirSync(DIR, { recursive: true })
const { articles } = JSON.parse(readFileSync(SRC, 'utf8'))

async function get(url, attempt = 1) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: `${BASE}/share.php` } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } catch (e) {
    if (attempt >= 3) throw new Error(`${url} 連續 3 次失敗：${e.message}`)
    await sleep(DELAY_MS * attempt * 3)
    return get(url, attempt + 1)
  }
}

let fetched = 0
let skipped = 0
const failed = []

for (const [i, a] of articles.entries()) {
  const path = join(DIR, `${a.no}.html`)
  if (existsSync(path)) { skipped++; continue }
  try {
    const html = await get(`${BASE}/share_info.php?no=${a.no}`)
    // ⚠️ 舊站對不存在的 no 不會回 404，是回一頁空殼。用內文容器判斷有沒有東西。
    if (!html.includes('share-d-item')) throw new Error('回應裡沒有 share-d-item，疑似空頁')
    writeFileSync(path, html)
    fetched++
  } catch (e) {
    failed.push({ no: a.no, error: e.message })
  }
  process.stdout.write(`\r  ${i + 1}/${articles.length}　新抓 ${fetched}　既有 ${skipped}　失敗 ${failed.length}`)
  await sleep(DELAY_MS)
}

console.log(`\n新抓 ${fetched} 篇、沿用快取 ${skipped} 篇、失敗 ${failed.length} 篇`)
if (failed.length) {
  writeFileSync('tools/legacy-import/.cache/main-failed.json', JSON.stringify(failed, null, 2) + '\n')
  for (const f of failed.slice(0, 10)) console.log(`  ⚠️ no=${f.no}：${f.error}`)
  console.log('  完整清單見 .cache/main-failed.json，再跑一次本腳本會只補這些。')
}
