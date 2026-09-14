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

import menuJson from '~~/content/menu.json'
import { CONTENT } from './_content'
import { LEGAL_DOCS } from './pages'

interface MenuNode {
  label: string
  linkKind: number
  url: string | null
  external: boolean
  relAttr: string | null
  openInNewTab: boolean
  children: MenuNode[]
}

const MENU = menuJson as unknown as { main: MenuNode[]; footer: MenuNode[] }

const toNavItem = (node: MenuNode): NavItem => ({
  label: node.label,
  href: node.url ?? '#',
  ...(node.external ? { external: true } : {}),
  ...(node.children.length ? { children: node.children.map(toNavItem) } : {}),
})

export const MAIN_NAV: NavItem[] = MENU.main.map(toNavItem)

// 頁尾在資料庫是一棵樹（欄標題是一層節點），前台是分欄的 —— 這裡攤回欄的形狀。
// ⚠️ 欄標題在版面上是純文字，所以只取 title，不用它的 url。
export const FOOTER_COLUMNS: { title: string; items: NavItem[] }[] = MENU.footer.map((col) => ({
  title: col.label,
  items: col.children.map(toNavItem),
}))

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

export const CLINIC_NAP = CONTENT.clinics
  .slice()
  .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
  .map((c) => ({
    name: c.title,
    href: c.urlPath ?? `/clinics/${c.slug}/`,
    phone: (c.fields.phone as string) ?? '',
    address: (c.fields.address as string) ?? '',
    hours: hoursSummary((c.fields.businessHours ?? []) as BusinessHourRow[]),
  }))

export const LEGAL_LINKS: NavItem[] = LEGAL_DOCS.map((doc) => ({
  label: doc.navLabel,
  href: doc.path,
}))

export const SOCIAL_LINKS = [
  { label: '四季診所 Facebook', href: 'https://www.facebook.com/20skin4g88/' },
  { label: '20SKIN 美醫集團 Facebook', href: 'https://www.facebook.com/20skin.tw' },
]
