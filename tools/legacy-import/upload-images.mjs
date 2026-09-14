#!/usr/bin/env node
// 把抓回來的舊站圖片上傳到 Azure Blob。
//
// 用法：node tools/legacy-import/upload-images.mjs [--dry-run]
//
// 🔴 **要對正式儲存體跑**，需要 az 登入的身分對 `st20skinweb` 有寫入權限。
//    ⚠️ `st20skinprod` 是**線上預約系統的**儲存體（CLAUDE.md 決策 5），
//    名字只差一個字，指錯不會有任何錯誤訊息 —— SAS 照簽、上傳照成功。
//
// ⚠️ **用 upload-batch，不是逐檔 `az storage blob upload`**。
//    content-import 那支是逐檔跑的，59 個檔案沒問題；這裡有約四千個 blob，
//    一個檔案開一個 az 行程要一個多小時，而且大半時間花在 Python 啟動。
//    作法是先用**硬連結**把檔案排成 blob 的路徑形狀（同一個來源檔會被連到多個
//    blob 路徑，硬連結不會複製資料），再一次 upload-batch 整個目錄。
//
// ⚠️ **一個引用一個 blob**（CLAUDE.md 決策 13）—— 路徑規則見 blob.mjs。

import { execFileSync, spawn } from 'node:child_process'
import { readFileSync, existsSync, mkdirSync, rmSync, linkSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { ACCOUNT, CONTAINER, blobFor } from './blob.mjs'
import { normalizeSlug } from './slugs.mjs'

const dryRun = process.argv.includes('--dry-run')
const STAGE = 'tools/legacy-import/.cache/stage'

const read = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null)
const images = read('tools/legacy-import/images.json')
if (!images) { console.error('找不到 images.json —— 先跑 fetch-images.mjs。'); process.exit(1) }

// ── 算出每一個 blob 的來源檔 ─────────────────────────────────────────
// ⚠️ 這裡重算的 usage 必須與 import.mjs 算的**逐字一致**，否則資料庫指向的
//    blob 不存在 —— 前台破圖，而建置與匯入都不會有任何錯誤。
const plan = new Map() // blobPath → 來源檔
const missing = []

for (const [file, articles] of [
  ['tools/legacy-import/parsed-main.json', null],
  ['tools/legacy-import/parsed-blog.json', null],
]) {
  const doc = read(file)
  if (!doc) { console.log(`  （略過不存在的 ${file}）`); continue }
  for (const a of doc.articles) {
    const slug = a.source === 'blog' ? (normalizeSlug(a.slug) ?? `post-${a.legacyId}`) : a.slug
    const usage = `article/${slug}`
    const coverSrc = typeof a.cover === 'string' ? a.cover : a.cover?.src
    add(`${usage}/cover`, coverSrc)
    // ⚠️ body-{i} 的 i 是**所有 figure 的序號**，含抓不到檔案而會被丟掉的那些 ——
    //    import.mjs 也是這樣數的（先取號再決定丟不丟），兩邊才對得起來。
    let i = 0
    for (const b of a.blocks) if (b.type === 'figure') add(`${usage}/body-${i++}`, b.image.src)
  }
  void articles
}

function add(usage, src) {
  if (!src) return
  const meta = images[src]
  if (!meta) return // 抓不到的圖 import.mjs 會從內文移除，這裡也不該有 blob
  if (!existsSync(meta.file)) { missing.push(meta.file); return }
  plan.set(blobFor(usage, src, meta.type).blobPath, meta.file)
}

const bytes = [...new Set(plan.values())].length
console.log(`${plan.size} 個 blob，來自 ${new Set(plan.values()).size} 個來源檔`)
console.log(`  （同一張圖被多篇引用時各上傳一份，見 blob.mjs 檔頭）`)
if (missing.length) {
  console.error(`🔴 ${missing.length} 個來源檔不見了 —— .cache/img 被清過？先重跑 fetch-images.mjs。`)
  process.exit(1)
}
void bytes

if (dryRun) {
  for (const [b, f] of [...plan].slice(0, 5)) console.log(`   ${f.split('/').pop()} → ${b}`)
  console.log(`   …共 ${plan.size} 個（--dry-run，沒有實際上傳）`)
  process.exit(0)
}

// ── 已經在儲存體上的就不用再傳 ───────────────────────────────────────
// ⚠️ **可續跑的關鍵。** 617 MB 傳一次要一個多小時，中斷之後從頭再傳一次
//    等於把時間花在已經完成的事情上。路徑是決定性的，所以「同名＝同內容」。
console.log('  查詢儲存體上已有的 blob…')
const existingList = JSON.parse(execFileSync('az', [
  'storage', 'blob', 'list',
  '--account-name', ACCOUNT, '--container-name', CONTAINER,
  '--prefix', '2026/09/', '--auth-mode', 'login',
  '--query', '[].name', '-o', 'json', '--only-show-errors',
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }))
const already = new Set(existingList)
const todo = [...plan].filter(([blobPath]) => !already.has(blobPath))
console.log(`  已存在 ${plan.size - todo.length} 個，待上傳 ${todo.length} 個`)
if (todo.length === 0) { console.log('\n完成：沒有需要上傳的。'); process.exit(0) }

// ── 排成 blob 的路徑形狀，並分成 SHARDS 份 ─────────────────────────
// ⚠️ **一個 az 行程不夠快。** `upload-batch` 就算開到 --max-connections 16
//    也只有每分鐘二三十個（2026-09-14 實測）—— 瓶頸在 az CLI 每個 blob 的
//    處理成本，不是頻寬（平均一個檔才 136 KB）。分成幾份各跑一個行程才拉得起來。
// ⚠️ 分片依 blob 檔名的第一個十六進位字元，所以同一個 blob 永遠落在同一片，
//    重跑時不會換片。
const SHARDS = 4
rmSync(STAGE, { recursive: true, force: true })
let stagedBytes = 0
for (const [blobPath, file] of todo) {
  const shard = parseInt(blobPath.slice(-34, -33) || '0', 16) % SHARDS
  const target = join(STAGE, `s${shard}`, blobPath)
  mkdirSync(dirname(target), { recursive: true })
  linkSync(file, target) // 硬連結：同一個 inode 掛多個名字，不複製資料
  stagedBytes += statSync(file).size
}
console.log(`  已排好 ${todo.length} 個（硬連結，實際佔用不變）`)

// ── 上傳 ────────────────────────────────────────────────────────────
// ⚠️ --overwrite：重跑要能覆蓋。路徑是決定性的，覆蓋的是同一份內容。
// ⚠️ --auth-mode login：用 az 登入的身分，不用儲存體金鑰（CLAUDE.md 決策 9）。
console.log(`  上傳中（${(stagedBytes / 1048576).toFixed(0)} MB，${SHARDS} 個行程）…`)
const procs = []
for (let i = 0; i < SHARDS; i++) {
  const src = join(STAGE, `s${i}`)
  if (!existsSync(src)) continue
  procs.push(new Promise((resolve, reject) => {
    const p = spawn('az', [
      'storage', 'blob', 'upload-batch',
      '--account-name', ACCOUNT,
      '--destination', CONTAINER,
      '--source', src,
      '--auth-mode', 'login',
      '--overwrite', 'true',
      '--max-connections', '8',
      '--content-cache-control', 'public, max-age=31536000, immutable',
      '--only-show-errors',
    ], { stdio: ['ignore', 'ignore', 'inherit'] })
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`分片 ${i} 的 az 以 ${code} 結束`))))
  }))
}
await Promise.all(procs)

rmSync(STAGE, { recursive: true, force: true })
console.log(`\n完成：${todo.length} 個 blob → ${ACCOUNT}/${CONTAINER}`)
