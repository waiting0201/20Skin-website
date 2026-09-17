<script setup lang="ts">
// 角色權限設定（/roles）—— 規格見 docs/02 §4、docs/10 §4。
//
// 🔴 **這個畫面存的是真的**（2026-09-12 起）：矩陣由 `GET /admin/role/matrix` 取得，
// 儲存走 `PUT /admin/role/{id}/permissions`，後端依 `RolePermissions` 判斷授權。
// ⚠️ 2026-09-16 修正：這裡原本有一整段（含顯示在畫面上的警語）說「儲存只落在 mock 的
//    示範資料裡」。那是 2026-09-12 接上真 API 之前的敘述 —— **它在告訴院方
//    「你改的不會生效」，而那已經是錯的**。
// ⚠️ 仍然成立的一件事：**改完之後，當下這個 session 的選單與按鈕不會立刻變**。
//    權限碼是登入時由 `POST /auth/login` 一起發下來的（permissions.ts 查那一份），
//    要重新登入才會換成新的。後端的授權判斷則是立即生效的。
//
// ⚠️ UI 的權限判斷只管看不看得到，不是安全邊界（docs/09 §8）。
import { computed, onMounted, reactive, ref } from 'vue'
import { adminApi, ApiError } from '@/api/client'
import { currentUser } from '@/auth'
import { hasPermission } from '@/permissions'
import type { RoleCode } from '@/types'
import { ROLE_LABEL } from '@/types'
import { ALL_ROLES, EDITABLE_ROLES, type PermissionGroup } from '@/api/account'

const user = currentUser()
const permCtx = user ? { roles: user.roles, isSuperAdmin: user.isSuperAdmin } : null
const canEditRoles = computed(() => hasPermission(permCtx, 'account.manage'))

const loading = ref(true)
const groups = ref<PermissionGroup[]>([])
const saved = ref<Record<RoleCode, string[]>>({} as Record<RoleCode, string[]>)
// draft：畫面上正在編輯、尚未儲存的狀態，用 Set 方便切換
const draft = reactive<Record<RoleCode, Set<string>>>({} as Record<RoleCode, Set<string>>)

const keyword = ref('')

function messageOf(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.details.length ? `${e.message}（${e.details.join('、')}）` : e.message
  if (e instanceof Error) return e.message
  return fallback
}

const loadError = ref('')
const saveError = ref('')

// ⚠️ 原本沒有 try/finally：API 一出錯 spinner 就永遠轉下去。
async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const matrix = await adminApi.account.role.matrix()
    groups.value = matrix.groups
    saved.value = matrix.granted
    for (const role of ALL_ROLES) draft[role] = new Set(matrix.granted[role] ?? [])
  } catch (e) {
    groups.value = []
    loadError.value = messageOf(e, '載入權限矩陣失敗。')
  } finally {
    loading.value = false
  }
}
onMounted(load)

const filteredGroups = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return groups.value
  return groups.value
    .map((g) => ({ ...g, cells: g.cells.filter((c) => c.code.includes(kw) || c.label.toLowerCase().includes(kw) || g.label.toLowerCase().includes(kw)) }))
    .filter((g) => g.cells.length)
})

function isGranted(role: RoleCode, code: string): boolean {
  if (role === 'SuperAdmin') return true
  return draft[role]?.has(code) ?? false
}

function toggle(role: RoleCode, code: string, checked: boolean) {
  if (role === 'SuperAdmin') return // 超級管理員永遠通過，矩陣上不接受編輯（見模板的 v-else 分支）
  if (checked) draft[role].add(code)
  else draft[role].delete(code)
}

function isDirty(role: RoleCode): boolean {
  const a = [...(draft[role] ?? [])].sort()
  const b = [...(saved.value[role] ?? [])].sort()
  return JSON.stringify(a) !== JSON.stringify(b)
}

const savingRole = ref<RoleCode | null>(null)
async function save(role: Exclude<RoleCode, 'SuperAdmin'>) {
  savingRole.value = role
  saveError.value = ''
  try {
    await adminApi.account.role.updateRolePermissions(role, [...draft[role]])
    saved.value = { ...saved.value, [role]: [...draft[role]] }
  } catch (e) {
    // 🔴 原本只有 finally 沒有 catch。權限存不起來卻毫無徵兆，是這個畫面最糟的失敗方式：
    //    畫面上的勾選狀態看起來已經套用了（draft 沒被還原），但資料庫其實沒變。
    saveError.value = `${messageOf(e, '權限儲存失敗。')}——畫面上的勾選是未儲存的草稿，不是目前生效的設定。`
  } finally {
    savingRole.value = null
  }
}
/** 把 draft 丟回上一次存檔的狀態。⚠️ 這只是丟掉畫面上的變更，不會動到資料庫。 */
function discard(role: RoleCode) {
  draft[role] = new Set(saved.value[role] ?? [])
}

// ⚠️ 沒有「還原預設值」：權限的預設值是種子資料（`SeedData.cs` 的 31 列 ＋ 授權表），
// 一旦上線就可能已經被刻意調整過。API 沒有這支端點，前端也不該自己記一份「預設值」——
// 那份一定會跟種子分岔，而且分岔時沒有人會發現。要回到種子值請重跑種子。

/**
 * 分類與標籤的三條逐單元例外（docs/10 §3.3）。
 * ⚠️ 這是從目前勾選的權限碼**推導**出來的，不是另一份表 —— 勾掉
 * `taxonomy.category.manage` 之後這張表要立刻跟著變，才看得出改動的後果。
 */
const termSpecialRules = computed(() =>
  ALL_ROLES.map((role) => {
    const codes = draft[role] ?? new Set<string>()
    const isSuper = role === 'SuperAdmin'
    return {
      role,
      canCreateCategory: isSuper || codes.has('taxonomy.category.manage'),
      canCreateTag: isSuper || codes.has('taxonomy.tag.create') || codes.has('taxonomy.category.manage'),
      canDeleteCategory: isSuper || codes.has('taxonomy.category.manage'),
    }
  }),
)

// ── 三條「畫面上要看得出來」的規則，對著目前 draft 即時驗證 ─────────────
// docs/02 §4：內容編輯沒有任何 {unit}.publish。
const editorHasPublish = computed(() => [...(draft.Editor ?? [])].some((c) => c.endsWith('.publish')))
// docs/02 §4：行銷只有 {unit}.seo，沒有其他 edit（除了 faq.edit）。
const marketingHasExtraEdit = computed(() =>
  [...(draft.Marketing ?? [])].some((c) => c.endsWith('.edit') && c !== 'content.faq.edit' && c !== 'seo.edit'),
)
</script>

<template>
  <section class="adm-page">
    <div class="adm-page__head">
      <div>
        <h1 class="adm-page__title">角色權限設定</h1>
        <p class="adm-page__desc">五個角色為系統種子（<code>IsSystem=1</code>），不可刪除，這裡只調整每個角色的權限碼。</p>
      </div>
    </div>

    <p class="adm-alert adm-alert--info">
      ⚠️ 儲存後<strong>後端的授權立即生效</strong>，但<strong>目前登入中的人要重新登入</strong>，
      畫面上的選單與按鈕才會跟著變 —— 權限是登入當下發下來的。
    </p>

    <p v-if="!canEditRoles" class="adm-alert adm-alert--info">沒有編輯角色權限的權限，以下為唯讀檢視。</p>

    <div v-if="loading" class="adm-loading">
      <span class="adm-spinner" aria-hidden="true"></span>
      <span>載入中…</span>
    </div>

    <div v-else-if="loadError" class="adm-empty">
      <p class="adm-empty__title">載入不到權限矩陣</p>
      <p class="adm-empty__desc">{{ loadError }}</p>
      <p class="adm-empty__desc"><button type="button" class="btn btn--line btn--sm" @click="load">重新載入</button></p>
    </div>

    <template v-else>
      <p v-if="saveError" class="adm-alert adm-alert--danger" role="alert">{{ saveError }}</p>
      <div class="roles-toolbar">
        <div v-for="role in EDITABLE_ROLES" :key="role" class="roles-toolbar__item">
          <strong>{{ ROLE_LABEL[role] }}</strong>
          <span v-if="isDirty(role)" class="adm-muted">有未儲存的變更</span>
          <button
            type="button"
            class="btn btn--sm btn--primary"
            :disabled="!canEditRoles || !isDirty(role) || savingRole === role"
            @click="save(role)"
          >
            儲存
          </button>
          <button type="button" class="btn btn--sm btn--ghost" :disabled="!isDirty(role)" @click="discard(role)">
            捨棄未存的變更
          </button>
        </div>
      </div>

      <div class="roles-rules">
        <p :class="editorHasPublish ? 'roles-rules__bad' : 'roles-rules__ok'">
          {{ editorHasPublish ? '⚠️ 內容編輯目前被勾選了發布權——三段式工作流要求發布權與編輯權分離，請移除。' : '✓ 內容編輯沒有任何 {unit}.publish（發布權與編輯權分離）。' }}
        </p>
        <p :class="marketingHasExtraEdit ? 'roles-rules__bad' : 'roles-rules__ok'">
          {{ marketingHasExtraEdit ? '⚠️ 行銷目前被勾選了 SEO 以外的編輯權——行銷只該能改 SEO 區塊與 FAQ。' : '✓ 行銷只有 {unit}.seo（與 faq.edit），沒有其他編輯權。' }}
        </p>
        <p class="roles-rules__note">
          ℹ️ 醫師的 <code>doctor.edit</code>／<code>article.edit</code> 受資料列層級限制（只能改
          <code>OwnerUserId</code> 是自己的那一筆）——這條規則權限碼本身表達不了，矩陣上打勾只代表
          「醫師角色有機會編輯這個單元」，實際能不能動某一筆由 API 的 <code>RequireOwnership</code> 判定。
        </p>
      </div>

      <div class="adm-filters">
        <input v-model="keyword" type="search" placeholder="篩選權限碼／名稱">
      </div>

      <div class="adm-table-wrap">
        <table class="adm-table roles-matrix">
          <thead>
            <tr>
              <th>權限碼</th>
              <th v-for="role in ALL_ROLES" :key="role">{{ ROLE_LABEL[role] }}</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="group in filteredGroups" :key="group.key">
              <tr class="roles-matrix__group">
                <td :colspan="ALL_ROLES.length + 1">{{ group.label }}</td>
              </tr>
              <tr v-for="cell in group.cells" :key="cell.code">
                <td><code>{{ cell.code }}</code><span class="adm-muted"> {{ cell.label }}</span></td>
                <td v-for="role in ALL_ROLES" :key="role" class="roles-matrix__cell">
                  <span v-if="role === 'SuperAdmin'" class="roles-matrix__always" title="超級管理員永遠通過">✓</span>
                  <input
                    v-else
                    type="checkbox"
                    :checked="isGranted(role, cell.code)"
                    :disabled="!canEditRoles"
                    @change="toggle(role, cell.code, ($event.target as HTMLInputElement).checked)"
                  >
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <div class="adm-card roles-term-card">
        <h2 class="adm-card__title">分類與標籤的新增／刪除（term 特例）</h2>
        <p class="adm-field__hint">
          動到 URL 結構與 301 對照表，權限碼本身表達不了，由 <code>canCreateTerm()</code>／<code>canDeleteTerm()</code>
          兩個函式逐角色判定（不受上方矩陣的 <code>term.edit</code> 勾選影響）。
        </p>
        <div class="adm-table-wrap">
          <table class="adm-table">
            <thead>
              <tr>
                <th>角色</th>
                <th>新增分類</th>
                <th>新增標籤</th>
                <th>刪除分類</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in termSpecialRules" :key="r.role">
                <td>{{ ROLE_LABEL[r.role] }}</td>
                <td>{{ r.canCreateCategory ? '✓' : '—' }}</td>
                <td>{{ r.canCreateTag ? '✓' : '—' }}</td>
                <td>{{ r.canDeleteCategory ? '✓' : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.roles-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-4, 16px);
  margin-bottom: var(--sp-4);
}
.roles-toolbar__item {
  display: flex;
  align-items: center;
  gap: var(--sp-2, 8px);
}
.roles-rules {
  margin-bottom: var(--sp-4);
  display: flex;
  flex-direction: column;
  gap: 0.4em;
}
.roles-rules__ok { color: var(--adm-ok); }
.roles-rules__bad { color: var(--adm-danger); font-weight: 600; }
.roles-rules__note { color: var(--ink-50); }
.roles-matrix__group td {
  background: var(--fill-hover);
  font-weight: 600;
}
.roles-matrix__cell { text-align: center; }
.roles-matrix__always { color: var(--ink-50); }
.roles-term-card { margin-top: var(--sp-5); }

/* 31 個權限碼＋5 個角色的矩陣一長串，密度是這頁的重點——表頭固定在頂列
   （貼齊 .adm-topbar 下緣），往下捲動時仍看得到「這一欄是哪個角色」。 */
.roles-matrix thead th {
  position: sticky;
  top: var(--adm-topbar-h);
  z-index: 2;
}
</style>
