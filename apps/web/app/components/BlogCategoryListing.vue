<script setup lang="ts">
// 模板 11 —— 臻美分享／分類清單的版面與資料（mockup/06-blog-list.html）。
//
// ⚠️ **路由設定不在這裡**，在 pages/blog/[category]/index.vue 與
//    pages/blog/[category]/page/[n].vue —— `definePageMeta` 只有寫在
//    頁面檔裡才會被 Nuxt 的建置期靜態分析讀到。下面保留的那段說明是
//    為什麼那兩支必須用自訂 regex 的路徑。
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
import { getArticleCategories, formatDisplayDate, getArticleCategory, listArticlesByCategory, type ArticleCategorySlug } from '~/data/articles'

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
// 🔴 2026-09-15 起分類清單是執行期取的，這段一致性檢查因此移到下方 setup 裡
//    （時機從建置期變成算繪期，一樣只在 dev 拋錯）。
const CATEGORY_PATH_PATTERN = 'medical-aesthetics|dermatology|media|lectures'
const CATEGORY_SLUGS = CATEGORY_PATH_PATTERN.split('|') as ArticleCategorySlug[]


// ⚠️ `page` 由兩個路由各自傳進來：`/blog/{分類}/`（第 1 頁）與
//    `/blog/{分類}/page/{n}/`。做成元件而不是把版面抄兩份。
const props = withDefaults(defineProps<{ categorySlug: ArticleCategorySlug; page?: number }>(), { page: 1 })

const categorySlug = props.categorySlug

/** 寫死的路由樣式與資料庫的文章分類是否還對得起來。⚠️ 只在 dev 拋錯。 */
if (import.meta.dev) {
  const actual = (await getArticleCategories()).map((c) => c.slug).join(',')
  if (actual !== CATEGORY_SLUGS.join(',')) {
    throw new Error(
      '[BlogCategoryListing] definePageMeta 裡寫死的 CATEGORY_PATH_PATTERN 與資料庫的文章分類不同步，請同步修改 path。',
    )
  }
}

// ⚠️ `ARTICLE_CATEGORIES` 是**樣板上那排分類 tab** 用的，缺一不可 ——
//    2026-09-16 導入 `nuxt typecheck` 時抓到：它根本沒有在 setup 裡取，
//    於是 `v-for="cat in ARTICLE_CATEGORIES"` 跑在一個不存在的變數上，
//    **四個分類頁與所有標籤頁的分類 tab 整排消失，只剩「全部文章」**。
//    🔴 Vue 樣板讀不存在的變數不會報錯，只是什麼都不渲染 —— 畫面看起來像設計就這樣。
//    （`/blog/` 總覽頁沒事，因為 BlogAllListing 有取。）
const [category, paged, ARTICLE_CATEGORIES] = await Promise.all([
  getArticleCategory(categorySlug),
  listArticlesByCategory(categorySlug, props.page),
  getArticleCategories(),
])
if (!category) {
  throw createError({ statusCode: 404, statusMessage: 'Category Not Found' })
}

// ⚠️ **精選文章只在第 1 頁抽出來。** 每一頁都抽的話，那一篇會在每一頁重複出現，
//    而且各頁的文章數會少一篇、對不上總數。
// 🔴 **2026-09-15 起只在「當頁的 12 篇」裡找精選，不是整個分類。**
//    分頁改由 API 做之後，前台手上只有當頁 —— 原本是把整個分類讀進來再找。
//    影響：精選文章若排在第 3 頁，就不會被提到第 1 頁的大卡位置。
//    實務上精選幾乎都是最新的那幾篇（列表依日期新到舊），所以差異極小；
//    真要完全還原，得在 API 加一個 `featured=true` 的篩選。
const featured = props.page === 1 ? paged.items.find((a) => a.featured) : undefined
const gridArticles = featured ? paged.items.filter((a) => a.slug !== featured.slug) : paged.items

if (props.page !== paged.page) {
  throw createError({ statusCode: 404, statusMessage: 'Page Not Found' })
}

/** 第 1 頁不帶 `/page/1/` —— 同一份內容不應該有兩個網址。 */
const hrefFor = (n: number) => (n === 1 ? `/blog/${categorySlug}/` : `/blog/${categorySlug}/page/${n}/`)

usePageHead({
  title: props.page === 1 ? category.label : `${category.label}（第 ${props.page} 頁）`,
  description: `20SKIN 美醫集團${category.label}——${category.description}`,
  pageCss: '/assets/pages/06-blog-list.css',
  path: hrefFor(paged.page),
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
        <template v-if="paged.total">
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
          <BlogPager :page="paged.page" :total-pages="paged.totalPages" :href-for="hrefFor" />
        </template>
        <p v-else>此分類目前尚無文章。</p>
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
