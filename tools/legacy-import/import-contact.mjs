#!/usr/bin/env node
// 把 contact.json 的院區資料（地址／電話／LINE／門診時段／交通）寫進資料庫。
//
// 前置：node tools/legacy-import/fetch-contact.mjs（產生 contact.json 的來源）
// 用法：node tools/legacy-import/import-contact.mjs [--api http://localhost:7077/api/v1] [--dry-run]
//
// 🔴 **走真正的 API，不直寫 SQL** —— 理由同 tools/content-import/api.mjs 檔頭。
//
// ⚠️ **只動 contact.php 抓得到的欄位**。經緯度、mapUrl、大眾運輸、停車資訊
//    舊站沒有，這支**刻意不碰**（留 0／null），不要為了讓 JSON-LD 的 geo
//    有東西輸出就隨手填一組座標 —— 地圖指錯地方比沒有地圖糟。
//
// ⚠️ **門診時段逐列照抄時段圖**，不合併相鄰時段。二林的 15:00–18:00 與 18:00–21:00
//    看起來可以併成 15:00–21:00，但舊站的表格就是分兩列（因為週三、週六只有前半段），
//    照抄才追得回來源，而前台的 hoursTable 是由這份資料推導的（clinics.ts）。
//
// 🔴 **PUT 會把已發布的內容打回草稿**（docs/11 §7 規則 2），所以每一筆寫完都要重新發布 ——
//    建置期匯出只讀已核准的版本快照，漏了發布這一步前台就還是舊的佔位地址，
//    而且過程中不會有任何錯誤訊息。

import { readFileSync } from 'node:fs'
import { ApiClient } from '../content-import/api.mjs'

const rest = process.argv.slice(2)
const apiArg = rest.indexOf('--api')
const BASE = apiArg >= 0 ? rest[apiArg + 1] : 'http://localhost:7077/api/v1'
const DRY = rest.includes('--dry-run')

const { clinics } = JSON.parse(readFileSync(new URL('./contact.json', import.meta.url), 'utf8'))
const byKey = new Map(clinics.map((c) => [c.key, c]))

// contact.json 的 key ↔ 資料庫的 slug。
// ⚠️ 允赫齒科（dental）**沒有對應的 slug** —— 納不納入新站尚未定案，資料先擱著。
const SLUG_OF = { siji: 'siji', erlin: 'erlin' }

/** 交通資訊：舊站只有「自行開車」，逐條照抄。大眾運輸與停車資訊舊站沒有，不補。 */
const transportOf = (c) => JSON.stringify([
  { icon: 'car', title: '開車前往', points: c.transport.byCar },
])

/** SEO 描述：舊資料把四季診所寫成「位於彰化縣二林鎮」，抓回真地址之後一併改掉。 */
const META = {
  siji: '四季診所（20SKIN 美醫集團）位於台中市南屯區公益路二段，提供醫學美容與光電雷射療程，完整地址、電話與門診時段一次看。',
  erlin: '二林四季皮膚科診所（20SKIN 美醫集團）位於彰化縣二林鎮儒林路二段，提供皮膚科一般診療與醫學美容療程，完整地址、電話與門診時段一次看。',
}

const api = new ApiClient(BASE)
const IMPORT_PASSWORD = process.env.SKIN20_IMPORT_PASSWORD ?? 'Import@2026x'
await api.login('sa@system.local', IMPORT_PASSWORD).catch(async (e) => {
  if (!String(e).includes('AUTH_INVALID_CREDENTIALS')) throw e
  return api.login('sa@system.local', process.env.SKIN20_SEED_PASSWORD ?? 'Admin@123', IMPORT_PASSWORD)
})

const existing = await api.indexBySlug('clinic')

for (const [key, slug] of Object.entries(SLUG_OF)) {
  const c = byKey.get(key)
  const row = existing.get(slug)
  if (!c) throw new Error(`contact.json 裡沒有 ${key}`)
  if (!row) throw new Error(`資料庫裡沒有 slug=${slug} 的據點`)

  const before = await api.detail('clinic', row.id)
  const body = {
    title: before.title,
    summary: before.summary,
    address: c.address,
    phone: c.phone,
    // ⚠️ 每家其實有兩個 LINE 官方帳號（門診諮詢 ＋ 自費美容諮詢），
    //    但 docs/08 §C-7 的 Clinics 只有一個 lineUrl 欄位，先放門診諮詢那組。
    //    另一組記在 contact.json 的 lines[]，要不要做成兩個欄位由院方決定。
    lineUrl: c.lines[0]?.url ?? null,
    transportInfo: transportOf(c),
    businessHours: c.businessHours.map((h, i) => ({
      dayOfWeek: h.dayOfWeek,
      startTime: h.startTime,
      endTime: h.endTime,
      sortOrder: i,
    })),
  }

  console.log(`${slug}（#${row.id}）`)
  console.log(`  地址  ${before.fields.address}  →  ${body.address}`)
  console.log(`  電話  ${before.fields.phone}  →  ${body.phone}`)
  console.log(`  LINE  ${before.fields.lineUrl ?? '（無）'}  →  ${body.lineUrl}`)
  console.log(`  時段  ${before.fields.businessHours.length} 列  →  ${body.businessHours.length} 列`)
  if (DRY) { console.log('  （--dry-run，未寫入）'); continue }

  await api.put(`/admin/clinic/${row.id}`, body)
  await api.seo('clinic', row.id, {
    ...before.seo,
    metaDescription: META[key],
    noIndex: false,
  })
  // 🔴 見檔頭：PUT 之後一定要重新發布，否則前台匯出讀到的還是舊快照。
  await api.publish('clinic', row.id)
  console.log('  已寫入並重新發布')
}

console.log(`
⚠️ 這支沒有補、但新站需要的：
   · 經緯度與 mapUrl —— 舊站的地圖是一張手繪 png，JSON-LD 的 geo 仍然輸出不了
   · 大眾運輸與停車資訊 —— 舊站只寫「自行開車」
   · 門診時段的書面確認 —— 二林那張時段圖是 2023-08 上傳的，院方頁面自己也寫
     「實際門診時間請來電確認為主」
   · 允赫齒科（牙科）尚未決定納不納入新站，contact.json 有資料但沒有寫進資料庫

下一步：pnpm --filter web export:content 然後 pnpm --filter web verify`)
