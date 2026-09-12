// 權限碼 × 畫面。與 docs/10-api.md §4 的 31 個權限碼逐條對齊。
//
// ⚠️⚠️ UI 的權限判斷只管「看不看得到」，不是安全邊界。⚠️⚠️
// 五種角色的授權一律在 API 內驗證（docs/11-backend-design.md §5.3：授權集中在
// Router，預設拒絕）。這裡的 hasPermission() 只決定畫面要不要出現某個按鈕或
// 某條路由要不要導去 403 頁——前端藏起來的按鈕，後端還是要擋。
//
// 🔴 **權限碼的權威來源是 API，不是這個檔案。**
//    登入時 `POST /auth/login` 會回傳這位使用者實際擁有的權限碼（docs/10 §3.2），
//    hasPermission() 直接查那一份。本檔案**不再有「角色 → 權限」的推導表** ——
//    理由：後台的角色權限是可以在畫面上改的（`PUT /admin/role/{id}/permissions`），
//    前端推導表在那一刻就過期了，而且不會有任何徵兆。
//
// ⚠️ 2026-09-12 全面改為 docs/10 §4 的新命名。若在任何地方看到
//    `{unit}.view`／`{unit}.delete`／`review.decide`／`user.*`／`role.*`／
//    `question.*`／`rebuild.trigger`／`setting.*`／`home.edit`，那是接上真 API 之前的舊命名。

import type { RoleCode, UnitKey } from './types'
import { currentPermissionCodes } from './api/client'

/** docs/10-api.md §4 的 31 個權限碼之一。 */
export type PermissionCode = string

/**
 * 內容單元上的動作 → 權限碼。
 *
 * ⚠️ **沒有 `view`、沒有 `delete`。** 讀取是「登入即可」（能編輯就看得到，行銷與
 * 審核者靠 `seo.edit`／`content.*.publish` 進來）；刪除用 `content.{unit}.edit`。
 * docs/08 §A-2 的 31 列裡本來就沒有這兩種 —— 不要因為畫面上有「刪除」按鈕就發明一個。
 */
export type PermissionAction = 'view' | 'edit' | 'seo' | 'submit' | 'publish' | 'delete'

export const PERMISSION_CODES = {
  contentEdit: (unit: UnitKey) => `content.${unit}.edit`,
  contentPublish: (unit: UnitKey) => `content.${unit}.publish`,
  contentSubmit: 'content.submit',
  reviewApprove: 'review.approve',
  reviewReject: 'review.reject',
  seoEdit: 'seo.edit',
  redirectManage: 'redirect.manage',
  tagCreate: 'taxonomy.tag.create',
  categoryManage: 'taxonomy.category.manage',
  legalPageEdit: 'page.legal.edit',
  homeArrange: 'home.arrange',
  menuEdit: 'menu.edit',
  settingsEdit: 'settings.edit',
  accountManage: 'account.manage',
  uploadFile: 'upload.file',
} as const

export interface PermissionContext {
  roles: RoleCode[]
  isSuperAdmin: boolean
}

/**
 * 超級管理員永遠通過（docs/11 §5.3：`is_superadmin = true` 自動通過）。
 *
 * ⚠️ `ctx` 現在只用來判斷「有沒有登入」與「是不是超管」，權限碼本身查的是
 * 登入時 API 發下來的那一份。保留這個參數是為了不動 30 個呼叫端的寫法。
 */
export function hasPermission(ctx: PermissionContext | null | undefined, code: PermissionCode): boolean {
  if (!ctx) return false
  if (ctx.isSuperAdmin) return true
  return currentPermissionCodes().includes(code)
}

export function can(ctx: PermissionContext | null | undefined, unit: UnitKey, action: PermissionAction): boolean {
  if (!ctx) return false
  switch (action) {
    // 讀取沒有獨立權限碼 —— 登入即可（docs/10 §4）。
    case 'view':
      return true
    case 'edit':
    // 刪除用 edit，不另設 delete（docs/10 §4）。
    case 'delete':
      return hasPermission(ctx, PERMISSION_CODES.contentEdit(unit))
    case 'publish':
      return hasPermission(ctx, PERMISSION_CODES.contentPublish(unit))
    case 'submit':
      return hasPermission(ctx, PERMISSION_CODES.contentSubmit)
    case 'seo':
      return hasPermission(ctx, PERMISSION_CODES.seoEdit)
    default:
      return false
  }
}

/**
 * docs/10-api.md §3.3 的逐單元例外：
 * `term` 的新增「分類」（TermType 1–3）動到 URL 結構與 301 對照表，屬
 * `taxonomy.category.manage`（種子只給超管）；新增「標籤」（TermType 4）屬
 * `taxonomy.tag.create`（內容編輯就有）。
 */
export function canCreateTerm(ctx: PermissionContext | null | undefined, isTag: boolean): boolean {
  return hasPermission(ctx, isTag ? PERMISSION_CODES.tagCreate : PERMISSION_CODES.categoryManage)
}

/** 刪除分類／標籤同樣動到 URL 結構與 301，走 `taxonomy.category.manage`。 */
export function canDeleteTerm(ctx: PermissionContext | null | undefined): boolean {
  return hasPermission(ctx, PERMISSION_CODES.categoryManage)
}

/** 法務三頁（隱私權、服務條款、醫療免責聲明）限有 `page.legal.edit` 的人。 */
export function canEditLegalPage(ctx: PermissionContext | null | undefined): boolean {
  return hasPermission(ctx, PERMISSION_CODES.legalPageEdit)
}

/**
 * docs/11-backend-design.md §5.4：醫師只能改自己的內容，資料列層級判定，
 * 權限碼表達不了。這裡是**前端顯示用**的鏡像判斷（例如要不要出現「編輯」
 * 按鈕）；真正擋得住的判定在 API 的 `RequireOwnership`。
 */
export function ownsRecord(
  user: { isSuperAdmin: boolean; roles: RoleCode[]; id: number } | null | undefined,
  ownerUserId: number | null,
): boolean {
  if (!user) return false
  if (user.isSuperAdmin) return true
  if (!user.roles.includes('Doctor')) return true // 非醫師角色不受此限制（權限碼本身已經夠用）
  return ownerUserId === user.id
}
