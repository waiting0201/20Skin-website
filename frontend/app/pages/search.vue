<script setup lang="ts">
// 模板 19 —— 搜尋結果（mockup/19-search.html）
//
// docs/09-frontend.md §4：站內搜尋是建置期產生的索引檔，在 client 端比對，
// 「現在還沒有索引檔」。這一頁只切版面、讀 `?q=` 顯示查詢字串，**不接 API、
// 也不假造搜尋結果**——mockup 示範的「8 筆結果」是設計稿用來說明排版的假資料，
// 照抄貼上會讓使用者以為搜尋真的動了，等同「假裝送出成功」的同一種問題，
// 所以這裡略過那個區塊與旁邊的假分類計數 tab，只留下：
//   1. 搜尋框（讀得到網址上的關鍵字）
//   2. 「找不到結果」狀態（mockup 原本就設計成一種展示狀態，現在是唯一誠實的狀態）
//   3. 分類瀏覽入口（純靜態，不依賴搜尋結果）
//
// TODO(docs/09-frontend.md §4)：串接 content/*.json 建置期索引後，
// 在這裡加入 client 端比對、渲染真正的結果列表與型別篩選 tab，
// 查無結果時改打 POST /questions/miss（docs/10-api.md §3.1）回寫未命中查詢。
import { SEARCH_SUGGESTIONS } from '~/data/pages'

const route = useRoute()
const query = computed(() => (typeof route.query.q === 'string' ? route.query.q : ''))

usePageHead({
  title: '搜尋結果',
  description: '站內搜尋，涵蓋療程、文章、醫師、肌膚困擾與常見問題。',
  pageCss: '/assets/pages/19-search.css',
  path: '/search/',
  // 查詢結果頁內容依網址參數而變、目前又還沒有真正的結果可排名，先不索引。
  noIndex: true,
  jsonLd: breadcrumbJsonLd([
    { label: '首頁', href: '/' },
    { label: '搜尋結果', href: '/search/' },
  ]),
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
        <span class="search-hero__stat-num">0</span>
        <p class="search-hero__stat-label">筆結果，關鍵字「<strong>{{ query }}</strong>」。站內搜尋索引尚未上線，暫時無法回傳結果</p>
      </div>
    </div>
  </section>

  <!-- 2. 找不到結果時（目前站內搜尋索引尚未上線，一律顯示這個狀態） -->
  <section class="section section--alt section--tight" id="no-result">
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

  <!-- 3. 其他入口 -->
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
