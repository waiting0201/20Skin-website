<script setup lang="ts">
// FAQ／語料匯出（/export）—— 規格見 docs/04 §3、docs/06 §6、docs/07 §4。
//
// ⚠️ docs/07-deployment.md §4：「sitemap.xml／llms.txt 仍在建置期產生，產物
// 直接進 .output/public。走 API 產生反而更差」。這個畫面**只做預覽與下載**，
// 不會、也不該把結果發布到任何地方——正式產出時機是 CI 的 nuxt generate，
// 不是這裡的一顆按鈕。權限只需要 setting.view（唯讀），沒有 setting.edit 的事。
import { computed, onMounted, ref } from 'vue'
import { adminApi } from '@/api/client'
import { currentUser } from '@/auth'
import { hasPermission } from '@/permissions'
import type { AdminRecord } from '@/types'
import type { FaqExportItem, SiteFactsForExport } from '@/api/seo'

const user = currentUser()
const permCtx = user ? { roles: user.roles, isSuperAdmin: user.isSuperAdmin } : null
const canView = computed(() => hasPermission(permCtx, 'setting.view'))

const loading = ref(true)
const faqs = ref<FaqExportItem[]>([])
const facts = ref<SiteFactsForExport>({ siteName: '20SKIN', tagline: '', keyFacts: [], sections: [] })
const totalFaqCount = ref(0)
const publishedFaqCount = ref(0)

/** 優先用「AI 摘要」欄位（每單元都有，SeoMeta.aiSummary，docs/03-seo-geo.md GEO 策略欄位）；
 * 目前 mock 內容多半還沒填，退而求其次用單元自己的一個文字欄位頂著，都沒有就老實說沒有。 */
function summaryFor(item: AdminRecord, fallbackKey?: string): string {
  if (item.seo.aiSummary) return item.seo.aiSummary
  const raw = fallbackKey ? item.fields[fallbackKey] : undefined
  if (typeof raw === 'string' && raw.trim()) {
    const plain = raw.replace(/\s+/g, ' ').trim()
    return plain.length > 100 ? `${plain.slice(0, 100)}…` : plain
  }
  return '（尚無摘要內容，待補——不編造字數湊版面。）'
}

async function loadFaqSection() {
  const res = await adminApi.content.list('faq', { pageSize: 100 })
  totalFaqCount.value = res.totalCount
  const published = res.items.filter((i) => i.status === 3)
  publishedFaqCount.value = published.length
  faqs.value = published.map((i) => ({
    id: i.id,
    question: i.title,
    categoryLabel: String(i.fields.categoryTermSeedKey__label ?? '未分類'),
    aiSummary: String(i.fields.aiAnswer ?? ''),
    webAnswer: String(i.fields.webAnswer ?? ''),
    urlPath: '/faq/', // FAQ 不產生獨立網址，統一指回 FAQ 主頁（docs/08 §C-6）
    updatedAt: String(i.fields.lastReviewedOn ?? i.updatedAt),
  }))
}

async function loadFacts() {
  const [treatments, concerns, doctors, clinics] = await Promise.all([
    adminApi.content.list('treatment', { pageSize: 100 }),
    adminApi.content.list('concern', { pageSize: 100 }),
    adminApi.content.list('doctor', { pageSize: 100 }),
    adminApi.content.list('clinic', { pageSize: 100 }),
  ])
  const published = (items: AdminRecord[]) => items.filter((i) => i.status === 3)

  facts.value = {
    siteName: '20SKIN 美醫集團',
    tagline: '站內知識庫語料預覽——供 AI FAQ／GEO 用途，內容取自目前已發布的資料。',
    keyFacts: [
      `已發布療程 ${published(treatments.items).length} 項`,
      `困擾說明頁 ${published(concerns.items).length} 則`,
      `醫師／團隊成員 ${published(doctors.items).length} 位`,
      `服務據點 ${published(clinics.items).length} 處`,
      `FAQ 題目 ${publishedFaqCount.value} 則（題庫共 ${totalFaqCount.value} 則，僅已發布會輸出）`,
    ],
    sections: [
      { title: '療程', items: published(treatments.items).map((t) => ({ title: t.title, url: t.urlPath, summary: summaryFor(t, 'subtitle') })) },
      { title: '困擾', items: published(concerns.items).map((c) => ({ title: c.title, url: c.urlPath, summary: summaryFor(c, 'symptoms') })) },
      { title: '醫師與團隊', items: published(doctors.items).map((d) => ({ title: d.title, url: d.urlPath, summary: summaryFor(d, 'jobTitle') })) },
      { title: '據點', items: published(clinics.items).map((c) => ({ title: c.title, url: c.urlPath, summary: summaryFor(c, 'address') })) },
    ],
  }
}

async function loadAll() {
  loading.value = true
  // ⚠️ 依序執行，不要用 Promise.all 平行——loadFacts() 的 keyFacts 會讀
  // publishedFaqCount／totalFaqCount，這兩個由 loadFaqSection() 寫入。
  await loadFaqSection()
  await loadFacts()
  loading.value = false
}

onMounted(loadAll)

const faqJsonText = computed(() => adminApi.seo.export.buildFaqJson(faqs.value))
const llmsTxtText = computed(() => adminApi.seo.export.buildLlmsTxt(facts.value))
const llmsFullTxtText = computed(() => adminApi.seo.export.buildLlmsFullTxt(facts.value, faqs.value))

type TabKey = 'faq.json' | 'llms.txt' | 'llms-full.txt'
const activeTab = ref<TabKey>('faq.json')
const tabs: { key: TabKey; label: string; mime: string }[] = [
  { key: 'faq.json', label: 'faq.json', mime: 'application/json' },
  { key: 'llms.txt', label: 'llms.txt', mime: 'text/plain' },
  { key: 'llms-full.txt', label: 'llms-full.txt', mime: 'text/plain' },
]

const activeText = computed(() => {
  if (activeTab.value === 'faq.json') return faqJsonText.value
  if (activeTab.value === 'llms.txt') return llmsTxtText.value
  return llmsFullTxtText.value
})

function download(key: TabKey) {
  const tab = tabs.find((t) => t.key === key)
  if (!tab) return
  const text = key === 'faq.json' ? faqJsonText.value : key === 'llms.txt' ? llmsTxtText.value : llmsFullTxtText.value
  const blob = new Blob([text], { type: `${tab.mime};charset=utf-8;` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = key
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <section class="adm-page">
    <div class="adm-page__head">
      <div>
        <h1 class="adm-page__title">FAQ／語料匯出</h1>
        <p class="adm-page__desc">預覽 faq.json／llms.txt／llms-full.txt，內容即時取自目前已發布的資料</p>
      </div>
      <div class="adm-page__actions">
        <button type="button" class="btn btn--ghost" :disabled="loading" @click="loadAll">重新整理</button>
      </div>
    </div>

    <p v-if="!canView" class="adm-empty">沒有檢視這個畫面的權限。</p>

    <template v-else>
      <div class="adm-card">
        <p class="ex-note">
          <strong>這個畫面只做預覽與下載。</strong>
          正式的 <code>faq.json</code>／<code>llms.txt</code>／<code>llms-full.txt</code> 是在建置期（<code>nuxt generate</code>）
          自動產生、隨前台一起部署（docs/07-deployment.md §4）——不是在這裡按一顆按鈕就會發布到網站上。
          這裡的用途是讓你在內容還沒 merge、還沒跑一次完整建置之前，先看到「如果現在建置，語料檔會長什麼樣子」。
        </p>
      </div>

      <div v-if="loading" class="adm-empty">載入中…</div>

      <template v-else>
        <div class="adm-filters" style="border: 0; padding: 0">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            type="button"
            class="btn btn--sm"
            :class="activeTab === tab.key ? 'btn--primary' : 'btn--line'"
            @click="activeTab = tab.key"
          >
            {{ tab.label }}
          </button>
          <div class="adm-filters__spacer"></div>
          <span class="adm-muted">{{ activeText.length.toLocaleString('zh-TW') }} 字元</span>
          <button type="button" class="btn btn--primary btn--sm" @click="download(activeTab)">下載 {{ activeTab }}</button>
        </div>

        <div class="adm-card">
          <pre class="ex-preview">{{ activeText }}</pre>
        </div>
      </template>
    </template>
  </section>
</template>

<style scoped>
.ex-note { font-size: var(--fs-sm); color: var(--ink-70); line-height: 1.8; }
.ex-note code { background: var(--surface-alt); padding: .1em .4em; border-radius: 4px; font-size: .95em; }
.ex-preview {
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: var(--fs-xs);
  line-height: 1.7;
  max-height: 60vh;
  overflow-y: auto;
  margin: 0;
}
</style>
