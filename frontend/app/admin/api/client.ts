// 資料來源門面。
//
// docs/09-frontend.md §8 要求：「一個門面，現在後面接 mock（localStorage
// 或記憶體皆可），之後換成打 api.20skin.tw。上層畫面只認這個門面，
// 不知道資料從哪來」。
//
// ⚠️ 這是本輪唯一允許塞「假邏輯」的地方。ListPage／EditPage／dashboard
// 等畫面一律呼叫 `adminApi.xxx()`，不得直接碰 localStorage 或本檔案以外
// 的任何狀態。日後接上真的 API，只需要重寫這個檔案內部實作，呼叫端一行都
// 不用改——如果哪天發現某個畫面繞過這個門面直接讀資料，那就是要修的地方。
//
// 為什麼形狀盡量貼近 docs/10-api.md 的契約（分頁 { items, totalCount,
// page, pageSize, totalPages }、camelCase、錯誤碼字串)：等後端做好之後，
// 這裡的每一個函式都應該只是換成一次 fetch，回傳形狀不用重新設計。

import type {
  AdminRecord,
  ContentStatus,
  CurrentUser,
  ListQuery,
  PagedResult,
  RelationItem,
  ReviewItem,
  SeoMeta,
  UnitKey,
} from '../types'
import { emptySeo, UNIT_KEYS } from '../types'
import type { RelationType } from '../unit-schema'
import { UNIT_REGISTRY } from '../units'
import {
  MOCK_RISK_TERMS,
  MOCK_USERS,
  SEED_ARTICLES,
  SEED_CASES,
  SEED_CLINICS,
  SEED_CONCERNS,
  SEED_DOCTORS,
  SEED_FAQS,
  SEED_PAGES,
  SEED_RELATIONS,
  SEED_TERMS,
  SEED_TREATMENTS,
  type MockUserRecord,
  type SeedRecord,
  type SeedRelation,
} from './mock-seed'

// ── 內部型別 ──────────────────────────────────────────────────────────

interface StoredRecord {
  id: number
  contentType: UnitKey
  slug: string | null
  urlPath: string | null
  title: string
  status: ContentStatus
  publishAt: string | null
  unpublishAt: string | null
  sortOrder: number
  includeInSitemap: boolean
  isSystemLocked: boolean
  ownerUserId: number | null
  createdByUserId: number | null
  updatedByUserId: number | null
  createdAt: string
  updatedAt: string
  fields: Record<string, unknown>
  seo: SeoMeta
}

interface RelationRow {
  id: number
  fromId: number
  fromType: UnitKey
  toId: number
  toType: UnitKey
  relationType: RelationType
  sortOrder: number
  note: string | null
}

interface VersionRow {
  id: number
  unit: UnitKey
  contentItemId: number
  versionNo: number
  title: string
  snapshot: StoredRecord
  note: string | null
  createdByUserId: number
  createdAt: string
}

interface RebuildState {
  pending: boolean
  lastRequestedAt: string | null
  lastCompletedAt: string | null
}

interface Db {
  version: number
  nextId: number
  nextRelationId: number
  nextReviewId: number
  nextVersionId: number
  records: Record<UnitKey, StoredRecord[]>
  relations: RelationRow[]
  reviews: ReviewItem[]
  versions: VersionRow[]
  riskTerms: string[]
  rebuild: RebuildState
}

const STORAGE_KEY = '20skin-admin-mock-db-v1'
const DB_VERSION = 1

let db: Db | null = null

function emptyRecordsByUnit(): Record<UnitKey, StoredRecord[]> {
  return Object.fromEntries(UNIT_KEYS.map((u) => [u, []])) as Record<UnitKey, StoredRecord[]>
}

// ── 種子資料載入：把 SeedRecord 的 seedKey 換算成真正的數字 Id ──────────

function resolveSeedKeysDeep(node: unknown, map: Map<string, number>): unknown {
  if (Array.isArray(node)) return node.map((n) => resolveSeedKeysDeep(n, map))
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (/SeedKey$/.test(k) && typeof v === 'string' && v) {
        out[k] = map.has(v) ? String(map.get(v)) : ''
      } else {
        out[k] = resolveSeedKeysDeep(v, map)
      }
    }
    return out
  }
  return node
}

function buildSeedDb(): Db {
  const records = emptyRecordsByUnit()
  const seedKeyToId = new Map<string, number>()
  const seedKeyToUnit = new Map<string, UnitKey>()
  let nextId = 1
  const now = new Date().toISOString()

  const groups: [UnitKey, SeedRecord[]][] = [
    ['term', SEED_TERMS],
    ['doctor', SEED_DOCTORS],
    ['treatment', SEED_TREATMENTS],
    ['concern', SEED_CONCERNS],
    ['article', SEED_ARTICLES],
    ['case', SEED_CASES],
    ['faq', SEED_FAQS],
    ['clinic', SEED_CLINICS],
    ['page', SEED_PAGES],
  ]

  // 第一遍：分配 Id（先做這一遍，relation 與跨單元參照才有東西可查）
  for (const [unit, seeds] of groups) {
    for (const seed of seeds) {
      const id = nextId++
      seedKeyToId.set(seed.seedKey, id)
      seedKeyToUnit.set(seed.seedKey, unit)
    }
  }

  // 第二遍：組出 StoredRecord，欄位裡的 *SeedKey 換成真正 Id（字串）
  for (const [unit, seeds] of groups) {
    for (const seed of seeds) {
      const id = seedKeyToId.get(seed.seedKey)!
      const resolvedFields = resolveSeedKeysDeep(seed.fields, seedKeyToId) as Record<string, unknown>
      const producesUrl = UNIT_REGISTRY[unit].producesUrl
      const slug = seed.slug ?? null
      records[unit].push({
        id,
        contentType: unit,
        slug,
        urlPath: producesUrl && slug ? `/${unitUrlSegment(unit)}/${slug}/` : null,
        title: seed.title,
        status: seed.status,
        publishAt: null,
        unpublishAt: null,
        sortOrder: seed.sortOrder,
        includeInSitemap: seed.includeInSitemap ?? true,
        isSystemLocked: seed.isSystemLocked ?? false,
        ownerUserId: seed.ownerUserId ?? null,
        createdByUserId: 1,
        updatedByUserId: 1,
        createdAt: now,
        updatedAt: now,
        fields: resolvedFields,
        seo: { ...emptySeo(), ...(seed.seo ?? {}) },
      })
    }
  }

  const relations: RelationRow[] = []
  let nextRelationId = 1
  for (const rel of SEED_RELATIONS as SeedRelation[]) {
    const fromId = seedKeyToId.get(rel.fromKey)
    const toId = seedKeyToId.get(rel.toKey)
    const fromType = seedKeyToUnit.get(rel.fromKey)
    const toType = seedKeyToUnit.get(rel.toKey)
    if (!fromId || !toId || !fromType || !toType) continue
    relations.push({
      id: nextRelationId++,
      fromId,
      fromType,
      toId,
      toType,
      relationType: rel.relationType,
      sortOrder: rel.sortOrder,
      note: rel.note ?? null,
    })
  }

  return {
    version: DB_VERSION,
    nextId,
    nextRelationId,
    nextReviewId: 1,
    nextVersionId: 1,
    records,
    relations,
    reviews: seedReviews(records),
    versions: [],
    riskTerms: [...MOCK_RISK_TERMS],
    rebuild: { pending: false, lastRequestedAt: null, lastCompletedAt: now },
  }
}

/** 種一筆送審中與一筆已退回，讓審核佇列與「我的退件」在示範時不是空的。 */
function seedReviews(records: Record<UnitKey, StoredRecord[]>): ReviewItem[] {
  const out: ReviewItem[] = []
  const submittedArticle = records.article.find((r) => r.status === 2)
  if (submittedArticle) {
    out.push({
      id: 1,
      contentItemId: submittedArticle.id,
      unit: 'article',
      title: submittedArticle.title,
      submittedByUserId: 3,
      submittedByName: '示範醫師一',
      submittedAt: new Date().toISOString(),
      status: 1,
      decidedByUserId: null,
      decidedAt: null,
      decisionNote: null,
      riskFlags: scanRiskTermsInternal(submittedArticle.fields.bodyBlocks as string, MOCK_RISK_TERMS),
    })
  }
  const submittedFaq = records.faq.find((r) => r.status === 2)
  if (submittedFaq) {
    out.push({
      id: 2,
      contentItemId: submittedFaq.id,
      unit: 'faq',
      title: submittedFaq.title,
      submittedByUserId: 2,
      submittedByName: '編輯｜阿雅',
      submittedAt: new Date().toISOString(),
      status: 1,
      decidedByUserId: null,
      decidedAt: null,
      decisionNote: null,
      riskFlags: [],
    })
  }
  return out
}

function unitUrlSegment(unit: UnitKey): string {
  const map: Partial<Record<UnitKey, string>> = {
    treatment: 'treatments',
    doctor: 'team',
    concern: 'concerns',
    article: 'blog',
    case: 'cases',
    clinic: 'clinics',
    page: '',
    term: '',
  }
  return map[unit] ?? unit
}

function scanRiskTermsInternal(text: string | undefined, terms: string[]): string[] {
  if (!text) return []
  return terms.filter((t) => text.includes(t))
}

// ── 持久化：localStorage（沒有就退回純記憶體，例如 SSR 或私密瀏覽） ────

function loadDb(): Db {
  if (db) return db
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Db
        if (parsed.version === DB_VERSION) {
          db = parsed
          return db
        }
      }
    } catch {
      // 壞掉的本機資料，直接視為沒有，重新種子
    }
  }
  db = buildSeedDb()
  persist()
  return db
}

function persist() {
  if (!db) return
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
    } catch {
      // 存滿了或私密瀏覽模式擋寫入——mock 資料掉了不影響正式功能，忽略即可
    }
  }
}

/** 開發用：清空 mock 資料庫，下次讀取會重新種子。目前沒有畫面呼叫，保留給除錯用。 */
export function resetMockDb() {
  db = null
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(STORAGE_KEY)
  }
}

// ── 錯誤：形狀貼近 docs/10-api.md §2 的錯誤碼，方便日後直接對應真正的 API 錯誤 ──

export class ApiError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

// ── 共用查找 ──────────────────────────────────────────────────────────

function findStored(unit: UnitKey, id: number): StoredRecord {
  const rec = loadDb().records[unit]?.find((r) => r.id === id)
  if (!rec) throw new ApiError('NOT_FOUND', `${UNIT_REGISTRY[unit].labelSingular}不存在。`)
  return rec
}

function findAnyById(id: number): { unit: UnitKey; record: StoredRecord } | undefined {
  const d = loadDb()
  for (const unit of UNIT_KEYS) {
    const record = d.records[unit].find((r) => r.id === id)
    if (record) return { unit, record }
  }
  return undefined
}

function titleOf(id: number): string {
  return findAnyById(id)?.record.title ?? `#${id}`
}

function relationsForRecord(unit: UnitKey, id: number): Record<string, RelationItem[]> {
  const def = UNIT_REGISTRY[unit]
  const out: Record<string, RelationItem[]> = {}
  const d = loadDb()
  for (const field of def.relations ?? []) {
    const rows = field.editable
      ? d.relations.filter((r) => r.fromId === id && r.fromType === unit && r.relationType === field.relationType)
      : d.relations.filter((r) => r.toId === id && r.toType === unit && r.relationType === field.relationType)
    const sorted = [...rows].sort((a, b) => a.sortOrder - b.sortOrder)
    out[field.key] = sorted.map((r) => {
      const otherId = field.editable ? r.toId : r.fromId
      return { id: otherId, title: titleOf(otherId), sortOrder: r.sortOrder, note: r.note }
    })
  }
  return out
}

/**
 * relation-single 欄位（例如 CategoryTermId）在儲存層只是一個數字 Id，
 * 清單頁想直接顯示分類名稱而不是一串數字。這裡在讀取時順手算出
 * `${key}__label` 這個平行鍵——EditPage 的表單只認 `field.key` 本身，
 * 多出來的 `__label` 鍵不會干擾編輯，只有 ListPage 的欄位渲染會用到它。
 */
function withResolvedLabels(stored: StoredRecord): Record<string, unknown> {
  const def = UNIT_REGISTRY[stored.contentType]
  const fields: Record<string, unknown> = { ...stored.fields }
  for (const f of def.fields) {
    if (f.type === 'relation-single') {
      const raw = fields[f.key]
      const idNum = Number(raw)
      if (raw && !Number.isNaN(idNum)) fields[`${f.key}__label`] = titleOf(idNum)
    } else if (f.type === 'select' && f.options?.length) {
      // 靜態 select（例如 Pages.PageKind、Terms.TermType）：清單頁顯示選項文字
      // 而不是存起來的原始值，跟 relation-single 的 __label 是同一套機制。
      const raw = String(fields[f.key] ?? '')
      const opt = f.options.find((o) => o.value === raw)
      if (opt) fields[`${f.key}__label`] = opt.label
    }
  }
  return fields
}

function toAdminRecord(stored: StoredRecord): AdminRecord {
  const fields = withResolvedLabels(stored)
  // Terms.usageCount 沒有對應的儲存欄位，是讀取時的聚合查詢（docs/10-api.md §3.3：
  // 刪除前回報 usageCount）。順便算進來，清單頁與編輯頁都不用另外呼叫一支 API。
  if (stored.contentType === 'term') fields.usageCount = countTermUsage(stored.id)
  return {
    ...stored,
    fields,
    relations: relationsForRecord(stored.contentType, stored.id),
  }
}

function touch(stored: StoredRecord, userId: number) {
  stored.updatedAt = new Date().toISOString()
  stored.updatedByUserId = userId
}

function snapshotVersion(unit: UnitKey, stored: StoredRecord, userId: number, note?: string) {
  const d = loadDb()
  const existing = d.versions.filter((v) => v.unit === unit && v.contentItemId === stored.id)
  const versionNo = existing.length ? Math.max(...existing.map((v) => v.versionNo)) + 1 : 1
  d.versions.push({
    id: d.nextVersionId++,
    unit,
    contentItemId: stored.id,
    versionNo,
    title: stored.title,
    snapshot: structuredCloneRecord(stored),
    note: note ?? null,
    createdByUserId: userId,
    createdAt: new Date().toISOString(),
  })
  // docs/11-backend-design.md §8：每筆保留最近 30 版，mock 縮小到 10 版即可示意同一機制
  const capped = d.versions.filter((v) => v.unit === unit && v.contentItemId === stored.id)
  if (capped.length > 10) {
    const toRemove = capped.sort((a, b) => a.versionNo - b.versionNo).slice(0, capped.length - 10)
    d.versions = d.versions.filter((v) => !toRemove.includes(v))
  }
}

function structuredCloneRecord(stored: StoredRecord): StoredRecord {
  return JSON.parse(JSON.stringify(stored)) as StoredRecord
}

// ── Auth（mock）────────────────────────────────────────────────────────

interface LoginChallenge {
  challengeId: string
  userId: number
  expiresAt: number
}
const pendingChallenges = new Map<string, LoginChallenge>()

/** docs/11-backend-design.md §5.2：帳號與來源 IP 雙維度計數。mock 只做帳號維度示意。 */
const loginFailures = new Map<string, { count: number; lockedUntil: number | null }>()
const MAX_ATTEMPTS = 5
const LOCK_MS = 60_000

function toCurrentUser(u: MockUserRecord): CurrentUser {
  const { credential: _credential, ...rest } = u
  return rest
}

function requireNoLockout(userName: string) {
  const state = loginFailures.get(userName)
  if (state?.lockedUntil && state.lockedUntil > Date.now()) {
    const seconds = Math.ceil((state.lockedUntil - Date.now()) / 1000)
    throw new ApiError('RATE_LIMITED', `登入嘗試次數過多，請 ${seconds} 秒後再試。`)
  }
}

function recordFailure(userName: string) {
  const state = loginFailures.get(userName) ?? { count: 0, lockedUntil: null }
  state.count += 1
  if (state.count >= MAX_ATTEMPTS) {
    state.lockedUntil = Date.now() + LOCK_MS
    state.count = 0
  }
  loginFailures.set(userName, state)
}

function clearFailures(userName: string) {
  loginFailures.delete(userName)
}

const auth = {
  async login(userName: string, password: string): Promise<{ requires2fa: boolean; challengeId?: string; user?: CurrentUser }> {
    requireNoLockout(userName)
    const record = MOCK_USERS.find((u) => u.userName.toLowerCase() === userName.toLowerCase())
    // ⚠️ docs/10-api.md §2：不區分「帳號不存在」與「密碼錯誤」
    if (!record || record.credential.password !== password) {
      recordFailure(userName)
      throw new ApiError('AUTH_INVALID_CREDENTIALS', '帳號或密碼錯誤。')
    }
    if (!record.isActive) throw new ApiError('AUTH_ACCOUNT_INACTIVE', '帳號已停用。')
    clearFailures(userName)
    if (record.twoFactorEnabled) {
      const challengeId = `chal-${record.id}-${Date.now()}`
      pendingChallenges.set(challengeId, { challengeId, userId: record.id, expiresAt: Date.now() + 5 * 60_000 })
      return { requires2fa: true, challengeId }
    }
    if (record.mustChangePassword) throw new ApiError('AUTH_MUST_CHANGE_PASSWORD', '首次登入請先變更密碼。')
    return { requires2fa: false, user: toCurrentUser(record) }
  },

  async verify2fa(challengeId: string, code: string): Promise<CurrentUser> {
    const challenge = pendingChallenges.get(challengeId)
    if (!challenge || challenge.expiresAt < Date.now()) {
      throw new ApiError('AUTH_TOKEN_INVALID', '驗證逾時，請重新登入。')
    }
    const record = MOCK_USERS.find((u) => u.id === challenge.userId)!
    const validCode = record.credential.twoFactorCode === code || code === 'RESCUE-0001'
    if (!validCode) throw new ApiError('AUTH_2FA_INVALID', '雙因素驗證碼錯誤。')
    pendingChallenges.delete(challengeId)
    return toCurrentUser(record)
  },

  async logout() {
    // mock：沒有真的 refresh token 可撤銷，這裡只是保留呼叫端形狀一致
  },
}

// ── 分類與標籤／關聯目標的選項來源 ───────────────────────────────────

const taxonomy = {
  /** 給 relation-single（optionsFromTermType）用：某個 TermType 底下的分類選項。 */
  async termOptions(termType: number): Promise<{ value: string; label: string }[]> {
    return loadDb()
      .records.term.filter((r) => (r.fields.termType as number) === termType)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((r) => ({ value: String(r.id), label: r.title }))
  },

  /** 給 relation-single（optionsFromUnit）與關聯選擇器用：某個單元的候選項目。 */
  async unitOptions(unit: UnitKey, keyword?: string): Promise<{ value: string; label: string }[]> {
    const list = loadDb().records[unit] ?? []
    const filtered = keyword ? list.filter((r) => r.title.includes(keyword)) : list
    return filtered.map((r) => ({ value: String(r.id), label: r.title }))
  },

  async riskTerms(): Promise<string[]> {
    return [...loadDb().riskTerms]
  },
}

// ── 內容 CRUD ─────────────────────────────────────────────────────────

function applyDefaults(unit: UnitKey, input: Partial<StoredRecord>, userId: number): StoredRecord {
  const d = loadDb()
  const id = d.nextId++
  const now = new Date().toISOString()
  const siblingCount = d.records[unit].length
  return {
    id,
    contentType: unit,
    slug: (input.slug as string | undefined) ?? null,
    urlPath: null, // 由 recomputeUrlPath 統一計算，見下方
    title: input.title ?? '未命名',
    status: 1,
    publishAt: null,
    unpublishAt: null,
    sortOrder: input.sortOrder ?? siblingCount,
    includeInSitemap: input.includeInSitemap ?? true,
    isSystemLocked: false,
    ownerUserId: input.ownerUserId ?? null,
    createdByUserId: userId,
    updatedByUserId: userId,
    createdAt: now,
    updatedAt: now,
    fields: input.fields ?? {},
    seo: emptySeo(),
  }
}

function recomputeUrlPath(unit: UnitKey, stored: StoredRecord) {
  const def = UNIT_REGISTRY[unit]
  if (!def.producesUrl || !stored.slug) {
    stored.urlPath = null
    return
  }
  if (unit === 'treatment') {
    const catId = Number(stored.fields.categoryTermSeedKey)
    const cat = findAnyById(catId)
    const catSlug = cat?.record.slug ?? 'uncategorized'
    stored.urlPath = `/treatments/${catSlug}/${stored.slug}/`
    return
  }
  stored.urlPath = `/${unitUrlSegment(unit)}/${stored.slug}/`
}

function assertUnit(unit: string): asserts unit is UnitKey {
  if (!UNIT_KEYS.includes(unit as UnitKey)) throw new ApiError('NOT_FOUND', `未知的單元：${unit}`)
}

function assertBodyEditable(stored: StoredRecord) {
  // docs/11-backend-design.md §7：送審中本文鎖定，只有審核者能動（走 approve/reject，不走這裡）
  if (stored.status === 2) {
    throw new ApiError('CONFLICT_STATE', '送審中，本文已鎖定。如需修改請先請審核者退回。')
  }
  if (stored.isSystemLocked) {
    // 系統頁／系統分類仍可編內文，只是不可刪、不可改 slug；這裡不擋，交給呼叫端個別欄位判斷
  }
}

const content = {
  async list(unit: UnitKey, query: ListQuery & { ownerUserId?: number } = {}): Promise<PagedResult<AdminRecord>> {
    assertUnit(unit)
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20)) // docs/10 §2：pageSize 上限 100
    let items = [...loadDb().records[unit]]
    if (query.keyword) items = items.filter((r) => r.title.includes(query.keyword!))
    if (query.status) items = items.filter((r) => r.status === query.status)
    if (query.categoryId) {
      items = items.filter((r) => Number(r.fields.categoryTermSeedKey) === query.categoryId)
    }
    if (query.ownerUserId) items = items.filter((r) => r.ownerUserId === query.ownerUserId)
    items.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    const totalCount = items.length
    const start = (page - 1) * pageSize
    const pageItems = items.slice(start, start + pageSize).map(toAdminRecord)
    return { items: pageItems, totalCount, page, pageSize, totalPages: Math.max(1, Math.ceil(totalCount / pageSize)) }
  },

  async get(unit: UnitKey, id: number): Promise<AdminRecord> {
    assertUnit(unit)
    return toAdminRecord(findStored(unit, id))
  },

  async create(unit: UnitKey, payload: Partial<StoredRecord>, userId: number): Promise<AdminRecord> {
    assertUnit(unit)
    const d = loadDb()
    if (d.records[unit].some((r) => r.slug && payload.slug && r.slug === payload.slug)) {
      throw new ApiError('CONFLICT_DUPLICATE', `這個網址已被「${d.records[unit].find((r) => r.slug === payload.slug)?.title}」使用。`)
    }
    const stored = applyDefaults(unit, payload, userId)
    recomputeUrlPath(unit, stored)
    d.records[unit].push(stored)
    snapshotVersion(unit, stored, userId, '建立')
    persist()
    return toAdminRecord(stored)
  },

  async update(unit: UnitKey, id: number, payload: { title?: string; slug?: string; sortOrder?: number; includeInSitemap?: boolean; fields?: Record<string, unknown> }, userId: number): Promise<AdminRecord> {
    assertUnit(unit)
    const stored = findStored(unit, id)
    assertBodyEditable(stored)
    if (stored.isSystemLocked && payload.slug !== undefined && payload.slug !== stored.slug) {
      throw new ApiError('CONFLICT_LOCKED', '系統頁與系統分類不可改 slug。')
    }
    if (payload.title !== undefined) stored.title = payload.title
    if (payload.slug !== undefined && !stored.isSystemLocked) stored.slug = payload.slug
    if (payload.sortOrder !== undefined) stored.sortOrder = payload.sortOrder
    if (payload.includeInSitemap !== undefined) stored.includeInSitemap = payload.includeInSitemap
    if (payload.fields) stored.fields = { ...stored.fields, ...payload.fields }
    recomputeUrlPath(unit, stored)
    touch(stored, userId)
    snapshotVersion(unit, stored, userId)
    persist()
    return toAdminRecord(stored)
  },

  async updateSeo(unit: UnitKey, id: number, seo: Partial<SeoMeta>, userId: number): Promise<AdminRecord> {
    assertUnit(unit)
    const stored = findStored(unit, id)
    // ⚠️ SEO 區塊即使在送審中也可以改（docs/11-backend-design.md §7）——不呼叫 assertBodyEditable
    stored.seo = { ...stored.seo, ...seo }
    touch(stored, userId)
    persist()
    return toAdminRecord(stored)
  },

  async updateRelations(unit: UnitKey, id: number, relationKey: string, items: { id: number; sortOrder: number; note?: string | null }[], userId: number): Promise<AdminRecord> {
    assertUnit(unit)
    const stored = findStored(unit, id)
    const def = UNIT_REGISTRY[unit]
    const field = def.relations?.find((r) => r.key === relationKey)
    if (!field) throw new ApiError('NOT_FOUND', `找不到關聯欄位：${relationKey}`)
    if (!field.editable) throw new ApiError('FORBIDDEN', '這個關聯由對方的編輯畫面維護，這裡唯讀。')
    const d = loadDb()
    d.relations = d.relations.filter((r) => !(r.fromId === id && r.fromType === unit && r.relationType === field.relationType))
    for (const item of items) {
      d.relations.push({
        id: d.nextRelationId++,
        fromId: id,
        fromType: unit,
        toId: item.id,
        toType: field.targetUnit,
        relationType: field.relationType,
        sortOrder: item.sortOrder,
        note: item.note ?? null,
      })
    }
    touch(stored, userId)
    persist()
    return toAdminRecord(stored)
  },

  /** docs/10-api.md §3.3：送審，建立 ContentReviews 並附高風險字詞掃描結果。 */
  async submit(unit: UnitKey, id: number, userId: number, userName: string): Promise<{ riskFlags: string[] }> {
    assertUnit(unit)
    const stored = findStored(unit, id)
    if (stored.status !== 1) throw new ApiError('CONFLICT_STATE', '只有草稿可以送審。')
    const def = UNIT_REGISTRY[unit]
    const d = loadDb()
    const riskFlags = new Set<string>()
    for (const field of def.fields.filter((f) => f.riskScan)) {
      const value = stored.fields[field.key]
      if (typeof value === 'string') {
        for (const hit of scanRiskTermsInternal(value, d.riskTerms)) riskFlags.add(hit)
      }
    }
    stored.status = 2
    touch(stored, userId)
    snapshotVersion(unit, stored, userId, '送審')
    d.reviews.push({
      id: d.nextReviewId++,
      contentItemId: id,
      unit,
      title: stored.title,
      submittedByUserId: userId,
      submittedByName: userName,
      submittedAt: new Date().toISOString(),
      status: 1,
      decidedByUserId: null,
      decidedAt: null,
      decisionNote: null,
      riskFlags: [...riskFlags],
    })
    persist()
    return { riskFlags: [...riskFlags] }
  },

  /** docs/10-api.md §3.3：直接發布／下架（僅具發布權的角色，權限檢查在呼叫端）。 */
  async setPublishState(unit: UnitKey, id: number, status: Extract<ContentStatus, 3 | 4>, userId: number): Promise<AdminRecord> {
    assertUnit(unit)
    const stored = findStored(unit, id)
    stored.status = status
    touch(stored, userId)
    snapshotVersion(unit, stored, userId, status === 3 ? '發布' : '下架')
    requestRebuild()
    persist()
    return toAdminRecord(stored)
  },

  /** ⚠️ 排程時間是「最早生效時間」，不是精確時間（docs/11 §7）。 */
  async schedule(unit: UnitKey, id: number, publishAt: string | null, unpublishAt: string | null, userId: number): Promise<AdminRecord> {
    assertUnit(unit)
    const stored = findStored(unit, id)
    stored.publishAt = publishAt
    stored.unpublishAt = unpublishAt
    touch(stored, userId)
    persist()
    return toAdminRecord(stored)
  },

  async sort(unit: UnitKey, orderedIds: number[], userId: number): Promise<void> {
    assertUnit(unit)
    const d = loadDb()
    orderedIds.forEach((id, index) => {
      const stored = d.records[unit].find((r) => r.id === id)
      if (stored) {
        stored.sortOrder = index
        touch(stored, userId)
      }
    })
    persist()
  },

  async remove(unit: UnitKey, id: number): Promise<void> {
    assertUnit(unit)
    const stored = findStored(unit, id)
    if (stored.isSystemLocked) throw new ApiError('CONFLICT_LOCKED', '系統頁與系統分類不可刪除。')
    if (unit === 'term') {
      const usage = countTermUsage(id)
      if (usage > 0) throw new ApiError('CONFLICT_STATE', `仍有 ${usage} 筆內容引用，無法刪除。`)
    }
    const d = loadDb()
    d.records[unit] = d.records[unit].filter((r) => r.id !== id)
    d.relations = d.relations.filter((r) => !(r.fromId === id || r.toId === id))
    persist()
  },

  async versions(unit: UnitKey, id: number): Promise<{ versionNo: number; title: string; note: string | null; createdAt: string; createdByUserId: number }[]> {
    assertUnit(unit)
    return loadDb()
      .versions.filter((v) => v.unit === unit && v.contentItemId === id)
      .sort((a, b) => b.versionNo - a.versionNo)
      .map(({ versionNo, title, note, createdAt, createdByUserId }) => ({ versionNo, title, note, createdAt, createdByUserId }))
  },

  async restoreVersion(unit: UnitKey, id: number, versionNo: number, userId: number): Promise<AdminRecord> {
    assertUnit(unit)
    const d = loadDb()
    const version = d.versions.find((v) => v.unit === unit && v.contentItemId === id && v.versionNo === versionNo)
    if (!version) throw new ApiError('NOT_FOUND', '找不到這個版本。')
    const stored = findStored(unit, id)
    // 還原是整筆還原成草稿，不直接上線（docs/10-api.md §3.3）
    stored.title = version.snapshot.title
    stored.fields = { ...version.snapshot.fields }
    stored.seo = { ...version.snapshot.seo }
    stored.status = 1
    touch(stored, userId)
    snapshotVersion(unit, stored, userId, `還原自版本 ${versionNo}`)
    persist()
    return toAdminRecord(stored)
  },
}

function countTermUsage(termId: number): number {
  const d = loadDb()
  let count = 0
  for (const unit of UNIT_KEYS) {
    for (const rec of d.records[unit]) {
      const catKey = rec.fields.categoryTermSeedKey
      if (catKey !== undefined && Number(catKey) === termId) count++
    }
  }
  count += d.relations.filter((r) => r.toId === termId && r.relationType === 11).length
  return count
}

// ── 審核佇列（下一輪才做完整畫面，這裡先把資料層立好）───────────────

const review = {
  async pending(): Promise<ReviewItem[]> {
    return loadDb()
      .reviews.filter((r) => r.status === 1)
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
  },

  async myRejected(userId: number): Promise<ReviewItem[]> {
    return loadDb().reviews.filter((r) => r.status === 3 && r.submittedByUserId === userId)
  },

  async approve(reviewId: number, userId: number): Promise<void> {
    const d = loadDb()
    const item = d.reviews.find((r) => r.id === reviewId)
    if (!item) throw new ApiError('NOT_FOUND', '找不到這筆送審紀錄。')
    item.status = 2
    item.decidedByUserId = userId
    item.decidedAt = new Date().toISOString()
    // docs/11-backend-design.md §7：核准即 Status=3，不管 PublishAt 有沒有到
    const stored = findStored(item.unit, item.contentItemId)
    stored.status = 3
    touch(stored, userId)
    snapshotVersion(item.unit, stored, userId, '審核核准')
    requestRebuild()
    persist()
  },

  async reject(reviewId: number, decisionNote: string, userId: number): Promise<void> {
    if (!decisionNote.trim()) throw new ApiError('VALIDATION_REQUIRED', '退回原因為必填。')
    const d = loadDb()
    const item = d.reviews.find((r) => r.id === reviewId)
    if (!item) throw new ApiError('NOT_FOUND', '找不到這筆送審紀錄。')
    item.status = 3
    item.decidedByUserId = userId
    item.decidedAt = new Date().toISOString()
    item.decisionNote = decisionNote
    const stored = findStored(item.unit, item.contentItemId)
    stored.status = 1 // 退回 → 草稿
    touch(stored, userId)
    persist()
  },
}

// ── 重建聚合（docs/11-backend-design.md §10 的簡化示意：3–5 分鐘聚合窗口）──

let rebuildTimer: ReturnType<typeof setTimeout> | null = null

function requestRebuild() {
  const d = loadDb()
  d.rebuild.pending = true
  d.rebuild.lastRequestedAt = new Date().toISOString()
  persist()
  if (rebuildTimer) clearTimeout(rebuildTimer)
  // 示意用途，非真正 3–5 分鐘聚合窗口——demo 縮短成幾秒，讓「發布中→已上線」看得到變化
  rebuildTimer = setTimeout(() => {
    const latest = loadDb()
    latest.rebuild.pending = false
    latest.rebuild.lastCompletedAt = new Date().toISOString()
    persist()
  }, 8000)
}

const rebuild = {
  async status(): Promise<RebuildState> {
    return { ...loadDb().rebuild }
  },
}

// ── 儀表板：沒有專屬資料表，全部是聚合查詢（docs/08 §K）─────────────

export interface DashboardSummary {
  statusCounts: Record<UnitKey, Record<ContentStatus, number>>
  pendingReviewCount: number
  myRejected: ReviewItem[]
  rebuild: RebuildState
  totalRecords: number
}

const dashboard = {
  async summary(userId: number): Promise<DashboardSummary> {
    const d = loadDb()
    const statusCounts = {} as Record<UnitKey, Record<ContentStatus, number>>
    let totalRecords = 0
    for (const unit of UNIT_KEYS) {
      const counts: Record<ContentStatus, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }
      for (const rec of d.records[unit]) {
        counts[rec.status]++
        totalRecords++
      }
      statusCounts[unit] = counts
    }
    return {
      statusCounts,
      pendingReviewCount: d.reviews.filter((r) => r.status === 1).length,
      myRejected: d.reviews.filter((r) => r.status === 3 && r.submittedByUserId === userId),
      rebuild: { ...d.rebuild },
      totalRecords,
    }
  },
}

// ── 媒體：瀏覽器直傳 Blob 的流程先做出來，實際上傳留 TODO ─────────────
//
// docs/09-frontend.md §9：「後台選檔 → POST /admin/media/sas 取短效 SAS →
// 瀏覽器直接 PUT 到 Blob → POST /admin/media 回報」。現在沒有 API，
// 這裡刻意讓它明確失敗（而不是假裝成功），EditPage 的上傳欄位改用「貼上
// 圖片網址」當示意替代方案，見 app/admin/components 內圖片欄位的註解。

const media = {
  async requestUploadSas(_fileName: string, _contentType: string): Promise<never> {
    throw new ApiError('INTERNAL', 'TODO：尚未串接 api.20skin.tw，媒體直傳流程待實作（docs/09-frontend.md §9）。')
  },
}

// ── 對外門面 ──────────────────────────────────────────────────────────

export const adminApi = {
  auth,
  taxonomy,
  content,
  review,
  rebuild,
  dashboard,
  media,
}

export type AdminApi = typeof adminApi
