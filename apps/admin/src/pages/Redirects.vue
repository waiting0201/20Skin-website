<script setup lang="ts">
// 301 轉址管理（/redirects）—— 規格見 docs/01 §4、docs/06 §6、docs/07 §2、docs/08 §H。
//
// 約 770 條，不可一頁全載——分頁 ＋ 關鍵字搜尋（docs/06 §6）。CSV 匯入匯出是
// 必要功能，不是加分項：770 條不可能手工維護（docs/07 §2）。
//
// 權限：redirect.view／redirect.edit／redirect.export，見 src/permissions.ts。
// 目前只有超級管理員角色拿得到這三個權限碼。
import { computed, onMounted, reactive, ref } from 'vue'
import { adminApi, ApiError } from '@/api/client'
import { currentUser } from '@/auth'
import { hasPermission } from '@/permissions'
import { UNIT_KEYS } from '@/types'
import { REDIRECT_SOURCE_LABEL, REDIRECT_STATUS_CODES } from '@/api/redirect'
import type { RedirectImportPreview, RedirectImportRow, RedirectRecord, RedirectSource, RedirectStatusCode } from '@/api/redirect'

const user = currentUser()
const permCtx = user ? { roles: user.roles, isSuperAdmin: user.isSuperAdmin } : null
const canView = computed(() => hasPermission(permCtx, 'redirect.manage'))
const canEdit = computed(() => hasPermission(permCtx, 'redirect.manage'))
const canExport = computed(() => hasPermission(permCtx, 'redirect.manage'))

// ── 清單 ──────────────────────────────────────────────────────────────

const items = ref<RedirectRecord[]>([])
const totalCount = ref(0)
const loading = ref(true)
const query = reactive({
  page: 1,
  pageSize: 20,
  keyword: '',
  isActive: '' as '' | 'true' | 'false',
  source: '' as '' | RedirectSource,
  sortBy: 'createdAt' as 'createdAt' | 'fromPath',
  sortDir: 'desc' as 'asc' | 'desc',
})
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / query.pageSize)))

const stats = ref<{ totalCount: number; activeCount: number; verifiedCount: number } | null>(null)
const promoted = ref<RedirectRecord[]>([])

async function load() {
  loading.value = true
  const result = await adminApi.redirect.list({
    page: query.page,
    pageSize: query.pageSize,
    keyword: query.keyword || undefined,
    isActive: query.isActive === '' ? undefined : query.isActive === 'true',
    source: query.source === '' ? undefined : query.source,
    sortBy: query.sortBy,
    sortDir: query.sortDir,
  })
  items.value = result.items
  totalCount.value = result.totalCount
  loading.value = false
}

async function loadSidebar() {
  stats.value = await adminApi.redirect.stats()
  promoted.value = await adminApi.redirect.promotedToConfig()
}

onMounted(async () => {
  await Promise.all([load(), loadSidebar()])
})

function onFilterChange() {
  query.page = 1
  load()
}

function onSort(col: 'createdAt' | 'fromPath') {
  if (query.sortBy === col) {
    query.sortDir = query.sortDir === 'asc' ? 'desc' : 'asc'
  } else {
    query.sortBy = col
    query.sortDir = 'desc'
  }
  load()
}

// ── 新增／編輯（同一個表單，editingId 有值即為編輯） ────────────────────

const formOpen = ref(false)
const editingId = ref<number | null>(null)
const form = reactive({ fromPath: '', toPath: '', statusCode: 301 as RedirectStatusCode, source: 2 as RedirectSource, isActive: true, isVerified: false })
const formError = ref('')
const saving = ref(false)

function openCreate() {
  editingId.value = null
  Object.assign(form, { fromPath: '', toPath: '', statusCode: 301, source: 2, isActive: true, isVerified: false })
  formError.value = ''
  formOpen.value = true
}

function openEdit(record: RedirectRecord) {
  editingId.value = record.id
  Object.assign(form, {
    fromPath: record.fromPath,
    toPath: record.toPath,
    statusCode: record.statusCode,
    source: record.source,
    isActive: record.isActive,
    isVerified: record.isVerified,
  })
  formError.value = ''
  formOpen.value = true
}

function closeForm() {
  formOpen.value = false
}

async function submitForm() {
  saving.value = true
  formError.value = ''
  try {
    if (editingId.value === null) {
      await adminApi.redirect.create({ ...form })
    } else {
      await adminApi.redirect.update(editingId.value, { ...form })
    }
    formOpen.value = false
    await Promise.all([load(), loadSidebar()])
  } catch (e) {
    formError.value = e instanceof ApiError ? e.message : '儲存失敗。'
  } finally {
    saving.value = false
  }
}

async function removeRow(record: RedirectRecord) {
  if (!window.confirm(`確定要刪除「${record.fromPath}」的轉址規則？這個動作無法復原。`)) return
  await adminApi.redirect.remove(record.id)
  await Promise.all([load(), loadSidebar()])
}

// ── CSV 匯出 ──────────────────────────────────────────────────────────

async function exportCsv() {
  const csv = await adminApi.redirect.csv.exportAll()
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `redirects-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// ── CSV 匯入：選檔 → 預覽（含衝突檢查）→ 確認匯入 ───────────────────────

const importRows = ref<RedirectImportRow[]>([])
const importPreview = ref<RedirectImportPreview | null>(null)
const importChecking = ref(false)
const importOverwrite = ref(false)
const importCommitting = ref(false)
const importResultMsg = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const PREVIEW_DISPLAY_LIMIT = 200

async function collectKnownPaths(): Promise<Set<string>> {
  const known = new Set<string>(adminApi.redirect.knownStaticPaths)
  for (const unit of UNIT_KEYS) {
    const res = await adminApi.content.list(unit, { pageSize: 100 })
    for (const item of res.items) if (item.urlPath) known.add(item.urlPath)
  }
  return known
}

async function onFileSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  importResultMsg.value = ''
  const text = await file.text()
  importRows.value = adminApi.redirect.import.parseCsv(text)
  await runPreview()
}

async function runPreview() {
  if (!importRows.value.length) {
    importPreview.value = null
    return
  }
  importChecking.value = true
  try {
    const knownPaths = await collectKnownPaths()
    importPreview.value = await adminApi.redirect.import.preview(importRows.value, knownPaths)
  } finally {
    importChecking.value = false
  }
}

async function commitImport() {
  if (!importRows.value.length) return
  importCommitting.value = true
  try {
    const result = await adminApi.redirect.import.commit(importRows.value, { overwriteExisting: importOverwrite.value })
    importResultMsg.value = `匯入完成：新增 ${result.created} 筆、更新 ${result.updated} 筆、略過 ${result.skipped} 筆。`
    importRows.value = []
    importPreview.value = null
    if (fileInput.value) fileInput.value.value = ''
    await Promise.all([load(), loadSidebar()])
  } finally {
    importCommitting.value = false
  }
}

function cancelImport() {
  importRows.value = []
  importPreview.value = null
  importResultMsg.value = ''
  if (fileInput.value) fileInput.value.value = ''
}

const previewRowsToShow = computed(() => importPreview.value?.rows.slice(0, PREVIEW_DISPLAY_LIMIT) ?? [])
</script>

<template>
  <section class="adm-page">
    <div class="adm-page__head">
      <div>
        <h1 class="adm-page__title">301 轉址管理</h1>
        <p class="adm-page__desc" v-if="stats">
          共 {{ stats.totalCount }} 條・啟用中 {{ stats.activeCount }}・已人工核實 {{ stats.verifiedCount }}
        </p>
      </div>
      <div class="adm-page__actions">
        <button v-if="canExport" type="button" class="btn btn--line" @click="exportCsv">匯出 CSV</button>
        <button v-if="canEdit" type="button" class="btn btn--primary" @click="openCreate">＋ 新增規則</button>
      </div>
    </div>

    <p v-if="!canView" class="adm-empty">沒有檢視這個畫面的權限。</p>

    <template v-else>
      <div class="adm-card">
        <p class="r-note">
          <strong>為什麼要有這個畫面：</strong>
          <code>staticwebapp.config.json</code> 放不下約 770 條規則（20 KB 上限約只放得下 200 條），
          且它<strong>不比對 query string</strong>——舊網址像
          <code>share.php?class=醫美新知</code> 這類帶中文參數的頁面，只有靠
          <code>/api/fallback</code> 讀 <code>x-ms-original-url</code> 查這張表才做得到。
          <strong>最高流量的十幾條</strong>已直接寫進設定檔走最快路徑，不經過 Function，下面列出目前是哪幾條。
        </p>
        <p class="r-note">
          <strong>已知限制（不是這個畫面的錯）：</strong>
          <code>/contact.php#20</code> 這類錨點無法在伺服器端轉址——瀏覽器不會把 <code>#</code> 之後的內容送給伺服器，
          正確做法是 <code>/contact.php</code> 轉到 <code>/clinics/</code>，再由前台 JS 讀 <code>location.hash</code> 二次導向，
          不需要（也不應該）在這張表裡硬湊一條規則。萬用字元一律禁止——每個舊網址要一對一對應，不可以全部倒進分類頁（會被 Google 判定為軟性 404）。
        </p>
      </div>

      <div v-if="promoted.length" class="adm-card">
        <h2 class="adm-card__title">已寫進 staticwebapp.config.json 的規則（走最快路徑）</h2>
        <div class="adm-table-wrap">
          <table class="adm-table">
            <thead><tr><th>來源路徑</th><th>目標路徑</th><th>命中次數</th></tr></thead>
            <tbody>
              <tr v-for="r in promoted" :key="r.id">
                <td>{{ r.fromPath }}</td>
                <td>{{ r.toPath }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 新增／編輯表單 -->
      <div v-if="formOpen" class="adm-card">
        <h2 class="adm-card__title">{{ editingId === null ? '新增轉址規則' : `編輯轉址規則 #${editingId}` }}</h2>
        <p v-if="formError" class="adm-login__error" style="margin-bottom: var(--sp-3)">{{ formError }}</p>
        <form class="adm-form" @submit.prevent="submitForm">
          <div class="adm-field-grid">
            <div class="adm-field adm-field--span2">
              <label class="adm-field__label">來源路徑<span class="adm-field__required">＊</span></label>
              <input v-model="form.fromPath" class="adm-input" placeholder="/share.php?class=醫美新知" required>
              <p class="adm-field__hint">可以帶 query string；儲存時會自動正規化（補開頭斜線、query 依字母排序）。</p>
            </div>
            <div class="adm-field adm-field--span2">
              <label class="adm-field__label">目標路徑<span class="adm-field__required">＊</span></label>
              <input v-model="form.toPath" class="adm-input" placeholder="/blog/medical-aesthetics/" required>
            </div>
            <div class="adm-field">
              <label class="adm-field__label">狀態碼</label>
              <select v-model.number="form.statusCode" class="adm-select">
                <option v-for="code in REDIRECT_STATUS_CODES" :key="code" :value="code">{{ code }}</option>
              </select>
            </div>
            <div class="adm-field">
              <label class="adm-field__label">來源</label>
              <select v-model.number="form.source" class="adm-select">
                <option v-for="(label, value) in REDIRECT_SOURCE_LABEL" :key="value" :value="Number(value)">{{ label }}</option>
              </select>
            </div>
            <div class="adm-field">
              <label class="adm-checkbox"><input v-model="form.isActive" type="checkbox"> 啟用</label>
            </div>
            <div class="adm-field">
              <label class="adm-checkbox"><input v-model="form.isVerified" type="checkbox"> 已人工核實</label>
            </div>
          </div>
          <div class="adm-inline-actions">
            <button type="submit" class="btn btn--primary" :disabled="saving">{{ saving ? '儲存中…' : '儲存' }}</button>
            <button type="button" class="btn btn--ghost" @click="closeForm">取消</button>
          </div>
        </form>
      </div>

      <!-- CSV 匯入 -->
      <div v-if="canEdit" class="adm-card">
        <h2 class="adm-card__title">CSV 匯入</h2>
        <p class="adm-field__hint">
          表頭可用中文（來源路徑／目標路徑／狀態碼）或英文（fromPath／toPath／statusCode）；沒有表頭則依欄位順序視為
          來源路徑、目標路徑、狀態碼。匯入前會先做衝突檢查：同一來源是否已存在、目標是否會形成連續轉址鏈、
          目標路徑目前是否找得到對應內容（找不到只是提醒，不會擋匯入——遷移期內容本來就是逐步上線）。
        </p>
        <input ref="fileInput" type="file" accept=".csv,text/csv" @change="onFileSelected">

        <div v-if="importChecking" class="adm-empty">檢查中…</div>

        <template v-else-if="importPreview">
          <div class="adm-stat-grid" style="margin-top: var(--sp-4)">
            <div class="adm-stat-card">
              <div class="adm-stat-card__label">可直接建立</div>
              <div class="adm-stat-card__value">{{ importPreview.creatableCount }}</div>
            </div>
            <div class="adm-stat-card">
              <div class="adm-stat-card__label">已存在（可覆蓋）</div>
              <div class="adm-stat-card__value">{{ importPreview.overwritableCount }}</div>
            </div>
            <div class="adm-stat-card">
              <div class="adm-stat-card__label">錯誤（略過）</div>
              <div class="adm-stat-card__value">{{ importPreview.errorCount }}</div>
            </div>
            <div class="adm-stat-card">
              <div class="adm-stat-card__label">提醒</div>
              <div class="adm-stat-card__value">{{ importPreview.warningCount }}</div>
            </div>
          </div>

          <label class="adm-checkbox" style="margin-top: var(--sp-3)">
            <input v-model="importOverwrite" type="checkbox"> 覆蓋既有規則（更新「已存在」那些筆的目標路徑與狀態碼）
          </label>

          <div class="adm-table-wrap" style="margin-top: var(--sp-3)">
            <table class="adm-table">
              <thead>
                <tr><th>#</th><th>來源路徑</th><th>目標路徑</th><th>檢查結果</th></tr>
              </thead>
              <tbody>
                <tr v-for="r in previewRowsToShow" :key="r.row">
                  <td>{{ r.row }}</td>
                  <td class="is-wrap">{{ r.normalizedFrom || r.input.fromPath }}</td>
                  <td class="is-wrap">{{ r.normalizedTo || r.input.toPath }}</td>
                  <td class="is-wrap">
                    <span v-if="!r.issues.length" class="adm-badge adm-badge--published">可匯入</span>
                    <div v-for="(issue, i) in r.issues" :key="i" :class="issue.level === 'error' ? 'adm-field__error' : 'adm-field__hint'">
                      {{ issue.message }}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-if="importPreview.rows.length > PREVIEW_DISPLAY_LIMIT" class="adm-field__hint">
              僅顯示前 {{ PREVIEW_DISPLAY_LIMIT }} 筆，其餘 {{ importPreview.rows.length - PREVIEW_DISPLAY_LIMIT }} 筆已一併檢查，統計數字已包含在上方。
            </p>
          </div>

          <div class="adm-inline-actions" style="margin-top: var(--sp-3)">
            <button type="button" class="btn btn--primary" :disabled="importCommitting" @click="commitImport">
              {{ importCommitting ? '匯入中…' : `確認匯入（${importPreview.creatableCount + (importOverwrite ? importPreview.overwritableCount : 0)} 筆）` }}
            </button>
            <button type="button" class="btn btn--ghost" @click="cancelImport">取消</button>
          </div>
        </template>

        <p v-if="importResultMsg" class="adm-login__error" style="background: #E9F3EC; color: var(--adm-ok); margin-top: var(--sp-3)">{{ importResultMsg }}</p>
      </div>

      <!-- 清單 -->
      <div class="adm-filters">
        <input v-model="query.keyword" type="search" placeholder="關鍵字（來源或目標路徑）" @keyup.enter="onFilterChange" @change="onFilterChange">
        <select v-model="query.isActive" @change="onFilterChange">
          <option value="">全部狀態</option>
          <option value="true">啟用中</option>
          <option value="false">已停用</option>
        </select>
        <select v-model.number="query.source" @change="onFilterChange">
          <option value="">全部來源</option>
          <option v-for="(label, value) in REDIRECT_SOURCE_LABEL" :key="value" :value="Number(value)">{{ label }}</option>
        </select>
      </div>

      <div v-if="loading" class="adm-empty">載入中…</div>
      <div v-else-if="!items.length" class="adm-empty">沒有符合條件的規則。</div>

      <div v-else class="adm-table-wrap">
        <table class="adm-table">
          <thead>
            <tr>
              <th class="r-sortable" @click="onSort('fromPath')">來源路徑 {{ query.sortBy === 'fromPath' ? (query.sortDir === 'asc' ? '↑' : '↓') : '' }}</th>
              <th>目標路徑</th>
              <th>狀態碼</th>
              <th>來源</th>
              <th>核實</th>
              <th class="r-sortable" @click="onSort('createdAt')">建立時間 {{ query.sortBy === 'createdAt' ? (query.sortDir === 'asc' ? '↑' : '↓') : '' }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in items" :key="r.id">
              <td class="is-wrap">{{ r.fromPath }}</td>
              <td class="is-wrap">{{ r.toPath }}</td>
              <td>{{ r.statusCode }}</td>
              <td>{{ REDIRECT_SOURCE_LABEL[r.source] }}</td>
              <td>{{ r.isVerified ? '✓' : '—' }}</td>
              <td>{{ r.createdAt.slice(0, 10) }}</td>
              <td class="adm-table__actions">
                <template v-if="canEdit">
                  <button type="button" class="btn btn--ghost btn--sm" @click="openEdit(r)">編輯</button>
                  <button type="button" class="btn btn--line btn--sm" @click="removeRow(r)">刪除</button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="adm-pagination">
        <span>第 {{ query.page }} ／ {{ totalPages }} 頁・共 {{ totalCount }} 筆</span>
        <div class="adm-pagination__controls">
          <button type="button" class="btn btn--line btn--sm" :disabled="query.page <= 1" @click="query.page--; load()">上一頁</button>
          <button type="button" class="btn btn--line btn--sm" :disabled="query.page >= totalPages" @click="query.page++; load()">下一頁</button>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.r-note { font-size: var(--fs-sm); color: var(--ink-70); line-height: 1.8; }
.r-note + .r-note { margin-top: var(--sp-2); padding-top: var(--sp-2); border-top: 1px solid var(--line); }
.r-note code { background: var(--surface-alt); padding: .1em .4em; border-radius: 4px; font-size: .95em; }
.r-sortable { cursor: pointer; user-select: none; }
.r-sortable:hover { color: var(--ink); }
</style>
