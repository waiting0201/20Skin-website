<script setup lang="ts">
// 後台外框：側邊選單（依權限顯示）＋ 頂列（麵包屑 ＋ 使用者 ＋ 登出）。
//
// ⚠️ 這是後台專用 layout（獨立 SPA，不再與前台共用同一個 Nuxt app）。
// 樣式來自 src/admin.css，在 src/main.ts 統一匯入一次，這裡不重複 import。
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { currentUser, logout } from '@/auth'
import { can, hasPermission } from '@/permissions'
import { SYSTEM_SCREENS } from '@/router'
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

// 系統類畫面：清單直接讀 router.ts 的 SYSTEM_SCREENS，**這裡不再自己維護一份**。
//
// 🔴 2026-09-17 修掉的 bug：原本這裡有一份 SYSTEM_NAV，權限碼寫的是
//    `review.view`／`setting.view`／`user.view` 這類**已作廢的舊命名**
//    （CLAUDE.md 決策 16、permissions.ts 檔頭 —— 權限碼只有 docs/08 §A-2 那
//    31 列，沒有任何 `*.view`）。查不到的碼一律回 false，所以**非超管的人
//    整組「系統」選單十個項目全部不會出現**，而 router 用的是正確的碼、其實放行。
//    ⚠️ 超管一律通過，用超管帳號測完全看不出來 —— 這就是它一直沒被發現的原因。
//    現在兩邊同一份資料，分岔在結構上不可能再發生。
const systemNavItems = computed<NavItem[]>(() =>
  SYSTEM_SCREENS.map((screen) => ({
    label: screen.label,
    href: screen.path,
    visible: hasPermission(permCtx.value, screen.permission),
  })),
)

// 選單分組（accordion）。**單開式：開一組就關掉另一組**（Tim 指定 2026-09-17）。
// 因此狀態是「哪一組開著」一個值，不是每組一個布林 —— 用布林表的話
// 「同時兩組都開」在型別上仍是合法狀態，遲早會有人寫出那種寫法。
// null＝全關（點自己可以收起來）。
const navGroups = computed(() => [
  { key: 'content', label: '內容模型', items: unitNavItems.value },
  { key: 'system', label: '系統', items: systemNavItems.value },
])

// 🔴 **預設全關**（Tim 指定 2026-09-17）。原本寫死 'system'，是 a944637 隨手挑的
//    初始值、沒有留下理由，而它只在儀表板看得到 —— 也就是每次登入第一眼都是
//    「系統」展開，但日常工作是九個內容模型，系統那組是偶爾才動的。
//    ⚠️ 這不影響下面的 landedGroup：深連結進到某一頁時，該頁所在的組仍然會打開。
const openGroup = ref<string | null>(null)

function toggleGroup(key: string) {
  openGroup.value = openGroup.value === key ? null : key
}

function isActive(href: string) {
  return route.path.startsWith(href)
}

// 深連結進來時（例如重新整理停在 /treatments/5），把該筆所在的組打開 ——
// 否則畫面上那一頁是「選單裡看不到的項目」。
// ⚠️ 只在載入時做一次，不掛 watch：SPA 內部切換不會重載，
//    使用者手動關掉的組不該又被路由推開。
const landedGroup = navGroups.value.find((group) =>
  group.items.some((item) => item.visible && isActive(item.href)),
)
if (landedGroup) openGroup.value = landedGroup.key

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
        <div class="adm-brand">
          <!-- 月洞門 motif（.c-ring 是 base.css 的基礎規則，adm-brand__ring 只補
               尺寸與位置，見 admin.css §4）。呼應前台頁尾 .c-ring--footer 的用法。 -->
          <div class="c-ring adm-brand__ring" aria-hidden="true"></div>
          <!-- 動態綁定：靜態 src="/assets/..." 會被 Vue 編譯器在 build 時轉成
               import 交給 Rollup 解析，但這個檔案在後台專案裡並不存在——它是
               正式站的公開素材，交給瀏覽器在執行期直接打 /assets/ 這條路徑
               （dev 靠 scripts/link-assets.mjs 的 symlink）。 -->
          <img class="adm-brand__mark" :src="'/assets/logo.jpg'" alt="" width="34" height="35">
          <div class="adm-brand__text">
            <strong class="adm-brand__name">20SKIN</strong>
            <span class="adm-brand__sub">後台管理</span>
          </div>
        </div>

        <nav class="adm-nav">
          <RouterLink class="adm-nav__link adm-nav__link--top" to="/" :class="{ 'is-active': route.path === '/' }">
            儀表板
          </RouterLink>

          <div v-for="group in navGroups" :key="group.key" class="adm-nav__group">
            <button
              type="button"
              class="adm-nav__toggle"
              :aria-expanded="openGroup === group.key"
              :aria-controls="`adm-nav-${group.key}`"
              @click="toggleGroup(group.key)"
            >
              <span>{{ group.label }}</span>
              <span class="adm-nav__chevron" aria-hidden="true">›</span>
            </button>
            <!-- ⚠️ 這裡不用 v-show：display:none 沒有中間值，緩動不起來。
                 改成永遠渲染、由 .is-open 控制高度（樣式見 admin.css）。 -->
            <div
              :id="`adm-nav-${group.key}`"
              class="adm-nav__panel"
              :class="{ 'is-open': openGroup === group.key }"
            >
              <div class="adm-nav__items">
                <template v-for="item in group.items" :key="item.href">
                  <RouterLink
                    v-if="item.visible"
                    class="adm-nav__link"
                    :to="item.href"
                    :class="{ 'is-active': isActive(item.href) }"
                  >
                    {{ item.label }}
                  </RouterLink>
                </template>
              </div>
            </div>
          </div>
        </nav>

      </aside>

      <div class="adm-body">
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
