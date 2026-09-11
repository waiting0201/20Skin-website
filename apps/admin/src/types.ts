// 後台共用型別。
//
// 命名對齊 docs/08-database.md（欄位為 camelCase 版本，正式 API 契約見
// docs/10-api.md §2「請求與回應一律 camelCase」）。這一份是九個內容模型
// 共用的「形狀」，單元專屬欄位另見 src/units/*.ts。

/** 九個內容模型的單元代號。逐字對應 docs/10-api.md §3.3 的 `{unit}` 與權限碼前綴，不做單複數轉換。 */
export type UnitKey =
  | 'treatment'
  | 'doctor'
  | 'concern'
  | 'article'
  | 'case'
  | 'faq'
  | 'clinic'
  | 'page'
  | 'term'

export const UNIT_KEYS: UnitKey[] = [
  'treatment',
  'doctor',
  'concern',
  'article',
  'case',
  'faq',
  'clinic',
  'page',
  'term',
]

/** docs/11-backend-design.md §7：狀態只有四個，「已排程」是推導出來的顯示狀態，不是第五個值。 */
export type ContentStatus = 1 | 2 | 3 | 4

export const STATUS_LABEL: Record<ContentStatus, string> = {
  1: '草稿',
  2: '送審中',
  3: '已發布',
  4: '已下架',
}

/** docs/08-database.md §C-9：分類與標籤的四種型別。 */
export type TermType = 1 | 2 | 3 | 4
export const TERM_TYPE_LABEL: Record<TermType, string> = {
  1: '療程分類',
  2: '文章分類',
  3: 'FAQ 分類',
  4: '文章標籤',
}

/** docs/08-database.md §A-2：五個角色，種子資料，IsSystem=1。 */
export type RoleCode = 'SuperAdmin' | 'Editor' | 'Doctor' | 'Marketing' | 'Reviewer'

export const ROLE_LABEL: Record<RoleCode, string> = {
  SuperAdmin: '超級管理員',
  Editor: '內容編輯',
  Doctor: '醫師',
  Marketing: '行銷',
  Reviewer: '審核者',
}

/** docs/08-database.md §B-4，共用 SEO 區塊。九個模型的編輯畫面底部統一內嵌。 */
export interface SeoMeta {
  seoTitle: string | null
  metaDescription: string | null
  ogImageMediaId: number | null
  ogImageUrl: string | null
  canonicalOverride: string | null
  /** 文章標籤種子為 true；與 includeInSitemap 是兩件事（08 §B-4）。 */
  noIndex: boolean
  structuredDataOverride: string | null
  /** 40–60 字直答式段落，docs/03-seo-geo.md GEO 策略落地欄位。 */
  aiSummary: string | null
}

export function emptySeo(): SeoMeta {
  return {
    seoTitle: null,
    metaDescription: null,
    ogImageMediaId: null,
    ogImageUrl: null,
    canonicalOverride: null,
    noIndex: false,
    structuredDataOverride: null,
    aiSummary: null,
  }
}

/** docs/08-database.md §D `ContentRelations` 攤平後的顯示形狀。 */
export interface RelationItem {
  /** 對方那筆 ContentItems.Id */
  id: number
  title: string
  sortOrder: number
  /** 唯一用途：困擾頁「建議療程」的推薦理由（RelationType=5）。 */
  note?: string | null
}

/** docs/08-database.md §B-1 `ContentItems` 的共同欄位。 */
export interface ContentItemBase {
  id: number
  contentType: UnitKey
  slug: string | null
  /** 完整路徑，FAQ 為 null（不產生獨立網址，08 §C-6）。 */
  urlPath: string | null
  /** FAQ 的「問題」也放這裡。 */
  title: string
  status: ContentStatus
  /** 排程發布：最早生效時間。不是精確時間，見 docs/11 §7。 */
  publishAt: string | null
  /** 定時下架。 */
  unpublishAt: string | null
  sortOrder: number
  includeInSitemap: boolean
  /** 系統頁與系統分類：不可刪、不可改 slug。 */
  isSystemLocked: boolean
  /** 醫師角色「自己的內容」判定依據（doctor／article 適用）。 */
  ownerUserId: number | null
  createdByUserId: number | null
  updatedByUserId: number | null
  createdAt: string
  updatedAt: string
}

/** 一筆內容的完整編輯形狀：共同欄位 ＋ 單元專屬欄位 ＋ 關聯 ＋ SEO。 */
export interface AdminRecord extends ContentItemBase {
  /** 單元專屬欄位，鍵對應該單元 UnitDefinition.fields[].key。 */
  fields: Record<string, unknown>
  /** 關聯，鍵對應該單元 UnitDefinition.relations[].key。 */
  relations: Record<string, RelationItem[]>
  seo: SeoMeta
}

export interface PagedResult<T> {
  items: T[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}

export interface ListQuery {
  page?: number
  pageSize?: number
  keyword?: string
  status?: ContentStatus
  categoryId?: number
}

/** docs/08-database.md §B-3。 */
export type ReviewStatus = 1 | 2 | 3 // 待審／核准／退回

export interface ReviewItem {
  id: number
  contentItemId: number
  unit: UnitKey
  title: string
  submittedByUserId: number
  submittedByName: string
  submittedAt: string
  status: ReviewStatus
  decidedByUserId: number | null
  decidedAt: string | null
  decisionNote: string | null
  /** 送審時掃出的高風險字詞命中結果（docs/02-backend-cms.md §5）。 */
  riskFlags: string[]
}

export interface CurrentUser {
  id: number
  userName: string
  displayName: string
  roles: RoleCode[]
  isSuperAdmin: boolean
  /** 「醫師」角色綁定自己的個人頁用（docs/08 §A-1）。 */
  doctorId: number | null
  mustChangePassword: boolean
  twoFactorEnabled: boolean
}

/** 前台可見性顯示用（docs/11-backend-design.md §7 的推導規則，不是資料庫欄位）。 */
export function derivedDisplayStatus(record: Pick<ContentItemBase, 'status' | 'publishAt'>): string {
  if (record.status === 3 && record.publishAt && new Date(record.publishAt).getTime() > Date.now()) {
    return '已排程'
  }
  return STATUS_LABEL[record.status]
}
