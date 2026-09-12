<script setup lang="ts">
// 審核佇列（/review）—— 規格見 docs/02-backend-cms.md §4、docs/10-api.md §3.4、
// docs/11-backend-design.md §7。
//
// 資料層已經寫好（adminApi.review.pending()／approve()／reject()），這裡只負責畫面。
import { computed, onMounted, ref } from 'vue'
import { adminApi, ApiError } from '@/api/client'
import { currentUser } from '@/auth'
import { hasPermission } from '@/permissions'
import type { ReviewItem } from '@/types'
import { UNIT_REGISTRY } from '@/units'

const user = currentUser()
const permCtx = user ? { roles: user.roles, isSuperAdmin: user.isSuperAdmin } : null
const canDecide = computed(() => hasPermission(permCtx, 'review.approve'))

const items = ref<ReviewItem[]>([])
const loading = ref(true)
const busyId = ref<number | null>(null)
const errorMessage = ref('')

async function load() {
  loading.value = true
  items.value = await adminApi.review.pending()
  loading.value = false
}

onMounted(load)

async function approve(item: ReviewItem) {
  errorMessage.value = ''
  busyId.value = item.id
  try {
    // ⚠️ 核准即 Status=3，不管 PublishAt 有沒有到——「已排程」是推導出來的顯示
    // 狀態，不是這裡的第五種狀態（docs/11-backend-design.md §7）。
    await adminApi.review.approve(item.id, user!.id)
    await load()
  } catch (e) {
    errorMessage.value = e instanceof ApiError ? e.message : '核准失敗。'
  } finally {
    busyId.value = null
  }
}

// 退回：inline 展開一個原因輸入框，decisionNote 必填（docs/11 §7 規則三）
const rejectingId = ref<number | null>(null)
const rejectNote = ref('')

function startReject(item: ReviewItem) {
  errorMessage.value = ''
  rejectingId.value = item.id
  rejectNote.value = ''
}

function cancelReject() {
  rejectingId.value = null
  rejectNote.value = ''
}

async function confirmReject(item: ReviewItem) {
  errorMessage.value = ''
  if (!rejectNote.value.trim()) {
    errorMessage.value = '退回原因為必填。'
    return
  }
  busyId.value = item.id
  try {
    await adminApi.review.reject(item.id, rejectNote.value.trim(), user!.id)
    rejectingId.value = null
    rejectNote.value = ''
    await load()
  } catch (e) {
    errorMessage.value = e instanceof ApiError ? e.message : '退回失敗。'
  } finally {
    busyId.value = null
  }
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW')
}
</script>

<template>
  <section>
    <div class="adm-page__head">
      <div>
        <h1 class="adm-page__title">審核佇列</h1>
        <p class="adm-page__desc">共 {{ items.length }} 筆待審・依送審時間排序</p>
      </div>
    </div>

    <p class="adm-workflow__note" style="margin-bottom: var(--sp-4)">
      ⚠️ 核准即進入「已發布」狀態，與 <code>PublishAt</code> 排程無關——「已排程」只是
      <code>已發布 ＋ PublishAt 尚未到</code> 推導出來的顯示狀態。退回<strong>不寄信</strong>
      （帳號沒有必填 email），改由對方儀表板的「我的退件」待辦清單呈現。
    </p>

    <p v-if="errorMessage" class="adm-login__error" style="margin-bottom: var(--sp-4)">{{ errorMessage }}</p>

    <p v-if="loading" class="adm-empty">載入中…</p>
    <p v-else-if="!items.length" class="adm-empty">目前沒有待審項目。</p>

    <div v-else class="adm-table-wrap">
      <table class="adm-table">
        <thead>
          <tr>
            <th>單元</th>
            <th>標題</th>
            <th>送審者</th>
            <th>送審時間</th>
            <th>風險字詞命中</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="item in items" :key="item.id">
            <tr>
              <td>{{ UNIT_REGISTRY[item.unit].label }}</td>
              <td class="is-wrap adm-table__title">
                <RouterLink :to="`/${item.unit}/${item.contentItemId}`">{{ item.title }}</RouterLink>
              </td>
              <td>{{ item.submittedByName }}</td>
              <td>{{ timeLabel(item.submittedAt) }}</td>
              <td class="is-wrap">
                <span v-if="item.riskFlags.length" class="adm-badge adm-badge--unpublished">{{ item.riskFlags.join('、') }}</span>
                <span v-else class="adm-muted">—</span>
              </td>
              <td class="adm-table__actions">
                <template v-if="canDecide">
                  <button type="button" class="btn btn--primary btn--sm" :disabled="busyId === item.id" @click="approve(item)">核准</button>
                  <button type="button" class="btn btn--line btn--sm" :disabled="busyId === item.id" @click="startReject(item)">退回</button>
                </template>
                <span v-else class="adm-muted">沒有決定權限</span>
              </td>
            </tr>
            <tr v-if="rejectingId === item.id">
              <td colspan="6">
                <div class="adm-card" style="background: var(--surface-alt)">
                  <label class="adm-field__label">退回原因（必填）<span class="adm-field__required">＊</span></label>
                  <textarea
                    v-model="rejectNote"
                    class="adm-textarea"
                    rows="2"
                    placeholder="請說明需要修改的地方，會顯示在對方的「我的退件」待辦清單"
                  ></textarea>
                  <div class="adm-inline-actions" style="margin-top: var(--sp-2)">
                    <button type="button" class="btn btn--primary btn--sm" :disabled="busyId === item.id" @click="confirmReject(item)">確認退回</button>
                    <button type="button" class="btn btn--ghost btn--sm" :disabled="busyId === item.id" @click="cancelReject">取消</button>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </section>
</template>
