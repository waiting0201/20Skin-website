// 帳號管理與角色權限設定（docs/02 §4、docs/08 §A、docs/10 §3.4／§4）
//
// 上層畫面只透過 client.ts 匯出的 adminApi 取用，不直接 import 這個檔。
//
// ⚠️ 這裡刻意不 import '@/api/client'——client.ts 會 import 這個檔案來組出
// adminApi.account，兩邊互相 import 會變成循環相依（見 client.ts 檔頭註解）。
//
// 🔴 **角色權限矩陣整份來自 API**（`GET /admin/role`）：哪些權限碼存在、哪個角色
//    目前有哪些，全部由 `Permissions` 與 `RolePermissions` 兩張表決定。
//    前端不再寫死一份 —— 這個畫面本身就是用來改那張表的，寫死一份等於畫面改完
//    自己顯示的東西還是舊的。
//
// ⚠️ **角色在 API 是 Id，在畫面是 Code**（`Editor`／`Doctor`…）。兩者的對照由
//    `GET /admin/role` 帶回來，不要在前端寫死 Id —— 那是種子資料的實作細節。

// ── 帳號 ──────────────────────────────────────────────────────────────
//
// docs/08-database.md §A-1：`UserName` 是登入識別，不是 email；`NotifyEmail`
// 是選填的通知欄位，不唯一、可留空。⚠️ 不可對 UserName 做 email 格式驗證，
// 也不可拿它當寄信位址——這是「後台帳號不用 email」最容易寫錯的地方。

import type { RoleCode } from '../types'
import { ROLE_LABEL } from '../types'
import { ApiError } from './errors'
import { normalizePaged, request, type ServerPaged } from './http'

export interface AccountRecord {
  id: number
  userName: string
  displayName: string
  /** 選填，僅供通知，非登入識別、不唯一、可留空（docs/08 §A-1）。 */
  notifyEmail: string | null
  roles: RoleCode[]
  /** 「醫師」角色綁定自己的個人頁用（docs/08 §A-1）。 */
  doctorId: number | null
  /** 綁定的醫師個人頁標題，由 API 一併帶回（避免逐列再查一次）。 */
  doctorName: string | null
  /** 停用不刪除——內容的 CreatedByUserId 還指著它（docs/08 §A-1）。 */
  isActive: boolean
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

interface ServerUser {
  id: number
  userName: string
  displayName: string
  notifyEmail: string | null
  isActive: boolean
  doctorId: number | null
  doctorName: string | null
  createdAt: string
  updatedAt: string
  roleCodes: string[]
}

function toAccount(row: ServerUser): AccountRecord {
  return {
    id: row.id,
    userName: row.userName,
    displayName: row.displayName,
    notifyEmail: row.notifyEmail,
    roles: row.roleCodes as RoleCode[],
    doctorId: row.doctorId,
    doctorName: row.doctorName,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

// ── 角色：Code ↔ Id ───────────────────────────────────────────────────

interface ServerRole {
  id: number
  code: string
  name: string
  isSystem: boolean
  permissionCodes: string[]
}

interface ServerPermission {
  id: number
  code: string
  name: string
  groupName: string
}

interface ServerRoleMatrix {
  roles: ServerRole[]
  allPermissions: ServerPermission[]
}

/**
 * 角色在 API 是 Id，在畫面是 Code。
 * ⚠️ 快取在模組層級：五個角色是種子資料（`IsSystem=1`，不可新增刪除，docs/08 §A-2），
 * 一次工作階段內不會變。但**權限內容會變**，所以只快取這份對照，不快取 matrix()。
 */
let roleIdByCode: Map<string, number> | null = null

async function loadMatrix(): Promise<ServerRoleMatrix> {
  const matrix = await request<ServerRoleMatrix>('/admin/role')
  roleIdByCode = new Map(matrix.roles.map((r) => [r.code, r.id]))
  return matrix
}

async function roleIdsFor(codes: RoleCode[]): Promise<number[]> {
  if (!roleIdByCode) await loadMatrix()
  return codes
    .map((code) => roleIdByCode!.get(code))
    .filter((id): id is number => id !== undefined)
}

const user = {
  /**
   * 帳號清單。
   * ⚠️ 一次抓 100 筆就夠 —— 後台帳號是個位數到十幾個（14 位團隊成員裡只有一部分有帳號）。
   * 真的長到超過 100 個的那天，這裡要改成跟著畫面分頁，不是把 pageSize 調大（上限 100）。
   */
  async list(): Promise<AccountRecord[]> {
    const paged = normalizePaged(await request<ServerPaged<ServerUser>>('/admin/user', { query: { page: 1, pageSize: 100 } }))
    return paged.items.map(toAccount)
  },

  async get(id: number): Promise<AccountRecord> {
    const all = await user.list()
    const found = all.find((a) => a.id === id)
    if (!found) throw new ApiError('NOT_FOUND', `找不到帳號 #${id}。`)
    return found
  },

  /** ⚠️ 建立後 `MustChangePassword` 一律為 true —— 起始密碼只是讓人登入一次去改掉它。 */
  async create(input: CreateAccountInput): Promise<AccountRecord> {
    const row = await request<ServerUser>('/admin/user', {
      method: 'POST',
      body: {
        userName: input.userName,
        displayName: input.displayName,
        password: input.password,
        notifyEmail: input.notifyEmail ?? null,
        doctorId: input.doctorId ?? null,
        roleIds: await roleIdsFor(input.roles),
      },
    })
    return toAccount(row)
  },

  /** ⚠️ 不含 userName —— 登入識別建立後不可變更（docs/08 §A-1）。 */
  async update(id: number, input: UpdateAccountInput): Promise<AccountRecord> {
    const row = await request<ServerUser>(`/admin/user/${id}`, {
      method: 'PUT',
      body: {
        displayName: input.displayName,
        notifyEmail: input.notifyEmail,
        doctorId: input.doctorId,
        roleIds: input.roles ? await roleIdsFor(input.roles) : undefined,
      },
    })
    return toAccount(row)
  },

  /**
   * 停用／重新啟用。
   * ⚠️ 停用走 `PUT`（`isActive: false`）而不是 `DELETE` —— `DELETE /admin/user/{id}`
   * 在 API 那頭也是停用不是刪除，但它是單向的，復原一律走 PUT。
   * ⚠️ 不可停用自己，這道防護在 API（它才知道目前登入者是誰）。
   */
  async setActive(id: number, isActive: boolean): Promise<AccountRecord> {
    const row = await request<ServerUser>(`/admin/user/${id}`, { method: 'PUT', body: { isActive } })
    return toAccount(row)
  },

  /** 重設密碼。重設後對方的 `MustChangePassword` 會被打開，下次登入必須改掉。 */
  async resetPassword(id: number, newPassword: string): Promise<void> {
    await request<null>(`/admin/user/${id}/password`, { method: 'PUT', body: { newPassword } })
  },
}

// ── 角色權限矩陣 ──────────────────────────────────────────────────────

export interface PermissionCell {
  code: string
  label: string
}

export interface PermissionGroup {
  key: string
  label: string
  cells: PermissionCell[]
}

/**
 * 四個角色都固定存在（docs/08 §A-2：IsSystem=1，不可刪除），SuperAdmin 恆為全通過，不進可編輯矩陣。
 * ⚠️ 原本是五個 —— 「審核者」2026-09-17 連同審核佇列一起移除（CLAUDE.md 決策 20）。
 */
export const EDITABLE_ROLES: Exclude<RoleCode, 'SuperAdmin'>[] = ['Editor', 'Doctor', 'Marketing']
export const ALL_ROLES: RoleCode[] = ['SuperAdmin', 'Editor', 'Doctor', 'Marketing']

export interface RolePermissionMatrix {
  groups: PermissionGroup[]
  granted: Record<RoleCode, string[]>
}

const role = {
  /**
   * `GET /admin/role`：五個角色目前各有哪些權限碼，＋ 完整的 31 碼目錄。
   *
   * 🔴 分組依 API 回的 `groupName`，不是前端自己分。新增一個權限碼時只要種子那邊
   * 補一列，這個畫面自動就有那一格 —— 前端寫死一份的話會漏掉。
   */
  async matrix(): Promise<RolePermissionMatrix> {
    const matrix = await loadMatrix()

    const byGroup = new Map<string, PermissionCell[]>()
    for (const p of matrix.allPermissions) {
      const cells = byGroup.get(p.groupName) ?? []
      cells.push({ code: p.code, label: `${p.name}（${p.code}）` })
      byGroup.set(p.groupName, cells)
    }
    const groups: PermissionGroup[] = [...byGroup.entries()].map(([label, cells]) => ({ key: label, label, cells }))

    const granted = {} as Record<RoleCode, string[]>
    for (const r of ALL_ROLES) {
      granted[r] = matrix.roles.find((x) => x.code === r)?.permissionCodes ?? []
    }

    return { groups, granted }
  },

  /** `PUT /admin/role/{id}/permissions`。SuperAdmin 恆為全通過，不接受寫入。 */
  async updateRolePermissions(targetRole: RoleCode, codes: string[]): Promise<void> {
    if (targetRole === 'SuperAdmin') {
      throw new ApiError('CONFLICT_STATE', '超級管理員永遠擁有全部權限，不可調整。')
    }
    const ids = await roleIdsFor([targetRole])
    if (ids.length === 0) throw new ApiError('NOT_FOUND', `找不到角色 ${targetRole}。`)
    await request<null>(`/admin/role/${ids[0]}/permissions`, {
      method: 'PUT',
      body: { permissionCodes: [...new Set(codes)] },
    })
  },
}

export { ROLE_LABEL }

export const accountApi = { user, role }
