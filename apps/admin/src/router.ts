// 後台路由表。取代原本 Nuxt 的檔案路由 ＋ definePageMeta ＋ route middleware。
//
// ⚠️ Vite 的 `base: '/admin/'`（vite.config.ts）已經吃掉了 `/admin` 這一段，
// 所以這裡的路徑一律不帶 `/admin` 前綴：`createWebHistory('/admin/')` 負責
// 把瀏覽器網址的 `/admin` 部分對應到下面的 `/`、`/login`、`/:unit`、`/:unit/:id`。
// 程式裡任何要組路徑字串的地方（router.push、RouterLink、redirect）都不要
// 再帶 `/admin` 前綴，否則會變成 `/admin/admin/xxx`。
import { createRouter, createWebHistory, type RouteLocationNormalized } from 'vue-router'
import { isAuthenticated } from '@/auth'
import { getUnitDefinition } from '@/units'

const Dashboard = () => import('@/pages/Dashboard.vue')
const Login = () => import('@/pages/Login.vue')
const UnitList = () => import('@/pages/UnitList.vue')
const UnitEdit = () => import('@/pages/UnitEdit.vue')

declare module 'vue-router' {
  interface RouteMeta {
    /** false＝不套 AdminLayout（目前只有登入頁），省略＝套用。 */
    layout?: false
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
  return true
})

export default router
