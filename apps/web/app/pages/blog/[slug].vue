<script setup lang="ts">
// 模板 12 —— 臻美分享／文章內頁（mockup/07-article-detail.html）
//
// 路由衝突處理見 app/pages/blog/[category]/index.vue 檔頭的說明；這一頁
// （/blog/:slug/）本身不用做任何特殊處理 —— 四個分類 slug 會被那頁的自訂
// regex 攔截走，其餘字串（真正的文章 slug）才會落到這裡。
import {
  formatDisplayDate,
  getArticleBody,
  getArticleBySlug,
  getArticleCategory,
  getRelatedArticles,
  type ArticleBodyBlock,
} from '~/data/articles'

const route = useRoute()
const slug = route.params.slug as string
const article = await getArticleBySlug(slug)

if (!article) {
  throw createError({ statusCode: 404, statusMessage: 'Article Not Found' })
}

// 🔴 `await` 不可省。`getArticleCategory` 在資料層改成執行期取值之後是 **async**，
//    少了它 `category` 會是一個 Promise —— 而 Promise 沒有 `slug` 也沒有 `label`，
//    於是分類麵包屑變成空字串、三個連結全指向 `/blog/undefined/`。
//    ⚠️ **不會有任何錯誤訊息**：`!` 把 undefined 斷言掉，樣板讀不存在的屬性也只是渲染空白。
//    2026-09-16 由 verify:links 抓到（1111 篇文章頁全中）。
const category = (await getArticleCategory(article.categorySlug))!
const relatedArticles = await getRelatedArticles(article, 3)

// ⚠️ **樣板不能 await，所以分類標籤要先在這裡查好。**
//    原本樣板裡寫的是 `getArticleCategory(related.categorySlug)?.label` ——
//    那支是 async，`?.label` 取到的是 Promise 上不存在的屬性，於是相關文章卡片的
//    分類標籤全部是空白，而且不會有任何錯誤訊息。與上面那個 `/blog/undefined/`
//    是同一類錯誤（資料層改成執行期取值時漏掉的），2026-09-16 一起修。
const relatedCategoryLabels = new Map(
  await Promise.all(relatedArticles.map(async (r) =>
    [r.slug, (await getArticleCategory(r.categorySlug))?.label ?? ''] as const)),
)

// ⚠️ **內文是動態載入的**（一篇一個 chunk，見 data/articles.ts 的 getArticleBody）。
//    用 useAsyncData 取，預渲染時會被寫進這一頁的 HTML 與 _payload.json，
//    讀者不會多發一個請求。直接在 setup 裡 await 也能過，但那樣內文就不會進 payload，
//    hydration 時會再抓一次 chunk。
const { data: body } = await useAsyncData(`article-body:${slug}`, () => getArticleBody(slug), {
  default: (): ArticleBodyBlock[] => [],
})

// 目錄只收 H2（有 id 的才會被連結，H3 是段落內的次標題，mockup 本來就不放進目錄）。
const toc = computed(() => (body.value ?? []).filter(
  (b): b is Extract<ArticleBodyBlock, { type: 'heading' }> & { id: string } =>
    b.type === 'heading' && b.level === 2 && !!b.id,
))

const displayDateText = formatDisplayDate(article.displayDate)
const dateModifiedText = article.dateModified ? formatDisplayDate(article.dateModified) : null
const reviewedOnText = article.reviewedOn ? formatDisplayDate(article.reviewedOn) : null

const ORIGIN = 'https://20skin.tw'

usePageHead({
  title: article.title,
  description: article.metaDescription ?? article.summary,
  pageCss: '/assets/pages/07-article-detail.css',
  path: `/blog/${article.slug}/`,
  ogImage: article.cover.src,
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'MedicalWebPage',
      headline: article.title,
      name: article.title,
      description: article.metaDescription ?? article.summary,
      image: ORIGIN + article.cover.src,
      datePublished: article.displayDate,
      dateModified: article.dateModified ?? article.displayDate,
      author: article.author.doctorSlug
        ? { '@type': 'Physician', name: article.author.name, url: `${ORIGIN}/team/${article.author.doctorSlug}/` }
        : { '@type': 'Person', name: article.author.name },
      ...(article.reviewer
        ? {
            reviewedBy: {
              '@type': 'Physician',
              name: article.reviewer.name,
              url: `${ORIGIN}/team/${article.reviewer.doctorSlug}/`,
            },
          }
        : {}),
      publisher: {
        '@type': 'Organization',
        name: '20SKIN 美醫集團',
        url: ORIGIN,
      },
    },
    breadcrumbJsonLd([
      { label: '首頁', href: '/' },
      { label: '臻美分享', href: '/blog/' },
      { label: category.label, href: `/blog/${category.slug}/` },
      { label: article.title, href: `/blog/${article.slug}/` },
    ]),
  ],
})
</script>

<template>
  <!-- =====================================================================
       麵包屑
       ===================================================================== -->
  <nav class="c-breadcrumb" aria-label="麵包屑導覽">
    <div class="container">
      <ol class="c-breadcrumb__list">
        <li><a href="/">首頁</a></li>
        <li><a href="/blog/">臻美分享</a></li>
        <li><a :href="`/blog/${category.slug}/`">{{ category.label }}</a></li>
        <li><span class="c-breadcrumb__current" aria-current="page">{{ article.title }}</span></li>
      </ol>
    </div>
  </nav>

  <!-- =====================================================================
       文章頁首（分類標籤／H1／AI 摘要，直答式段落作為第一段可見文字）
       ===================================================================== -->
  <header class="article-head">
    <div class="container">
      <div class="article-head__inner">
        <a class="c-tag" :href="`/blog/${category.slug}/`">{{ category.label }}</a>
        <h1>{{ article.title }}</h1>
        <p class="article-excerpt">{{ article.aiSummary ?? article.summary }}</p>
      </div>
    </div>
  </header>

  <!-- =====================================================================
       封面圖
       ===================================================================== -->
  <figure class="article-cover">
    <div class="container">
      <div class="article-cover__inner">
        <div class="article-cover__frame">
          <img :src="article.cover.src" :alt="article.cover.alt" :width="article.cover.width" :height="article.cover.height">
        </div>
        <figcaption>{{ article.summary }}</figcaption>
      </div>
    </div>
  </figure>

  <!-- =====================================================================
       內文版面：閱讀欄（左，主要）＋ 側欄（右，作者／目錄／預約 CTA）。
       側欄在 DOM 順序上排在前面——窄螢幕收成單欄時，讀者會先看到作者與
       目錄再讀內文，符合原本的閱讀順序；桌機再用 grid-column 把側欄移到
       視覺右側，不影響 DOM 順序。側欄有 CTA 墊底，文章沒有 H2／目錄是空的
       時候側欄也不會整段留白（見 07-article-detail.css）。
       ===================================================================== -->
  <div class="container article-layout">

    <aside class="article-aside">
      <!-- =====================================================================
           Byline（作者／審閱／發布與更新日期／閱讀時間）
           ===================================================================== -->
      <div class="article-byline">
        <a v-if="article.author.doctorSlug" class="article-byline__author" :href="`/team/${article.author.doctorSlug}/`">
          <img v-if="article.author.avatarSrc" class="article-byline__avatar" :src="article.author.avatarSrc" :alt="article.author.name" width="48" height="48">
          <span>
            <span class="article-byline__name">{{ article.author.name }}</span>
            <span v-if="article.author.role" class="article-byline__role">{{ article.author.role }}</span>
          </span>
        </a>
        <div v-else class="article-byline__author">
          <span>
            <span class="article-byline__name">{{ article.author.name }}</span>
          </span>
        </div>

        <div class="article-byline__facts">
          <p v-if="article.reviewer" class="article-byline__reviewed">
            <strong>本文由 {{ article.reviewer.name }} 審閱</strong><template v-if="reviewedOnText">・審閱日期 {{ reviewedOnText }}</template>
          </p>
          <div class="article-byline__meta">
            <span>發布日期 {{ displayDateText }}</span>
            <span v-if="dateModifiedText && dateModifiedText !== displayDateText">最後更新 {{ dateModifiedText }}</span>
            <span>閱讀時間 約 {{ article.readingMinutes }} 分鐘</span>
          </div>
        </div>
      </div>

      <!-- =====================================================================
           目錄（依 H2 產生的錨點清單；沒有 H2 的文章不會出現這段）
           ===================================================================== -->
      <nav v-if="toc.length" class="article-toc" aria-label="文章目錄">
        <p class="article-toc__title">本文目錄</p>
        <ul class="article-toc__list">
          <li v-for="heading in toc" :key="heading.id"><a :href="`#${heading.id}`">{{ heading.text }}</a></li>
        </ul>
      </nav>

      <!-- =====================================================================
           側欄預約 CTA（僅桌機顯示；行動版底部已有一段完整 CTA，這裡不重複）
           ===================================================================== -->
      <div class="article-aside__cta">
        <p class="article-aside__cta-title">想進一步了解適合自己的規劃？</p>
        <p class="article-aside__cta-desc">實際適合的保養與療程方向因人而異，建議先與醫師面診評估後再規劃。</p>
        <a class="btn btn--primary btn--sm ext" href="https://booking.20skin.tw/MainMs/Login" target="_blank" rel="noopener external">立即預約</a>
      </div>
    </aside>

    <div class="article-main">
    <!-- =====================================================================
         內文
         ===================================================================== -->
    <article v-if="body?.length" class="article-content">
      <template v-for="(block, i) in body" :key="i">
        <p v-if="block.type === 'lead'" class="article-lead">{{ block.text }}</p>
        <h2 v-else-if="block.type === 'heading' && block.level === 2" :id="block.id">{{ block.text }}</h2>
        <h3 v-else-if="block.type === 'heading' && block.level === 3">{{ block.text }}</h3>
        <p v-else-if="block.type === 'paragraph'">{{ block.text }}</p>
        <figure v-else-if="block.type === 'figure'" class="article-figure" :class="{ 'article-figure--wide': block.wide }">
          <div class="article-figure__frame">
            <img :src="block.image.src" :alt="block.image.alt" :width="block.image.width" :height="block.image.height" loading="lazy">
          </div>
          <figcaption>{{ block.caption }}</figcaption>
        </figure>
        <div v-else-if="block.type === 'table'" class="article-table-wrap">
          <table class="article-table">
            <thead>
              <tr>
                <th v-for="h in block.headers" :key="h" scope="col">{{ h }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, r) in block.rows" :key="r">
                <td v-for="(cell, c) in row" :key="c">{{ cell }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <ol v-else-if="block.type === 'list' && block.ordered" class="article-list">
          <li v-for="(item, li) in block.items" :key="li">{{ item }}</li>
        </ol>
        <ul v-else-if="block.type === 'list' && !block.ordered" class="article-list">
          <li v-for="(item, li) in block.items" :key="li">{{ item }}</li>
        </ul>
        <div v-else-if="block.type === 'note'" class="c-note" :class="{ 'c-note--warn': block.variant === 'warn' }">
          <span class="c-note__icon" aria-hidden="true">{{ block.variant === 'warn' ? '⚠' : 'ⓘ' }}</span>
          <p>{{ block.text }}</p>
        </div>
      </template>
    </article>

      <!-- =====================================================================
           關聯困擾
           ===================================================================== -->
      <div v-if="article.relatedConcerns?.length" class="article-related-block">
        <span class="article-related-block__label">相關肌膚困擾</span>
        <div class="article-tag-list">
          <a v-for="concern in article.relatedConcerns" :key="concern.slug" class="c-tag" :href="`/concerns/${concern.slug}/`">{{ concern.label }}</a>
        </div>
      </div>
    </div>
  </div>

  <!-- =====================================================================
       關聯療程（由後台文章的「關聯療程」欄位掛勾自動產生，非內文手動插入
       連結——避免編輯手動插連結時漏連或產生死連）
       ===================================================================== -->
  <section v-if="article.relatedTreatments?.length" class="section section--alt article-related-treatments">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">RELATED TREATMENTS</span>
          <h2>本文提到的療程</h2>
          <p>依文章內容自動帶出的關聯療程，由後台「關聯療程」欄位設定，工程端不需在內文手動插入連結。</p>
        </div>
      </div>

      <div class="grid grid--3">
        <article v-for="treatment in article.relatedTreatments" :key="treatment.slug" class="c-card c-card--treatment">
          <div class="c-card__media">
            <img :src="treatment.image.src" :alt="treatment.image.alt" :width="treatment.image.width" :height="treatment.image.height" loading="lazy">
          </div>
          <div class="c-card__body">
            <span class="c-tag c-card__tag">{{ treatment.categoryLabel }}</span>
            <h3 class="c-card__title"><a :href="`/treatments/${treatment.categorySlug}/${treatment.slug}/`">{{ treatment.name }}</a></h3>
          </div>
        </article>
      </div>
    </div>
  </section>

  <div class="container--narrow">
    <!-- =====================================================================
         標籤列（noindex 薄內容，視覺上不強調，用 outline 樣式）
         ===================================================================== -->
    <div v-if="article.tags.length" class="article-related-block">
      <span class="article-related-block__label">標籤</span>
      <div class="article-tag-list">
        <a v-for="tag in article.tags" :key="tag.slug" class="c-tag c-tag--outline" :href="`/blog/tag/${tag.slug}/`">{{ tag.label }}</a>
      </div>
    </div>

    <!-- =====================================================================
         作者資訊卡（文末）
         ===================================================================== -->
    <div v-if="article.authorBio" class="article-authorcard">
      <img v-if="article.author.avatarSrc" class="article-authorcard__avatar" :src="article.author.avatarSrc" :alt="article.author.name" width="84" height="84" loading="lazy">
      <div>
        <p class="article-authorcard__name">{{ article.author.name }}</p>
        <p v-if="article.author.role" class="article-authorcard__role">{{ article.author.role }}</p>
        <p class="article-authorcard__bio">{{ article.authorBio }}</p>
        <a v-if="article.author.doctorSlug" class="article-authorcard__link" :href="`/team/${article.author.doctorSlug}/`">查看醫師頁 →</a>
      </div>
    </div>

    <!-- =====================================================================
         分享列（純外觀，不用能運作）
         ===================================================================== -->
    <div class="article-share">
      <span class="article-share__label">分享這篇文章</span>
      <div class="article-share__btns">
        <button class="btn btn--line btn--sm" type="button">複製連結</button>
        <a class="btn btn--line btn--sm" href="#" aria-label="分享到 Facebook（另開新分頁）">Facebook</a>
        <a class="btn btn--line btn--sm" href="#" aria-label="分享到 LINE（另開新分頁）">LINE</a>
      </div>
    </div>
  </div>

  <!-- =====================================================================
       相關文章
       ===================================================================== -->
  <section v-if="relatedArticles.length" class="section" id="related-articles">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">RELATED ARTICLES</span>
          <h2>相關文章</h2>
          <p>更多{{ category.label }}與皮膚保養觀念，由院內醫師與編輯部共同審核。</p>
        </div>
        <a class="c-sechead__more" :href="`/blog/${category.slug}/`">查看全部文章 →</a>
      </div>

      <div class="grid grid--3">
        <article v-for="related in relatedArticles" :key="related.slug" class="c-card c-card--article">
          <div class="c-card__media" :class="{ 'blog-grid__media--pad': related.cover.src.endsWith('.png') }">
            <img :src="related.cover.src" :alt="related.cover.alt" :width="related.cover.width" :height="related.cover.height" loading="lazy">
          </div>
          <div class="c-card__body">
            <span class="c-tag c-card__tag">{{ relatedCategoryLabels.get(related.slug) }}</span>
            <h3 class="c-card__title"><a :href="`/blog/${related.slug}/`">{{ related.title }}</a></h3>
            <p class="c-card__excerpt">{{ related.summary }}</p>
            <div class="c-card__meta">
              <span>{{ related.author.name }}</span>
              <span>{{ formatDisplayDate(related.displayDate) }}</span>
              <span>{{ related.readingMinutes }} 分鐘閱讀</span>
            </div>
          </div>
        </article>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       頁尾 CTA 區
       ===================================================================== -->
  <section class="section article-cta">
    <div class="container article-cta__box">
      <div class="article-cta__text">
        <span class="u-eyebrow">BOOK A CONSULTATION</span>
        <h2>想進一步了解適合自己的規劃？</h2>
        <p>實際適合的保養與療程方向因人而異，建議先與醫師面診評估後再規劃。</p>
      </div>
      <div class="article-cta__actions">
        <a class="btn btn--primary ext" href="https://booking.20skin.tw/MainMs/Login" target="_blank" rel="noopener external">立即預約</a>
      </div>
    </div>
  </section>
</template>
