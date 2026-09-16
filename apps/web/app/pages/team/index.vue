<script setup lang="ts">
// 模板 4 —— 醫療團隊列表（mockup/11-team-list.html）
//
// 🔴 **兩排篩選 2026-09-16 才真的接上。** 在那之前它們是照抄 mockup 的裝飾：
//    專長那四顆是寫死的 `href="#"`、按下去毫無反應；
//    「院區：」那排更糟 —— 看起來是篩選，連到的卻是 `/clinics/siji/`（據點頁），
//    按下去會直接離開團隊列表。
//
// ⚠️ **用查詢字串做，不做 client 端顯示／隱藏。** SSR 之下前者不需要 JS、
//    可以分享網址、也能被正確算繪；後者會讓「篩選後的畫面」在 HTML 裡看不出來。
import { getDoctors } from '~/data/doctors'

const route = useRoute()

const ALL_DOCTORS = await getDoctors()

// 🔴 **這四個詞保留 mockup 的寫死清單**（Tim 定案 2026-09-16）——
//    後台實際有 14 個 type 1 專長標籤，全列出來會變成 14 顆按鈕，
//    與客戶選定的版面差太多。代價是「另外 10 個標籤沒有入口」，那是刻意的取捨。
// ⚠️ 這四個詞**必須真的存在於後台的標籤裡**，否則按下去會篩出零個人 ——
//    而畫面上看不出是資料對不上還是真的沒有醫師。下面有 dev 期的檢查擋著。
const FOCUS_TABS = ['皮膚疾病', '雷射光電', '注射微整', '體態管理'] as const

if (import.meta.dev) {
  const actual = new Set(ALL_DOCTORS.flatMap((d) => d.tags))
  const missing = FOCUS_TABS.filter((t) => !actual.has(t))
  if (missing.length > 0) {
    throw new Error(
      `[team] 篩選列寫死的專長「${missing.join('、')}」在後台的醫師標籤裡找不到 —— `
      + '按下去會是空清單。請同步修改 FOCUS_TABS 或後台標籤。',
    )
  }
}

const CLINIC_TABS = [
  { slug: 'siji', label: '四季診所' },
  { slug: 'erlin', label: '二林四季皮膚科' },
] as const

const focus = computed(() => {
  const q = route.query.focus
  const v = typeof q === 'string' ? q : ''
  return (FOCUS_TABS as readonly string[]).includes(v) ? v : ''
})
const site = computed(() => {
  const q = route.query.site
  const v = typeof q === 'string' ? q : ''
  return CLINIC_TABS.some((c) => c.slug === v) ? v : ''
})

/** 兩個條件是**交集**（既是雷射光電、又在二林）。切換其中一個時保留另一個。 */
const DOCTORS = computed(() => ALL_DOCTORS.filter((d) =>
  (!focus.value || d.tags.includes(focus.value))
  && (!site.value || d.clinics.some((c) => c.clinicSlug === site.value)),
))

/** 切換其中一個條件、保留另一個的網址。傳 '' 代表取消該條件。 */
function hrefWith(patch: { focus?: string, site?: string }) {
  const next = { focus: focus.value, site: site.value, ...patch }
  const qs = new URLSearchParams()
  if (next.focus) qs.set('focus', next.focus)
  if (next.site) qs.set('site', next.site)
  const q = qs.toString()
  return q ? `/team/?${q}` : '/team/'
}

// 說明文字與 JSON-LD 一律以**全體**為準 —— 篩選只是檢視方式，
// 「團隊共 14 位」不會因為你點了雷射光電就變成 9 位。
const physicianCount = ALL_DOCTORS.filter((d) => d.isPhysician).length
const nonPhysicianCount = ALL_DOCTORS.length - physicianCount

usePageHead({
  title: '醫療團隊',
  description: `20SKIN 美醫集團醫療團隊共 ${ALL_DOCTORS.length} 位成員（${physicianCount} 位醫師與 ${nonPhysicianCount} 位藝術總監），涵蓋皮膚科、家庭醫學科與肥胖醫學等專科背景。`,
  pageCss: '/assets/pages/11-team-list.css',
  path: '/team/',
  // ⚠️ **篩選只是檢視方式，不是另一個頁面** —— canonical 一律指回 `/team/`（上面那行），
  //    帶條件的網址因此不會被當成獨立頁面收錄。
  // 🔴 **刻意不加 `noIndex`。** 同時輸出 noindex 與指向別頁的 canonical 是互相衝突的訊號
  //    （Google 可能忽略 canonical，或把 noindex 一併算到目標頁上）。二選一，這裡選 canonical。
  //    ⚠️ 與 `/blog/page/2/` 的做法不同是刻意的：那些是**不同的內容**（第 2 頁有別的文章），
  //    所以 self-canonical 且可被索引；這裡是同一批人的子集。
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: '醫療團隊',
      description: `20SKIN 美醫集團醫療團隊成員一覽，共 ${ALL_DOCTORS.length} 位成員：${physicianCount} 位醫師與 ${nonPhysicianCount} 位藝術總監。`,
    },
    breadcrumbJsonLd([
      { label: '首頁', href: '/' },
      { label: '醫療團隊', href: '/team/' },
    ]),
  ],
})

/** 卡片上顯示的看診院區，多院區以頓號連接（例如黃勇學：四季診所、二林四季皮膚科）。 */
function siteLabel(doctor: (typeof ALL_DOCTORS)[number]) {
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
      <!-- ⚠️ Hero 與下方註記講的是**整個團隊**，不隨篩選變動 ——
           點了「雷射光電」不會讓團隊變成 9 位。 -->
      <p class="team-hero__lede">兩個院區共 {{ ALL_DOCTORS.length }} 位成員，涵蓋皮膚科、家庭醫學科與肥胖醫學等專科背景。療程規劃一律由醫師面診評估後決定。</p>
      <p class="team-hero__count">共 <strong>{{ ALL_DOCTORS.length }}</strong> 位成員（{{ physicianCount }} 位醫師 ＋ {{ nonPhysicianCount }} 位藝術總監）</p>
    </div>
  </section>

  <!-- =====================================================================
       2. 篩選列（示意：正式站由後台專長 tag 自動產生，此處尚未串接篩選邏輯）
       ===================================================================== -->
  <section class="team-filters">
    <div class="container team-filters__row">
      <nav class="c-tabs" aria-label="依專長篩選">
        <div class="c-tabs__list">
          <a
            class="c-tabs__btn" :href="hrefWith({ focus: '' })"
            :aria-selected="!focus" :aria-current="!focus ? 'page' : undefined"
          >全部成員</a>
          <a
            v-for="tab in FOCUS_TABS" :key="tab"
            class="c-tabs__btn" :href="hrefWith({ focus: tab })"
            :aria-selected="focus === tab" :aria-current="focus === tab ? 'page' : undefined"
          >{{ tab }}</a>
        </div>
      </nav>

      <div class="team-sites" role="group" aria-label="依院區篩選">
        <span class="team-sites__label">院區：</span>
        <!-- ⚠️ 這裡原本連到 `/clinics/siji/`（據點頁）—— 看起來是篩選、按下去卻離開這一頁。 -->
        <a class="c-tag" :class="{ 'is-active': !site }" :href="hrefWith({ site: '' })">全部</a>
        <a
          v-for="c in CLINIC_TABS" :key="c.slug"
          class="c-tag" :class="{ 'is-active': site === c.slug }" :href="hrefWith({ site: c.slug })"
        >{{ c.label }}</a>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       3. 成員格（全員展開，不做橫向捲動 —— 團隊規模本身就是說服力）
       ===================================================================== -->
  <section class="section section--tight" id="members">
    <div class="container">
      <!-- ⚠️ 組合條件可能篩不到人（例如「體態管理 ＋ 二林」）——
           空清單要說話，不能只留一片空白讓人以為頁面壞了。
           ⚠️ 用這一頁既有的 `c-note`，不自建樣式（verify:css 會擋下發明的 class）。 -->
      <p v-if="DOCTORS.length === 0" class="c-note team-note">
        <span class="c-note__icon" aria-hidden="true">&#9432;</span>
        目前這個條件下沒有符合的成員。<a :href="hrefWith({ focus: '', site: '' })">查看全部 {{ ALL_DOCTORS.length }} 位成員</a>
      </p>

      <div v-else class="grid grid--4">
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
        團隊共 {{ ALL_DOCTORS.length }} 位成員，其中 {{ physicianCount }} 位為醫師，安喬（許媖琄）為藝術總監兼執行長、亦為「新中式美學」創始人，不具醫師身分、不從事醫療行為。
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
