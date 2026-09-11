<script setup lang="ts">
// 通用清單路由：/admin/{unit}。九個內容模型共用同一個檔案
// （docs/09-frontend.md §8：不要為 18 個畫面各寫一份）。
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import ListPage from '@/components/ListPage.vue'
import type { UnitKey } from '@/types'

// layout／登入守門／unit 合法性檢查改由 src/router.ts 的路由表 meta 與
// beforeEnter 處理（對應原本 Nuxt 的 definePageMeta({ layout, middleware, validate })）。

const route = useRoute()
// ⚠️ 用 computed 而不是一次性讀值——側邊選單在 /admin/treatment 與
// /admin/doctor 之間切換時，Vue Router 會重用同一個路由元件實例、
// 不會重跑 setup()，一次性讀值會停在第一次進來的單元不會再變。
const unit = computed(() => route.params.unit as UnitKey)
</script>

<template>
  <ListPage :unit="unit" />
</template>
