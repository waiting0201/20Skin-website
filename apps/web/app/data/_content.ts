// 前台內容的取值層（docs/09-frontend.md §3）。
//
// ```
// 資料庫 ──Dapper／唯讀──▶ API 公開端點 ──▶ 這裡 ──▶ app/data/*.ts ──▶ 頁面
// ```
//
// 🔴 **2026-09-15 起是執行期取值，不再是建置期內聯。**
//    在那之前這裡是 `import treatmentsJson from '~~/content/treatments.json'`，
//    由 Vite 在建置期內聯，執行期不發生任何讀取。改成即時算繪之後，
//    同一批資料改由 API 在**請求當下**取得 —— 院方按下發布，下一個請求就看得到。
//
// ⚠️ **這裡只做「取值與查找」，不做內容判斷。** 每個單元的形狀由各自的 data/*.ts
//    組出來，那是前台的契約；這支只負責把回應變成可查的索引。
//
// 🔴 **每個請求只取一次。** 同一頁常常有好幾個模組都要 `term`
//    （療程要分類、文章要標籤、FAQ 要分類）—— 沒有這層去重的話，
//    一次算繪會對同一支端點發三、四次請求。
//    去重的範圍是**單一請求**，掛在 `useNuxtApp()` 上；掛在模組層級會變成
//    跨請求共用，那等於又回到「內容要等重啟才更新」。

/** 一筆內容的快照形狀，逐欄對應 ContentHandler.SaveVersionAsync 產生的 JSON。 */
export interface ContentRecord {
  id: number
  unit: string
  contentType: number
  slug: string | null
  urlPath: string | null
  title: string
  summary: string | null
  sortOrder: number
  includeInSitemap: boolean
  fields: Record<string, unknown>
  seo: Record<string, unknown> | null
  relations: RelationRecord[]
  updatedAt: string
}

export interface RelationRecord {
  relationType: number
  toContentItemId: number
  sortOrder: number
  note: string | null
  toSlug: string | null
  toUrlPath: string | null
  toTitle: string | null
  /** 指向草稿的關聯照樣輸出 —— 由使用端決定要不要渲染成連結。 */
  toIsPublished: boolean
}

/** 內嵌圖片欄位（docs/08 §0 決策四）。 */
export interface ContentImage {
  blobPath: string
  url: string
  alt: string | null
  width: number | null
  height: number | null
  variants: string | null
}

/** 九個內容單元的代號，對應 API 的 `GET /{unit}`。 */
export const UNIT = {
  treatment: 'treatment',
  doctor: 'doctor',
  concern: 'concern',
  article: 'article',
  case: 'case',
  faq: 'faq',
  clinic: 'clinic',
  page: 'page',
  term: 'term',
} as const

export type UnitName = (typeof UNIT)[keyof typeof UNIT]

/**
 * 取某個單元的全部可見內容。**同一個請求內只會真的取一次。**
 *
 * ⚠️ 文章不要用這一支 —— 它有 1100 筆，列表請用 `articlePage()` 分頁，
 *    內頁請用 `contentByPath()` 直接取那一筆。
 */
export function loadUnit(unit: UnitName): Promise<ContentRecord[]> {
  const nuxtApp = useNuxtApp() as unknown as { _contentCache?: Map<string, Promise<ContentRecord[]>> }
  nuxtApp._contentCache ??= new Map()

  const cached = nuxtApp._contentCache.get(unit)
  if (cached) return cached

  const pending = unitRecords(unit)
  nuxtApp._contentCache.set(unit, pending)
  return pending
}

/**
 * 前台用得到的全站設定。
 *
 * 🔴 **只有 `GET /site-settings/public` 回的那幾個鍵，不是整張 SiteSettings。**
 *    建置期匯出時前台拿得到全部 16 個鍵（那是伺服器端讀資料庫），其中包含
 *    `contact.recipientEmail` 這種**不能外露**的。改成執行期取值之後那條路不能照搬 ——
 *    公開端點回什麼就是對全世界公開什麼。需要新的鍵請到 API 那邊逐個加，
 *    不要改成「回傳整張表」。
 */
export interface PublicSiteSettings {
  siteName: string
  siteDescription: string
  aiFaqEnabled: boolean
  aiFaqPanelTitle: string
  aiFaqWelcomeText: string
  aiFaqHandoffBookingUrl: string
  aiFaqHandoffLineUrl: string
}

const EMPTY_SETTINGS: PublicSiteSettings = {
  siteName: '',
  siteDescription: '',
  aiFaqEnabled: false,
  aiFaqPanelTitle: 'AI 線上諮詢',
  aiFaqWelcomeText: '',
  aiFaqHandoffBookingUrl: '',
  aiFaqHandoffLineUrl: '',
}

/** 全站設定。同樣是每個請求取一次。取不到時回預設值，不讓整頁算繪失敗。 */
export function loadSite(): Promise<PublicSiteSettings> {
  const nuxtApp = useNuxtApp() as unknown as { _siteCache?: Promise<PublicSiteSettings> }
  nuxtApp._siteCache ??= apiGet<PublicSiteSettings>('/site-settings/public')
    .then((v) => v ?? EMPTY_SETTINGS)
  return nuxtApp._siteCache
}

/** 關聯型別（docs/08 §D）。 */
export const REL = {
  treatmentToDoctor: 1,
  treatmentToConcern: 2,
  treatmentToArticle: 3,
  treatmentToFaq: 4,
  concernToTreatment: 5,
  concernToFaq: 6,
  concernToArticle: 7,
  clinicToDoctor: 8,
  clinicToTreatment: 9,
  clinicToFaq: 10,
  articleToTag: 11,
  pageToFeatured: 12,
  doctorToConcern: 13,
  concernToConcern: 14,
} as const

/** 分類與標籤的型別（docs/08 §C-9）。 */
export const TERM = { treatmentCategory: 1, articleCategory: 2, faqCategory: 3, articleTag: 4 } as const

/** slug → 那一筆。⚠️ 分類與標籤不要用這個，見 `termBy`。 */
export const bySlug = <T extends ContentRecord>(rows: T[]) =>
  new Map(rows.filter((r) => r.slug).map((r) => [r.slug as string, r]))

/** 分類與標籤要用「型別＋slug」查，光看 slug 會撞名（FAQ 分類與文章標籤都有 aftercare）。 */
export const termBy = (terms: ContentRecord[], type: number, slug: string): ContentRecord | undefined =>
  terms.find((t) => t.slug === slug && t.fields.termType === type)

export const termsOf = (terms: ContentRecord[], type: number): ContentRecord[] =>
  terms.filter((t) => t.fields.termType === type).sort((a, b) => a.sortOrder - b.sortOrder)

/** 取出某筆內容的某一種關聯，已依 sortOrder 排序。 */
export const relationsOf = (record: ContentRecord | undefined, type: number): RelationRecord[] =>
  (record?.relations ?? []).filter((r) => r.relationType === type).sort((a, b) => a.sortOrder - b.sortOrder)

/**
 * 反向查關聯。雙向關聯一律單向存（docs/08 §D），所以「這位醫師出現在哪些療程」
 * 只能從療程那一端掃回來 —— 不是資料缺漏，是刻意的單一來源。
 */
export const inboundRelations = (rows: ContentRecord[], type: number, toSlug: string): ContentRecord[] =>
  rows.filter((r) => r.relations.some((x) => x.relationType === type && x.toSlug === toSlug))

/** 區塊 JSON 欄位。存進資料庫時是字串，讀出來要解析（docs/09 §8）。 */
export function parseBlocks<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value.length === 0) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

/** 內嵌圖片 → 前台慣用的 { src, alt, width, height }。 */
export function img(value: unknown): { src: string; alt: string; width: number; height: number } | undefined {
  const image = value as ContentImage | null | undefined
  if (!image?.url) return undefined
  return {
    src: image.url,
    alt: image.alt ?? '',
    width: image.width ?? 0,
    height: image.height ?? 0,
  }
}
