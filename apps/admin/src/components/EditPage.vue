<script setup lang="ts">
// 通用編輯畫面：九個內容模型共用（docs/09-frontend.md §8）。
// 左側本文（依單元宣告動態產生欄位）＋ 底部（此輪合併在主欄下方，
// 版面夠單純時不必真的擠在「最底部」一段）共用 SEO 區塊 ＋ 右側工作流側欄。
//
// 權限模型（docs/10-api.md §4、docs/11-backend-design.md §5.4）：
//   - 本文（含關聯）：{unit}.edit，且醫師角色僅限 OwnerUserId=自己
//   - SEO 區塊：{unit}.seo（行銷角色的落點，與 edit 完全分離）
//   - 送審：{unit}.submit　　發布／下架／排程：{unit}.publish　　刪除：{unit}.delete
// ⚠️ 這裡的權限判斷只管「看不看得到、能不能按」，不是安全邊界——
// 真正擋得住的是 API 端（見 src/permissions.ts 檔頭註解）。
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { adminApi, ApiError } from '@/api/client'
import { currentUser } from '@/auth'
import { can, canDeleteTerm, ownsRecord } from '@/permissions'
import type { AdminRecord, RelationItem, SeoMeta, UnitKey } from '@/types'
import { emptySeo } from '@/types'
import type { UploadedImage } from '@/api/upload'
import type { UnitField } from '@/unit-schema'
import { UNIT_REGISTRY } from '@/units'
import StatusBadge from './StatusBadge.vue'
import RelationPicker from './RelationPicker.vue'
import Repeater from './Repeater.vue'
import HoursEditor from './HoursEditor.vue'
import ImageField from './ImageField.vue'

const props = defineProps<{ unit: UnitKey; id: number }>()
const router = useRouter()
const def = computed(() => UNIT_REGISTRY[props.unit])
const user = currentUser()
const permCtx = user ? { roles: user.roles, isSuperAdmin: user.isSuperAdmin } : null

const record = ref<AdminRecord | null>(null)
const loading = ref(true)
const notFound = ref(false)

// 本文編輯用的本地副本，跟 record 分開才做得出「未存變更離開前攔截」。
const bodyForm = reactive<{ title: string; slug: string; sortOrder: number; includeInSitemap: boolean; fields: Record<string, unknown> }>({
  title: '',
  slug: '',
  sortOrder: 0,
  includeInSitemap: true,
  fields: {},
})
const seoForm = reactive<SeoMeta>(emptySeo())
const bodyDirty = ref(false)
const seoDirty = ref(false)

const fieldOptions = reactive<Record<string, { value: string; label: string }[]>>({})
const riskTerms = ref<string[]>([])

const canEditBody = computed(() => {
  if (!can(permCtx, props.unit, 'edit')) return false
  if (def.value.ownershipRestricted && user && !ownsRecord(user, record.value?.ownerUserId ?? null)) return false
  if (props.unit === 'page' && record.value?.fields.superAdminOnly && !user?.isSuperAdmin) return false
  if (record.value?.status === 2) return false // 送審中本文鎖定（docs/11 §7）
  return true
})
const canEditSeo = computed(() => can(permCtx, props.unit, 'seo'))
const canSubmit = computed(() => can(permCtx, props.unit, 'submit') && record.value?.status === 1)
const canPublish = computed(() => can(permCtx, props.unit, 'publish'))
const canDelete = computed(() => {
  if (record.value?.isSystemLocked) return false
  // term 的刪除限超級管理員（動 URL 結構與 301 對照表），不是通用的 `{unit}.delete`
  // 權限碼——docs/10-api.md §3.3 的逐單元例外，見 src/permissions.ts 檔頭。
  if (props.unit === 'term') return canDeleteTerm(permCtx)
  return can(permCtx, props.unit, 'delete')
})
const slugLocked = computed(() => Boolean(record.value?.isSystemLocked))

async function loadOptionsFor(field: UnitField) {
  if (field.optionsFromTermType) fieldOptions[field.key] = await adminApi.taxonomy.termOptions(field.optionsFromTermType)
  if (field.optionsFromUnit) fieldOptions[field.key] = await adminApi.taxonomy.unitOptions(field.optionsFromUnit)
}

// ⚠️ vue-tsc 的模板運算式解析器不支援 `as { a: number }[]` 這種內嵌物件型別的
// 型別轉換（會被誤判成物件字面值 ＋ 空陣列索引，拋出 TS1005／TS1011）——
// 這裡把轉型抽到 <script> 這一層的具名函式，模板只呼叫函式，不再內嵌型別。
type HourRow = { dayOfWeek: number; startTime: string; endTime: string }
function hoursFieldValue(key: string): HourRow[] {
  return (bodyForm.fields[key] as HourRow[] | undefined) ?? []
}

/**
 * 新增一張圖時的空白列。
 * ⚠️ 逐張的額外欄位（案例的階段、拍攝日期）要一起給預設值 ——
 * 少了 `phase` 這一格，整筆案例送出去會被 API 退回（docs/08 §C-5 必填）。
 */
function newGalleryItem(field: UnitField): Record<string, unknown> {
  const row: Record<string, unknown> = { image: null, caption: '' }
  for (const sub of field.galleryItemFields ?? []) row[sub.key] = ''
  return row
}

// resetForms() 會觸發下面的 deep watch（把 record 的值寫進 bodyForm／seoForm）。
// suppressDirty 讓那一次觸發不算「使用者改的」，避免剛載入就顯示「有未存變更」。
let suppressDirty = false
function resetForms() {
  if (!record.value) return
  suppressDirty = true
  bodyForm.title = record.value.title
  bodyForm.slug = record.value.slug ?? ''
  bodyForm.sortOrder = record.value.sortOrder
  bodyForm.includeInSitemap = record.value.includeInSitemap
  bodyForm.fields = JSON.parse(JSON.stringify(record.value.fields))
  Object.assign(seoForm, record.value.seo)
  bodyDirty.value = false
  seoDirty.value = false
  nextTick(() => { suppressDirty = false })
}

async function load() {
  loading.value = true
  notFound.value = false
  try {
    record.value = await adminApi.content.get(props.unit, props.id)
    resetForms()
    for (const field of def.value.fields) await loadOptionsFor(field)
  } catch (e) {
    if (e instanceof ApiError && e.code === 'NOT_FOUND') notFound.value = true
    else throw e
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  riskTerms.value = await adminApi.taxonomy.riskTerms()
  await load()
})

watch([() => props.unit, () => props.id], load)
watch(bodyForm, () => { if (!suppressDirty) bodyDirty.value = true }, { deep: true })
watch(seoForm, () => { if (!suppressDirty) seoDirty.value = true }, { deep: true })

function confirmLeaveIfDirty(): boolean {
  if (!bodyDirty.value && !seoDirty.value) return true
  return window.confirm('有尚未儲存的變更，確定要離開嗎？')
}
onBeforeRouteLeave(() => confirmLeaveIfDirty())
function onBeforeUnloadHandler(e: BeforeUnloadEvent) {
  if (bodyDirty.value || seoDirty.value) e.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnloadHandler))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnloadHandler))

// ── 高風險字詞即時警示：只標示，不阻擋輸入（docs/02-backend-cms.md §5）──
function riskHitsFor(text: unknown): string[] {
  if (typeof text !== 'string' || !text) return []
  return riskTerms.value.filter((t) => text.includes(t))
}

// ── 儲存 ──────────────────────────────────────────────────────────────
const savingBody = ref(false)
const savingSeo = ref(false)
const actionError = ref('')
const actionNotice = ref('')
// 訊息語意分兩種，純粹用來挑下面提示框的 CSS modifier（DESIGN.md §3.6／§5）——
// 不影響任何資料或流程，只決定要套 --success 還是 --info。
const actionNoticeKind = ref<'success' | 'info'>('success')

async function saveBody() {
  savingBody.value = true
  actionError.value = ''
  try {
    record.value = await adminApi.content.update(props.unit, props.id, { ...bodyForm }, user!.id)
    resetForms()
    actionNotice.value = '本文已儲存。'
    actionNoticeKind.value = 'success'
  } catch (e) {
    actionError.value = e instanceof ApiError ? e.message : '儲存失敗。'
  } finally {
    savingBody.value = false
  }
}

async function saveSeo() {
  savingSeo.value = true
  actionError.value = ''
  try {
    record.value = await adminApi.content.updateSeo(props.unit, props.id, { ...seoForm }, user!.id)
    resetForms()
    actionNotice.value = 'SEO 設定已儲存。'
    actionNoticeKind.value = 'success'
  } catch (e) {
    actionError.value = e instanceof ApiError ? e.message : '儲存失敗。'
  } finally {
    savingSeo.value = false
  }
}

async function updateRelation(key: string, items: RelationItem[]) {
  if (!record.value) return
  try {
    record.value = await adminApi.content.updateRelations(props.unit, props.id, key, items, user!.id)
  } catch (e) {
    actionError.value = e instanceof ApiError ? e.message : '關聯儲存失敗。'
  }
}

// ── 工作流 ────────────────────────────────────────────────────────────
const riskFlagsFromSubmit = ref<string[]>([])

// 🔴 **2026-09-16：「發布中，網站重建進行中」那一整套拿掉了。**
//    前台改成執行期 SSR 之後沒有建置這一步 —— 核准的下一個請求就看得到，
//    沒有「進行中」這個狀態可以顯示，也沒有東西可以輪詢。

async function submitForReview() {
  if (bodyDirty.value && !window.confirm('送審前建議先儲存本文，是否先儲存？')) return
  if (bodyDirty.value) await saveBody()
  const result = await adminApi.content.submit(props.unit, props.id, user!.id, user!.displayName)
  riskFlagsFromSubmit.value = result.riskFlags
  record.value = await adminApi.content.get(props.unit, props.id)
  actionNotice.value = '已送出審核。'
  actionNoticeKind.value = 'success'
}

async function publishNow() {
  record.value = await adminApi.content.setPublishState(props.unit, props.id, 3, user!.id)
  // ⚠️ 這行文字原本寫「網站重建中」，是靜態站時代的殘留文案——SSR 之後
  // 已經沒有建置這一步了（見上方 2026-09-16 註解），文字沒跟著改掉，內容
  // 其實是錯的。順手修正，讓它與下方排程卡片的說明（同一份檔案 §排程）一致。
  //
  // ⚠️ 連帶：這裡是 success 而不是 info。info 是留給「還有下文」的訊息
  //    （例如排程），而發布是整個工作流最終的完成點，沒有後續了 ——
  //    「重建中」那個會變的狀態消失之後，它就不再是「提示」而是「完成」。
  actionNotice.value = '已核准發布，前台已經看得到了。'
  actionNoticeKind.value = 'success'
}
async function unpublishNow() {
  record.value = await adminApi.content.setPublishState(props.unit, props.id, 4, user!.id)
  actionNotice.value = '已下架。'
  actionNoticeKind.value = 'success'
}

const scheduleForm = reactive({ publishAt: '', unpublishAt: '' })
watch(record, (r) => {
  if (r) {
    scheduleForm.publishAt = r.publishAt ? r.publishAt.slice(0, 16) : ''
    scheduleForm.unpublishAt = r.unpublishAt ? r.unpublishAt.slice(0, 16) : ''
  }
}, { immediate: true })

async function saveSchedule() {
  record.value = await adminApi.content.schedule(
    props.unit,
    props.id,
    scheduleForm.publishAt ? new Date(scheduleForm.publishAt).toISOString() : null,
    scheduleForm.unpublishAt ? new Date(scheduleForm.unpublishAt).toISOString() : null,
    user!.id,
  )
  // 排程是這裡唯一的 info：內容還沒上線，真正生效在未來某個時間點。
  // 其餘五個動作都是當場就完成了，所以是 success（DESIGN.md §3.6 把
  // --adm-info 定義為「已排程／一般提示」，與徽章的「已排程」同一個顏色）。
  actionNotice.value = '已更新排程。到這個時間點，前台就會看得到。'
  actionNoticeKind.value = 'info'
}

async function removeRecord() {
  if (!window.confirm(`確定要刪除「${record.value?.title}」嗎？此動作無法復原。`)) return
  try {
    await adminApi.content.remove(props.unit, props.id)
    router.push(`/${props.unit}`)
  } catch (e) {
    actionError.value = e instanceof ApiError ? e.message : '刪除失敗。'
  }
}

// ── 版本歷程：**畫面已移除**（Tim 決定 2026-09-16，理由是後台太複雜）──────
//
// 🔴 **拿掉的只有這個畫面，快照機制必須留著。**
//    `ContentVersions` 不是可選的附加功能，它就是發布機制本身 ——
//    前台每一個查詢都是 `INNER JOIN ContentVersions ON Id = ci.PublishedVersionId`，
//    可見性條件的第一行也是 `PublishedVersionId IS NOT NULL`（docs/08 §B-2）。
//    刪掉那張表等於整個前台沒有內容可以輸出。
//
// ⚠️ API 端點（`GET /admin/{unit}/{id}/versions`、`.../restore`）**刻意保留**：
//    它們沒有害處，而且是「改壞了要救回來」時唯一的自助手段。
//    畫面拿掉之後，還原只能由有 API 權限的人執行 —— 這是這個決定的代價，
//    docs/02 §4 與 STATUS 都已記下。
</script>

<template>
  <div v-if="loading" class="adm-loading">
    <span class="adm-spinner" aria-hidden="true"></span>
    <span>載入{{ def.labelSingular }}中…</span>
  </div>
  <div v-else-if="notFound" class="adm-empty">
    <div class="adm-empty__icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m20 20-4.4-4.4" />
      </svg>
    </div>
    <p class="adm-empty__title">找不到這筆{{ def.labelSingular }}</p>
    <p class="adm-empty__desc">可能已經被刪除，或網址列的 id 打錯了。<RouterLink :to="`/${unit}`">回到{{ def.label }}列表</RouterLink>。</p>
  </div>

  <div v-else-if="record">
    <div class="adm-page__head">
      <div>
        <h1 class="adm-page__title">{{ record.title || `（未命名${def.labelSingular}）` }}</h1>
        <p class="adm-page__desc">
          <StatusBadge :status="record.status" :publish-at="record.publishAt" />
          <span v-if="record.urlPath"> ・ {{ record.urlPath }}</span>
        </p>
      </div>
    </div>

    <p v-if="actionNotice" class="adm-alert" :class="actionNoticeKind === 'info' ? 'adm-alert--info' : 'adm-alert--success'" style="margin-bottom: var(--sp-4)">{{ actionNotice }}</p>
    <p v-if="actionError" class="adm-alert adm-alert--danger" role="alert" style="margin-bottom: var(--sp-4)">{{ actionError }}</p>

    <div class="adm-editor-layout">
      <!-- ============================ 主欄：本文 ============================ -->
      <div>
        <form class="adm-form" @submit.prevent="saveBody">
          <div class="adm-card">
            <div class="adm-fieldset">
              <p class="adm-fieldset__legend">基本資料</p>
              <div class="adm-field-grid">
                <div class="adm-field adm-field--span2">
                  <label class="adm-field__label">標題<span class="adm-field__required">＊</span></label>
                  <input v-model="bodyForm.title" class="adm-input" type="text" :disabled="!canEditBody" required>
                </div>
                <div v-if="def.producesUrl" class="adm-field">
                  <label class="adm-field__label">Slug</label>
                  <input v-model="bodyForm.slug" class="adm-input" type="text" :disabled="!canEditBody || slugLocked">
                  <p v-if="slugLocked" class="adm-field__hint">系統頁／系統分類不可改 slug（IsSystemLocked）。</p>
                </div>
                <div class="adm-field">
                  <label class="adm-field__label">排序值</label>
                  <input v-model.number="bodyForm.sortOrder" class="adm-input" type="number" :disabled="!canEditBody">
                </div>
                <div class="adm-field">
                  <label class="adm-checkbox">
                    <input v-model="bodyForm.includeInSitemap" type="checkbox" :disabled="!canEditBody">
                    輸出至 sitemap
                  </label>
                  <p class="adm-field__hint">與 SEO 區塊的 noIndex 是兩件事，兩者都要設才不會自相矛盾。</p>
                </div>
              </div>
            </div>
          </div>

          <div
            v-for="group in [...new Set(def.fields.map((f) => f.group || '內容'))]"
            :key="group"
            class="adm-card"
          >
            <div class="adm-fieldset">
              <p class="adm-fieldset__legend">{{ group }}</p>
              <div class="adm-field-grid">
                <div
                  v-for="field in def.fields.filter((f) => (f.group || '內容') === group)"
                  :key="field.key"
                  class="adm-field"
                  :class="{ 'adm-field--span2': ['textarea', 'richtext', 'repeater', 'gallery', 'hours', 'tags'].includes(field.type) }"
                >
                  <label class="adm-field__label">
                    {{ field.label }}<span v-if="field.required" class="adm-field__required">＊</span>
                  </label>

                  <!-- text / number / date -->
                  <input
                    v-if="['text', 'number', 'date'].includes(field.type)"
                    class="adm-input"
                    :type="field.type"
                    :value="String(bodyForm.fields[field.key] ?? '')"
                    :disabled="!canEditBody || field.readOnly"
                    :required="field.required"
                    @input="bodyForm.fields[field.key] = ($event.target as HTMLInputElement).value"
                  >

                  <!-- boolean -->
                  <label v-else-if="field.type === 'boolean'" class="adm-checkbox">
                    <input
                      type="checkbox"
                      :checked="Boolean(bodyForm.fields[field.key])"
                      :disabled="!canEditBody || field.readOnly"
                      @change="bodyForm.fields[field.key] = ($event.target as HTMLInputElement).checked"
                    >
                    {{ field.hint ? '' : '是' }}
                  </label>

                  <!-- textarea / richtext（此輪先以純文字區塊模擬區塊編輯器，見下方註記） -->
                  <textarea
                    v-else-if="field.type === 'textarea' || field.type === 'richtext'"
                    class="adm-textarea"
                    :class="{ 'adm-textarea--tall': field.type === 'richtext' }"
                    :value="String(bodyForm.fields[field.key] ?? '')"
                    :disabled="!canEditBody || field.readOnly"
                    :required="field.required"
                    @input="bodyForm.fields[field.key] = ($event.target as HTMLTextAreaElement).value"
                  />

                  <!-- select（靜態選項） -->
                  <select
                    v-else-if="field.type === 'select' && !field.optionsFromTermType && !field.optionsFromUnit"
                    class="adm-select"
                    :value="String(bodyForm.fields[field.key] ?? '')"
                    :disabled="!canEditBody || field.readOnly"
                    @change="bodyForm.fields[field.key] = ($event.target as HTMLSelectElement).value"
                  >
                    <option value="">—</option>
                    <option v-for="opt in field.options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>

                  <!-- relation-single / select 動態選項（分類或另一個內容單元） -->
                  <select
                    v-else-if="field.type === 'relation-single' || field.optionsFromTermType || field.optionsFromUnit"
                    class="adm-select"
                    :value="String(bodyForm.fields[field.key] ?? '')"
                    :disabled="!canEditBody || field.readOnly"
                    :required="field.required"
                    @change="bodyForm.fields[field.key] = ($event.target as HTMLSelectElement).value"
                  >
                    <option value="">請選擇…</option>
                    <option v-for="opt in fieldOptions[field.key] ?? []" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>

                  <!-- image：上傳就在欄位裡，沒有媒體庫可挑（docs/08 §0 決策五）-->
                  <ImageField
                    v-else-if="field.type === 'image'"
                    :model-value="(bodyForm.fields[field.key] as UploadedImage | null) ?? null"
                    :disabled="!canEditBody"
                    @update:model-value="(v) => (bodyForm.fields[field.key] = v)"
                  />

                  <!-- gallery：一列一張圖 ＋ 圖說，形狀對齊 TreatmentImages／CaseImages／ClinicPhotos -->
                  <div v-else-if="field.type === 'gallery'" class="adm-repeater">
                    <div v-for="(item, idx) in (bodyForm.fields[field.key] as Record<string, unknown>[] | undefined) ?? []" :key="idx" class="adm-repeater__row">
                      <div class="adm-repeater__fields">
                        <ImageField
                          :model-value="(item.image as UploadedImage | null) ?? null"
                          :disabled="!canEditBody"
                          @update:model-value="(v) => (item.image = v)"
                        />
                        <input class="adm-input" type="text" placeholder="圖說" :value="item.caption ?? ''" :disabled="!canEditBody"
                          @input="item.caption = ($event.target as HTMLInputElement).value">

                        <!-- 逐張的額外欄位。⚠️ 案例圖片的「階段」在 API 是必填，
                             沒有這一段的話案例根本存不起來（docs/08 §C-5）。 -->
                        <div v-for="sub in field.galleryItemFields ?? []" :key="sub.key" class="adm-field">
                          <label class="adm-field__label">{{ sub.label }}</label>
                          <select
                            v-if="sub.type === 'select'"
                            class="adm-select"
                            :value="String(item[sub.key] ?? '')"
                            :disabled="!canEditBody"
                            @change="item[sub.key] = ($event.target as HTMLSelectElement).value"
                          >
                            <option value="">—</option>
                            <option v-for="opt in sub.options ?? []" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                          </select>
                          <input
                            v-else
                            class="adm-input"
                            :type="sub.type === 'date' ? 'date' : sub.type === 'time' ? 'time' : 'text'"
                            :value="String(item[sub.key] ?? '')"
                            :disabled="!canEditBody"
                            @input="item[sub.key] = ($event.target as HTMLInputElement).value"
                          >
                        </div>
                      </div>
                      <button type="button" class="btn btn--line btn--sm" :disabled="!canEditBody"
                        @click="(bodyForm.fields[field.key] as unknown[]).splice(idx, 1)">移除</button>
                    </div>
                    <button type="button" class="btn btn--ghost btn--sm" style="align-self:flex-start" :disabled="!canEditBody"
                      @click="bodyForm.fields[field.key] = [...((bodyForm.fields[field.key] as unknown[]) ?? []), newGalleryItem(field)]">
                      ＋ 新增圖片
                    </button>
                  </div>

                  <!-- tags -->
                  <div v-else-if="field.type === 'tags'" class="adm-tags">
                    <span v-for="(tag, idx) in (bodyForm.fields[field.key] as string[] | undefined) ?? []" :key="idx" class="c-tag">
                      {{ tag }}
                      <button type="button" class="adm-tags__remove" :disabled="!canEditBody"
                        @click="(bodyForm.fields[field.key] as string[]).splice(idx, 1)">✕</button>
                    </span>
                    <button type="button" class="btn btn--ghost btn--sm" :disabled="!canEditBody"
                      @click="bodyForm.fields[field.key] = [...((bodyForm.fields[field.key] as string[]) ?? []), '新標籤']">＋ 新增</button>
                  </div>

                  <!-- repeater -->
                  <Repeater
                    v-else-if="field.type === 'repeater'"
                    :fields="field.repeaterFields ?? []"
                    :model-value="(bodyForm.fields[field.key] as Record<string, unknown>[]) ?? []"
                    @update:model-value="(v) => (bodyForm.fields[field.key] = v)"
                  />

                  <!-- hours -->
                  <HoursEditor
                    v-else-if="field.type === 'hours'"
                    :model-value="hoursFieldValue(field.key)"
                    @update:model-value="(v) => (bodyForm.fields[field.key] = v)"
                  />

                  <p v-if="field.hint" class="adm-field__hint">{{ field.hint }}</p>
                  <p v-if="field.minLength || field.maxLength" class="adm-field__count">
                    {{ String(bodyForm.fields[field.key] ?? '').length }} 字
                    <span v-if="field.minLength && field.maxLength">（建議 {{ field.minLength }}–{{ field.maxLength }} 字）</span>
                  </p>
                  <p v-if="field.riskScan && riskHitsFor(bodyForm.fields[field.key]).length" class="adm-risk-hit">
                    ⚠️ 偵測到高風險字詞：<strong>{{ riskHitsFor(bodyForm.fields[field.key]).join('、') }}</strong>
                    ——不會擋下輸入，但送審時會一併記錄供審核者重點檢視。
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div v-if="canEditBody" class="adm-inline-actions">
            <button type="submit" class="btn btn--primary" :disabled="savingBody">{{ savingBody ? '儲存中…' : '儲存本文' }}</button>
            <span v-if="bodyDirty" class="adm-muted">有尚未儲存的變更</span>
          </div>
          <p v-else class="adm-muted">
            目前沒有編輯本文的權限{{ def.ownershipRestricted ? '（或這不是你自己的內容）' : '' }}。
          </p>
        </form>

        <!-- ============================ 關聯 ============================ -->
        <div v-if="def.relations?.length" class="adm-card">
          <p class="adm-fieldset__legend">關聯</p>
          <div v-for="field in def.relations" :key="field.key" class="adm-field adm-field--span2" style="margin-bottom: var(--sp-4)">
            <label class="adm-field__label">{{ field.label }}</label>
            <RelationPicker
              :field="field"
              :model-value="record.relations[field.key] ?? []"
              @update:model-value="(items) => updateRelation(field.key, items)"
            />
          </div>
        </div>

        <!-- ============================ 共用 SEO 區塊 ============================ -->
        <form class="adm-card" @submit.prevent="saveSeo">
          <p class="adm-fieldset__legend">SEO（共用區塊）</p>
          <div class="adm-field-grid">
            <div class="adm-field adm-field--span2">
              <label class="adm-field__label">SEO 標題</label>
              <input v-model="seoForm.seoTitle" class="adm-input" type="text" :disabled="!canEditSeo" placeholder="留空則由內容自動組出">
            </div>
            <div class="adm-field adm-field--span2">
              <label class="adm-field__label">Meta Description</label>
              <textarea v-model="seoForm.metaDescription" class="adm-textarea" :disabled="!canEditSeo" />
              <p class="adm-field__count">{{ (seoForm.metaDescription ?? '').length }} 字</p>
            </div>
            <div class="adm-field adm-field--span2">
              <label class="adm-field__label">AI 摘要（40–60 字直答式段落）</label>
              <textarea v-model="seoForm.aiSummary" class="adm-textarea" :disabled="!canEditSeo" />
              <p class="adm-field__hint">GEO 策略落地欄位；渲染在頁面最上方，同時輸出至結構化資料。</p>
              <p class="adm-field__count" :class="{ 'is-out-of-range': (seoForm.aiSummary ?? '').length > 0 && ((seoForm.aiSummary ?? '').length < 40 || (seoForm.aiSummary ?? '').length > 60) }">
                {{ (seoForm.aiSummary ?? '').length }} 字（建議 40–60 字）
              </p>
            </div>
            <div class="adm-field">
              <label class="adm-field__label">OG 分享圖</label>
              <ImageField
                :model-value="seoForm.ogImage"
                :disabled="!canEditSeo"
                @update:model-value="(v) => (seoForm.ogImage = v)"
              />
            </div>
            <div class="adm-field">
              <label class="adm-field__label">Canonical 覆寫</label>
              <input v-model="seoForm.canonicalOverride" class="adm-input" type="text" :disabled="!canEditSeo">
            </div>
            <div class="adm-field">
              <label class="adm-checkbox"><input v-model="seoForm.noIndex" type="checkbox" :disabled="!canEditSeo"> noindex</label>
            </div>
            <div class="adm-field adm-field--span2">
              <label class="adm-field__label">結構化資料覆寫（進階，JSON）</label>
              <textarea v-model="seoForm.structuredDataOverride" class="adm-textarea" :disabled="!canEditSeo" placeholder="留空由系統自動產生" />
            </div>
          </div>
          <div v-if="canEditSeo" class="adm-inline-actions" style="margin-top: var(--sp-4)">
            <button type="submit" class="btn btn--primary" :disabled="savingSeo">{{ savingSeo ? '儲存中…' : '儲存 SEO' }}</button>
            <span v-if="seoDirty" class="adm-muted">有尚未儲存的變更</span>
          </div>
        </form>
      </div>

      <!-- ============================ 右側：工作流側欄 ============================ -->
      <aside class="adm-workflow">
        <div class="adm-card">
          <p class="adm-card__title">工作流</p>
          <div class="adm-workflow__row"><span class="adm-workflow__label">狀態</span><StatusBadge :status="record.status" :publish-at="record.publishAt" /></div>
          <div class="adm-workflow__row"><span class="adm-workflow__label">更新時間</span><span>{{ new Date(record.updatedAt).toLocaleString('zh-TW') }}</span></div>


          <div class="adm-workflow__actions">
            <button v-if="canSubmit" type="button" class="btn btn--primary btn--block" @click="submitForReview">送出審核</button>
            <button v-if="canPublish && record.status !== 3" type="button" class="btn btn--primary btn--block" @click="publishNow">直接發布</button>
            <button v-if="canPublish && record.status === 3" type="button" class="btn btn--line btn--block" @click="unpublishNow">下架</button>
            <button v-if="canDelete" type="button" class="btn btn--line btn--block" @click="removeRecord">刪除</button>
          </div>

          <p v-if="riskFlagsFromSubmit.length" class="adm-risk-hit">
            送審時掃到高風險字詞：<strong>{{ riskFlagsFromSubmit.join('、') }}</strong>，已隨送審單記錄。
          </p>
        </div>

        <div v-if="canPublish" class="adm-card">
          <p class="adm-card__title">排程</p>
          <div class="adm-field">
            <label class="adm-field__label">上線時間</label>
            <input v-model="scheduleForm.publishAt" class="adm-input" type="datetime-local">
            <!-- ⚠️ 2026-09-16 改：原本寫「不是精確發布時間——到點後仍需一次全站重建才會上線」。
                 那是靜態版的事實，SSR 之後已經不對，而且是**低估**了實際行為。 -->
            <p class="adm-field__hint">到這個時間點，前台就會看得到（不需要重新建置）。留空＝核准後立即上線。</p>
          </div>
          <div class="adm-field">
            <label class="adm-field__label">下架時間</label>
            <input v-model="scheduleForm.unpublishAt" class="adm-input" type="datetime-local">
          </div>
          <button type="button" class="btn btn--ghost btn--block" @click="saveSchedule">儲存排程</button>
        </div>

      </aside>
    </div>
  </div>
</template>
