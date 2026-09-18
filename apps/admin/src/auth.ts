// 後台認證狀態。
//
// 🔴 docs/09-frontend.md §8：「access token 只放記憶體」。憑證本體由 src/api/http.ts
// 保管，這裡只放「目前是誰」。
//
// ⚠️ **重新整理分頁不再登出**（2026-09-18）：refresh token 放在 sessionStorage，
// 開頁時由 restoreSession() 換回一組憑證與身分。取捨與邊角都寫在 http.ts 的憑證段落 ——
// 舊敘述「重新整理分頁就會登出，這是設計行為」已作廢。
//
// 登入是單段的帳號密碼（docs/11-backend-design.md §5.2）——不做雙因素
// （2026-09-11 院方決定）。⚠️ 連帶後果：**登入次數限制是唯一的防線**，
// 前端不要加任何會放寬判定的東西（「記住此裝置」之類）。

import { reactive, readonly } from 'vue'
import type { CurrentUser } from './types'
import { adminApi } from './api/client'
import { hasTokens, onSessionExpired } from './api/http'

interface AuthState {
  user: CurrentUser | null
}

const state = reactive<AuthState>({ user: null })

export const authState = readonly(state)

export function isAuthenticated(): boolean {
  // 兩個條件都要：憑證在 http.ts、身分在這裡，任一邊沒有就不算登入。
  return Boolean(state.user) && hasTokens()
}

export function currentUser(): CurrentUser | null {
  return state.user
}

/** 內部使用：登入成功後寫入 session。不對外匯出，避免元件繞過流程直接寫入。 */
export function _setSession(user: CurrentUser) {
  state.user = user
}

/**
 * 開頁時的還原：sessionStorage 裡若有 refresh token 就換回身分。
 *
 * 🔴 **必須在掛載 app 之前 await 完**（見 main.ts）—— 路由守衛只看
 * isAuthenticated()，換發還沒回來就掛載的話，使用者會先被彈去登入頁，
 * 然後在原地看著自己「其實是登入的」。
 */
export async function restoreSession(): Promise<boolean> {
  const user = await adminApi.auth.restore()
  if (!user) return false
  state.user = user
  return true
}

export function logout() {
  // ⚠️ 不等它完成（使用者按了登出就該立刻離開），但**要接住錯誤** ——
  //    `void` 一個會 reject 的 promise 等於製造一個沒有人處理的 rejection。
  //    伺服器那邊撤不撤銷得了 token 不影響「本機忘掉身分」這件事。
  adminApi.auth.logout().catch((e) => console.error('登出時撤銷 token 失敗（本機已登出）', e))
  state.user = null
}

/**
 * refresh 也換不回來時（token 過期／被撤銷／帳號被停用）由 http.ts 呼叫。
 *
 * ⚠️ 這裡只清掉身分，**不做導頁** —— 導頁是 router 的事，而這支可能在任何一個
 * 非同步請求的中途被呼叫。清掉之後下一次路由守衛自然會把人送回登入頁。
 */
onSessionExpired(() => {
  state.user = null
})
