<script setup lang="ts">
// 根元件：依路由 meta 決定要不要套 AdminLayout（對應原本 Nuxt 的
// `definePageMeta({ layout: false })` 只有登入頁例外，其餘頁面都是
// `layout: 'admin'`）。
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AdminLayout from '@/AdminLayout.vue'
import { dismissError, unhandledErrors } from '@/app-errors'

const route = useRoute()
const useAdminLayout = computed(() => route.meta.layout !== false)
</script>

<template>
  <AdminLayout v-if="useAdminLayout">
    <RouterView />
  </AdminLayout>
  <RouterView v-else />

  <!-- 沒有被任何畫面接住的錯誤（見 src/app-errors.ts）。
       ⚠️ 這是安全網，不是正規的錯誤顯示位置——會出現在這裡，就代表某個動作
       漏了 try/catch，順手把它補回那個畫面裡。 -->
  <div v-if="unhandledErrors.errors.length" class="adm-errornet" role="alert">
    <div v-for="err in unhandledErrors.errors" :key="err.id" class="adm-errornet__item">
      <div>
        <strong>發生未預期的錯誤</strong>
        <p>{{ err.message }}</p>
      </div>
      <button type="button" class="adm-errornet__close" aria-label="關閉" @click="dismissError(err.id)">✕</button>
    </div>
  </div>
</template>

<style scoped>
.adm-errornet {
  position: fixed;
  right: var(--sp-4);
  bottom: var(--sp-4);
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  max-width: min(420px, calc(100vw - var(--sp-4) * 2));
}
.adm-errornet__item {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
  padding: var(--sp-3);
  border: 1px solid var(--adm-danger);
  border-radius: var(--adm-radius);
  background: var(--surface);
  box-shadow: 0 8px 24px rgb(0 0 0 / .12);
  font-size: var(--fs-sm);
}
.adm-errornet__item p {
  margin-top: var(--sp-1);
  color: var(--ink-70);
  overflow-wrap: anywhere;
}
.adm-errornet__close {
  margin-left: auto;
  border: 0;
  background: none;
  cursor: pointer;
  color: var(--ink-50);
  font-size: var(--fs-sm);
}
</style>
