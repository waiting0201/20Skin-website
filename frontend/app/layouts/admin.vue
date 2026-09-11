<script setup lang="ts">
// 後台外框：側邊選單（依權限顯示）＋ 頂列（麵包屑 ＋ 使用者 ＋ 登出）。
//
// ⚠️ 這是新建的後台專用 layout，不動 app/layouts/default.vue（那是前台的）。
// 樣式來自 app/admin/admin.css，透過下面的 CSS import 交給 Vite 打包——
// 這是後台 SPA 專屬做法，不受「照抄 mockup」四條規則管（frontend/README.md）。
import '~/admin/admin.css'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { authState, currentUser, logout } from '~/admin/auth'
import { can } from '~/admin/permissions'
import { UNIT_REGISTRY } from '~/admin/units'
import { ROLE_LABEL, type UnitKey } from '~/admin/types'

const route = useRoute()
const user = computed(() => currentUser())
const permCtx = computed(() => (user.value ? { roles: user.value.roles, isSuperAdmin: user.value.isSuperAdmin } : null))

interface NavItem {
  label: string
  href: string
  visible: boolean
  /** 下一輪才做的畫面（docs/06 §5 的其餘 13 個），先留位置不留連結。 */
  comingSoon?: boolean
}

const unitNavItems = computed<NavItem[]>(() =>
  (Object.keys(UNIT_REGISTRY) as UnitKey[]).map((key) => ({
    label: UNIT_REGISTRY[key].label,
    href: `/admin/${key}`,
    visible: can(permCtx.value, key, 'view'),
  })),
)

// 下一輪畫面：架構（權限碼、路由慣例、資料層）已經留好，這裡先用灰階項目
// 標示位置，避免點進 404，也讓審閱的人看得出 31 個畫面的全貌（docs/06 §5）。
const comingSoonItems: NavItem[] = [
  { label: '審核佇列', href: '/admin/review', visible: true, comingSoon: true },
  { label: '媒體庫', href: '/admin/media', visible: true, comingSoon: true },
  { label: '未命中題目清單', href: '/admin/questions', visible: true, comingSoon: true },
  { label: 'sitemap 設定', href: '/admin/sitemap', visible: true, comingSoon: true },
  { label: '301 轉址管理', href: '/admin/redirects', visible: true, comingSoon: true },
  { label: 'FAQ／語料匯出', href: '/admin/export', visible: true, comingSoon: true },
  { label: '首頁版位編排', href: '/admin/home-sections', visible: true, comingSoon: true },
  { label: '導覽選單與頁尾', href: '/admin/menu', visible: true, comingSoon: true },
  { label: '全站設定', href: '/admin/settings', visible: true, comingSoon: true },
  { label: '帳號管理', href: '/admin/users', visible: true, comingSoon: true },
  { label: '角色權限設定', href: '/admin/roles', visible: true, comingSoon: true },
]

const visibleComingSoon = computed(() =>
  comingSoonItems.filter((item) => {
    if (item.href === '/admin/users' || item.href === '/admin/roles' || item.href === '/admin/settings' || item.href === '/admin/menu') {
      return Boolean(user.value?.isSuperAdmin)
    }
    return true
  }),
)

const breadcrumb = computed(() => {
  const segments = route.path.split('/').filter(Boolean) // ['admin', unit?, id?]
  const trail: { label: string; href: string }[] = [{ label: '儀表板', href: '/admin' }]
  const unit = segments[1] as UnitKey | undefined
  if (unit && UNIT_REGISTRY[unit]) {
    trail.push({ label: UNIT_REGISTRY[unit].label, href: `/admin/${unit}` })
    const id = segments[2]
    if (id) trail.push({ label: id === 'new' ? `新增${UNIT_REGISTRY[unit].labelSingular}` : `編輯 #${id}`, href: route.path })
  }
  return trail
})

function onLogout() {
  logout()
  navigateTo('/admin/login')
}
</script>

<template>
  <div class="adm-app">
    <div class="adm-shell">
      <aside class="adm-sidebar">
        <div class="adm-sidebar__brand">
          <img src="/assets/logo.jpg" alt="" width="32" height="32">
          <div>
            <strong>20SKIN 後台</strong>
            <span>Admin Console</span>
          </div>
        </div>

        <nav class="adm-nav">
          <div class="adm-nav__group">
            <p class="adm-nav__label">系統</p>
            <NuxtLink class="adm-nav__link" to="/admin" :class="{ 'is-active': route.path === '/admin' }">
              儀表板
            </NuxtLink>
          </div>

          <div class="adm-nav__group">
            <p class="adm-nav__label">內容模型</p>
            <template v-for="item in unitNavItems" :key="item.href">
              <NuxtLink
                v-if="item.visible"
                class="adm-nav__link"
                :to="item.href"
                :class="{ 'is-active': route.path.startsWith(item.href) }"
              >
                {{ item.label }}
              </NuxtLink>
            </template>
          </div>

          <div class="adm-nav__group">
            <p class="adm-nav__label">下一輪（架構已留位置）</p>
            <span
              v-for="item in visibleComingSoon"
              :key="item.href"
              class="adm-nav__link"
              style="opacity:.45;cursor:not-allowed"
              :title="`${item.label}：docs/06-page-inventory.md §5，本輪未實作`"
            >
              {{ item.label }}
              <span class="adm-nav__badge">later</span>
            </span>
          </div>
        </nav>

        <div class="adm-sidebar__foot">
          docs/06 §5：31 個後台畫面，本輪完成 9 個內容模型 ＋ 儀表板 ＋ 登入。
        </div>
      </aside>

      <div>
        <header class="adm-topbar">
          <nav class="adm-breadcrumb" aria-label="麵包屑">
            <template v-for="(item, i) in breadcrumb" :key="item.href">
              <NuxtLink v-if="i < breadcrumb.length - 1" :to="item.href">{{ item.label }}</NuxtLink>
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
