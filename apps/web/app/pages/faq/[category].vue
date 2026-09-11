<script setup lang="ts">
// 模板 15 —— FAQ 分類頁（mockup/16-faq.html 的單一 tab 面板抽出成獨立網址）
//
// 三方權責分界（docs/02-backend-cms.md §6）：分類頁屬於「分類與標籤」模型，
// 有自己的 slug、介紹文案、SEO，FAQPage schema 只輸出這個分類的子集。
//
// ⚠️ mockup 沒有把這五個分類個別設計成獨立頁面（它們是同一頁裡的五個 tab），
// 所以這裡沒有獨立於全站導言之外的「分類介紹文案」可以照抄——導言沿用主頁
// 的同一句話，只代換分類名稱與正確的題數，見下方 description 與 lede。
// 正式介紹文案需要內容團隊另外撰寫。
import { FAQ_CATEGORIES, faqItemsByCategory, faqPageJsonLd } from '~/data/faq'

const route = useRoute()
const slug = route.params.category as string
const category = FAQ_CATEGORIES.find((c) => c.slug === slug)

if (!category) {
  throw createError({ statusCode: 404, statusMessage: '找不到這個 FAQ 分類' })
}

definePageMeta({
  validate: (route) => FAQ_CATEGORIES.some((c) => c.slug === route.params.category),
})

const items = faqItemsByCategory(category.slug)

usePageHead({
  title: `${category.label}｜常見問題`,
  description: `門診中最常被問到、與「${category.label}」有關的 ${items.length} 則問題，並標註審閱者與更新月份。`,
  pageCss: '/assets/pages/16-faq.css',
  path: `/faq/${category.slug}/`,
  jsonLd: [
    breadcrumbJsonLd([
      { label: '首頁', href: '/' },
      { label: '常見問題', href: '/faq/' },
      { label: category.label, href: `/faq/${category.slug}/` },
    ]),
    faqPageJsonLd(items),
  ],
})
</script>

<template>
  <!-- 麵包屑 -->
  <nav class="c-breadcrumb" aria-label="麵包屑">
    <div class="container">
      <ol class="c-breadcrumb__list">
        <li><a href="/">首頁</a></li>
        <li><a href="/faq/">常見問題</a></li>
        <li><span class="c-breadcrumb__current" aria-current="page">{{ category.label }}</span></li>
      </ol>
    </div>
  </nav>

  <!-- 1. Hero -->
  <section class="faq-hero">
    <div class="container faq-hero__layout">
      <div class="faq-hero__copy">
        <span class="u-eyebrow">FAQ</span>
        <h1 class="faq-hero__title">{{ category.label }}</h1>
        <p class="faq-hero__lede">門診中最常被問到、與「{{ category.label }}」有關的 {{ items.length }} 則問題，並標註審閱者與更新月份。</p>

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

  <!-- 2. 題庫（單一分類，沒有 tab） -->
  <section class="section section--tight" id="questions">
    <div class="container">
      <div class="faq-tabs c-tabs">
        <div class="c-tabs__panel" role="tabpanel">
          <div class="faq-group__head">
            <h2>{{ category.label }}</h2>
            <span class="faq-group__count">{{ items.length }} 則</span>
          </div>
          <div class="c-faq">
            <details v-for="item in items" :key="item.question" class="c-faq__item">
              <summary class="c-faq__q">{{ item.question }}</summary>
              <div class="c-faq__a">
                <p>{{ item.webAnswer }}</p>
                <span class="c-faq__meta">最後更新 {{ item.lastReviewedOn.slice(0, 7) }}｜{{ item.reviewedBy }}審閱</span>
              </div>
            </details>
          </div>
        </div>
      </div>

      <p class="faq-search__hint"><a href="/faq/">← 查看所有分類</a></p>
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
