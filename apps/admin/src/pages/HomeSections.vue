<script setup lang="ts">
// 首頁版位編排（/home-sections）—— 規格見 docs/02 §3、docs/08 §G-2。
//
// 七個版位為種子資料，可停用、可排序，不可新增刪除。除了 hero（主視覺／CTA／
// 外部導流連結，沒有對應的站內內容，存在 Settings JSON）之外，每個版位都只能
// 從既有內容裡「挑選」，不能另打文案——這裡刻意重用 RelationPicker（跟九個
// 內容模型編輯畫面的「關聯」欄位同一顆元件），選項一律來自 adminApi.taxonomy
// .unitOptions()，UI 上沒有任何自由文字輸入欄位可以填內容本文。
//
// ⚠️ 已知缺口（如實回報，不要隱藏）：版位編排走送審流程（home.submit／
// home.publish），但這是本畫面自己的一套簡化狀態機，**沒有併入
// client.ts 共用的 ContentReviews 佇列**，所以審核者不會在「審核佇列」
// 畫面看到這筆送審——要在本頁下方的工作流卡片直接審。原因：docs/08 §G-2
// 把版位的送審／版本歷程掛在 SystemKey='home' 那筆 ContentItem 上，但這
// 支畫面被要求透過 src/api/mock-store.ts 開自己的 store、不動 client.ts
// 的 Db，兩者無法同時滿足，兩害相權取其輕，選擇不動 client.ts。接上真正
// 的 API 之後這個落差就不存在——後端本來就是同一張 ContentReviews 表。
import { computed, onMounted, reactive, ref } from 'vue'
import { adminApi } from '@/api/client'
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
import RelationPicker from '@/components/RelationPicker.vue'

const user = currentUser()
const permCtx = user ? { roles: user.roles, isSuperAdmin: user.isSuperAdmin } : null

const canEditBase = computed(() => hasPermission(permCtx, 'home.edit'))
const canSubmit = computed(() => hasPermission(permCtx, 'home.submit'))
const canPublish = computed(() => hasPermission(permCtx, 'home.publish'))

const loading = ref(true)
const saving = ref(false)
const actionError = ref('')
const actionNotice = ref('')
const decisionNote = ref('')

const state = ref<HomeSectionsState | null>(null)
const sections = reactive<HomeSection[]>([])

// 送審中鎖定本文（呼應九個內容模型「送審中本文鎖定」的同一個原則，docs/11 §7）。
const isLocked = computed(() => state.value?.status === 2)
const canEdit = computed(() => canEditBase.value && !isLocked.value)

const sortedSections = computed(() => [...sections].sort((a, b) => a.sortOrder - b.sortOrder))

// 內容標題快取：{ unit: { id: label } }，畫面上把 ContentItemId 換成可讀標題。
const titleCache = reactive<Record<string, Record<number, string>>>({})

async function loadTitleCache(unit: UnitKey) {
  if (titleCache[unit]) return
  const options = await adminApi.taxonomy.unitOptions(unit)
  titleCache[unit] = Object.fromEntries(options.map((o) => [Number(o.value), o.label]))
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

// ── 一次性把預設內容連到既有內容（mock 示範用，docs/08 §G-2 的「只能挑選
// 已存在內容」在這裡落實：預設值也是查出來的既有內容 id，不是憑空編號）──
const DEFAULT_TITLES: Partial<Record<HomeSectionKey, string[]>> = {
  specialties: ['痘痘・粉刺', '敏感肌'],
  'featured-treatments': ['皮秒雷射（示意）'],
  'latest-articles': ['（示意）淺談皮秒雷射的適應症'],
  doctors: ['示範醫師一', '示範醫師二', '示範藝術總監'],
  clinics: ['四季診所', '二林四季皮膚科'],
  'brand-story': ['品牌理念'],
}

async function seedDefaultsIfNeeded(current: HomeSectionsState) {
  if (current.defaultItemsSeeded) return
  const targetUnits = new Set<UnitKey>()
  for (const s of current.sections) if (s.targetUnit) targetUnits.add(s.targetUnit)
  await Promise.all([...targetUnits].map(loadTitleCache))

  const itemsByKey: Partial<Record<HomeSectionKey, HomeSectionItemRef[]>> = {}
  for (const section of current.sections) {
    if (!section.targetUnit) continue
    const wantedTitles = DEFAULT_TITLES[section.sectionKey] ?? []
    const idsByTitle = titleCache[section.targetUnit] ?? {}
    const resolved: HomeSectionItemRef[] = []
    for (const title of wantedTitles) {
      const entry = Object.entries(idsByTitle).find(([, label]) => label === title)
      if (entry) resolved.push({ contentItemId: Number(entry[0]), sortOrder: resolved.length })
    }
    itemsByKey[section.sectionKey] = resolved
  }
  const heroSettings = current.sections.find((s) => s.sectionKey === 'hero')?.heroSettings as HomeHeroSettings
  const next = await adminApi.site.home.seedDefaultItems(itemsByKey, heroSettings)
  applyState(next)
}

function applyState(next: HomeSectionsState) {
  state.value = next
  sections.splice(0, sections.length, ...next.sections.map((s) => JSON.parse(JSON.stringify(s))))
}

async function load() {
  loading.value = true
  try {
    const current = await adminApi.site.home.get()
    const targetUnits = new Set<UnitKey>()
    for (const s of current.sections) if (s.targetUnit) targetUnits.add(s.targetUnit)
    await Promise.all([...targetUnits].map(loadTitleCache))
    await seedDefaultsIfNeeded(current)
    applyState(await adminApi.site.home.get())
  } finally {
    loading.value = false
  }
}

onMounted(load)

function moveSection(key: HomeSectionKey, direction: -1 | 1) {
  const ordered = sortedSections.value
  const index = ordered.findIndex((s) => s.sectionKey === key)
  const target = index + direction
  if (target < 0 || target >= ordered.length) return
  const a = ordered[index]
  const b = ordered[target]
  const tmp = a.sortOrder
  a.sortOrder = b.sortOrder
  b.sortOrder = tmp
}

function addHeroImage(hero: HomeHeroSettings) {
  hero.images = [...hero.images, { url: '', alt: '' }]
}
function removeHeroImage(hero: HomeHeroSettings, index: number) {
  hero.images = hero.images.filter((_, i) => i !== index)
}

async function saveDraft() {
  saving.value = true
  actionError.value = ''
  try {
    const next = await adminApi.site.home.saveDraft(
      sections.map((s) => JSON.parse(JSON.stringify(s))),
      user!.id,
    )
    applyState(next)
    actionNotice.value = '草稿已儲存。尚未送審，前台不會有任何變化。'
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : '儲存失敗。'
  } finally {
    saving.value = false
  }
}

async function submit() {
  await saveDraft()
  const next = await adminApi.site.home.submit(user!.id)
  applyState(next)
  actionNotice.value = '已送出審核，請等待審核者核准。'
}

async function withdraw() {
  const next = await adminApi.site.home.withdraw(user!.id)
  applyState(next)
  actionNotice.value = '已撤回，改回草稿，可以繼續編輯。'
}

async function approve() {
  const next = await adminApi.site.home.approve(user!.id)
  applyState(next)
  actionNotice.value = '已核准，首頁版位已更新為這個版本。'
}

async function reject() {
  if (!decisionNote.value.trim()) {
    actionError.value = '退回原因為必填。'
    return
  }
  const next = await adminApi.site.home.reject(decisionNote.value, user!.id)
  applyState(next)
  decisionNote.value = ''
  actionNotice.value = '已退回。'
}

const statusLabel = computed(() => ({ 1: '草稿', 2: '送審中', 3: '已發布' })[state.value?.status ?? 3])
</script>

<template>
  <section class="adm-page">
    <header class="adm-page__head">
      <div>
        <h1 class="adm-page__title">首頁版位編排</h1>
        <p class="adm-page__desc">
          七個版位，只能挑選已存在的內容——避免首頁又變回一份跟內頁對不上的自由文案（docs/02 §3）。
        </p>
      </div>
    </header>

    <div v-if="loading" class="adm-empty">載入中…</div>

    <template v-else-if="state">
      <p v-if="actionNotice" class="adm-workflow__banner" style="margin-bottom: var(--sp-4)">{{ actionNotice }}</p>
      <p v-if="actionError" class="adm-login__error" style="margin-bottom: var(--sp-4)">{{ actionError }}</p>

      <div class="adm-editor-layout">
        <div>
          <div v-for="section in sortedSections" :key="section.sectionKey" class="adm-card">
            <div class="adm-page__head" style="margin-bottom: var(--sp-3)">
              <div>
                <p class="adm-card__title" style="margin-bottom: 0">
                  {{ section.title }}
                  <span class="adm-muted" style="font-weight: 400; font-size: var(--fs-xs)">（{{ section.sectionKey }}）</span>
                </p>
                <p v-if="section.targetUnit" class="adm-field__hint">
                  內容來源：{{ UNIT_REGISTRY[section.targetUnit].label }}——只能從既有的{{ UNIT_REGISTRY[section.targetUnit].label }}挑選，不能另打文案。
                </p>
                <p v-else class="adm-field__hint">
                  唯一例外：沒有對應的內容模型，CTA 與外部導流連結存在版位設定裡（docs/08 §G-2）。
                </p>
              </div>
              <div class="adm-page__actions">
                <button type="button" class="btn btn--line btn--sm" :disabled="!canEdit" @click="moveSection(section.sectionKey, -1)">↑ 上移</button>
                <button type="button" class="btn btn--line btn--sm" :disabled="!canEdit" @click="moveSection(section.sectionKey, 1)">↓ 下移</button>
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

            <!-- hero：唯一例外，沒有內容選擇器，是自由文字＋外部導流連結 -->
            <div v-if="section.sectionKey === 'hero' && section.heroSettings">
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
                <label class="adm-field__label">輪播圖片（示意用網址輸入，正式上傳見 docs/09 §9）</label>
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

          <div v-if="canEdit" class="adm-inline-actions">
            <button type="button" class="btn btn--primary" :disabled="saving" @click="saveDraft">{{ saving ? '儲存中…' : '儲存草稿' }}</button>
            <span class="adm-muted">儲存草稿不會影響前台，要等審核核准才會上線。</span>
          </div>
        </div>

        <aside class="adm-workflow">
          <div class="adm-card">
            <p class="adm-card__title">工作流</p>
            <div class="adm-workflow__row"><span class="adm-workflow__label">狀態</span><strong>{{ statusLabel }}</strong></div>
            <div v-if="state.submittedAt" class="adm-workflow__row">
              <span class="adm-workflow__label">送審時間</span><span>{{ new Date(state.submittedAt).toLocaleString('zh-TW') }}</span>
            </div>
            <div v-if="state.publishedAt" class="adm-workflow__row">
              <span class="adm-workflow__label">最近核准</span><span>{{ new Date(state.publishedAt).toLocaleString('zh-TW') }}</span>
            </div>
            <p v-if="state.decisionNote" class="adm-risk-hit">退回原因：{{ state.decisionNote }}</p>

            <div class="adm-workflow__actions">
              <button v-if="canSubmit && state.status === 1" type="button" class="btn btn--primary btn--block" @click="submit">送出審核</button>
              <button v-if="canSubmit && state.status === 2" type="button" class="btn btn--line btn--block" @click="withdraw">撤回（改回草稿）</button>
            </div>

            <template v-if="canPublish && state.status === 2">
              <hr class="adm-divider">
              <button type="button" class="btn btn--primary btn--block" @click="approve">核准，發布這個版本</button>
              <div class="adm-field" style="margin-top: var(--sp-3)">
                <label class="adm-field__label">退回原因</label>
                <textarea v-model="decisionNote" class="adm-textarea" placeholder="說明需要調整的地方" />
              </div>
              <button type="button" class="btn btn--line btn--block" @click="reject">退回</button>
            </template>

            <p class="adm-workflow__note" style="margin-top: var(--sp-4)">
              ⚠️ 這裡的送審是版位編排專用的簡化流程，尚未併入「審核佇列」總覽畫面
              （已知缺口，見本檔開頭註解）——審核者請直接在這裡核准或退回。
            </p>
          </div>
        </aside>
      </div>
    </template>
  </section>
</template>
