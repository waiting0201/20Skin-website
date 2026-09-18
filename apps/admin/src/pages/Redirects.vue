<script setup lang="ts">
// 301 轉址管理（/redirects）—— 規格見 docs/01 §4、docs/06 §6、docs/07 §2、docs/08 §H。
//
// **1000 條**（實數，2026-09-14 匯入，CLAUDE.md 關鍵數字表），不可一頁全載——
// 分頁 ＋ 關鍵字搜尋（docs/06 §6）。CSV 匯入匯出是必要功能，不是加分項。
// ⚠️ 舊敘述「約 770 條」是估算的下限，已作廢。
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
import { validateRedirectPath } from '@/validation'

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

function messageOf(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.details.length ? `${e.message}（${e.details.join('、')}）` : e.message
  if (e instanceof Error) return e.message
  return fallback
}

/** 清單／側欄／匯入匯出失敗的訊息。⚠️ 這幾支原本一個 catch 都沒有。 */
const pageError = ref('')

async function load() {
  loading.value = true
  pageError.value = ''
  try {
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
  } catch (e) {
    items.value = []
    totalCount.value = 0
    pageError.value = messageOf(e, '載入轉址規則失敗。')
  } finally {
    loading.value = false
  }
}

async function loadSidebar() {
  try {
    stats.value = await adminApi.redirect.stats()
    promoted.value = await adminApi.redirect.promotedToConfig()
  } catch (e) {
    // 統計與「已寫進設定檔的規則」是輔助資訊，取不到就不顯示那兩塊，不擋主清單。
    console.error('載入轉址統計失敗', e)
  }
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
const formErrors = ref<Record<string, string>>({})
const saving = ref(false)

function openCreate() {
  editingId.value = null
  Object.assign(form, { fromPath: '', toPath: '', statusCode: 301, source: 2, isActive: true, isVerified: false })
  formError.value = ''
  formErrors.value = {}
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
  formErrors.value = {}
  formOpen.value = true
}

function closeForm() {
  formOpen.value = false
}

/**
 * 🔴 萬用字元與「來源＝目標」是這張表最會出事的兩件事，而 API 都不擋：
 *    - 萬用字元把一批舊網址全倒進分類頁，Google 判定為軟性 404（畫面上方那段
 *      說明文字本來就寫著禁止，但沒有人執行）；
 *    - 來源等於目標＝無限轉址迴圈，瀏覽器直接給 ERR_TOO_MANY_REDIRECTS。
 */
function validateForm(): boolean {
  const errors: Record<string, string> = {}
  const from = validateRedirectPath(form.fromPath, '來源路徑')
  if (from) errors.fromPath = from
  const to = validateRedirectPath(form.toPath, '目標路徑')
  if (to) errors.toPath = to
  if (!errors.fromPath && !errors.toPath && form.fromPath.trim() === form.toPath.trim()) {
    errors.toPath = '來源與目標不能是同一個路徑——那會變成無限轉址迴圈。'
  }
  formErrors.value = errors
  return Object.keys(errors).length === 0
}

async function submitForm() {
  formError.value = ''
  if (!validateForm()) return
  saving.value = true
  try {
    if (editingId.value === null) {
      await adminApi.redirect.create({ ...form })
    } else {
      await adminApi.redirect.update(editingId.value, { ...form })
    }
    formOpen.value = false
    await Promise.all([load(), loadSidebar()])
  } catch (e) {
    formError.value = messageOf(e, '儲存失敗。')
  } finally {
    saving.value = false
  }
}

async function removeRow(record: RedirectRecord) {
  if (!window.confirm(`確定要刪除「${record.fromPath}」的轉址規則？這個動作無法復原。`)) return
  pageError.value = ''
  try {
    await adminApi.redirect.remove(record.id)
  } catch (e) {
    pageError.value = messageOf(e, '刪除失敗。')
  }
  await Promise.all([load(), loadSidebar()])
}

// ── CSV 匯出 ──────────────────────────────────────────────────────────

async function exportCsv() {
  pageError.value = ''
  let csv: string
  try {
    csv = await adminApi.redirect.csv.exportAll()
  } catch (e) {
    pageError.value = messageOf(e, '匯出失敗。')
    return
  }
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
  pageError.value = ''
  try {
    const text = await file.text()
    importRows.value = adminApi.redirect.import.parseCsv(text)
  } catch (err) {
    pageError.value = messageOf(err, '讀不到這個 CSV 檔。')
    return
  }
  await runPreview()
}

async function runPreview() {
  if (!importRows.value.length) {
    importPreview.value = null
    return
  }
  importChecking.value = true
  pageError.value = ''
  try {
    const knownPaths = await collectKnownPaths()
    importPreview.value = await adminApi.redirect.import.preview(importRows.value, knownPaths)
  } catch (e) {
    importPreview.value = null
    pageError.value = `${messageOf(e, '衝突檢查失敗。')}——沒有檢查結果就不要匯入。`
  } finally {
    importChecking.value = false
  }
}

async function commitImport() {
  if (!importRows.value.length) return
  importCommitting.value = true
  pageError.value = ''
  try {
    const result = await adminApi.redirect.import.commit(importRows.value, { overwriteExisting: importOverwrite.value })
    importResultMsg.value = `匯入完成：新增 ${result.created} 筆、更新 ${result.updated} 筆、略過 ${result.skipped} 筆。`
    importRows.value = []
    importPreview.value = null
    if (fileInput.value) fileInput.value.value = ''
    await Promise.all([load(), loadSidebar()])
  } catch (e) {
    // ⚠️ 匯入是逐筆寫入，失敗時**前面幾筆已經進去了**——不要說「匯入失敗」就算了，
    //    要叫人回頭看清單確認實際狀態。
    pageError.value = `${messageOf(e, '匯入失敗。')}——匯入是逐筆寫入的，請回到下方清單確認已經進去幾筆再重試。`
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

    <p v-if="!canView" class="adm-alert adm-alert--info">沒有檢視這個畫面的權限。</p>
    <p v-if="pageError" class="adm-alert adm-alert--danger" role="alert" style="margin-bottom: var(--sp-4)">{{ pageError }}</p>

    <template v-else>
      <div class="adm-card">
        <!-- ⚠️ 這張卡片 2026-09-18 由「為什麼要有這個畫面」改寫（Tim 指定：後台不要放
             工程原理）。原文講的是 staticwebapp.config.json 的 20 KB 上限、catch-all
             路由與 GET /redirects/resolve、Application Insights ——
             那些是 CLAUDE.md 決策 5／7 與 docs/07 的事，院方看了也不會因此做任何決定。
             🔴 **留下來的兩條是可行動的**：不可用萬用字元、帶 # 的網址建不了規則。
             那不是原理，是「你在這個表單裡會踩到什麼」。 -->
        <p class="r-note">
          舊網站的網址改版後就失效了，這張表負責把它們一條一條送到新頁面——
          搜尋引擎排名與別人貼在外面的連結才不會斷掉。
          <strong>一條舊網址對一條新網址</strong>，不可以用萬用字元一次倒進分類頁（會被 Google 判定成假頁面）。
        </p>
        <p class="r-note">
          <strong>帶 <code>#</code> 的網址建不了規則</strong>（例如 <code>/contact.php#20</code>）——
          <code>#</code> 後面的內容瀏覽器不會送給伺服器，伺服器看不到就無從轉起。
          這種網址只建到 <code>#</code> 之前那一段（<code>/contact.php</code>）即可。
        </p>
      </div>

      <div v-if="promoted.length" class="adm-card">
        <h2 class="adm-card__title">走最快路徑的規則</h2>
        <!-- ⚠️ 這裡原本多一欄「命中次數」表頭，但底下完全沒有對應的 <td>——
             Redirects 表沒有這個欄位（見 api/redirect.ts 的說明，命中數要靠
             Application Insights 離線彙總），表頭是量測不到的欄位，拿掉比留一個
             永遠空白、還讓其他欄位對不齊的欄位好。 -->
        <p class="adm-field__hint" style="margin-bottom: var(--sp-3)">
          這幾條流量最高，直接寫在網站設定裡、不必查表，所以轉得最快。要增減請告知工程端。
        </p>
        <div class="adm-table-wrap">
          <table class="adm-table">
            <thead><tr><th>來源路徑</th><th>目標路徑</th></tr></thead>
            <tbody>
              <tr v-for="r in promoted" :key="r.id">
                <td class="is-wrap">{{ r.fromPath }}</td>
                <td class="is-wrap">{{ r.toPath }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 新增／編輯表單 -->
      <div v-if="formOpen" class="adm-card">
        <h2 class="adm-card__title">{{ editingId === null ? '新增轉址規則' : `編輯轉址規則 #${editingId}` }}</h2>
        <p v-if="formError" class="adm-alert adm-alert--danger" role="alert" style="margin-bottom: var(--sp-3)">{{ formError }}</p>
        <form class="adm-form" @submit.prevent="submitForm">
          <div class="adm-field-grid">
            <div class="adm-field adm-field--span2">
              <label class="adm-field__label">來源路徑<span class="adm-field__required">＊</span></label>
              <input v-model="form.fromPath" class="adm-input" :class="{ 'is-invalid': formErrors.fromPath }" placeholder="/share.php?class=醫美新知">
              <p v-if="formErrors.fromPath" class="adm-field__error" role="alert">{{ formErrors.fromPath }}</p>
              <p class="adm-field__hint">可以帶 <code>?</code> 後面的參數，儲存時會自動整理成標準寫法。不可使用萬用字元。</p>
            </div>
            <div class="adm-field adm-field--span2">
              <label class="adm-field__label">目標路徑<span class="adm-field__required">＊</span></label>
              <input v-model="form.toPath" class="adm-input" :class="{ 'is-invalid': formErrors.toPath }" placeholder="/blog/medical-aesthetics/">
              <p v-if="formErrors.toPath" class="adm-field__error" role="alert">{{ formErrors.toPath }}</p>
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

        <div v-if="importChecking" class="adm-loading">
          <span class="adm-spinner" aria-hidden="true"></span>
          <span>檢查中…</span>
        </div>

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

        <p v-if="importResultMsg" class="adm-alert adm-alert--success" style="margin-top: var(--sp-3)">{{ importResultMsg }}</p>
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

      <div v-if="loading" class="adm-loading">
        <span class="adm-spinner" aria-hidden="true"></span>
        <span>載入中…</span>
      </div>
      <div v-else-if="!items.length" class="adm-empty">
        <div class="adm-empty__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13l2.5-7h13L21 13" /><path d="M3 13v6a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6" /><path d="M3 13h5l1.2 2.4h5.6L16 13h5" /></svg>
        </div>
        <p class="adm-empty__title">沒有符合條件的轉址規則</p>
        <p class="adm-empty__desc">{{ query.keyword || query.isActive || query.source ? '調整篩選條件或關鍵字再試一次。' : '目前還沒有建立任何轉址規則，可以用下方「CSV 匯入」批次建立，或按上方「新增規則」逐筆加入。' }}</p>
      </div>

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
