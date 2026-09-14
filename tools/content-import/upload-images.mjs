#!/usr/bin/env node
// 把 mockup 的內容圖片上傳到 Azure Blob。
//
// 用法：node tools/content-import/upload-images.mjs [--dry-run]
//
// 🔴 **這支要對正式儲存體跑，而且只有你能跑** —— 需要 az 登入的身分對
//    st20skinweb 有寫入權限。⚠️ `st20skinprod` 是**線上預約系統的**儲存體
//    （CLAUDE.md 決策 5），名字只差一個字，指錯不會有任何錯誤訊息。
//
// 🔴 **來源是 `image-sources.json`，不是 dump 出來的資料。**
//    2026-09-11 內容搬進資料庫之後，`app/data/*.ts` 裡的圖片欄位變成 **Blob 網址** ——
//    再 dump 一次拿到的是 `https://st20skinweb.blob.core.windows.net/...`，
//    對應不回本機檔名，這支就永遠找不到來源檔（2026-09-14 踩到）。
//    而 blob 路徑是 `md5(用途|原始檔名)`，所以**原始檔名是算出正確路徑的必要輸入**，
//    不能用 Blob 網址的檔名代替。那份對照表因此固化進版控，不再從資料推導。
//
// ⚠️ 對照表由搬遷前的資料（commit 0bf8486）產生，**內容不會再變動** ——
//    日後新增圖片是走後台上傳（`POST /admin/upload/sas`），不經過這支腳本。
//
// ⚠️ **路徑與匯入器算的是同一組**（images.mjs 的決定性雜湊）——所以這支與匯入器
//    可以分開跑、任意順序、重跑也安全。資料庫裡的 URL 不會因為重跑而改變。
//
// ⚠️ 同一張圖被不同欄位引用時**各自上傳一份**，因為「一個欄位獨佔一個 blob」是
//    刪檔安全的前提（CLAUDE.md 決策 13）。若共用，有人在後台換掉文章的作者頭像，
//    醫師個人頁的照片會跟著消失。

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ACCOUNT, CONTAINER, blobFor } from './images.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SOURCE_DIR = join(ROOT, 'mockup/assets/img')

const rest = process.argv.slice(2)
const dryRun = rest.includes('--dry-run')

const SOURCES = join(ROOT, 'tools/content-import/image-sources.json')
if (!existsSync(SOURCES)) {
  console.error(`找不到 ${SOURCES} —— 那份對照表是這支腳本的唯一來源，見檔頭說明。`)
  process.exit(1)
}
const usages = Object.entries(JSON.parse(readFileSync(SOURCES, 'utf8')))
  .map(([usage, src]) => ({ usage, src }))

// ── 上傳 ─────────────────────────────────────────────────────────────
const missing = []
let uploaded = 0
const plan = []

for (const { usage, src } of usages) {
  const file = join(SOURCE_DIR, src.replace(/^\/assets\/img\//, ''))
  if (!existsSync(file)) { missing.push(`${src}（${usage}）`); continue }
  plan.push({ file, ...blobFor(usage, src) })
}

console.log(`來源 ${new Set(usages.map((u) => u.src)).size} 個檔案 → ${plan.length} 個 blob`)
if (missing.length) {
  console.error(`\n🔴 找不到 ${missing.length} 個來源檔（mockup/ 沒進版控，確認本機有這個目錄）：`)
  for (const m of missing.slice(0, 10)) console.error(`   ${m}`)
  process.exit(1)
}

// 🔴 **對帳：資料庫引用的每一個 blobPath，這份清單都要有。**
//    對不上的後果是資料庫有 URL、Blob 上沒檔案 —— 前台破圖，而建置完全不會失敗。
//    這是整條鏈路裡唯一沒有其他機制會擋下的錯，所以每次跑都檢查。
const contentDir = join(ROOT, 'apps/web/content')
if (existsSync(contentDir)) {
  const referenced = new Set()
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk)
    if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (k === 'blobPath' && typeof x === 'string' && x) referenced.add(x)
        else walk(x)
      }
      return
    }
    // 區塊欄位是 JSON 字串，內文插圖藏在裡面。
    if (typeof v === 'string' && v.startsWith('{')) {
      try { walk(JSON.parse(v)) } catch { /* 不是合法 JSON 就當它沒有圖 */ }
    }
  }
  for (const f of readdirSync(contentDir)) walk(JSON.parse(readFileSync(join(contentDir, f), 'utf8')))

  const planned = new Set(plan.map((p) => p.blobPath))
  const orphanRefs = [...referenced].filter((b) => !planned.has(b))
  const unused = [...planned].filter((b) => !referenced.has(b))

  console.log(`對帳：資料庫引用 ${referenced.size} 個、清單 ${planned.size} 個`)
  if (orphanRefs.length) {
    console.error(`\n🔴 有 ${orphanRefs.length} 個 blob 被資料庫引用卻不在上傳清單裡 —— 前台會破圖。`)
    console.error('   多半是 import.mjs 新增了 imageField() 的位置，這支沒跟著加。')
    for (const b of orphanRefs.slice(0, 5)) console.error(`   ${b}`)
    process.exit(1)
  }
  if (unused.length) console.log(`   （${unused.length} 個會上傳但目前沒人引用，浪費但無害）`)
} else {
  console.log('⚠️ 找不到 apps/web/content/，跳過對帳 —— 先跑 export:content 才能驗。')
}

if (dryRun) {
  for (const p of plan.slice(0, 5)) console.log(`   ${p.file.replace(ROOT + '/', '')} → ${p.blobPath}`)
  console.log(`   …共 ${plan.length} 個（--dry-run，沒有實際上傳）`)
  process.exit(0)
}

for (const p of plan) {
  // ⚠️ --overwrite：重跑要能覆蓋。路徑是決定性的，覆蓋的是同一份內容。
  // ⚠️ --auth-mode login：用 az 登入的身分，不用儲存體金鑰（CLAUDE.md 決策 9）。
  execFileSync('az', [
    'storage', 'blob', 'upload',
    '--account-name', ACCOUNT,
    '--container-name', CONTAINER,
    '--name', p.blobPath,
    '--file', p.file,
    '--auth-mode', 'login',
    '--overwrite', 'true',
    '--content-cache-control', 'public, max-age=31536000, immutable',
    '--only-show-errors',
  ], { stdio: 'inherit' })
  uploaded++
  if (uploaded % 20 === 0) console.log(`   已上傳 ${uploaded}/${plan.length}`)
}

console.log(`\n完成：${uploaded} 個 blob → ${ACCOUNT}/${CONTAINER}`)
