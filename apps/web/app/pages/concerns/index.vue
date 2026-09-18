<script setup lang="ts">
// 模板 9 —— 困擾總覽（mockup/13-concern-overview.html）
import { getConcerns, getConcernTreatmentCategories, getConcernOverviewArticles } from '~/data/concerns'

const [CONCERNS, CONCERN_TREATMENT_CATEGORIES, CONCERN_OVERVIEW_ARTICLES] = await Promise.all([
  getConcerns(), getConcernTreatmentCategories(), getConcernOverviewArticles(),
])

usePageHead({
  title: '肌膚困擾',
  description:
    '依八個常見肌膚困擾整理成因、判斷指引與可能的處理方向：痘痘粉刺、敏感肌、斑點色素沉澱、抗老緊緻、生髮落髮、除毛、多汗狐臭與一般皮膚疾病。',
  pageCss: '/assets/pages/13-concern-overview.css',
  path: '/concerns/',
  jsonLd: breadcrumbJsonLd([
    { label: '首頁', href: '/' },
    { label: '肌膚困擾', href: '/concerns/' },
  ]),
})
</script>

<template>
  <!-- =====================================================================
       麵包屑
       ===================================================================== -->
  <nav class="c-breadcrumb" aria-label="麵包屑">
    <div class="container">
      <ol class="c-breadcrumb__list">
        <li><a href="/">首頁</a></li>
        <li><span class="c-breadcrumb__current" aria-current="page">肌膚困擾</span></li>
      </ol>
    </div>
  </nav>

  <!-- =====================================================================
       1. Hero
       ===================================================================== -->
  <section class="cov-hero">
    <div class="container cov-hero__layout">
      <div class="cov-hero__copy">
        <span class="u-eyebrow">SKIN CONCERNS</span>
        <h1 class="cov-hero__title">肌膚困擾</h1>
        <p class="cov-hero__lede">先看懂「臉上這個東西是什麼」，再談適合的療程方向。以下依八個常見困擾整理成因與判斷指引。</p>
      </div>
      <div class="cov-hero__media">
        <div class="cov-hero__frame">
          <img src="/assets/img/stock-bamboo-corridor.jpg" alt="木格柵長廊與竹意象" width="1800" height="1199">
        </div>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       2. 八大困擾入口（對應首頁八大專科）
       ===================================================================== -->
  <section class="section section--tight" id="concerns">
    <div class="container">
      <div class="cov-grid">
        <article v-for="concern in CONCERNS" :key="concern.slug" class="cov-entry">
          <!-- ⚠️ `v-if`：沒有對應圖檔時不渲染（見 data/_presentation.ts）。 -->
          <img
            v-if="concern.icon"
            class="cov-entry__icon"
            :src="concern.icon.src"
            :alt="concern.icon.alt"
            width="64"
            height="64"
            loading="lazy"
          >
          <div class="cov-entry__body">
            <h3 class="cov-entry__title"><a :href="`/concerns/${concern.slug}/`">{{ concern.title }}</a></h3>
            <p class="cov-entry__desc">{{ concern.overviewDesc }}</p>
            <div class="cov-entry__symptoms">
              <span v-for="tag in concern.overviewTags" :key="tag" class="c-tag">{{ tag }}</span>
            </div>
          </div>
        </article>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       3. 動線說明
       ===================================================================== -->
  <section class="section section--alt" id="how">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">WHERE TO START</span>
          <h2>從困擾到療程，三步</h2>
          <p>順序反過來——先挑儀器再猜適不適合——通常會多繞一段路。</p>
        </div>
      </div>

      <div class="grid grid--3">
        <article class="cov-step">
          <span class="cov-step__no">STEP 01</span>
          <h3>先確認困擾類型</h3>
          <p>同樣是「臉上有斑」，曬斑與肝斑的處理方向完全不同。困擾頁會說明各類型的差異與自我判斷的重點。</p>
        </article>
        <article class="cov-step">
          <span class="cov-step__no">STEP 02</span>
          <h3>看有哪些對應方向</h3>
          <p>每個困擾頁都列出可能的處理方向與對應療程，並說明各自的差別，作為面診前的基本認識。</p>
        </article>
        <article class="cov-step">
          <span class="cov-step__no">STEP 03</span>
          <h3>由醫師面診確認</h3>
          <p>實際是哪一種狀況、適不適合處理、需要幾次，需要醫師親自檢視後才能判斷。</p>
        </article>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       4. 對應療程分類
       ===================================================================== -->
  <section class="section" id="treatments">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">TREATMENTS</span>
          <h2>已經知道方向了？</h2>
          <p>直接從療程分類進入，查看各項目的作用方式、恢復期與注意事項。</p>
        </div>
        <a class="c-sechead__more" href="/treatments/">查看全部 27 項療程 →</a>
      </div>

      <div class="grid grid--4">
        <article v-for="cat in CONCERN_TREATMENT_CATEGORIES" :key="cat.href" class="c-card c-card--treatment">
          <div class="c-card__media">
            <img :src="cat.image.src" :alt="cat.image.alt" :width="cat.image.width" :height="cat.image.height" loading="lazy">
          </div>
          <div class="c-card__body">
            <h3 class="c-card__title"><a :href="cat.href">{{ cat.label }}</a></h3>
            <p class="c-card__excerpt">{{ cat.excerpt }}</p>
          </div>
        </article>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       5. 延伸閱讀
       ===================================================================== -->
  <section class="section section--alt" id="articles">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">RELATED ARTICLES</span>
          <h2>延伸閱讀</h2>
          <p>由院內醫師與編輯部共同確認的衛教內容。</p>
        </div>
        <a class="c-sechead__more" href="/blog/">查看全部文章 →</a>
      </div>

      <div class="grid grid--3">
        <article v-for="article in CONCERN_OVERVIEW_ARTICLES" :key="article.title" class="c-card c-card--article">
          <div class="c-card__media">
            <img
              :src="article.image.src"
              :alt="article.image.alt"
              :width="article.image.width"
              :height="article.image.height"
              loading="lazy"
            >
          </div>
          <div class="c-card__body">
            <span class="c-tag c-card__tag">{{ article.tag }}</span>
            <h3 class="c-card__title"><a :href="article.href">{{ article.title }}</a></h3>
            <div class="c-card__meta">
              <span v-for="m in article.meta" :key="m">{{ m }}</span>
            </div>
          </div>
        </article>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       6. 頁尾 CTA 區
       ===================================================================== -->
  <section class="section cov-cta">
    <div class="container cov-cta__box">
      <div class="cov-cta__text">
        <span class="u-eyebrow">NOT SURE WHERE TO START</span>
        <h2>對不上任何一類？直接來門診</h2>
        <p>症狀不典型、或同時有多個困擾，都建議直接由醫師看診判斷。</p>
      </div>
      <div class="cov-cta__actions">
        <a class="btn btn--primary ext" href="https://booking.20skin.tw/MainMs/Login" target="_blank" rel="noopener external">立即預約</a>
        <a class="btn btn--line" href="/faq/">看常見問題</a>
      </div>
    </div>
  </section>
</template>
