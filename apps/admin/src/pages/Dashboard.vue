<script setup lang="ts">
// 儀表板。docs/08-database.md §K：沒有專屬資料表，全部是聚合查詢；
// docs/10-api.md §3.4：GET /admin/dashboard，含「我的退件」
// （ContentReviews WHERE Status=3 AND SubmittedByUserId=@me）。
import { onMounted, ref } from 'vue'
import { adminApi, type DashboardSummary } from '@/api/client'
import { currentUser } from '@/auth'
import { UNIT_REGISTRY } from '@/units'
import type { UnitKey } from '@/types'

// layout 與登入守門改由 src/router.ts 的路由表 meta 與全域 beforeEach 處理
// （對應原本 Nuxt 的 definePageMeta({ layout: 'admin', middleware: 'admin-auth' })）。

const user = currentUser()
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
  <div>
    <div class="adm-page__head">
      <div>
        <h1 class="adm-page__title">儀表板</h1>
        <p class="adm-page__desc">歡迎回來，{{ user?.displayName }}。</p>
      </div>
    </div>

    <div v-if="loading" class="adm-empty">載入中…</div>

    <template v-else-if="summary">
      <div class="adm-stat-grid">
        <div class="adm-stat-card">
          <div class="adm-stat-card__label">全站內容筆數</div>
          <div class="adm-stat-card__value">{{ summary.totalRecords }}</div>
        </div>
        <div class="adm-stat-card">
          <div class="adm-stat-card__label">待審核</div>
          <div class="adm-stat-card__value">{{ summary.pendingReviewCount }}</div>
          <div class="adm-stat-card__sub">審核佇列畫面下一輪才做，此數字先由聚合查詢示範</div>
        </div>
        <div class="adm-stat-card">
          <div class="adm-stat-card__label">我的退件</div>
          <div class="adm-stat-card__value">{{ summary.myRejected.length }}</div>
        </div>
        <div class="adm-stat-card">
          <div class="adm-stat-card__label">全站重建</div>
          <div class="adm-stat-card__value" style="font-size: var(--fs-md)">
            {{ summary.rebuild.pending ? '發布中' : '已上線' }}
          </div>
          <div class="adm-stat-card__sub">
            {{ summary.rebuild.pending ? '重建進行中，數分鐘到十餘分鐘後上線' : `最近一次完成：${summary.rebuild.lastCompletedAt ? new Date(summary.rebuild.lastCompletedAt).toLocaleString('zh-TW') : '尚無紀錄'}` }}
          </div>
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
                  <th>草稿</th>
                  <th>送審中</th>
                  <th>已發布</th>
                  <th>已下架</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="unit in unitKeys" :key="unit">
                  <td><RouterLink :to="`/${unit}`">{{ UNIT_REGISTRY[unit].label }}</RouterLink></td>
                  <td>{{ summary.statusCounts[unit][1] }}</td>
                  <td>{{ summary.statusCounts[unit][2] }}</td>
                  <td>{{ summary.statusCounts[unit][3] }}</td>
                  <td>{{ summary.statusCounts[unit][4] }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="adm-card">
          <h2 class="adm-card__title">我的退件</h2>
          <p v-if="!summary.myRejected.length" class="adm-muted">目前沒有被退回的送審單。</p>
          <div v-else>
            <div v-for="item in summary.myRejected" :key="item.id" class="adm-list-item">
              <div>
                <div class="adm-list-item__title">
                  <RouterLink :to="`/${item.unit}/${item.contentItemId}`">{{ item.title }}</RouterLink>
                </div>
                <div class="adm-list-item__meta">{{ UNIT_REGISTRY[item.unit].label }}・退回原因：{{ item.decisionNote || '（無）' }}</div>
              </div>
            </div>
          </div>
          <hr class="adm-divider">
          <p class="adm-workflow__note">
            ⚠️ 退回不寄信——帳號沒有必填 email，退回通知一律由這個待辦清單呈現。
          </p>
        </div>
      </div>
    </template>
  </div>
</template>
