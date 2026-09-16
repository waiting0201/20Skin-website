<script setup lang="ts">
// 模板 7 —— 療程分類（mockup/03-treatment-category.html）
//
// 動態路由：四個分類 laser／photoelectric／microneedle／skincare
// （docs/01-sitemap.md §1「療程 slug 對照」）。
// 列表頁連到每個療程的明細頁，建置時 crawlLinks 才抓得到（frontend/README.md）。
//
// ⚠️ 只有「光療美顏」在 mockup/03-treatment-category.html 有完整內容
// （四張療程卡片、可改善困擾、醫師團隊、相關文章）。其餘三個分類 mockup
// 沒有對應頁面可抄，這裡不編內容 —— 資料沒有的區塊（concernTags／doctors／
// articles）就整節不渲染，理由與細節頁一致：不要自己編療程內容。
import { getTreatmentCategories, getTreatments, getCategory, concernHref } from '~/data/treatments'

const route = useRoute()
const categorySlug = route.params.category as string
const [treatmentCategories, treatments, category] = await Promise.all([
  getTreatmentCategories(),
  getTreatments(),
  getCategory(categorySlug),
])

if (!category) {
  throw createError({ statusCode: 404, statusMessage: '找不到這個療程分類' })
}

const items = treatments.filter((t) => t.categorySlug === category.slug)

usePageHead({
  title: category.name,
  description: category.lede,
  pageCss: '/assets/pages/03-treatment-category.css',
  path: `/treatments/${category.slug}/`,
  jsonLd: breadcrumbJsonLd([
    { label: '首頁', href: '/' },
    { label: '專業服務', href: '/treatments/' },
    { label: category.name, href: `/treatments/${category.slug}/` },
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
        <li><a href="/treatments/">專業服務</a></li>
        <li><span class="c-breadcrumb__current" aria-current="page">{{ category.name }}</span></li>
      </ol>
    </div>
  </nav>

  <!-- =====================================================================
       1. 分類 Hero
       ===================================================================== -->
  <section class="tcat-hero">
    <div class="container tcat-hero__layout">
      <div class="tcat-hero__copy">
        <span class="u-eyebrow">{{ category.eyebrow }}</span>
        <h1 class="tcat-hero__title">{{ category.name }}</h1>
        <p class="tcat-hero__lede">{{ category.lede }}</p>
      </div>

      <div class="tcat-hero__media">
        <div class="tcat-hero__frame">
          <img :src="category.image.src" :alt="category.image.alt" :width="category.image.width" :height="category.image.height">
        </div>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       2. 四大分類次導覽
       ===================================================================== -->
  <nav class="tcat-catnav" aria-label="專業服務分類">
    <div class="container tcat-catnav__row">
      <div class="c-tabs__list">
        <a
          v-for="cat in treatmentCategories"
          :key="cat.slug"
          class="c-tabs__btn"
          :href="`/treatments/${cat.slug}/`"
          :aria-selected="cat.slug === category.slug"
          :aria-current="cat.slug === category.slug ? 'page' : undefined"
        >{{ cat.name }}</a>
      </div>
      <a class="c-sechead__more tcat-catnav__more" href="/treatments/">療程總覽 →</a>
    </div>
  </nav>

  <!-- =====================================================================
       3. 本分類療程卡片格
       ===================================================================== -->
  <section class="section" id="treatments">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">TREATMENTS</span>
          <h2>{{ category.name }}項目</h2>
          <p>以下為{{ category.name }}分類下的療程項目，機台與適用範圍以醫師評估為準。</p>
        </div>
      </div>

      <div class="grid grid--4">
        <article v-for="item in items" :key="item.slug" class="c-card c-card--treatment">
          <div class="c-card__media">
            <img
              :src="(item.cardImage ?? category.image).src"
              :alt="(item.cardImage ?? category.image).alt"
              :width="(item.cardImage ?? category.image).width"
              :height="(item.cardImage ?? category.image).height"
              loading="lazy"
            >
          </div>
          <div class="c-card__body">
            <span class="tcat-card__eng">{{ item.nameEn }}</span>
            <h3 class="c-card__title"><a :href="`/treatments/${category.slug}/${item.slug}/`">{{ item.title }}</a></h3>
            <p v-if="item.cardExcerpt" class="c-card__excerpt">{{ item.cardExcerpt }}</p>
            <div v-if="item.cardTags?.length" class="tcat-card__tags">
              <span v-for="tag in item.cardTags" :key="tag" class="c-tag c-tag--outline">{{ tag }}</span>
            </div>
            <span class="tcat-card__more">了解更多 →</span>
          </div>
        </article>
      </div>

      <p class="c-note tcat-note">以上為部分項目，儀器適用性與療程規劃需經醫師面診評估。</p>
    </div>
  </section>

  <!-- =====================================================================
       4. 這個分類能改善哪些困擾
       ===================================================================== -->
  <section v-if="category.concernTags?.length" class="section section--alt" id="concerns">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">SKIN CONCERNS</span>
          <h2>{{ category.name }}能改善哪些困擾</h2>
          <p>依困擾找到對應的科別與療程規劃，而非先選儀器再猜測適合與否。</p>
        </div>
      </div>

      <div class="tcat-concerns">
        <template v-for="tag in category.concernTags" :key="tag">
          <a v-if="concernHref(tag)" class="c-tag" :href="concernHref(tag)!">{{ tag }}</a>
          <span v-else class="c-tag">{{ tag }}</span>
        </template>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       5. 本分類醫師團隊
       ===================================================================== -->
  <section v-if="category.doctors?.length" class="section" id="doctors">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">OUR DOCTORS</span>
          <h2>{{ category.name }}醫師團隊</h2>
          <p>執行{{ category.name }}項目的皮膚科專科醫師，依膚況規劃療程並全程把關。</p>
        </div>
        <a class="c-sechead__more" href="/team/">查看全部 14 位團隊成員 →</a>
      </div>

      <div class="grid grid--4">
        <article v-for="doc in category.doctors" :key="doc.slug" class="c-card c-card--doctor">
          <div class="c-card__media">
            <img :src="doc.photo.src" :alt="doc.photo.alt" :width="doc.photo.width" :height="doc.photo.height">
          </div>
          <div class="c-card__body">
            <h3 class="c-card__title"><a :href="`/team/${doc.slug}/`">{{ doc.name }}</a></h3>
            <div class="c-card__meta"><span>{{ doc.title }}</span></div>
          </div>
        </article>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       6. 相關文章
       ===================================================================== -->
  <section v-if="category.articles?.length" class="section section--alt" id="articles">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">RELATED ARTICLES</span>
          <h2>相關文章</h2>
          <p>認識{{ category.name }}相關原理與日常照護重點，由院內醫師與編輯部共同審核。</p>
        </div>
        <a class="c-sechead__more" href="/blog/">查看全部文章 →</a>
      </div>

      <div class="grid grid--3">
        <article v-for="article in category.articles" :key="article.title" class="c-card c-card--article">
          <div class="c-card__media">
            <img :src="article.photo.src" :alt="article.photo.alt" :width="article.photo.width" :height="article.photo.height">
          </div>
          <div class="c-card__body">
            <span class="c-tag c-card__tag">{{ article.category }}</span>
            <h3 class="c-card__title"><a :href="article.href">{{ article.title }}</a></h3>
            <div class="c-card__meta">
              <span>{{ article.author }}</span>
              <span>{{ article.date }}</span>
              <span v-if="article.readingMinutes">{{ article.readingMinutes }} 分鐘閱讀</span>
            </div>
          </div>
        </article>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       7. 頁尾 CTA 區
       ===================================================================== -->
  <section class="section tcat-cta">
    <div class="container tcat-cta__box">
      <div class="tcat-cta__text">
        <span class="u-eyebrow">BOOK A CONSULTATION</span>
        <h2>規劃屬於你的{{ category.name }}組合</h2>
        <p>療程適用性需經醫師面診評估，歡迎預約門診，由醫師依實際膚況規劃合適的組合。</p>
      </div>
      <div class="tcat-cta__actions">
        <a class="btn btn--primary ext" href="https://booking.20skin.tw/MainMs/Login" target="_blank" rel="noopener external">立即預約</a>
      </div>
    </div>
  </section>
</template>
