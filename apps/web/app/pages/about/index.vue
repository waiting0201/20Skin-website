<script setup lang="ts">
// 模板 2 —— 品牌理念（mockup/09-about.html）
import { getAboutPage } from '~/data/pages'

const { pillars: ABOUT_PILLARS, timeline: ABOUT_TIMELINE,
  teamPreview: ABOUT_TEAM_PREVIEW, clinics: ABOUT_CLINICS } = await getAboutPage()

usePageHead({
  title: '品牌理念',
  description:
    '20SKIN 美醫集團的品牌理念——以皮膚科專科為底，結合新中式美學與新中式美學，追求整體協調而非單一標準的樣貌。',
  pageCss: '/assets/pages/09-about.css',
  path: '/about/',
  jsonLd: breadcrumbJsonLd([
    { label: '首頁', href: '/' },
    { label: '品牌理念', href: '/about/' },
  ]),
})
</script>

<template>
  <!-- 麵包屑 -->
    <nav class="c-breadcrumb" aria-label="麵包屑">
      <div class="container">
        <ol class="c-breadcrumb__list">
          <li><a href="/">首頁</a></li>
          <li><span class="c-breadcrumb__current" aria-current="page">品牌理念</span></li>
        </ol>
      </div>
    </nav>

    <!-- 1. Hero -->
    <section class="about-hero">
      <div class="container about-hero__layout">
        <div class="about-hero__copy">
          <span class="u-eyebrow">OUR PHILOSOPHY</span>
          <h1 class="about-hero__title">品牌理念</h1>
          <p class="about-hero__lede">自然不是一個固定的樣板，而是每一張臉本來的協調感。療程的目的是把它整理回來，不是換掉它。</p>
        </div>

        <div class="about-hero__media">
          <div class="c-ring c-ring--gold about-hero__ring" aria-hidden="true"></div>
          <div class="about-hero__frame">
            <img src="/assets/img/photo-glass-facade-wide.jpg" alt="四季診所玻璃立面與 20SKIN 蝕刻標誌" width="1800" height="1200">
          </div>
        </div>
      </div>
    </section>

    <!-- 2. 引言 -->
    <section class="section section--alt about-quote">
      <div class="container about-quote__layout">
        <div class="about-quote__media">
          <img src="/assets/img/stock-bamboo-wall.jpg" alt="白牆上的竹影" width="1350" height="1800" loading="lazy">
        </div>
        <blockquote class="about-quote__body">
          <p class="about-quote__text">以古為師，<br>將東方的美學藝術，<br>與「醫美微整形」創新結合。</p>
          <cite class="about-quote__cite">安喬（許媖琄）｜執行長・「新中式美學」創始人</cite>
        </blockquote>
      </div>
    </section>

    <!-- 3. 三個理念支柱 -->
    <section class="section" id="pillars">
      <div class="container">
        <div class="c-sechead">
          <div class="c-sechead__text">
            <span class="u-eyebrow">WHAT WE BELIEVE</span>
            <h2>三個支撐點</h2>
            <p>美學主張、療程方法、醫療專業 —— 三件事構成我們對「變好看」的完整立場。</p>
          </div>
        </div>

        <div class="grid grid--3">
          <article v-for="pillar in ABOUT_PILLARS" :key="pillar.no" class="about-pillar">
            <a class="about-pillar__media" :href="pillar.href">
              <img :src="pillar.image.src" :alt="pillar.image.alt" :width="pillar.image.w" :height="pillar.image.h" loading="lazy">
            </a>
            <span class="about-pillar__no">{{ pillar.no }}</span>
            <h3>{{ pillar.title }}</h3>
            <p>{{ pillar.body }}</p>
            <a class="about-pillar__more" :href="pillar.href">閱讀完整理念 →</a>
          </article>
        </div>
      </div>
    </section>

    <!-- 4. 我們如何看待「自然」 -->
    <section class="section section--alt" id="view">
      <div class="container about-view__layout">
        <div class="about-view__media">
          <img src="/assets/img/stock-zen-garden.jpg" alt="枯山水庭園的留白與配置意象" width="1800" height="1199" loading="lazy">
        </div>

        <div class="about-view__copy">
          <div class="c-sechead">
            <div class="c-sechead__text">
              <span class="u-eyebrow">OUR APPROACH</span>
              <h2>我們如何看待「自然」</h2>
            </div>
          </div>
          <p>門診裡最常聽到的是「我不想被看出來」。背後其實是兩件事：不希望某個部位突兀，也不希望整張臉失去原本的味道。</p>
          <p>所以規劃順序是先看整體、再看局部。能不做的就不做，該分次的就分次 —— 這是我們對「自然」最實際的定義。</p>
        </div>
      </div>
    </section>

    <!-- 5. 沿革 -->
    <section class="section" id="history">
      <div class="container">
        <div class="c-sechead">
          <div class="c-sechead__text">
            <span class="u-eyebrow">MILESTONES</span>
            <h2>一路走來</h2>
          </div>
        </div>

        <ol class="about-timeline">
          <li v-for="item in ABOUT_TIMELINE" :key="item.year" class="about-timeline__item">
            <span class="about-timeline__year">{{ item.year }}</span>
            <div class="about-timeline__body">
              <h3 class="about-timeline__title">{{ item.title }}</h3>
              <p>{{ item.body }}</p>
            </div>
          </li>
        </ol>
      </div>
    </section>

    <!-- 6. 團隊剪影 -->
    <section class="section section--alt" id="team">
      <div class="container">
        <div class="c-sechead">
          <div class="c-sechead__text">
            <span class="u-eyebrow">OUR TEAM</span>
            <h2>執行理念的人</h2>
            <p>共 14 位成員，13 位醫師與 1 位藝術總監。</p>
          </div>
          <a class="c-sechead__more" href="/team/">查看全部成員 →</a>
        </div>

        <div class="grid grid--4">
          <article v-for="member in ABOUT_TEAM_PREVIEW" :key="member.name" class="c-card c-card--doctor">
            <div class="c-card__media">
              <img :src="member.image.src" :alt="member.image.alt" :width="member.image.w" :height="member.image.h" loading="lazy">
            </div>
            <div class="c-card__body">
              <h3 class="c-card__title"><a :href="member.href">{{ member.name }}</a></h3>
              <div class="c-card__meta"><span>{{ member.role }}</span></div>
            </div>
          </article>
        </div>
      </div>
    </section>

    <!-- 7. 兩個院區 -->
    <section class="section" id="clinics">
      <div class="container">
        <div class="c-sechead">
          <div class="c-sechead__text">
            <span class="u-eyebrow">OUR CLINICS</span>
            <h2>兩個院區</h2>
            <p>醫學美容與一般皮膚疾病門診分流，依需求選擇合適的院區。</p>
          </div>
          <a class="c-sechead__more" href="/clinics/">查看據點資訊 →</a>
        </div>

        <div class="grid grid--2">
          <article v-for="clinic in ABOUT_CLINICS" :key="clinic.name" class="about-clinic">
            <a class="about-clinic__media" :href="clinic.href">
              <img :src="clinic.image.src" :alt="clinic.image.alt" :width="clinic.image.w" :height="clinic.image.h" loading="lazy">
            </a>
            <h3 class="about-clinic__name">{{ clinic.name }}</h3>
            <p>{{ clinic.body }}</p>
            <address>{{ clinic.address }}</address>
          </article>
        </div>
      </div>
    </section>

    <!-- 8. 頁尾 CTA -->
    <section class="section about-cta">
      <div class="container about-cta__box">
        <div class="about-cta__text">
          <span class="u-eyebrow">BOOK A CONSULTATION</span>
          <h2>從一次面診開始</h2>
          <p>理念要落到自己的臉上，還是需要醫師實際看過。</p>
        </div>
        <div class="about-cta__actions">
          <a class="btn btn--primary ext" href="https://booking.20skin.tw/MainMs/Login" target="_blank" rel="noopener external">立即預約</a>
          <a class="btn btn--line" href="/contact/">聯絡我們</a>
        </div>
      </div>
    </section>
</template>
