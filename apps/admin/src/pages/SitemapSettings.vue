<script setup lang="ts">
// sitemap 設定（/sitemap）—— 規格見 docs/03 §1、docs/06 §6、docs/08 §H。
//
// ⚠️ docs/08-database.md §H：sitemap 的 5 個分檔**不需要資料表**，實際收錄
// 範圍由 API 在**每一次請求**當下以 `ContentType ＋ IncludeInSitemap ＋ Status
// ＋ UrlPath IS NOT NULL`（`functions/Common/Indexability.cs`）算出來 ——
// 2026-09-16 改執行期 SSR 之後沒有「建置期」這一步了（CLAUDE.md 決策 6、14）。
// 這個畫面管的是「分檔本身的開關與預設 changefreq／priority」（存在
// docs/08 §G-1 SiteSettings 底下），以及 robots.txt 的可編輯區塊——不是在
// 這裡逐筆勾選哪些內容要收錄，那件事在各單元編輯畫面的 SEO 區塊裡做。
import { computed, onMounted, reactive, ref } from 'vue'
import { adminApi, ApiError } from '@/api/client'
import { currentUser } from '@/auth'
import { hasPermission } from '@/permissions'
import { UNIT_KEYS } from '@/types'
import { UNIT_REGISTRY } from '@/units'
import { CHANGE_FREQ_OPTIONS } from '@/api/seo'
import type { ChangeFreq, SeoConsistencyIssue, SitemapFileConfig, SitemapFileKey } from '@/api/seo'

const user = currentUser()
const permCtx = user ? { roles: user.roles, isSuperAdmin: user.isSuperAdmin } : null
const canView = computed(() => hasPermission(permCtx, 'settings.edit'))
const canEdit = computed(() => hasPermission(permCtx, 'settings.edit'))

// ── 內容快照：跨九個單元撈一次，同時餵「分檔預估筆數」與「矛盾清單」用 ──

interface ContentSnapshotRow {
  id: number
  unit: (typeof UNIT_KEYS)[number]
  title: string
  urlPath: string | null
  includeInSitemap: boolean
  noIndex: boolean
  status: number
}

const snapshot = ref<ContentSnapshotRow[]>([])
const snapshotLoading = ref(true)

function messageOf(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.details.length ? `${e.message}（${e.details.join('、')}）` : e.message
  if (e instanceof Error) return e.message
  return fallback
}

/** 這個畫面的六支非同步函式原本一個 catch 都沒有，統一收在這裡顯示。 */
const pageError = ref('')

async function loadSnapshot() {
  snapshotLoading.value = true
  const rows: ContentSnapshotRow[] = []
  try {
  for (const unit of UNIT_KEYS) {
    const res = await adminApi.content.list(unit, { pageSize: 100 })
    for (const item of res.items) {
      rows.push({
        id: item.id,
        unit,
        title: item.title,
        urlPath: item.urlPath,
        includeInSitemap: item.includeInSitemap,
        noIndex: item.seo.noIndex,
        status: item.status,
      })
    }
  }
  snapshot.value = rows
  } catch (e) {
    snapshot.value = []
    pageError.value = messageOf(e, '載入內容快照失敗——分檔預估筆數與矛盾清單這一輪不準。')
  } finally {
    snapshotLoading.value = false
  }
}

function eligibleCountFor(sourceUnits: string[]): number {
  return snapshot.value.filter((r) => sourceUnits.includes(r.unit) && r.status === 3 && r.includeInSitemap && r.urlPath).length
}

const consistencyIssues = computed<SeoConsistencyIssue[]>(() =>
  adminApi.seo.consistency.check(
    snapshot.value.map((r) => ({ id: r.id, unit: r.unit, title: r.title, urlPath: r.urlPath, includeInSitemap: r.includeInSitemap, noIndex: r.noIndex })),
  ),
)

// ── 分檔設定 ──────────────────────────────────────────────────────────

const files = ref<SitemapFileConfig[]>([])
const filesLoading = ref(true)
const savingFile = ref<SitemapFileKey | null>(null)

async function loadFiles() {
  filesLoading.value = true
  try {
    files.value = await adminApi.seo.sitemap.list()
  } catch (e) {
    files.value = []
    pageError.value = messageOf(e, '載入 sitemap 分檔設定失敗。')
  } finally {
    filesLoading.value = false
  }
}

async function updateFile(file: SitemapFileConfig, patch: Partial<Pick<SitemapFileConfig, 'enabled' | 'defaultChangeFreq' | 'defaultPriority'>>) {
  if (!canEdit.value) return
  savingFile.value = file.key
  pageError.value = ''
  try {
    const updated = await adminApi.seo.sitemap.update(file.key, patch)
    const idx = files.value.findIndex((f) => f.key === file.key)
    if (idx !== -1) files.value[idx] = updated
  } catch (e) {
    // ⚠️ 這個畫面的開關是「改一下就送出」，失敗時畫面上的勾選已經是新的、
    //    伺服器卻是舊的。所以失敗要重新載一次，讓畫面回到真實狀態。
    pageError.value = messageOf(e, '設定儲存失敗。')
    await loadFiles()
  } finally {
    savingFile.value = null
  }
}

async function resetFiles() {
  if (!canEdit.value) return
  if (!window.confirm('確定要把 5 個分檔的設定還原成預設值嗎？')) return
  pageError.value = ''
  try {
    files.value = await adminApi.seo.sitemap.resetDefaults()
  } catch (e) {
    pageError.value = messageOf(e, '還原預設值失敗。')
  }
}

function onPriorityInput(file: SitemapFileConfig, e: Event) {
  const value = Number((e.target as HTMLInputElement).value)
  if (Number.isNaN(value)) return
  updateFile(file, { defaultPriority: Math.min(1, Math.max(0, value)) })
}

// ⚠️ 這三個抽成具名函式而不是內嵌在模板裡轉型，vue-tsc 的模板運算式解析器
// 對連續／複雜的 `as` 轉型時好時壞（EditPage.vue 已有前例），抽出來最保險。
function onEnabledChange(file: SitemapFileConfig, e: Event) {
  updateFile(file, { enabled: (e.target as HTMLInputElement).checked })
}
function onChangeFreqChange(file: SitemapFileConfig, e: Event) {
  updateFile(file, { defaultChangeFreq: (e.target as HTMLSelectElement).value as ChangeFreq })
}

// ── robots.txt ────────────────────────────────────────────────────────

const robotsText = ref('')
const robotsUpdatedAt = ref('')
const robotsSaving = ref(false)
const robotsAckWarning = ref(false)
const robotsSavedMsg = ref('')
/** robots.txt 讀不回來時鎖住儲存：空的 textarea 存下去就是把規則全部清掉。 */
const robotsLoadFailed = ref(false)

async function loadRobots() {
  try {
    const r = await adminApi.seo.robots.get()
    robotsText.value = r.text
    robotsUpdatedAt.value = r.updatedAt
  } catch (e) {
    // 🔴 失敗時**不要**留著空字串 —— 那個空的 textarea 看起來就是「robots.txt 是空的」，
    //    按下儲存就真的把它清空了（等於對所有爬蟲全面放行，docs/03 §1）。
    pageError.value = messageOf(e, '載入 robots.txt 失敗——請重新整理再編輯，不要在這個狀態下按儲存。')
    robotsLoadFailed.value = true
  }
}

const robotsWarning = computed(() => adminApi.seo.robots.check(robotsText.value))

async function saveRobots() {
  if (!canEdit.value || robotsLoadFailed.value) return
  if (robotsWarning.value && !robotsAckWarning.value) return
  robotsSaving.value = true
  robotsSavedMsg.value = ''
  pageError.value = ''
  try {
    const r = await adminApi.seo.robots.update(robotsText.value)
    robotsUpdatedAt.value = r.updatedAt
    robotsSavedMsg.value = '已儲存。'
    robotsAckWarning.value = false
  } catch (e) {
    pageError.value = messageOf(e, 'robots.txt 儲存失敗。')
  } finally {
    robotsSaving.value = false
  }
}

async function resetRobots() {
  if (!canEdit.value) return
  if (!window.confirm('確定要把 robots.txt 還原成預設內容嗎？目前編輯中的內容會被蓋掉。')) return
  pageError.value = ''
  try {
    const r = await adminApi.seo.robots.resetDefault()
    robotsText.value = r.text
    robotsUpdatedAt.value = r.updatedAt
    robotsSavedMsg.value = ''
    robotsLoadFailed.value = false
  } catch (e) {
    pageError.value = messageOf(e, '還原 robots.txt 失敗。')
  }
}

onMounted(async () => {
  await Promise.all([loadFiles(), loadSnapshot(), loadRobots()])
})

const changeFreqLabel: Record<ChangeFreq, string> = {
  always: '總是', hourly: '每小時', daily: '每天', weekly: '每週', monthly: '每月', yearly: '每年', never: '不再變動',
}
</script>

<template>
  <section class="adm-page">
    <div class="adm-page__head">
      <div>
        <h1 class="adm-page__title">網站地圖設定</h1>
        <p class="adm-page__desc">送給搜尋引擎的網址清單（sitemap），以及爬蟲規則檔 robots.txt</p>
      </div>
    </div>

    <p v-if="!canView" class="adm-alert adm-alert--info">沒有檢視這個畫面的權限。</p>
    <p v-if="pageError" class="adm-alert adm-alert--danger" role="alert">{{ pageError }}</p>

    <template v-else>
      <div class="adm-card">
        <h2 class="adm-card__title">分類清單</h2>
        <p class="adm-field__hint" style="margin-bottom: var(--sp-3)">
          每個分檔收錄哪些內容是<strong>當下算出來的</strong>：已發布、有網址、而且該筆自己的
          「列入網站地圖」是開著的，就會收進來——內容一發布，搜尋引擎下一次來抓就看得到，
          不需要有人按按鈕。這張表只設定「整個分檔要不要納入」與該分檔的更新頻率／權重預設值。
        </p>

        <div v-if="filesLoading" class="adm-loading">
          <span class="adm-spinner" aria-hidden="true"></span>
          <span>載入中…</span>
        </div>
        <div v-else class="adm-table-wrap">
          <table class="adm-table">
            <thead>
              <tr>
                <th>分類</th>
                <th>檔名</th>
                <th>內容來源</th>
                <th>目前收錄筆數</th>
                <th>送給搜尋引擎</th>
                <th>預設更新頻率</th>
                <th>預設重要性（0–1）</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="file in files" :key="file.key">
                <td>{{ file.label }}</td>
                <td><code>{{ file.fileName }}</code></td>
                <td class="is-wrap">{{ file.sourceUnits.map((u) => UNIT_REGISTRY[u]?.label ?? u).join('、') }}</td>
                <td>{{ snapshotLoading ? '…' : eligibleCountFor(file.sourceUnits) }}</td>
                <td>
                  <label class="adm-checkbox">
                    <input type="checkbox" :checked="file.enabled" :disabled="!canEdit || savingFile === file.key" @change="onEnabledChange(file, $event)">
                  </label>
                </td>
                <td>
                  <select class="adm-select" :value="file.defaultChangeFreq" :disabled="!canEdit || savingFile === file.key" @change="onChangeFreqChange(file, $event)">
                    <option v-for="f in CHANGE_FREQ_OPTIONS" :key="f" :value="f">{{ changeFreqLabel[f] }}</option>
                  </select>
                </td>
                <td>
                  <input class="adm-input" type="number" min="0" max="1" step="0.1" style="width: 5em" :value="file.defaultPriority" :disabled="!canEdit || savingFile === file.key" @change="onPriorityInput(file, $event)">
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="canEdit" class="adm-inline-actions" style="margin-top: var(--sp-3)">
          <button type="button" class="btn btn--ghost btn--sm" @click="resetFiles">還原預設值</button>
        </div>
      </div>

      <div class="adm-card">
        <h2 class="adm-card__title">設定互相矛盾的頁面</h2>
        <p class="adm-field__hint" style="margin-bottom: var(--sp-3)">
          每一筆內容有兩格設定，是兩件不同的事：編輯畫面上方的<strong>「列入網站地圖」</strong>
          決定要不要主動把這一頁送給搜尋引擎；SEO 區塊的<strong>「不要被搜尋引擎收錄」</strong>
          則是叫搜尋引擎別收它。兩格都關是常見且正確的（例如標籤頁：不主動送、也不希望被收）；
          <strong>但兩格都開就自相矛盾</strong>——送出去了，同一頁卻又標著別收。下面只列這種矛盾的組合。
        </p>
        <div v-if="snapshotLoading" class="adm-loading">
          <span class="adm-spinner" aria-hidden="true"></span>
          <span>載入中…</span>
        </div>
        <div v-else-if="!consistencyIssues.length" class="adm-empty">
          <div class="adm-empty__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.5 2.5L16 9.5" /></svg>
          </div>
          <p class="adm-empty__title">沒有發現矛盾的設定</p>
          <p class="adm-empty__desc">目前所有內容的這兩格設定都彼此一致，不需要處理。</p>
        </div>
        <div v-else class="adm-table-wrap">
          <table class="adm-table">
            <thead><tr><th>單元</th><th>標題</th><th>網址</th><th>問題</th><th></th></tr></thead>
            <tbody>
              <tr v-for="issue in consistencyIssues" :key="`${issue.unit}-${issue.id}`">
                <td>{{ UNIT_REGISTRY[issue.unit]?.label ?? issue.unit }}</td>
                <td>{{ issue.title }}</td>
                <td class="is-wrap">{{ issue.urlPath }}</td>
                <td class="is-wrap">{{ issue.reason }}</td>
                <td><RouterLink class="btn btn--ghost btn--sm" :to="`/${issue.unit}/${issue.id}`">前往修正</RouterLink></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="adm-card">
        <h2 class="adm-card__title">robots.txt</h2>
        <p class="adm-field__hint" style="margin-bottom: var(--sp-3)">
          這個檔案是給搜尋引擎與 AI 爬蟲看的規則，網址是 <code>/robots.txt</code>，任何人都看得到。
          最後更新：{{ robotsUpdatedAt ? new Date(robotsUpdatedAt).toLocaleString('zh-TW') : '—' }}。
          ⚠️ 兩件事<strong>不要做</strong>：不要在這裡寫後台網址（等於公告後台在哪，後台本來就已經擋住了）；
          不要擋 AI 爬蟲，讓 AI 讀得到本來就是這次改版要的。不確定就別改，先問工程端。
        </p>
        <textarea v-model="robotsText" class="adm-textarea adm-textarea--tall" :readonly="!canEdit" spellcheck="false"></textarea>

        <p v-if="robotsWarning" class="adm-risk-hit" style="margin-top: var(--sp-2)">{{ robotsWarning }}</p>
        <label v-if="robotsWarning && canEdit" class="adm-checkbox" style="margin-top: var(--sp-2)">
          <input v-model="robotsAckWarning" type="checkbox"> 我了解上面的風險，仍要照這樣儲存
        </label>

        <p v-if="robotsSavedMsg" class="adm-alert adm-alert--success" style="margin-top: var(--sp-2)">{{ robotsSavedMsg }}</p>

        <div v-if="canEdit" class="adm-inline-actions" style="margin-top: var(--sp-3)">
          <!-- ⚠️ robots.txt 讀不回來時鎖住儲存：那個空白的 textarea 存下去，
               就是把全站的爬蟲規則清成空的（docs/03 §1）。 -->
          <button
            type="button"
            class="btn btn--primary"
            :disabled="robotsSaving || robotsLoadFailed || (Boolean(robotsWarning) && !robotsAckWarning)"
            @click="saveRobots"
          >
            {{ robotsSaving ? '儲存中…' : '儲存' }}
          </button>
          <span v-if="robotsLoadFailed" class="adm-muted">目前的內容沒有從伺服器讀回來，請重新整理後再編輯。</span>
          <button type="button" class="btn btn--ghost" @click="resetRobots">還原預設內容</button>
        </div>
      </div>
    </template>
  </section>
</template>
