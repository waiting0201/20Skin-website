<script setup lang="ts">
// FAQ／語料匯出（/export）—— 規格見 docs/04 §3、docs/06 §6、docs/07 §4。
//
// ⚠️ docs/07-deployment.md §4：「sitemap.xml／llms.txt 仍在建置期產生，產物
// 直接進 .output/public。走 API 產生反而更差」。這個畫面**只做預覽與下載**，
// 不會、也不該把結果發布到任何地方——正式產出時機是 CI 的 nuxt generate，
// 不是這裡的一顆按鈕。
//
// 🔴 預覽全文由 **API** 產生（`GET /admin/export/{kind}`），不是前端自己組。
//    同一份檔案在建置期由匯出腳本產生；前端若自己組一份，就有兩個產生器、兩套規則，
//    而且「預覽跟正式產物不一樣」不會有任何徵兆。
import { computed, onMounted, ref } from 'vue'
import { adminApi, ApiError } from '@/api/client'
import { currentUser } from '@/auth'
import { hasPermission } from '@/permissions'
import type { ExportKind, ExportPreview } from '@/api/seo'

const user = currentUser()
const permCtx = user ? { roles: user.roles, isSuperAdmin: user.isSuperAdmin } : null
const canView = computed(() => hasPermission(permCtx, 'settings.edit'))

type TabKey = ExportKind
const tabs: { key: TabKey; label: string; mime: string }[] = [
  { key: 'faq.json', label: 'faq.json', mime: 'application/json' },
  { key: 'llms.txt', label: 'llms.txt', mime: 'text/plain' },
  { key: 'llms-full.txt', label: 'llms-full.txt', mime: 'text/plain' },
]

const loading = ref(true)
const errorMessage = ref('')
const previews = ref<Partial<Record<TabKey, ExportPreview>>>({})
const activeTab = ref<TabKey>('faq.json')

async function loadAll() {
  loading.value = true
  errorMessage.value = ''
  try {
    const results = await Promise.all(tabs.map((tab) => adminApi.seo.export.preview(tab.key)))
    const next: Partial<Record<TabKey, ExportPreview>> = {}
    tabs.forEach((tab, index) => {
      next[tab.key] = results[index]
    })
    previews.value = next
  } catch (e) {
    errorMessage.value = e instanceof ApiError ? e.message : '載入預覽失敗。'
  } finally {
    loading.value = false
  }
}

onMounted(loadAll)

const activePreview = computed(() => previews.value[activeTab.value])
const activeText = computed(() => activePreview.value?.content ?? '')

function download(key: TabKey) {
  const tab = tabs.find((t) => t.key === key)
  const text = previews.value[key]?.content
  if (!tab || text === undefined) return
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

      <p v-if="errorMessage" class="adm-empty">{{ errorMessage }}</p>

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
          <span class="adm-muted">
            {{ activeText.length.toLocaleString('zh-TW') }} 字元<template v-if="activePreview">・{{ activePreview.itemCount }} 筆</template>
          </span>
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
