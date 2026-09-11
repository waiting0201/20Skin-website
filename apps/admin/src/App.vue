<script setup lang="ts">
// 根元件：依路由 meta 決定要不要套 AdminLayout（對應原本 Nuxt 的
// `definePageMeta({ layout: false })` 只有登入頁例外，其餘頁面都是
// `layout: 'admin'`）。
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AdminLayout from '@/AdminLayout.vue'

const route = useRoute()
const useAdminLayout = computed(() => route.meta.layout !== false)
</script>

<template>
  <AdminLayout v-if="useAdminLayout">
    <RouterView />
  </AdminLayout>
  <RouterView v-else />
</template>
