<script setup lang="ts">
// 模板 1 —— 首頁（mockup/index.html）
//
// 七個版位對應 docs/02-backend-cms.md §3 的 HomeSections 種子 key
// （hero / specialties / featured-treatments / latest-articles / doctors / clinics / brand-story）。
// 重複區塊的資料抽在 ~/data/home.ts，形狀對齊 docs/08-database.md 的欄位命名。
//
// header／footer／浮動諮詢鈕已經在 layouts/default.vue，這裡只放 <main id="main"> 的內容。
import {
  FEATURED_DOCTORS,
  FEATURED_TREATMENTS,
  HERO_SLIDES,
  HOME_CLINICS,
  HOURS_WEEKDAY_LABELS,
  LATEST_ARTICLES,
  SPECIALTIES,
} from '~/data/home'
import { SITE_SETTINGS } from '~/data/site-settings'

// SEO title 取首頁主標語（hero <h1> 的純文字），不是自己編的字句。
usePageHead({
  title: '要自然‧找四季',
  description: SITE_SETTINGS.description,
  pageCss: '/assets/pages/01-home.css',
  path: '/',
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'MedicalOrganization',
    name: '20SKIN 美醫集團',
    // ⚠️ 內容依 CLAUDE.md 關鍵數字修正：mockup 原文寫「共14位醫師」，
    // 但 14 人中安喬是藝術總監、不是醫師（13 位醫師＋1 位藝術總監）。
    // 「14 位醫師」是 CLAUDE.md 明確列為錯誤的敘述，結構化資料不應繼續帶著這個誤植。
    description:
      '20SKIN美醫集團設四季診所與二林四季皮膚科，由13位醫師與1位藝術總監組成團隊，提供27項醫美與皮膚科療程，以新中式美學為理念服務全台。',
  },
})
</script>

<template>
  <!-- =====================================================================
       1. 主視覺 Hero
       ===================================================================== -->
  <section class="home-hero">
    <div class="container home-hero__layout">
      <div class="home-hero__copy">
        <span class="u-eyebrow">WELCOME TO 20SKIN</span>
        <h1 class="home-hero__title">要自然<span class="home-hero__title-dot">‧</span><br>找四季</h1>
        <p class="home-hero__lede">人生最大的快樂，來自對美的欣賞，而「藝術」是美的最高境界。</p>
        <p class="home-hero__desc">20SKIN 結合皮膚科專科醫療與個人化精準評估，以「新中式美學」的節制手法，為每一位求美者規劃屬於自己的自然樣貌，而非單一標準的臉孔。</p>
        <div class="home-hero__cta">
          <a class="btn btn--primary ext" href="https://booking.20skin.tw/MainMs/Login" target="_blank" rel="noopener external">立即預約</a>
        </div>
      </div>

      <div class="home-hero__media">
        <div class="c-ring c-ring--hero" aria-hidden="true"></div>

        <div class="c-slider" data-slider data-slider-interval="5500"
             role="group" aria-roledescription="輪播" aria-label="院區環境">
          <div class="home-hero__frame">
            <div class="c-slider__viewport">
              <div
                v-for="(slide, index) in HERO_SLIDES"
                :key="slide.imagePath"
                class="c-slider__slide"
                :class="{ 'is-active': index === 0 }"
                :data-slide-caption="slide.caption"
                role="group" aria-roledescription="投影片" :aria-label="`${index + 1} / ${HERO_SLIDES.length}`"
              >
                <img
                  :src="slide.imagePath" :alt="slide.alt"
                  :width="slide.imageWidth" :height="slide.imageHeight"
                  :fetchpriority="index === 0 ? 'high' : undefined"
                  :loading="index === 0 ? undefined : 'lazy'"
                >
              </div>
              <div class="home-hero__glow" aria-hidden="true"></div>
            </div>
          </div>

          <div class="c-slider__foot">
            <div class="c-slider__dots" role="tablist" aria-label="選擇投影片">
              <button
                v-for="(slide, index) in HERO_SLIDES"
                :key="slide.imagePath"
                class="c-slider__dot" type="button" role="tab"
                :aria-selected="index === 0 ? 'true' : 'false'"
                :aria-label="`第 ${index + 1} 張：${slide.caption}`"
              ></button>
            </div>
            <p class="home-hero__caption" data-slider-caption>{{ HERO_SLIDES[0].caption }}</p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       2. 八大專科入口（肌膚困擾）
       ===================================================================== -->
  <section class="section section--alt" id="specialties">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">SKIN CONCERNS</span>
          <h2>看皮膚　找四季</h2>
          <p>從肌膚問題出發，找到對應的專業科別與醫師，而不是先看療程再猜測適合與否。</p>
        </div>
      </div>

      <div class="grid grid--icons">
        <a
          v-for="item in SPECIALTIES" :key="item.slug"
          class="home-specialty" :href="item.urlPath"
        >
          <img class="home-specialty__icon" :src="item.imagePath" :alt="`${item.title}icon`" :width="item.iconWidth" :height="item.iconHeight">
          <span class="home-specialty__label">{{ item.title }}</span>
        </a>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       3. 精選療程
       ===================================================================== -->
  <section class="section" id="treatments">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">FEATURED TREATMENTS</span>
          <h2>精選療程</h2>
          <p>依科別分類的療程項目，皆由醫師依個人膚況評估後規劃。</p>
        </div>
        <!-- mockup 原文連的是 03-treatment-category.html（光療美顏分類頁），因為 demo 只做了
             那一頁。「查看全部療程」在語意上應指向總覽頁，連到單一分類是示意稿的落差。 -->
        <a class="c-sechead__more" href="/treatments/">查看全部療程 →</a>
      </div>

      <div class="grid grid--4">
        <article v-for="item in FEATURED_TREATMENTS" :key="item.slug" class="c-card c-card--treatment">
          <div class="c-card__media">
            <img :src="item.imagePath" :alt="item.alt" :width="item.imageWidth" :height="item.imageHeight">
          </div>
          <div class="c-card__body">
            <span class="c-tag c-card__tag">{{ item.categoryLabel }}</span>
            <h3 class="c-card__title"><a :href="item.urlPath">{{ item.title }}</a></h3>
          </div>
        </article>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       4. 最新文章
       ===================================================================== -->
  <section class="section section--alt" id="articles">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">LATEST ARTICLES</span>
          <h2>最新文章</h2>
          <p>醫美新知、皮膚新知與媒體報導，由院內醫師與編輯部共同審核。</p>
        </div>
        <a class="c-sechead__more" href="/blog/">查看全部文章 →</a>
      </div>

      <div class="grid grid--4">
        <article v-for="item in LATEST_ARTICLES" :key="item.title" class="c-card c-card--article">
          <div class="c-card__media">
            <img :src="item.imagePath" :alt="item.alt" :width="item.imageWidth" :height="item.imageHeight">
          </div>
          <div class="c-card__body">
            <span class="c-tag c-card__tag">{{ item.categoryLabel }}</span>
            <h3 class="c-card__title"><a :href="item.urlPath">{{ item.title }}</a></h3>
            <p class="c-card__excerpt">{{ item.summary }}</p>
            <div class="c-card__meta">
              <span>{{ item.authorLabel }}</span>
              <span>{{ item.displayDate }}</span>
              <span>{{ item.readingMinutes }} 分鐘閱讀</span>
            </div>
          </div>
        </article>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       5. 醫師團隊
       ===================================================================== -->
  <section class="section" id="doctors">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">OUR DOCTORS</span>
          <h2>醫師團隊</h2>
          <p>皮膚科專科醫師與藝術總監團隊，共同把關每一項療程規劃。</p>
        </div>
        <a class="c-sechead__more" href="/team/">查看全部 {{ FEATURED_DOCTORS.length }} 位團隊成員 →</a>
      </div>
    </div>

    <div class="container">
      <div class="home-doctors__grid">
        <article v-for="doctor in FEATURED_DOCTORS" :key="doctor.name" class="c-card c-card--doctor">
          <div class="c-card__media">
            <img :src="doctor.photoPath" :alt="`${doctor.name} ${doctor.jobTitle}`" :width="doctor.photoWidth" :height="doctor.photoHeight" loading="lazy">
          </div>
          <div class="c-card__body">
            <h3 class="c-card__title"><a :href="doctor.urlPath">{{ doctor.name }}</a></h3>
            <div class="c-card__meta"><span>{{ doctor.jobTitle }}</span></div>
          </div>
        </article>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       6. 據點資訊
       ===================================================================== -->
  <section class="section section--alt" id="clinics">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">OUR CLINICS</span>
          <h2>據點資訊</h2>
          <p>兩個院區，各自的門診時段與聯絡方式如下。</p>
        </div>
      </div>

      <div class="grid grid--2">
        <div v-for="clinic in HOME_CLINICS" :key="clinic.name" class="home-clinic">
          <div class="home-clinic__head">
            <h3 class="home-clinic__name c-heading-bar">{{ clinic.name }}</h3>
          </div>
          <address class="home-clinic__nap">
            電話：{{ clinic.phone }}<br>
            地址：{{ clinic.address }}
          </address>
          <table class="c-hours">
            <caption class="visually-hidden">{{ clinic.name }}門診時間表</caption>
            <thead>
              <tr>
                <th scope="col" class="c-hours__corner">門診時間</th>
                <th v-for="day in HOURS_WEEKDAY_LABELS" :key="day" scope="col">{{ day }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in clinic.hoursRows" :key="row.timeRangeLabel">
                <th scope="row">{{ row.timeRangeLabel }}</th>
                <td v-for="(open, dayIndex) in row.openDays" :key="dayIndex" :class="{ 'c-hours__cell--off': !open }">
                  <span v-if="open" class="c-hours__mark" aria-hidden="true"></span><span class="visually-hidden">{{ open ? '看診' : '休診' }}</span>
                </td>
              </tr>
            </tbody>
          </table>
          <p class="c-hours__foot">{{ clinic.hoursFootnote }}</p>
          <div class="home-clinic__actions">
            <a class="btn btn--ghost btn--sm" :href="clinic.urlPath">查看診所介紹</a>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       7. 品牌理念摘要
       ===================================================================== -->
  <section class="section" id="philosophy">
    <div class="container home-philosophy__layout">
      <div class="home-philosophy__media">
        <div class="c-ring c-ring--gold home-philosophy__ring" aria-hidden="true"></div>
        <div class="home-philosophy__frame">
          <div class="home-philosophy__frame-inner">
            <img src="/assets/img/banner2.jpg" alt="診所大理石品牌牆與接待空間，展現新中式美學的簡約質感" width="320" height="220">
          </div>
        </div>
      </div>

      <div class="home-philosophy__copy">
        <span class="home-philosophy__kicker">新中式美學</span>
        <p class="home-philosophy__quote">以古為師，將東方的美學藝術，與「醫美微整形」創新結合。</p>

        <div class="home-philosophy__points">
          <div class="home-philosophy__point">
            <h4 class="c-heading-bar">新中式美學</h4>
            <p>以古為師，將東方的美學藝術與醫美微整形創新結合，追求歷久彌新的自然樣貌。</p>
          </div>
          <div class="home-philosophy__point">
            <h4 class="c-heading-bar">新中式美學</h4>
            <p>強調五官與氣質的整體協調，而非單一標準的網紅罐頭臉。</p>
          </div>
        </div>

        <a class="c-sechead__more" href="/about/">了解品牌故事 →</a>
      </div>
    </div>
  </section>
</template>
