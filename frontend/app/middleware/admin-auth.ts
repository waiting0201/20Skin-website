// 後台登入守門。套用在除了 /admin/login 以外的所有後台頁面
// （definePageMeta({ middleware: 'admin-auth' })）。
//
// ⚠️ 這是「體驗」層的守門，不是安全邊界——真正擋得住未授權存取的是
// api.20skin.tw 對每一個 /admin/* 端點的 Bearer token 驗證（docs/11 §5.3：
// 授權集中在 Router，預設拒絕）。這裡只是避免使用者在沒有 token 時
// 對著一堆打不通的畫面發呆，順手做成「導回登入頁」的體驗。
//
// access token 只放記憶體（docs/09 §8），所以重新整理分頁必然回到未登入
// 狀態——這是設計行為，見 app/admin/auth.ts 的說明。
import { isAuthenticated } from '~/admin/auth'

export default defineNuxtRouteMiddleware((to) => {
  if (to.path === '/admin/login') return
  if (!isAuthenticated()) {
    return navigateTo({ path: '/admin/login', query: { redirect: to.fullPath } })
  }
})
