<script setup lang="ts">
// 模板 14 —— 案例內頁（mockup/15-case-detail.html）
//
// ⚠️ 法規揭露欄位是必填，不是裝飾（docs/02-backend-cms.md §1、docs/08-database.md §C-5）：
//   - 拍攝條件（ShootingConditions）→ 術前／術後圖說的 figcaption
//   - 個案差異聲明（IndividualVarianceStatement）→ 內文結尾的警示區塊
//   - 當事人書面同意（HasWrittenConsent）與同意書索引（ConsentReference）
//     是後台稽核用的資料庫欄位，同意書本身不進系統，「只存索引」——
//     所以這兩項不在前台頁面顯示，資料形狀仍保留在 ~/data/cases.ts 供後台對照。
//
// 案例頁的 JSON-LD 只用 breadcrumbJsonLd()，不輸出會被當成療效保證的結構化資料。
import { findCaseDetail, getCaseDetails } from '~/data/cases'

const CASE_DETAILS = await getCaseDetails()

const route = useRoute()
const slug = route.params.slug as string
const item = await findCaseDetail(slug)

if (!item) {
  throw createError({ statusCode: 404, statusMessage: '找不到這個案例頁面', fatal: true })
}

const moreCases = computed(() =>
  CASE_DETAILS.filter((c) => c.slug !== item!.slug).slice(0, 3),
)

usePageHead({
  // 後台 SEO 區塊的覆寫（標題／描述／OG 圖／canonical／noindex／結構化資料）。
  // ⚠️ 讀的是已核准的版本快照，所以後台改完要重新發布才會生效。
  seo: item.seo,
  title: `${item.title}｜案例分享`,
  description: `${item.facts.condition}${item.title}紀錄，${item.facts.sessions}、${item.facts.period}。反應因個人體質與膚況而異，需經醫師面診評估。`,
  pageCss: '/assets/pages/15-case-detail.css',
  path: `/cases/${item.slug}/`,
  jsonLd: breadcrumbJsonLd([
    { label: '首頁', href: '/' },
    { label: '案例分享', href: '/cases/' },
    { label: item.title, href: `/cases/${item.slug}/` },
  ]),
})
</script>

<template>
  <!-- =====================================================================
       麵包屑
       ===================================================================== -->
  <nav class="c-breadcrumb" aria-label="麵包屑">
    <div class="container--narrow">
      <ol class="c-breadcrumb__list">
        <li><a href="/">首頁</a></li>
        <li><a href="/cases/">案例分享</a></li>
        <li><span class="c-breadcrumb__current" aria-current="page">{{ item.title }}</span></li>
      </ol>
    </div>
  </nav>

  <!-- =====================================================================
       1. 頁首
       ===================================================================== -->
  <header class="case-head">
    <div class="container--narrow">
      <a class="c-tag" :href="item.concernHref">{{ item.concernLabel }}</a>
      <h1>{{ item.title }}</h1>
      <p class="case-head__lede">{{ item.lede }}</p>
    </div>
  </header>

  <!-- =====================================================================
       2. 術前／術後（法規揭露：拍攝條件）
       ===================================================================== -->
  <figure class="case-ba">
    <div class="container--narrow">
      <div class="case-ba__grid">
        <div class="case-ba__pane">
          <span class="case-ba__badge">BEFORE</span>
        </div>
        <div class="case-ba__pane">
          <span class="case-ba__badge">AFTER</span>
        </div>
      </div>
      <figcaption>拍攝條件：{{ item.shootingConditions }}</figcaption>
    </div>
  </figure>

  <div class="container--narrow">
    <!-- =====================================================================
         3. 個案條件（後台「案例」模組的揭露欄位）
         ===================================================================== -->
    <table class="c-facts case-facts">
      <caption class="visually-hidden">個案條件與療程摘要</caption>
      <tbody>
        <tr><th scope="row">個案條件</th><td>{{ item.facts.condition }}</td></tr>
        <tr><th scope="row">主要困擾</th><td>{{ item.facts.mainConcern }}</td></tr>
        <tr><th scope="row">療程項目</th><td><a :href="item.facts.treatmentHref">{{ item.facts.treatmentName }}</a></td></tr>
        <tr><th scope="row">療程次數</th><td>{{ item.facts.sessions }}</td></tr>
        <tr><th scope="row">療程期間</th><td>{{ item.facts.period }}</td></tr>
        <tr>
          <th scope="row">主治醫師</th>
          <td>
            <a v-if="item.facts.doctorHref" :href="item.facts.doctorHref">{{ item.facts.doctorName }}</a>
            <template v-else>{{ item.facts.doctorName }}</template>
          </td>
        </tr>
        <tr><th scope="row">恢復期</th><td>{{ item.facts.recovery }}</td></tr>
      </tbody>
    </table>

    <!-- =====================================================================
         4. 內文（法規揭露：個案差異聲明）
         ===================================================================== -->
    <article class="case-content">
      <template v-for="section in item.sections" :key="section.heading">
        <h2>{{ section.heading }}</h2>
        <p v-for="(p, i) in section.paragraphs" :key="i">{{ p }}</p>
      </template>

      <h2>實際的療程歷程</h2>
      <div class="case-timeline">
        <div v-for="step in item.timeline" :key="step.when" class="case-timeline__item">
          <span class="case-timeline__when">{{ step.when }}</span>
          <div class="case-timeline__what">
            <h3>{{ step.title }}</h3>
            <p>{{ step.text }}</p>
          </div>
        </div>
      </div>

      <h2>個案自述</h2>
      <p>{{ item.testimonial }}</p>

      <div class="c-note c-note--warn">
        <span class="c-note__icon" aria-hidden="true">&#9888;</span>
        <p>{{ item.individualVarianceStatement }}</p>
      </div>
    </article>

    <!-- =====================================================================
         5. 醫師說明
         ===================================================================== -->
    <div class="case-doctor">
      <img
        class="case-doctor__avatar"
        :src="item.doctorQuote.avatar.src"
        :alt="item.doctorQuote.avatar.alt"
        :width="item.doctorQuote.avatar.width"
        :height="item.doctorQuote.avatar.height"
        loading="lazy"
      >
      <div>
        <h3 class="case-doctor__name">{{ item.doctorQuote.name }}</h3>
        <p class="case-doctor__role">{{ roleText(item.doctorQuote.role) }}</p>
        <p class="case-doctor__quote">{{ item.doctorQuote.quote }}</p>
        <a v-if="item.doctorQuote.href" class="case-doctor__more" :href="item.doctorQuote.href">查看醫師頁面 →</a>
      </div>
    </div>
  </div>

  <!-- =====================================================================
       6. 本案例使用的療程
       ===================================================================== -->
  <section class="section section--alt" id="treatments">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">TREATMENTS USED</span>
          <h2>本案例使用的療程</h2>
          <p>由後台「案例」模組的關聯療程欄位帶出，不在內文手動插入連結。</p>
        </div>
        <a class="c-sechead__more" href="/treatments/">查看全部療程 →</a>
      </div>

      <div class="grid grid--3">
        <article v-for="t in item.treatmentsUsed" :key="t.name" class="c-card c-card--treatment">
          <div class="c-card__media">
            <img :src="t.image.src" :alt="t.image.alt" :width="t.image.width" :height="t.image.height" loading="lazy">
          </div>
          <div class="c-card__body">
            <h3 class="c-card__title"><a :href="t.href">{{ t.name }}</a></h3>
            <p class="c-card__excerpt">{{ t.excerpt }}</p>
          </div>
        </article>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       7. 其他案例
       ===================================================================== -->
  <section v-if="moreCases.length" class="section" id="more-cases">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">MORE CASES</span>
          <h2>其他案例</h2>
          <p>條件相近的個案紀錄，參考時請一併留意年齡層與起點膚況的差異。</p>
        </div>
        <a class="c-sechead__more" href="/cases/">查看全部案例 →</a>
      </div>

      <div class="grid grid--3">
        <article v-for="more in moreCases" :key="more.slug" class="c-card">
          <div class="cases-card__ba">
            <div class="cases-card__pane"><span class="cases-card__badge">BEFORE</span></div>
            <div class="cases-card__pane"><span class="cases-card__badge">AFTER</span></div>
          </div>
          <div class="cases-card__body">
            <h3 class="cases-card__title"><a :href="`/cases/${more.slug}/`">{{ more.title }}</a></h3>
            <div class="cases-card__facts"><span>{{ more.facts.condition }}</span><span>{{ more.facts.sessions }}</span></div>
          </div>
        </article>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       7b. 從紀錄，到你的規劃（左圖右文，收尾意象圖）
       ===================================================================== -->
  <section class="section case-band">
    <div class="container case-band__layout">
      <div class="case-band__media">
        <img src="/assets/img/stock-bamboo-corridor.jpg" alt="木格柵長廊與竹意象" width="1800" height="1199" loading="lazy">
      </div>
      <div class="case-band__copy">
        <div class="c-sechead">
          <div class="c-sechead__text">
            <span class="u-eyebrow">NEXT STEP</span>
            <h2>從紀錄，到你的規劃</h2>
          </div>
        </div>
        <p>案例只能參考，實際的次數、間隔與可行性，仍需由醫師依你的膚況評估。</p>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       8. 頁尾 CTA
       ===================================================================== -->
  <section class="section section--alt section--tight case-cta">
    <div class="container--narrow case-cta__inner">
      <h2>你的狀況會是怎麼規劃？</h2>
      <p>案例只能參考，實際的次數、間隔與可行性需由醫師依你的膚況評估。</p>
      <div class="case-cta__actions">
        <a class="btn btn--primary ext" href="https://booking.20skin.tw/MainMs/Login" target="_blank" rel="noopener external">立即預約</a>
        <a class="btn btn--ghost" :href="item.facts.treatmentHref">查看療程說明</a>
      </div>
    </div>
  </section>
</template>
