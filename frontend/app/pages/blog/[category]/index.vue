<script setup lang="ts">
// 模板 11 —— 臻美分享／分類清單（mockup/06-blog-list.html）
//
// ⚠️ 路由衝突：這個路徑（/blog/:category/）與 app/pages/blog/[slug].vue
// （/blog/:slug/）在 vue-router 眼中是同一種形狀（單一動態片段），單靠
// definePageMeta({ validate }) 並不會讓 Nuxt 自動改試下一個候選路由 ——
// validate() 只會在「已經比對到的那個路由」上擋下來丟 404
// （node_modules/nuxt/dist/pages/runtime/validate.js：擋下就直接 createError,
// 不會退回去試 [slug].vue）。實際會用哪一個路由，是 vue-router 建表時的
// score 排序決定，兩邊 score 一樣時看誰先註冊，而 Nuxt 依檔案掃描結果排序
// 檔案（先按檔名字串排序，再按 relativePath 長度排序），
// "blog/[slug].vue"（15 字）比 "blog/[category]/index.vue"（25 字）短，
// 所以 [slug].vue 會先註冊 —— 也就是說如果不處理，/blog/medical-aesthetics/
// 會被 [slug].vue 吃掉，永遠輪不到這一頁。
//
// 解法是用 definePageMeta({ path }) 把這頁的路徑換成「帶自訂正規表達式」的
// 動態片段。vue-router 的評分表（vue-router/dist/vue-router.mjs 的
// PathScore）給有自訂 regex 的動態片段 +10 分（BonusCustomRegExp），
// 讓這一頁的 score 穩贏純動態的 [slug].vue，不必依賴檔案掃描順序，
// 四個分類以外的字串也還是正確落到 [slug].vue（regex 對不上，router 才會
// 往下比對下一個候選）。這裡額外保留 validate 純粹當第二層防呆
// （例如未來有人改用 navigateTo({ name }) 帶錯 category 時還能擋下來）。
//
// 實際驗證方式：在 frontend/ 目錄下用專案既有的 vue-router 套件（版本與
// Nuxt 內部一致）寫了一支獨立小腳本（未進版控），直接呼叫
// createRouter().resolve() 灌入與本頁等價的路由設定，比對
// /blog/medical-aesthetics、/blog/dermatology、/blog/media、/blog/lectures
// 四個真實分類與一個假文章 slug 分別解析到哪一支元件 —— 確認四個分類都命中
// 這頁、假 slug 命中 [slug].vue、/blog/tag/xxx 不受影響。跑完就刪了，
// 不是專案的一部分。
import { ARTICLE_CATEGORIES, POPULAR_TAGS, POPULAR_TREATMENTS_FOR_BLOG, formatDisplayDate, getArticleCategory, listArticlesByCategory, type ArticleCategorySlug } from '~/data/articles'

const CATEGORY_SLUGS = ARTICLE_CATEGORIES.map((c) => c.slug)

// ⚠️ definePageMeta 的 path 一定要寫成「字面上的字串常數」，不能用樣板字串
// 內插變數（例如 `/blog/:category(${CATEGORY_SLUGS.join('|')})`）。
// Nuxt 在建置期用 AST 靜態分析 definePageMeta() 的參數
// （node_modules/nuxt/dist/index.mjs 的 isSerializable()），只認得
// ObjectExpression／ArrayExpression／單純的 Literal；樣板字串或參照變數一律
// 判定為「不可序列化」，整段被丟進執行期才合併的 route.meta，**不會**寫進
// 用來建路由表、決定「誰先比對到」的 route.path —— 上面說的 +10 分自訂
// regex 加分因此完全不會發生，[slug].vue 還是會贏。四個分類 slug 只好在這裡
// 重複寫一次字面值；下面的檢查確保這份字面值沒有跟 ARTICLE_CATEGORIES 兜不起來
// （例如日後新增第五個分類卻忘記改這裡）。
const CATEGORY_PATH_PATTERN = 'medical-aesthetics|dermatology|media|lectures'
if (import.meta.dev && CATEGORY_PATH_PATTERN.split('|').join(',') !== CATEGORY_SLUGS.join(',')) {
  throw new Error(
    '[blog/[category]/index.vue] definePageMeta 裡寫死的 CATEGORY_PATH_PATTERN 與 articles.ts 的 ARTICLE_CATEGORIES 不同步，請同步修改 path。',
  )
}

definePageMeta({
  path: '/blog/:category(medical-aesthetics|dermatology|media|lectures)',
  validate: (route) => CATEGORY_SLUGS.includes(route.params.category as ArticleCategorySlug),
})

const route = useRoute()
const categorySlug = route.params.category as ArticleCategorySlug
const category = getArticleCategory(categorySlug)
if (!category) {
  throw createError({ statusCode: 404, statusMessage: 'Category Not Found' })
}

const articles = listArticlesByCategory(categorySlug)
const featured = articles.find((a) => a.featured)
const gridArticles = featured ? articles.filter((a) => a.slug !== featured.slug) : articles

usePageHead({
  title: category.label,
  description: `20SKIN 美醫集團${category.label}——${category.description}`,
  pageCss: '/assets/pages/06-blog-list.css',
  path: `/blog/${category.slug}/`,
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: category.label,
      description: category.description,
    },
    breadcrumbJsonLd([
      { label: '首頁', href: '/' },
      { label: '臻美分享', href: '/blog/' },
      { label: category.label, href: `/blog/${category.slug}/` },
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
        <li><a href="/blog/">臻美分享</a></li>
        <li><span class="c-breadcrumb__current" aria-current="page">{{ category.label }}</span></li>
      </ol>
    </div>
  </nav>

  <!-- =====================================================================
       分類 Hero
       ===================================================================== -->
  <section class="section section--alt section--tight blog-hero">
    <div class="container">
      <span class="u-eyebrow">{{ category.eyebrow }}</span>
      <h1 class="blog-hero__title">{{ category.label }}</h1>
      <p class="blog-hero__desc">{{ category.description }}</p>
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
          <li><a class="c-tabs__btn" href="/blog/" aria-selected="false">全部文章</a></li>
          <li v-for="cat in ARTICLE_CATEGORIES" :key="cat.slug">
            <a class="c-tabs__btn" :href="`/blog/${cat.slug}/`" :aria-selected="cat.slug === category.slug">{{ cat.label }}</a>
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
       文章列表（精選 ＋ 卡片格）＋ 側欄
       ===================================================================== -->
  <section class="section section--tight">
    <div class="container blog-layout">
      <div class="blog-main">
        <template v-if="articles.length">
          <article v-if="featured" class="c-card c-card--article blog-feature">
            <div class="c-card__media">
              <img :src="featured.cover.src" :alt="featured.cover.alt" :width="featured.cover.width" :height="featured.cover.height">
            </div>
            <div class="c-card__body">
              <span class="c-tag blog-feature__badge">精選文章</span>
              <h2 class="c-card__title"><a :href="`/blog/${featured.slug}/`">{{ featured.title }}</a></h2>
              <p class="c-card__excerpt">{{ featured.summary }}</p>
              <div class="c-card__meta">
                <span><a v-if="featured.author.doctorSlug" :href="`/team/${featured.author.doctorSlug}/`">{{ featured.author.name }}</a><template v-else>{{ featured.author.name }}</template></span>
                <span>{{ formatDisplayDate(featured.displayDate) }}</span>
                <span>{{ featured.readingMinutes }} 分鐘閱讀</span>
              </div>
            </div>
          </article>

          <div v-if="gridArticles.length" class="grid grid--3 blog-grid">
            <article v-for="article in gridArticles" :key="article.slug" class="c-card c-card--article">
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

          <!-- 分頁（未串接後端分頁，標記照抄 mockup，行為為靜態展示） -->
          <nav class="c-pager" aria-label="文章列表分頁">
            <a class="c-pager__item" href="#" aria-disabled="true">上一頁</a>
            <a class="c-pager__item is-active" href="#" aria-current="page">1</a>
            <a class="c-pager__item" href="#">下一頁</a>
          </nav>
          <p class="blog-pager__status">第 1 頁，共 1 頁</p>
        </template>
        <p v-else>此分類目前尚無文章。</p>
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
