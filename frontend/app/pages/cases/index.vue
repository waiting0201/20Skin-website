<script setup lang="ts">
// 模板 13 —— 案例列表（mockup/14-case-list.html）
//
// 只有「痘疤紋理的分次調理」在 mockup 有完整內頁內容與法規揭露欄位
// （個案差異聲明、當事人書面同意、拍攝條件，見 docs/08-database.md §C-5）。
// 其餘 9 則案例目前只有列表卡片的摘要資訊，沒有這些必填欄位可用，
// 所以維持 mockup 原樣的無效連結，不接到還不存在的內頁 —— 見 ~/data/cases.ts 開頭的說明。
import { CASE_LIST, CASE_FILTER_CONCERNS, CASE_FILTER_TREATMENTS, CASE_HOW_TO_READ } from '~/data/cases'

usePageHead({
  title: '案例分享',
  description:
    '20SKIN 美醫集團案例分享，每則案例標註個案條件、療程次數與時間區間。反應因個人體質與膚況而異，需經醫師面診評估。',
  pageCss: '/assets/pages/14-case-list.css',
  path: '/cases/',
  jsonLd: breadcrumbJsonLd([
    { label: '首頁', href: '/' },
    { label: '案例分享', href: '/cases/' },
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
        <li><span class="c-breadcrumb__current" aria-current="page">案例分享</span></li>
      </ol>
    </div>
  </nav>

  <!-- =====================================================================
       1. Hero ＋ 個別差異聲明（左文右圖，圖為非療效意象圖）
       ===================================================================== -->
  <section class="cases-hero">
    <div class="container cases-hero__layout">
      <div class="cases-hero__copy">
        <span class="u-eyebrow">CASES</span>
        <h1 class="cases-hero__title">案例分享</h1>
        <p class="cases-hero__lede">每則案例標註個案條件、次數與時間區間——不只是一組對照圖。</p>

        <p class="c-note c-note--warn cases-hero__note">
          <span class="c-note__icon" aria-hidden="true">&#9888;</span>
          案例為個別紀錄，反應因個人體質、膚況與生活習慣而異，不代表所有人都會有相同結果，亦非療程效果之保證。是否適合進行療程，需由醫師面診評估後決定。
        </p>
      </div>
      <div class="cases-hero__media">
        <img src="/assets/img/stock-stones.jpg" alt="黑白疊石，水墨感意象" width="1800" height="1199">
      </div>
    </div>
  </section>

  <!-- =====================================================================
       2. 篩選列
       ===================================================================== -->
  <section class="cases-filters">
    <div class="container cases-filters__row">
      <nav class="c-tabs" aria-label="依困擾篩選">
        <div class="c-tabs__list">
          <a class="c-tabs__btn" href="/cases/" aria-selected="true" aria-current="page">全部案例</a>
          <a
            v-for="tab in CASE_FILTER_CONCERNS"
            :key="tab.label"
            class="c-tabs__btn"
            :href="tab.href ?? '#'"
            aria-selected="false"
          >{{ tab.label }}</a>
        </div>
      </nav>

      <div class="cases-filters__by" role="group" aria-label="依療程篩選">
        <span class="cases-filters__label">依療程：</span>
        <a class="c-tag is-active" href="#">全部</a>
        <a v-for="tag in CASE_FILTER_TREATMENTS" :key="tag.label" class="c-tag" :href="tag.href ?? '#'">{{ tag.label }}</a>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       3. 案例格
       ===================================================================== -->
  <section class="section section--tight" id="cases">
    <div class="container">
      <div class="grid grid--3">
        <article v-for="item in CASE_LIST" :key="item.title" class="c-card">
          <div class="cases-card__ba">
            <div class="cases-card__pane">
              <span class="cases-card__badge">BEFORE</span>
            </div>
            <div class="cases-card__pane">
              <span class="cases-card__badge">AFTER</span>
            </div>
          </div>
          <div class="cases-card__body">
            <h3 class="cases-card__title">
              <a :href="item.slug ? `/cases/${item.slug}/` : '#'">{{ item.title }}</a>
            </h3>
            <div class="cases-card__facts">
              <span>{{ item.ageGender }}</span>
              <span>{{ item.sessions }}</span>
            </div>
            <div class="cases-card__tags">
              <span v-for="tag in item.tags" :key="tag" class="c-tag">{{ tag }}</span>
            </div>
          </div>
        </article>
      </div>

      <nav class="c-pager" aria-label="案例列表分頁">
        <a class="c-pager__item" href="#" aria-disabled="true">上一頁</a>
        <a class="c-pager__item is-active" href="#" aria-current="page">1</a>
        <a class="c-pager__item" href="#">2</a>
        <a class="c-pager__item" href="#">3</a>
        <a class="c-pager__item" href="#">下一頁</a>
      </nav>
    </div>
  </section>

  <!-- =====================================================================
       4. 怎麼看案例
       ===================================================================== -->
  <section class="section section--alt" id="how-to-read">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">HOW TO READ</span>
          <h2>看案例時，三件事比對照圖重要</h2>
          <p>照片只呈現結果，真正能拿來對照自己狀況的是條件與過程。</p>
        </div>
      </div>

      <div class="grid grid--3">
        <article v-for="item in CASE_HOW_TO_READ" :key="item.title" class="cases-how">
          <h3>{{ item.title }}</h3>
          <p>{{ item.text }}</p>
        </article>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       4b. 看完案例，然後呢（左圖右文，收尾意象圖）
       ===================================================================== -->
  <section class="section cases-band">
    <div class="container cases-band__layout">
      <div class="cases-band__media">
        <img src="/assets/img/stock-camellia.jpg" alt="白山茶，季節與細節意象" width="1800" height="1199" loading="lazy">
      </div>
      <div class="cases-band__copy">
        <div class="c-sechead">
          <div class="c-sechead__text">
            <span class="u-eyebrow">BEFORE YOU DECIDE</span>
            <h2>看完案例，然後呢？</h2>
          </div>
        </div>
        <p>案例是別人的起點與過程，你的規劃仍需要醫師依實際膚況面診後才能決定。</p>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       5. 頁尾 CTA 區
       ===================================================================== -->
  <section class="section cases-cta">
    <div class="container cases-cta__box">
      <div class="cases-cta__text">
        <span class="u-eyebrow">BOOK A CONSULTATION</span>
        <h2>想知道自己的狀況能做到哪裡？</h2>
        <p>案例是別人的起點與結果，你的規劃需要醫師依實際膚況評估後才能給。</p>
      </div>
      <div class="cases-cta__actions">
        <a class="btn btn--primary ext" href="https://booking.20skin.tw/MainMs/Login" target="_blank" rel="noopener external">立即預約</a>
        <a class="btn btn--line" href="/concerns/">先看肌膚困擾</a>
      </div>
    </div>
  </section>
</template>
