<script setup lang="ts">
// 通用編輯路由：/admin/{unit}/{id}。
//
// `id === 'new'` 是防呆用的後備路徑——正常流程是 ListPage 的「新增」按鈕
// 直接呼叫 adminApi.content.create() 建立草稿後導到真正的數字 id
// （這樣 EditPage 不用同時處理「建立中」與「編輯中」兩種模式）。
// 這裡處理的是使用者手動打 /admin/xxx/new 網址的情況。
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import EditPage from '~/admin/components/EditPage.vue'
import { adminApi } from '~/admin/api/client'
import { currentUser } from '~/admin/auth'
import { getUnitDefinition, UNIT_REGISTRY } from '~/admin/units'
import type { UnitKey } from '~/admin/types'

definePageMeta({
  layout: 'admin',
  middleware: 'admin-auth',
  validate: (route) => Boolean(getUnitDefinition(route.params.unit as string)),
})

const route = useRoute()
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
  await navigateTo(`/admin/${unit.value}/${created.id}`, { replace: true })
}

if (idParam.value === 'new') await createFromNew()
watch(idParam, (val) => { if (val === 'new') createFromNew() })
</script>

<template>
  <EditPage v-if="idParam !== 'new'" :unit="unit" :id="id" />
</template>
