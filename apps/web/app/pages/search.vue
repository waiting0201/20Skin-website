<script setup lang="ts">
// 模板 19 —— 搜尋結果（mockup/19-search.html）
//
// 站內搜尋**在伺服器端比對**（`GET /search`，docs/09-frontend.md §4）。
//
// 🔴 **2026-09-16 改掉了「建置期索引 ＋ client 端比對」。** 舊做法有兩個問題，
//    第二個才是換掉它的真正理由：
//    ① 那份 `/search-index.json` 有 **564 KB**，每個用搜尋的人都要先下載整份；
//    ② 🔴 它是**建置期**產物 —— 全站改 SSR 之後，它是唯一還需要等重新建置才會更新的東西。
//       院方發布一篇新文章，站內搜尋卻搜不到，而畫面上不會有任何徵兆。
//
// ⚠️ **比對範圍因此變大了，這是好事。** 舊索引的比對欄位只存了「標題＋摘要＋內文」的
//    **前 600 字**，超過的部分搜不到。改成 API 之後比對整份已核准快照 ——
//    2026-09-16 實測「皮秒雷射」由 71 筆變成 309 筆，且舊索引找得到的 **全部涵蓋**。
//
// ⚠️ **中文不斷詞，用子字串比對**（`LIKE`）。站內這個量級（約 1228 筆）夠用，
//    而斷詞器對醫療專有名詞切得很差（「皮秒雷射」→「皮」「秒」「雷射」）。
//
// ⚠️ 這一頁 `noIndex` —— 結果依網址參數而變，不該進索引（robots 也擋了 /search/）。
import { SEARCH_SUGGESTIONS } from '~/data/pages'
import { searchSite, type SearchHit } from '~/composables/useContentApi'

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

const activeType = ref('')

// ⚠️ **key 帶著關鍵字** —— 少了它，換一個關鍵字時 Nuxt 會沿用上一次的快取結果。
// ⚠️ 空關鍵字不打 API（`searchSite` 自己擋掉），所以直接進 /search/ 的人不會產生查詢。
//
// 排序（標題命中優先）在 API 那端做，前端不要再排一次 —— 兩份排序規則遲早會不一樣。
const { data: result, status } = await useAsyncData(
  () => `search:${query.value}`,
  () => searchSite(query.value),
  { watch: [query], default: () => ({ ok: true, hits: [] as SearchHit[] }) },
)

const loading = computed(() => status.value === 'pending')
const loadFailed = computed(() => result.value?.ok === false)
const matches = computed<SearchHit[]>(() => result.value?.hits ?? [])

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
    const botCheckToken = await useBotCheck().getToken('questions_miss')
    await $fetch(`${apiBaseUrl}/questions/miss`, {
      method: 'POST',
      body: { questionText: q, source: 'search', botCheckToken },
      ignoreResponseError: true,
    })
  } catch {
    // 靜默（理由見上）。
  }
}

watch(query, () => {
  activeType.value = ''
})

// 🔴 **只有「API 正常回應、而且真的零筆」才回報**（`res.ok` 那個條件缺不得）——
//    連不上時回報等於把故障寫成一堆假的未命中問題，理由見 `reportMiss` 的註解。
// ⚠️ 還在查詢中不回報，否則每一次搜尋都會先被算成未命中。
// ⚠️ 只在 client 端回報 —— SSR 期間送這個請求，來源 IP 會是伺服器，
//    頻率限制會把整站的搜尋算成同一個人。
watch([result, status, query], ([res, s, q]) => {
  if (import.meta.server) return
  if (s === 'pending' || !q) return
  if (res?.ok && res.hits.length === 0) void reportMiss(q)
}, { immediate: true })
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
          <template v-else-if="loadFailed">搜尋服務暫時無法連線，請稍後再試一次</template>
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
        <!-- ⚠️ 連不上時**不可以**說「沒有找到結果」—— 那是在替故障背書，
             而且訪客會以為站內真的沒有這個東西而離開。 -->
        <h2 v-if="loadFailed">搜尋暫時無法使用</h2>
        <h2 v-else-if="query">沒有找到「{{ query }}」的結果</h2>
        <h2 v-else>輸入關鍵字開始搜尋</h2>
        <p v-if="loadFailed">請稍後重新整理再試一次，或改用下面的分類入口瀏覽。</p>
        <p v-else>可以試試以下方式：</p>
        <ul v-if="!loadFailed" class="search-empty__list">
          <li>换成較短的關鍵字，例如療程或困擾的名稱</li>
          <li>改用症狀或困擾來找，例如「淚溝」「法令紋」</li>
          <li>費用相關的問題無法由站內搜尋回答，需於面診時說明</li>
        </ul>

        <!-- 搜尋掛掉時不給熱門搜尋 —— 那些連結全部指回這一頁，點了還是壞的。
             此時有用的替代路徑是下一區的分類入口。 -->
        <p v-if="!loadFailed" class="search-hero__summary">熱門搜尋：</p>
        <div v-if="!loadFailed" class="search-suggest">
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
          <!-- ⚠️ 不寫項數：這一頁沒有療程資料，而寫死的數字會過期（09-14 的 27→28）。 -->
          <p>全部療程的完整索引，依分類排列。</p>
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
