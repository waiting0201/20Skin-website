<script setup lang="ts">
// 模板 15 —— FAQ 主頁（mockup/16-faq.html）
//
// 三方權責分界（docs/02-backend-cms.md §6）：這一頁本身只有標題、導言、SEO，
// 題目列表是「題庫模組」帶出來的，不是這一頁自己的內容——資料因此整包從
// ~/data/faq.ts 匯入，而不是寫死在這支檔案裡。
//
// accordion（.c-faq）與 tab（.c-tabs）是 mockup app.js 驅動的元件，標記照抄，
// 不改寫成 Vue 的互動（v-model 切換分頁之類）。
//
// 每個分類的標題旁多加了一個到 /faq/{category}/ 的連結（mockup 沒有這個連結，
// 原設計裡 tab 純粹是同頁切換）。加這個連結純粹是為了讓分類頁可以被
// nitro 的 crawlLinks 探索到、產生靜態 HTML——nav 選單（navigation.ts）目前
// 沒有列出五個 FAQ 分類的子選單，分類頁在動線上會變成孤兒頁。這裡沒有加任何
// class（避免影響版面），純文字連結。
import { FAQ_CATEGORIES, faqItemsByCategory, faqPageJsonLd, FAQ_ITEMS } from '~/data/faq'

usePageHead({
  title: '常見問題',
  description: '門診最常被問到的 24 個問題，依主題分類整理，並標註審閱者與更新月份。',
  pageCss: '/assets/pages/16-faq.css',
  path: '/faq/',
  jsonLd: [
    breadcrumbJsonLd([
      { label: '首頁', href: '/' },
      { label: '常見問題', href: '/faq/' },
    ]),
    faqPageJsonLd(FAQ_ITEMS),
  ],
})
</script>

<template>
  <!-- 麵包屑 -->
  <nav class="c-breadcrumb" aria-label="麵包屑">
    <div class="container">
      <ol class="c-breadcrumb__list">
        <li><a href="/">首頁</a></li>
        <li><span class="c-breadcrumb__current" aria-current="page">常見問題</span></li>
      </ol>
    </div>
  </nav>

  <!-- 1. Hero -->
  <section class="faq-hero">
    <div class="container faq-hero__layout">
      <div class="faq-hero__copy">
        <span class="u-eyebrow">FAQ</span>
        <h1 class="faq-hero__title">常見問題</h1>
        <p class="faq-hero__lede">門診最常被問到的 24 個問題，依主題分類整理，並標註審閱者與更新月份。</p>

        <form class="faq-search__form" action="/search/" method="get" role="search">
          <label class="visually-hidden" for="faqQuery">搜尋常見問題</label>
          <input class="faq-search__input" id="faqQuery" name="q" type="search"
                 autocomplete="off" placeholder="輸入關鍵字，例如：術後 化妝">
          <button class="btn btn--primary" type="submit">搜尋</button>
        </form>
        <p class="faq-search__hint">找不到想問的？右下角的線上諮詢可以直接用自己的話問。</p>
      </div>

      <div class="faq-hero__media">
        <img src="/assets/img/stock-bamboo-corridor.jpg" alt="木格柵長廊與竹意象" width="1800" height="1199">
      </div>
    </div>
  </section>

  <!-- 2. 題庫（分類 Tab ＋ accordion） -->
  <section class="section section--tight" id="questions">
    <div class="container">
      <div class="faq-tabs c-tabs">
        <div class="c-tabs__list" role="tablist" aria-label="常見問題分類">
          <button
            v-for="(cat, i) in FAQ_CATEGORIES"
            :key="cat.slug"
            class="c-tabs__btn"
            type="button"
            role="tab"
            :id="`faq-tab-${cat.slug}`"
            :data-tab="cat.slug"
            :aria-controls="`faq-panel-${cat.slug}`"
            :aria-selected="i === 0 ? 'true' : 'false'"
          >{{ cat.label }}</button>
        </div>

        <div
          v-for="(cat, i) in FAQ_CATEGORIES"
          :key="cat.slug"
          class="c-tabs__panel"
          :data-tab-panel="cat.slug"
          :id="`faq-panel-${cat.slug}`"
          role="tabpanel"
          :aria-labelledby="`faq-tab-${cat.slug}`"
          :hidden="i !== 0"
        >
          <div class="faq-group__head">
            <h2>{{ cat.label }}</h2>
            <span class="faq-group__count">{{ faqItemsByCategory(cat.slug).length }} 則</span>
            <a :href="`/faq/${cat.slug}/`">查看「{{ cat.label }}」單獨頁面 →</a>
          </div>
          <div class="c-faq">
            <details v-for="item in faqItemsByCategory(cat.slug)" :key="item.question" class="c-faq__item">
              <summary class="c-faq__q">{{ item.question }}</summary>
              <div class="c-faq__a">
                <p>{{ item.webAnswer }}</p>
                <span class="c-faq__meta">最後更新 {{ item.lastReviewedOn.slice(0, 7) }}｜{{ item.reviewedBy }}審閱</span>
              </div>
            </details>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- 3. 找不到答案 -->
  <section class="section section--alt" id="help">
    <div class="container">
      <div class="faq-help__col">
        <div class="c-sechead">
          <div class="c-sechead__text">
            <span class="u-eyebrow">STILL HAVE QUESTIONS</span>
            <h2>沒有你要問的？</h2>
            <p>三個入口，依問題的急迫性與性質選一個。</p>
          </div>
        </div>

        <div class="faq-help">
          <div class="faq-help__item">
            <h3 class="faq-help__title">線上諮詢</h3>
            <p class="faq-help__desc">用自己的話問，依站內內容即時回覆。適合療程與照護的一般性問題。</p>
            <p class="faq-help__pointer">點畫面右下角的<strong>「線上諮詢」</strong></p>
          </div>

          <div class="faq-help__item">
            <h3 class="faq-help__title">聯絡我們</h3>
            <p class="faq-help__desc">留下聯絡方式與問題內容，由服務人員於營業時間內回覆。</p>
            <a class="btn btn--ghost btn--sm faq-help__action" href="/contact/">前往聯絡表單</a>
          </div>

          <div class="faq-help__item">
            <h3 class="faq-help__title">預約門診</h3>
            <p class="faq-help__desc">涉及個人膚況與病史的問題，需由醫師面診後才能回答。</p>
            <a class="btn btn--ghost btn--sm ext faq-help__action" href="https://booking.20skin.tw/MainMs/Login" target="_blank" rel="noopener external">立即預約</a>
          </div>
        </div>

        <p class="c-note c-note--warn faq-help__note">
          <span class="c-note__icon" aria-hidden="true">&#9888;</span>
          本頁內容為一般性衛教說明，不構成醫療建議，也無法取代醫師的診斷。個別狀況差異大，是否適合進行任何療程，請於門診由醫師親自評估。
        </p>
      </div>
    </div>
  </section>

  <!-- 4. 頁尾 CTA -->
  <section class="section section--tight faq-cta">
    <div class="container--narrow faq-cta__inner">
      <h2>問題問完了，剩下的交給門診</h2>
      <p>個人化的建議需要醫師實際看過膚況才能給。歡迎預約門診。</p>
      <div class="faq-cta__actions">
        <a class="btn btn--primary ext" href="https://booking.20skin.tw/MainMs/Login" target="_blank" rel="noopener external">立即預約</a>
        <a class="btn btn--ghost" href="/treatments/">查看療程項目</a>
      </div>
    </div>
  </section>
</template>
