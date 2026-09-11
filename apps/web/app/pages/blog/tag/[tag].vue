<script setup lang="ts">
// 模板 11 —— 臻美分享／標籤彙整（mockup/06-blog-list.html）
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
import { getTagLabel, listArticlesByTag, POPULAR_TAGS, POPULAR_TREATMENTS_FOR_BLOG, formatDisplayDate } from '~/data/articles'

const route = useRoute()
const tagSlug = route.params.tag as string
const tagLabel = getTagLabel(tagSlug)
const articles = listArticlesByTag(tagSlug)

usePageHead({
  title: `標籤：${tagLabel}`,
  description: `「${tagLabel}」相關文章列表。`,
  pageCss: '/assets/pages/06-blog-list.css',
  path: `/blog/tag/${tagSlug}/`,
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
        <div v-if="articles.length" class="grid grid--3 blog-grid">
          <article v-for="article in articles" :key="article.slug" class="c-card c-card--article">
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
</template>
