<script setup lang="ts">
// 帳號管理（/users）—— 規格見 docs/02 §4、docs/08 §A、docs/10 §3.4。
//
// 🔴 沒有雙因素（2026-09-11 院方決定）。這個畫面刻意不出現任何 2FA 相關 UI。
//
// 🔴 **頁首那整塊「後台安全防線只剩登入次數限制」的紅色警示已移除**
//    （Tim 指定 2026-09-17，**不要再加回來**）。兩個理由：
//    ① 它等於每次打開帳號管理都在重提「換掉種子密碼」，而那件事 Tim 已於
//       2026-09-16 判定**不是上線阻斷項**（CLAUDE.md 決策 10：不要再提案更換）。
//       2026-09-17 曾試著只改措辭（把「上線前必須更換」改成「最有效的一件事」），
//       但那仍然是同一個提案，只是語氣軟一點。
//    ② 常駐、每次都出現、又按不掉的警示，讀者三天後就會自動略過它 ——
//       到時候真正要緊的警示（同一個 .adm-alert--warn 樣式）也會一起被略過。
//
// ⚠️ **拿掉的是那塊常駐文宣，不是事實本身。** 決策 10 的連帶後果仍然成立
//    （帳密是唯一憑證、登入次數限制是唯一防線、/admin/ 公開可猜），
//    記在 CLAUDE.md 決策 10、docs/02 §4、docs/10 §5 —— 那才是它該待的地方。
// 🔴 **表格的「密碼」欄也一併拿掉**（Tim 指定 2026-09-17）。它顯示的是
//    `mustChangePassword`，而那個機制整個不做了 —— 管理者設定的密碼就是最終密碼，
//    不再要求本人首登時改掉（見 AccountHandler.MinPasswordLength 與 AppRouter）。
//    旗標不存在，欄位就只會是一整排「已更換」，沒有資訊量。
//
// ⚠️ UI 的權限判斷只管看不看得到，不是安全邊界（docs/09 §8）——真正擋得住的
// 是 API 端對 user.* 的驗證。這裡的權限碼只決定按鈕出不出現。
import { computed, reactive, ref, onMounted } from 'vue'
import { adminApi, ApiError } from '@/api/client'
import { currentUser } from '@/auth'
import { hasPermission } from '@/permissions'
import type { RoleCode } from '@/types'
import { ROLE_LABEL } from '@/types'
import type { AccountRecord } from '@/api/account'
import { MIN_PASSWORD_LENGTH, validatePassword, validateUserName } from '@/validation'
import { revealFirstError } from '@/scroll-to-error'

const user = currentUser()
const permCtx = user ? { roles: user.roles, isSuperAdmin: user.isSuperAdmin } : null
const canEdit = computed(() => hasPermission(permCtx, 'account.manage'))

const ALL_ROLE_CODES = Object.keys(ROLE_LABEL) as RoleCode[]

const accounts = ref<AccountRecord[]>([])
const loading = ref(true)
const keyword = ref('')

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return accounts.value
  return accounts.value.filter(
    (a) => a.userName.toLowerCase().includes(kw) || a.displayName.toLowerCase().includes(kw),
  )
})

function messageOf(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.details.length ? `${e.message}（${e.details.join('、')}）` : e.message
  if (e instanceof Error) return e.message
  return fallback
}

const loadError = ref('')

// ⚠️ 原本沒有 try/finally：API 一出錯 spinner 就永遠轉下去。
async function load() {
  loading.value = true
  loadError.value = ''
  try {
    accounts.value = await adminApi.account.user.list()
  } catch (e) {
    accounts.value = []
    loadError.value = messageOf(e, '載入帳號清單失敗。')
  } finally {
    loading.value = false
  }
}
onMounted(load)

// ── 醫師綁定：doctorId 選項，走 taxonomy.unitOptions（不直接碰 client.ts 的 Db，
// 這裡透過已經對外開放的門面查詢，跟 EditPage 的關聯選單走同一支）──────────
const doctorOptions = ref<{ value: string; label: string }[]>([])
onMounted(async () => {
  try {
    doctorOptions.value = await adminApi.taxonomy.unitOptions('doctor')
  } catch (e) {
    // 醫師綁定是選填，取不到不該擋住整個帳號管理畫面。
    console.error('載入醫師選項失敗', e)
  }
})

// ── 新增／編輯表單（同一份表單模型，用 mode 分流）──────────────────────
type FormMode = 'create' | 'edit'
const formOpen = ref(false)
const formMode = ref<FormMode>('create')
const editingId = ref<number | null>(null)
const form = reactive({
  userName: '',
  displayName: '',
  notifyEmail: '',
  roles: [] as RoleCode[],
  doctorId: '' as string | number,
  password: '',
})
const formError = ref('')
const fieldErrors = ref<Record<string, string>>({})
const submitting = ref(false)

/**
 * 🔴 這張表單原本**一條驗證都沒有**：四個輸入框沒有 `required`、沒有 pattern、
 *    沒有長度檢查，角色也沒檢查有沒有勾。空白送出去就是一個 400，
 *    而畫面上的提示文字（「僅可使用英數字與 . _ - @」「至少 8 碼，需同時包含
 *    英文字母與數字」）從來沒有人執行過。
 *
 * ⚠️ 規則與 `AccountHandler` 逐條對齊，見 src/validation.ts。
 */
function validateForm(): boolean {
  const errors: Record<string, string> = {}

  if (formMode.value === 'create') {
    const problem = validateUserName(form.userName)
    if (problem) errors.userName = problem
  }

  if (!form.displayName.trim()) errors.displayName = '顯示名稱為必填。'

  // 通知信箱是選填、不唯一、不是登入識別（docs/08 §A-1）——填了才檢查格式。
  if (form.notifyEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.notifyEmail.trim())) {
    errors.notifyEmail = '通知信箱的格式看起來不對（選填，留空即可）。'
  }

  if (form.roles.length === 0) errors.roles = '至少要指定一個角色。'

  // 「醫師」角色沒綁到人就判斷不了「自己的內容」（docs/10 §3.3），但那是提醒不是錯誤——
  // API 允許不綁，畫面上的 hint 已經說明後果。

  if (formMode.value === 'create') {
    const problem = validatePassword(form.password)
    if (problem) errors.password = problem
  }

  fieldErrors.value = errors
  // 紅字顯示在欄位下方，畫面同時捲到第一個出錯的那一格（src/scroll-to-error.ts）。
  if (Object.keys(errors).length) void revealFirstError(errors)
  return Object.keys(errors).length === 0
}

function resetForm() {
  form.userName = ''
  form.displayName = ''
  form.notifyEmail = ''
  form.roles = []
  form.doctorId = ''
  form.password = ''
  formError.value = ''
  fieldErrors.value = {}
}

function openCreate() {
  resetForm()
  formMode.value = 'create'
  editingId.value = null
  formOpen.value = true
}

function openEdit(record: AccountRecord) {
  resetForm()
  formMode.value = 'edit'
  editingId.value = record.id
  form.userName = record.userName
  form.displayName = record.displayName
  form.notifyEmail = record.notifyEmail ?? ''
  form.roles = [...record.roles]
  form.doctorId = record.doctorId ?? ''
  formOpen.value = true
}

function closeForm() {
  formOpen.value = false
  resetForm()
}

async function submitForm() {
  formError.value = ''
  if (!validateForm()) return
  submitting.value = true
  try {
    if (formMode.value === 'create') {
      await adminApi.account.user.create({
        userName: form.userName,
        displayName: form.displayName,
        notifyEmail: form.notifyEmail || null,
        roles: form.roles,
        doctorId: form.doctorId ? Number(form.doctorId) : null,
        password: form.password,
      })
    } else if (editingId.value !== null) {
      await adminApi.account.user.update(editingId.value, {
        displayName: form.displayName,
        notifyEmail: form.notifyEmail || null,
        roles: form.roles,
        doctorId: form.doctorId ? Number(form.doctorId) : null,
      })
    }
    await load()
    closeForm()
  } catch (e) {
    formError.value = messageOf(e, '儲存失敗。')
  } finally {
    submitting.value = false
  }
}

// ── 停用／啟用 ──────────────────────────────────────────────────────────
const toggling = ref<number | null>(null)
const toggleError = ref('')
async function toggleActive(record: AccountRecord) {
  if (record.id === user?.id && record.isActive) {
    window.alert('無法停用自己目前登入中的帳號。')
    return
  }
  const next = !record.isActive
  if (next === false && !window.confirm(`確定要停用「${record.displayName}」嗎？停用不會刪除這個帳號，內容的建立紀錄仍會保留。`)) return
  toggling.value = record.id
  toggleError.value = ''
  try {
    await adminApi.account.user.setActive(record.id, next)
    await load()
  } catch (e) {
    // ⚠️ 原本只有 finally 沒有 catch：停用失敗時按鈕恢復、清單不變，
    //    看起來就像「按了沒反應」，而錯誤只在 console。
    toggleError.value = messageOf(e, next ? '啟用失敗。' : '停用失敗。')
  } finally {
    toggling.value = null
  }
}

// ── 重設密碼 ──────────────────────────────────────────────────────────
const resettingId = ref<number | null>(null)
const resetForm2 = reactive({ password: '', confirm: '' })
const resetError = ref('')
const resetSubmitting = ref(false)

function openReset(record: AccountRecord) {
  resettingId.value = record.id
  resetForm2.password = ''
  resetForm2.confirm = ''
  resetError.value = ''
}
function closeReset() {
  resettingId.value = null
}
async function submitReset() {
  const problem = validatePassword(resetForm2.password)
  if (problem) {
    resetError.value = problem
    return
  }
  if (resetForm2.password !== resetForm2.confirm) {
    resetError.value = '兩次輸入的密碼不一致。'
    return
  }
  resetSubmitting.value = true
  resetError.value = ''
  try {
    await adminApi.account.user.resetPassword(resettingId.value!, resetForm2.password)
    await load()
    closeReset()
  } catch (e) {
    resetError.value = messageOf(e, '重設失敗。')
  } finally {
    resetSubmitting.value = false
  }
}

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('zh-TW') : '—'
}
</script>

<template>
  <section class="adm-page">
    <div class="adm-page__head">
      <div>
        <h1 class="adm-page__title">帳號管理</h1>
        <p class="adm-page__desc">共 {{ accounts.length }} 個帳號</p>
      </div>
      <div class="adm-page__actions">
        <button v-if="canEdit" type="button" class="btn btn--primary" @click="openCreate">＋ 新增帳號</button>
      </div>
    </div>

    <div class="adm-filters">
      <input v-model="keyword" type="search" placeholder="搜尋帳號或顯示名稱">
    </div>

    <p v-if="toggleError" class="adm-alert adm-alert--danger" role="alert">{{ toggleError }}</p>

    <div v-if="loading" class="adm-loading">
      <span class="adm-spinner" aria-hidden="true"></span>
      <span>載入中…</span>
    </div>
    <div v-else-if="loadError" class="adm-empty">
      <p class="adm-empty__title">載入不到帳號清單</p>
      <p class="adm-empty__desc">{{ loadError }}</p>
      <p class="adm-empty__desc"><button type="button" class="btn btn--line btn--sm" @click="load">重新載入</button></p>
    </div>
    <div v-else-if="!filtered.length" class="adm-empty">
      <div class="adm-empty__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13l2.5-7h13L21 13" /><path d="M3 13v6a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6" /><path d="M3 13h5l1.2 2.4h5.6L16 13h5" /></svg>
      </div>
      <p class="adm-empty__title">沒有符合的帳號</p>
      <p class="adm-empty__desc">{{ keyword ? `沒有帳號或顯示名稱包含「${keyword}」，換個關鍵字再試一次。` : '目前還沒有建立任何帳號。' }}</p>
    </div>

    <div v-else class="adm-table-wrap">
      <table class="adm-table">
        <thead>
          <tr>
            <th>帳號（登入用，非 email）</th>
            <th>顯示名稱</th>
            <th>角色</th>
            <th>通知信箱（選填）</th>
            <th>醫師綁定</th>
            <th>狀態</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in filtered" :key="a.id">
            <td><code>{{ a.userName }}</code></td>
            <td>{{ a.displayName }}</td>
            <td>{{ a.roles.map((r) => ROLE_LABEL[r]).join('、') }}</td>
            <td>{{ a.notifyEmail || '（未填）' }}</td>
            <td>{{ a.doctorId ? `#${a.doctorId}` : '—' }}</td>
            <td>
              <span class="adm-badge" :class="a.isActive ? 'adm-badge--published' : 'adm-badge--draft'">
                {{ a.isActive ? '啟用中' : '已停用' }}
              </span>
            </td>
            <td class="adm-table__actions">
              <button v-if="canEdit" type="button" class="btn btn--line btn--sm" @click="openEdit(a)">編輯</button>
              <button v-if="canEdit" type="button" class="btn btn--line btn--sm" @click="openReset(a)">重設密碼</button>
              <button
                v-if="canEdit"
                type="button"
                class="btn btn--line btn--sm"
                :disabled="toggling === a.id || (a.id === user?.id && a.isActive)"
                :title="a.id === user?.id && a.isActive ? '無法停用自己目前登入中的帳號' : ''"
                @click="toggleActive(a)"
              >
                {{ a.isActive ? '停用' : '啟用' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 新增／編輯表單 -->
    <div v-if="formOpen" class="adm-card users-panel">
      <h2 class="adm-card__title">{{ formMode === 'create' ? '新增帳號' : `編輯帳號：${form.userName}` }}</h2>
      <form class="adm-form" @submit.prevent="submitForm">
        <div class="adm-field-grid">
          <!-- ⚠️ `data-error-key` ＝ `validateForm()` 用的鍵，給 src/scroll-to-error.ts 找。 -->
          <div class="adm-field" data-error-key="userName">
            <label class="adm-field__label">帳號名稱<span class="adm-field__required">＊</span></label>
            <input v-model="form.userName" class="adm-input" :class="{ 'is-invalid': fieldErrors.userName }" :disabled="formMode === 'edit'" placeholder="例如 editor2" maxlength="100">
            <p v-if="fieldErrors.userName" class="adm-field__error" role="alert">{{ fieldErrors.userName }}</p>
            <p class="adm-field__hint">登入識別，不是 email。僅可使用英數字與 . _ - @，建立後不可更改。</p>
          </div>
          <div class="adm-field" data-error-key="displayName">
            <label class="adm-field__label">顯示名稱<span class="adm-field__required">＊</span></label>
            <input v-model="form.displayName" class="adm-input" :class="{ 'is-invalid': fieldErrors.displayName }" placeholder="後台顯示用" maxlength="100">
            <p v-if="fieldErrors.displayName" class="adm-field__error" role="alert">{{ fieldErrors.displayName }}</p>
          </div>
          <div class="adm-field" data-error-key="notifyEmail">
            <label class="adm-field__label">通知信箱</label>
            <input v-model="form.notifyEmail" class="adm-input" :class="{ 'is-invalid': fieldErrors.notifyEmail }" type="email" placeholder="選填，僅供通知，非登入用途">
            <p v-if="fieldErrors.notifyEmail" class="adm-field__error" role="alert">{{ fieldErrors.notifyEmail }}</p>
            <p class="adm-field__hint">選填、不唯一、可留空——不是登入識別，也不用來寄送登入相關通知。</p>
          </div>
          <div class="adm-field" v-if="form.roles.includes('Doctor')">
            <label class="adm-field__label">醫師綁定</label>
            <select v-model="form.doctorId" class="adm-select">
              <option value="">（未綁定——僅能靠人工比對姓名）</option>
              <option v-for="opt in doctorOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
            <p class="adm-field__hint">「醫師」角色要對上自己的個人頁，才能判斷「自己的內容」。</p>
          </div>
          <div class="adm-field adm-field--span2" data-error-key="roles">
            <label class="adm-field__label">角色<span class="adm-field__required">＊</span></label>
            <div class="users-role-checks">
              <label v-for="code in ALL_ROLE_CODES" :key="code" class="adm-checkbox">
                <input type="checkbox" :value="code" v-model="form.roles"> {{ ROLE_LABEL[code] }}
              </label>
            </div>
            <p v-if="fieldErrors.roles" class="adm-field__error" role="alert">{{ fieldErrors.roles }}</p>
          </div>
          <div v-if="formMode === 'create'" class="adm-field adm-field--span2" data-error-key="password">
            <label class="adm-field__label">初始密碼<span class="adm-field__required">＊</span></label>
            <input v-model="form.password" type="text" class="adm-input" :class="{ 'is-invalid': fieldErrors.password }" :placeholder="`至少 ${MIN_PASSWORD_LENGTH} 碼，需同時包含英文字母與數字`">
            <p v-if="fieldErrors.password" class="adm-field__error" role="alert">{{ fieldErrors.password }}</p>
            <p class="adm-field__hint"><strong>這組就是對方的密碼</strong>，建立後不會再要求他自己改一次，請直接告知本人。</p>
          </div>
        </div>

        <p v-if="formError" class="adm-field__error">{{ formError }}</p>

        <div class="adm-workflow__actions">
          <button type="submit" class="btn btn--primary" :disabled="submitting">{{ formMode === 'create' ? '建立帳號' : '儲存變更' }}</button>
          <button type="button" class="btn btn--ghost" @click="closeForm">取消</button>
        </div>
      </form>
    </div>

    <!-- 重設密碼 -->
    <div v-if="resettingId !== null" class="adm-card users-panel">
      <h2 class="adm-card__title">重設密碼</h2>
      <form class="adm-form" @submit.prevent="submitReset">
        <div class="adm-field-grid">
          <div class="adm-field">
            <label class="adm-field__label">新密碼<span class="adm-field__required">＊</span></label>
            <input v-model="resetForm2.password" type="text" class="adm-input" :placeholder="`至少 ${MIN_PASSWORD_LENGTH} 碼，需同時包含英文字母與數字`">
          </div>
          <div class="adm-field">
            <label class="adm-field__label">再輸入一次<span class="adm-field__required">＊</span></label>
            <input v-model="resetForm2.confirm" type="text" class="adm-input">
          </div>
        </div>
        <p v-if="resetError" class="adm-field__error">{{ resetError }}</p>
        <p class="adm-field__hint">
          重設後<strong>這組就是對方的密碼</strong>，不會再要求他登入後自己改一次，請直接告知本人。
          請避免使用生日、電話這類猜得到的字串。
        </p>
        <div class="adm-workflow__actions">
          <button type="submit" class="btn btn--primary" :disabled="resetSubmitting">重設</button>
          <button type="button" class="btn btn--ghost" @click="closeReset">取消</button>
        </div>
      </form>
    </div>
  </section>
</template>

<style scoped>
.users-panel {
  margin-top: var(--sp-4);
}
.users-role-checks {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-3);
}
</style>
