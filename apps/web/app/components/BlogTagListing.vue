<script setup lang="ts">
// 模板 11 —— 臻美分享／標籤彙整的版面與資料（mockup/06-blog-list.html）。
//
// ⚠️ 路由在 pages/blog/tag/[tag]/index.vue 與 pages/blog/tag/[tag]/page/[n].vue。
//
// ⚠️ noindex 是刻意的，不是漏掉：docs/02-backend-cms.md §1 —— 30–60 個標籤頁
// 內容單薄，全開索引會稀釋約 800 篇文章的索引預算，個別標籤養出內容後再手動
// 開放。這裡同時設 robots noindex（usePageHead 的 noIndex）與不主動輸出
// sitemap（這頁本來就不在任何 sitemap 產生流程裡）。
//
// 這個路由（/blog/tag/:tag/）因為多一個固定的 "tag" 靜態片段，路徑形狀
// 和 /blog/:slug/、/blog/:category/ 都不一樣（多一層），vue-router 用片段數就
// 能分辨，不會像 [category] 與 [slug] 那樣衝突，不需要額外處理。
//
// 標籤不是像分類一樣的固定四選一封閉清單（docs/02 §1：標籤頁 30–60 個、
// 會隨內容成長），所以這裡不驗證 tag 是否在既有清單裡 —— 查無符合的文章時
// 顯示空狀態，而不是 404。
import { getTagLabel, listArticlesByTag, formatDisplayDate, paginate } from '~/data/articles'

// ⚠️ `page` 由兩個路由各自傳進來：`/blog/tag/{標籤}/` 與 `/blog/tag/{標籤}/page/{n}/`。
const props = withDefaults(defineProps<{ tagSlug: string; page?: number }>(), { page: 1 })

const tagSlug = props.tagSlug
const tagLabel = getTagLabel(tagSlug)
const articles = listArticlesByTag(tagSlug)
const paged = paginate(articles, props.page)

if (props.page !== paged.page) {
  throw createError({ statusCode: 404, statusMessage: 'Page Not Found' })
}

/** 第 1 頁不帶 `/page/1/`。 */
const hrefFor = (n: number) => (n === 1 ? `/blog/tag/${tagSlug}/` : `/blog/tag/${tagSlug}/page/${n}/`)

usePageHead({
  title: props.page === 1 ? `標籤：${tagLabel}` : `標籤：${tagLabel}（第 ${props.page} 頁）`,
  description: `「${tagLabel}」相關文章列表。`,
  pageCss: '/assets/pages/06-blog-list.css',
  path: hrefFor(paged.page),
  noIndex: true,
  jsonLd: breadcrumbJsonLd([
    { label: '首頁', href: '/' },
    { label: '臻美分享', href: '/blog/' },
    { label: tagLabel, href: `/blog/tag/${tagSlug}/` },
  ]),
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
        <li><a href="/blog/">臻美分享</a></li>
        <li><span class="c-breadcrumb__current" aria-current="page">{{ tagLabel }}</span></li>
      </ol>
    </div>
  </nav>

  <!-- =====================================================================
       標籤 Hero
       ===================================================================== -->
  <section class="section section--alt section--tight blog-hero">
    <div class="container">
      <span class="u-eyebrow">TAG</span>
      <h1 class="blog-hero__title">{{ tagLabel }}</h1>
      <p class="blog-hero__desc">標記「{{ tagLabel }}」的文章列表。</p>
      <p class="blog-hero__count">共 <strong>{{ articles.length }}</strong> 篇文章</p>
    </div>
  </section>

  <!-- =====================================================================
       分類 Tab（標籤頁不屬於任何分類，全部維持未選取）
       ===================================================================== -->
  <section class="blog-filters">
    <div class="container">
      <nav class="c-tabs" aria-label="臻美分享分類">
        <ul class="c-tabs__list">
          <li><a class="c-tabs__btn" href="/blog/" aria-selected="false">全部文章</a></li>
          <li><a class="c-tabs__btn" href="/blog/medical-aesthetics/" aria-selected="false">醫美新知</a></li>
          <li><a class="c-tabs__btn" href="/blog/dermatology/" aria-selected="false">皮膚新知</a></li>
          <li><a class="c-tabs__btn" href="/blog/media/" aria-selected="false">媒體報導</a></li>
          <li><a class="c-tabs__btn" href="/blog/lectures/" aria-selected="false">演講授課</a></li>
        </ul>
      </nav>
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
                <span><a v-if="article.author.doctorSlug" :href="`/team/${article.author.doctorSlug}/`">{{ article.author.name }}</a><template v-else>{{ article.author.name }}</template></span>
                <span>{{ formatDisplayDate(article.displayDate) }}</span>
                <span>{{ article.readingMinutes }} 分鐘閱讀</span>
              </div>
            </div>
          </article>
        </div>
        <p v-else>這個標籤目前沒有符合的文章。</p>

        <BlogPager :page="paged.page" :total-pages="paged.totalPages" :href-for="hrefFor" />
      </div>

      <BlogAside />
    </div>
  </section>
</template>
