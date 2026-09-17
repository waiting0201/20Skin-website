// 後台路由表。取代原本 Nuxt 的檔案路由 ＋ definePageMeta ＋ route middleware。
//
// ⚠️ Vite 的 `base: '/admin/'`（vite.config.ts）已經吃掉了 `/admin` 這一段，
// 所以這裡的路徑一律不帶 `/admin` 前綴：`createWebHistory('/admin/')` 負責
// 把瀏覽器網址的 `/admin` 部分對應到下面的 `/`、`/login`、`/:unit`、`/:unit/:id`。
// 程式裡任何要組路徑字串的地方（router.push、RouterLink、redirect）都不要
// 再帶 `/admin` 前綴，否則會變成 `/admin/admin/xxx`。
import { createRouter, createWebHistory, type RouteLocationNormalized } from 'vue-router'
import { currentUser, isAuthenticated } from '@/auth'
import { hasPermission } from '@/permissions'
import { getUnitDefinition } from '@/units'

const Dashboard = () => import('@/pages/Dashboard.vue')
const Login = () => import('@/pages/Login.vue')
const UnitList = () => import('@/pages/UnitList.vue')
const UnitEdit = () => import('@/pages/UnitEdit.vue')

// 系統類畫面（docs/06-page-inventory.md §5）。九個內容模型走上面的通用
// /:unit 路由，這些各有各的形狀，所以一個畫面一支元件。
//
// 🔴 **這是系統類畫面的單一清單：路由與側邊選單都讀它**（`label` 就是選單文字）。
//    2026-09-17 之前 AdminLayout.vue 另外維護了一份 SYSTEM_NAV，兩份的權限碼
//    分岔了 —— 選單那份用的是 `review.view`／`setting.view`／`user.view` 這類
//    **已作廢的舊命名**（CLAUDE.md 決策 16、permissions.ts 檔頭：權限碼只有
//    docs/08 §A-2 那 31 列，裡面沒有任何 `*.view`）。
//    後果是十個項目對非超管一律查不到權限、整組選單消失，而路由其實放行。
//    ⚠️ 超級管理員一律通過，所以用超管帳號測是看不出來的 —— 這也是它能一直
//       留著沒被發現的原因。合成一份之後，這種分岔在結構上就不可能發生。
export const SYSTEM_SCREENS: {
  path: string
  name: string
  label: string
  permission: string
  component: () => Promise<unknown>
}[] = [
  { path: '/review',        name: 'review',        label: '審核佇列',       permission: 'review.approve',   component: () => import('@/pages/Review.vue') },
  { path: '/questions',     name: 'questions',     label: '未命中題目清單', permission: 'content.faq.edit', component: () => import('@/pages/Questions.vue') },
  { path: '/sitemap',       name: 'sitemap',       label: 'sitemap 設定',   permission: 'settings.edit',    component: () => import('@/pages/SitemapSettings.vue') },
  { path: '/redirects',     name: 'redirects',     label: '301 轉址管理',   permission: 'redirect.manage',  component: () => import('@/pages/Redirects.vue') },
  { path: '/export',        name: 'export',        label: 'FAQ／語料匯出',  permission: 'settings.edit',    component: () => import('@/pages/Export.vue') },
  { path: '/home-sections', name: 'home-sections', label: '首頁版位編排',   permission: 'home.arrange',     component: () => import('@/pages/HomeSections.vue') },
  { path: '/menu',          name: 'menu',          label: '導覽選單與頁尾', permission: 'menu.edit',        component: () => import('@/pages/Menu.vue') },
  { path: '/settings',      name: 'settings',      label: '全站設定',       permission: 'settings.edit',    component: () => import('@/pages/Settings.vue') },
  { path: '/users',         name: 'users',         label: '帳號管理',       permission: 'account.manage',   component: () => import('@/pages/Users.vue') },
  { path: '/roles',         name: 'roles',         label: '角色權限設定',   permission: 'account.manage',   component: () => import('@/pages/Roles.vue') },
]

declare module 'vue-router' {
  interface RouteMeta {
    /** false＝不套 AdminLayout（目前只有登入頁），省略＝套用。 */
    layout?: false
    /** 進入這個畫面需要的權限碼。⚠️ 這是體驗層的守門，不是安全邊界（見下方 beforeEach）。 */
    permission?: string
  }
}

/** 對應原本 [unit]/index.vue、[unit]/[id].vue 的 `definePageMeta({ validate })`：unit 不存在就導回儀表板。 */
function requireValidUnit(to: RouteLocationNormalized) {
  if (!getUnitDefinition(to.params.unit as string)) return { path: '/' }
}

const router = createRouter({
  history: createWebHistory('/admin/'),
  routes: [
    { path: '/', name: 'dashboard', component: Dashboard },
    { path: '/login', name: 'login', component: Login, meta: { layout: false } },
    // ⚠️ 系統類畫面必須排在 /:unit 之前 —— 否則 /review 會被當成 unit 名稱，
    // 而 requireValidUnit 找不到該單元就把人導回儀表板（症狀是「點了沒反應」）。
    ...SYSTEM_SCREENS.map((s) => ({
      path: s.path,
      name: s.name,
      component: s.component as never,
      meta: { permission: s.permission },
    })),
    { path: '/:unit', name: 'unit-list', component: UnitList, beforeEnter: requireValidUnit },
    { path: '/:unit/:id', name: 'unit-edit', component: UnitEdit, beforeEnter: requireValidUnit },
  ],
})

// 對應原本的 middleware/admin-auth.ts：除了登入頁以外的所有後台頁面都要求
// 已登入，否則導回登入頁並帶上 redirect。
//
// ⚠️ 這是「體驗」層的守門，不是安全邊界——真正擋得住未授權存取的是
// api.20skin.tw 對每一個 /admin/* 端點的 Bearer token 驗證（docs/11 §5.3：
// 授權集中在 Router，預設拒絕）。這裡只是避免使用者在沒有 token 時
// 對著一堆打不通的畫面發呆，順手做成「導回登入頁」的體驗。
//
// access token 只放記憶體（docs/09 §8），所以重新整理分頁必然回到未登入
// 狀態——這是設計行為，見 src/auth.ts 的說明。
router.beforeEach((to) => {
  if (to.path === '/login') return true
  if (!isAuthenticated()) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  // 權限不足就導回儀表板。同樣是體驗層 —— 真正擋得住的是 API 端的權限檢查
  // （docs/11 §5.3 預設拒絕），這裡只是別讓人點進一個必然打不通的畫面。
  const required = to.meta.permission
  if (required) {
    const u = currentUser()
    const ctx = u ? { roles: u.roles, isSuperAdmin: u.isSuperAdmin } : null
    if (!hasPermission(ctx, required)) return { path: '/' }
  }
  return true
})

export default router
