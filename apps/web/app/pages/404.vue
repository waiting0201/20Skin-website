<script setup lang="ts">
// 模板 20 —— 404（mockup/20-404.html）
//
// 這一頁是「把 mockup 搬進 Nuxt」的參考範例，新增其他頁面時照這個形狀寫：
//   1. usePageHead() 掛標題／描述／canonical／該頁的 mockup 樣式
//   2. <template> 的標記逐字照抄 mockup 的 <main id="main"> 內容
//   3. 只把 NN-xxx.html 換成 docs/01-sitemap.md 的正式網址
//   4. 需要重複的區塊改成 v-for，資料抽到 script 或 ~/data
//   5. **不寫任何 <style>** —— 樣式一律來自 mockup，由 verify:css 把關
//
// 404 沒有麵包屑（這一頁不在資訊架構的任何位置上），也沒有 JSON-LD。
usePageHead({
  title: '找不到頁面',
  description:
    '你要找的頁面不存在或已移動。網站於 2026 年改版，部分網址已調整，可使用站內搜尋或從主要入口重新尋找。',
  pageCss: '/assets/pages/20-404.css',
  path: '/404',
  noIndex: true,
})

const entries = [
  { href: '/concerns/', label: '肌膚困擾', desc: '八個常見困擾的成因、判斷指引與對應方向。' },
  { href: '/treatments/', label: '專業服務', desc: '27 項療程的完整索引，依四個分類排列。' },
  { href: '/team/', label: '醫療團隊', desc: '14 位成員的專長、看診院區與具名文章。' },
  { href: '/blog/', label: '臻美分享', desc: '醫美新知、皮膚新知、媒體報導與演講授課。' },
  { href: '/cases/', label: '案例分享', desc: '個案紀錄，含條件、次數與時間區間。' },
  { href: '/faq/', label: '常見問題', desc: '門診最常被問到的問題，依主題分類。' },
  { href: '/clinics/', label: '診所據點', desc: '兩個院區的門診時段、位置與就診流程。' },
  { href: '/about/', label: '品牌理念', desc: '新中式美學與新中式美學的完整說明。' },
]
</script>

<template>
  <!-- =====================================================================
       1. 主訊息（沒有麵包屑 —— 這一頁不在資訊架構的任何位置上）
       左文右圖，圖為非療效意象圖
       ===================================================================== -->
  <section class="nf-hero">
    <div class="container nf-hero__layout">
      <div class="nf-hero__copy">
        <p class="nf-hero__code">4<span>0</span>4</p>
        <h1 class="nf-hero__title">這個頁面找不到了</h1>
        <p class="nf-hero__lede">網站於 2026 年改版，部分網址已調整。多數舊網址會自動導向新位置，也可以用下方搜尋，或從主要入口重新找。</p>

        <form class="nf-search" action="/search/" method="get" role="search">
          <label class="visually-hidden" for="nfQuery">搜尋站內內容</label>
          <input
            class="nf-search__input"
            id="nfQuery"
            name="q"
            type="search"
            autocomplete="off"
            placeholder="輸入關鍵字，例如：皮秒雷射"
          >
          <button class="btn btn--primary" type="submit">搜尋</button>
        </form>

        <div class="nf-actions">
          <a class="btn btn--ghost" href="/">回首頁</a>
          <a class="btn btn--line" href="/contact/">聯絡我們</a>
        </div>
      </div>
      <div class="nf-hero__media">
        <img src="/assets/img/stock-zen-garden.jpg" alt="枯山水庭園意象" width="1800" height="1199">
      </div>
    </div>
  </section>

  <!-- =====================================================================
       2. 主要入口
       ===================================================================== -->
  <section class="section section--alt" id="entries">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">WHERE TO GO</span>
          <h2>你要找的可能在這裡</h2>
        </div>
      </div>

      <div class="grid grid--4">
        <article v-for="entry in entries" :key="entry.href" class="nf-entry">
          <h3><a :href="entry.href">{{ entry.label }} →</a></h3>
          <p>{{ entry.desc }}</p>
        </article>
      </div>
    </div>
  </section>
</template>
