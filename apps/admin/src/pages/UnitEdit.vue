<script setup lang="ts">
// 通用編輯路由：/admin/{unit}/{id}。
//
// `id === 'new'` 是防呆用的後備路徑——正常流程是 ListPage 的「＋ 新增」，
// 它會先問齊「建立時就必須有值」的欄位，建立完成再導到真正的數字 id
// （這樣 EditPage 不用同時處理「建立中」與「編輯中」兩種模式）。
// 這裡處理的是使用者手動打 /admin/xxx/new 網址的情況：導回清單頁並打開新增表單。
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import EditPage from '@/components/EditPage.vue'
import { currentUser } from '@/auth'
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

/**
 * 🔴 **改成導回清單頁，不再自己建一筆空白草稿。**
 *
 * 原本這裡直接 `content.create({ title: '未命名' })`，而 API 對五個單元
 * （文章／療程／案例／FAQ／據點）在建立時就要求分類、療程、法規揭露、經緯度
 * 這些欄位有值（`ContentHandler.Apply*Fields` 的 `isCreate` 分支），
 * 還一律要求一個合法的 slug —— 所以手打 `/admin/article/new` 的結果是
 * 一個沒有人接住的 400，畫面停在空白。
 *
 * 正確的入口是清單頁的「＋ 新增」，它會先問齊那幾欄再送出。
 */
function goToListForCreate() {
  if (!currentUser()) return
  router.replace(`/${unit.value}?new=1`)
}

// ⚠️ 用 onMounted 而不是頂層 await——<script setup> 的頂層 await 會讓元件
// 變成非同步元件，沒有 <Suspense> 邊界會出錯。
onMounted(() => {
  if (idParam.value === 'new') goToListForCreate()
})
watch(idParam, (val) => { if (val === 'new') goToListForCreate() })
</script>

<template>
  <EditPage v-if="idParam !== 'new'" :unit="unit" :id="id" />
</template>
