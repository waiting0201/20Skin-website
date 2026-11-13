#!/usr/bin/env node
// 把允赫齒科頁（/dental/）的初始內容寫進資料庫並發布。
//
// 2026-11-13「案例分享」由「允赫齒科」取代（CLAUDE.md 決策 34）。migration `CasesBecomeDental`
// 只把 1106 那一筆頁面改成 slug=dental、換掉標題；**內文是空的**，由這支補上。
//
// 用法：node tools/legacy-import/import-dental.mjs [--api http://localhost:7071/api/v1] [--dry-run] [--force]
//
// 🔴 **部署之後要對正式環境跑一次**（--api https://api.20skin.tw/api/v1）。沒跑的話 /dental/ 只有
//    標題與預設照片，主治項目、門診時段、電話、交通全部是空的 —— 而且不會有任何錯誤訊息。
// 🔴 **只在內文還是空的時候寫入。** 院方在後台改過之後再跑會被跳過；真的要蓋掉請加 --force。
// 🔴 走真正的 API、寫完重新發布，理由同 import-contact.mjs 檔頭。
//
// 內容來源：contact.json 的 dental 那一筆（舊站 contact.php#dental，逐字照抄）。
// ⚠️ 下面三樣舊站沒有，是 2026-11-13 設計允赫齒科頁時加的，**請院方確認**：
//    · 主治項目的四個分組名稱（舊站只有一串十項）
//    · 頁首的一句介紹
//    · 開車路線由八行整理成六步、停車獨立一行（內容沒有增減）
// ⚠️ 門診時段照舊站的時段圖（一晚、二早、三午、五晚、六早）。那張圖被塗改過
//    （見 README「允赫齒科的時段表看起來只剩 5 格」），院方頁面自己也寫「實際門診時間請來電確認為主」。
// ⚠️ **不上傳照片**：頁首與院內環境沒有上傳時，前台顯示建置產物裡的四張舊站院內照
//    （apps/web/app/data/pages.ts 的 DENTAL_DEFAULT_*）。院方之後在後台上傳就會換掉。

import { readFileSync } from 'node:fs'
import { ApiClient } from '../content-import/api.mjs'

const rest = process.argv.slice(2)
const apiArg = rest.indexOf('--api')
const BASE = apiArg >= 0 ? rest[apiArg + 1] : 'http://localhost:7071/api/v1'
const DRY = rest.includes('--dry-run')
const FORCE = rest.includes('--force')

const { clinics } = JSON.parse(readFileSync(new URL('./contact.json', import.meta.url), 'utf8'))
const c = clinics.find((x) => x.key === 'dental')
if (!c) throw new Error('contact.json 裡沒有 dental')

/** 分組是設計時加的（見檔頭）。每一項都必須出現在 contact.json 的十項裡，一項都不能多、不能少。 */
const SERVICE_GROUPS = [
  { kind: '日常診療', items: ['一般牙科', '牙周治療', '兒童牙科'] },
  { kind: '修復與植牙', items: ['假牙製作', '微創植牙'] },
  { kind: '齒列矯正', items: ['傳統矯正', '隱形矯正'] },
  { kind: '美學與雷射', items: ['前牙美學', '牙齦美容', '雷射牙科'] },
]
{
  const source = [...c.services[0].items].sort().join('|')
  const grouped = SERVICE_GROUPS.flatMap((g) => g.items).sort().join('|')
  if (source !== grouped) throw new Error(`主治項目的分組與 contact.json 對不上：\n  來源 ${source}\n  分組 ${grouped}`)
}

const bodyBlocks = {
  // 04-8969966 → 04-896-9966：只加一個連字號方便閱讀，號碼不變。
  phone: c.phone.replace(/^(\d{2})-(\d{3})(\d{4})$/, '$1-$2-$3'),
  address: `${c.postalCode} ${c.address.replace(/(\d+)號$/, ' $1 號')}`,
  registration: '現場掛號（健保）',
  lineUrl: c.lines[0]?.url.replace(/^http:/, 'https:') ?? '',
  facebookUrl: c.facebook ?? '',
  heroImage: null,
  heroCaption: '允赫齒科．診間',
  servicesNote: '健保掛號。實際的治療方式，由醫師看診後說明。',
  services: SERVICE_GROUPS,
  // 🔴 以下三個鍵的名稱與形狀與「據點」相同（businessHours／transportInfo／photos）——
  //    後台這一頁用的是據點那一套輸入元件，見 apps/admin/src/units/page.ts 的 fieldsBySlug.dental。
  businessHours: c.businessHours.map((h, i) => ({ dayOfWeek: h.dayOfWeek, startTime: h.startTime, endTime: h.endTime, sortOrder: i })),
  hoursNotes: ['開放現場掛號，門診名額有限，請儘早等候。', '實際門診時間請以來電確認為主。'],
  transportInfo: [
    {
      icon: 'car',
      title: '開車前往',
      points: [
        '中山高速公路（國道一號）南下，下「北斗／埤頭」交流道，往埤頭、二林方向左轉。',
        '直行斗苑路，約 15 分鐘進入二林市區，會看到麥當勞。',
        '過麥當勞後再往前約 1 分鐘，右手邊有一間 7-11，在這裡左轉大成路一段。',
        '往前過健興街紅綠燈，右邊是全國電子。',
        '下一個路口（壹咖啡）左轉儒林路二段。',
        '允赫齒科在左手邊。',
      ],
    },
    { icon: 'parking', title: '停車', points: ['過診所後再往前 50 公尺，右手邊有免費專用停車場。'] },
  ],
  photos: [],
}

const body = {
  title: '允赫齒科',
  summary: '20SKIN 美醫集團在二林的牙科診所，健保掛號。從日常的檢查與治療，到矯正、植牙與牙齒美學。',
  bodyBlocks,
}

const META_DESCRIPTION = '允赫齒科（20SKIN 美醫集團）位於彰化縣二林鎮儒林路二段，健保掛號，提供一般牙科、牙周治療、矯正、植牙與牙齒美學。門診時段、電話與交通方式一次看。'

if (DRY) {
  console.log(JSON.stringify(body, null, 2))
  console.log('（--dry-run，未連線、未寫入）')
  process.exit(0)
}

const api = new ApiClient(BASE)
const IMPORT_PASSWORD = process.env.SKIN20_IMPORT_PASSWORD ?? 'Import@2026x'
await api.login('sa@system.local', IMPORT_PASSWORD).catch(async (e) => {
  if (!String(e).includes('AUTH_INVALID_CREDENTIALS')) throw e
  return api.login('sa@system.local', process.env.SKIN20_SEED_PASSWORD ?? 'Admin@123', IMPORT_PASSWORD)
})

const row = (await api.indexBySlug('page')).get('dental')
if (!row) throw new Error('資料庫裡沒有 slug=dental 的頁面 —— migration CasesBecomeDental 套用了嗎？')

const before = await api.detail('page', row.id)
const existing = before.fields?.bodyBlocks
const hasContent = existing && existing !== 'null' && existing !== '{}'
if (hasContent && !FORCE) {
  console.log(`dental（#${row.id}）已經有內文，跳過。要蓋掉請加 --force。`)
  process.exit(0)
}

await api.put(`/admin/page/${row.id}`, body)
await api.seo('page', row.id, { ...(before.seo ?? {}), metaDescription: META_DESCRIPTION, noIndex: false })
await api.publish('page', row.id)
console.log(`dental（#${row.id}）已寫入並發布：${bodyBlocks.phone}｜${bodyBlocks.address}｜${bodyBlocks.businessHours.length} 個診次｜${SERVICE_GROUPS.length} 組主治項目`)
