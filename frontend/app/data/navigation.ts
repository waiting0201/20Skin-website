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

export const MAIN_NAV: NavItem[] = [
  {
    label: '品牌理念',
    href: '/about/',
    children: [
      { label: '品牌理念', href: '/about/' },
      { label: '新中式美學', href: '/about/new-chinese-aesthetics/' },
      { label: '彩妝式輕醫美', href: '/about/makeup-style/' },
    ],
  },
  {
    label: '肌膚困擾',
    href: '/concerns/',
    children: [
      { label: '痘痘・粉刺', href: '/concerns/acne/' },
      { label: '敏感肌', href: '/concerns/sensitive-skin/' },
      { label: '斑點・色素沉澱', href: '/concerns/pigmentation/' },
      { label: '抗老・緊緻', href: '/concerns/anti-aging/' },
      { label: '生髮・落髮', href: '/concerns/hair-loss/' },
      { label: '除毛', href: '/concerns/hair-removal/' },
      { label: '多汗・狐臭', href: '/concerns/hyperhidrosis/' },
      { label: '一般皮膚疾病', href: '/concerns/dermatology/' },
    ],
  },
  {
    label: '專業服務',
    href: '/treatments/',
    children: [
      { label: '光療美顏', href: '/treatments/laser/' },
      { label: '微針美容', href: '/treatments/microneedle/' },
      { label: '光電美容', href: '/treatments/photoelectric/' },
      { label: '醫美保養', href: '/treatments/skincare/' },
    ],
  },
  { label: '醫師團隊', href: '/team/' },
  {
    label: '臻美分享',
    href: '/blog/',
    children: [
      { label: '醫美新知', href: '/blog/medical-aesthetics/' },
      { label: '皮膚新知', href: '/blog/dermatology/' },
      { label: '媒體報導', href: '/blog/media/' },
      { label: '演講授課', href: '/blog/lectures/' },
    ],
  },
  { label: '案例分享', href: '/cases/' },
  { label: '常見問題', href: '/faq/' },
  {
    label: '診所據點',
    href: '/clinics/',
    children: [
      { label: '四季診所', href: '/clinics/siji/' },
      { label: '二林四季皮膚科', href: '/clinics/erlin/' },
    ],
  },
  { label: '線上購物', href: EXTERNAL.shop, external: true },
]

export const FOOTER_COLUMNS: { title: string; items: NavItem[] }[] = [
  {
    title: '肌膚困擾',
    items: [
      { label: '痘痘・粉刺', href: '/concerns/acne/' },
      { label: '敏感肌', href: '/concerns/sensitive-skin/' },
      { label: '斑點・色素沉澱', href: '/concerns/pigmentation/' },
      { label: '抗老・緊緻', href: '/concerns/anti-aging/' },
    ],
  },
  {
    title: '專業服務',
    items: [
      { label: '光療美顏', href: '/treatments/laser/' },
      { label: '微針美容', href: '/treatments/microneedle/' },
      { label: '光電美容', href: '/treatments/photoelectric/' },
      { label: '醫美保養', href: '/treatments/skincare/' },
    ],
  },
  {
    title: '關於 20SKIN',
    items: [
      { label: '品牌理念', href: '/about/' },
      { label: '醫師團隊', href: '/team/' },
      { label: '臻美分享', href: '/blog/' },
      { label: '常見問題', href: '/faq/' },
      { label: '聯絡我們', href: '/contact/' },
      { label: '網站搜尋', href: '/search/' },
      { label: '線上購物', href: EXTERNAL.shop, external: true },
    ],
  },
]

/** NAP 主資料。正式站來自全站設定（docs/02 §3），⚠️ 目前為 mockup 的佔位值。 */
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

export const LEGAL_LINKS: NavItem[] = [
  { label: '隱私權政策', href: '/privacy/' },
  { label: '服務條款', href: '/terms/' },
  { label: '醫療免責聲明', href: '/medical-disclaimer/' },
]

export const SOCIAL_LINKS = [
  { label: '四季診所 Facebook', href: 'https://www.facebook.com/20skin4g88/' },
  { label: '20SKIN 美醫集團 Facebook', href: 'https://www.facebook.com/20skin.tw' },
]
