// 全站設定／導覽選單與頁尾／首頁版位編排（docs/02 §3、docs/08 §G）
//
// 上層畫面只透過 client.ts 匯出的 adminApi 取用，不直接 import 這個檔。
//
// ⚠️ 這支刻意不 import '../api/client'（會與 client.ts 匯入 siteApi 形成循環相依）。
// 需要 adminApi.content／adminApi.taxonomy 的地方（例如把首頁版位連到既有內容、
// NAP 與據點頁比對），一律由呼叫端的 Vue 元件取得後傳進來。

import type { UploadedImage } from './upload'
import type { ImageValue } from '../image-value'
import type { UnitKey } from '../types'
import { ApiError } from './errors'
import { normalizePaged, request, type ServerPaged } from './http'
import { readSettings, settingBool, settingJson, settingText, writeSettings } from './settings-client'

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
  /** ⚠️ 內嵌圖片欄位，不是媒體庫的 Id——對應 SiteSettings 的 `site.logoImage`（JSON）。 */
  logo: UploadedImage | null
  /** 個別內容頁沒設 OG 圖時的退回值。對應 `site.defaultOgImage`（JSON）。 */
  defaultOgImage: UploadedImage | null
  /** 全站 NAP 主資料。⚠️ 必須與據點頁、頁尾逐字一致（CLAUDE.md／docs/03 §4 ③）。 */
  nap: NapEntry[]
  /** 追蹤碼（GA／GTM／Meta Pixel 等），先以自由文字收納——docs/08 §G-1：
   * 用 key-value 而非固定欄位，前端以一個多行文字欄位承接同一件事。 */
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

/**
 * 編輯中的全站設定：兩個圖片欄位可能還是「待上傳」的那一種（src/image-value.ts）。
 * 🔴 `update()` 收的是 `SiteSettingsData`，所以送出前一定要先 `resolveImage()`——
 *    型別分開就是為了讓漏掉那一步在編譯期就被抓到。
 */
export type SiteSettingsDraft = Omit<SiteSettingsData, 'logo' | 'defaultOgImage'> & {
  logo: ImageValue | null
  defaultOgImage: ImageValue | null
}

// 畫面欄位 → SiteSettings 的鍵（docs/08 §G-1 的種子）。
//
// 🔴 **鍵是固定的，不能新增。** API 對不存在的 SettingKey 回 404 —— 要多一個設定
//    就是一支 migration ＋ 一列種子（`seo.sitemapFiles` 就是這樣加的），
//    不是在這裡多寫一行。
//
// ⚠️ 種子裡的 `site.description` 目前**沒有對應的編輯欄位**。這不是漏接：
//    它是前台 meta description 的退回值，改它會動到每一頁的 SEO，
//    要開放編輯應該是「全站 SEO」那一區的事，不是塞進這張表。
const KEYS = {
  siteName: 'site.name',
  logo: 'site.logoImage',
  defaultOgImage: 'site.defaultOgImage',
  nap: 'nap.json',
  trackingCodes: 'tracking.ga4',
  contactEmail: 'contact.recipientEmail',
  socialLinks: 'footer.social.json',
  footerCopyright: 'footer.copyright',
  aiFaqEnabled: 'aifaq.enabled',
  aiFaqPanelTitle: 'aifaq.panelTitle',
  aiFaqWelcome: 'aifaq.welcomeText',
  aiFaqBookingUrl: 'aifaq.handoffBookingUrl',
  aiFaqLineUrl: 'aifaq.handoffLineUrl',
} as const

const settings = {
  async get(): Promise<SiteSettingsData> {
    const map = await readSettings()
    // 「最後修改」取所有鍵裡最新的那一個 —— 這張表是逐鍵記時間的，
    // 沒有一個代表整份設定的時間戳。
    const latest = [...map.values()].map((i) => i.updatedAt).sort().at(-1) ?? ''
    const latestBy = [...map.values()].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)).at(-1)

    return {
      siteName: settingText(map, KEYS.siteName),
      logo: settingJson<UploadedImage | null>(map, KEYS.logo, null),
      defaultOgImage: settingJson<UploadedImage | null>(map, KEYS.defaultOgImage, null),
      nap: settingJson<NapEntry[]>(map, KEYS.nap, []),
      trackingCodes: settingText(map, KEYS.trackingCodes),
      contactEmail: settingText(map, KEYS.contactEmail),
      socialLinks: settingJson<SocialLink[]>(map, KEYS.socialLinks, []),
      footerCopyright: settingText(map, KEYS.footerCopyright),
      aiFaq: {
        // 🔴 預設關閉（docs/04 §4）：AI 未串接前不對外顯示 ——
        //    一顆點下去沒反應的常駐按鈕比沒有按鈕更糟。
        enabled: settingBool(map, KEYS.aiFaqEnabled, false),
        panelTitle: settingText(map, KEYS.aiFaqPanelTitle),
        welcomeMessage: settingText(map, KEYS.aiFaqWelcome),
        bookingUrl: settingText(map, KEYS.aiFaqBookingUrl),
        lineUrl: settingText(map, KEYS.aiFaqLineUrl),
      },
      updatedAt: latest,
      updatedByUserId: latestBy?.updatedByUserId ?? null,
    }
  },

  /**
   * 儲存即生效，無需送審（docs/02-backend-cms.md §4）。
   *
   * ⚠️ **只送 patch 裡真的有的欄位。** 整份寫回去的話，兩個人同時開著設定畫面時，
   * 後存的那個人會把前一個人改的欄位一起蓋回舊值 —— 而設定類沒有留痕可以追查
   * （docs/10 §4 末段）。
   */
  async update(patch: Partial<SiteSettingsData>, _userId: number): Promise<SiteSettingsData> {
    const changes: Record<string, string> = {}
    if (patch.siteName !== undefined) changes[KEYS.siteName] = patch.siteName
    if (patch.logo !== undefined) changes[KEYS.logo] = patch.logo ? JSON.stringify(patch.logo) : ''
    if (patch.defaultOgImage !== undefined) changes[KEYS.defaultOgImage] = patch.defaultOgImage ? JSON.stringify(patch.defaultOgImage) : ''
    if (patch.nap !== undefined) changes[KEYS.nap] = JSON.stringify(patch.nap)
    if (patch.trackingCodes !== undefined) changes[KEYS.trackingCodes] = patch.trackingCodes
    if (patch.contactEmail !== undefined) changes[KEYS.contactEmail] = patch.contactEmail
    if (patch.socialLinks !== undefined) changes[KEYS.socialLinks] = JSON.stringify(patch.socialLinks)
    if (patch.footerCopyright !== undefined) changes[KEYS.footerCopyright] = patch.footerCopyright
    if (patch.aiFaq !== undefined) {
      changes[KEYS.aiFaqEnabled] = patch.aiFaq.enabled ? 'true' : 'false'
      changes[KEYS.aiFaqPanelTitle] = patch.aiFaq.panelTitle
      changes[KEYS.aiFaqWelcome] = patch.aiFaq.welcomeMessage
      changes[KEYS.aiFaqBookingUrl] = patch.aiFaq.bookingUrl
      changes[KEYS.aiFaqLineUrl] = patch.aiFaq.lineUrl
    }

    await writeSettings(changes)
    return settings.get()
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

/** 唯一例外：hero 的主視覺與外部導流 CTA 沒有對應的站內內容，放在 `HomeSections.Settings`
 * 這個 JSON 欄位裡（docs/08 §G-2）。 */
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
  /**
   * 🔴 **伺服器上那個 `settings` JSON 字串的原樣備份，存檔時原封不動送回去。**
   *
   * 這個畫面**沒有任何一個版位的 settings 是編得動的**，所以送回去的一定要是
   * 讀回來的那一份。原本的寫法是「hero 送 heroSettings、其餘一律送 null」，
   * 於是按一次「儲存草稿」就會：
   *   - 把 `specialties` 的**八大專科入口（含圖示）整組清成 null**；
   *   - 把 `hero` 的**四張輪播圖**（前台讀的是一個陣列）覆寫成
   *     `{"0":…,"1":…, eyebrow:"WELCOME TO 20SKIN", …}` 這種物件。
   * 兩者都不會有任何錯誤訊息，前台首頁會直接少掉那兩區
   * （2026-09-17 實測踩到，見 apps/web/app/data/home.ts 對 settings 的讀法）。
   */
  rawSettings: string | null
}

/** 1 草稿（含被退回、或已發布後又被改動）／2 送審中／3 已發布。
 * 對齊 docs/11-backend-design.md §7 的三段式工作流，走的就是共用的 `ContentReviews` 佇列。 */
export type HomeWorkflowStatus = 1 | 2 | 3

export interface HomeSectionsState {
  /**
   * 🔴 這是**首頁那筆 Page 的狀態**，不是版位自己的狀態機。
   * docs/08 §G-2、docs/11 §8：版位編排的送審與版本歷程掛在 `SystemKey='home'` 的
   * ContentItem 上 —— 所以送審走 `POST /admin/page/{homeId}/submit`，核准走共用的審核佇列，
   * 與其他九個內容單元同一條路。
   *
   * ⚠️ 資料庫的狀態有四個（草稿／送審中/已發布／已下架），這裡只用得到前三個：
   * 首頁不會被下架。真的遇到 Status=4 時當成草稿處理。
   */
  status: HomeWorkflowStatus
  /** 目前編輯中的草稿（＝ HomeSections 兩張表的內容，它們是工作副本）。 */
  sections: HomeSection[]
  /** 首頁那筆 Page 的 ContentItems.Id，送審與查審核佇列都要用。 */
  homePageId: number
  submittedByUserId: number | null
  submittedAt: string | null
  publishedByUserId: number | null
  publishedAt: string | null
  /** 退回原因。 */
  decisionNote: string | null
}

/**
 * 版位的標題、英文小標與「這個版位收哪個單元」是**版面**，留在前台
 * （CLAUDE.md 決策 14：「院方會想改它嗎？」）。資料庫的 HomeSections 也有
 * Title／Subtitle，但那是給匯出用的；後台這個畫面顯示的是這一份。
 */
const HOME_SECTION_META: Record<HomeSectionKey, { title: string; subtitle: string; targetUnit: UnitKey | null }> = {
  hero: { title: '主視覺', subtitle: 'WELCOME TO 20SKIN', targetUnit: null },
  specialties: { title: '看皮膚　找四季', subtitle: 'SKIN CONCERNS', targetUnit: 'concern' },
  'featured-treatments': { title: '精選療程', subtitle: 'FEATURED TREATMENTS', targetUnit: 'treatment' },
  'latest-articles': { title: '最新文章', subtitle: 'LATEST ARTICLES', targetUnit: 'article' },
  doctors: { title: '醫師團隊', subtitle: 'OUR DOCTORS', targetUnit: 'doctor' },
  clinics: { title: '據點資訊', subtitle: 'OUR CLINICS', targetUnit: 'clinic' },
  'brand-story': { title: '品牌理念摘要', subtitle: '新中式美學', targetUnit: 'page' },
}

interface ServerHomeSection {
  id: number
  sectionKey: string
  title: string
  subtitle: string | null
  isEnabled: boolean
  sortOrder: number
  settings: string | null
  items: { id: number; contentItemId: number; contentTitle: string; contentUrlPath: string | null; contentType: number; sortOrder: number }[]
}

function defaultHeroSettings(): HomeHeroSettings {
  return {
    eyebrow: 'WELCOME TO 20SKIN',
    headline: '',
    images: [],
    ctaLabel: '',
    ctaUrl: '',
    externalCtaLabel: '',
    externalCtaUrl: '',
  }
}

function toHomeSection(row: ServerHomeSection): HomeSection {
  const key = row.sectionKey as HomeSectionKey
  const meta = HOME_SECTION_META[key]
  // hero 的表單欄位（eyebrow／headline／CTA）只有在 settings 真的是那個物件形狀時才成立。
  //
  // 🔴 **正式資料不是那個形狀** —— `hero.settings` 是前台讀的**輪播圖陣列**
  //    （apps/web/app/data/home.ts：`settings as { image, caption }[]`），
  //    而 `{ ...defaultHeroSettings(), ...陣列 }` 會展開成 `{0:…,1:…,eyebrow:…}`。
  //    所以陣列一律**不進表單**，維持 null，畫面上那組欄位會停用並說明原因。
  let heroSettings: HomeHeroSettings | null = null
  if (key === 'hero' && row.settings) {
    try {
      const parsed: unknown = JSON.parse(row.settings)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        heroSettings = { ...defaultHeroSettings(), ...(parsed as HomeHeroSettings) }
      }
    } catch {
      // settings 是自由 JSON 欄位，壞掉時不進表單，而不是讓整個畫面開不起來。
    }
  }
  return {
    sectionKey: key,
    title: meta?.title ?? row.title,
    subtitle: meta?.subtitle ?? row.subtitle ?? '',
    isEnabled: row.isEnabled,
    sortOrder: row.sortOrder,
    targetUnit: meta?.targetUnit ?? null,
    items: row.items
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((i) => ({ contentItemId: i.contentItemId, sortOrder: i.sortOrder })),
    heroSettings,
    rawSettings: row.settings,
  }
}

/** 找出首頁那筆 Page。⚠️ 靠 `systemKey === 'home'`，不是靠標題或 Id —— 兩者都可能被改。 */
async function findHomePageId(): Promise<number> {
  const paged = normalizePaged(
    await request<ServerPaged<{ id: number; fields: Record<string, unknown> | null }>>('/admin/page', {
      query: { page: 1, pageSize: 100 },
    }),
  )
  const home = paged.items.find((p) => (p.fields ?? {}).systemKey === 'home')
  if (!home) throw new ApiError('NOT_FOUND', '找不到首頁那筆系統頁（systemKey=home）。它是種子資料，不該不存在。')
  return home.id
}

interface HomePageState {
  id: number
  status: number
  updatedAt: string
}

async function loadHomePage(): Promise<HomePageState> {
  const id = await findHomePageId()
  const detail = await request<{ id: number; status: number; updatedAt: string }>(`/admin/page/${id}`)
  return { id: detail.id, status: detail.status, updatedAt: detail.updatedAt }
}

async function loadHomeState(): Promise<HomeSectionsState> {
  const [rows, page] = await Promise.all([
    request<ServerHomeSection[]>('/admin/home-section'),
    loadHomePage(),
  ])

  const sections = (rows ?? [])
    .map(toHomeSection)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  // 資料庫有四個狀態，這個畫面只用前三個（首頁不會被下架）。Status=4 當草稿處理。
  const status: HomeWorkflowStatus = page.status === 2 ? 2 : page.status === 3 ? 3 : 1

  return {
    status,
    sections,
    homePageId: page.id,
    // ⚠️ 送審者／核准者與時間在 `ContentReviews`，只有「待審」那一筆查得到
    //    （`GET /admin/review` 查的是 Status=1）。已經核准或退回的那幾筆沒有端點
    //    可以查 —— 這不是漏接，是 docs/10 §3.4 只定義了待審佇列。
    //    畫面上因此只在「送審中」時顯示送審資訊。
    submittedByUserId: null,
    submittedAt: status === 2 ? page.updatedAt : null,
    publishedByUserId: null,
    publishedAt: status === 3 ? page.updatedAt : null,
    decisionNote: null,
  }
}

/** 把目前畫面上的版位整批送回 `PUT /admin/home-section`（那支是整批替換）。 */
async function putSections(sections: HomeSection[]): Promise<void> {
  await request<ServerHomeSection[]>('/admin/home-section', {
    method: 'PUT',
    body: {
      sections: sections.map((s, index) => ({
        sectionKey: s.sectionKey,
        isEnabled: s.isEnabled,
        sortOrder: index,
        // 🔴 **原樣送回讀到的那一份**，除非 hero 真的是表單編得動的物件形狀。
        //    舊寫法（hero 送 heroSettings、其餘送 null）會在每一次存檔時清掉
        //    specialties 的八大專科、並把 hero 的輪播圖陣列壓成物件 —— 見
        //    HomeSection.rawSettings 的註解。
        settings: s.sectionKey === 'hero' && s.heroSettings ? JSON.stringify(s.heroSettings) : s.rawSettings,
        items: s.items.map((i, itemIndex) => ({ contentItemId: i.contentItemId, sortOrder: itemIndex })),
      })),
    },
  })
}

const home = {
  async get(): Promise<HomeSectionsState> {
    return loadHomeState()
  },

  /**
   * 編輯單一版位。
   * ⚠️ 狀態 2（送審中）是舊資料才會有的殘留狀態 —— 送審已經不做了，但既有資料
   *    可能還停在那裡，而 API 對它一律拒絕更新，所以這裡先擋，少一趟往返。
   */
  async updateSection(
    key: HomeSectionKey,
    patch: Partial<Pick<HomeSection, 'title' | 'subtitle' | 'isEnabled' | 'items' | 'heroSettings'>>,
    _userId: number,
  ): Promise<HomeSectionsState> {
    const state = await loadHomeState()
    if (state.status === 2) throw new ApiError('CONFLICT_STATE', '版位編排送審中，請等待審核結果。')
    const target = state.sections.find((s) => s.sectionKey === key)
    if (!target) throw new ApiError('NOT_FOUND', `找不到版位：${key}`)
    Object.assign(target, patch)
    await putSections(state.sections)
    return loadHomeState()
  },

  async saveDraft(sections: HomeSection[], _userId: number): Promise<HomeSectionsState> {
    await putSections(sections)
    return loadHomeState()
  },

  async reorderSections(orderedKeys: HomeSectionKey[], _userId: number): Promise<HomeSectionsState> {
    const state = await loadHomeState()
    const byKey = new Map(state.sections.map((s) => [s.sectionKey, s]))
    const ordered = orderedKeys.map((k) => byKey.get(k)).filter((s): s is HomeSection => Boolean(s))
    await putSections(ordered)
    return loadHomeState()
  },

  /**
   * 發布。走的是**首頁那筆 Page** 的發布端點 —— 版位編排會隨版本快照一起帶走
   * （docs/08 §G-2、docs/11 §8），所以按下去的那一刻才會產生前台真正讀到的那一份。
   *
   * 🔴 **不可以只存草稿就當作上線。** 前台讀的是「首頁那筆 Page 已核准的版本快照」，
   *    而 `PUT /admin/home-section` 只寫 HomeSections／HomeSectionItems 這兩張工作表。
   *    少了這一步，畫面上排好的版位前台一個都看不到（docs/08 §G-2）。
   * ⚠️ 2026-09-17 由「送審 → 在同一頁核准」改成直接發布（CLAUDE.md 決策 20）。
   *    `/admin/review/*` 那三支端點已經整個移除，不要再指回去。
   */
  async publish(_userId: number): Promise<HomeSectionsState> {
    const state = await loadHomeState()
    await request<null>(`/admin/page/${state.homePageId}/publish`, { method: 'PATCH', body: { action: 'publish' } })
    return loadHomeState()
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

/** `booking.20skin.tw` 與 `20skinshop.com` 在這裡，而且只在這裡（docs/08 §G-3；
 * CLAUDE.md 決策 4）。兩者都是 LinkKind=3 ＋ IsExternal=1，任何人想在別的地方
 * 放這兩個網域，就是在把已排除的範圍偷渡回來。 */

interface ServerMenuNode {
  id: number | null
  label: string
  linkKind: number
  contentItemId: number | null
  url: string | null
  relAttr: string | null
  openInNewTab: boolean
  children: ServerMenuNode[]
  /** 唯讀，由 API join 出來（MenuItems 沒有這兩欄）。 */
  contentType: number | null
  contentTitle: string | null
}

interface ServerMenuTree {
  main: ServerMenuNode[] | null
  footer: ServerMenuNode[] | null
}

/** docs/08 §B-1 的 ContentType 值 → 單元代號。畫面要知道「這個節點指的是哪個單元」。 */
const CONTENT_TYPE_TO_UNIT: Record<number, UnitKey> = {
  1: 'treatment',
  2: 'doctor',
  3: 'concern',
  4: 'article',
  5: 'case',
  6: 'faq',
  7: 'clinic',
  8: 'page',
  9: 'term',
}

/**
 * 巢狀樹 → 後台用的扁平清單。
 *
 * ⚠️ **API 的選單是樹，後台畫面是扁平清單 ＋ parentId。** 兩種形狀都有各自的理由：
 * 樹是因為新節點還沒有資料庫 Id，靠巢狀 JSON 才表達得出父子關係；扁平是因為
 * 上下移動、升降一層這幾個操作在扁平結構上簡單得多。轉換集中在這裡兩支函式。
 */
function flattenMenu(nodes: ServerMenuNode[], menuKey: MenuKey): MenuItem[] {
  const out: MenuItem[] = []
  // API 回的節點一定有 Id（讀取時），這裡用一個遞減的負數當「還沒存過」的暫時 Id。
  let tempId = -1

  function walk(list: ServerMenuNode[], parentId: number | null, depth: 1 | 2) {
    list.forEach((node, index) => {
      const id = node.id ?? tempId--
      const isExternal = node.linkKind === 3
      out.push({
        id,
        menuKey,
        parentId,
        depth,
        label: node.label,
        linkKind: node.linkKind as LinkKind,
        contentUnit: node.contentType !== null ? CONTENT_TYPE_TO_UNIT[node.contentType] ?? null : null,
        contentItemId: node.contentItemId,
        url: node.url,
        isExternal,
        relAttr: node.relAttr,
        openInNewTab: node.openInNewTab,
        sortOrder: index,
      })
      // 最多兩層（docs/08 §G-3），第三層以下就算 API 回了也不往下走。
      if (depth === 1) walk(node.children ?? [], id, 2)
    })
  }

  walk(nodes, null, 1)
  return out
}

function nestMenu(items: MenuItem[], menuKey: MenuKey): unknown[] {
  const scoped = items.filter((i) => i.menuKey === menuKey)
  const build = (parentId: number | null): unknown[] =>
    scoped
      .filter((i) => i.parentId === parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((i) => ({
        // 負數是本地暫時 Id（見 flattenMenu），送出去要變回 null＝新增。
        id: i.id > 0 ? i.id : null,
        label: i.label,
        linkKind: i.linkKind,
        contentItemId: i.linkKind === 1 ? i.contentItemId : null,
        url: i.linkKind === 1 ? null : i.url,
        relAttr: i.relAttr,
        openInNewTab: i.openInNewTab,
        children: parentId === null ? build(i.id) : [],
      }))
  return build(null)
}

async function loadMenu(menuKey: MenuKey): Promise<MenuItem[]> {
  const tree = await request<ServerMenuTree>('/admin/menu')
  return flattenMenu((menuKey === 'main' ? tree.main : tree.footer) ?? [], menuKey)
}

/**
 * ⚠️ `PUT /admin/menu` 是**整棵樹整批替換**：送出去的那一份就是新的全部。
 * 所以每一個編輯動作都是「讀回來 → 在記憶體改 → 整份送回去」。
 * 只送一個節點等於把該選單其餘節點全部刪掉。
 */
async function saveMenu(menuKey: MenuKey, items: MenuItem[]): Promise<void> {
  const payload = menuKey === 'main'
    ? { main: nestMenu(items, 'main') }
    : { footer: nestMenu(items, 'footer') }
  await request<ServerMenuTree>('/admin/menu', { method: 'PUT', body: payload })
}

function assertLinkShape(item: Pick<MenuItem, 'linkKind' | 'contentItemId' | 'url'>) {
  if (item.linkKind === 1 && !item.contentItemId) {
    throw new ApiError('VALIDATION_REQUIRED', '連結到站內內容時必須選一筆內容。')
  }
  if (item.linkKind !== 1 && !item.url) {
    throw new ApiError('VALIDATION_REQUIRED', '這個連結類型需要填寫網址或路徑。')
  }
}

function findItem(items: MenuItem[], id: number): MenuItem {
  const found = items.find((i) => i.id === id)
  if (!found) throw new ApiError('NOT_FOUND', `找不到選單項目 #${id}。`)
  return found
}

const menu = {
  async list(menuKey: MenuKey): Promise<MenuItem[]> {
    return loadMenu(menuKey)
  },

  async create(input: NewMenuItemInput, _userId: number): Promise<MenuItem> {
    assertLinkShape({ linkKind: input.linkKind, contentItemId: input.contentItemId ?? null, url: input.url ?? null })
    const items = await loadMenu(input.menuKey)

    let depth: 1 | 2 = 1
    if (input.parentId != null) {
      const parent = findItem(items, input.parentId)
      if (parent.depth !== 1) throw new ApiError('VALIDATION_RANGE', '最多兩層，不能再往下加一層。')
      depth = 2
    }

    const isExternal = input.linkKind === 3
    const item: MenuItem = {
      // 本地暫時 Id，送出時會變成 null＝新增（見 nestMenu）。
      id: Math.min(0, ...items.map((i) => i.id)) - 1,
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
      sortOrder: items.filter((i) => i.parentId === (input.parentId ?? null)).length,
    }

    items.push(item)
    await saveMenu(input.menuKey, items)

    // 存回去之後 Id 才由資料庫決定，所以重讀一次再把那一筆找出來。
    const saved = await loadMenu(input.menuKey)
    const match = saved.find((i) => i.label === item.label && i.parentId === item.parentId)
    return match ?? item
  },

  async update(id: number, patch: MenuItemPatch, _userId: number): Promise<MenuItem> {
    for (const menuKey of ['main', 'footer'] as MenuKey[]) {
      const items = await loadMenu(menuKey)
      const item = items.find((i) => i.id === id)
      if (!item) continue

      Object.assign(item, patch)
      if (item.linkKind === 1) {
        item.url = null
        item.isExternal = false
        item.relAttr = null
      } else {
        item.contentUnit = null
        item.contentItemId = null
        item.isExternal = item.linkKind === 3
        if (item.isExternal) {
          item.relAttr = item.relAttr ?? 'noopener external'
          item.openInNewTab = true
        }
      }
      assertLinkShape(item)

      await saveMenu(menuKey, items)
      const saved = await loadMenu(menuKey)
      return saved.find((i) => i.id === id) ?? item
    }
    throw new ApiError('NOT_FOUND', `找不到選單項目 #${id}。`)
  },

  /** 刪除連同其子項目一併移除（子項目的 parentId 指向它，留著會變孤兒節點）。 */
  async remove(id: number): Promise<void> {
    for (const menuKey of ['main', 'footer'] as MenuKey[]) {
      const items = await loadMenu(menuKey)
      if (!items.some((i) => i.id === id)) continue
      const remaining = items.filter((i) => i.id !== id && i.parentId !== id)
      await saveMenu(menuKey, remaining)
      return
    }
    throw new ApiError('NOT_FOUND', `找不到選單項目 #${id}。`)
  },

  /**
   * 同層排序：`orderedIds` 是**這一層的完整新順序**（拖曳排序用，2026-09-17
   * 取代原本一次移動一格的 `move(id, ±1)`）。
   *
   * ⚠️ **只重新分配這幾筆自己原有的 sortOrder 值**，不重編號成 0..n —— 同一
   *    份選單裡別層的項目沒有被這次操作碰到，整份重編會讓它們的相對關係跟著
   *    變動。這也是原本 `move` 交換兩個 sortOrder 的語意。
   * 🔴 呼叫端只能傳**同一層的兄弟節點**。跨層搬移是「升層／降層」
   *    （`changeParent`）的事，不是排序。
   */
  async reorder(menuKey: MenuKey, orderedIds: number[], _userId: number): Promise<void> {
    if (orderedIds.length < 2) return
    const items = await loadMenu(menuKey)

    const moved = orderedIds.map((id) => {
      const item = items.find((i) => i.id === id)
      if (!item) throw new ApiError('NOT_FOUND', `找不到選單項目 #${id}。`)
      return item
    })

    const parentIds = new Set(moved.map((i) => i.parentId ?? null))
    if (parentIds.size > 1) {
      throw new ApiError('CONFLICT_STATE', '排序只能在同一層之內進行。')
    }

    const slots = moved.map((i) => i.sortOrder).sort((a, b) => a - b)
    moved.forEach((item, index) => { item.sortOrder = slots[index] })

    await saveMenu(menuKey, items)
  },

  /** 升／降一層（promote：newParentId=null；demote：newParentId=某個同選單的頂層項目）。 */
  async changeParent(id: number, newParentId: number | null, _userId: number): Promise<void> {
    for (const menuKey of ['main', 'footer'] as MenuKey[]) {
      const items = await loadMenu(menuKey)
      const item = items.find((i) => i.id === id)
      if (!item) continue

      if (newParentId === id) throw new ApiError('VALIDATION_FORMAT', '不能把項目移到自己底下。')

      if (newParentId === null) {
        item.parentId = null
        item.depth = 1
      } else {
        if (items.some((i) => i.parentId === id)) {
          throw new ApiError('VALIDATION_RANGE', '這個項目底下還有子項目，最多兩層，無法再往下移一層。')
        }
        const parent = findItem(items, newParentId)
        if (parent.depth !== 1) throw new ApiError('VALIDATION_RANGE', '最多兩層，目標項目本身已經是子層。')
        item.parentId = parent.id
        item.depth = 2
      }
      item.sortOrder = items.filter((i) => i.parentId === item.parentId && i.id !== id).length

      await saveMenu(menuKey, items)
      return
    }
    throw new ApiError('NOT_FOUND', `找不到選單項目 #${id}。`)
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
