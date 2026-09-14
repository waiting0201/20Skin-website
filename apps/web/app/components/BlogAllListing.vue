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
import { ARTICLE_CATEGORIES, formatDisplayDate, listAllArticles, paginate } from '~/data/articles'

// ⚠️ `page` 由兩個路由各自傳進來：`/blog/`（第 1 頁）與 `/blog/page/{n}/`。
//    做成元件而不是把版面抄兩份 —— 兩個路由的 hero、麵包屑、側欄完全一樣。
const props = withDefaults(defineProps<{ page?: number }>(), { page: 1 })

const all = listAllArticles()
const paged = paginate(all, props.page)

// ⚠️ 超出範圍的頁碼要 404，不是顯示空清單。`/blog/page/999/` 若回 200 空頁面，
//    爬蟲會把無限多個不存在的頁當成有效內容收進索引。
if (props.page !== paged.page) {
  throw createError({ statusCode: 404, statusMessage: 'Page Not Found' })
}

/** 第 1 頁不帶 `/page/1/` —— 同一份內容不應該有兩個網址。 */
const hrefFor = (n: number) => (n === 1 ? '/blog/' : `/blog/page/${n}/`)

usePageHead({
  title: props.page === 1 ? '臻美分享' : `臻美分享（第 ${props.page} 頁）`,
  description: '20SKIN 美醫集團臻美分享，收錄醫美新知、皮膚新知、媒體報導與演講授課，內容經醫師與編輯部共同確認後刊出。',
  pageCss: '/assets/pages/06-blog-list.css',
  path: hrefFor(paged.page),
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
      <p class="blog-hero__count">共 <strong>{{ paged.total }}</strong> 篇文章</p>
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
        <div v-if="paged.items.length" class="grid grid--3 blog-grid">
          <article v-for="article in paged.items" :key="article.slug" class="c-card c-card--article">
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

        <BlogPager :page="paged.page" :total-pages="paged.totalPages" :href-for="hrefFor" />
      </div>

        <BlogAside />
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
