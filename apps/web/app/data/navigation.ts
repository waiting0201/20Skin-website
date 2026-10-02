// 主選單與頁尾的結構。
//
// 正式站這份資料來自後台的「導覽選單與頁尾」模組（docs/02-backend-cms.md §3，
// 資料表 MenuItems），建置期隨其餘內容一起匯出成 content/*.json。
// 現階段先寫死，形狀刻意與 MenuItems 對齊，接上資料時只換來源不改元件。
//
// 網址依 docs/01-sitemap.md §1 的目錄樹，不是 mockup 的 NN-xxx.html 檔名。

export interface NavItem {
  label: string
  href: string
  external?: boolean
  children?: NavItem[]
}

/** 兩個外部導流連結。docs/CLAUDE.md 決策 4：只以外部連結存在，不納入 sitemap。 */
export const EXTERNAL = {
  booking: 'https://booking.20skin.tw/MainMs/Login',
  shop: 'https://www.20skinshop.com/',
} as const

// ── 資料來源：content/menu.json（MenuItems，docs/08 §G-3）────────────────
//
// ⚠️ 選單是後台可編的內容（「導覽選單與頁尾」畫面，限超級管理員），不是寫死的版面。
//    改一個選項不需要工程介入 —— 這正是它進資料庫的理由。

import { UNIT, loadUnit } from './_content'
import { LEGAL_SLUGS } from './pages'

interface MenuNode {
  label: string
  linkKind: number
  url: string | null
  external: boolean
  relAttr: string | null
  openInNewTab: boolean
  children: MenuNode[]
}

const toNavItem = (node: MenuNode): NavItem => ({
  label: node.label,
  href: node.url ?? '#',
  ...(node.external ? { external: true } : {}),
  ...(node.children.length ? { children: node.children.map(toNavItem) } : {}),
})

export async function getMainNav(): Promise<NavItem[]> {
  const menu = await siteMenu()
  return (menu.main as MenuNode[]).map(toNavItem)
}

// 頁尾在資料庫是一棵樹（欄標題是一層節點），前台是分欄的 —— 這裡攤回欄的形狀。
// ⚠️ 欄標題在版面上是純文字，所以只取 title，不用它的 url。
export async function getFooterColumns(): Promise<{ title: string, items: NavItem[] }[]> {
  const menu = await siteMenu()
  return (menu.footer as MenuNode[]).map((col) => ({
    title: col.label,
    items: col.children.map(toNavItem),
  }))
}

// ── NAP（名稱／地址／電話／門診時段）────────────────────────────────────
//
// 🔴 **一律由 content/clinics.json 推導，不在這裡寫死。**
//    NAP 出現在頁尾、聯絡我們、首頁版位與據點頁四個地方，只要有一處寫死就會分岔，
//    而分岔的 NAP 會降低 AI 對這個品牌實體的確信度（docs/03-seo-geo.md §4 ③）。
//    2026-09-11 到 2026-09-14 之間這裡確實是寫死的佔位值（`04-XXX-XXXX`／`○○路○○號`），
//    而且把台中的四季診所寫成彰化縣二林鎮 —— 就是這個問題的實例。
//
// ⚠️ `hours` 是給人看的一句話摘要，由 businessHours 推導；
//    據點頁的表格（clinics.ts 的 hoursTable）也是由同一份資料推導。
//    **兩邊都不另存一份**，院方在後台改了時段，四個地方一起變。

/** 顯示順序是「一二三四五六日」，而 ClinicBusinessHours.DayOfWeek 是 0＝週日（docs/08 §C-7）。 */
const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const
const displayIndex = (dayOfWeek: number) => (dayOfWeek + 6) % 7

/** 連續三天以上縮寫成「一至五」，其餘逐字列出：[1,2,4,5,6] → 「一二、四至六」。 */
function weekdayRanges(daysOfWeek: number[]): string {
  const idx = [...new Set(daysOfWeek.map(displayIndex))].sort((a, b) => a - b)
  const parts: string[] = []
  for (let i = 0; i < idx.length;) {
    let j = i
    while (j + 1 < idx.length && idx[j + 1] === idx[j]! + 1) j++
    const run = idx.slice(i, j + 1)
    parts.push(run.length >= 3
      ? `${WEEKDAY_LABELS[run[0]!]}至${WEEKDAY_LABELS[run[run.length - 1]!]}`
      : run.map((d) => WEEKDAY_LABELS[d]!).join(''))
    i = j + 1
  }
  return parts.join('、')
}

interface BusinessHourRow { dayOfWeek: number; startTime: string; endTime: string; sortOrder: number }

/** 「一二、四至六 09:00–13:00／一至五 17:00–21:00」。時段沒有資料時回空字串，不編造。 */
function hoursSummary(hours: BusinessHourRow[]): string {
  const rows = new Map<string, number[]>()
  for (const h of [...hours].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.sortOrder - b.sortOrder)) {
    const label = `${h.startTime.slice(0, 5)}–${h.endTime.slice(0, 5)}`
    const days = rows.get(label) ?? []
    days.push(h.dayOfWeek)
    rows.set(label, days)
  }
  // 相鄰兩列的星期完全相同時共用一次星期（「一至六 08:30–12:00／15:00–18:00」），
  // 不重複寫「一至六」兩遍。
  const out: string[] = []
  let lastDays = ''
  for (const [label, days] of rows) {
    const text = weekdayRanges(days)
    out.push(text === lastDays ? label : `${text} ${label}`)
    lastDays = text
  }
  return out.join('／')
}

export async function getClinicNap() {
  const clinics = await loadUnit(UNIT.clinic)
  return clinics
  .slice()
  .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
  .map((c) => ({
    name: c.title,
    // ⚠️ 給呼叫端比對用（clinics.ts／home.ts）。**比 slug 不比名稱**：名稱是院方改得動的
    //    欄位，一改就比不到，而症狀是電話地址整組變空、沒有任何錯誤訊息（決策 30 同一條）。
    slug: c.slug as string,
    href: c.urlPath ?? `/clinics/${c.slug}/`,
    phone: (c.fields.phone as string) ?? '',
    address: (c.fields.address as string) ?? '',
    hours: hoursSummary((c.fields.businessHours ?? []) as BusinessHourRow[]),
  }))
}

/**
 * AI 面板「轉 LINE 諮詢」的院區分流（決策 28）：每個有填 LINE 連結的院區一個出口。
 *
 * 🔴 **跟著據點單元走，不在全站設定再存一份**（決策 29／30 同一條理由）——
 *    院區的 LINE 帳號本來就填在據點的「LINE 連結」，另存一份就會分岔。
 *    （全站設定的 `aifaq.handoffLineUrl` 原本是覆寫，2026-10-02 拿掉，前台不再讀它。）
 * ⚠️ 與頁尾的 `getClinicNap()` 共用同一次取得（`loadUnit` 同一個請求內去重），不多打 API。
 * ⚠️ 名稱取已發布快照的標題、順序取即時的 `sortOrder`（決策 30）。
 */
export async function getClinicLineContacts(): Promise<{ name: string; url: string }[]> {
  const clinics = await loadUnit(UNIT.clinic)
  return clinics
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    .map((c) => ({ name: c.title, url: (c.fields.lineUrl as string) ?? '' }))
    .filter((c) => c.url.length > 0)
}

/**
 * 頁尾的法務連結。
 *
 * 🔴 用精簡清單（`unitIndex`），不要 `getLegalDocs()`（2026-10-02）——
 *    頁尾每一頁都有，而 `getLegalDocs()` 會載整個頁面單元，跟著每一頁的 hydration payload
 *    多帶 gzip 5 KB，只為了三個連結的標題與網址。
 * ⚠️ 順序與 slug 清單和 `getLegalDocs()` 共用 `LEGAL_SLUGS`，兩邊不會分岔。
 */
export async function getLegalLinks(): Promise<NavItem[]> {
  const pages = await unitIndex(UNIT.page)
  return LEGAL_SLUGS.map((slug) => {
    const record = pages.find((p) => p.slug === slug)
    return { label: record?.title ?? '', href: record?.urlPath ?? `/${slug}/` }
  })
}

// 🔴 `SOCIAL_LINKS` 2026-09-18 移除 —— 頁尾的社群連結改讀全站設定的 `footer.social.json`
//    （`SiteFooter.vue` 的 `SITE.socialLinks`）。那一欄後台一直編得動，只是前台不讀，
//    所以院方怎麼改都不會變。原本寫死的兩筆已由 migration `SeedFooterSocialLinks`
//    寫進資料庫，**不要再在這裡放一份**。
