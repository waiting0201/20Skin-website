<script setup lang="ts">
// 通用編輯路由：/admin/{unit}/{id}。
//
// `id === 'new'` 是防呆用的後備路徑——正常流程是 ListPage 的「新增」按鈕
// 直接呼叫 adminApi.content.create() 建立草稿後導到真正的數字 id
// （這樣 EditPage 不用同時處理「建立中」與「編輯中」兩種模式）。
// 這裡處理的是使用者手動打 /admin/xxx/new 網址的情況。
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import EditPage from '@/components/EditPage.vue'
import { adminApi } from '@/api/client'
import { currentUser } from '@/auth'
import { UNIT_REGISTRY } from '@/units'
import type { UnitKey } from '@/types'

// layout／登入守門／unit 合法性檢查改由 src/router.ts 的路由表 meta 與
// beforeEnter 處理（對應原本 Nuxt 的 definePageMeta({ layout, middleware, validate })）。

const route = useRoute()
const router = useRouter()
// ⚠️ 全部用 computed，不要一次性讀值——在清單頁點另一筆同單元的資料、
// 或未來從關聯欄位連到別的單元時，Vue Router 會重用同一個路由元件實例，
// 不會重跑 setup()，一次性讀值會停在第一次進來的那筆不會再變。
const unit = computed(() => route.params.unit as UnitKey)
const idParam = computed(() => route.params.id as string)
const id = computed(() => Number(idParam.value))

async function createFromNew() {
  const user = currentUser()
  if (!user) return
  const restricted = UNIT_REGISTRY[unit.value].ownershipRestricted && user.roles.includes('Doctor') && !user.isSuperAdmin
  const created = await adminApi.content.create(unit.value, { title: '未命名', ownerUserId: restricted ? user.id : undefined }, user.id)
  await router.replace(`/${unit.value}/${created.id}`)
}

// ⚠️ 這裡刻意用 onMounted 而不是頂層 await——<script setup> 的頂層 await
// 會讓元件變成非同步元件，沒有 <Suspense> 邊界會出錯。行為等價：進入畫面
// 時若 id 是 'new' 就立刻建立草稿並導頁。
onMounted(() => {
  if (idParam.value === 'new') createFromNew()
})
watch(idParam, (val) => { if (val === 'new') createFromNew() })
</script>

<template>
  <EditPage v-if="idParam !== 'new'" :unit="unit" :id="id" />
</template>
