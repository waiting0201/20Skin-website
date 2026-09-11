<script setup lang="ts">
// 後台外框：側邊選單（依權限顯示）＋ 頂列（麵包屑 ＋ 使用者 ＋ 登出）。
//
// ⚠️ 這是後台專用 layout（獨立 SPA，不再與前台共用同一個 Nuxt app）。
// 樣式來自 src/admin.css，在 src/main.ts 統一匯入一次，這裡不重複 import。
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { currentUser, logout } from '@/auth'
import { can, hasPermission } from '@/permissions'
import { UNIT_REGISTRY } from '@/units'
import { ROLE_LABEL, type UnitKey } from '@/types'

const route = useRoute()
const router = useRouter()
const user = computed(() => currentUser())
const permCtx = computed(() => (user.value ? { roles: user.value.roles, isSuperAdmin: user.value.isSuperAdmin } : null))

interface NavItem {
  label: string
  href: string
  visible: boolean
}

const unitNavItems = computed<NavItem[]>(() =>
  (Object.keys(UNIT_REGISTRY) as UnitKey[]).map((key) => ({
    label: UNIT_REGISTRY[key].label,
    href: `/${key}`,
    visible: can(permCtx.value, key, 'view'),
  })),
)

// 系統類畫面（docs/06-page-inventory.md §5 的其餘 11 個）。
// 顯示與否一律照權限碼判斷，與 router.ts 的 SYSTEM_SCREENS 一一對應。
// ⚠️ 兩處的權限碼要一致 —— 選單看得到卻進不去，比選單不顯示更難查。
const SYSTEM_NAV: { label: string; href: string; permission: string }[] = [
  { label: '審核佇列', href: '/review', permission: 'review.view' },
  { label: '未命中題目清單', href: '/questions', permission: 'question.view' },
  { label: 'sitemap 設定', href: '/sitemap', permission: 'setting.view' },
  { label: '301 轉址管理', href: '/redirects', permission: 'redirect.view' },
  { label: 'FAQ／語料匯出', href: '/export', permission: 'setting.view' },
  { label: '首頁版位編排', href: '/home-sections', permission: 'home.view' },
  { label: '導覽選單與頁尾', href: '/menu', permission: 'menu.view' },
  { label: '全站設定', href: '/settings', permission: 'setting.view' },
  { label: '帳號管理', href: '/users', permission: 'user.view' },
  { label: '角色權限設定', href: '/roles', permission: 'role.view' },
]

const systemNavItems = computed<NavItem[]>(() =>
  SYSTEM_NAV.map((item) => ({
    label: item.label,
    href: item.href,
    visible: hasPermission(permCtx.value, item.permission),
  })),
)

const breadcrumb = computed(() => {
  // ⚠️ vue-router 的 base（'/admin/'）已經吃掉 /admin 這一段，
  // 這裡的 route.path 不再帶 /admin 前綴（對照 Nuxt 版是 ['admin', unit?, id?]）。
  const segments = route.path.split('/').filter(Boolean) // [unit?, id?]
  const trail: { label: string; href: string }[] = [{ label: '儀表板', href: '/' }]
  const unit = segments[0] as UnitKey | undefined
  if (unit && UNIT_REGISTRY[unit]) {
    trail.push({ label: UNIT_REGISTRY[unit].label, href: `/${unit}` })
    const id = segments[1]
    if (id) trail.push({ label: id === 'new' ? `新增${UNIT_REGISTRY[unit].labelSingular}` : `編輯 #${id}`, href: route.path })
  }
  return trail
})

function onLogout() {
  logout()
  router.push('/login')
}
</script>

<template>
  <div class="adm-app">
    <div class="adm-shell">
      <aside class="adm-sidebar">
        <div class="adm-sidebar__brand">
          <!-- 動態綁定：靜態 src="/assets/..." 會被 Vue 編譯器在 build 時轉成
               import 交給 Rollup 解析，但這個檔案在後台專案裡並不存在——它是
               正式站的公開素材，交給瀏覽器在執行期直接打 /assets/ 這條路徑
               （dev 靠 scripts/link-assets.mjs 的 symlink）。 -->
          <img :src="'/assets/logo.jpg'" alt="" width="32" height="32">
          <div>
            <strong>20SKIN 後台</strong>
            <span>Admin Console</span>
          </div>
        </div>

        <nav class="adm-nav">
          <div class="adm-nav__group">
            <p class="adm-nav__label">系統</p>
            <RouterLink class="adm-nav__link" to="/" :class="{ 'is-active': route.path === '/' }">
              儀表板
            </RouterLink>
          </div>

          <div class="adm-nav__group">
            <p class="adm-nav__label">內容模型</p>
            <template v-for="item in unitNavItems" :key="item.href">
              <RouterLink
                v-if="item.visible"
                class="adm-nav__link"
                :to="item.href"
                :class="{ 'is-active': route.path.startsWith(item.href) }"
              >
                {{ item.label }}
              </RouterLink>
            </template>
          </div>

          <div class="adm-nav__group">
            <p class="adm-nav__label">系統</p>
            <template v-for="item in systemNavItems" :key="item.href">
              <RouterLink
                v-if="item.visible"
                class="adm-nav__link"
                :to="item.href"
                :class="{ 'is-active': route.path.startsWith(item.href) }"
              >
                {{ item.label }}
              </RouterLink>
            </template>
          </div>
        </nav>

        <div class="adm-sidebar__foot">
          docs/06 §5：31 個後台畫面。
        </div>
      </aside>

      <div>
        <header class="adm-topbar">
          <nav class="adm-breadcrumb" aria-label="麵包屑">
            <template v-for="(item, i) in breadcrumb" :key="item.href">
              <RouterLink v-if="i < breadcrumb.length - 1" :to="item.href">{{ item.label }}</RouterLink>
              <span v-else class="adm-breadcrumb__current">{{ item.label }}</span>
              <span v-if="i < breadcrumb.length - 1" class="adm-breadcrumb__sep">/</span>
            </template>
          </nav>

          <div class="adm-topbar__user">
            <div v-if="user">
              <div class="adm-topbar__name">{{ user.displayName }}</div>
              <div class="adm-topbar__role">{{ user.isSuperAdmin ? '超級管理員' : user.roles.map((r) => ROLE_LABEL[r]).join('、') }}</div>
            </div>
            <button type="button" class="btn btn--line btn--sm" @click="onLogout">登出</button>
          </div>
        </header>

        <main class="adm-main">
          <slot />
        </main>
      </div>
    </div>
  </div>
</template>
