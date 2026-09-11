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

export const CLINIC_NAP = [
  {
    name: '四季診所',
    href: '/clinics/siji/',
    phone: '04-XXX-XXXX',
    address: '彰化縣二林鎮○○路○○號',
    hours: '一二四五 09:00–13:00／17:00–21:00',
  },
  {
    name: '二林四季皮膚科',
    href: '/clinics/erlin/',
    phone: '04-XXX-XXXX',
    address: '彰化縣二林鎮○○路○○號',
    hours: '一二四五 08:30–12:00／15:00–21:00',
  },
]

export const LEGAL_LINKS: NavItem[] = LEGAL_DOCS.map((doc) => ({
  label: doc.navLabel,
  href: doc.path,
}))

export const SOCIAL_LINKS = [
  { label: '四季診所 Facebook', href: 'https://www.facebook.com/20skin4g88/' },
  { label: '20SKIN 美醫集團 Facebook', href: 'https://www.facebook.com/20skin.tw' },
]
