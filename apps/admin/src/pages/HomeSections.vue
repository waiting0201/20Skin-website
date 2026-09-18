<script setup lang="ts">
// 首頁版位編排（/home-sections）—— 規格見 docs/02 §3、docs/08 §G-2。
//
// 七個版位為種子資料，不可新增刪除。可以「挑選」的版位一律只能挑既有內容、
// 不能另打文案——這裡刻意重用 RelationPicker（跟九個內容模型編輯畫面的「關聯」
// 欄位同一顆元件），UI 上沒有任何自由文字輸入欄位可以填內容本文。
//
// 🔴 **這一頁真正編得動的只有三個半版位**（2026-09-18 起）：
//    精選療程、最新文章、品牌理念摘要（挑選），加上 hero（輪播圖）。
//    醫師與據點是**自動列出全部**（決策 30），八大專科入口的挑選器 2026-09-17 拿掉
//    （決策 23）—— 三者都是「後台編得動、前台不理它」或「兩份順序」的來源。
//
// 🔴 **2026-09-17：主視覺的輪播圖改成在這裡維護**（Tim 指定）。在此之前這一區
//    是一段「要換圖請洽工程」的警告 —— 因為舊的表單假設 `hero.settings` 是
//    `{headline, ctaLabel, images[]}` 這種物件，而正式資料是
//    `{image, caption}[]` 的陣列，兩者對不上。現在形狀由
//    `units/schemas/home.ts` 宣告，用九個內容模型同一套 `StructuredField` 渲染。
//    ⚠️ 主標題、eyebrow、「立即預約」按鈕**仍然寫死在前台**（決策 14：
//    「院方會想改它嗎？」的答案是版面留前台），所以這裡沒有那些欄位 ——
//    不要因為舊表單有過就補回來，補了也只是存進資料庫沒有人讀。
//
// 🔴 **2026-09-17：送審那一層整個拿掉了**（Tim 指定，CLAUDE.md 決策 20）。
//    這一頁的動作只剩「儲存草稿」與「發布」，與九個內容模型一致。
//    發布走 `PATCH /admin/page/{homeId}/publish`（action=publish）——
//    版位編排隨版本快照一起帶走（docs/08 §G-2、docs/11 §8）。
//    ⚠️ `POST /admin/{unit}/{id}/submit` 與 `/admin/review/*` 三支端點**已從 API 移除**，
//    不要再指回去；舊敘述「版位送審走共用的審核佇列」已作廢。
//
import { computed, onMounted, reactive, ref } from 'vue'
import { adminApi, ApiError } from '@/api/client'
import type {
  HomeSection,
  HomeSectionItemRef,
  HomeSectionKey,
  HomeSectionsState,
} from '@/api/site'
import { HOME_SECTION_SETTINGS_SCHEMA } from '@/api/site'
import { currentUser } from '@/auth'
import { countPendingImages, uploadPendingImages } from '@/image-value'
import { hasPermission } from '@/permissions'
import type { RelationItem, UnitKey } from '@/types'
import type { RelationField } from '@/unit-schema'
import { UNIT_REGISTRY } from '@/units'
import { validateStructured } from '@/validation'
import { revealFirstError } from '@/scroll-to-error'
import RelationPicker from '@/components/RelationPicker.vue'
import StructuredField from '@/components/StructuredField.vue'
import { useStickyHead } from '@/sticky-head'

const { headRef } = useStickyHead()

const user = currentUser()
const permCtx = user ? { roles: user.roles, isSuperAdmin: user.isSuperAdmin } : null

const canEditBase = computed(() => hasPermission(permCtx, 'home.arrange'))
const canPublish = computed(() => hasPermission(permCtx, 'content.page.publish'))

const loading = ref(true)
const saving = ref(false)
const actionError = ref('')
const actionNotice = ref('')
// 純粹為了呈現：actionNotice 這顆 ref 在存草稿與發布兩個動作共用同一段文字訊息，
// 但語意其實不一樣——跟著訊息意圖挑對應的 .adm-alert modifier，
// 而不是全部套同一種顏色（DESIGN.md §3.6 對 EditPage.vue 的同類要求，這裡比照）。
const actionNoticeVariant = ref<'success' | 'info' | 'warn'>('info')

const state = ref<HomeSectionsState | null>(null)
const sections = reactive<HomeSection[]>([])

// 狀態 2 鎖定本文。⚠️ 送審已經不做了，所以不會有新資料進到這個狀態 —— 但既有資料
// 可能還停在那裡，而 API 對狀態 2 一律拒絕更新，鎖定要留著（同 EditPage.vue 的 canEditBody）。
const isLocked = computed(() => state.value?.status === 2)
const canEdit = computed(() => canEditBase.value && !isLocked.value)

/**
 * 🔴 **版位不給拖曳排序**（Tim 定案 2026-09-18：「拿掉把手」）。
 *    理由與「文章不給拖」同一條（決策 21）：**前台根本不讀這個順序** ——
 *    `apps/web/app/pages/index.vue` 的七個 `<section>` 是寫死的先後，
 *    `sortOrder` 只有後台自己看得到。給把手等於給一個拖了也不會有事情發生的假功能。
 * ⚠️ 排序值仍然照讀照送（`putSections` 用陣列位置當 sortOrder，所以這裡一定要
 *    用排好的那一份送出，不是 `sections` 的載入順序）。
 */
const sortedSections = computed(() => [...sections].sort((a, b) => a.sortOrder - b.sortOrder))

/**
 * 🔴 **主視覺自己一欄**（Tim 指定 2026-09-18：「把主視覺輪播放過去」右邊那片空白）。
 *    它是七個版位裡唯一「有表單可以填」的（輪播圖 ＋ 圖說），其餘六個最多只有
 *    一個挑選器 —— 主欄因此短、右欄因此有內容，空白就被填掉了。
 * ⚠️ 判斷用 `schemaOf()` 而不是寫死 `'hero'`：哪天再有第二個版位長出設定表單，
 *    它會自己跟著搬過去，而不是靜悄悄地留在主欄底下。
 */
const heroSection = computed(() => sortedSections.value.find((x) => schemaOf(x)) ?? null)
const mainSections = computed(() => sortedSections.value.filter((x) => x !== heroSection.value))

function messageOf(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.details.length ? `${e.message}（${e.details.join('、')}）` : e.message
  if (e instanceof Error) return e.message
  return fallback
}

/**
 * 版位裡的項目 → RelationPicker 的形狀。
 *
 * 🔴 **標題直接用 API 帶回來的那一份**（`HomeSectionItemRef.title`）。
 *    2026-09-18 之前這裡查的是一份「把整個單元抓回來」建出來的快取 ——
 *    `latest-articles` 指向文章（1100 筆）就是 12 趟往返，只為了配三、四個標題。
 */
function toRelationItems(section: HomeSection): RelationItem[] {
  if (!section.targetUnit) return []
  return [...section.items]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((i) => ({ id: i.contentItemId, title: i.title, sortOrder: i.sortOrder }))
}

function fromRelationItems(items: RelationItem[]): HomeSectionItemRef[] {
  return items.map((i, index) => ({ contentItemId: i.id, sortOrder: index, title: i.title }))
}

/** 給 RelationPicker 用的假關聯欄位宣告——relationType 只是滿足型別，這裡
 * 不寫進任何 ContentRelations 記錄，純粹借元件的多選＋排序 UI。 */
function relationFieldFor(section: HomeSection): RelationField {
  return {
    key: section.sectionKey,
    label: section.title,
    relationType: 12,
    targetUnit: section.targetUnit as UnitKey,
    sortable: true,
    editable: true,
  }
}

function onItemsChange(section: HomeSection, items: RelationItem[]) {
  section.items = fromRelationItems(items)
}

function applyState(next: HomeSectionsState) {
  state.value = next
  sections.splice(0, sections.length, ...next.sections.map((s) => JSON.parse(JSON.stringify(s))))
}

const loadError = ref('')

// ⚠️ 原本只有 try/finally 沒有 catch：載入失敗時 `state` 仍是 null，模板的
//    `v-else-if="state"` 不成立，畫面是一片空白（連錯誤訊息都沒有）。
async function load() {
  loading.value = true
  loadError.value = ''
  try {
    // ⚠️ 只有這一趟。項目的標題 API 已經一起回來了，挑選器的選項則是
    //    **打開才載**（RelationPicker）—— 兩者加起來原本要 30 幾次請求。
    applyState(await adminApi.site.home.get())
  } catch (e) {
    loadError.value = messageOf(e, '載入首頁版位失敗。')
  } finally {
    loading.value = false
  }
}

onMounted(load)

// ── 版位設定（目前只有 hero 的輪播圖）─────────────────────────────────
//
// 錯誤鍵用**路徑**（`hero[0].image`），`StructuredNode` 會把紅字顯示在那一格旁邊 ——
// 與九個內容模型的區塊 JSON 欄位同一套。
const settingsErrors = reactive<Record<string, string>>({})

function schemaOf(section: HomeSection) {
  return HOME_SECTION_SETTINGS_SCHEMA[section.sectionKey]
}

/** 這一份草稿裡還有幾張圖沒上傳（按鈕文案要講清楚，見 image-value.ts 檔頭）。 */
const pendingImages = computed(() =>
  sections.reduce((sum, s) => sum + countPendingImages(s.settingsValue), 0))

/**
 * 🔴 **順序是「驗證 → 上傳 → 送出」，不可對調**（CLAUDE.md 決策 9）。
 *    先上傳再驗證的話，一次沒過的儲存就已經在 Blob 留下沒有人引用的孤兒檔，
 *    而前端刪不掉它（SAS 是 write-only）。
 * @returns 通過驗證沒有。
 */
function validateSettings(): boolean {
  for (const key of Object.keys(settingsErrors)) delete settingsErrors[key]
  for (const section of sections) {
    const schema = schemaOf(section)
    if (!schema) continue
    Object.assign(
      settingsErrors,
      validateStructured({ key: section.sectionKey, label: section.title }, schema, section.settingsValue),
    )
  }
  return Object.keys(settingsErrors).length === 0
}

/** @returns 有沒有真的存起來。發布那條路要靠它決定要不要繼續。 */
async function saveDraft(): Promise<boolean> {
  actionError.value = ''
  if (!validateSettings()) {
    actionError.value = '版位設定有欄位沒填完，紅字標在那一格旁邊。修好之後再存一次。'
    // 摺疊起來的那一列會先被展開（StructuredField.vue），再捲到那一格。
    await revealFirstError(settingsErrors)
    return false
  }
  saving.value = true
  try {
    // 🔴 圖片在這一刻才真的上傳（選檔時只產生預覽，見 src/image-value.ts）。
    //    `uploadPendingImages` 回傳的是**新的**結構，不就地改寫 reactive 的來源 ——
    //    所以它同時取代了原本那行 `JSON.parse(JSON.stringify(s))` 的深拷貝。
    //    ⚠️ 不可以退回 JSON 深拷貝：`File` 與 object URL 都活不過序列化，
    //    一張待上傳的圖會被寫成 `{"pending":true,"alt":null}` 存進資料庫。
    // 🔴 送 `sortedSections` 而不是 `sections`：`putSections` 用**陣列位置**當
    //    sortOrder（`sortOrder: index`），而 `sections` 是載入時的順序、拖曳只改
    //    了每一筆的 `sortOrder` 欄位。送未排序的那一份＝畫面上排好了、存下去
    //    卻還是原來的順序，而且不會有任何錯誤。
    const payload = await uploadPendingImages(sortedSections.value.map((x) => ({ ...x })))
    const next = await adminApi.site.home.saveDraft(payload, user!.id)
    applyState(next)
    actionNotice.value = '草稿已儲存。還沒發布，前台不會有任何變化。'
    actionNoticeVariant.value = 'success'
    return true
  } catch (e) {
    actionError.value = messageOf(e, '儲存失敗。')
    return false
  } finally {
    saving.value = false
  }
}

const workflowBusy = ref(false)

/** 這三支原本一個 try 都沒有：失敗時畫面毫無反應，錯誤只在 console。 */
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

/**
 * 發布。
 * 🔴 **一定要先存草稿再發布。** 發布讀的是資料庫裡的工作副本（HomeSections），
 *    不是畫面上的狀態；不先存就發布，上線的是**改動前**的排列，而畫面上什麼
 *    錯誤都不會有。存不起來就不要發布 —— saveDraft 已經把原因寫進 actionError。
 * ⚠️ 2026-09-17：原本是「送審 → 在同一頁核准／退回」三顆按鈕，送審整層拿掉了
 *    （CLAUDE.md 決策 20），改成與九個內容模型一致的「存草稿 → 發布」。
 */
async function publish() {
  if (!await saveDraft()) return
  await runWorkflow('發布失敗。', async () => {
    const next = await adminApi.site.home.publish(user!.id)
    applyState(next)
    actionNotice.value = '已發布，前台首頁已經是這個版本了。'
    actionNoticeVariant.value = 'success'
  })
}

// ⚠️ 2 是舊資料才會有的殘留狀態（送審已不做），仍要看得懂它，不然畫面會是空白。
const statusLabel = computed(() => ({ 1: '草稿', 2: '送審中（舊資料）', 3: '已發布' })[state.value?.status ?? 3])
</script>

<template>
  <!-- ⚠️ 版面對齊九個內容模型的編輯畫面（Tim 指定 2026-09-17）：動作在標題列、
       綠色儲存靠右且在卡片外。
       ⚠️ 2026-09-18 由單欄改回兩欄（Tim：「首頁版位編排的右側也是有一片空白」）——
       右欄放的是**主視覺輪播**，不是編輯頁那個排程／危險區側欄。
       🔴 右欄不 sticky，理由見 admin.css 的 `.adm-editor-side--hero`。 -->
  <section class="adm-page adm-editor adm-editor--aside">
    <!-- ⚠️ `ref="headRef"`：標題列 sticky，高度量出來給右欄讓位（src/sticky-head.ts）。 -->
    <header ref="headRef" class="adm-page__head">
      <div>
        <h1 class="adm-page__title">首頁版位編排</h1>
        <p class="adm-page__desc">
          <span>七個版位，只能挑選已存在的內容——避免首頁又變回一份跟內頁對不上的自由文案。</span>
        </p>
        <p v-if="state" class="adm-page__desc">
          <strong>{{ statusLabel }}</strong>
          <span v-if="state.publishedAt"> ・ 最近發布 {{ new Date(state.publishedAt).toLocaleString('zh-TW') }}</span>
        </p>
      </div>
      <!-- 與編輯畫面同一套：發布（藍，對外）在左，儲存草稿（綠，留在後台）在右。 -->
      <div v-if="state" class="adm-page__actions">
        <button v-if="canPublish" type="button" class="btn btn--primary" :disabled="saving || workflowBusy" @click="publish">發布</button>
        <button v-if="canEdit" type="button" class="btn btn--save" :disabled="saving" @click="saveDraft">
          <template v-if="saving">儲存中…</template>
          <template v-else-if="pendingImages">上傳 {{ pendingImages }} 張圖片並儲存</template>
          <template v-else>儲存草稿</template>
        </button>
      </div>
    </header>

    <div v-if="loading" class="adm-loading">
      <span class="adm-spinner" aria-hidden="true"></span>
      <span>載入中…</span>
    </div>

    <div v-else-if="loadError" class="adm-empty">
      <p class="adm-empty__title">載入不到首頁版位</p>
      <p class="adm-empty__desc">{{ loadError }}</p>
      <p class="adm-empty__desc"><button type="button" class="btn btn--line btn--sm" @click="load">重新載入</button></p>
    </div>

    <template v-else-if="state">
      <p v-if="actionNotice" class="adm-alert" :class="`adm-alert--${actionNoticeVariant}`" role="status">{{ actionNotice }}</p>
      <p v-if="actionError" class="adm-alert adm-alert--danger" role="alert">{{ actionError }}</p>

      <!-- 兩欄：主欄是六個「挑選既有內容」的版位，右欄是主視覺輪播
           （Tim 指定 2026-09-18：右邊那一整片空白拿來放主視覺）。
           ⚠️ 右欄**不 sticky**：它裝的是這一頁最高的那張卡片（輪播圖一列一張），
           sticky 在比視窗還高的元素上只會把下半截釘在畫面外，捲不到。
           編輯頁的右欄（排程／危險區）很矮，那裡 sticky 才有意義。 -->
      <div class="adm-editor-layout adm-editor-layout--hero">
      <div class="adm-editor-main">
          <div v-for="section in mainSections" :key="section.sectionKey" class="adm-card">
            <div class="adm-page__head" style="margin-bottom: var(--sp-3)">
              <div>
                <p class="adm-card__title" style="margin-bottom: 0; display: flex; align-items: center; gap: var(--sp-2)">
                  {{ section.title }}
                </p>
                <p v-if="section.autoAll && section.targetUnit" class="adm-field__hint">
                  這一區會自動列出全部的{{ UNIT_REGISTRY[section.targetUnit].label }}，順序跟著清單走。
                </p>
                <p v-else-if="section.targetUnit" class="adm-field__hint">
                  內容來源：{{ UNIT_REGISTRY[section.targetUnit].label }}——只能從既有的{{ UNIT_REGISTRY[section.targetUnit].label }}挑選，不能另打文案。
                </p>
                <p v-else class="adm-field__hint">
                  這一區的內容不在這個畫面編輯，下面只是列出目前的設定。
                </p>
              </div>
            </div>

            <!-- 🔴 **這張卡片沒有「版位標題」「副標／Eyebrow」，也沒有「在首頁顯示這個版位」**
                 —— 三個都是 Tim 指定拿掉的「編了不生效」欄位：
                 ① 標題與副標（2026-09-17）：`putSections` 根本沒送它們，而前台那兩行字
                    來自 `app/data/_presentation.ts`（決策 14：版面留前台）；
                 ② 顯示開關（2026-09-18）：關掉**只會讓那一區變空**，區塊本身照樣渲染 ——
                    `apps/web/app/pages/index.vue` 的 `<section>` 沒有 `v-if`，
                    前台會留下一塊只有標題與英文小標的空白區，比「關掉」更糟。
                 ⚠️ `isEnabled` 仍然照讀照送（原值原樣回去），只是畫面上沒有入口可以改它。 -->

            <!-- 🔴 **自動列出全部的版位（醫師、據點）沒有挑選器**（Tim 指定 2026-09-18，
                 決策 30）。它們原本挑的就是整個單元（14/14、2/2），等於同一批內容
                 有兩份順序 —— 在「內容 → 醫師」拖一次，首頁不會跟，而且兩邊都沒有
                 任何徵兆。現在名單與順序都由那個清單決定，**改完立刻生效，
                 不必回這一頁按發布**（前台走即時值，見 PublicContentHandler.AutoSections）。 -->
            <p v-if="section.autoAll && section.targetUnit" class="adm-field__hint">
              要增減或調整順序，請到
              <RouterLink :to="`/${section.targetUnit}`">{{ UNIT_REGISTRY[section.targetUnit].label }}</RouterLink>
              的清單拖曳排序、或發布／取消發布那一筆。在那裡改完前台立刻就會變，不用回到這一頁按發布。
            </p>

            <!-- 兩個版位：只能挑選既有內容（精選療程 4/28、最新文章 4/1100，真的是策展）
                 ⚠️ specialties 的挑選器 2026-09-17 拿掉（它存進 HomeSectionItems，
                 而前台讀的是 settings，見 api/site.ts 的 HOME_SECTION_META）；
                 醫師與據點 2026-09-18 拿掉（上面那一段）。 -->
            <div v-else-if="section.targetUnit">
              <RelationPicker
                v-if="canEdit"
                :field="relationFieldFor(section)"
                :model-value="toRelationItems(section)"
                @update:model-value="(items) => onItemsChange(section, items)"
              />
              <div v-else class="adm-relation__picked">
                <div v-for="item in toRelationItems(section)" :key="item.id" class="adm-relation__row">
                  <span class="adm-relation__row-title">{{ item.title }}</span>
                </div>
                <p v-if="!section.items.length" class="adm-muted">尚未設定。</p>
              </div>
            </div>

            <!-- 既沒有挑選器、也沒有 schema 的版位（目前是 specialties：八大專科入口）。
                 🔴 **它的 `settings` 仍然原樣往返**（`HomeSection.rawSettings`）——
                 少了那條，按一次「儲存草稿」就會把那八個入口連同圖示清成 null，
                 而且沒有任何錯誤訊息（2026-09-17 實際踩到）。 -->
            <p v-else class="adm-field__hint">
              八大專科入口的標題、連結與圖示存在版位設定裡，儲存時會原樣保留。
              要增刪或換圖請洽工程端。
            </p>
            <!-- ⚠️ 自動版位的 `items` **仍然原樣往返**（`toRelationItems` 沒有被呼叫，
                 但 `section.items` 原封不動跟著 putSections 送回去）——
                 切回手挑時那份名單還在，與選單那次同一條（決策 29）。 -->
          </div>

          <div v-if="canEdit" class="adm-form-actions">
            <span class="adm-muted">儲存草稿不會影響前台</span>
            <button type="button" class="btn btn--save" :disabled="saving" @click="saveDraft">
              <template v-if="saving">儲存中…</template>
              <template v-else-if="pendingImages">上傳 {{ pendingImages }} 張圖片並儲存草稿</template>
              <template v-else>儲存草稿</template>
            </button>
          </div>

          <p class="adm-alert adm-alert--warn">
            🔴 <strong>只按「儲存草稿」前台不會變。</strong>前台讀的是已發布的版本快照，
            排好之後一定要再按一次「發布」。（按「發布」會自動先存一次草稿。）
          </p>
          <p v-if="!canPublish" class="adm-muted">
            目前沒有發布首頁的權限，排好之後請找有權限的人按「發布」。
          </p>
      </div><!-- /.adm-editor-main -->

      <!-- 右欄：主視覺輪播。
           🔴 **它不在拖曳清單裡**（drag.keys 只收主欄那六個），所以沒有把手 ——
              排序值原封不動，見 reorderSections。
           ⚠️ 版位設定的形狀宣告在 units/schemas/home.ts，用九個內容模型同一套
              StructuredField 渲染（含上傳）。「進階：直接編輯 JSON」的切換鈕
              2026-09-18 拿掉了，見 StructuredField.vue 檔頭。
           🔴 圖是**按下儲存才上傳**（src/image-value.ts），所以 saveDraft 一定要
              先跑 uploadPendingImages()。 -->
      <aside v-if="heroSection" class="adm-editor-side adm-editor-side--hero">
        <div class="adm-card">
          <p class="adm-card__title" style="margin-bottom: var(--sp-1)">
            {{ heroSection.title }}
          </p>
          <p class="adm-field__hint">
            唯一不是從既有內容挑選的版位——圖與圖說直接在這裡編輯。
          </p>


          <!-- ⚠️ `data-error-key` ＝ 錯誤鍵的最外層（版位鍵），給
               src/scroll-to-error.ts 當退路：深層路徑找不到時至少帶到這一欄。 -->
          <div class="adm-field" :data-error-key="heroSection.sectionKey">
            <label class="adm-field__label">主視覺輪播</label>
            <StructuredField
              :schema="schemaOf(heroSection)"
              :model-value="heroSection.settingsValue"
              :disabled="!canEdit"
              :path="heroSection.sectionKey"
              :errors="settingsErrors"
              @update:model-value="(v) => (heroSection!.settingsValue = v)"
            />
            <!-- ⚠️ **這裡不寫「舊檔會不會被刪」**（Tim 指定 2026-09-18：「不用寫，
                 只要有建議尺寸就好」）。事實仍然是：版位設定的圖換掉不會刪舊檔，
                 孤兒檔靠 tools/blob-reconcile 離線對帳 —— 所以 schema 的圖片節點
                 帶 `deletesOldFile: false`，ImageField 那句「會被刪」的警告不會出現。
                 建議尺寸留在 schema 的 hint 上。 -->
          </div>
        </div>
      </aside>
      </div><!-- /.adm-editor-layout -->
    </template>
  </section>
</template>
