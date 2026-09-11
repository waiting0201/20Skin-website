<script setup lang="ts">
// 模板 4 —— 醫療團隊列表（mockup/11-team-list.html）
import { DOCTORS } from '~/data/doctors'

const physicianCount = DOCTORS.filter((d) => d.isPhysician).length
const nonPhysicianCount = DOCTORS.length - physicianCount

usePageHead({
  title: '醫療團隊',
  description: `20SKIN 美醫集團醫療團隊共 ${DOCTORS.length} 位成員（${physicianCount} 位醫師與 ${nonPhysicianCount} 位藝術總監），涵蓋皮膚科、家庭醫學科與肥胖醫學等專科背景。`,
  pageCss: '/assets/pages/11-team-list.css',
  path: '/team/',
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: '醫療團隊',
      description: `20SKIN 美醫集團醫療團隊成員一覽，共 ${DOCTORS.length} 位成員：${physicianCount} 位醫師與 ${nonPhysicianCount} 位藝術總監。`,
    },
    breadcrumbJsonLd([
      { label: '首頁', href: '/' },
      { label: '醫療團隊', href: '/team/' },
    ]),
  ],
})

/** 卡片上顯示的看診院區，多院區以頓號連接（例如黃勇學：四季診所、二林四季皮膚科）。 */
function siteLabel(doctor: (typeof DOCTORS)[number]) {
  return doctor.clinics
    .map((c) => (c.clinicSlug === 'siji' ? '四季診所' : '二林四季皮膚科'))
    .join('・')
}
</script>

<template>
  <!-- =====================================================================
       麵包屑
       ===================================================================== -->
  <nav class="c-breadcrumb" aria-label="麵包屑">
    <div class="container">
      <ol class="c-breadcrumb__list">
        <li><a href="/">首頁</a></li>
        <li><span class="c-breadcrumb__current" aria-current="page">醫療團隊</span></li>
      </ol>
    </div>
  </nav>

  <!-- =====================================================================
       1. Hero
       ===================================================================== -->
  <section class="team-hero">
    <div class="container team-hero__inner">
      <span class="u-eyebrow">OUR TEAM</span>
      <h1 class="team-hero__title">醫療團隊</h1>
      <p class="team-hero__lede">兩個院區共 {{ DOCTORS.length }} 位成員，涵蓋皮膚科、家庭醫學科與肥胖醫學等專科背景。療程規劃一律由醫師面診評估後決定。</p>
      <p class="team-hero__count">共 <strong>{{ DOCTORS.length }}</strong> 位成員（{{ physicianCount }} 位醫師 ＋ {{ nonPhysicianCount }} 位藝術總監）</p>
    </div>
  </section>

  <!-- =====================================================================
       2. 篩選列（示意：正式站由後台專長 tag 自動產生，此處尚未串接篩選邏輯）
       ===================================================================== -->
  <section class="team-filters">
    <div class="container team-filters__row">
      <nav class="c-tabs" aria-label="依專長篩選">
        <div class="c-tabs__list">
          <a class="c-tabs__btn" href="/team/" aria-selected="true" aria-current="page">全部成員</a>
          <a class="c-tabs__btn" href="#" aria-selected="false">皮膚疾病</a>
          <a class="c-tabs__btn" href="#" aria-selected="false">雷射光電</a>
          <a class="c-tabs__btn" href="#" aria-selected="false">注射微整</a>
          <a class="c-tabs__btn" href="#" aria-selected="false">體態管理</a>
        </div>
      </nav>

      <div class="team-sites" role="group" aria-label="依院區篩選">
        <span class="team-sites__label">院區：</span>
        <a class="c-tag is-active" href="/team/">全部</a>
        <a class="c-tag" href="/clinics/siji/">四季診所</a>
        <a class="c-tag" href="/clinics/erlin/">二林四季皮膚科</a>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       3. 成員格（全員展開，不做橫向捲動 —— 團隊規模本身就是說服力）
       ===================================================================== -->
  <section class="section section--tight" id="members">
    <div class="container">
      <div class="grid grid--4">
        <article
          v-for="doctor in DOCTORS"
          :key="doctor.slug"
          class="c-card c-card--doctor"
          :class="{ 'team-card--art': !doctor.isPhysician }"
        >
          <div class="c-card__media">
            <img
              :src="doctor.photo.src"
              :alt="`${doctor.name} ${doctor.jobTitle}`"
              :width="doctor.photo.width"
              :height="doctor.photo.height"
              loading="lazy"
            >
          </div>
          <div class="c-card__body">
            <h3 class="c-card__title"><a :href="`/team/${doctor.slug}/`">{{ doctor.name }}</a></h3>
            <div class="c-card__meta"><span>{{ doctor.jobTitle }}</span></div>
            <div class="team-card__tags">
              <span v-for="tag in doctor.tags" :key="tag" class="c-tag">{{ tag }}</span>
            </div>
            <span class="team-card__site">{{ siteLabel(doctor) }}</span>
          </div>
        </article>
      </div>

      <p class="c-note team-note">
        <span class="c-note__icon" aria-hidden="true">&#9432;</span>
        團隊共 {{ DOCTORS.length }} 位成員，其中 {{ physicianCount }} 位為醫師，安喬（許媖琄）為藝術總監兼執行長、亦為「新中式美學」創始人，不具醫師身分、不從事醫療行為。
      </p>
    </div>
  </section>

  <!-- =====================================================================
       4. 團隊如何協作
       ===================================================================== -->
  <section class="section section--alt" id="how">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">HOW WE WORK</span>
          <h2>一次門診會遇到誰</h2>
          <p>從掛號到療程結束，各角色的分工與負責範圍。</p>
        </div>
      </div>

      <div class="grid grid--3">
        <article class="team-role">
          <span class="team-role__media">
            <img src="/assets/img/stock-reception.jpg" alt="接待空間情境" width="1200" height="1800" loading="lazy">
          </span>
          <span class="team-role__no">01</span>
          <h3>諮詢人員</h3>
          <p>了解需求與生活型態、說明流程與可接受的恢復期，並協助安排後續回診時間。不提供醫療判斷。</p>
        </article>
        <article class="team-role">
          <span class="team-role__media">
            <img src="/assets/img/stock-clinical-hands.jpg" alt="戴手套進行療程操作情境" width="1800" height="1197" loading="lazy">
          </span>
          <span class="team-role__no">02</span>
          <h3>主治醫師</h3>
          <p>檢視膚況、病史與用藥情形，決定療程是否適合、次數與間隔如何安排，並負責實際施作。</p>
        </article>
        <article class="team-role">
          <span class="team-role__media">
            <img src="/assets/img/stock-skincare-smile.jpg" alt="日常保養情境" width="1800" height="1199" loading="lazy">
          </span>
          <span class="team-role__no">03</span>
          <h3>美學團隊</h3>
          <p>就整體比例與協調性提供建議，作為醫師規劃時的參考；不涉及療程的醫療決策。</p>
        </article>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       5. 頁尾 CTA
       ===================================================================== -->
  <section class="section section--tight team-cta">
    <div class="container--narrow team-cta__inner">
      <h2>想指定醫師看診？</h2>
      <p>各醫師的看診院區與時段不同，預約時可指定；若不確定該找誰，也可先由門診安排。</p>
      <div class="team-cta__actions">
        <a class="btn btn--primary ext" href="https://booking.20skin.tw/MainMs/Login" target="_blank" rel="noopener external">立即預約</a>
        <a class="btn btn--ghost" href="/clinics/">查看據點與時段</a>
      </div>
    </div>
  </section>
</template>
