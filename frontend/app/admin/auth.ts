// 後台認證狀態。
//
// docs/09-frontend.md §8：「access token 只放記憶體，refresh 走端點。放
// localStorage 等於把 token 交給任何一次 XSS」。這裡刻意用模組層級的
// plain reactive 物件，而不是任何會落地儲存的 API——重新整理分頁就會登出，
// 這是設計行為，不是還沒做完。
//
// 雙因素是登入流程的第二段（docs/11-backend-design.md §5.2）：第一段通過
// 只給 challengeId，不發 token；驗證碼通過才建立 session。

import { reactive, readonly } from 'vue'
import type { CurrentUser } from './types'
import { adminApi } from './api/client'

interface AuthState {
  user: CurrentUser | null
  /** 假的 access token，只用來示意「有沒有登入」，不是真的 JWT。 */
  token: string | null
}

const state = reactive<AuthState>({ user: null, token: null })

export const authState = readonly(state)

export function isAuthenticated(): boolean {
  return Boolean(state.token && state.user)
}

export function currentUser(): CurrentUser | null {
  return state.user
}

/** 內部使用：登入／2FA 驗證成功後寫入 session。不對外匯出，避免元件繞過流程直接寫入。 */
export function _setSession(user: CurrentUser, token: string) {
  state.user = user
  state.token = token
}

export function logout() {
  adminApi.auth.logout()
  state.user = null
  state.token = null
}
