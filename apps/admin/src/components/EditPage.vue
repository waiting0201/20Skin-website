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
import type { AdminRecord, RelationItem, SeoDraft, SeoMeta, UnitKey } from '@/types'
import { emptySeo } from '@/types'
import { countPendingImages, resolveImage, uploadPendingImages, type ImageValue } from '@/image-value'
import { firstError, hasErrors, validateBody, validateSchedule, validateSeo, type FieldErrors } from '@/validation'
import type { UnitField } from '@/unit-schema'
import { UNIT_REGISTRY } from '@/units'
import StatusBadge from './StatusBadge.vue'
import RelationPicker from './RelationPicker.vue'
import Repeater from './Repeater.vue'
import HoursEditor from './HoursEditor.vue'
import ImageField from './ImageField.vue'
import StructuredField from './StructuredField.vue'
import { resolveSchema } from '@/api/content-fields'

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
// ⚠️ 型別是 SeoDraft 不是 SeoMeta：編輯中的 OG 圖可能還沒上傳（見 types.ts）。
const seoForm = reactive<SeoDraft>(emptySeo())
const bodyDirty = ref(false)
const seoDirty = ref(false)

const fieldOptions = reactive<Record<string, { value: string; label: string }[]>>({})
const riskTerms = ref<string[]>([])

// 送出前的驗證結果：{ 欄位鍵: 訊息 }。規則在 src/validation.ts，與 API 逐條對應。
// ⚠️ 只在按下儲存時算一次，不做逐字即時驗證 —— 打到一半就滿螢幕紅字，
//    使用者會學會忽略它，那道提示就等於不存在了。
const bodyErrors = ref<FieldErrors>({})
/** 哪些下拉欄位的選項沒載回來。空的＝都正常。 */
const optionLoadErrors = ref<string[]>([])
const seoErrors = ref<FieldErrors>({})
const scheduleError = ref('')

// 🔴 圖片是在**這一刻**才真的上傳的（src/image-value.ts 檔頭）。這兩個數字
//    讓按鈕說實話：「上傳 2 張圖片並儲存」而不是只寫「儲存」。
const pendingBodyImages = computed(() => countPendingImages(bodyForm.fields))
const pendingSeoImages = computed(() => countPendingImages(seoForm.ogImage))
const uploadingImages = ref(0)

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

// 🔴 **九個單元都有 slug，包含 FAQ。** FAQ 的 `producesUrl` 是 false（它不輸出獨立
//    網址），但 `ContentHandler` 的新增與更新都是 `NormalizeAndValidateSlug(..., required: true)`
//    ——空字串一樣被退回。
//    ⚠️ 這個欄位原本用 `v-if="def.producesUrl"` 藏起來，於是 FAQ 送出去的永遠是
//    `slug: ""`，**每一次儲存都回 400，而畫面上根本沒有那個欄位可以修**。
//    FAQ 的 slug 不是沒有用途，它是 `/faq/` 的頁內錨點（docs/08 §C-6）。
const slugRequired = computed(() => !slugLocked.value)

/**
 * 下拉選單的選項。
 * ⚠️ 失敗只記一筆提示，**不讓整個編輯畫面掛掉** —— 選項取不到時，其餘欄位仍然
 * 編得動；原本的寫法會讓一支選項查詢失敗就把 `load()` 整個拉掉，畫面停在空白。
 */
async function loadOptionsFor(field: UnitField) {
  try {
    if (field.optionsFromTermType) fieldOptions[field.key] = await adminApi.taxonomy.termOptions(field.optionsFromTermType)
    if (field.optionsFromUnit) fieldOptions[field.key] = await adminApi.taxonomy.unitOptions(field.optionsFromUnit)
  } catch (e) {
    fieldOptions[field.key] = []
    optionLoadErrors.value = [...new Set([...optionLoadErrors.value, field.label])]
    console.error(`載入「${field.label}」選項失敗`, e)
  }
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
//
// 🔴 **scope 不是可有可無的參數。** 本文與 SEO 是兩顆各自獨立的儲存按鈕
//    （權限也分開：`{unit}.edit` vs `{unit}.seo`），但原本兩邊存完都無條件
//    重設**兩份**表單 —— 也就是「改了一半的本文 → 去存 SEO → 本文的修改
//    當場被伺服器版本蓋掉」，而畫面上只會顯示一句「SEO 設定已儲存」。
//    ⚠️ 反過來也一樣：存本文會吃掉還沒存的 SEO 修改。
let suppressDirty = false
function resetForms(scope: 'all' | 'body' | 'seo' = 'all') {
  if (!record.value) return
  suppressDirty = true
  if (scope !== 'seo') {
    bodyForm.title = record.value.title
    bodyForm.slug = record.value.slug ?? ''
    bodyForm.sortOrder = record.value.sortOrder
    bodyForm.includeInSitemap = record.value.includeInSitemap
    bodyForm.fields = JSON.parse(JSON.stringify(record.value.fields))
    bodyDirty.value = false
  }
  if (scope !== 'body') {
    Object.assign(seoForm, record.value.seo)
    seoDirty.value = false
  }
  nextTick(() => { suppressDirty = false })
}

/**
 * 🔴 載入失敗**不可以再往外拋**。原本 NOT_FOUND 以外的錯誤是 `throw e`，
 *    而呼叫端是 `onMounted(async …)` —— 沒有人接得住：`loading` 被 finally 關掉、
 *    `record` 還是 null、`notFound` 是 false，於是模板三個分支全部不成立，
 *    **畫面是一片空白，沒有任何訊息**。API 一掛掉整個後台就長這樣。
 */
const loadError = ref('')

async function load() {
  loading.value = true
  notFound.value = false
  loadError.value = ''
  optionLoadErrors.value = []
  try {
    record.value = await adminApi.content.get(props.unit, props.id)
    resetForms()
    for (const field of def.value.fields) await loadOptionsFor(field)
  } catch (e) {
    if (e instanceof ApiError && e.code === 'NOT_FOUND') notFound.value = true
    else loadError.value = messageOf(e, '載入失敗。')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  // 高風險字詞只是輔助提示，取不到不該擋住編輯（docs/02 §5）。
  try {
    riskTerms.value = await adminApi.taxonomy.riskTerms()
  } catch (e) {
    console.error('載入高風險字詞清單失敗，字詞警示這一輪不作用', e)
  }
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

/** ApiError 的 `errors[]` 是逐欄位的細節，只顯示 message 會把最有用的那一段丟掉。 */
function messageOf(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.details.length ? `${e.message}（${e.details.join('、')}）` : e.message
  if (e instanceof Error) return e.message
  return fallback
}

/**
 * 儲存本文。順序是**驗證 → 上傳圖片 → 送出**，三步都不可以對調：
 *
 * 🔴 **驗證在上傳之前。** 反過來的話，一筆因為「忘了選分類」而存不成的內容，
 *    已經先把三張圖 commit 進 Blob 了 —— 使用者放棄編輯，那三張就是孤兒檔。
 *
 * @returns 有沒有真的存成功。送審那條路要靠它決定要不要繼續。
 */
async function saveBody(): Promise<boolean> {
  actionError.value = ''
  actionNotice.value = ''

  bodyErrors.value = validateBody(def.value, bodyForm, slugRequired.value, { slug: record.value?.slug ?? null })
  if (hasErrors(bodyErrors.value)) {
    const count = Object.keys(bodyErrors.value).length
    actionError.value = count > 1
      ? `有 ${count} 個欄位需要修正，第一個是：${firstError(bodyErrors.value)}`
      : String(firstError(bodyErrors.value))
    return false
  }

  savingBody.value = true
  try {
    // 🔴 圖片在這一刻才真的離開這台電腦（src/image-value.ts）。
    // ⚠️ 上傳完成的結果寫回表單，所以**送出失敗時再按一次不會重傳**——
    //    那幾張已經是 UploadedImage 了。
    if (pendingBodyImages.value > 0) {
      bodyForm.fields = await uploadPendingImages(bodyForm.fields, (done) => { uploadingImages.value = done })
    }
    record.value = await adminApi.content.update(props.unit, props.id, { ...bodyForm }, user!.id)
    resetForms('body') // ⚠️ 只重設本文：SEO 那邊可能有還沒存的修改
    bodyErrors.value = {}
    actionNotice.value = '本文已儲存。'
    actionNoticeKind.value = 'success'
    return true
  } catch (e) {
    actionError.value = messageOf(e, '儲存失敗。')
    return false
  } finally {
    savingBody.value = false
    uploadingImages.value = 0
  }
}

async function saveSeo(): Promise<boolean> {
  actionError.value = ''
  actionNotice.value = ''

  seoErrors.value = validateSeo(seoForm)
  if (hasErrors(seoErrors.value)) {
    actionError.value = String(firstError(seoErrors.value))
    return false
  }

  savingSeo.value = true
  try {
    // 🔴 先把 OG 圖變成真的（上傳並取得 blobPath），再組出送給 API 的 SeoMeta。
    //    `resolveImage` 的回傳型別就是 `UploadedImage | null`，所以這個 payload
    //    不需要任何型別斷言——漏掉這一步會是編譯錯誤，不是執行期的靜默錯誤。
    const ogImage = await resolveImage(seoForm.ogImage)
    seoForm.ogImage = ogImage
    const payload: SeoMeta = { ...seoForm, ogImage }
    record.value = await adminApi.content.updateSeo(props.unit, props.id, payload, user!.id)
    resetForms('seo') // ⚠️ 只重設 SEO：本文那邊可能有還沒存的修改
    seoErrors.value = {}
    actionNotice.value = 'SEO 設定已儲存。'
    actionNoticeKind.value = 'success'
    return true
  } catch (e) {
    actionError.value = messageOf(e, '儲存失敗。')
    return false
  } finally {
    savingSeo.value = false
    uploadingImages.value = 0
  }
}

async function updateRelation(key: string, items: RelationItem[]) {
  if (!record.value) return
  try {
    record.value = await adminApi.content.updateRelations(props.unit, props.id, key, items, user!.id)
  } catch (e) {
    actionError.value = messageOf(e, '關聯儲存失敗。')
  }
}

// ── 工作流 ────────────────────────────────────────────────────────────
const riskFlagsFromSubmit = ref<string[]>([])

// 🔴 **2026-09-16：「發布中，網站重建進行中」那一整套拿掉了。**
//    前台改成執行期 SSR 之後沒有建置這一步 —— 核准的下一個請求就看得到，
//    沒有「進行中」這個狀態可以顯示，也沒有東西可以輪詢。

const workflowBusy = ref(false)

/**
 * 包住五個工作流動作。**每一個都要包** —— 這五支原本一個 try 都沒有，
 * API 一出錯（權限不足、狀態機不允許、連不上）就是一個沒有人接的 promise rejection：
 * 畫面完全沒有反應，使用者只會再按一次。
 */
async function runWorkflow(fallback: string, fn: () => Promise<void>) {
  actionError.value = ''
  workflowBusy.value = true
  try {
    await fn()
  } catch (e) {
    actionError.value = messageOf(e, fallback)
  } finally {
    workflowBusy.value = false
  }
}

async function submitForReview() {
  // ⚠️ 原本是「按取消就整個不送審」——但問句問的是「要不要先儲存」，
  //    按取消的意思是「不要存」，不是「不要送審」。而且送審送的是**已存檔的**
  //    內容，未存的修改根本不會進審核，所以這裡改成：不存就不送，並說明原因。
  if (bodyDirty.value) {
    if (!window.confirm('本文有尚未儲存的變更。送審送出的是已儲存的版本，要先儲存再送審嗎？')) {
      actionError.value = '已取消送審——未儲存的修改不會進入審核，請先儲存或放棄變更。'
      return
    }
    if (!await saveBody()) return // 存不起來就不要送審，錯誤訊息已經顯示在上面
  }
  await runWorkflow('送審失敗。', async () => {
    const result = await adminApi.content.submit(props.unit, props.id, user!.id, user!.displayName)
    riskFlagsFromSubmit.value = result.riskFlags
    record.value = await adminApi.content.get(props.unit, props.id)
    actionNotice.value = '已送出審核。'
    actionNoticeKind.value = 'success'
  })
}

async function publishNow() {
  await runWorkflow('發布失敗。', async () => {
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
  })
}
async function unpublishNow() {
  await runWorkflow('下架失敗。', async () => {
    record.value = await adminApi.content.setPublishState(props.unit, props.id, 4, user!.id)
    actionNotice.value = '已下架。'
    actionNoticeKind.value = 'success'
  })
}

const scheduleForm = reactive({ publishAt: '', unpublishAt: '' })
watch(record, (r) => {
  if (r) {
    scheduleForm.publishAt = r.publishAt ? r.publishAt.slice(0, 16) : ''
    scheduleForm.unpublishAt = r.unpublishAt ? r.unpublishAt.slice(0, 16) : ''
  }
}, { immediate: true })

async function saveSchedule() {
  // `ContentHandler`：「下架時間必須晚於發布時間」。先在這裡擋，錯誤才指得到欄位。
  scheduleError.value = validateSchedule(scheduleForm.publishAt, scheduleForm.unpublishAt) ?? ''
  if (scheduleError.value) return

  await runWorkflow('排程儲存失敗。', async () => {
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
  })
}

async function removeRecord() {
  if (!window.confirm(`確定要刪除「${record.value?.title}」嗎？此動作無法復原。`)) return
  try {
    await adminApi.content.remove(props.unit, props.id)
    router.push(`/${props.unit}`)
  } catch (e) {
    actionError.value = messageOf(e, '刪除失敗。')
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
  <div v-else-if="loadError" class="adm-empty">
    <div class="adm-empty__icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 4.5 21 19.5H3z" />
        <path d="M12 10v4" />
        <path d="M12 17h.01" />
      </svg>
    </div>
    <p class="adm-empty__title">載入不到這筆{{ def.labelSingular }}</p>
    <p class="adm-empty__desc">{{ loadError }}</p>
    <p class="adm-empty__desc"><button type="button" class="btn btn--line btn--sm" @click="load">重新載入</button></p>
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
    <p v-if="optionLoadErrors.length" class="adm-alert adm-alert--warn" style="margin-bottom: var(--sp-4)">
      這些欄位的選項沒有載回來：<strong>{{ optionLoadErrors.join('、') }}</strong>。
      下拉選單會是空的——請重新載入這一頁，不要把它當成「沒有可選的項目」而清掉原本的值。
    </p>

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
                  <input v-model="bodyForm.title" class="adm-input" :class="{ 'is-invalid': bodyErrors.title }" type="text" :disabled="!canEditBody" maxlength="200">
                  <p v-if="bodyErrors.title" class="adm-field__error" role="alert">{{ bodyErrors.title }}</p>
                </div>
                <!-- ⚠️ 這裡刻意**不再**用 `v-if="def.producesUrl"` 把 FAQ 的 slug 藏起來，
                     理由見 <script> 裡 slugRequired 的註解：藏起來的結果是 FAQ 永遠存不起來。 -->
                <div class="adm-field">
                  <label class="adm-field__label">Slug<span v-if="slugRequired" class="adm-field__required">＊</span></label>
                  <input v-model="bodyForm.slug" class="adm-input" :class="{ 'is-invalid': bodyErrors.slug }" type="text" :disabled="!canEditBody || slugLocked" maxlength="160">
                  <p v-if="bodyErrors.slug" class="adm-field__error" role="alert">{{ bodyErrors.slug }}</p>
                  <p v-if="slugLocked" class="adm-field__hint">系統頁／系統分類不可改 slug（IsSystemLocked）。</p>
                  <p v-else-if="!def.producesUrl" class="adm-field__hint">FAQ 不輸出獨立網址，這個 slug 是 <code>/faq/</code> 頁內的錨點，但仍是必填。</p>
                  <p v-else class="adm-field__hint">小寫英數字與連字號，決定這一頁的網址。</p>
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
                <!-- ⚠️ 這裡刻意**不用** HTML 的 `required`：
                     ① 圖片、圖庫、標籤、複列這些欄位沒有原生的必填可以用，
                        兩套並行會變成「有些欄位跳瀏覽器泡泡、有些跳我們的紅字」；
                     ② 原生驗證擋下來時 submit 事件根本不會發生，`saveBody()`
                        的驗證與訊息就全部不會跑。驗證只留 validateBody 一條路。 -->
                <div
                  v-for="field in def.fields.filter((f) => (f.group || '內容') === group)"
                  :key="field.key"
                  class="adm-field"
                  :class="{ 'adm-field--span2': ['textarea', 'longtext', 'structured', 'repeater', 'gallery', 'hours', 'tags'].includes(field.type) }"
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

                  <!-- textarea / longtext：純文字長文。⚠️ 這裡沒有、也不會有富文本 ——
                       段落在前台是 `{{ }}` 純文字輸出（Tim 定案 2026-09-17）。 -->
                  <textarea
                    v-else-if="field.type === 'textarea' || field.type === 'longtext'"
                    class="adm-textarea"
                    :class="{ 'adm-textarea--tall': field.type === 'longtext' }"
                    :value="String(bodyForm.fields[field.key] ?? '')"
                    :disabled="!canEditBody || field.readOnly"
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
                    @change="bodyForm.fields[field.key] = ($event.target as HTMLSelectElement).value"
                  >
                    <option value="">請選擇…</option>
                    <option v-for="opt in fieldOptions[field.key] ?? []" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>

                  <!-- structured：區塊 JSON 的表單（見 structured-schema.ts）。
                       ⚠️ 這些欄位原本全是裸的 textarea，要使用者自己打出
                       `[{"label":"療程時間","value":"約 30–45 分鐘"}]` 這種東西。 -->
                  <StructuredField
                    v-else-if="field.type === 'structured'"
                    :schema="resolveSchema(field, { slug: record.slug ?? null })"
                    :model-value="bodyForm.fields[field.key]"
                    :disabled="!canEditBody"
                    :path="field.key"
                    :errors="bodyErrors"
                    @update:model-value="(v) => (bodyForm.fields[field.key] = v)"
                  />

                  <!-- image：上傳就在欄位裡，沒有媒體庫可挑（docs/08 §0 決策五）-->
                  <ImageField
                    v-else-if="field.type === 'image'"
                    :model-value="(bodyForm.fields[field.key] as ImageValue | null) ?? null"
                    :disabled="!canEditBody"
                    @update:model-value="(v) => (bodyForm.fields[field.key] = v)"
                  />

                  <!-- gallery：一列一張圖 ＋ 圖說，形狀對齊 TreatmentImages／CaseImages／ClinicPhotos -->
                  <div v-else-if="field.type === 'gallery'" class="adm-repeater">
                    <div v-for="(item, idx) in (bodyForm.fields[field.key] as Record<string, unknown>[] | undefined) ?? []" :key="idx" class="adm-repeater__row">
                      <div class="adm-repeater__fields">
                        <ImageField
                          :model-value="(item.image as ImageValue | null) ?? null"
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

                  <p v-if="bodyErrors[field.key]" class="adm-field__error" role="alert">{{ bodyErrors[field.key] }}</p>
                  <p v-if="field.hint" class="adm-field__hint">{{ field.hint }}</p>
                  <p v-if="(field.minLength || field.maxLength) && field.type !== 'structured'" class="adm-field__count">
                    {{ String(bodyForm.fields[field.key] ?? '').length }} 字
                    <span v-if="field.minLength && field.maxLength">（建議 {{ field.minLength }}–{{ field.maxLength }} 字）</span>
                  </p>
                  <!-- ⚠️ structured 欄位的高風險字詞掃描改在 StructuredField 裡逐格做
                       （這裡的值是物件不是字串，掃不到東西）。送審時伺服器仍會自己重掃，
                       那才是真正記進 ContentReviews.RiskFlags 的那一份。 -->
                  <p v-if="field.riskScan && field.type !== 'structured' && riskHitsFor(bodyForm.fields[field.key]).length" class="adm-risk-hit">
                    ⚠️ 偵測到高風險字詞：<strong>{{ riskHitsFor(bodyForm.fields[field.key]).join('、') }}</strong>
                    ——不會擋下輸入，但送審時會一併記錄供審核者重點檢視。
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div v-if="canEditBody" class="adm-inline-actions">
            <button type="submit" class="btn btn--primary" :disabled="savingBody">
              <template v-if="savingBody">{{ uploadingImages ? `上傳圖片中（${uploadingImages}/${pendingBodyImages}）…` : '儲存中…' }}</template>
              <template v-else-if="pendingBodyImages">上傳 {{ pendingBodyImages }} 張圖片並儲存</template>
              <template v-else>儲存本文</template>
            </button>
            <span v-if="bodyDirty" class="adm-muted">有尚未儲存的變更</span>
            <span v-if="pendingBodyImages" class="adm-muted">（{{ pendingBodyImages }} 張圖片還在瀏覽器裡，尚未上傳）</span>
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
              <input v-model="seoForm.seoTitle" class="adm-input" :class="{ 'is-invalid': seoErrors.seoTitle }" type="text" :disabled="!canEditSeo" placeholder="留空則由內容自動組出" maxlength="200">
              <p v-if="seoErrors.seoTitle" class="adm-field__error" role="alert">{{ seoErrors.seoTitle }}</p>
            </div>
            <div class="adm-field adm-field--span2">
              <label class="adm-field__label">Meta Description</label>
              <textarea v-model="seoForm.metaDescription" class="adm-textarea" :class="{ 'is-invalid': seoErrors.metaDescription }" :disabled="!canEditSeo" maxlength="400" />
              <p v-if="seoErrors.metaDescription" class="adm-field__error" role="alert">{{ seoErrors.metaDescription }}</p>
              <p class="adm-field__count">{{ (seoForm.metaDescription ?? '').length }} ／ 400 字</p>
            </div>
            <div class="adm-field adm-field--span2">
              <label class="adm-field__label">AI 摘要（40–60 字直答式段落）</label>
              <textarea v-model="seoForm.aiSummary" class="adm-textarea" :class="{ 'is-invalid': seoErrors.aiSummary }" :disabled="!canEditSeo" maxlength="300" />
              <p v-if="seoErrors.aiSummary" class="adm-field__error" role="alert">{{ seoErrors.aiSummary }}</p>
              <p class="adm-field__hint">
                GEO 策略落地欄位；渲染在頁面最上方，同時輸出至結構化資料。
                <!-- ⚠️ 兩個數字不一樣，不是筆誤：40–60 是 GEO 的建議值（docs/03 §4），
                     20–300 是 API 真的會擋下來的範圍（ContentHandler.UpdateSeoAsync）。 -->
                填了就必須介於 20–300 字，留空則不輸出。
              </p>
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
              <input v-model="seoForm.canonicalOverride" class="adm-input" :class="{ 'is-invalid': seoErrors.canonicalOverride }" type="text" :disabled="!canEditSeo" placeholder="留空＝用這一頁自己的網址">
              <p v-if="seoErrors.canonicalOverride" class="adm-field__error" role="alert">{{ seoErrors.canonicalOverride }}</p>
            </div>
            <div class="adm-field">
              <label class="adm-checkbox"><input v-model="seoForm.noIndex" type="checkbox" :disabled="!canEditSeo"> noindex</label>
            </div>
            <div class="adm-field adm-field--span2">
              <label class="adm-field__label">結構化資料覆寫（進階，JSON）</label>
              <textarea v-model="seoForm.structuredDataOverride" class="adm-textarea" :class="{ 'is-invalid': seoErrors.structuredDataOverride }" :disabled="!canEditSeo" placeholder="留空由系統自動產生" />
              <p v-if="seoErrors.structuredDataOverride" class="adm-field__error" role="alert">{{ seoErrors.structuredDataOverride }}</p>
              <p class="adm-field__hint">
                🔴 <strong>填了它，這一頁自動產生的結構化資料（MedicalWebPage、麵包屑等）會整段被取代</strong>，
                不是疊加上去。留空才是正常情況。
              </p>
              <p class="adm-field__hint">
                JSON 打錯一個逗號，那一頁的結構化資料就整段失效，所以格式檢查在這裡做，沒過就不讓存。
                ⚠️ 這一區存檔後要<strong>重新送審發布</strong>前台才會套用——前台讀的是已核准的版本快照。
              </p>
            </div>
          </div>
          <div v-if="canEditSeo" class="adm-inline-actions" style="margin-top: var(--sp-4)">
            <button type="submit" class="btn btn--primary" :disabled="savingSeo">
              <template v-if="savingSeo">儲存中…</template>
              <template v-else-if="pendingSeoImages">上傳 OG 圖並儲存 SEO</template>
              <template v-else>儲存 SEO</template>
            </button>
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
            <button v-if="canSubmit" type="button" class="btn btn--primary btn--block" :disabled="workflowBusy" @click="submitForReview">送出審核</button>
            <button v-if="canPublish && record.status !== 3" type="button" class="btn btn--primary btn--block" :disabled="workflowBusy" @click="publishNow">直接發布</button>
            <button v-if="canPublish && record.status === 3" type="button" class="btn btn--line btn--block" :disabled="workflowBusy" @click="unpublishNow">下架</button>
            <button v-if="canDelete" type="button" class="btn btn--line btn--block" :disabled="workflowBusy" @click="removeRecord">刪除</button>
          </div>
          <!-- ⚠️ 未存的修改不會進審核也不會上線：這裡要講出來，不然使用者按了
               「直接發布」看到「已核准發布」，會以為畫面上這些改動一起上線了。 -->
          <p v-if="bodyDirty || seoDirty" class="adm-workflow__note">
            目前有尚未儲存的變更。送審與發布處理的都是<strong>已儲存的版本</strong>，請先按上方的儲存。
          </p>

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
            <input v-model="scheduleForm.unpublishAt" class="adm-input" :class="{ 'is-invalid': scheduleError }" type="datetime-local">
            <p v-if="scheduleError" class="adm-field__error" role="alert">{{ scheduleError }}</p>
          </div>
          <button type="button" class="btn btn--ghost btn--block" :disabled="workflowBusy" @click="saveSchedule">儲存排程</button>
        </div>

      </aside>
    </div>
  </div>
</template>
