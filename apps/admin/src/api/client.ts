// 資料來源門面。
//
// docs/09-frontend.md §8：「一個門面，上層畫面只認這個門面，不知道資料從哪來」。
// 2026-09-12 起門面後面接的是真的 api.20skin.tw（在此之前是 localStorage mock）。
//
// 🔴 **畫面不得繞過這個門面直接 fetch。** 所有 HTTP 細節（信封、錯誤碼、Bearer、
//    401 自動換發）都在 ./http.ts 收斂；若哪天發現某個畫面自己打 API，那就是要修的地方。
//
// ⚠️ **這裡不做授權判斷。** 畫面上的 hasPermission() 只決定按鈕出不出現，
//    擋得住的授權在 API 的 AppRouter（docs/11 §5.3，預設拒絕）。
//
// ⚠️ **這裡不做欄位驗證。** 必填、字數範圍、案例的四個法規揭露欄位，
//    一律由 API 把關（docs/11 §3）。前端再寫一份只會有兩份各自漂移的規則。

import type {
  AdminRecord,
  ContentStatus,
  CurrentUser,
  ListQuery,
  PagedResult,
  RelationItem,
  RoleCode,
  SeoMeta,
  UnitKey,
} from '../types'
import { emptySeo, UNIT_KEYS } from '../types'
import { UNIT_REGISTRY } from '../units'
import type { UnitField } from '../unit-schema'

import { ApiError } from './errors'
import {
  clampPageSize,
  clearStoredRefreshToken,
  currentRefreshToken,
  fetchAllPages,
  normalizePaged,
  request,
  setTokens,
  storedRefreshToken,
  type ServerPaged,
} from './http'
import { fieldsFromServer, fieldsToServer } from './content-fields'
import { botCheckEnabled, getBotCheckToken } from './bot-check'
import { uploadApi, type UploadedImage } from './upload'
import { redirectApi } from './redirect'
import { seoApi } from './seo'
import { questionApi } from './question'
import { siteApi } from './site'
import { accountApi } from './account'

// ── API 回傳形狀（docs/10-api.md §3.3 的 DTO，camelCase）──────────────

interface ServerSeo {
  seoTitle: string | null
  metaDescription: string | null
  ogImage: UploadedImage | null
  canonicalOverride: string | null
  noIndex: boolean
  structuredDataOverride: string | null
  aiSummary: string | null
}

interface ServerRelation {
  toContentItemId: number
  toContentType: number
  relationType: number
  sortOrder: number
  note: string | null
  toTitle: string | null
  toUrlPath: string | null
  /** true＝「別人指著我」。這一端唯讀，編輯入口在對方的畫面（docs/08 §D）。 */
  isReverse: boolean
}

interface ServerDetail {
  id: number
  unit: UnitKey
  slug: string | null
  urlPath: string | null
  title: string
  summary: string | null
  status: number
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
  fields: Record<string, unknown> | null
  seo: ServerSeo | null
  relations: ServerRelation[] | null
}

interface ServerListItem {
  id: number
  unit: UnitKey
  title: string
  slug: string | null
  urlPath: string | null
  status: number
  publishAt: string | null
  unpublishAt: string | null
  sortOrder: number
  includeInSitemap: boolean
  isSystemLocked: boolean
  ownerUserId: number | null
  categoryTermId: number | null
  categoryTitle: string | null
  updatedAt: string
  usageCount: number | null
  fields: Record<string, unknown> | null
}

// ── 形狀轉換 ──────────────────────────────────────────────────────────

function toSeo(seo: ServerSeo | null): SeoMeta {
  if (!seo) return emptySeo()
  return {
    seoTitle: seo.seoTitle,
    metaDescription: seo.metaDescription,
    ogImage: seo.ogImage,
    canonicalOverride: seo.canonicalOverride,
    noIndex: seo.noIndex,
    structuredDataOverride: seo.structuredDataOverride,
    aiSummary: seo.aiSummary,
  }
}

/**
 * 攤平的關聯清單 → 依單元宣告分組的 `Record<relationKey, RelationItem[]>`。
 *
 * ⚠️ 同一個 `relationType` 在兩個單元上各有一個欄位，一個可編輯、一個唯讀
 * （例如 RelationType=1 在療程是「關聯醫師」、在醫師是「關聯療程」），
 * 靠 `isReverse` 分辨：可編輯的欄位收正向那幾筆，唯讀的欄位收反向那幾筆。
 * 只看 relationType 不看方向的話，醫師頁會把自己指出去的關聯也列進來。
 */
function groupRelations(unit: UnitKey, relations: ServerRelation[] | null): Record<string, RelationItem[]> {
  const out: Record<string, RelationItem[]> = {}
  const defs = UNIT_REGISTRY[unit].relations ?? []
  for (const def of defs) {
    out[def.key] = (relations ?? [])
      .filter((r) => r.relationType === def.relationType && r.isReverse === !def.editable)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((r) => ({
        id: r.toContentItemId,
        title: r.toTitle ?? `#${r.toContentItemId}`,
        sortOrder: r.sortOrder,
        note: r.note,
      }))
  }
  return out
}

function toAdminRecord(unit: UnitKey, dto: ServerDetail): AdminRecord {
  return {
    id: dto.id,
    contentType: unit,
    slug: dto.slug,
    urlPath: dto.urlPath,
    title: dto.title,
    status: dto.status as ContentStatus,
    publishAt: dto.publishAt,
    unpublishAt: dto.unpublishAt,
    sortOrder: dto.sortOrder,
    includeInSitemap: dto.includeInSitemap,
    isSystemLocked: dto.isSystemLocked,
    ownerUserId: dto.ownerUserId,
    createdByUserId: dto.createdByUserId,
    updatedByUserId: dto.updatedByUserId,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    // ⚠️ slug 要傳下去：`page.bodyBlocks` 依 slug 決定用哪一份 schema（見 unit-schema.ts）。
    fields: fieldsFromServer(unit, dto.fields, dto.summary, { slug: dto.slug ?? null }),
    relations: groupRelations(unit, dto.relations),
    seo: toSeo(dto.seo),
  }
}

/**
 * 清單一列 → AdminRecord。
 *
 * ⚠️ **清單的 `fields` 只有畫面上那幾欄**（見 ContentReadService.ListExtras），
 * 不是完整詳情。清單頁只用它渲染 `listColumns`；任何需要完整欄位的地方
 * 一律走 `content.get()`。
 */
function listItemToAdminRecord(unit: UnitKey, row: ServerListItem): AdminRecord {
  const fields: Record<string, unknown> = { ...(row.fields ?? {}) }
  if (row.categoryTitle !== null) fields.categoryTitle = row.categoryTitle
  if (row.categoryTermId !== null) fields.categoryTermId = row.categoryTermId
  if (row.usageCount !== null) fields.usageCount = row.usageCount
  applySelectLabels(unit, fields)

  return {
    id: row.id,
    contentType: unit,
    slug: row.slug,
    urlPath: row.urlPath,
    title: row.title,
    status: row.status as ContentStatus,
    publishAt: row.publishAt,
    unpublishAt: row.unpublishAt,
    sortOrder: row.sortOrder,
    includeInSitemap: row.includeInSitemap,
    isSystemLocked: row.isSystemLocked,
    ownerUserId: row.ownerUserId,
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: row.updatedAt,
    updatedAt: row.updatedAt,
    fields,
    relations: {},
    seo: emptySeo(),
  }
}

/**
 * select 欄位在清單上要顯示中文標籤而不是數字（`termType: 1` → 「療程分類」）。
 * ListPage 會優先讀 `${key}__label`，所以這裡補上。
 */
function applySelectLabels(unit: UnitKey, fields: Record<string, unknown>) {
  for (const field of UNIT_REGISTRY[unit].fields) {
    if (field.type !== 'select' || !field.options) continue
    const raw = fields[field.key]
    if (raw === undefined || raw === null) continue
    const match = field.options.find((o) => o.value === String(raw))
    if (match) fields[`${field.key}__label`] = match.label
  }
}

// ── 認證 ──────────────────────────────────────────────────────────────

interface TokenResponse {
  accessToken: string
  refreshToken: string
  userId: number
  userName: string
  doctorId: number | null
  displayName: string
  roles: string[]
  permissions: string[]
  isSuperAdmin: boolean
}

let permissionCodes: string[] = []

/**
 * 目前登入者實際擁有的權限碼，由 API 在登入時發給（docs/10 §3.2 的 `permissions`）。
 *
 * 🔴 **權威在後端。** 前端不再自己用角色推導權限 —— 那份推導表與後端的
 * `RolePermissions` 是兩份會各自漂移的規則，而後台的角色權限是可以在畫面上改的
 * （`PUT /admin/role/{id}/permissions`），改完前端那份推導表就過期了。
 */
export function currentPermissionCodes(): string[] {
  return permissionCodes
}

function toCurrentUser(res: TokenResponse): CurrentUser {
  return {
    id: res.userId,
    userName: res.userName,
    displayName: res.displayName,
    roles: res.roles as RoleCode[],
    isSuperAdmin: res.isSuperAdmin,
    doctorId: res.doctorId,
  }
}

const auth = {
  /**
   * 單段驗證：帳密通過就登入，沒有第二因素（docs/10 §3.2，2026-09-11 院方決定）。
   *
   * ⚠️ **沒有「首登強制改密碼」那一關了**（2026-09-17）——管理者設定的密碼就是
   * 最終密碼。API 仍會回一個 `mustChangePassword` 欄位，那是還沒拆掉的惰性欄位，
   * **不要再拿它來擋人**（AppRouter 那道 403 閘已經移除）。
   */
  async login(userName: string, password: string): Promise<CurrentUser> {
    // 機器人驗證（docs/10 §5，reCAPTCHA v3）。
    //
    // 🔴 **取不到就不要送出。** 後端對「沒有 token」是擋下（不然不送就能繞過），
    //    硬送只會拿到一個看不懂的「自動化驗證未通過」。這裡直接給出真正的原因。
    const botCheckToken = await getBotCheckToken('login')
    if (botCheckEnabled && !botCheckToken) {
      throw new ApiError(
        'BOT_CHECK_FAILED',
        '無法載入自動化驗證（可能被瀏覽器擴充套件或網路環境擋下）。請關閉阻擋類擴充套件後重試。',
      )
    }

    const res = await request<TokenResponse>('/auth/login', {
      method: 'POST',
      body: { userName, password, botCheckToken },
      auth: false,
    })
    setTokens({ accessToken: res.accessToken, refreshToken: res.refreshToken })
    permissionCodes = res.permissions ?? []
    return toCurrentUser(res)
  },

  /** 首登強制改密碼。改完要重新登入，因為權限與旗標都變了。 */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await request<null>('/auth/change-password', {
      method: 'POST',
      body: { currentPassword, newPassword },
    })
  },

  /**
   * 重新開頁時把身分換回來（sessionStorage 裡的 refresh token → 一組新憑證）。
   *
   * 🔴 **換發端點回的是完整的 TokenResponse**，身分、角色與 permissions 都在裡面 ——
   * 所以還原不需要另一支 `/auth/me`。⚠️ 權限**一定要跟著更新**：只還原 token 卻沿用
   * 舊的權限清單，等於讓「角色權限剛被改掉」的人繼續看到不該有的畫面（決策 16：
   * 權威在後端）。
   *
   * ⚠️ 任何失敗（token 過期、被撤銷、帳號停用、API 連不上）一律回 null 並清乾淨 ——
   * 開頁是使用者還沒做任何事的時刻，這裡丟錯只會變成一個沒有上下文的紅色橫幅。
   */
  async restore(): Promise<CurrentUser | null> {
    const refreshToken = storedRefreshToken()
    if (!refreshToken) return null

    try {
      const res = await request<TokenResponse>('/auth/refresh', {
        method: 'POST',
        body: { refreshToken },
        auth: false,
      })
      setTokens({ accessToken: res.accessToken, refreshToken: res.refreshToken })
      permissionCodes = res.permissions ?? []
      return toCurrentUser(res)
    } catch {
      setTokens(null)
      permissionCodes = []
      return null
    }
  },

  async logout() {
    // 🔴 **先同步清掉 sessionStorage 那一份。** 撤銷請求還在飛的時候使用者若按了
    //    重新整理，還原流程會拿著它把人又登回去 —— 記憶體那一份要留到請求送完，
    //    因為 /auth/logout 需要還活著的 access token 才認得出呼叫者。
    clearStoredRefreshToken()

    // ⚠️ refresh token **要送過去**，否則後端那一支是冪等的空操作（它靠 body 裡的
    //    token 找出要撤銷哪一筆），那顆憑證會在伺服器上活到 30 天自然過期。
    const refreshToken = currentRefreshToken()

    try {
      await request<null>('/auth/logout', { method: 'POST', body: { refreshToken } })
    } catch {
      // 登出失敗不該把使用者留在後台裡。本機憑證照樣清掉 ——
      // 最壞的情況是伺服器上那個 refresh token 留到自然過期。
    }
    setTokens(null)
    permissionCodes = []
  },
}

// ── 分類與標籤／關聯目標的選項來源 ───────────────────────────────────

const taxonomy = {
  /**
   * 某個 TermType 底下的分類選項（療程分類、文章分類、FAQ 分類、文章標籤）。
   *
   * 🔴 **`termType` 一定要送給 API 過濾，不要整份抓回來再自己 filter。**
   *    term 一張表混了四種東西（實測 406 筆，其中 393 筆是文章標籤），
   *    而 `/admin/term` 的每一列都要算「使用筆數」——四個相關子查詢，其中一個
   *    掃 ContentRelations。整份抓＝**5 趟往返 × 每趟 100 列 × 4 個子查詢**，
   *    只為了挑出 4 個療程分類。療程的清單頁與編輯頁都卡在這裡。
   *    帶上 termType 之後是 1 趟往返、4 列。
   * ⚠️ 前端的 filter 保留當防呆（舊版 API 會忽略這個參數），但它不再是主要機制。
   */
  async termOptions(termType: number): Promise<{ value: string; label: string }[]> {
    const rows = await fetchAllPages<ServerListItem>(async (page, pageSize) =>
      normalizePaged(await request<ServerPaged<ServerListItem>>('/admin/term', { query: { page, pageSize, termType } })),
    )
    return rows
      .filter((r) => Number((r.fields ?? {}).termType) === termType)
      .map((r) => ({ value: String(r.id), label: r.title }))
  },

  /**
   * 某個單元的候選項目，給 relation-single 與關聯選擇器用。
   *
   * ⚠️ 有關鍵字就交給 API 在 SQL 層過濾（docs/10 §2）。沒有關鍵字時才整份抓 ——
   * 文章有約 800 筆，那是 8 趟往返，所以關聯選擇器一律應該帶關鍵字進來。
   */
  async unitOptions(unit: UnitKey, keyword?: string): Promise<{ value: string; label: string }[]> {
    assertUnit(unit)
    if (keyword) {
      const paged = normalizePaged(
        await request<ServerPaged<ServerListItem>>(`/admin/${unit}`, { query: { keyword, page: 1, pageSize: 100 } }),
      )
      return paged.items.map((r) => ({ value: String(r.id), label: r.title }))
    }
    const rows = await fetchAllPages<ServerListItem>(async (page, pageSize) =>
      normalizePaged(await request<ServerPaged<ServerListItem>>(`/admin/${unit}`, { query: { page, pageSize } })),
    )
    return rows.map((r) => ({ value: String(r.id), label: r.title }))
  },

  /**
   * 編輯器的高風險字詞即時提示（docs/02 §5）。
   * ⚠️ 這是提示不是閘門 —— 掃到字詞不影響能不能送審，送審時 API 會自己再掃一次。
   */
  async riskTerms(): Promise<string[]> {
    return (await request<string[]>('/admin/risk-term')) ?? []
  },
}

// ── 內容 CRUD ─────────────────────────────────────────────────────────

function assertUnit(unit: string): asserts unit is UnitKey {
  if (!UNIT_KEYS.includes(unit as UnitKey)) throw new ApiError('NOT_FOUND', `未知的單元：${unit}`)
}

/** 建立／更新本文共用的請求體。 */
function buildBody(
  unit: UnitKey,
  payload: { title?: string; slug?: string; sortOrder?: number; includeInSitemap?: boolean; ownerUserId?: number; fields?: Record<string, unknown> },
  isCreate = false,
) {
  const body: Record<string, unknown> = {}
  if (payload.title !== undefined) body.title = payload.title
  if (payload.slug !== undefined) body.slug = payload.slug
  if (payload.sortOrder !== undefined) body.sortOrder = payload.sortOrder
  if (payload.includeInSitemap !== undefined) body.includeInSitemap = payload.includeInSitemap
  if (payload.ownerUserId !== undefined) body.ownerUserId = payload.ownerUserId
  if (payload.fields) {
    // ⚠️ 同上：送出時也要靠 slug 找到同一份 schema，否則 page 的內文會被當成沒有 schema
    //    而走原始 JSON 模式的路徑。
    const mapped = fieldsToServer(unit, payload.fields, isCreate, { slug: payload.slug ?? null })
    body.fields = mapped.fields
    if (mapped.summary !== undefined) body.summary = mapped.summary
  }
  return body
}

const content = {
  async list(unit: UnitKey, query: ListQuery & { ownerUserId?: number } = {}): Promise<PagedResult<AdminRecord>> {
    assertUnit(unit)
    const page = Math.max(1, query.page ?? 1)
    const pageSize = clampPageSize(query.pageSize)
    const paged = normalizePaged(
      await request<ServerPaged<ServerListItem>>(`/admin/${unit}`, {
        query: {
          page,
          pageSize,
          keyword: query.keyword,
          status: query.status,
          categoryId: query.categoryId,
          termType: query.termType,
          ownerUserId: query.ownerUserId,
        },
      }),
    )
    return {
      items: paged.items.map((row) => listItemToAdminRecord(unit, row)),
      totalCount: paged.totalCount,
      page: paged.page,
      pageSize: paged.pageSize,
      totalPages: paged.totalPages,
    }
  },

  async get(unit: UnitKey, id: number): Promise<AdminRecord> {
    assertUnit(unit)
    return toAdminRecord(unit, await request<ServerDetail>(`/admin/${unit}/${id}`))
  },

  /** @param _userId 由 token 決定，不從前端帶。保留參數是為了不動 30 個呼叫端。 */
  async create(
    unit: UnitKey,
    payload: { title?: string; slug?: string; sortOrder?: number; includeInSitemap?: boolean; ownerUserId?: number; fields?: Record<string, unknown> },
    _userId: number,
  ): Promise<AdminRecord> {
    assertUnit(unit)
    return toAdminRecord(unit, await request<ServerDetail>(`/admin/${unit}`, { method: 'POST', body: buildBody(unit, payload, true) }))
  },

  async update(
    unit: UnitKey,
    id: number,
    payload: { title?: string; slug?: string; sortOrder?: number; includeInSitemap?: boolean; fields?: Record<string, unknown> },
    _userId: number,
  ): Promise<AdminRecord> {
    assertUnit(unit)
    return toAdminRecord(unit, await request<ServerDetail>(`/admin/${unit}/${id}`, { method: 'PUT', body: buildBody(unit, payload) }))
  },

  /**
   * 只寫 SEO 區塊 —— 行銷角色的落點（權限碼是 `seo.edit`，不是 `content.*.edit`）。
   * ⚠️ SEO 即使在送審中也可以改（docs/11 §7），這是刻意的，不要比照本文加鎖。
   */
  async updateSeo(unit: UnitKey, id: number, seo: Partial<SeoMeta>, _userId: number): Promise<AdminRecord> {
    assertUnit(unit)
    await request<ServerSeo>(`/admin/${unit}/${id}/seo`, { method: 'PUT', body: seo })
    return content.get(unit, id)
  },

  /**
   * ⚠️ **`PUT .../relations` 是整筆取代**：它會刪掉這筆內容所有正向關聯，再寫入送出去的那一份。
   * 所以只改一個關聯欄位時，其餘欄位也必須一起送 —— 少送就是刪掉。
   * 這裡先讀一次現況再合併，呼叫端仍然只需要傳自己那一個 key。
   */
  async updateRelations(
    unit: UnitKey,
    id: number,
    relationKey: string,
    items: { id: number; sortOrder: number; note?: string | null }[],
    _userId: number,
  ): Promise<AdminRecord> {
    assertUnit(unit)
    const defs = UNIT_REGISTRY[unit].relations ?? []
    const target = defs.find((r) => r.key === relationKey)
    if (!target) throw new ApiError('NOT_FOUND', `找不到關聯欄位：${relationKey}`)
    if (!target.editable) throw new ApiError('FORBIDDEN', '這個關聯由對方的編輯畫面維護，這裡唯讀。')

    const current = await content.get(unit, id)
    const payload: { relationType: number; toContentItemId: number; sortOrder: number; note: string | null }[] = []

    for (const def of defs) {
      // 唯讀（反向）欄位不送 —— 那些關聯存在對方那筆內容上，送過來等於幫對方改資料。
      if (!def.editable) continue
      const source = def.key === relationKey ? items : current.relations[def.key] ?? []
      source.forEach((item, index) => {
        payload.push({
          relationType: def.relationType,
          toContentItemId: item.id,
          sortOrder: item.sortOrder ?? index,
          note: item.note ?? null,
        })
      })
    }

    await request<null>(`/admin/${unit}/${id}/relations`, { method: 'PUT', body: payload })
    return content.get(unit, id)
  },

  /** 送審。回傳的 riskFlags 是**伺服器**掃出來的，與編輯器的即時提示可能不完全一致。 */
  async submit(unit: UnitKey, id: number, _userId: number, _userName: string): Promise<{ riskFlags: string[] }> {
    assertUnit(unit)
    const res = await request<{ riskFlags: string[] | null }>(`/admin/${unit}/${id}/submit`, { method: 'POST', body: {} })
    return { riskFlags: res?.riskFlags ?? [] }
  },

  /** 直接發布／下架（僅具發布權的角色；權限由 API 擋，前端只決定按鈕出不出現）。 */
  async setPublishState(unit: UnitKey, id: number, status: Extract<ContentStatus, 3 | 4>, _userId: number): Promise<AdminRecord> {
    assertUnit(unit)
    await request<ServerDetail>(`/admin/${unit}/${id}/publish`, {
      method: 'PATCH',
      body: { action: status === 3 ? 'publish' : 'unpublish' },
    })
    return content.get(unit, id)
  },

  /** 排程上線時間。⚠️ 2026-09-16 起是**精確的**（SSR 下由查詢條件即時判斷），
   *  舊敘述「最早生效時間、還要等全站重建」已作廢。 */
  async schedule(unit: UnitKey, id: number, publishAt: string | null, unpublishAt: string | null, _userId: number): Promise<AdminRecord> {
    assertUnit(unit)
    await request<ServerDetail>(`/admin/${unit}/${id}/schedule`, { method: 'PATCH', body: { publishAt, unpublishAt } })
    return content.get(unit, id)
  },

  /**
   * 批次寫入排序值。
   *
   * 🔴 **`sortOrder` 由呼叫端決定，不是「陣列索引」。** 原本是
   * `orderedIds.map((id, index) => ({ id, sortOrder: index }))` —— 那等於假設
   * 送進來的就是**整個單元**的完整順序。清單頁 2026-09-17 改成「當頁內排序」
   * （只重新分配這一頁原本佔住的那幾個值），索引與真正要寫的值完全是兩回事：
   * 第 3 頁的第一筆要寫 40，不是 0。照舊用索引的話，翻到第 3 頁拖一次，
   * 那 20 筆會整批被洗到最前面 —— 而且沒有任何錯誤訊息。
   */
  async sort(unit: UnitKey, rows: { id: number; sortOrder: number }[], _userId: number): Promise<void> {
    assertUnit(unit)
    await request<null>(`/admin/${unit}/sort`, { method: 'PUT', body: rows })
  },

  async remove(unit: UnitKey, id: number): Promise<void> {
    assertUnit(unit)
    await request<null>(`/admin/${unit}/${id}`, { method: 'DELETE' })
  },

  async versions(unit: UnitKey, id: number): Promise<{ versionNo: number; title: string; note: string | null; createdAt: string; createdByUserId: number }[]> {
    assertUnit(unit)
    const rows = (await request<{ versionNo: number; title: string; note: string | null; createdAt: string; createdByUserId: number | null }[]>(
      `/admin/${unit}/${id}/versions`,
    )) ?? []
    return rows
      .map((v) => ({ ...v, createdByUserId: v.createdByUserId ?? 0 }))
      .sort((a, b) => b.versionNo - a.versionNo)
  },

  /** 還原成**草稿**，不直接上線（docs/10 §3.3）。 */
  async restoreVersion(unit: UnitKey, id: number, versionNo: number, _userId: number): Promise<AdminRecord> {
    assertUnit(unit)
    await request<ServerDetail>(`/admin/${unit}/${id}/versions/${versionNo}/restore`, { method: 'POST', body: {} })
    return content.get(unit, id)
  },
}

// ── 審核佇列 ──────────────────────────────────────────────────────────

// ── 儀表板 ────────────────────────────────────────────────────────────

interface ServerDashboard {
  pendingReviewCount: number
  myRejectedCount: number
  contentCountsByUnit: Record<string, { draft: number; inReview: number; published: number; unpublished: number }>
  myRejectedItems: { contentItemId: number; unit: UnitKey; title: string; urlPath: string | null; decisionNote: string | null; decidedAt: string | null }[] | null
}

export interface DashboardSummary {
  statusCounts: Record<UnitKey, Record<ContentStatus, number>>
  totalRecords: number
}

const dashboard = {
  async summary(_userId: number): Promise<DashboardSummary> {
    // ⚠️ 兩支端點，一次往返各一。不要為了「少一次請求」把重建狀態塞進儀表板端點 ——
    //    編輯畫面也要輪詢重建狀態，它必須是獨立的一支。
    const [server] = await Promise.all([
      request<ServerDashboard>('/admin/dashboard'),
    ])

    const statusCounts = {} as Record<UnitKey, Record<ContentStatus, number>>
    let totalRecords = 0
    for (const unit of UNIT_KEYS) {
      const counts = server.contentCountsByUnit?.[unit]
      const mapped: Record<ContentStatus, number> = {
        1: counts?.draft ?? 0,
        2: counts?.inReview ?? 0,
        3: counts?.published ?? 0,
        4: counts?.unpublished ?? 0,
      }
      statusCounts[unit] = mapped
      totalRecords += mapped[1] + mapped[2] + mapped[3] + mapped[4]
    }

    return { statusCounts, totalRecords }
  },
}

// ── 對外門面 ──────────────────────────────────────────────────────────

export { ApiError } from './errors'
export type { UnitField }

export const adminApi = {
  auth,
  taxonomy,
  content,
  dashboard,
  upload: uploadApi,
  redirect: redirectApi,
  seo: seoApi,
  question: questionApi,
  site: siteApi,
  account: accountApi,
}

export type AdminApi = typeof adminApi
