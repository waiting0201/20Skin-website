<script setup lang="ts">
// 首頁版位編排（/home-sections）—— 規格見 docs/02 §3、docs/08 §G-2。
//
// 七個版位為種子資料，可停用、可排序，不可新增刪除。除了 hero（主視覺／CTA／
// 外部導流連結，沒有對應的站內內容，存在 Settings JSON）之外，每個版位都只能
// 從既有內容裡「挑選」，不能另打文案——這裡刻意重用 RelationPicker（跟九個
// 內容模型編輯畫面的「關聯」欄位同一顆元件），選項一律來自 adminApi.taxonomy
// .unitOptions()，UI 上沒有任何自由文字輸入欄位可以填內容本文。
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
  HomeHeroSettings,
  HomeSection,
  HomeSectionItemRef,
  HomeSectionKey,
  HomeSectionsState,
} from '@/api/site'
import { currentUser } from '@/auth'
import { hasPermission } from '@/permissions'
import type { RelationItem, UnitKey } from '@/types'
import type { RelationField } from '@/unit-schema'
import { UNIT_REGISTRY } from '@/units'
import DragHandle from '@/components/DragHandle.vue'
import RelationPicker from '@/components/RelationPicker.vue'
import { useDragSort } from '@/drag-sort'

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

const sortedSections = computed(() => [...sections].sort((a, b) => a.sortOrder - b.sortOrder))

const drag = useDragSort<HomeSectionKey>({
  keys: () => sortedSections.value.map((s) => s.sectionKey),
  onReorder: (_group, orderedKeys) => reorderSections(orderedKeys),
  enabled: () => canEdit.value,
})

// 內容標題快取：{ unit: { id: label } }，畫面上把 ContentItemId 換成可讀標題。
const titleCache = reactive<Record<string, Record<number, string>>>({})

function messageOf(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.details.length ? `${e.message}（${e.details.join('、')}）` : e.message
  if (e instanceof Error) return e.message
  return fallback
}

async function loadTitleCache(unit: UnitKey) {
  if (titleCache[unit]) return
  try {
    const options = await adminApi.taxonomy.unitOptions(unit)
    titleCache[unit] = Object.fromEntries(options.map((o) => [Number(o.value), o.label]))
  } catch (e) {
    // 取不到只是版位裡的項目顯示成 `#12` 而不是標題，不該擋住整個畫面。
    titleCache[unit] = {}
    console.error(`載入 ${unit} 標題快取失敗`, e)
  }
}

function titleFor(unit: UnitKey, id: number): string {
  return titleCache[unit]?.[id] ?? `#${id}`
}

function toRelationItems(section: HomeSection): RelationItem[] {
  if (!section.targetUnit) return []
  return [...section.items]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((i) => ({ id: i.contentItemId, title: titleFor(section.targetUnit as UnitKey, i.contentItemId), sortOrder: i.sortOrder }))
}

function fromRelationItems(items: RelationItem[]): HomeSectionItemRef[] {
  return items.map((i, index) => ({ contentItemId: i.id, sortOrder: index }))
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
    const current = await adminApi.site.home.get()
    const targetUnits = new Set<UnitKey>()
    for (const s of current.sections) if (s.targetUnit) targetUnits.add(s.targetUnit)
    await Promise.all([...targetUnits].map(loadTitleCache))
    applyState(current)
  } catch (e) {
    loadError.value = messageOf(e, '載入首頁版位失敗。')
  } finally {
    loading.value = false
  }
}

onMounted(load)

// 拖曳排序（2026-09-17 取代上／下移動按鈕）。
// ⚠️ 這裡只改本地的 sortOrder，**不打 API** —— 版位編排是「改完一次存草稿、
//    再發布」，跟清單頁那種「動一下就即時寫回」不一樣。存檔仍走 saveDraft()。
function reorderSections(orderedKeys: HomeSectionKey[]) {
  orderedKeys.forEach((key, index) => {
    const section = sections.find((s) => s.sectionKey === key)
    if (section) section.sortOrder = index
  })
}

function addHeroImage(hero: HomeHeroSettings) {
  hero.images = [...hero.images, { url: '', alt: '' }]
}
function removeHeroImage(hero: HomeHeroSettings, index: number) {
  hero.images = hero.images.filter((_, i) => i !== index)
}

/** @returns 有沒有真的存起來。發布那條路要靠它決定要不要繼續。 */
async function saveDraft(): Promise<boolean> {
  saving.value = true
  actionError.value = ''
  try {
    const next = await adminApi.site.home.saveDraft(
      sections.map((s) => JSON.parse(JSON.stringify(s))),
      user!.id,
    )
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
  <!-- ⚠️ 版面對齊九個內容模型的編輯畫面（Tim 指定 2026-09-17）：
       單欄 `.adm-editor` ＋ 960px 上限、動作在標題列、綠色儲存靠右且在卡片外。
       原本是 `.adm-editor-layout` 兩欄 ＋ 右側 sticky 側欄，與其他表單頁長得不一樣。 -->
  <section class="adm-page adm-editor">
    <header class="adm-page__head">
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
        <button v-if="canEdit" type="button" class="btn btn--save" :disabled="saving" @click="saveDraft">{{ saving ? '儲存中…' : '儲存草稿' }}</button>
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

      <div class="adm-editor-main">
          <div
            v-for="section in sortedSections"
            :key="section.sectionKey"
            class="adm-card"
            v-bind="drag.itemProps('sections', section.sectionKey)"
            :class="drag.itemClass('sections', section.sectionKey)"
          >
            <div class="adm-page__head" style="margin-bottom: var(--sp-3)">
              <div>
                <p class="adm-card__title" style="margin-bottom: 0; display: flex; align-items: center; gap: var(--sp-2)">
                  <DragHandle v-if="canEdit" v-bind="drag.handleProps(section.sectionKey)" />
                  {{ section.title }}
                  <span class="adm-muted" style="font-weight: 400; font-size: var(--fs-xs)">（{{ section.sectionKey }}）</span>
                </p>
                <p v-if="section.targetUnit" class="adm-field__hint">
                  內容來源：{{ UNIT_REGISTRY[section.targetUnit].label }}——只能從既有的{{ UNIT_REGISTRY[section.targetUnit].label }}挑選，不能另打文案。
                </p>
                <p v-else class="adm-field__hint">
                  唯一例外：沒有對應的內容模型，CTA 與外部導流連結存在版位設定裡。
                </p>
              </div>
            </div>

            <div class="adm-field-grid" style="margin-bottom: var(--sp-4)">
              <div class="adm-field">
                <label class="adm-field__label">版位標題</label>
                <input v-model="section.title" class="adm-input" type="text" :disabled="!canEdit">
              </div>
              <div class="adm-field">
                <label class="adm-field__label">副標／Eyebrow</label>
                <input v-model="section.subtitle" class="adm-input" type="text" :disabled="!canEdit">
              </div>
              <div class="adm-field">
                <label class="adm-checkbox">
                  <input v-model="section.isEnabled" type="checkbox" :disabled="!canEdit">
                  在首頁顯示這個版位
                </label>
              </div>
            </div>

            <!-- hero：唯一例外，沒有內容選擇器。
                 🔴 **正式資料進不了這組欄位，所以正式環境看到的是下面那段說明。**
                 前台讀的 `hero.settings` 是一個**輪播圖陣列**
                 （apps/web/app/data/home.ts），不是這裡假設的
                 `{ headline, ctaLabel, images… }` 物件 —— 兩種形狀對不上，
                 硬灌進表單再存回去等於把四張輪播圖換成一個物件。
                 詳見 src/api/site.ts 的 `HomeSection.rawSettings`。 -->
            <div v-if="section.sectionKey === 'hero' && !section.heroSettings" class="adm-alert adm-alert--warn">
              主視覺的輪播圖<strong>目前不在這個畫面編輯</strong>（資料形狀與這裡的表單對不上，
              硬編會把圖弄丟）。這一區只能停用或調整順序；要換圖請洽工程。
            </div>
            <div v-else-if="section.sectionKey === 'hero' && section.heroSettings">
              <div class="adm-field-grid">
                <div class="adm-field adm-field--span2">
                  <label class="adm-field__label">主標題</label>
                  <input v-model="section.heroSettings.headline" class="adm-input" type="text" :disabled="!canEdit">
                </div>
                <div class="adm-field">
                  <label class="adm-field__label">按鈕文字（站內）</label>
                  <input v-model="section.heroSettings.ctaLabel" class="adm-input" type="text" :disabled="!canEdit">
                </div>
                <div class="adm-field">
                  <label class="adm-field__label">按鈕連結（站內路徑）</label>
                  <input v-model="section.heroSettings.ctaUrl" class="adm-input" type="text" placeholder="/contact/" :disabled="!canEdit">
                </div>
                <div class="adm-field">
                  <label class="adm-field__label">按鈕文字（外部導流）</label>
                  <input v-model="section.heroSettings.externalCtaLabel" class="adm-input" type="text" :disabled="!canEdit">
                </div>
                <div class="adm-field">
                  <label class="adm-field__label">按鈕連結（外部導流）</label>
                  <input v-model="section.heroSettings.externalCtaUrl" class="adm-input" type="text" :disabled="!canEdit">
                  <p class="adm-field__hint">例如 booking.20skin.tw——但正式的外部連結維護入口是「導覽選單與頁尾」，這裡只是主視覺按鈕本身要指到哪裡。</p>
                </div>
              </div>

              <div class="adm-field adm-field--span2" style="margin-top: var(--sp-4)">
                <label class="adm-field__label">輪播圖片（示意用網址輸入）</label>
                <div class="adm-repeater">
                  <div v-for="(img, idx) in section.heroSettings.images" :key="idx" class="adm-repeater__row">
                    <div class="adm-repeater__fields">
                      <input class="adm-input" type="text" placeholder="圖片網址" v-model="img.url" :disabled="!canEdit">
                      <input class="adm-input" type="text" placeholder="替代文字（alt）" v-model="img.alt" :disabled="!canEdit">
                    </div>
                    <button type="button" class="btn btn--line btn--sm" :disabled="!canEdit" @click="removeHeroImage(section.heroSettings!, idx)">移除</button>
                  </div>
                  <button type="button" class="btn btn--ghost btn--sm" style="align-self:flex-start" :disabled="!canEdit" @click="addHeroImage(section.heroSettings!)">＋ 新增圖片</button>
                </div>
              </div>
            </div>

            <!-- 其餘六個版位：只能挑選既有內容 -->
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
          </div>

          <div v-if="canEdit" class="adm-form-actions">
            <span class="adm-muted">儲存草稿不會影響前台</span>
            <button type="button" class="btn btn--save" :disabled="saving" @click="saveDraft">{{ saving ? '儲存中…' : '儲存草稿' }}</button>
          </div>

          <p class="adm-alert adm-alert--warn">
            🔴 <strong>只按「儲存草稿」前台不會變。</strong>前台讀的是已發布的版本快照，
            排好之後一定要再按一次「發布」。（按「發布」會自動先存一次草稿。）
          </p>
          <p v-if="!canPublish" class="adm-muted">
            目前沒有發布首頁的權限，排好之後請找有權限的人按「發布」。
          </p>
      </div>
    </template>
  </section>
</template>
