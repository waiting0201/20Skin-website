<script setup lang="ts">
// 未命中題目清單（/questions）—— 規格見 docs/02 §6、docs/04-ai-faq.md §3、docs/08 §F。
//
// ⚠️ 這是獨立畫面，不是 FAQ 題庫列表的一個篩選分頁（docs/02 §6 明文）。
// 目的是讓題庫隨真實提問成長，不是一次寫完就放著（docs/04 §3）。
//
// ⚠️ 這裡刻意不顯示、也不儲存任何「誰問的」資訊——docs/08 §F 的硬界線：
// 聯絡表單提問只寫問題文字本身，不寫姓名、電話、email。這個畫面的資料
// 來源（questionApi）本身就沒有這些欄位可顯示。
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { adminApi, ApiError } from '@/api/client'
import { currentUser } from '@/auth'
import { hasPermission } from '@/permissions'
import type { QuestionInboxRecord, QuestionSource, QuestionStatus } from '@/api/question'
import { QUESTION_STATUS_LABEL, SOURCE_LABEL } from '@/api/question'

const router = useRouter()
const user = currentUser()
const permCtx = user ? { roles: user.roles, isSuperAdmin: user.isSuperAdmin } : null
const canEdit = computed(() => hasPermission(permCtx, 'content.faq.edit'))

const items = ref<QuestionInboxRecord[]>([])
const loading = ref(true)
const faqOptions = ref<{ value: string; label: string }[]>([])

const query = reactive({ status: '' as '' | QuestionStatus, source: '' as '' | QuestionSource, keyword: '' })

async function load() {
  loading.value = true
  items.value = await adminApi.question.list({
    // ⚠️ <select> 的 v-model 在這裡讀出來的是字串（"1"／"2"／"3"），
    // 要轉成數字才對得上 QuestionStatus／QuestionSource 的型別，
    // 不然永遠比對不到（ListPage.vue 的 categoryId 也是同樣理由才轉型）。
    status: query.status ? (Number(query.status) as QuestionStatus) : undefined,
    source: query.source ? (Number(query.source) as QuestionSource) : undefined,
    keyword: query.keyword || undefined,
  })
  loading.value = false
}

onMounted(async () => {
  faqOptions.value = await adminApi.taxonomy.unitOptions('faq')
  await load()
})

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('zh-TW')
}

function faqTitle(id: number | null): string {
  if (id === null) return '—'
  return faqOptions.value.find((o) => o.value === String(id))?.label ?? `#${id}`
}

// ── 建立為 FAQ 草稿：直接呼叫 content.create('faq', …) 再回填 LinkedFaqContentItemId ──
//
// questionApi 本身不 import client.ts（避免循環相依，見 src/api/question.ts 檔頭），
// 所以「建立 FAQ 草稿」這個跨模組動作放在畫面這一層做：先建立內容，再把 id
// 傳回 questionApi.markCreated()。
const creatingId = ref<number | null>(null)
const actionError = ref('')

async function createFaqDraft(item: QuestionInboxRecord) {
  creatingId.value = item.id
  actionError.value = ''
  try {
    const created = await adminApi.content.create(
      'faq',
      {
        title: item.questionText,
        fields: { categoryTermSeedKey: '', webAnswer: '', aiAnswer: '', lastReviewedOn: '' },
      },
      user!.id,
    )
    await adminApi.question.markCreated(item.id, created.id, user!.id)
    await router.push(`/faq/${created.id}`)
  } catch (e) {
    actionError.value = e instanceof ApiError ? e.message : '建立失敗。'
  } finally {
    creatingId.value = null
  }
}

// ── 連結到既有 FAQ（題目已經有人手動建過，只是還沒回填連結）─────────────
const linkingId = ref<number | null>(null)
const linkTarget = ref('')
function openLink(item: QuestionInboxRecord) {
  linkingId.value = item.id
  linkTarget.value = ''
}
function closeLink() {
  linkingId.value = null
}
async function submitLink(item: QuestionInboxRecord) {
  if (!linkTarget.value) return
  await adminApi.question.markCreated(item.id, Number(linkTarget.value), user!.id)
  closeLink()
  await load()
}

async function ignore(item: QuestionInboxRecord) {
  await adminApi.question.ignore(item.id, user!.id)
  await load()
}
async function reopen(item: QuestionInboxRecord) {
  await adminApi.question.reopen(item.id)
  await load()
}
async function remove(item: QuestionInboxRecord) {
  if (!window.confirm(`確定要刪除這筆提問「${item.questionText}」嗎？此動作無法復原。`)) return
  await adminApi.question.remove(item.id)
  await load()
}
</script>

<template>
  <section class="adm-page">
    <div class="adm-page__head">
      <div>
        <h1 class="adm-page__title">未命中題目清單</h1>
        <p class="adm-page__desc">共 {{ items.length }} 筆，依出現次數排序——最多人問的排最前面。</p>
      </div>
    </div>

    <p class="adm-workflow__note">
      來源涵蓋站內搜尋無結果、AI FAQ 未命中的提問、聯絡表單提問（僅問題文字，不含任何送出者資訊）與手動輸入。
      目的是讓 FAQ 題庫隨真實提問成長——處理完的題目建議直接「建立為 FAQ 草稿」，回填後兩個出口
      （<code>/faq/</code> 頁面與 AI FAQ 面板）會同時受惠（docs/04-ai-faq.md §3）。
    </p>

    <div class="adm-filters">
      <input v-model="query.keyword" type="search" placeholder="搜尋提問內容" @change="load">
      <select v-model="query.status" @change="load">
        <option value="">全部狀態</option>
        <option v-for="(label, value) in QUESTION_STATUS_LABEL" :key="value" :value="value">{{ label }}</option>
      </select>
      <select v-model="query.source" @change="load">
        <option value="">全部來源</option>
        <option v-for="(label, value) in SOURCE_LABEL" :key="value" :value="value">{{ label }}</option>
      </select>
    </div>

    <p v-if="actionError" class="adm-field__error">{{ actionError }}</p>
    <p v-if="!canEdit" class="adm-empty">沒有處理權限，以下為唯讀檢視。</p>

    <div v-if="loading" class="adm-empty">載入中…</div>
    <div v-else-if="!items.length" class="adm-empty">目前沒有符合條件的提問。</div>

    <div v-else class="adm-table-wrap">
      <table class="adm-table">
        <thead>
          <tr>
            <th>提問內容</th>
            <th>來源</th>
            <th>出現次數</th>
            <th>最後出現</th>
            <th>狀態</th>
            <th>已連結 FAQ</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="item in items" :key="item.id">
            <tr>
              <td class="is-wrap">{{ item.questionText }}</td>
              <td>{{ SOURCE_LABEL[item.source] }}</td>
              <td>{{ item.hitCount }}</td>
              <td>{{ fmtDate(item.lastSeenAt) }}</td>
              <td>
                <span class="adm-badge" :class="`adm-badge--${item.status === 1 ? 'draft' : item.status === 2 ? 'published' : 'unpublished'}`">
                  {{ QUESTION_STATUS_LABEL[item.status] }}
                </span>
              </td>
              <td>
                <RouterLink v-if="item.linkedFaqContentItemId" :to="`/faq/${item.linkedFaqContentItemId}`">
                  {{ faqTitle(item.linkedFaqContentItemId) }}
                </RouterLink>
                <span v-else class="adm-muted">—</span>
              </td>
              <td class="adm-table__actions">
                <template v-if="canEdit && item.status === 1">
                  <button type="button" class="btn btn--line btn--sm" :disabled="creatingId === item.id" @click="createFaqDraft(item)">
                    建立為 FAQ 草稿
                  </button>
                  <button type="button" class="btn btn--line btn--sm" @click="openLink(item)">連結既有 FAQ</button>
                  <button type="button" class="btn btn--line btn--sm" @click="ignore(item)">忽略</button>
                </template>
                <template v-else-if="canEdit && item.status === 2">
                  <button type="button" class="btn btn--line btn--sm" @click="reopen(item)">取消連結，退回待處理</button>
                </template>
                <template v-else-if="canEdit && item.status === 3">
                  <button type="button" class="btn btn--line btn--sm" @click="reopen(item)">重新開啟</button>
                  <button type="button" class="btn btn--line btn--sm" @click="remove(item)">刪除</button>
                </template>
              </td>
            </tr>
            <tr v-if="linkingId === item.id">
              <td colspan="7">
                <div class="q-link-row">
                  <select v-model="linkTarget" class="adm-select">
                    <option value="">選擇既有 FAQ…</option>
                    <option v-for="opt in faqOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                  <button type="button" class="btn btn--sm btn--primary" :disabled="!linkTarget" @click="submitLink(item)">確定連結</button>
                  <button type="button" class="btn btn--sm btn--ghost" @click="closeLink">取消</button>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.q-link-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2, 8px);
  padding: var(--sp-3, 12px) 0;
}
</style>
