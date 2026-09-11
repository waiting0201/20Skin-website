// 全站設定／導覽選單與頁尾／首頁版位編排（docs/02 §3、docs/08 §G）
//
// 上層畫面只透過 client.ts 匯出的 adminApi 取用，不直接 import 這個檔。
// 接上 api.20skin.tw 時整支換掉，畫面不必改（docs/09-frontend.md §8）。
//
// ⚠️ 這支刻意不 import '../api/client'（會與 client.ts 匯入 siteApi 形成循環相依）。
// 需要 adminApi.content／adminApi.taxonomy 的地方（例如把首頁版位的預設項目
// 連到既有內容、NAP 與據點頁比對），一律由呼叫端的 Vue 元件取得後傳進來，
// 這裡只管三塊資料本身的形狀與持久化。

import type { UnitKey } from '../types'
import { ApiError } from './errors'
import { createStore } from './mock-store'

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function nowIso(): string {
  return new Date().toISOString()
}

// =============================================================================
// 全站設定（docs/08-database.md §G-1）
// =============================================================================
//
// ⚠️ 設定類不走審核，儲存即生效，而且沒有留痕（2026-09-11 定案不做操作日誌，
// docs/08 §I）。這裡只記 updatedAt／updatedByUserId 供畫面顯示「最後修改」，
// 不是版本歷程——誰在這之前改過什麼，事後查不到。畫面上要把這件事講清楚。

export interface NapEntry {
  /** 對應據點名稱，只用來跟 Clinic 內容比對，不是外鍵——比對用字串相等，見 docs/03 §4 ③。 */
  name: string
  phone: string
  address: string
}

export interface SocialLink {
  label: string
  url: string
}

/** docs/04-ai-faq.md §4：全站浮動 AI 問答面板的設定，併入全站設定、不新增畫面。 */
export interface AiFaqSettings {
  enabled: boolean
  panelTitle: string
  welcomeMessage: string
  /** 轉真人出口：預約。 */
  bookingUrl: string
  /** 轉真人出口：LINE。 */
  lineUrl: string
}

export interface SiteSettingsData {
  siteName: string
  logoUrl: string
  defaultOgImageUrl: string
  /** 全站 NAP 主資料。⚠️ 必須與據點頁、頁尾逐字一致（CLAUDE.md／docs/03 §4 ③）。 */
  nap: NapEntry[]
  /** 追蹤碼（GA／GTM／Meta Pixel 等），先以自由文字收納——docs/08 §G-1：
   * 用 key-value 而非固定欄位，這裡的 mock 用一個多行文字欄位示意同一件事。 */
  trackingCodes: string
  /** `/contact/` 表單收件信箱。表單只寄通知信，後台不留存收件紀錄（docs/02 §2）。 */
  contactEmail: string
  /** 頁尾社群連結——資料存在這裡，但編輯介面在「導覽選單與頁尾」畫面（docs/02 §3）。 */
  socialLinks: SocialLink[]
  /** 頁尾版權文案——同上，編輯介面在「導覽選單與頁尾」畫面。 */
  footerCopyright: string
  aiFaq: AiFaqSettings
  updatedAt: string
  updatedByUserId: number | null
}

function seedSettings(): SiteSettingsData {
  return {
    siteName: '20SKIN 美醫集團',
    logoUrl: '/assets/logo.jpg',
    defaultOgImageUrl: '',
    // 與 apps/web/app/data/navigation.ts 的 CLINIC_NAP 相同的佔位值——
    // 兩邊本來就該來自同一份主資料，這裡刻意抄一致，示範「一致」長什麼樣子。
    nap: [
      { name: '四季診所', phone: '04-XXX-XXXX', address: '彰化縣二林鎮○○路○○號' },
      { name: '二林四季皮膚科', phone: '04-XXX-XXXX', address: '彰化縣二林鎮○○路○○號' },
    ],
    trackingCodes: '',
    contactEmail: '',
    socialLinks: [
      { label: '四季診所 Facebook', url: 'https://www.facebook.com/20skin4g88/' },
      { label: '20SKIN 美醫集團 Facebook', url: 'https://www.facebook.com/20skin.tw' },
    ],
    footerCopyright: `© ${new Date().getFullYear()} 20SKIN 美醫集團．All Rights Reserved.`,
    aiFaq: {
      // ⚠️ 正式環境種子值是「關閉」（docs/08 §J-4 步驟 7；CLAUDE.md）——Phase 1
      // 只交付介面，AI 未串接前不對外顯示。不要把這個改成 true 當示範預設。
      enabled: false,
      panelTitle: 'AI 諮詢小幫手',
      welcomeMessage: '您好，我是 20SKIN 的 AI 諮詢小幫手，有什麼可以協助您的嗎？',
      bookingUrl: 'https://booking.20skin.tw/MainMs/Login',
      lineUrl: '',
    },
    updatedAt: nowIso(),
    updatedByUserId: null,
  }
}

const settingsStore = createStore<SiteSettingsData>('settings', seedSettings)

const settings = {
  async get(): Promise<SiteSettingsData> {
    return deepClone(settingsStore.read())
  },

  /** 儲存即生效，無需送審（docs/02-backend-cms.md §4）。 */
  async update(patch: Partial<SiteSettingsData>, userId: number): Promise<SiteSettingsData> {
    return deepClone(
      settingsStore.mutate((d) => {
        Object.assign(d, patch, { updatedAt: nowIso(), updatedByUserId: userId })
        return d
      }),
    )
  },
}

// =============================================================================
// 首頁版位編排（docs/08-database.md §G-2）
// =============================================================================

export type HomeSectionKey =
  | 'hero'
  | 'specialties'
  | 'featured-treatments'
  | 'latest-articles'
  | 'doctors'
  | 'clinics'
  | 'brand-story'

/** 七個版位為種子資料，可停用、可排序，不可新增刪除（docs/08 §G-2）。 */
export const HOME_SECTION_KEYS: HomeSectionKey[] = [
  'hero',
  'specialties',
  'featured-treatments',
  'latest-articles',
  'doctors',
  'clinics',
  'brand-story',
]

/** 每個版位只能挑選已存在的內容，不能另打文案——這裡只存 ContentItemId ＋ SortOrder，
 * 沒有 Title／Text 欄位（docs/08 §G-2）。顯示用的標題由呼叫端拿到 id 之後另外查。 */
export interface HomeSectionItemRef {
  contentItemId: number
  sortOrder: number
}

/** 唯一例外：hero 的主視覺與外部導流 CTA 沒有對應的站內內容，放在 Settings JSON 裡
 * （docs/08 §G-2）。圖片此輪比照其他畫面的做法，先用網址輸入示意，不接上傳。 */
export interface HomeHeroSettings {
  eyebrow: string
  headline: string
  images: { url: string; alt: string }[]
  ctaLabel: string
  ctaUrl: string
  externalCtaLabel: string
  externalCtaUrl: string
}

export interface HomeSection {
  sectionKey: HomeSectionKey
  title: string
  subtitle: string
  isEnabled: boolean
  sortOrder: number
  /** 這個版位可以挑哪個單元的內容；hero 為 null（沒有內容項目，見 heroSettings）。 */
  targetUnit: UnitKey | null
  items: HomeSectionItemRef[]
  heroSettings: HomeHeroSettings | null
}

/** 1 草稿（含被退回、或已發布後又被改動）／2 送審中／3 已發布（草稿與上線版相同）。
 * 對齊 docs/11-backend-design.md §7 的三段式工作流，但這是本畫面自己的簡化版狀態機
 * ——見下方「已知缺口」，並未併入 client.ts 共用的 ContentReviews 佇列。 */
export type HomeWorkflowStatus = 1 | 2 | 3

export interface HomeSectionsState {
  status: HomeWorkflowStatus
  /** 目前編輯中的草稿。已發布且未被改動時，內容與 published 相同。 */
  sections: HomeSection[]
  /** 目前線上使用的版本，唯讀，供比對「草稿跟上線版有什麼不同」。 */
  published: HomeSection[]
  /** 是否已完成一次性的預設內容連結（見檔尾 seedDefaultItems 的說明）。 */
  defaultItemsSeeded: boolean
  submittedByUserId: number | null
  submittedAt: string | null
  publishedByUserId: number | null
  publishedAt: string | null
  /** 退回原因。 */
  decisionNote: string | null
}

const HOME_SECTION_META: Record<HomeSectionKey, { title: string; subtitle: string; targetUnit: UnitKey | null }> = {
  hero: { title: '主視覺', subtitle: 'WELCOME TO 20SKIN', targetUnit: null },
  specialties: { title: '看皮膚　找四季', subtitle: 'SKIN CONCERNS', targetUnit: 'concern' },
  'featured-treatments': { title: '精選療程', subtitle: 'FEATURED TREATMENTS', targetUnit: 'treatment' },
  'latest-articles': { title: '最新文章', subtitle: 'LATEST ARTICLES', targetUnit: 'article' },
  doctors: { title: '醫師團隊', subtitle: 'OUR DOCTORS', targetUnit: 'doctor' },
  clinics: { title: '據點資訊', subtitle: 'OUR CLINICS', targetUnit: 'clinic' },
  'brand-story': { title: '品牌理念摘要', subtitle: '新中式美學', targetUnit: 'page' },
}

function seedHomeSection(key: HomeSectionKey, sortOrder: number): HomeSection {
  const meta = HOME_SECTION_META[key]
  return {
    sectionKey: key,
    title: meta.title,
    subtitle: meta.subtitle,
    isEnabled: true,
    sortOrder,
    targetUnit: meta.targetUnit,
    items: [],
    heroSettings:
      key === 'hero'
        ? {
            eyebrow: 'WELCOME TO 20SKIN',
            headline: '要自然．找四季',
            images: [
              { url: '/assets/img/banner1.jpg', alt: '四季診所院區外觀' },
              { url: '/assets/img/banner2.jpg', alt: '四季診所大廳品牌牆與候診區' },
            ],
            ctaLabel: '立即預約諮詢',
            ctaUrl: '/contact/',
            externalCtaLabel: '線上預約掛號',
            externalCtaUrl: 'https://booking.20skin.tw/MainMs/Login',
          }
        : null,
  }
}

function seedHomeState(): HomeSectionsState {
  const sections = HOME_SECTION_KEYS.map((key, index) => seedHomeSection(key, index))
  return {
    status: 3,
    sections,
    published: deepClone(sections),
    defaultItemsSeeded: false,
    submittedByUserId: null,
    submittedAt: null,
    publishedByUserId: null,
    publishedAt: null,
    decisionNote: null,
  }
}

const homeStore = createStore<HomeSectionsState>('home-sections', seedHomeState)

function findSection(state: HomeSectionsState, key: HomeSectionKey): HomeSection {
  const section = state.sections.find((s) => s.sectionKey === key)
  if (!section) throw new ApiError('NOT_FOUND', `找不到版位：${key}`)
  return section
}

const home = {
  async get(): Promise<HomeSectionsState> {
    return deepClone(homeStore.read())
  },

  /**
   * 一次性把版位的預設項目連到既有內容（mock демо 用途）。因為這支檔案不
   * import client.ts（避免循環相依），無法自己查內容 id，所以由呼叫端
   * （HomeSections.vue，本來就會用到 adminApi.taxonomy）查好之後傳進來。
   * `defaultItemsSeeded` 為 true 之後這支永遠不做事，只呼叫一次即可。
   */
  async seedDefaultItems(
    itemsByKey: Partial<Record<HomeSectionKey, HomeSectionItemRef[]>>,
    heroSettings: HomeHeroSettings,
  ): Promise<HomeSectionsState> {
    return deepClone(
      homeStore.mutate((d) => {
        if (d.defaultItemsSeeded) return d
        d.sections = d.sections.map((s) =>
          s.sectionKey === 'hero' ? { ...s, heroSettings } : { ...s, items: itemsByKey[s.sectionKey] ?? [] },
        )
        d.published = deepClone(d.sections)
        d.defaultItemsSeeded = true
        return d
      }),
    )
  },

  /** 編輯版位文案／啟用狀態／挑選的內容（home.edit）。送審中鎖定，需等審核結果。 */
  async updateSection(
    key: HomeSectionKey,
    patch: Partial<Pick<HomeSection, 'title' | 'subtitle' | 'isEnabled' | 'items' | 'heroSettings'>>,
    _userId: number,
  ): Promise<HomeSectionsState> {
    return deepClone(
      homeStore.mutate((d) => {
        if (d.status === 2) throw new ApiError('CONFLICT_STATE', '版位編排送審中，請等待審核結果或撤回後再編輯。')
        const section = findSection(d, key)
        Object.assign(section, patch)
        if (d.status === 3) d.status = 1 // 已發布後再改動，代表草稿與上線版不再相同
        return d
      }),
    )
  },

  /**
   * 一次儲存全部版位（文案、啟用狀態、挑選的內容、彼此間的顯示順序）。畫面用
   * 這支當「儲存草稿」按鈕的實作，比逐一呼叫 updateSection／reorderSections
   * 簡單，且不會因為中途某一段失敗而讓畫面狀態半套。
   */
  async saveDraft(sections: HomeSection[], _userId: number): Promise<HomeSectionsState> {
    return deepClone(
      homeStore.mutate((d) => {
        if (d.status === 2) throw new ApiError('CONFLICT_STATE', '版位編排送審中，請等待審核結果或撤回後再編輯。')
        d.sections = sections.map((s, index) => ({ ...s, sortOrder: index }))
        if (d.status === 3) d.status = 1
        return d
      }),
    )
  },

  /** 版位之間的顯示順序（可排序，不可新增刪除，docs/08 §G-2）。 */
  async reorderSections(orderedKeys: HomeSectionKey[], _userId: number): Promise<HomeSectionsState> {
    return deepClone(
      homeStore.mutate((d) => {
        if (d.status === 2) throw new ApiError('CONFLICT_STATE', '版位編排送審中，請等待審核結果或撤回後再編輯。')
        orderedKeys.forEach((key, index) => {
          findSection(d, key).sortOrder = index
        })
        if (d.status === 3) d.status = 1
        return d
      }),
    )
  },

  /** 送審（home.submit）。 */
  async submit(userId: number): Promise<HomeSectionsState> {
    return deepClone(
      homeStore.mutate((d) => {
        if (d.status === 2) throw new ApiError('CONFLICT_STATE', '已經在送審中。')
        d.status = 2
        d.submittedByUserId = userId
        d.submittedAt = nowIso()
        d.decisionNote = null
        return d
      }),
    )
  },

  /** 撤回送審，改回草稿（home.edit，讓自己送出的單能收回修改）。 */
  async withdraw(_userId: number): Promise<HomeSectionsState> {
    return deepClone(
      homeStore.mutate((d) => {
        if (d.status !== 2) throw new ApiError('CONFLICT_STATE', '目前不是送審中，無法撤回。')
        d.status = 1
        return d
      }),
    )
  },

  /** 核准發布（home.publish）：草稿成為上線版。 */
  async approve(userId: number): Promise<HomeSectionsState> {
    return deepClone(
      homeStore.mutate((d) => {
        if (d.status !== 2) throw new ApiError('CONFLICT_STATE', '只有送審中的版位可以核准。')
        d.published = deepClone(d.sections)
        d.status = 3
        d.publishedByUserId = userId
        d.publishedAt = nowIso()
        d.decisionNote = null
        return d
      }),
    )
  },

  /** 退回（home.publish）：附原因，狀態改回草稿。 */
  async reject(note: string, _userId: number): Promise<HomeSectionsState> {
    if (!note.trim()) throw new ApiError('VALIDATION_REQUIRED', '退回原因為必填。')
    return deepClone(
      homeStore.mutate((d) => {
        if (d.status !== 2) throw new ApiError('CONFLICT_STATE', '只有送審中的版位可以退回。')
        d.status = 1
        d.decisionNote = note
        return d
      }),
    )
  },
}

// =============================================================================
// 導覽選單與頁尾（docs/08-database.md §G-3）
// =============================================================================

export type MenuKey = 'main' | 'footer'

/** 1 站內內容（指到某個 ContentItem）／2 站內路徑（固定字串，例如系統列表頁的網址）／3 外部網址。 */
export type LinkKind = 1 | 2 | 3

export interface MenuItem {
  id: number
  menuKey: MenuKey
  parentId: number | null
  /** 冗餘欄位，讓「最多兩層」這個約束可執行（docs/08 §G-3：純靠 ParentId 在 SQL 表達不出深度上限）。 */
  depth: 1 | 2
  label: string
  linkKind: LinkKind
  /** linkKind=1 時用來知道去哪個單元找 contentItemId。 */
  contentUnit: UnitKey | null
  contentItemId: number | null
  /** linkKind=2／3 時使用。 */
  url: string | null
  isExternal: boolean
  relAttr: string | null
  openInNewTab: boolean
  sortOrder: number
}

export type NewMenuItemInput = Pick<MenuItem, 'menuKey' | 'label' | 'linkKind'> &
  Partial<Pick<MenuItem, 'parentId' | 'contentUnit' | 'contentItemId' | 'url' | 'relAttr' | 'openInNewTab'>>

export type MenuItemPatch = Partial<
  Pick<MenuItem, 'label' | 'linkKind' | 'contentUnit' | 'contentItemId' | 'url' | 'relAttr' | 'openInNewTab'>
>

interface MenuDb {
  nextId: number
  items: MenuItem[]
}

/** `booking.20skin.tw` 與 `20skinshop.com` 在這裡，而且只在這裡（docs/08 §G-3；
 * CLAUDE.md 決策 4）。兩者都是 LinkKind=3 ＋ IsExternal=1，任何人想在別的地方
 * 放這兩個網域，就是在把已排除的範圍偷渡回來。 */
const EXTERNAL_BOOKING_URL = 'https://booking.20skin.tw/MainMs/Login'
const EXTERNAL_SHOP_URL = 'https://www.20skinshop.com/'

function seedMenuDb(): MenuDb {
  let nextId = 1
  const items: MenuItem[] = []

  function addTop(menuKey: MenuKey, label: string, url: string): MenuItem {
    const item: MenuItem = {
      id: nextId++,
      menuKey,
      parentId: null,
      depth: 1,
      label,
      linkKind: 2,
      contentUnit: null,
      contentItemId: null,
      url,
      isExternal: false,
      relAttr: null,
      openInNewTab: false,
      sortOrder: items.filter((i) => i.menuKey === menuKey && i.depth === 1).length,
    }
    items.push(item)
    return item
  }

  function addChild(parent: MenuItem, label: string, url: string): MenuItem {
    const item: MenuItem = {
      id: nextId++,
      menuKey: parent.menuKey,
      parentId: parent.id,
      depth: 2,
      label,
      linkKind: 2,
      contentUnit: null,
      contentItemId: null,
      url,
      isExternal: false,
      relAttr: null,
      openInNewTab: false,
      sortOrder: items.filter((i) => i.parentId === parent.id).length,
    }
    items.push(item)
    return item
  }

  function addExternal(menuKey: MenuKey, label: string, url: string, parent?: MenuItem): MenuItem {
    const item: MenuItem = {
      id: nextId++,
      menuKey,
      parentId: parent?.id ?? null,
      depth: parent ? 2 : 1,
      label,
      linkKind: 3,
      contentUnit: null,
      contentItemId: null,
      url,
      isExternal: true,
      relAttr: 'noopener external',
      openInNewTab: true,
      sortOrder: items.filter((i) => i.menuKey === menuKey && i.parentId === (parent?.id ?? null)).length,
    }
    items.push(item)
    return item
  }

  // ── 主選單：結構示意照抄 apps/web/app/data/navigation.ts 的 MAIN_NAV（唯讀參考，
  // 這裡是可編輯的後台資料，兩邊接上 API 後會是同一份）。示範性質，未逐一複製
  // 全部葉節點——重點是樹狀、兩層、可指向內容或外部網址三種型態都有示範。
  const about = addTop('main', '品牌理念', '/about/')
  addChild(about, '新中式美學', '/about/new-chinese-aesthetics/')
  addChild(about, '彩妝式輕醫美', '/about/makeup-style/')

  const concerns = addTop('main', '肌膚困擾', '/concerns/')
  // 這兩個子項目在 mock 內容庫裡有對應的 Concern 記錄，示範 LinkKind=1（站內內容）；
  // 其餘六個困擾在 mock 尚無內容記錄，維持 LinkKind=2（固定路徑）比較誠實。
  const concernAcne = addChild(concerns, '痘痘・粉刺', '/concerns/acne/')
  concernAcne.linkKind = 1
  concernAcne.contentUnit = 'concern'
  const concernSensitive = addChild(concerns, '敏感肌', '/concerns/sensitive-skin/')
  concernSensitive.linkKind = 1
  concernSensitive.contentUnit = 'concern'
  addChild(concerns, '斑點・色素沉澱', '/concerns/pigmentation/')
  addChild(concerns, '抗老・緊緻', '/concerns/anti-aging/')

  const treatments = addTop('main', '專業服務', '/treatments/')
  addChild(treatments, '光療美顏', '/treatments/laser/')
  addChild(treatments, '微針美容', '/treatments/microneedle/')
  addChild(treatments, '光電美容', '/treatments/photoelectric/')
  addChild(treatments, '醫美保養', '/treatments/skincare/')

  addTop('main', '醫師團隊', '/team/')
  addTop('main', '案例分享', '/cases/')
  addTop('main', '常見問題', '/faq/')

  const clinics = addTop('main', '診所據點', '/clinics/')
  const clinicSiji = addChild(clinics, '四季診所', '/clinics/siji/')
  clinicSiji.linkKind = 1
  clinicSiji.contentUnit = 'clinic'
  const clinicErlin = addChild(clinics, '二林四季皮膚科', '/clinics/erlin/')
  clinicErlin.linkKind = 1
  clinicErlin.contentUnit = 'clinic'

  // 兩個外部導流連結——CLAUDE.md 決策 4：只以外部連結存在，強制標記。
  addExternal('main', '線上預約掛號', EXTERNAL_BOOKING_URL)
  addExternal('main', '線上購物', EXTERNAL_SHOP_URL)

  // ── 頁尾選單：結構示意照抄 FOOTER_COLUMNS（同樣只示範代表性節點）。
  const footerConcerns = addTop('footer', '肌膚困擾', '/concerns/')
  addChild(footerConcerns, '痘痘・粉刺', '/concerns/acne/')
  addChild(footerConcerns, '敏感肌', '/concerns/sensitive-skin/')

  const footerTreatments = addTop('footer', '專業服務', '/treatments/')
  addChild(footerTreatments, '光療美顏', '/treatments/laser/')
  addChild(footerTreatments, '微針美容', '/treatments/microneedle/')

  const footerAbout = addTop('footer', '關於 20SKIN', '/about/')
  addChild(footerAbout, '醫師團隊', '/team/')
  addChild(footerAbout, '常見問題', '/faq/')
  addChild(footerAbout, '聯絡我們', '/contact/')
  addExternal('footer', '線上購物', EXTERNAL_SHOP_URL, footerAbout)

  return { nextId, items }
}

const menuStore = createStore<MenuDb>('menu', seedMenuDb)

function findMenuItem(db: MenuDb, id: number): MenuItem {
  const item = db.items.find((i) => i.id === id)
  if (!item) throw new ApiError('NOT_FOUND', '找不到這個選單項目。')
  return item
}

function siblingCount(db: MenuDb, menuKey: MenuKey, parentId: number | null): number {
  return db.items.filter((i) => i.menuKey === menuKey && i.parentId === parentId).length
}

function assertLinkShape(input: { linkKind: LinkKind; contentUnit?: UnitKey | null; contentItemId?: number | null; url?: string | null }) {
  if (input.linkKind === 1 && (!input.contentUnit || !input.contentItemId)) {
    throw new ApiError('VALIDATION_REQUIRED', '指向站內內容時，必須選擇單元與項目。')
  }
  if ((input.linkKind === 2 || input.linkKind === 3) && !input.url) {
    throw new ApiError('VALIDATION_REQUIRED', '網址為必填。')
  }
  if (input.linkKind === 3 && input.url && !/^https?:\/\//.test(input.url)) {
    throw new ApiError('VALIDATION_FORMAT', '外部網址必須是完整的 http(s) 網址。')
  }
}

const menu = {
  async list(menuKey: MenuKey): Promise<MenuItem[]> {
    return deepClone(
      menuStore
        .read()
        .items.filter((i) => i.menuKey === menuKey)
        .sort((a, b) => a.depth - b.depth || a.sortOrder - b.sortOrder),
    )
  },

  async create(input: NewMenuItemInput, _userId: number): Promise<MenuItem> {
    assertLinkShape(input)
    return deepClone(
      menuStore.mutate((d) => {
        let depth: 1 | 2 = 1
        if (input.parentId != null) {
          const parent = findMenuItem(d, input.parentId)
          if (parent.menuKey !== input.menuKey) throw new ApiError('VALIDATION_FORMAT', '子項目必須跟父項目在同一個選單。')
          if (parent.depth !== 1) throw new ApiError('VALIDATION_RANGE', '最多兩層，不能再往下加一層。')
          depth = 2
        }
        const isExternal = input.linkKind === 3
        const item: MenuItem = {
          id: d.nextId++,
          menuKey: input.menuKey,
          parentId: input.parentId ?? null,
          depth,
          label: input.label,
          linkKind: input.linkKind,
          contentUnit: input.linkKind === 1 ? input.contentUnit ?? null : null,
          contentItemId: input.linkKind === 1 ? input.contentItemId ?? null : null,
          url: input.linkKind === 1 ? null : input.url ?? null,
          isExternal,
          relAttr: isExternal ? input.relAttr ?? 'noopener external' : null,
          openInNewTab: isExternal ? true : Boolean(input.openInNewTab),
          sortOrder: siblingCount(d, input.menuKey, input.parentId ?? null),
        }
        d.items.push(item)
        return item
      }),
    )
  },

  async update(id: number, patch: MenuItemPatch, _userId: number): Promise<MenuItem> {
    return deepClone(
      menuStore.mutate((d) => {
        const item = findMenuItem(d, id)
        const next = { ...item, ...patch }
        assertLinkShape(next)
        if (next.linkKind === 1) {
          next.url = null
          next.isExternal = false
          next.relAttr = null
        } else {
          next.contentUnit = null
          next.contentItemId = null
          if (next.linkKind === 3) {
            next.isExternal = true
            next.relAttr = next.relAttr ?? 'noopener external'
            next.openInNewTab = true
          } else {
            next.isExternal = false
          }
        }
        Object.assign(item, next)
        return item
      }),
    )
  },

  /** 刪除連同其子項目一併移除（子項目的 parentId 指向它，留著會變孤兒節點）。 */
  async remove(id: number): Promise<void> {
    menuStore.mutate((d) => {
      const item = findMenuItem(d, id)
      const toRemove = new Set([item.id, ...d.items.filter((i) => i.parentId === item.id).map((i) => i.id)])
      d.items = d.items.filter((i) => !toRemove.has(i.id))
    })
  },

  /** 同層排序（上／下移動，docs 現況：拖曳排序此輪先以上下移動按鈕實作，與其餘畫面一致）。 */
  async move(id: number, direction: -1 | 1, _userId: number): Promise<void> {
    menuStore.mutate((d) => {
      const item = findMenuItem(d, id)
      const siblings = d.items
        .filter((i) => i.menuKey === item.menuKey && i.parentId === item.parentId)
        .sort((a, b) => a.sortOrder - b.sortOrder)
      const index = siblings.findIndex((i) => i.id === id)
      const targetIndex = index + direction
      if (targetIndex < 0 || targetIndex >= siblings.length) return
      const a = siblings[index]
      const b = siblings[targetIndex]
      const tmp = a.sortOrder
      a.sortOrder = b.sortOrder
      b.sortOrder = tmp
    })
  },

  /** 升／降一層（promote：newParentId=null；demote：newParentId=某個同選單的頂層項目）。 */
  async changeParent(id: number, newParentId: number | null, _userId: number): Promise<void> {
    menuStore.mutate((d) => {
      const item = findMenuItem(d, id)
      if (newParentId === item.id) throw new ApiError('VALIDATION_FORMAT', '不能把項目移到自己底下。')
      if (newParentId == null) {
        item.parentId = null
        item.depth = 1
      } else {
        const hasChildren = d.items.some((i) => i.parentId === item.id)
        if (hasChildren) throw new ApiError('VALIDATION_RANGE', '這個項目底下還有子項目，最多兩層，無法再往下移一層。')
        const parent = findMenuItem(d, newParentId)
        if (parent.menuKey !== item.menuKey) throw new ApiError('VALIDATION_FORMAT', '只能移到同一個選單底下。')
        if (parent.depth !== 1) throw new ApiError('VALIDATION_RANGE', '最多兩層，目標項目本身已經是子層。')
        item.parentId = parent.id
        item.depth = 2
      }
      item.sortOrder = siblingCount(d, item.menuKey, item.parentId)
    })
  },
}

// =============================================================================
// 對外門面
// =============================================================================

export const siteApi = {
  settings,
  home,
  menu,
}
