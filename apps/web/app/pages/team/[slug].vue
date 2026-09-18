<script setup lang="ts">
// 模板 5 —— 醫師個人頁（mockup/05-doctor-detail.html）
//
// mockup 只給了黃勇學一份完整內容，其餘 13 位僅有 name/slug/jobTitle/tags/clinics。
// 本頁每一段落都以 v-if 檢查資料是否存在，缺資料就整段不渲染，不補假內容
// （app/data/doctors.ts 開頭已說明原因）。
import { getDoctors } from '~/data/doctors'

const [DOCTORS, CLINICS] = await Promise.all([getDoctors(), getClinics()])

// ⚠️ 據點在 <template> 裡被查好幾次，而 template 不能 await ——
//    在 setup 先取好，用同步 find。
const findClinic = (s: string) => CLINICS.find((c) => c.slug === s)
import { getClinics } from '~/data/clinics'

const route = useRoute()
const slug = route.params.slug as string
const doctor = DOCTORS.find((d) => d.slug === slug)

if (!doctor) {
  throw createError({ statusCode: 404, statusMessage: '找不到這位成員' })
}

const clinicNames: Record<'siji' | 'erlin', string> = { siji: '四季診所', erlin: '二林四季皮膚科' }

const heroRole = doctor.heroRole ?? doctor.jobTitle
const displayTags = doctor.expertiseTags ?? doctor.tags

/** 同院區其他醫師：至少共用一個看診據點、排除自己，最多列 4 位（對齊 grid--4）。 */
const colleagues = DOCTORS.filter(
  (d) => d.slug !== doctor.slug && d.clinics.some((c) => doctor.clinics.some((dc) => dc.clinicSlug === c.clinicSlug)),
).slice(0, 4)

const jsonLd = (() => {
  const base: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': doctor.isPhysician ? 'Physician' : 'Person',
    name: doctor.isPhysician ? `${doctor.name} 醫師` : doctor.name,
    jobTitle: roleText(heroRole),
    worksFor: {
      '@type': 'MedicalOrganization',
      name: '20SKIN 美醫集團',
    },
  }
  if (doctor.specialty) base.medicalSpecialty = doctor.specialty
  const alumniOf = doctor.timeline?.filter((t) => t.label === '學歷').map((t) => t.text)
  if (alumniOf?.length) base.alumniOf = alumniOf
  if (doctor.certifications?.length) {
    base.hasCredential = doctor.certifications.map((c) => ({ '@type': 'EducationalOccupationalCredential', name: c }))
  }
  base.availableAtOrFrom = doctor.clinics.map((c) => ({
    '@type': 'MedicalClinic',
    name: clinicNames[c.clinicSlug],
    address: findClinic(c.clinicSlug)?.address,
  }))
  return base
})()

usePageHead({
  // 後台 SEO 區塊的覆寫（標題／描述／OG 圖／canonical／noindex／結構化資料）。
  // ⚠️ 讀的是已核准的版本快照，所以後台改完要重新發布才會生效。
  seo: doctor.seo,
  title: doctor.isPhysician ? `${doctor.name} ${roleLines(doctor.jobTitle)[0] ?? ''}`.trim() : doctor.name,
  description: doctor.isPhysician
    ? `${doctor.name}醫師，20SKIN美醫集團${roleText(doctor.jobTitle)}${doctor.specialty ? `，${doctor.specialty}專科醫師` : ''}，於${doctor.clinics.map((c) => clinicNames[c.clinicSlug]).join('、')}看診。`
    : `${doctor.name}，20SKIN美醫集團${roleText(doctor.jobTitle)}。`,
  pageCss: '/assets/pages/05-doctor-detail.css',
  path: `/team/${doctor.slug}/`,
  jsonLd: [
    jsonLd,
    breadcrumbJsonLd([
      { label: '首頁', href: '/' },
      { label: '醫療團隊', href: '/team/' },
      { label: doctor.name, href: `/team/${doctor.slug}/` },
    ]),
  ],
})
</script>

<template>
  <!-- =====================================================================
       麵包屑
       ===================================================================== -->
  <div class="c-breadcrumb">
    <div class="container">
      <ul class="c-breadcrumb__list">
        <li><a href="/">首頁</a></li>
        <li><a href="/team/">醫療團隊</a></li>
        <li><span class="c-breadcrumb__current">{{ doctor.name }}</span></li>
      </ul>
    </div>
  </div>

  <!-- =====================================================================
       1. 頁首：大頭照＋基本資料
       ===================================================================== -->
  <section class="doc-hero">
    <div class="container doc-hero__layout">
      <div class="doc-hero__frame">
        <img
          :src="doctor.photo.src"
          :alt="`${doctor.name} ${doctor.isPhysician ? '診間人像照' : '人像照'}`"
          :width="doctor.photo.width"
          :height="doctor.photo.height"
        >
      </div>

      <div class="doc-hero__body">
        <span class="u-eyebrow">OUR TEAM</span>
        <h1 class="doc-hero__title">{{ doctor.name }}</h1>
        <p class="doc-hero__role">
          <span v-for="line in roleLines(heroRole)" :key="line">{{ line }}</span>
        </p>
        <div v-if="doctor.specialty" class="doc-hero__tags">
          <span class="c-tag">{{ doctor.specialty }}</span>
        </div>
        <p v-if="doctor.lede" class="doc-hero__lede">{{ doctor.lede }}</p>

        <table class="c-facts doc-hero__facts">
          <tbody>
            <tr v-if="doctor.yearsInPractice"><th>執業年資</th><td>{{ doctor.yearsInPractice }}</td></tr>
            <tr>
              <th>看診據點</th>
              <td>{{ doctor.clinics.length }} 處（{{ doctor.clinics.map((c) => clinicNames[c.clinicSlug]).join('、') }}）</td>
            </tr>
            <tr v-if="doctor.specialty"><th>專科別</th><td>{{ doctor.specialty }}</td></tr>
          </tbody>
        </table>

        <div class="doc-hero__cta">
          <a class="btn btn--primary ext" href="https://booking.20skin.tw/MainMs/Login" target="_blank" rel="noopener external">立即預約</a>
        </div>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       2. 簡介
       ===================================================================== -->
  <section v-if="doctor.bio?.length" class="section section--tight">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">ABOUT</span>
          <h2>{{ doctor.isPhysician ? '醫師簡介' : '簡介' }}</h2>
        </div>
      </div>
      <div class="doc-prose">
        <p v-for="(paragraph, i) in doctor.bio" :key="i">{{ paragraph }}</p>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       3. 學歷與經歷
       ===================================================================== -->
  <section v-if="doctor.timeline?.length" class="section section--tight">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">EDUCATION &amp; EXPERIENCE</span>
          <h2>學歷與經歷</h2>
        </div>
      </div>

      <ol class="doc-timeline">
        <li v-for="(entry, i) in doctor.timeline" :key="i" class="doc-timeline__item">
          <span class="doc-timeline__label">{{ entry.label }}</span>
          <p class="doc-timeline__text">{{ entry.text }}</p>
        </li>
      </ol>
    </div>
  </section>

  <!-- =====================================================================
       4. 證照與學會資格
       ===================================================================== -->
  <section v-if="doctor.certifications?.length" class="section section--alt section--tight">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">CERTIFICATIONS</span>
          <h2>證照與學會資格</h2>
        </div>
      </div>

      <ul class="doc-creds">
        <li v-for="cert in doctor.certifications" :key="cert" class="doc-creds__item">
          <span class="doc-creds__icon" aria-hidden="true"></span>{{ cert }}
        </li>
      </ul>
    </div>
  </section>

  <!-- =====================================================================
       5. 專長領域
       ===================================================================== -->
  <section v-if="displayTags.length" class="section section--alt section--tight">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">EXPERTISE</span>
          <h2>專長領域</h2>
        </div>
      </div>
      <div class="doc-hero__tags">
        <span v-for="tag in displayTags" :key="tag" class="c-tag">{{ tag }}</span>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       6. 專長療程
       ===================================================================== -->
  <section v-if="doctor.treatments?.length" class="section">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">TREATMENTS</span>
          <h2>專長療程</h2>
          <p>由{{ doctor.name }}{{ doctor.isPhysician ? '醫師' : '' }}依專長領域規劃執行的療程項目。</p>
        </div>
        <a class="c-sechead__more" href="/treatments/">查看全部療程 →</a>
      </div>

      <div class="grid grid--4">
        <article v-for="treatment in doctor.treatments" :key="treatment.slug" class="c-card c-card--treatment">
          <div class="c-card__media">
            <img
              :src="treatment.image.src"
              :alt="treatment.image.alt"
              :width="treatment.image.width"
              :height="treatment.image.height"
              loading="lazy"
            >
          </div>
          <div class="c-card__body">
            <span class="c-tag c-card__tag">{{ treatment.categoryLabel }}</span>
            <h3 class="c-card__title">
              <a :href="`/treatments/${treatment.categorySlug}/${treatment.slug}/`">{{ treatment.name }}</a>
            </h3>
          </div>
        </article>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       7. 具名／審閱文章
       ===================================================================== -->
  <section v-if="doctor.articles?.length" class="section">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">ARTICLES</span>
          <h2>精選文章</h2>
          <p>由{{ doctor.name }}{{ doctor.isPhysician ? '醫師' : '' }}撰寫或審閱的醫美新知與皮膚新知。</p>
        </div>
        <a class="c-sechead__more" href="/blog/">查看全部文章 →</a>
      </div>

      <div class="grid grid--4">
        <article v-for="(article, i) in doctor.articles" :key="i" class="c-card c-card--article">
          <div class="c-card__media">
            <img
              :src="article.image.src"
              :alt="article.image.alt"
              :width="article.image.width"
              :height="article.image.height"
              loading="lazy"
            >
          </div>
          <div class="c-card__body">
            <span class="c-tag c-card__tag">{{ article.category }}</span>
            <!-- ⚠️ 正式站的文章 slug 尚未確定（見 app/data/doctors.ts 註解），暫連到列表頁 -->
            <h3 class="c-card__title"><a href="/blog/">{{ article.title }}</a></h3>
            <p class="c-card__excerpt">{{ article.excerpt }}</p>
            <div class="c-card__meta">
              <span>{{ article.byline }}</span>
              <span>{{ article.date }}</span>
            </div>
          </div>
        </article>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       8. 看診據點與時段（顯示各院區的一般門診時段，非此醫師的個人專屬時段）
       ===================================================================== -->
  <section class="section section--alt">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">CLINIC HOURS</span>
          <h2>看診據點與時段</h2>
        </div>
      </div>

      <div class="grid grid--2">
        <div v-for="assignment in doctor.clinics" :key="assignment.clinicSlug" class="doc-clinic">
          <h3 class="doc-clinic__name c-heading-bar">
            <a :href="`/clinics/${assignment.clinicSlug}/`">{{ clinicNames[assignment.clinicSlug] }}</a>
          </h3>
          <p v-if="assignment.scheduleNote">
            <span class="u-eyebrow">本院區時段</span>{{ assignment.scheduleNote }}
          </p>
          <template v-if="findClinic(assignment.clinicSlug)">
            <table class="c-hours">
              <caption class="visually-hidden">{{ clinicNames[assignment.clinicSlug] }}門診時間表</caption>
              <thead>
                <tr>
                  <th scope="col" class="c-hours__corner">門診時間</th>
                  <th scope="col">一</th>
                  <th scope="col">二</th>
                  <th scope="col">三</th>
                  <th scope="col">四</th>
                  <th scope="col">五</th>
                  <th scope="col">六</th>
                  <th scope="col">日</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in findClinic(assignment.clinicSlug)!.hoursTable" :key="row.label">
                  <th scope="row">{{ row.label }}</th>
                  <td v-for="(open, i) in row.days" :key="i" :class="{ 'c-hours__cell--off': !open }">
                    <span v-if="open" class="c-hours__mark" aria-hidden="true"></span>
                    <span class="visually-hidden">{{ open ? '看診' : '休診' }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <p class="c-hours__foot">{{ findClinic(assignment.clinicSlug)!.hoursFootnote }}</p>
          </template>
        </div>
      </div>

      <p class="c-note"><span class="c-note__icon" aria-hidden="true">i</span>實際看診時段以現場公告為準，看診醫師依排班機動調整，建議先以電話或 LINE 確認。</p>
    </div>
  </section>

  <!-- =====================================================================
       9. 第三方提及／著作與演講
       ⚠️ 標題 2026-09-18 由「媒體報導與演講授課」改成「著作與演講」（Tim 指定）——
       後台那個欄位叫「著作」，兩邊講的是同一份資料卻不同名。後台同步改成
       「著作與演講」（`apps/admin/src/units/doctor.ts`），**兩邊要一起改**。
       ⚠️ 與臻美分享的「媒體報導」「演講授課」兩個文章分類**沒有關係** ——
       那是文章的分類，這一區是醫師自己那筆內容的欄位。
       ===================================================================== -->
  <section v-if="doctor.media?.length" class="section section--alt">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">PUBLICATIONS &amp; TALKS</span>
          <h2>著作與演講</h2>
        </div>
      </div>

      <ul class="doc-media">
        <li v-for="(item, i) in doctor.media" :key="i" class="doc-media__item">
          <a class="doc-media__title ext" href="#" target="_blank" rel="noopener external">{{ item.title }}</a>
          <span class="doc-media__meta">{{ item.meta }}</span>
        </li>
      </ul>
    </div>
  </section>

  <!-- =====================================================================
       10. 同院區其他醫師
       ===================================================================== -->
  <section v-if="colleagues.length" class="section">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">OUR TEAM</span>
          <h2>同院區其他醫師</h2>
        </div>
        <a class="c-sechead__more" href="/team/">查看全部 {{ DOCTORS.length }} 位醫師 →</a>
      </div>

      <div class="grid grid--4">
        <article v-for="colleague in colleagues" :key="colleague.slug" class="c-card c-card--doctor">
          <div class="c-card__media">
            <img
              :src="colleague.photo.src"
              :alt="`${colleague.name} ${roleText(colleague.jobTitle)}`"
              :width="colleague.photo.width"
              :height="colleague.photo.height"
              loading="lazy"
            >
          </div>
          <div class="c-card__body">
            <h3 class="c-card__title"><a :href="`/team/${colleague.slug}/`">{{ colleague.name }}</a></h3>
            <div class="c-card__meta">
              <span v-for="line in roleLines(colleague.isPhysician ? '醫師' : colleague.jobTitle)" :key="line">{{ line }}</span>
            </div>
          </div>
        </article>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       11. 頁尾 CTA
       ===================================================================== -->
  <section class="section section--alt doc-cta">
    <div class="container doc-cta__inner">
      <span class="u-eyebrow">APPOINTMENT</span>
      <h2 v-if="doctor.isPhysician">與{{ doctor.name }}醫師預約諮詢</h2>
      <h2 v-else>認識{{ doctor.name }}與新中式美學</h2>
      <p v-if="doctor.isPhysician">由醫師親自評估膚況，規劃合適的治療方向。</p>
      <p v-else>安喬是 20SKIN 美醫集團藝術總監兼執行長，也是「新中式美學」的創始人。</p>
      <div class="doc-cta__actions">
        <a v-if="doctor.isPhysician" class="btn btn--primary ext" href="https://booking.20skin.tw/MainMs/Login" target="_blank" rel="noopener external">立即預約</a>
        <a v-else class="btn btn--primary" href="/about/new-chinese-aesthetics/">認識新中式美學</a>
      </div>
    </div>
  </section>
</template>
