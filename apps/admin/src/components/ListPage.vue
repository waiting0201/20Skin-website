<script setup lang="ts">
// 通用清單畫面：九個內容模型共用（docs/09-frontend.md §8）。
// 分頁 20 筆、關鍵字、狀態／分類篩選、批次上下架、排序。
//
// 排序 2026-09-17 由上／下移動按鈕改成拖曳（Tim 指定，↑↓ 一併移除）。
// 拖放機制見 `@/drag-sort`，端點是 `adminApi.content.sort()`。
//
// 🔴 **只送當頁那幾筆，而且送的是「它們原本佔住的那幾個排序值」的重新分配。**
//    例：這一頁的 sortOrder 是 40、41、42，把第三筆拖到最前面 → 送出
//    `[{三,40},{一,41},{二,42}]`。沒出現在這一頁的資料完全不受影響，
//    篩選中也成立（那幾筆各自保有自己的全域位置，只是彼此對調）。
//
// 🔴 **這個作法的前提是「排序值不重複」** —— migration `NormalizeSortOrder`
//    已把每個型別正規化成 0..n-1，`ContentHandler.CreateAsync` 也改成新增時取
//    `MAX+1`。值重複的話**沒有任何值可以寫**（拖了等於沒拖），所以下面偵測到
//    重複會直接報錯，不會假裝排好了。
//
// ⚠️ **舊作法（送整個單元的順序）已作廢**，連同它的 100 筆上限。那個上限是
//    API 的 `Paging.MaxPageSize`，導致分類標籤（406）與文章（1111）整個不給拖。
//
// ⚠️ **當頁內拖**：沒辦法把第 5 頁的項目拖到第 1 頁。要搬遠距離請改編輯頁的「排序值」。
// ⚠️ **文章刻意不給拖**（`listSortable: false`）—— 前台 `/blog/`、分類頁、標籤頁
//    一律是 `sort=latest`（發布日期新到舊），`SortOrder` 根本不影響它們，
//    給了把手等於給一個「後台看得到效果、前台看不到」的假功能。
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { adminApi, ApiError } from '@/api/client'
import { currentUser } from '@/auth'
import { can, canCreateTerm } from '@/permissions'
import type { AdminRecord, ContentStatus, UnitKey } from '@/types'
import { STATUS_LABEL } from '@/types'
import type { UnitField } from '@/unit-schema'
import { UNIT_REGISTRY } from '@/units'
import { validateSlug } from '@/validation'
import { useDragSort } from '@/drag-sort'
import { rememberListView, recallListView } from '@/list-state'
import DragHandle from './DragHandle.vue'
import StatusBadge from './StatusBadge.vue'

const props = defineProps<{ unit: UnitKey }>()
const router = useRouter()
const route = useRoute()
const def = computed(() => UNIT_REGISTRY[props.unit])
const user = currentUser()
const permCtx = user ? { roles: user.roles, isSuperAdmin: user.isSuperAdmin } : null

const canView = computed(() => can(permCtx, props.unit, 'view'))
const canEdit = computed(() => can(permCtx, props.unit, 'edit'))
const canPublish = computed(() => can(permCtx, props.unit, 'publish'))
const canCreateGeneric = computed(() => {
  // ⚠️ term 的新增權限分兩種（標籤／分類），只要其中一種有就給按鈕 ——
  //    對話框裡的「型別」下拉會依權限只列出建得出來的那幾種。
  if (props.unit === 'term') return canCreateTerm(permCtx, true) || canCreateTerm(permCtx, false)
  return canEdit.value
})

const items = ref<AdminRecord[]>([])
const totalCount = ref(0)
const loading = ref(true)
const selected = ref<Set<number>>(new Set())

const query = reactive({ page: 1, pageSize: 20, keyword: '', status: '' as '' | ContentStatus, categoryId: '', termType: '' })
const categoryOptions = ref<{ value: string; label: string }[]>([])

/**
 * 「分類與標籤」的型別篩選（2026-09-17）。
 *
 * ⚠️ 為什麼非有不可：term 一張表混了四種東西，實測 406 筆裡 393 筆是文章標籤，
 *    而清單是 `ORDER BY SortOrder, Id`、term 的 SortOrder 全是 0 —— 四個療程分類
 *    落在第 20–21 頁（共 21 頁）。沒有這個下拉，維護療程分類只能靠關鍵字猜名字。
 *
 * ⚠️ 選項**從 term 單元的欄位宣告讀**，不在這裡再抄一份四個標籤 ——
 *    抄一份的下場是「新增對話框叫療程分類、篩選器叫別的名字」。
 */
const termTypeOptions = computed(
  () => def.value.fields.find((f) => f.key === 'termType')?.options ?? [],
)

// 醫師角色只能編輯自己的內容——清單預設先幫他們濾出自己的（docs/10-api.md §3.3：
// OwnerUserId 判定）。這是體驗上的便利，不是安全邊界；勾掉一樣看得到別人的（若有 view 權限）。
const onlyMine = ref(Boolean(user?.roles.includes('Doctor') && !user?.isSuperAdmin && def.value.ownershipRestricted))

/**
 * 從編輯頁按「回到清單」回來時，把離開前的頁碼與篩選裝回去（Tim 指定 2026-09-17）。
 * 只認 `?restore=1`，不是每次進清單都還原 —— 理由見 src/list-state.ts 檔頭。
 *
 * 🔴 **一定要在 setup 這一層、在下面任何 watcher 註冊之前做完**，不可以放進 `onMounted`。
 *    兩個理由，兩個都實際踩到過：
 *    ① 下面那支「把狀態記起來」的 watcher 是 `immediate: true`，它在 setup 當下就會
 *       先用**這個新實例的預設值**（第 1 頁、沒有篩選）覆蓋掉記憶 ——
 *       等 onMounted 再去讀，讀到的永遠是剛被自己蓋掉的第 1 頁。
 *    ② 篩選那支 watcher 會在值改變時把 `page` 重設成 1。在它註冊之前賦值就不會觸發。
 */
const pendingRestore = route.query.restore === '1' ? recallListView(props.unit) : null
if (pendingRestore) {
  query.page = pendingRestore.page
  query.keyword = pendingRestore.keyword
  query.status = pendingRestore.status
  query.categoryId = pendingRestore.categoryId
  query.termType = pendingRestore.termType
  onlyMine.value = pendingRestore.onlyMine
}

function messageOf(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.details.length ? `${e.message}（${e.details.join('、')}）` : e.message
  if (e instanceof Error) return e.message
  return fallback
}

/** 載入／動作失敗的訊息。⚠️ 這個畫面原本一個 catch 都沒有，見 load() 的註解。 */
const loadError = ref('')

async function loadCategoryOptions() {
  if (!def.value.categoryTermType) return
  try {
    categoryOptions.value = await adminApi.taxonomy.termOptions(def.value.categoryTermType)
  } catch (e) {
    categoryOptions.value = []
    console.error('載入分類選項失敗', e)
  }
}

/**
 * 🔴 `loading = false` 原本只寫在最後一行，**沒有 try/finally**。
 *    API 一出錯（連不上、403、500）整個函式就中斷在那一行之前 ——
 *    畫面停在轉圈圈的 spinner，**永遠轉下去**，而錯誤只出現在 console。
 */
async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const result = await adminApi.content.list(props.unit, {
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword || undefined,
      status: query.status || undefined,
      categoryId: query.categoryId ? Number(query.categoryId) : undefined,
      termType: query.termType ? Number(query.termType) : undefined,
      ownerUserId: onlyMine.value && user ? user.id : undefined,
    })
    items.value = result.items
    totalCount.value = result.totalCount
    selected.value = new Set()
  } catch (e) {
    items.value = []
    totalCount.value = 0
    loadError.value = messageOf(e, '載入清單失敗。')
  } finally {
    loading.value = false
  }
}

/**
 * 進入這個畫面要做的兩件事。
 * ⚠️ **兩件事彼此不相依，所以一起發、不要排隊。** 原本是串起來的 `await`，
 *    等於把往返的延遲相加 —— 在 Azure SQL Basic（5 DTU）上，
 *    光是分類選項那一趟就是整個畫面「開很慢」的主因（見 client.ts termOptions）。
 * ⚠️ 兩支都自己包了 try/catch，所以 Promise.all 不會因為其中一支失敗而
 *    把另一支的結果丟掉。
 * ⚠️ 原本還有第三支 `loadUnitTotal()`（單元總筆數，只為了判斷「排得動嗎」）——
 *    當頁內排序不需要那個數字了，一併拿掉，每次進清單少一趟往返。
 */
async function loadAll() {
  await Promise.all([loadCategoryOptions(), load()])
}

onMounted(async () => {
  // 旗標用完就從網址拿掉（狀態已經在 setup 時裝回去了），
  // 不然重新整理（會登出）或把這個網址貼給別人都很怪。
  if (route.query.restore === '1') router.replace(`/${props.unit}`)
  await loadAll()
  // 有人手打 /admin/{unit}/new 時，UnitEdit.vue 會把他導到這裡並帶上 ?new=1
  // （那條路原本是直接建一筆空白草稿，對五個單元一律 400，見 UnitEdit.vue）。
  // ⚠️ term 排除在外：它的 termType 由上方那兩顆專用按鈕決定，
  //    沒有 termType 的新增一樣會被 API 退回。
  if (route.query.new === '1' && canCreateGeneric.value) {
    await openCreate()
    router.replace(`/${props.unit}`)
  }
})
watch(() => props.unit, async () => {
  query.page = 1
  // ⚠️ 換單元一定要清掉 term 專用的篩選：留著的話它在別的單元上是一個
  //    「畫面上看不到、卻真的送出去」的過濾條件（API 會忽略，但下次切回 term 就詭異了）。
  query.termType = ''
  await loadAll()
})
watch([() => query.keyword, () => query.status, () => query.categoryId, () => query.termType, onlyMine], () => { query.page = 1; load() })
watch(() => query.page, load)

// 每次狀態變動就記一份，供編輯頁的「回到清單」還原。
watch(
  [() => props.unit, () => query.page, () => query.keyword, () => query.status, () => query.categoryId, () => query.termType, onlyMine],
  () => {
    rememberListView(props.unit, {
      page: query.page,
      keyword: query.keyword,
      status: query.status,
      categoryId: query.categoryId,
      termType: query.termType,
      onlyMine: onlyMine.value,
    })
  },
  { immediate: true },
)

const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / query.pageSize)))

function toggleSelect(id: number) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}
function toggleSelectAll() {
  selected.value = selected.value.size === items.value.length ? new Set() : new Set(items.value.map((i) => i.id))
}

/**
 * 批次上下架。
 * ⚠️ 一筆一筆送（API 沒有批次端點）。中途失敗要**講出來已經改掉幾筆** ——
 * 原本沒有 catch，失敗時畫面毫無反應，使用者以為全部沒生效而再按一次，
 * 於是前面成功的那幾筆被重做一遍。
 */
async function batchPublish(status: 3 | 4) {
  errorMessage.value = ''
  let succeeded = 0
  try {
    for (const id of selected.value) {
      await adminApi.content.setPublishState(props.unit, id, status, user!.id)
      succeeded += 1
    }
  } catch (e) {
    errorMessage.value = `${messageOf(e, '批次操作失敗。')}（已完成 ${succeeded} 筆，其餘未處理）`
  } finally {
    await load()
  }
}

/**
 * 這個清單拖得動嗎。
 * ⚠️ **不再看總筆數** —— 當頁內排序與單元大小無關（見檔頭）。
 *    單元可以用 `listSortable: false` 明確退出（文章就是）。
 */
const sortable = computed(() => canEdit.value && def.value.listSortable !== false && items.value.length > 1)

/**
 * 當頁內重新排序。
 *
 * 作法：把這一頁**現有的那幾個 sortOrder 值**由小到大排好當成「格子」，
 * 再依新的先後順序把 id 填回格子裡。沒出現在這一頁的資料一個都不會動。
 */
async function reorder(orderedPageIds: number[]) {
  errorMessage.value = ''
  try {
    const slots = items.value.map((i) => i.sortOrder).sort((a, b) => a - b)
    if (orderedPageIds.length !== slots.length) {
      throw new Error('清單在排序期間變動過，請重新載入後再試一次。')
    }
    // 🔴 值重複就沒有格子可以分配 —— 寧可報錯，也不要寫下一組「看起來排好了、
    //    重新載入又跳回去」的值（那是最難查的一種）。
    if (new Set(slots).size !== slots.length) {
      throw new Error(
        `這一頁有排序值重複的資料，排不出先後。請重新載入；若持續發生，代表這個單元的排序值需要重新正規化（migration NormalizeSortOrder）。`,
      )
    }
    await adminApi.content.sort(props.unit, orderedPageIds.map((id, index) => ({ id, sortOrder: slots[index]! })), user!.id)
  } catch (e) {
    errorMessage.value = messageOf(e, '排序儲存失敗。')
  }
  // ⚠️ 無論成敗都重載：成功要拿回 API 寫下的 sortOrder，失敗更要把畫面拉回
  //    資料庫的真實順序，不能讓人以為拖好了。
  await load()
}

const drag = useDragSort<number>({
  keys: () => items.value.map((i) => i.id),
  onReorder: (_group, orderedIds) => reorder(orderedIds),
  enabled: () => sortable.value,
})

// ── 新增 ──────────────────────────────────────────────────────────────
//
// 🔴 **這裡原本是「按下去就直接建一筆空白草稿」，而那對五個單元一律回 400。**
//    `ContentHandler.Apply*Fields` 有一批「建立時就必須有值」的欄位
//    （文章／療程／FAQ 的分類、案例的療程與四個法規揭露欄位、據點的地址電話經緯度），
//    而原本的 `defaultFieldsFor()` 把每一欄都填成空字串 —— 空字串到了 API 是
//    `JInt`／`JStr` 的 null，於是新增文章、療程、案例、FAQ、據點**一按就失敗**，
//    錯誤訊息還指向一個畫面上根本沒出現過的欄位名。
//
//    改法不是「幫使用者猜一個預設值」（案例的法規揭露欄位猜出來就是造假），
//    而是**先問**：只問 API 真的要求的那幾欄（`requiredOnCreate`），其餘照舊在
//    編輯畫面慢慢填。
//
// ⚠️ slug 也一樣是**九個單元都要**，含 FAQ —— 見 EditPage 裡 slugRequired 的註解。

const creating = ref(false)
const errorMessage = ref('')

const createOpen = ref(false)
const createForm = reactive<{ title: string; slug: string; fields: Record<string, unknown> }>({ title: '', slug: '', fields: {} })
const createErrors = ref<Record<string, string>>({})
const createOptions = reactive<Record<string, { value: string; label: string }[]>>({})
/** term 的兩顆專用按鈕各自帶一個 termType，開啟對話框時記下來。 */
const createOverride = ref<Record<string, unknown>>({})

/**
 * 這個單元在「新增」那一刻就得填的欄位。空陣列＝只要標題與 slug。
 *
 * ⚠️ `readOnly` 但 `settableOnCreate` 的欄位**要收進來**（分類與標籤的「型別」就是這種：
 * 建立後不可改，但建立時必填）。原本被 `!f.readOnly` 濾掉，於是那個選擇被迫做成
 * 頁首一個**沒有標籤的裸下拉 ＋ 兩顆新增按鈕** —— Tim 的評語是「看不懂在做啥」，
 * 而它確實看不懂：那個下拉只決定「按了旁邊那顆按鈕會建出哪一種分類」，
 * 與清單上的任何東西都無關。型別是「要建的那個東西」的屬性，就該在新增表單裡問。
 */
const createFields = computed<UnitField[]>(
  () => def.value.fields.filter((f) => (f.requiredOnCreate || f.settableOnCreate) && (!f.readOnly || f.settableOnCreate)),
)

/**
 * 新增對話框裡某個欄位可以選的選項。
 * ⚠️ 分類與標籤的「型別」要依權限收窄：新增**標籤**（termType 4）是內容編輯就有的
 * `taxonomy.tag.create`，新增**分類**（1–3）動到 URL 結構與 301 對照表，限超級管理員
 * （docs/10 §3.3 的逐單元例外）。少了這道收窄，非超管選了「療程分類」會被 API 回 403，
 * 而畫面上完全看不出為什麼。
 */
function staticOptionsFor(field: UnitField): { value: string; label: string }[] {
  const all = field.options ?? []
  if (props.unit !== 'term' || field.key !== 'termType') return all
  return all.filter((o) => (o.value === '4' ? canCreateTerm(permCtx, true) : canCreateTerm(permCtx, false)))
}

function defaultFieldsFor(): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  for (const f of def.value.fields) {
    if (f.readOnly) continue
    if (f.type === 'boolean') fields[f.key] = f.key === 'isPhysician' // 14 位成員多數是醫師，預設打開，安喬那筆進去再手動關閉
    else if (['repeater', 'gallery', 'tags', 'hours'].includes(f.type)) fields[f.key] = []
    // ⚠️ 區塊 JSON 欄位**整個不送**（undefined）。送空字串的話，走 json-value 的
    //    那兩欄（文章與頁面的內文）會被 API 當成「不是合法 JSON」而擋下新增。
    else if (f.type === 'structured') continue
    else fields[f.key] = ''
  }
  return fields
}

/**
 * 新增時的預設 slug。
 * ⚠️ 不從標題推導 —— 標題是中文，而 slug 只收 `a-z0-9-`。給一個一定合法的
 * 佔位值，讓使用者在對話框裡改成有意義的英文網址。
 */
function defaultSlug(): string {
  return `untitled-${Date.now()}`
}

async function openCreate(override: Record<string, unknown> = {}) {
  createOverride.value = override
  createForm.title = ''
  createForm.slug = defaultSlug()
  createForm.fields = Object.fromEntries(
    createFields.value.map((f) => [f.key, f.type === 'boolean' ? (defaultFieldsFor()[f.key] ?? false) : '']),
  )
  createErrors.value = {}
  errorMessage.value = ''
  createOpen.value = true

  // ⚠️ 一起發，不要排隊：一個欄位一趟往返，串起來等於把延遲相加。
  await Promise.all(createFields.value.map(async (field) => {
    try {
      if (field.optionsFromTermType) createOptions[field.key] = await adminApi.taxonomy.termOptions(field.optionsFromTermType)
      if (field.optionsFromUnit) createOptions[field.key] = await adminApi.taxonomy.unitOptions(field.optionsFromUnit)
    } catch (e) {
      createOptions[field.key] = []
      console.error(`載入「${field.label}」選項失敗`, e)
    }
  }))
}

function closeCreate() {
  createOpen.value = false
}

// ⚠️ `fields` 的值型別是 unknown（各單元不同），模板不能直接 v-model 上去——
//    vue-tsc 會擋（TS2322）。比照 EditPage：讀用具名函式、寫在事件處理裡轉型。
function createFieldText(key: string): string {
  return String(createForm.fields[key] ?? '')
}
function createFieldBool(key: string): boolean {
  return Boolean(createForm.fields[key])
}

function validateCreate(): boolean {
  const errors: Record<string, string> = {}
  if (!createForm.title.trim()) errors.title = '標題為必填。'
  const slugProblem = validateSlug(createForm.slug)
  if (slugProblem) errors.slug = slugProblem
  else if (!createForm.slug.trim()) errors.slug = 'slug 為必填。'

  for (const field of createFields.value) {
    if (field.type === 'boolean') continue // checkbox 一定有值（true／false）
    const value = String(createForm.fields[field.key] ?? '').trim()
    if (!value) errors[field.key] = `「${field.label}」在新增時就必須填，之後不能留空。`
    else if (field.type === 'number' && !Number.isFinite(Number(value))) errors[field.key] = `「${field.label}」必須是數字。`
  }

  createErrors.value = errors
  return Object.keys(errors).length === 0
}

async function submitCreate() {
  if (!validateCreate()) return
  await createDraft({ ...createForm.fields, ...createOverride.value }, createForm.title.trim(), createForm.slug.trim())
}

async function createDraft(overrideFields: Record<string, unknown> = {}, title = '未命名', slug = defaultSlug()) {
  creating.value = true
  errorMessage.value = ''
  try {
    const fields = { ...defaultFieldsFor(), ...overrideFields }
    if (props.unit === 'page') fields.pageKind = '1' // UI 新增一律是自由頁，系統頁只能由種子建立（docs/02 §1）
    // 醫師角色新增自己的個人頁／文章時，直接把 OwnerUserId 設成自己，
    // 不然剛建立完馬上就會被自己的「僅能編輯自己的內容」規則擋下（docs/10 §3.3）。
    const ownerUserId = def.value.ownershipRestricted && user?.roles.includes('Doctor') && !user.isSuperAdmin ? user.id : undefined
    const created = await adminApi.content.create(
      props.unit,
      // ⚠️ slug 一律送，連 producesUrl=false 的 FAQ 也送 ——
      //    API 的新增是 `NormalizeAndValidateSlug(..., required: true)`，不送就是 400。
      { title, slug, fields, ownerUserId },
      user!.id,
    )
    createOpen.value = false
    await router.push(`/${props.unit}/${created.id}`)
  } catch (e) {
    errorMessage.value = messageOf(e, '建立失敗。')
  } finally {
    creating.value = false
  }
}

</script>

<template>
  <div>
    <div class="adm-page__head">
      <div>
        <h1 class="adm-page__title">{{ def.label }}</h1>
        <p class="adm-page__desc">共 {{ totalCount }} 筆</p>
      </div>
      <!-- ⚠️ 一顆按鈕就好。分類與標籤原本在這裡放了一個**沒有標籤的下拉 ＋ 兩顆按鈕**，
           那個下拉只決定「按了旁邊那顆會建出哪一種分類」，與清單無關 ——
           型別已經搬進新增對話框，變成一個有標題的欄位。 -->
      <div class="adm-page__actions">
        <button v-if="canCreateGeneric" type="button" class="btn btn--primary" :disabled="creating" @click="openCreate()">
          ＋ 新增{{ def.labelSingular }}
        </button>
      </div>
    </div>

    <p v-if="errorMessage" class="adm-alert adm-alert--danger" role="alert" style="margin-bottom: var(--sp-4)">{{ errorMessage }}</p>

    <!-- 新增：只問 API 在「建立」那一刻就要求要有值的欄位，其餘留到編輯畫面。 -->
    <div v-if="createOpen" class="adm-card" style="margin-bottom: var(--sp-4)">
      <h2 class="adm-card__title">新增{{ def.labelSingular }}</h2>
      <form class="adm-form" @submit.prevent="submitCreate">
        <div class="adm-field-grid">
          <div class="adm-field adm-field--span2">
            <label class="adm-field__label">標題<span class="adm-field__required">＊</span></label>
            <input v-model="createForm.title" class="adm-input" :class="{ 'is-invalid': createErrors.title }" type="text" maxlength="200">
            <p v-if="createErrors.title" class="adm-field__error" role="alert">{{ createErrors.title }}</p>
          </div>
          <div class="adm-field adm-field--span2">
            <label class="adm-field__label">Slug<span class="adm-field__required">＊</span></label>
            <input v-model="createForm.slug" class="adm-input" :class="{ 'is-invalid': createErrors.slug }" type="text" maxlength="160">
            <p v-if="createErrors.slug" class="adm-field__error" role="alert">{{ createErrors.slug }}</p>
            <p class="adm-field__hint">
              小寫英數字與連字號。預設值是一個佔位字串（標題是中文，推導不出網址），建立後仍可以改。
            </p>
          </div>

          <div
            v-for="field in createFields"
            :key="field.key"
            class="adm-field"
            :class="{ 'adm-field--span2': field.type === 'textarea' || field.type === 'longtext' }"
          >
            <label class="adm-field__label">{{ field.label }}<span class="adm-field__required">＊</span></label>

            <select
              v-if="field.type === 'relation-single' || field.optionsFromTermType || field.optionsFromUnit"
              class="adm-select"
              :class="{ 'is-invalid': createErrors[field.key] }"
              :value="createFieldText(field.key)"
              @change="createForm.fields[field.key] = ($event.target as HTMLSelectElement).value"
            >
              <option value="">請選擇…</option>
              <option v-for="opt in createOptions[field.key] ?? []" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>

            <!-- 🔴 **選項寫死在單元宣告裡**的 select（分類與標籤的「型別」就是這種）。
                 ⚠️ 這個分支原本不存在 —— 沒有它，`type: 'select'` 但沒有動態選項來源的欄位
                 會一路掉到最後的 `<input>`，變成一個**要使用者自己打出 `4` 的文字框**。
                 （2026-09-17 把型別從頁首搬進這個對話框時當場踩到。） -->
            <select
              v-else-if="field.type === 'select'"
              class="adm-select"
              :class="{ 'is-invalid': createErrors[field.key] }"
              :value="createFieldText(field.key)"
              @change="createForm.fields[field.key] = ($event.target as HTMLSelectElement).value"
            >
              <option value="">請選擇…</option>
              <option v-for="opt in staticOptionsFor(field)" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>

            <label v-else-if="field.type === 'boolean'" class="adm-checkbox">
              <input
                type="checkbox"
                :checked="createFieldBool(field.key)"
                @change="createForm.fields[field.key] = ($event.target as HTMLInputElement).checked"
              > 是
            </label>

            <textarea
              v-else-if="field.type === 'textarea' || field.type === 'longtext'"
              class="adm-textarea"
              :class="{ 'is-invalid': createErrors[field.key] }"
              :value="createFieldText(field.key)"
              @input="createForm.fields[field.key] = ($event.target as HTMLTextAreaElement).value"
            />

            <input
              v-else
              class="adm-input"
              :class="{ 'is-invalid': createErrors[field.key] }"
              :type="field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'"
              :step="field.type === 'number' ? 'any' : undefined"
              :value="createFieldText(field.key)"
              @input="createForm.fields[field.key] = ($event.target as HTMLInputElement).value"
            >

            <p v-if="createErrors[field.key]" class="adm-field__error" role="alert">{{ createErrors[field.key] }}</p>
            <p v-if="field.hint" class="adm-field__hint">{{ field.hint }}</p>
          </div>
        </div>

        <p v-if="createFields.length" class="adm-field__hint">
          這幾欄是資料庫層的必填（NOT NULL），<strong>建立當下就要有值</strong>，不是之後再補。
          其餘欄位建立完成後在編輯畫面慢慢填。
        </p>

        <div class="adm-inline-actions">
          <button type="submit" class="btn btn--primary" :disabled="creating">{{ creating ? '建立中…' : '建立並開始編輯' }}</button>
          <button type="button" class="btn btn--ghost" @click="closeCreate">取消</button>
        </div>
      </form>
    </div>

    <div v-if="!canView" class="adm-empty">
      <div class="adm-empty__icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="5" y="10.5" width="14" height="9" rx="1.5" />
          <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
        </svg>
      </div>
      <p class="adm-empty__title">沒有檢視權限</p>
      <p class="adm-empty__desc">你的帳號角色目前沒有「{{ def.label }}」的檢視權限，如果這是誤判，請聯絡系統管理員調整角色權限設定。</p>
    </div>

    <template v-else>
      <div class="adm-filters">
        <input v-model="query.keyword" type="search" placeholder="關鍵字（標題）">
        <select v-model="query.status">
          <option value="">全部狀態</option>
          <!-- ⚠️ 必須 Number(value)：STATUS_LABEL 是物件，v-for 給出的 key 一律是**字串**，
               直接綁上去 query.status 會變成 "3"，而 client.ts 是 `r.status === query.status`
               （數字），比對永遠 false —— 症狀是選了狀態就一筆都不剩，而且不會報錯。
               上面 `status: '' as '' | ContentStatus` 的型別斷言在這種情況下是假的，
               typecheck 也擋不下來。 -->
          <option v-for="(label, value) in STATUS_LABEL" :key="value" :value="Number(value)">{{ label }}</option>
        </select>
        <select v-if="def.categoryTermType" v-model="query.categoryId">
          <option value="">全部分類</option>
          <option v-for="opt in categoryOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
        <select v-if="unit === 'term'" v-model="query.termType">
          <option value="">全部型別</option>
          <option v-for="opt in termTypeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
        <label v-if="def.ownershipRestricted && user?.roles.includes('Doctor') && !user?.isSuperAdmin" class="adm-checkbox">
          <input v-model="onlyMine" type="checkbox"> 只看我自己的
        </label>
        <div class="adm-filters__spacer"></div>
        <template v-if="canPublish && selected.size">
          <button type="button" class="btn btn--ghost btn--sm" @click="batchPublish(3)">批次上架（{{ selected.size }}）</button>
          <button type="button" class="btn btn--line btn--sm" @click="batchPublish(4)">批次下架（{{ selected.size }}）</button>
        </template>
      </div>

      <div v-if="loading" class="adm-loading">
        <span class="adm-spinner" aria-hidden="true"></span>
        <span>載入{{ def.label }}中…</span>
      </div>
      <!-- ⚠️ 「載不到」與「沒有資料」是兩件事。混在一起的話，API 掛掉時畫面會
           說「還沒有任何資料，用右上角的新增功能建立第一筆」——那是在騙人。 -->
      <div v-else-if="loadError" class="adm-empty">
        <div class="adm-empty__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 4.5 21 19.5H3z" /><path d="M12 10v4" /><path d="M12 17h.01" />
          </svg>
        </div>
        <p class="adm-empty__title">載入不到{{ def.label }}</p>
        <p class="adm-empty__desc">{{ loadError }}</p>
        <p class="adm-empty__desc"><button type="button" class="btn btn--line btn--sm" @click="load">重新載入</button></p>
      </div>
      <div v-else-if="!items.length" class="adm-empty">
        <div class="adm-empty__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3.5 9 6 4h12l2.5 5" />
            <path d="M3.5 9v9a1.2 1.2 0 0 0 1.2 1.2h14.6a1.2 1.2 0 0 0 1.2-1.2V9" />
            <path d="M3.5 9h5.7l.8 2.2a1.2 1.2 0 0 0 1.13.8h1.74a1.2 1.2 0 0 0 1.13-.8L14.8 9h5.7" />
          </svg>
        </div>
        <p class="adm-empty__title">目前沒有{{ def.label }}</p>
        <p class="adm-empty__desc">
          <template v-if="query.keyword || query.status || query.categoryId || onlyMine">目前的篩選條件下沒有符合的項目，調整關鍵字或篩選條件再試一次。</template>
          <template v-else>還沒有任何資料，用右上角的新增功能建立第一筆。</template>
        </p>
      </div>

      <div v-else class="adm-table-wrap">
        <table class="adm-table">
          <thead>
            <tr>
              <th v-if="sortable" class="adm-table__handle"><span class="visually-hidden">排序</span></th>
              <th class="adm-table__check"><input type="checkbox" :checked="selected.size === items.length" @change="toggleSelectAll"></th>
              <th v-for="col in def.listColumns" :key="col.key">{{ col.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in items" :key="item.id" v-bind="drag.itemProps('list', item.id)" :class="drag.itemClass('list', item.id)">
              <td v-if="sortable" class="adm-table__handle"><DragHandle v-bind="drag.handleProps(item.id)" /></td>
              <td><input type="checkbox" :checked="selected.has(item.id)" @change="toggleSelect(item.id)"></td>
              <td v-for="col in def.listColumns" :key="col.key" :class="{ 'is-wrap': col.key === 'title' }">
                <span v-if="col.key === 'title'" class="adm-table__title">
                  <RouterLink :to="`/${unit}/${item.id}`">{{ item.title }}</RouterLink>
                </span>
                <StatusBadge v-else-if="col.render === 'status'" :status="item.status" :publish-at="item.publishAt" />
                <span v-else-if="col.render === 'boolean'">{{ item.fields[col.key] ? '是' : '否' }}</span>
                <span v-else-if="col.render === 'date'">{{ String(item.fields[col.key] ?? (item as unknown as Record<string, string>)[col.key] ?? '').slice(0, 10) }}</span>
                <!-- relation-single 欄位（例如分類、對應療程）優先顯示 client.ts 算好的 __label -->
                <span v-else>{{ item.fields[`${col.key}__label`] ?? item.fields[col.key] ?? (item as unknown as Record<string, unknown>)[col.key] ?? '—' }}</span>
              </td>
            </tr>
          </tbody>
        </table>
        <!-- ⚠️ 兩種「不能拖」的原因要分開講，不然使用者不知道是壞了還是本來就這樣。 -->
        <p v-if="canEdit && def.listSortable === false" class="adm-field__hint" style="margin-top: var(--sp-2)">
          {{ def.label }}不提供拖曳排序：前台的文章列表（<code>/blog/</code>、分類頁、標籤頁）一律依<strong>發布日期</strong>新到舊排，
          手動排的順序在前台看不出任何差別。需要調整某一筆的位置請改它的「顯示日期」。
        </p>
        <p v-else-if="sortable" class="adm-field__hint" style="margin-top: var(--sp-2)">
          拖曳把手可調整順序，<strong>範圍限這一頁之內</strong>。要跨頁搬移請到該筆的編輯畫面改「排序值」。
        </p>
      </div>

      <div class="adm-pagination">
        <span>第 {{ query.page }} ／ {{ totalPages }} 頁</span>
        <div class="adm-pagination__controls">
          <button type="button" class="btn btn--line btn--sm" :disabled="query.page <= 1" @click="query.page--">上一頁</button>
          <button type="button" class="btn btn--line btn--sm" :disabled="query.page >= totalPages" @click="query.page++">下一頁</button>
        </div>
      </div>
    </template>
  </div>
</template>
