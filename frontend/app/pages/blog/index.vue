<script setup lang="ts">
// 模板 11 —— 臻美分享／全部文章（mockup/06-blog-list.html）
//
// 這一支 CSS／標記三種列表路由共用：
//   /blog/           ← 這個檔案（全部文章，無分類篩選）
//   /blog/{category}/  ← app/pages/blog/[category]/index.vue
//   /blog/tag/{tag}/   ← app/pages/blog/tag/[tag].vue
//
// mockup 只示範了「醫美新知」這一個分類的清單，所以四個分類裡只有醫美新知有
// 文章；這一頁把全部（目前也就是醫美新知那 11 篇）攤開顯示。分類 Tab 全部可
// 點，其餘三個分類點進去會看到「尚無文章」的空狀態，不是漏做。
import { ARTICLE_CATEGORIES, POPULAR_TAGS, POPULAR_TREATMENTS_FOR_BLOG, formatDisplayDate, listAllArticles } from '~/data/articles'

const articles = listAllArticles()

usePageHead({
  title: '臻美分享',
  description: '20SKIN 美醫集團臻美分享，收錄醫美新知、皮膚新知、媒體報導與演講授課，內容經醫師與編輯部共同確認後刊出。',
  pageCss: '/assets/pages/06-blog-list.css',
  path: '/blog/',
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: '臻美分享',
      description: '20SKIN 美醫集團臻美分享，收錄醫美新知、皮膚新知、媒體報導與演講授課，內容經醫師與編輯部共同確認後刊出。',
    },
    breadcrumbJsonLd([
      { label: '首頁', href: '/' },
      { label: '臻美分享', href: '/blog/' },
    ]),
  ],
})
</script>

<template>
  <!-- =====================================================================
       麵包屑
       ===================================================================== -->
  <nav class="c-breadcrumb" aria-label="breadcrumb">
    <div class="container">
      <ol class="c-breadcrumb__list">
        <li><a href="/">首頁</a></li>
        <li><span class="c-breadcrumb__current" aria-current="page">臻美分享</span></li>
      </ol>
    </div>
  </nav>

  <!-- =====================================================================
       Hero
       ===================================================================== -->
  <section class="section section--alt section--tight blog-hero">
    <div class="container">
      <span class="u-eyebrow">ZHEN MEI SHARE</span>
      <h1 class="blog-hero__title">臻美分享</h1>
      <p class="blog-hero__desc">醫美新知、皮膚新知、媒體報導與演講授課，內容經醫師與編輯部共同確認後刊出。</p>
      <p class="blog-hero__count">共 <strong>{{ articles.length }}</strong> 篇文章</p>
    </div>
  </section>

  <!-- =====================================================================
       分類 Tab ＋ 年份篩選（年份篩選為未串接的靜態展示）
       ===================================================================== -->
  <section class="blog-filters">
    <div class="container">
      <nav class="c-tabs" aria-label="臻美分享分類">
        <ul class="c-tabs__list">
          <li><a class="c-tabs__btn" href="/blog/" aria-selected="true">全部文章</a></li>
          <li v-for="cat in ARTICLE_CATEGORIES" :key="cat.slug">
            <a class="c-tabs__btn" :href="`/blog/${cat.slug}/`" aria-selected="false">{{ cat.label }}</a>
          </li>
        </ul>
      </nav>

      <div class="blog-years" role="group" aria-label="依年份篩選">
        <a class="c-tag blog-years__link is-active" href="#">全部年份</a>
        <a class="c-tag blog-years__link" href="#">2026</a>
        <a class="c-tag blog-years__link" href="#">2025</a>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       文章列表 ＋ 側欄
       ===================================================================== -->
  <section class="section section--tight">
    <div class="container blog-layout">
      <div class="blog-main">
        <div v-if="articles.length" class="grid grid--3 blog-grid">
          <article v-for="article in articles" :key="article.slug" class="c-card c-card--article">
            <div class="c-card__media" :class="{ 'blog-grid__media--pad': article.cover.src.endsWith('.png') }">
              <img :src="article.cover.src" :alt="article.cover.alt" :width="article.cover.width" :height="article.cover.height" loading="lazy">
            </div>
            <div class="c-card__body">
              <h3 class="c-card__title"><a :href="`/blog/${article.slug}/`">{{ article.title }}</a></h3>
              <p class="c-card__excerpt">{{ article.summary }}</p>
              <div class="c-card__meta">
                <span><a :href="article.author.doctorSlug ? `/team/${article.author.doctorSlug}/` : undefined">{{ article.author.name }}</a></span>
                <span>{{ formatDisplayDate(article.displayDate) }}</span>
                <span>{{ article.readingMinutes }} 分鐘閱讀</span>
              </div>
            </div>
          </article>
        </div>
        <p v-else>此分類目前尚無文章。</p>

        <!-- 分頁（未串接後端分頁，標記照抄 mockup，行為為靜態展示） -->
        <nav class="c-pager" aria-label="文章列表分頁">
          <a class="c-pager__item" href="#" aria-disabled="true">上一頁</a>
          <a class="c-pager__item is-active" href="#" aria-current="page">1</a>
          <a class="c-pager__item" href="#">下一頁</a>
        </nav>
        <p class="blog-pager__status">第 1 頁，共 1 頁</p>
      </div>

      <aside class="blog-aside" aria-label="側邊資訊">
        <div class="blog-aside__block">
          <h3 class="c-heading-bar">站內搜尋</h3>
          <form class="blog-search" role="search" action="/search/" method="get">
            <label class="visually-hidden" for="blogSearchInput">搜尋文章</label>
            <input class="blog-search__input" id="blogSearchInput" name="q" type="search" placeholder="輸入關鍵字…">
            <button class="btn btn--primary btn--sm" type="submit" aria-label="搜尋">
              <svg class="btn__icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5Zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14Z"/></svg>
            </button>
          </form>
        </div>

        <div class="blog-aside__block">
          <h3 class="c-heading-bar">熱門標籤</h3>
          <div class="blog-tags">
            <a v-for="tag in POPULAR_TAGS" :key="tag.slug" class="c-tag" :href="`/blog/tag/${tag.slug}/`">{{ tag.label }}</a>
          </div>
        </div>

        <div class="blog-aside__block">
          <h3 class="c-heading-bar">熱門療程</h3>
          <ul class="blog-mini-list">
            <li v-for="item in POPULAR_TREATMENTS_FOR_BLOG" :key="item.slug" class="blog-mini">
              <a class="blog-mini__media" :href="`/treatments/${item.categorySlug}/${item.slug}/`">
                <img :src="item.image.src" :alt="item.image.alt" :width="item.image.width" :height="item.image.height" loading="lazy">
              </a>
              <div class="blog-mini__body">
                <span class="c-tag c-tag--outline">{{ item.categoryLabel }}</span>
                <h4 class="blog-mini__title"><a :href="`/treatments/${item.categorySlug}/${item.slug}/`">{{ item.name }}</a></h4>
              </div>
            </li>
          </ul>
        </div>
      </aside>
    </div>
  </section>

  <!-- =====================================================================
       頁尾 CTA
       ===================================================================== -->
  <section class="section blog-cta">
    <div class="container blog-cta__box">
      <div class="blog-cta__text">
        <span class="u-eyebrow">BOOK A CONSULTATION</span>
        <h2>想進一步了解適合自己的療程？</h2>
        <p>由醫師依個人膚況評估後規劃，歡迎預約門診諮詢。</p>
      </div>
      <div class="blog-cta__actions">
        <a class="btn btn--primary ext" href="https://booking.20skin.tw/MainMs/Login" target="_blank" rel="noopener external">立即預約</a>
      </div>
    </div>
  </section>
</template>
