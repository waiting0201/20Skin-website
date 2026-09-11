// 帳號管理與角色權限設定（docs/02 §4、docs/08 §A、docs/10 §3.4／§4）
//
// ⚠️ 這是 mock 的骨架，由第二輪的畫面實作填滿。
// 持久化用 ./mock-store 開獨立的 store（理由見該檔案），**不要動 client.ts 的 Db**。
//
// 上層畫面只透過 client.ts 匯出的 adminApi 取用，不直接 import 這個檔。
// 接上 api.20skin.tw 時整支換掉，畫面不必改（docs/09-frontend.md §8）。
//
// ⚠️ 這裡刻意不 import '@/api/client'——client.ts 會 import 這個檔案來組出
// adminApi.account，兩邊互相 import 會變成循環相依（見 client.ts 檔頭註解）。
// 需要跟九個內容模型的資料互動（例如「連結到某一則 FAQ」）時，由呼叫端的
// Vue 元件自行 import '@/api/client' 取用，這個檔案本身保持獨立。

import type { RoleCode } from '../types'
import { ROLE_LABEL } from '../types'
import { UNIT_REGISTRY } from '../units'
import { UNIT_KEYS } from '../types'
import type { PermissionContext } from '../permissions'
import { hasPermission, canCreateTerm, canDeleteTerm } from '../permissions'
import { createStore } from './mock-store'
import { MOCK_USERS } from './mock-seed'
import { ApiError } from './errors'

// ── 帳號 ──────────────────────────────────────────────────────────────
//
// docs/08-database.md §A-1：`UserName` 是登入識別，不是 email；`NotifyEmail`
// 是選填的通知欄位，不唯一、可留空。⚠️ 不可對 UserName 做 email 格式驗證，
// 也不可拿它當寄信位址——這是「後台帳號不用 email」最容易寫錯的地方。

export interface AccountRecord {
  id: number
  userName: string
  displayName: string
  /** 選填，僅供通知，非登入識別、不唯一、可留空（docs/08 §A-1）。 */
  notifyEmail: string | null
  roles: RoleCode[]
  /** 「醫師」角色綁定自己的個人頁用（docs/08 §A-1）。 */
  doctorId: number | null
  /** 停用不刪除——內容的 CreatedByUserId 還指著它（docs/08 §A-1）。 */
  isActive: boolean
  mustChangePassword: boolean
  /** 這組密碼是不是建置期的種子密碼、從沒換過。畫面用來提醒
   * 「種子密碼 Admin@123 上線前必須更換」（docs/08 §A-5、STATUS.md §八）。 */
  usesSeedPassword: boolean
  passwordUpdatedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateAccountInput {
  userName: string
  displayName: string
  notifyEmail?: string | null
  roles: RoleCode[]
  doctorId?: number | null
  password: string
}

export interface UpdateAccountInput {
  displayName?: string
  notifyEmail?: string | null
  roles?: RoleCode[]
  doctorId?: number | null
}

interface AccountDb {
  version: number
  nextId: number
  users: AccountRecord[]
}

const ACCOUNT_DB_VERSION = 1

/**
 * 種子資料對齊 src/api/mock-seed.ts 的 MOCK_USERS（唯讀，不改那個檔）——
 * 五個角色各一個示範帳號。
 *
 * ⚠️ 這是一份獨立的 mock store，跟 client.ts 裡 `auth.login()` 直接讀取的
 * MOCK_USERS 陣列不是同一份資料。在這個畫面停用某個帳號或改他的角色，
 * 不會影響「用那組帳密還能不能登入」的示範行為——真正的 API 只有一份
 * Users 表，這個落差只存在於本輪 mock 的架構限制，見回報說明。
 */
function seedAccounts(): AccountDb {
  const now = new Date('2026-08-10T00:00:00.000Z').toISOString()
  return {
    version: ACCOUNT_DB_VERSION,
    nextId: MOCK_USERS.length + 1,
    users: MOCK_USERS.map((u) => ({
      id: u.id,
      userName: u.userName,
      displayName: u.displayName,
      notifyEmail: null,
      roles: [...u.roles],
      doctorId: u.doctorId,
      isActive: u.isActive,
      mustChangePassword: u.mustChangePassword,
      usesSeedPassword: true, // 五組種子密碼都還沒換過
      passwordUpdatedAt: null,
      createdAt: now,
      updatedAt: now,
    })),
  }
}

const store = createStore<AccountDb>('accounts', seedAccounts, ACCOUNT_DB_VERSION)

function sorted(users: AccountRecord[]): AccountRecord[] {
  return [...users].sort((a, b) => a.id - b.id)
}

const USERNAME_PATTERN = /^[a-z0-9._@-]+$/i

function assertValidUserName(userName: string) {
  const trimmed = userName.trim()
  if (!trimmed) throw new ApiError('VALIDATION_REQUIRED', '帳號名稱為必填。')
  if (trimmed.length > 64) throw new ApiError('VALIDATION_RANGE', '帳號名稱長度上限 64 字元。')
  // ⚠️ 只檢查字元集合（docs/08 §A-1：允許 a-z0-9._-@，比對不分大小寫），
  // 不做 email 格式驗證——`sa@system.local` 長得像 email，但它是使用者名稱。
  if (!USERNAME_PATTERN.test(trimmed)) {
    throw new ApiError('VALIDATION_FORMAT', '帳號名稱僅可使用英數字與 . _ - @。')
  }
}

/** 密碼強度規則（docs/02 §4：「沒有雙因素，密碼強度與輪替必須補上這個缺口」）。
 * 這裡只做長度與組成的基本示意，正式規則由院方與工程共同訂定。 */
function assertPasswordStrength(password: string) {
  if (!password) throw new ApiError('VALIDATION_REQUIRED', '密碼為必填。')
  if (password.length < 8) throw new ApiError('VALIDATION_RANGE', '密碼長度至少 8 碼。')
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new ApiError('VALIDATION_FORMAT', '密碼須同時包含英文字母與數字。')
  }
}

function assertRolesNonEmpty(roles: RoleCode[]) {
  if (!roles.length) throw new ApiError('VALIDATION_REQUIRED', '至少需指派一個角色。')
}

const user = {
  async list(): Promise<AccountRecord[]> {
    return sorted(store.read().users)
  },

  async get(id: number): Promise<AccountRecord> {
    const found = store.read().users.find((u) => u.id === id)
    if (!found) throw new ApiError('NOT_FOUND', '帳號不存在。')
    return found
  },

  async create(input: CreateAccountInput): Promise<AccountRecord> {
    assertValidUserName(input.userName)
    assertPasswordStrength(input.password)
    assertRolesNonEmpty(input.roles)
    return store.mutate((db) => {
      const dup = db.users.find((u) => u.userName.toLowerCase() === input.userName.trim().toLowerCase())
      if (dup) throw new ApiError('CONFLICT_DUPLICATE', `帳號名稱「${input.userName}」已被使用。`)
      const now = new Date().toISOString()
      const record: AccountRecord = {
        id: db.nextId++,
        userName: input.userName.trim(),
        displayName: input.displayName.trim() || input.userName.trim(),
        notifyEmail: input.notifyEmail?.trim() || null,
        roles: [...input.roles],
        doctorId: input.doctorId ?? null,
        isActive: true,
        mustChangePassword: true,
        usesSeedPassword: true,
        passwordUpdatedAt: null,
        createdAt: now,
        updatedAt: now,
      }
      db.users.push(record)
      return record
    })
  },

  async update(id: number, input: UpdateAccountInput): Promise<AccountRecord> {
    if (input.roles) assertRolesNonEmpty(input.roles)
    return store.mutate((db) => {
      const found = db.users.find((u) => u.id === id)
      if (!found) throw new ApiError('NOT_FOUND', '帳號不存在。')
      if (input.displayName !== undefined) found.displayName = input.displayName.trim() || found.displayName
      if (input.notifyEmail !== undefined) found.notifyEmail = input.notifyEmail?.trim() || null
      if (input.roles !== undefined) found.roles = [...input.roles]
      if (input.doctorId !== undefined) found.doctorId = input.doctorId
      found.updatedAt = new Date().toISOString()
      return found
    })
  },

  /** 停用不刪除（docs/08 §A-1）。不提供硬刪除——內容的 CreatedByUserId 還指著這個帳號。 */
  async setActive(id: number, isActive: boolean): Promise<AccountRecord> {
    return store.mutate((db) => {
      const found = db.users.find((u) => u.id === id)
      if (!found) throw new ApiError('NOT_FOUND', '帳號不存在。')
      found.isActive = isActive
      found.updatedAt = new Date().toISOString()
      return found
    })
  },

  /** `PUT /admin/user/{id}/password`（docs/10 §3.4）。 */
  async resetPassword(id: number, newPassword: string): Promise<AccountRecord> {
    assertPasswordStrength(newPassword)
    return store.mutate((db) => {
      const found = db.users.find((u) => u.id === id)
      if (!found) throw new ApiError('NOT_FOUND', '帳號不存在。')
      // mock 不存密碼本身（跟正式站一樣只該存 hash），這裡只示意「換過了」的狀態變化。
      found.usesSeedPassword = false
      found.mustChangePassword = true
      found.passwordUpdatedAt = new Date().toISOString()
      found.updatedAt = found.passwordUpdatedAt
      return found
    })
  },
}

// ── 角色權限設定 ──────────────────────────────────────────────────────
//
// docs/10-api.md §3.4：`GET /admin/role`、`PUT /admin/role/{id}/permissions`。
// ⚠️⚠️ `src/permissions.ts` 是這份權限矩陣的權威且唯讀（本輪規範明講不要動它）。
// 這裡的可編輯矩陣是「示範 RolePermissions 這張表未來會被怎麼編輯」的資料層，
// **初始值**由呼叫 permissions.ts 已匯出的 hasPermission() 逐碼推算而來，
// 如實反映目前寫死的權威表；儲存之後也只落在這份 mock 自己的 store 裡。
// 真正串接 api.20skin.tw 後，後端會依 RolePermissions 動態決定授權，
// 屆時 src/permissions.ts 這份寫死表本身也會被替換掉，兩邊才會重新對齊。

export interface PermissionCell {
  code: string
  label: string
}

export interface PermissionGroup {
  key: string
  label: string
  cells: PermissionCell[]
}

/** 五個角色都固定存在（docs/08 §A-2：IsSystem=1，不可刪除），SuperAdmin 恆為全通過，不進可編輯矩陣。 */
export const EDITABLE_ROLES: Exclude<RoleCode, 'SuperAdmin'>[] = ['Editor', 'Doctor', 'Marketing', 'Reviewer']
export const ALL_ROLES: RoleCode[] = ['SuperAdmin', 'Editor', 'Doctor', 'Marketing', 'Reviewer']

const UNIT_ACTIONS: { action: string; label: string }[] = [
  { action: 'view', label: '檢視' },
  { action: 'edit', label: '編輯本文' },
  { action: 'submit', label: '送審' },
  { action: 'publish', label: '發布／下架' },
  { action: 'delete', label: '刪除' },
  { action: 'seo', label: 'SEO 區塊' },
]

/** 非九個內容模型的系統類權限碼（docs/10-api.md §3.4 端點群組表逐條對應）。 */
const SYSTEM_GROUPS: { key: string; label: string; codes: { code: string; label: string }[] }[] = [
  { key: 'review', label: '審核佇列', codes: [{ code: 'review.view', label: '檢視佇列' }, { code: 'review.decide', label: '核准／退回' }] },
  { key: 'media', label: '媒體庫', codes: [{ code: 'media.view', label: '檢視' }, { code: 'media.edit', label: '上傳／刪除' }] },
  { key: 'home', label: '首頁版位編排', codes: [{ code: 'home.view', label: '檢視' }, { code: 'home.edit', label: '編排' }, { code: 'home.submit', label: '送審' }, { code: 'home.publish', label: '發布' }] },
  { key: 'question', label: '未命中題目清單', codes: [{ code: 'question.view', label: '檢視' }, { code: 'question.edit', label: '處理（標記已建題／忽略）' }] },
  { key: 'menu', label: '導覽選單與頁尾', codes: [{ code: 'menu.view', label: '檢視' }, { code: 'menu.edit', label: '編輯（限超管）' }] },
  { key: 'setting', label: '全站設定', codes: [{ code: 'setting.view', label: '檢視' }, { code: 'setting.edit', label: '編輯（限超管）' }] },
  { key: 'redirect', label: '301 轉址管理', codes: [{ code: 'redirect.view', label: '檢視' }, { code: 'redirect.edit', label: '編輯（限超管）' }, { code: 'redirect.export', label: '匯出／匯入（限超管）' }] },
  { key: 'user', label: '帳號管理', codes: [{ code: 'user.view', label: '檢視' }, { code: 'user.edit', label: '編輯（限超管）' }] },
  { key: 'role', label: '角色權限設定', codes: [{ code: 'role.view', label: '檢視' }, { code: 'role.edit', label: '編輯（限超管）' }] },
  { key: 'rebuild', label: '手動觸發全站重建', codes: [{ code: 'rebuild.trigger', label: '觸發（限超管）' }] },
]

function buildGroups(): PermissionGroup[] {
  const unitGroups: PermissionGroup[] = UNIT_KEYS.map((unit) => ({
    key: `unit:${unit}`,
    label: UNIT_REGISTRY[unit].label,
    cells: UNIT_ACTIONS
      // term 沒有 term.delete 這個碼（docs/10 §3.3：新增／刪除分類另有專用判定，見下方 canCreateTerm/canDeleteTerm）
      .filter((a) => !(unit === 'term' && a.action === 'delete'))
      .map((a) => ({ code: `${unit}.${a.action}`, label: a.label })),
  }))
  const systemGroups: PermissionGroup[] = SYSTEM_GROUPS.map((g) => ({ key: g.key, label: g.label, cells: g.codes }))
  return [...unitGroups, ...systemGroups]
}

const GROUPS = buildGroups()

function ctxFor(role: RoleCode): PermissionContext {
  return { roles: [role], isSuperAdmin: role === 'SuperAdmin' }
}

/** 逐碼呼叫已匯出的 hasPermission()，如實還原目前 permissions.ts 寫死的授權表。 */
function defaultGrantedFor(role: RoleCode): string[] {
  const ctx = ctxFor(role)
  const codes = GROUPS.flatMap((g) => g.cells.map((c) => c.code))
  return codes.filter((code) => hasPermission(ctx, code))
}

interface RoleDb {
  version: number
  granted: Record<RoleCode, string[]>
}

function seedRoleDb(): RoleDb {
  const granted = {} as Record<RoleCode, string[]>
  for (const role of ALL_ROLES) granted[role] = defaultGrantedFor(role)
  return { version: 1, granted }
}

const roleStore = createStore<RoleDb>('role-permissions', seedRoleDb, 1)

export interface RolePermissionMatrix {
  groups: PermissionGroup[]
  granted: Record<RoleCode, string[]>
  /** docs/10-api.md §3.3 的逐單元例外：term 的新增／刪除限超管，權限碼本身表達不了，
   * 直接呼叫 permissions.ts 匯出的 canCreateTerm／canDeleteTerm 逐角色算出結果。 */
  termSpecialRules: { role: RoleCode; canCreateCategory: boolean; canCreateTag: boolean; canDeleteCategory: boolean }[]
}

const role = {
  async matrix(): Promise<RolePermissionMatrix> {
    const granted = roleStore.read().granted
    const termSpecialRules = ALL_ROLES.map((r) => {
      const ctx = ctxFor(r)
      return {
        role: r,
        canCreateCategory: canCreateTerm(ctx, false),
        canCreateTag: canCreateTerm(ctx, true),
        canDeleteCategory: canDeleteTerm(ctx),
      }
    })
    return { groups: GROUPS, granted: { ...granted }, termSpecialRules }
  },

  /** `PUT /admin/role/{id}/permissions`。SuperAdmin 恆為全通過，不接受寫入。 */
  async updateRolePermissions(targetRole: RoleCode, codes: string[]): Promise<void> {
    if (targetRole === 'SuperAdmin') {
      throw new ApiError('CONFLICT_STATE', '超級管理員永遠擁有全部權限，不可調整。')
    }
    roleStore.mutate((db) => {
      db.granted[targetRole] = [...new Set(codes)]
    })
  },

  /** 還原成 permissions.ts 目前寫死的預設值（示範用，正式站沒有這顆按鈕的對應端點）。 */
  async resetRoleToDefault(targetRole: RoleCode): Promise<string[]> {
    const defaults = defaultGrantedFor(targetRole)
    roleStore.mutate((db) => {
      db.granted[targetRole] = defaults
    })
    return defaults
  },
}

export { ROLE_LABEL }

export const accountApi = { user, role }
