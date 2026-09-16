<script setup lang="ts">
// 模板 6 —— 療程總覽（mockup/12-treatment-overview.html）
//
// 搬法見 app/pages/404.vue 開頭的註解與 frontend/README.md。
// 資料抽到 ~/data/treatments.ts，形狀對齊 docs/08-database.md §C-1／§C-9。
import { getTreatmentCategories, getTreatments } from '~/data/treatments'

const [treatmentCategories, treatments] = await Promise.all([getTreatmentCategories(), getTreatments()])

usePageHead({
  title: '專業服務',
  description:
    '27 項療程分為光療美顏、光電美容、微針美容、醫美保養四個分類。已知道方向可直接查索引，不確定則建議先從肌膚困擾查詢症狀。',
  pageCss: '/assets/pages/12-treatment-overview.css',
  path: '/treatments/',
  jsonLd: breadcrumbJsonLd([
    { label: '首頁', href: '/' },
    { label: '專業服務', href: '/treatments/' },
  ]),
})

// 8 個困擾 slug 已定案（docs/01-sitemap.md §1）
const concerns = [
  { label: '痘痘・粉刺', href: '/concerns/acne/' },
  { label: '敏感肌', href: '/concerns/sensitive-skin/' },
  { label: '斑點・色素沉澱', href: '/concerns/pigmentation/' },
  { label: '抗老・緊緻', href: '/concerns/anti-aging/' },
  { label: '生髮・落髮', href: '/concerns/hair-loss/' },
  { label: '除毛', href: '/concerns/hair-removal/' },
  { label: '多汗・狐臭', href: '/concerns/hyperhidrosis/' },
  { label: '一般皮膚疾病', href: '/concerns/dermatology/' },
]

const processSteps = [
  { no: 'STEP 01', title: '預約與諮詢', desc: '線上預約後，由諮詢人員了解需求、生活型態與可接受的恢復期。' },
  { no: 'STEP 02', title: '醫師面診', desc: '檢視膚況、病史與用藥情形，確認哪些項目適合、哪些需要暫緩。' },
  { no: 'STEP 03', title: '療程施作', desc: '由醫師執行，過程中依實際反應調整強度與範圍。' },
  { no: 'STEP 04', title: '術後照護與回診', desc: '依衛教說明照護，回診時由醫師評估恢復狀況與後續規劃。' },
]

const faqs = [
  {
    q: '第一次來，需要先決定做哪一項嗎？',
    a: '不需要。多數人第一次來是帶著困擾而非特定療程，會先由醫師面診評估，再討論可行方向與優先順序。',
  },
  {
    q: '同一天可以做多項療程嗎？',
    a: '視項目組合與膚況而定，部分項目原理上會互相影響，是否合併需由醫師當次評估決定。',
  },
  {
    q: '療程費用怎麼計算？',
    a: '費用依項目、範圍與次數而定，將於面診後由醫師與服務人員說明完整規劃內容。',
  },
]
</script>

<template>
  <!-- =====================================================================
       麵包屑
       ===================================================================== -->
  <nav class="c-breadcrumb" aria-label="麵包屑">
    <div class="container">
      <ol class="c-breadcrumb__list">
        <li><a href="/">首頁</a></li>
        <li><span class="c-breadcrumb__current" aria-current="page">專業服務</span></li>
      </ol>
    </div>
  </nav>

  <!-- =====================================================================
       1. Hero
       ===================================================================== -->
  <section class="tov-hero">
    <div class="container tov-hero__layout">
      <div class="tov-hero__copy">
        <span class="u-eyebrow">TREATMENTS</span>
        <h1 class="tov-hero__title">專業服務</h1>
        <p class="tov-hero__lede">27 項療程分為四個分類。已經知道方向可直接從索引進入；還不確定，建議先從「肌膚困擾」查詢症狀。</p>
      </div>
      <div class="tov-hero__media">
        <div class="tov-hero__frame">
          <img src="/assets/img/photo-facade-detail.jpg" alt="四季診所白磚立面與招牌" width="1800" height="1167">
        </div>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       2. 四大分類
       ===================================================================== -->
  <section class="section section--tight" id="categories">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">CATEGORIES</span>
          <h2>四個分類</h2>
          <p>依作用方式區分，同一個困擾可能同時對應不同分類的項目。</p>
        </div>
      </div>

      <div class="tov-cats">
        <article v-for="(cat, i) in treatmentCategories" :key="cat.slug" class="tov-cat">
          <div class="tov-cat__media">
            <img :src="cat.image.src" :alt="cat.image.alt" :width="cat.image.width" :height="cat.image.height" loading="lazy">
          </div>
          <div class="tov-cat__copy">
            <span class="tov-cat__no">{{ String(i + 1).padStart(2, '0') }}</span>
            <h3>{{ cat.name }}</h3>
            <p>{{ cat.lede }}</p>
            <div class="tov-cat__items">
              <span v-for="tag in cat.sampleTags" :key="tag" class="c-tag">{{ tag }}</span>
            </div>
            <p class="tov-cat__count">共 {{ cat.count }} 項</p>
            <a class="tov-cat__more" :href="`/treatments/${cat.slug}/`">查看{{ cat.name }} →</a>
          </div>
        </article>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       3. 全項目索引（27 項）
       ===================================================================== -->
  <section class="section section--alt" id="all">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">ALL TREATMENTS</span>
          <h2>全部 27 項</h2>
          <p>依分類排列的完整索引，點擊項目可進入該療程的細節頁。</p>
        </div>
      </div>

      <div class="tov-index">
        <div v-for="cat in treatmentCategories" :key="cat.slug" class="tov-index__group">
          <h3><a :href="`/treatments/${cat.slug}/`">{{ cat.name }}</a></h3>
          <ul class="tov-index__list">
            <li v-for="t in treatments.filter((x) => x.categorySlug === cat.slug)" :key="t.slug">
              <a :href="`/treatments/${cat.slug}/${t.slug}/`">{{ t.title }}<span class="tov-index__eng">{{ t.nameEn }}</span></a>
            </li>
          </ul>
        </div>
      </div>

      <p class="c-note">
        <span class="c-note__icon" aria-hidden="true">&#9432;</span>
        實際提供之療程項目以院方公告為準，適用性一律需經醫師面診評估。
      </p>
    </div>
  </section>

  <!-- =====================================================================
       4. 依困擾找療程
       ===================================================================== -->
  <section class="section" id="by-concern">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">BY SKIN CONCERN</span>
          <h2>不知道要做哪一項？從困擾開始找</h2>
          <p>先確認自己遇到的是什麼問題，再看有哪些對應方向，比直接挑儀器實際。</p>
        </div>
        <a class="c-sechead__more" href="/concerns/">查看全部肌膚困擾 →</a>
      </div>

      <div class="tov-concerns">
        <a v-for="c in concerns" :key="c.href" class="c-tag" :href="c.href">{{ c.label }}</a>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       5. 療程流程
       ===================================================================== -->
  <section class="section section--alt" id="process">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">HOW IT WORKS</span>
          <h2>從預約到回診</h2>
          <p>不論做哪一項療程，流程都是同一套。</p>
        </div>
      </div>

      <div class="grid grid--4">
        <article v-for="step in processSteps" :key="step.no" class="tov-step">
          <span class="tov-step__no">{{ step.no }}</span>
          <h3>{{ step.title }}</h3>
          <p>{{ step.desc }}</p>
        </article>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       6. 常見問題
       ===================================================================== -->
  <section class="section" id="faq">
    <div class="container container--narrow">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">FAQ</span>
          <h2>選療程前的常見問題</h2>
        </div>
      </div>

      <div class="c-faq">
        <details v-for="item in faqs" :key="item.q" class="c-faq__item">
          <summary class="c-faq__q">{{ item.q }}</summary>
          <div class="c-faq__a">
            <p>{{ item.a }}</p>
          </div>
        </details>
      </div>

      <p class="c-note c-note--warn">
        <span class="c-note__icon" aria-hidden="true">&#9888;</span>
        本頁內容為一般性說明，不構成醫療建議。療程適用性與次數需由醫師評估後決定。
      </p>
    </div>
  </section>

  <!-- =====================================================================
       7. 頁尾 CTA 區
       ===================================================================== -->
  <section class="section tov-cta">
    <div class="container tov-cta__box">
      <div class="tov-cta__text">
        <span class="u-eyebrow">BOOK A CONSULTATION</span>
        <h2>先面診，再決定做什麼</h2>
        <p>療程適用性需經醫師面診評估。歡迎預約門診，由醫師依實際膚況規劃合適的組合與節奏。</p>
      </div>
      <div class="tov-cta__actions">
        <a class="btn btn--primary ext" href="https://booking.20skin.tw/MainMs/Login" target="_blank" rel="noopener external">立即預約</a>
        <a class="btn btn--line" href="/faq/">看常見問題</a>
      </div>
    </div>
  </section>
</template>
