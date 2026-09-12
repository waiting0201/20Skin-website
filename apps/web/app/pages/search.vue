<script setup lang="ts">
// 模板 19 —— 搜尋結果（mockup/19-search.html）
//
// 站內搜尋是**建置期產生的索引 ＋ client 端比對**（docs/09-frontend.md §4）。
// 索引由 `scripts/build-search-index.mjs` 從 `content/*.json` 產生 ——
// 與頁面渲染同一份資料，所以不會出現「搜尋得到、點進去 404」。
//
// ⚠️ **索引是獨立的 `/search-index.json`，不內聯進 bundle。** 文章有約 800 篇，
//    內聯等於讓每一個訪客都下載整份索引，而絕大多數人不會用搜尋。
//
// ⚠️ **中文不斷詞，用子字串比對。** 站內這個量級（約 950 筆）夠用，
//    而斷詞器對醫療專有名詞切得很差（「皮秒雷射」→「皮」「秒」「雷射」）。
//
// ⚠️ 這一頁 `noIndex` —— 結果依網址參數而變，不該進索引（robots 也擋了 /search/）。
import { SEARCH_SUGGESTIONS } from '~/data/pages'

interface IndexEntry {
  /** 型別標籤（療程／文章／常見問題…） */
  t: string
  /** 網址 */
  u: string
  /** 標題 */
  ti: string
  /** 摘要 */
  ex: string
  /** 比對用的小寫全文 */
  k: string
}

const route = useRoute()
const query = computed(() => (typeof route.query.q === 'string' ? route.query.q.trim() : ''))

usePageHead({
  title: '搜尋結果',
  description: '站內搜尋，涵蓋療程、文章、醫師、肌膚困擾與常見問題。',
  pageCss: '/assets/pages/19-search.css',
  path: '/search/',
  noIndex: true,
  jsonLd: breadcrumbJsonLd([
    { label: '首頁', href: '/' },
    { label: '搜尋結果', href: '/search/' },
  ]),
})

const index = ref<IndexEntry[]>([])
const loading = ref(false)
const loadFailed = ref(false)
const activeType = ref('')

// ⚠️ 索引只抓一次，而且只在**真的有關鍵字**時才抓 —— 空著進來的人不需要付這 48 KB。
async function loadIndex() {
  if (index.value.length > 0 || loading.value) return
  loading.value = true
  try {
    const data = await $fetch<{ entries: IndexEntry[] }>('/search-index.json')
    index.value = data?.entries ?? []
  } catch {
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}

const matches = computed<IndexEntry[]>(() => {
  const q = query.value.toLowerCase()
  if (!q || index.value.length === 0) return []
  return index.value
    .filter((e) => e.k.includes(q))
    // 標題命中的排前面 —— 搜「皮秒雷射」時那個療程頁應該在第一個，
    // 而不是某篇剛好提到它的文章。
    .sort((a, b) => Number(b.ti.toLowerCase().includes(q)) - Number(a.ti.toLowerCase().includes(q)))
})

/** 型別 → 筆數，給篩選 tab 用。維持索引裡的出現順序，不另外排。 */
const typeCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const m of matches.value) counts.set(m.t, (counts.get(m.t) ?? 0) + 1)
  return [...counts.entries()]
})

const visible = computed(() =>
  activeType.value ? matches.value.filter((m) => m.t === activeType.value) : matches.value)

/**
 * 把命中的關鍵字包成 <mark>（mockup 的結果摘要就是這樣呈現的）。
 * ⚠️ 先逸出 HTML 再插入標記 —— 摘要來自資料庫，直接 v-html 等於開了一個 XSS 入口。
 */
function highlight(text: string): string {
  const escaped = text.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
  const q = query.value
  if (!q) return escaped
  const needle = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return escaped.replace(new RegExp(needle, 'gi'), (hit) => `<mark>${hit}</mark>`)
}

/** 顯示用的路徑（mockup 的 search-result__path 長這樣）。 */
function displayPath(url: string): string {
  return `20skin.tw${url}`
}

/**
 * 查無結果時把這句查詢回寫題庫（`POST /questions/miss`，docs/10 §3.1、docs/08 §F）。
 *
 * 🔴 **只寫問題文字本身**，不帶任何可回連到送出者的欄位 —— 這是題庫成長的工作清單，
 *    不是搜尋日誌。去重與正規化都在伺服器端做。
 *
 * ⚠️ **失敗一律靜默。** 這是背景的內容分析，不是使用者要求的動作 ——
 *    它對公網開放，所以有頻率限制（同一個 IP 每小時 10 次），搜得勤一點就會撞到 429。
 *    在畫面上顯示那個錯誤只會讓訪客困惑。
 */
const reported = new Set<string>()
async function reportMiss(q: string) {
  if (!q || reported.has(q)) return
  reported.add(q)
  const { public: { apiBaseUrl } } = useRuntimeConfig()
  try {
    // ⚠️ 這裡取不到 token 也**照樣送**，與 `/contact/` 相反 —— 那邊取不到就要停下來
    //    並告訴使用者，因為送出失敗會讓病人以為詢問已經送到。這裡送不成功只是
    //    少一筆題庫資料，使用者完全不需要知道。
    const botCheckToken = await useBotCheck().getToken('questions-miss')
    await $fetch(`${apiBaseUrl}/questions/miss`, {
      method: 'POST',
      body: { questionText: q, source: 'search', botCheckToken },
      ignoreResponseError: true,
    })
  } catch {
    // 靜默（理由見上）。
  }
}

onMounted(() => {
  if (query.value) void loadIndex()
})

watch(query, (q) => {
  activeType.value = ''
  if (q) void loadIndex()
})

// 索引載入完、且確定沒有結果時才回報 —— 載入中就回報會把每一次搜尋都算成未命中。
watch([matches, loading, query], ([list, isLoading, q]) => {
  if (!isLoading && q && index.value.length > 0 && list.length === 0) void reportMiss(q)
})
</script>

<template>
  <!-- 麵包屑 -->
  <nav class="c-breadcrumb" aria-label="麵包屑">
    <div class="container">
      <ol class="c-breadcrumb__list">
        <li><a href="/">首頁</a></li>
        <li><span class="c-breadcrumb__current" aria-current="page">搜尋結果</span></li>
      </ol>
    </div>
  </nav>

  <!-- 1. Hero ＋ 搜尋框 -->
  <section class="search-hero">
    <div class="container--narrow search-hero__inner">
      <span class="u-eyebrow">SEARCH</span>
      <h1 class="search-hero__title">搜尋結果</h1>

      <form class="search-hero__form" action="/search/" method="get" role="search">
        <label class="visually-hidden" for="siteQuery">搜尋站內內容</label>
        <input class="search-hero__input" id="siteQuery" name="q" type="search"
               :value="query" autocomplete="off" placeholder="輸入關鍵字">
        <button class="btn btn--primary" type="submit">搜尋</button>
      </form>

      <div v-if="query" class="search-hero__stat">
        <span class="search-hero__stat-num">{{ loading ? '⋯' : matches.length }}</span>
        <p class="search-hero__stat-label">
          <template v-if="loading">載入索引中，關鍵字「<strong>{{ query }}</strong>」</template>
          <template v-else-if="loadFailed">載入搜尋索引失敗，請重新整理再試一次</template>
          <template v-else>筆結果，關鍵字「<strong>{{ query }}</strong>」，涵蓋療程、文章、醫師與常見問題</template>
        </p>
      </div>
    </div>
  </section>

  <!-- 2. 型別篩選 -->
  <section v-if="matches.length" class="search-filters">
    <div class="container--narrow">
      <nav class="c-tabs" aria-label="依內容型別篩選">
        <div class="c-tabs__list">
          <button class="c-tabs__btn" type="button" :aria-selected="activeType === ''" @click="activeType = ''">
            全部 {{ matches.length }}
          </button>
          <button v-for="[type, count] in typeCounts" :key="type" class="c-tabs__btn" type="button"
                  :aria-selected="activeType === type" @click="activeType = type">
            {{ type }} {{ count }}
          </button>
        </div>
      </nav>
    </div>
  </section>

  <!-- 3. 結果清單 -->
  <section v-if="visible.length" class="section section--tight" id="results">
    <div class="container container--narrow">
      <div class="search-list">
        <article v-for="hit in visible" :key="hit.u + hit.ti" class="search-result">
          <span class="search-result__type">{{ hit.t }}</span>
          <h2 class="search-result__title"><a :href="hit.u">{{ hit.ti }}</a></h2>
          <!-- eslint-disable-next-line vue/no-v-html -- 內容已在 highlight() 裡逸出，只插入 <mark> -->
          <p class="search-result__excerpt" v-html="highlight(hit.ex)"></p>
          <span class="search-result__path">{{ displayPath(hit.u) }}</span>
        </article>
      </div>
    </div>
  </section>

  <!-- 4. 找不到結果時 -->
  <section v-if="!loading && !matches.length" class="section section--alt section--tight" id="no-result">
    <div class="container container--narrow">
      <div class="search-empty">
        <h2 v-if="query">沒有找到「{{ query }}」的結果</h2>
        <h2 v-else>輸入關鍵字開始搜尋</h2>
        <p>可以試試以下方式：</p>
        <ul class="search-empty__list">
          <li>换成較短的關鍵字，例如療程或困擾的名稱</li>
          <li>改用症狀或困擾來找，例如「淚溝」「法令紋」</li>
          <li>費用相關的問題無法由站內搜尋回答，需於面診時說明</li>
        </ul>

        <p class="search-hero__summary">熱門搜尋：</p>
        <div class="search-suggest">
          <a v-for="term in SEARCH_SUGGESTIONS" :key="term" class="c-tag" :href="`/search/?q=${encodeURIComponent(term)}`">{{ term }}</a>
        </div>
      </div>
    </div>
  </section>

  <!-- 5. 其他入口 -->
  <section class="section" id="browse">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">BROWSE</span>
          <h2>用瀏覽的也可以</h2>
          <p>不確定關鍵字怎麼下時，從分類入口找通常比較快。</p>
        </div>
      </div>

      <div class="grid grid--4">
        <article class="search-browse">
          <h3><a href="/concerns/">肌膚困擾 →</a></h3>
          <p>從症狀開始找，八個常見困擾的成因與處理方向。</p>
        </article>
        <article class="search-browse">
          <h3><a href="/treatments/">專業服務 →</a></h3>
          <p>27 項療程的完整索引，依四個分類排列。</p>
        </article>
        <article class="search-browse">
          <h3><a href="/blog/">臻美分享 →</a></h3>
          <p>院內醫師與編輯部共同確認的衛教內容。</p>
        </article>
        <article class="search-browse">
          <h3><a href="/faq/">常見問題 →</a></h3>
          <p>門診最常被問到的問題，依主題分類。</p>
        </article>
      </div>
    </div>
  </section>
</template>
