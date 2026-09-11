// 權限碼 × 五種角色。與 docs/10-api.md §4 逐條對齊。
//
// ⚠️⚠️ UI 的權限判斷只管「看不看得到」，不是安全邊界。⚠️⚠️
// 五種角色的授權一律在 API 內驗證（docs/11-backend-design.md §5.3：授權集中在
// Router，預設拒絕）。這裡的 hasPermission() 只決定畫面要不要出現某個按鈕或
// 某條路由要不要導去 403 頁——前端藏起來的按鈕，後端還是要擋。之後接上真的
// api.20skin.tw 時，這份表格要跟後端的 GetRequiredPermission() 保持同步，
// 但**不能拿它取代**後端驗證。

import type { RoleCode, UnitKey } from './types'
import { UNIT_KEYS } from './types'

export type PermissionAction =
  | 'view'
  | 'edit'
  | 'seo'
  | 'submit'
  | 'publish'
  | 'delete'
  | 'export'
  | 'decide'
  | 'trigger'

/** `{unit}.{action}` 或系統類端點（review／home／menu／setting／redirect／question／user／role／rebuild）。 */
export type PermissionCode = string

function unitPerm(unit: UnitKey, action: PermissionAction): PermissionCode {
  return `${unit}.${action}`
}

/**
 * 內容編輯：view／edit／submit／delete／seo／關聯與排序（走 `{unit}.edit`）。
 * ⚠️ 沒有任何 `{unit}.publish`——這是三段式工作流的前提（docs/02 §4）。
 * ⚠️ `term.delete` 刻意不在這裡——刪除分類會動到 URL 結構與 301 對照表，
 * 限超級管理員（docs/10-api.md §3.3），見下方 canDeleteTerm()。
 */
const EDITOR_PERMISSIONS: PermissionCode[] = [
  ...UNIT_KEYS.flatMap((u) => [
    unitPerm(u, 'view'),
    unitPerm(u, 'edit'),
    unitPerm(u, 'submit'),
    ...(u === 'term' ? [] : [unitPerm(u, 'delete')]),
    unitPerm(u, 'seo'),
  ]),
  // 系統類（docs/10-api.md §3.4）。⚠️ 首頁版位編排走送審、不直接發布，
  // 所以只有 edit 與 submit，沒有 home.publish。
  'upload.file',
  'home.view',
  'home.edit',
  'home.submit',
  'question.view',
  'question.edit',
]

/** 醫師：doctor.edit／article.edit（僅 OwnerUserId=自己，資料列層級判定見 checkOwnership）＋ review.decide（指派的醫學審閱）。 */
const DOCTOR_PERMISSIONS: PermissionCode[] = [
  unitPerm('doctor', 'view'),
  unitPerm('doctor', 'edit'),
  unitPerm('article', 'view'),
  unitPerm('article', 'edit'),
  'review.decide',
  // 編輯自己的內容時要能換圖
  'upload.file',
]

/** 行銷：全單元 view ＋ {unit}.seo ＋ FAQ 的 faq.edit。沒有其他 edit。 */
const MARKETING_PERMISSIONS: PermissionCode[] = [
  ...UNIT_KEYS.flatMap((u) => [unitPerm(u, 'view'), unitPerm(u, 'seo')]),
  unitPerm('faq', 'edit'),
  // SEO 區塊有 OG 分享圖，所以要能上傳
  'upload.file',
  'question.view',
  'home.view',
]

/** 審核者：全單元 view ＋ review.decide ＋ {unit}.publish。 */
const REVIEWER_PERMISSIONS: PermissionCode[] = [
  ...UNIT_KEYS.flatMap((u) => [unitPerm(u, 'view'), unitPerm(u, 'publish')]),
  'review.view',
  'review.decide',
  'home.view',
  'home.publish',
  'question.view',
]

/** 非九個單元的系統類端點（docs/10-api.md §3.4）。超級管理員以外都拿不到。 */
export const SUPERADMIN_ONLY_PERMISSIONS: PermissionCode[] = [
  'setting.view',
  'setting.edit',
  'menu.view',
  'menu.edit',
  'user.view',
  'user.edit',
  'role.view',
  'role.edit',
  'redirect.view',
  'redirect.edit',
  'redirect.export',
  // 全站重建是維運動作；一般發布本來就會自動觸發（docs/11 §10），
  // 手動那一顆限超管，避免有人把它當重新整理在按。
  'rebuild.trigger',
  unitPerm('term', 'edit'), // 新增／刪除分類；新增標籤是 term.edit 本身給 Editor，這裡特判在 checkTermMutation
]

const ROLE_PERMISSIONS: Record<Exclude<RoleCode, 'SuperAdmin'>, PermissionCode[]> = {
  Editor: EDITOR_PERMISSIONS,
  Doctor: DOCTOR_PERMISSIONS,
  Marketing: MARKETING_PERMISSIONS,
  Reviewer: REVIEWER_PERMISSIONS,
}

export interface PermissionContext {
  roles: RoleCode[]
  isSuperAdmin: boolean
}

/** 超級管理員永遠通過（docs/11 §5.3：`is_superadmin = true` 自動通過）。 */
export function hasPermission(ctx: PermissionContext | null | undefined, code: PermissionCode): boolean {
  if (!ctx) return false
  if (ctx.isSuperAdmin) return true
  return ctx.roles.some((role) => (ROLE_PERMISSIONS[role as Exclude<RoleCode, 'SuperAdmin'>] ?? []).includes(code))
}

export function can(ctx: PermissionContext | null | undefined, unit: UnitKey, action: PermissionAction): boolean {
  return hasPermission(ctx, unitPerm(unit, action))
}

/**
 * docs/10-api.md §3.3：`term` 的 POST／DELETE 限超級管理員（動 URL 結構與
 * 301 對照表）；新增標籤屬 term.edit（Editor 就有）。
 * `page`：系統頁不可新增／刪除／改 slug；法務三頁限超級管理員。
 * 這兩條是「單元宣告」表達不了的逐單元例外，集中寫在這裡，
 * ListPage／EditPage 呼叫，不要在畫面元件裡各寫一份判斷。
 */
export function canCreateTerm(ctx: PermissionContext | null | undefined, isTag: boolean): boolean {
  if (ctx?.isSuperAdmin) return true
  if (isTag) return can(ctx, 'term', 'edit')
  return false
}
export function canDeleteTerm(ctx: PermissionContext | null | undefined): boolean {
  return Boolean(ctx?.isSuperAdmin)
}
export function canEditLegalPage(ctx: PermissionContext | null | undefined): boolean {
  return Boolean(ctx?.isSuperAdmin)
}

/**
 * docs/11-backend-design.md §5.4：醫師只能改自己的內容，資料列層級判定，
 * 權限碼表達不了。這裡是**前端顯示用**的鏡像判斷（例如要不要出現「編輯」
 * 按鈕）；真正擋得住的判定在 API 的 `RequireOwnership`。
 */
export function ownsRecord(user: { isSuperAdmin: boolean; roles: RoleCode[]; id: number } | null | undefined, ownerUserId: number | null): boolean {
  if (!user) return false
  if (user.isSuperAdmin) return true
  if (!user.roles.includes('Doctor')) return true // 非醫師角色不受此限制（權限碼本身已經夠用）
  return ownerUserId === user.id
}
