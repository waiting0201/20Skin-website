<script setup lang="ts">
// 導覽選單與頁尾（/menu）—— 規格見 docs/02 §3、docs/08 §G-3。
//
// 樹狀編輯，最多兩層：頂層項目 ＋ 各自底下的子項目。拖曳排序此輪比照其餘畫面
// 的既有作法（admin.css 開頭註解：「拖曳排序現為上／下移動按鈕」），用上／下
// 移動按鈕代替真正的拖曳，不是漏做。
//
// 每一列（既有項目）用「本地編輯緩衝 ＋ 列末儲存按鈕」，不是每個欄位一改就打
// API：型態（LinkKind）在「站內內容」時要先選單元、才能選到項目，兩者是
// 同一次送出，若逐欄位即時送出，選了單元、還沒選項目那一瞬間就會因為缺
// contentItemId 被 API 擋下（VALIDATION_REQUIRED）。排序／升降層／刪除這類
// 不牽涉「未完成的表單狀態」的動作維持即時生效。
//
// 設定類（menu.edit，限超級管理員）：不走審核，儲存即生效，也沒有留痕
// （2026-09-11 定案不做操作日誌，docs/08 §I）。
//
// booking.20skin.tw／20skinshop.com 兩個外部導流連結的唯一維護入口在這裡
// （docs/08 §G-3、CLAUDE.md 決策 4），已經在 site.ts 的種子資料裡各佔一筆
// LinkKind=3 記錄，畫面上用徽章標示「外部連結」，且外部連結的新分頁／rel
// 是強制的（不提供關閉選項，API 端 update() 也會強制覆寫，UI 只是同步顯示）。
//
// 頁尾的 NAP／社群連結／版權文案（docs/02 §3）：NAP 主資料的編輯入口在
// 「全站設定」（一致性檢查也在那裡做），這裡只放一份唯讀預覽並提示去哪裡改；
// 社群連結與版權文案才是這個畫面自己的編輯範圍。
import { computed, onMounted, reactive, ref } from 'vue'
import { adminApi } from '@/api/client'
import type { LinkKind, MenuItem, MenuKey, NewMenuItemInput, SiteSettingsData } from '@/api/site'
import { currentUser } from '@/auth'
import { hasPermission } from '@/permissions'
import type { UnitKey } from '@/types'
import { UNIT_KEYS } from '@/types'
import { UNIT_REGISTRY } from '@/units'

const user = currentUser()
const permCtx = user ? { roles: user.roles, isSuperAdmin: user.isSuperAdmin } : null
const canEdit = computed(() => hasPermission(permCtx, 'menu.edit'))

const loading = ref(true)
const actionError = ref('')
const actionNotice = ref('')

const mainItems = ref<MenuItem[]>([])
const footerItems = ref<MenuItem[]>([])
const settings = ref<SiteSettingsData | null>(null)

const contentOptions = reactive<Record<string, { value: string; label: string }[]>>({})

function topOf(items: MenuItem[]) {
  return [...items].filter((i) => i.depth === 1).sort((a, b) => a.sortOrder - b.sortOrder)
}
function childrenOf(items: MenuItem[], parentId: number) {
  return [...items].filter((i) => i.parentId === parentId).sort((a, b) => a.sortOrder - b.sortOrder)
}

// ── 編輯緩衝：既有項目與「新增」表單共用同一個形狀 ──────────────────────
interface Draft {
  label: string
  linkKind: LinkKind
  contentUnit: UnitKey | ''
  contentItemId: string
  url: string
}
function emptyDraft(): Draft {
  return { label: '', linkKind: 2, contentUnit: '', contentItemId: '', url: '' }
}
function bufferFrom(item: MenuItem): Draft {
  return {
    label: item.label,
    linkKind: item.linkKind,
    contentUnit: item.contentUnit ?? '',
    contentItemId: item.contentItemId != null ? String(item.contentItemId) : '',
    url: item.url ?? '',
  }
}

/** 既有項目的編輯緩衝，key 是 MenuItem.id；載入或重新載入時整批重建。 */
const rowBuffers = reactive<Record<number, Draft>>({})

function isDirty(item: MenuItem): boolean {
  const b = rowBuffers[item.id]
  if (!b) return false
  return (
    b.label !== item.label ||
    b.linkKind !== item.linkKind ||
    b.contentUnit !== (item.contentUnit ?? '') ||
    b.contentItemId !== (item.contentItemId != null ? String(item.contentItemId) : '') ||
    b.url !== (item.url ?? '')
  )
}

async function loadMenu(menuKey: MenuKey) {
  const list = await adminApi.site.menu.list(menuKey)
  if (menuKey === 'main') mainItems.value = list
  else footerItems.value = list
  for (const item of list) rowBuffers[item.id] = bufferFrom(item)
}

async function load() {
  loading.value = true
  try {
    await Promise.all(UNIT_KEYS.map(async (u) => { contentOptions[u] = await adminApi.taxonomy.unitOptions(u) }))
    await Promise.all([loadMenu('main'), loadMenu('footer')])
    settings.value = await adminApi.site.settings.get()
  } finally {
    loading.value = false
  }
}
onMounted(load)

function contentLabel(item: MenuItem): string {
  if (item.linkKind !== 1 || !item.contentUnit || !item.contentItemId) return ''
  const opt = (contentOptions[item.contentUnit] ?? []).find((o) => o.value === String(item.contentItemId))
  return opt?.label ?? `#${item.contentItemId}`
}

async function withErrorHandling(fn: () => Promise<void>) {
  actionError.value = ''
  try {
    await fn()
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : '操作失敗。'
  }
}

/** 列末「儲存」：把該列的編輯緩衝一次送出，不是逐欄位即時送出（見檔頭註解）。 */
async function commitRow(item: MenuItem) {
  const b = rowBuffers[item.id]
  if (!b.label.trim()) {
    actionError.value = '項目名稱為必填。'
    return
  }
  await withErrorHandling(async () => {
    await adminApi.site.menu.update(
      item.id,
      {
        label: b.label,
        linkKind: b.linkKind,
        contentUnit: b.linkKind === 1 ? b.contentUnit || null : null,
        contentItemId: b.linkKind === 1 && b.contentItemId ? Number(b.contentItemId) : null,
        url: b.linkKind === 1 ? null : b.url || null,
      },
      user!.id,
    )
    await loadMenu(item.menuKey)
    actionNotice.value = '已儲存，立即生效。'
  })
}

async function moveItem(item: MenuItem, direction: -1 | 1) {
  await withErrorHandling(async () => {
    await adminApi.site.menu.move(item.id, direction, user!.id)
    await loadMenu(item.menuKey)
  })
}

async function promoteItem(item: MenuItem) {
  await withErrorHandling(async () => {
    await adminApi.site.menu.changeParent(item.id, null, user!.id)
    await loadMenu(item.menuKey)
    actionNotice.value = '已升為頂層項目。'
  })
}

async function removeItem(item: MenuItem) {
  const hasChildren = (item.menuKey === 'main' ? mainItems.value : footerItems.value).some((i) => i.parentId === item.id)
  const msg = hasChildren ? `「${item.label}」底下還有子項目，一併刪除，確定嗎？` : `確定要刪除「${item.label}」嗎？`
  if (!window.confirm(msg)) return
  await withErrorHandling(async () => {
    await adminApi.site.menu.remove(item.id)
    await loadMenu(item.menuKey)
    actionNotice.value = '已刪除。'
  })
}

// ── 新增表單：頂層與「某個頂層底下的子項目」各自一份草稿 ────────────────
const topDrafts = reactive<Record<MenuKey, Draft>>({ main: emptyDraft(), footer: emptyDraft() })
const childDrafts = reactive<Record<number, Draft>>({})
const openChildForm = reactive<Record<number, boolean>>({})

function draftToInput(menuKey: MenuKey, parentId: number | null, draft: Draft): NewMenuItemInput {
  return {
    menuKey,
    parentId: parentId ?? undefined,
    label: draft.label,
    linkKind: draft.linkKind,
    contentUnit: draft.contentUnit || undefined,
    contentItemId: draft.contentItemId ? Number(draft.contentItemId) : undefined,
    url: draft.url || undefined,
  }
}

async function addTopItem(menuKey: MenuKey) {
  const draft = topDrafts[menuKey]
  if (!draft.label.trim()) {
    actionError.value = '項目名稱為必填。'
    return
  }
  await withErrorHandling(async () => {
    await adminApi.site.menu.create(draftToInput(menuKey, null, draft), user!.id)
    topDrafts[menuKey] = emptyDraft()
    await loadMenu(menuKey)
    actionNotice.value = '已新增。'
  })
}

async function addChildItem(parent: MenuItem) {
  const draft = childDrafts[parent.id] ?? emptyDraft()
  if (!draft.label.trim()) {
    actionError.value = '項目名稱為必填。'
    return
  }
  await withErrorHandling(async () => {
    await adminApi.site.menu.create(draftToInput(parent.menuKey, parent.id, draft), user!.id)
    childDrafts[parent.id] = emptyDraft()
    openChildForm[parent.id] = false
    await loadMenu(parent.menuKey)
    actionNotice.value = '已新增子項目。'
  })
}

function toggleChildForm(parentId: number) {
  openChildForm[parentId] = !openChildForm[parentId]
  if (!childDrafts[parentId]) childDrafts[parentId] = emptyDraft()
}

// ── 頁尾：社群連結、版權文案（資料在 SiteSettings，編輯入口在這裡，docs/02 §3）──
async function saveSocial() {
  if (!settings.value) return
  await withErrorHandling(async () => {
    settings.value = await adminApi.site.settings.update(
      { socialLinks: settings.value!.socialLinks, footerCopyright: settings.value!.footerCopyright },
      user!.id,
    )
    actionNotice.value = '頁尾設定已儲存，立即生效。'
  })
}
function addSocialLink() {
  if (!settings.value) return
  settings.value.socialLinks = [...settings.value.socialLinks, { label: '', url: '' }]
}
function removeSocialLink(index: number) {
  if (!settings.value) return
  settings.value.socialLinks = settings.value.socialLinks.filter((_, i) => i !== index)
}
</script>

<template>
  <section class="adm-page">
    <header class="adm-page__head">
      <div>
        <h1 class="adm-page__title">導覽選單與頁尾</h1>
        <p class="adm-page__desc">
          限超級管理員。排序／升降層／刪除立即生效；欄位編輯改完要按「儲存」才會送出（不走審核也沒有留痕，請小心確認）。
        </p>
      </div>
    </header>

    <div v-if="loading" class="adm-empty">載入中…</div>

    <template v-else>
      <p v-if="actionNotice" class="adm-workflow__banner" style="margin-bottom: var(--sp-4)">{{ actionNotice }}</p>
      <p v-if="actionError" class="adm-login__error" style="margin-bottom: var(--sp-4)">{{ actionError }}</p>
      <p v-if="!canEdit" class="adm-workflow__note" style="margin-bottom: var(--sp-4)">
        目前帳號沒有編輯權限，以下僅供檢視。
      </p>

      <div v-for="(items, menuKey) in { main: mainItems, footer: footerItems }" :key="menuKey" class="adm-card">
        <p class="adm-card__title">{{ menuKey === 'main' ? '主選單' : '頁尾選單' }}</p>

        <div v-for="top in topOf(items)" :key="top.id" class="adm-repeater" style="margin-bottom: var(--sp-4)">
          <div class="adm-repeater__row">
            <div class="adm-repeater__fields">
              <div class="adm-field">
                <label class="adm-field__label">項目名稱</label>
                <input class="adm-input" type="text" v-model="rowBuffers[top.id].label" :disabled="!canEdit">
              </div>
              <div class="adm-field">
                <label class="adm-field__label">
                  型態
                  <span v-if="rowBuffers[top.id].linkKind === 3" class="c-tag" style="font-size: var(--fs-eyebrow)">外部連結</span>
                </label>
                <select class="adm-select" v-model.number="rowBuffers[top.id].linkKind" :disabled="!canEdit">
                  <option :value="1">站內內容</option>
                  <option :value="2">站內路徑</option>
                  <option :value="3">外部網址</option>
                </select>
              </div>
              <template v-if="rowBuffers[top.id].linkKind === 1">
                <div class="adm-field">
                  <label class="adm-field__label">單元</label>
                  <select class="adm-select" v-model="rowBuffers[top.id].contentUnit" :disabled="!canEdit" @change="rowBuffers[top.id].contentItemId = ''">
                    <option value="">請選擇…</option>
                    <option v-for="u in UNIT_KEYS" :key="u" :value="u">{{ UNIT_REGISTRY[u].label }}</option>
                  </select>
                </div>
                <div class="adm-field">
                  <label class="adm-field__label">內容項目</label>
                  <select class="adm-select" v-model="rowBuffers[top.id].contentItemId" :disabled="!canEdit || !rowBuffers[top.id].contentUnit">
                    <option value="">請選擇…</option>
                    <option v-for="opt in contentOptions[rowBuffers[top.id].contentUnit || ''] ?? []" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                  <p v-if="contentLabel(top)" class="adm-field__hint">目前線上指向：{{ contentLabel(top) }}</p>
                </div>
              </template>
              <div v-else class="adm-field adm-field--span2">
                <label class="adm-field__label">網址</label>
                <input class="adm-input" type="text" v-model="rowBuffers[top.id].url" :disabled="!canEdit" placeholder="/concerns/ 或 https://…">
                <p v-if="rowBuffers[top.id].linkKind === 3" class="adm-field__hint">外部連結強制新分頁開啟、帶 rel="noopener external"，不可關閉。</p>
              </div>
            </div>
            <div class="adm-inline-actions">
              <button type="button" class="btn btn--primary btn--sm" :disabled="!canEdit || !isDirty(top)" @click="commitRow(top)">{{ isDirty(top) ? '儲存＊' : '儲存' }}</button>
              <button type="button" class="btn btn--line btn--sm" :disabled="!canEdit" @click="moveItem(top, -1)">↑</button>
              <button type="button" class="btn btn--line btn--sm" :disabled="!canEdit" @click="moveItem(top, 1)">↓</button>
              <button type="button" class="btn btn--line btn--sm" :disabled="!canEdit" @click="toggleChildForm(top.id)">＋子項目</button>
              <button type="button" class="btn btn--line btn--sm" :disabled="!canEdit" @click="removeItem(top)">刪除</button>
            </div>
          </div>

          <!-- 子項目（最多兩層，這一層不可再有子項目） -->
          <div v-for="child in childrenOf(items, top.id)" :key="child.id" class="adm-repeater__row" style="margin-left: var(--sp-6)">
            <div class="adm-repeater__fields">
              <div class="adm-field">
                <label class="adm-field__label">項目名稱</label>
                <input class="adm-input" type="text" v-model="rowBuffers[child.id].label" :disabled="!canEdit">
              </div>
              <div class="adm-field">
                <label class="adm-field__label">
                  型態
                  <span v-if="rowBuffers[child.id].linkKind === 3" class="c-tag" style="font-size: var(--fs-eyebrow)">外部連結</span>
                </label>
                <select class="adm-select" v-model.number="rowBuffers[child.id].linkKind" :disabled="!canEdit">
                  <option :value="1">站內內容</option>
                  <option :value="2">站內路徑</option>
                  <option :value="3">外部網址</option>
                </select>
              </div>
              <template v-if="rowBuffers[child.id].linkKind === 1">
                <div class="adm-field">
                  <label class="adm-field__label">單元</label>
                  <select class="adm-select" v-model="rowBuffers[child.id].contentUnit" :disabled="!canEdit" @change="rowBuffers[child.id].contentItemId = ''">
                    <option value="">請選擇…</option>
                    <option v-for="u in UNIT_KEYS" :key="u" :value="u">{{ UNIT_REGISTRY[u].label }}</option>
                  </select>
                </div>
                <div class="adm-field">
                  <label class="adm-field__label">內容項目</label>
                  <select class="adm-select" v-model="rowBuffers[child.id].contentItemId" :disabled="!canEdit || !rowBuffers[child.id].contentUnit">
                    <option value="">請選擇…</option>
                    <option v-for="opt in contentOptions[rowBuffers[child.id].contentUnit || ''] ?? []" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                  <p v-if="contentLabel(child)" class="adm-field__hint">目前線上指向：{{ contentLabel(child) }}</p>
                </div>
              </template>
              <div v-else class="adm-field adm-field--span2">
                <label class="adm-field__label">網址</label>
                <input class="adm-input" type="text" v-model="rowBuffers[child.id].url" :disabled="!canEdit">
                <p v-if="rowBuffers[child.id].linkKind === 3" class="adm-field__hint">外部連結強制新分頁開啟、帶 rel="noopener external"，不可關閉。</p>
              </div>
            </div>
            <div class="adm-inline-actions">
              <button type="button" class="btn btn--primary btn--sm" :disabled="!canEdit || !isDirty(child)" @click="commitRow(child)">{{ isDirty(child) ? '儲存＊' : '儲存' }}</button>
              <button type="button" class="btn btn--line btn--sm" :disabled="!canEdit" @click="moveItem(child, -1)">↑</button>
              <button type="button" class="btn btn--line btn--sm" :disabled="!canEdit" @click="moveItem(child, 1)">↓</button>
              <button type="button" class="btn btn--line btn--sm" :disabled="!canEdit" @click="promoteItem(child)" title="升為頂層項目">升層</button>
              <button type="button" class="btn btn--line btn--sm" :disabled="!canEdit" @click="removeItem(child)">刪除</button>
            </div>
          </div>

          <!-- 新增子項目表單 -->
          <div v-if="openChildForm[top.id]" class="adm-repeater__row" style="margin-left: var(--sp-6); background: var(--surface-alt)">
            <div class="adm-repeater__fields">
              <input class="adm-input" type="text" placeholder="子項目名稱" v-model="childDrafts[top.id].label">
              <select class="adm-select" v-model.number="childDrafts[top.id].linkKind">
                <option :value="1">站內內容</option>
                <option :value="2">站內路徑</option>
                <option :value="3">外部網址</option>
              </select>
              <template v-if="childDrafts[top.id].linkKind === 1">
                <select class="adm-select" v-model="childDrafts[top.id].contentUnit" @change="childDrafts[top.id].contentItemId = ''">
                  <option value="">選擇單元…</option>
                  <option v-for="u in UNIT_KEYS" :key="u" :value="u">{{ UNIT_REGISTRY[u].label }}</option>
                </select>
                <select class="adm-select" v-model="childDrafts[top.id].contentItemId">
                  <option value="">選擇項目…</option>
                  <option v-for="opt in contentOptions[childDrafts[top.id].contentUnit || ''] ?? []" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
              </template>
              <input v-else class="adm-input" type="text" placeholder="網址" v-model="childDrafts[top.id].url">
            </div>
            <button type="button" class="btn btn--primary btn--sm" @click="addChildItem(top)">新增</button>
          </div>
        </div>

        <!-- 新增頂層項目表單 -->
        <div class="adm-repeater__row" style="background: var(--surface-alt)">
          <div class="adm-repeater__fields">
            <input class="adm-input" type="text" placeholder="新頂層項目名稱" v-model="topDrafts[menuKey as MenuKey].label" :disabled="!canEdit">
            <select class="adm-select" v-model.number="topDrafts[menuKey as MenuKey].linkKind" :disabled="!canEdit">
              <option :value="1">站內內容</option>
              <option :value="2">站內路徑</option>
              <option :value="3">外部網址</option>
            </select>
            <template v-if="topDrafts[menuKey as MenuKey].linkKind === 1">
              <select class="adm-select" v-model="topDrafts[menuKey as MenuKey].contentUnit" :disabled="!canEdit" @change="topDrafts[menuKey as MenuKey].contentItemId = ''">
                <option value="">選擇單元…</option>
                <option v-for="u in UNIT_KEYS" :key="u" :value="u">{{ UNIT_REGISTRY[u].label }}</option>
              </select>
              <select class="adm-select" v-model="topDrafts[menuKey as MenuKey].contentItemId" :disabled="!canEdit">
                <option value="">選擇項目…</option>
                <option v-for="opt in contentOptions[topDrafts[menuKey as MenuKey].contentUnit || ''] ?? []" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
            </template>
            <input v-else class="adm-input" type="text" placeholder="網址" v-model="topDrafts[menuKey as MenuKey].url" :disabled="!canEdit">
          </div>
          <button type="button" class="btn btn--primary btn--sm" :disabled="!canEdit" @click="addTopItem(menuKey as MenuKey)">＋ 新增頂層項目</button>
        </div>
      </div>

      <!-- 頁尾：社群連結與版權文案 -->
      <div v-if="settings" class="adm-card">
        <p class="adm-card__title">頁尾：社群連結與版權文案</p>
        <p class="adm-field__hint" style="margin-bottom: var(--sp-3)">
          NAP 主資料的編輯入口在「全站設定」（一致性檢查也在那裡），這裡只管社群連結與版權文案。
        </p>

        <div class="adm-repeater">
          <div v-for="(link, idx) in settings.socialLinks" :key="idx" class="adm-repeater__row">
            <div class="adm-repeater__fields">
              <input class="adm-input" type="text" placeholder="名稱" v-model="link.label" :disabled="!canEdit">
              <input class="adm-input" type="text" placeholder="網址" v-model="link.url" :disabled="!canEdit">
            </div>
            <button type="button" class="btn btn--line btn--sm" :disabled="!canEdit" @click="removeSocialLink(idx)">移除</button>
          </div>
          <button type="button" class="btn btn--ghost btn--sm" style="align-self:flex-start" :disabled="!canEdit" @click="addSocialLink">＋ 新增社群連結</button>
        </div>

        <div class="adm-field adm-field--span2" style="margin-top: var(--sp-4)">
          <label class="adm-field__label">頁尾版權文案</label>
          <input class="adm-input" type="text" v-model="settings.footerCopyright" :disabled="!canEdit">
        </div>

        <div class="adm-field-grid" style="margin-top: var(--sp-4)">
          <div v-for="(nap, idx) in settings.nap" :key="idx" class="adm-field">
            <label class="adm-field__label">{{ nap.name }}（NAP 預覽，唯讀）</label>
            <p class="adm-field__hint">{{ nap.phone }}・{{ nap.address }}</p>
          </div>
        </div>

        <button v-if="canEdit" type="button" class="btn btn--primary" style="margin-top: var(--sp-4)" @click="saveSocial">儲存頁尾設定</button>
      </div>
    </template>
  </section>
</template>
