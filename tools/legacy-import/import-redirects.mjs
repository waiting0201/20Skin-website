#!/usr/bin/env node
// 把 redirects.csv 匯進 Redirects 表。
//
// 用法：node tools/legacy-import/import-redirects.mjs [檔案…] [--overwrite]
//       預設匯入兩份：redirects.csv（文章）＋ redirects-pages.csv（其餘頁面）
//       環境變數：API_BASE_URL／ADMIN_USER／ADMIN_PASSWORD
//
// ⚠️ **預設不覆蓋**。`--overwrite` 只會改 ToPath／StatusCode／IsActive，
//    **不動 Source 與 IsVerified**（RedirectHandler.cs:207）——
//    重匯一份遷移工具產生的 CSV 不該把人工核對過的規則打回未核對。
//
// ⚠️ **兩份 CSV，不要合併成一份**：
//    · `redirects.csv`       文章內頁 ＋ blog slug 改寫 —— **import.mjs 每次跑都會整份覆寫**
//    · `redirects-pages.csv` 固定頁、療程頁、分享列表 —— build-redirects.mjs 產生
//    寫進同一個檔案的話，跑一次文章匯入就會把另一半弄不見。
//
// ⚠️ 仍然不完整：CLAUDE.md「待客戶提供」的完整 `product*.php` 清單還沒拿到，
//    孤兒頁面無從盤點，docs/06 §6 的「約 770 條是下限」依然成立。

import { readFileSync } from 'node:fs'
import { ApiClient } from '../content-import/api.mjs'

const args = process.argv.slice(2)
const overwrite = args.includes('--overwrite')
const files = args.filter((a) => !a.startsWith('--'))
const FILES = files.length ? files
  : ['tools/legacy-import/redirects.csv', 'tools/legacy-import/redirects-pages.csv']

const api = new ApiClient(process.env.API_BASE_URL ?? 'http://localhost:7077/api/v1')
// ⚠️ 種子帳號的登入識別是 `sa@system.local`（docs/08 §A-1），不是 `admin`。
await api.login(
  process.env.ADMIN_USER ?? 'sa@system.local',
  process.env.ADMIN_PASSWORD ?? 'Import@2026x',
  process.env.ADMIN_NEW_PASSWORD,
).catch(async (e) => {
  if (!String(e).includes('AUTH_INVALID_CREDENTIALS')) throw e
  return api.login(process.env.ADMIN_USER ?? 'sa@system.local',
    process.env.SKIN20_SEED_PASSWORD ?? 'Admin@123', 'Import@2026x')
})

for (const file of FILES) {
  const csv = readFileSync(file, 'utf8')
  const rows = csv.trim().split('\n').length - 1
  console.log(`${file}：${rows} 條（overwrite=${overwrite}）…`)
  const r = await api.post('/admin/redirect/import', { csv, overwriteExisting: overwrite })
  // 欄位名稱以 RedirectImportResult 為準（functions/Models/Dtos/RedirectDtos.cs:91）。
  console.log(`  共 ${r.totalRows} 列　新增 ${r.imported}　更新 ${r.updated}　略過 ${r.skipped}　錯誤 ${(r.errors ?? []).length}`)
  for (const e of (r.errors ?? []).slice(0, 10)) console.log(`   第 ${e.rowNumber} 列 ${e.fromPath}：${e.reason}`)
  if ((r.errors ?? []).length > 10) console.log(`   …另有 ${r.errors.length - 10} 筆`)
}

const stats = await api.get('/admin/redirect/stats')
console.log(`\n目前 Redirects：${JSON.stringify(stats)}`)
