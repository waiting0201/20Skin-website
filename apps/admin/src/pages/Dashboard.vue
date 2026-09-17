<script setup lang="ts">
// 儀表板。docs/08-database.md §K：沒有專屬資料表，全部是聚合查詢；
// docs/10-api.md §3.4：GET /admin/dashboard，含「我的退件」
// （ContentReviews WHERE Status=3 AND SubmittedByUserId=@me）。
import { computed, onMounted, ref } from 'vue'
import { adminApi, type DashboardSummary } from '@/api/client'
import { currentUser } from '@/auth'
import { hasPermission } from '@/permissions'
import { UNIT_REGISTRY } from '@/units'
import type { UnitKey } from '@/types'

// layout 與登入守門改由 src/router.ts 的路由表 meta 與全域 beforeEach 處理
// （對應原本 Nuxt 的 definePageMeta({ layout: 'admin', middleware: 'admin-auth' })）。

const user = currentUser()
// ⚠️ 「待審核」「我的退件」兩張卡片與「送審中」那一欄 2026-09-17 一併移除 ——
// 送審整套已經不做了（CLAUDE.md 決策 20），留著只會顯示恆為 0 的數字。
// 沒有權限的人點了會被 router 的 beforeEach 導回儀表板（體驗層守門，見 router.ts），
// 與其讓連結出現又被彈回來，不如直接不顯示——跟側欄選單的做法一致。
const permCtx = user ? { roles: user.roles, isSuperAdmin: user.isSuperAdmin } : null
const summary = ref<DashboardSummary | null>(null)
const loading = ref(true)

onMounted(async () => {
  if (!user) return
  summary.value = await adminApi.dashboard.summary(user.id)
  loading.value = false
})

const unitKeys = Object.keys(UNIT_REGISTRY) as UnitKey[]
</script>

<template>
  <div class="adm-page">
    <div class="adm-page__head">
      <div>
        <h1 class="adm-page__title">儀表板</h1>
        <p class="adm-page__desc">歡迎回來，{{ user?.displayName }}。</p>
      </div>
    </div>

    <div v-if="loading" class="adm-loading">
      <span class="adm-spinner" aria-hidden="true"></span>
      <span>載入中…</span>
    </div>

    <template v-else-if="summary">
      <div class="adm-stat-grid">
        <div class="adm-stat-card">
          <div class="adm-stat-card__label">全站內容筆數</div>
          <div class="adm-stat-card__value">{{ summary.totalRecords }}</div>
        </div>
      </div>

      <div class="adm-dashboard-grid">
        <div class="adm-card">
          <h2 class="adm-card__title">各單元狀態</h2>
          <div class="adm-table-wrap">
            <table class="adm-table">
              <thead>
                <tr>
                  <th>單元</th>
                  <th style="text-align: right">草稿</th>
                  <th style="text-align: right">已發布</th>
                  <th style="text-align: right">已下架</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="unit in unitKeys" :key="unit">
                  <td class="adm-table__title"><RouterLink :to="`/${unit}`">{{ UNIT_REGISTRY[unit].label }}</RouterLink></td>
                  <td style="text-align: right">{{ summary.statusCounts[unit][1] }}</td>
                  <td style="text-align: right">{{ summary.statusCounts[unit][3] }}</td>
                  <td style="text-align: right">{{ summary.statusCounts[unit][4] }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </template>
  </div>
</template>
