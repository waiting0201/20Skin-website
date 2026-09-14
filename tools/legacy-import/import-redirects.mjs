#!/usr/bin/env node
// 把 redirects.csv 匯進 Redirects 表。
//
// 用法：API_BASE_URL=… ADMIN_USER=… ADMIN_PASSWORD=… node tools/legacy-import/import-redirects.mjs [--overwrite]
//
// ⚠️ **預設不覆蓋**。`--overwrite` 只會改 ToPath／StatusCode／IsActive，
//    **不動 Source 與 IsVerified**（RedirectHandler.cs:207）——
//    重匯一份遷移工具產生的 CSV 不該把人工核對過的規則打回未核對。
//
// ⚠️ 這份 CSV 只涵蓋**文章內頁**。列表頁（`share.php?class=…&page=N`、
//    約 40 條中文 query 的年份組合）與療程頁（`product*.php`）還沒盤點，
//    docs/06 §6 的「約 770 條是下限」依然成立。

import { readFileSync } from 'node:fs'
import { ApiClient } from '../content-import/api.mjs'

const overwrite = process.argv.includes('--overwrite')
const csv = readFileSync('tools/legacy-import/redirects.csv', 'utf8')
const rows = csv.trim().split('\n').length - 1

const api = new ApiClient(process.env.API_BASE_URL ?? 'http://localhost:7071/api/v1')
await api.login(process.env.ADMIN_USER ?? 'admin', process.env.ADMIN_PASSWORD, process.env.ADMIN_NEW_PASSWORD)

console.log(`匯入 ${rows} 條轉址（overwrite=${overwrite}）…`)
const r = await api.post('/admin/redirect/import', { csv, overwriteExisting: overwrite })
console.log(`  新增 ${r.insertedCount ?? r.inserted ?? 0}　更新 ${r.updatedCount ?? r.updated ?? 0}　錯誤 ${(r.errors ?? []).length}`)
for (const e of (r.errors ?? []).slice(0, 10)) console.log(`   第 ${e.rowNumber} 列 ${e.fromPath}：${e.message}`)
if ((r.errors ?? []).length > 10) console.log(`   …另有 ${r.errors.length - 10} 筆`)

const stats = await api.get('/admin/redirect/stats')
console.log(`\n目前 Redirects：總數 ${stats.total}　啟用 ${stats.active}　已核對 ${stats.verified}`)
