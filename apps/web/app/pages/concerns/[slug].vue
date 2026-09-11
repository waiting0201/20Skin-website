<script setup lang="ts">
// 模板 10 —— 困擾細節（mockup/02-concern-detail.html）
//
// 8 個困擾共用這一支動態路由。目前只有 acne（痘痘・粉刺）在 mockup 裡有完整內文，
// 其餘 7 個困擾只有總覽頁上的一句話簡述可用（見 ~/data/concerns.ts 開頭的說明），
// 所以下面用 concern.detail 是否存在，切成「完整版」與「精簡版」兩種渲染路徑 ——
// 精簡版不是偷懶，是不替後台還沒寫的醫療文案捏造內容。
import { findConcern, CONCERN_TREATMENT_CATEGORIES } from '~/data/concerns'

const route = useRoute()
const slug = route.params.slug as string
const concern = findConcern(slug)

if (!concern) {
  throw createError({ statusCode: 404, statusMessage: '找不到這個困擾頁面', fatal: true })
}

const jsonLdBlocks = computed(() => {
  const blocks: Record<string, unknown>[] = [
    breadcrumbJsonLd([
      { label: '首頁', href: '/' },
      { label: '肌膚困擾', href: '/concerns/' },
      { label: concern!.title, href: `/concerns/${concern!.slug}/` },
    ]),
  ]

  const medicalCondition: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'MedicalCondition',
    name: concern!.title,
    description: concern!.aiSummary,
  }

  if (concern!.detail) {
    medicalCondition.signOrSymptom = concern!.detail.types.map((t) => t.title)
    medicalCondition.cause = concern!.detail.causesFacts.map((f) => f.label)
    medicalCondition.possibleTreatment = concern!.detail.treatments.map((t) => ({
      '@type': 'MedicalTherapy',
      name: t.name,
      url: `https://20skin.tw${t.href}`,
    }))
  }

  blocks.push(medicalCondition)
  return blocks
})

usePageHead({
  title: `${concern.title}｜肌膚困擾`,
  description: concern.detail
    ? `${concern.title}的成因、自我判斷指引與建議療程方向，由 20SKIN 美醫集團皮膚科專科醫師團隊提供之照護說明。`
    : `${concern.title}的成因與判斷指引，由 20SKIN 美醫集團皮膚科專科醫師團隊提供之照護說明。`,
  pageCss: '/assets/pages/02-concern-detail.css',
  path: `/concerns/${concern.slug}/`,
  jsonLd: jsonLdBlocks.value,
})
</script>

<template>
  <!-- =====================================================================
       0. 頁首：麵包屑 + H1 + 情境圖
       ===================================================================== -->
  <section class="concern-head">
    <div class="container concern-head__layout">
      <div class="concern-head__copy">
        <nav class="c-breadcrumb" aria-label="麵包屑">
          <ol class="c-breadcrumb__list">
            <li><a href="/">首頁</a></li>
            <li><a href="/concerns/">肌膚困擾</a></li>
            <li><span class="c-breadcrumb__current" aria-current="page">{{ concern.title }}</span></li>
          </ol>
        </nav>

        <div class="concern-head__icon-row">
          <img class="concern-head__icon" :src="concern.icon.src" :alt="concern.icon.alt" width="40" height="40">
          <span class="u-eyebrow">{{ concern.eyebrow }}</span>
        </div>
        <h1>{{ concern.title }}</h1>

        <!-- AI 摘要：40–60 字直答式段落，頁面第一段可見文字，同時輸出至 JSON-LD（docs/03-seo-geo.md §4 ②） -->
        <p class="concern-head__lede">{{ concern.aiSummary }}</p>
        <p v-if="concern.lede !== concern.aiSummary">{{ concern.lede }}</p>

        <div v-if="concern.relatedConcernSlugs.length" class="concern-head__related">
          <span class="concern-head__related-label">此困擾相關：</span>
          <a
            v-for="relSlug in concern.relatedConcernSlugs"
            :key="relSlug"
            class="c-tag c-tag--outline"
            :href="`/concerns/${relSlug}/`"
          >{{ findConcern(relSlug)?.title }}</a>
        </div>
      </div>

      <div class="concern-head__media">
        <div class="concern-head__frame">
          <img
            :src="concern.heroImage.src"
            :alt="concern.heroImage.alt"
            :width="concern.heroImage.width"
            :height="concern.heroImage.height"
          >
        </div>
      </div>
    </div>
  </section>

  <template v-if="concern.detail">
    <!-- =====================================================================
         1. 症狀描述
         ===================================================================== -->
    <section class="section">
      <div class="container concern-symptom__layout">
        <div class="concern-symptom__media">
          <img
            :src="concern.detail.symptomMedia.src"
            :alt="concern.detail.symptomMedia.alt"
            :width="concern.detail.symptomMedia.width"
            :height="concern.detail.symptomMedia.height"
            loading="lazy"
          >
        </div>
        <div class="concern-symptom__copy">
          <div class="c-sechead">
            <div class="c-sechead__text">
              <span class="u-eyebrow">UNDERSTANDING</span>
              <h2>{{ concern.detail.symptomHeading }}</h2>
            </div>
          </div>
          <p v-for="(p, i) in concern.detail.symptomParagraphs" :key="i">{{ p }}</p>
        </div>
      </div>
    </section>

    <!-- =====================================================================
         2. 成因
         ===================================================================== -->
    <section class="section section--alt">
      <div class="container container--narrow">
        <div class="c-sechead">
          <div class="c-sechead__text">
            <span class="u-eyebrow">WHY IT HAPPENS</span>
            <h2>{{ concern.detail.causesHeading }}</h2>
            <p>{{ concern.detail.causesIntro }}</p>
          </div>
        </div>
        <table class="c-facts">
          <tbody>
            <tr v-for="fact in concern.detail.causesFacts" :key="fact.label">
              <th>{{ fact.label }}</th>
              <td>{{ fact.text }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- =====================================================================
         3. 自我判斷指引 + 4. 何時該就醫
         ===================================================================== -->
    <section class="section">
      <div class="container">
        <div class="c-sechead">
          <div class="c-sechead__text">
            <span class="u-eyebrow">SELF CHECK</span>
            <h2>{{ concern.detail.selfCheckHeading }}</h2>
            <p>{{ concern.detail.selfCheckIntro }}</p>
          </div>
        </div>

        <div class="grid grid--2">
          <div v-for="type in concern.detail.types" :key="type.title" class="concern-type-card">
            <h4 class="c-heading-bar">{{ type.title }}</h4>
            <ul class="concern-type-card__list">
              <li v-for="point in type.points" :key="point">{{ point }}</li>
            </ul>
            <p class="concern-type-card__direction"><strong>照護方向：</strong>{{ type.direction }}</p>
          </div>
        </div>

        <div class="c-note c-note--warn concern-warn-note">
          <span class="c-note__icon" aria-hidden="true">!</span>
          <div>
            <h3>{{ concern.detail.warnHeading }}</h3>
            <p>出現以下狀況，建議儘早就診：</p>
            <ul class="concern-warn-list">
              <li v-for="item in concern.detail.warnItems" :key="item">{{ item }}</li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <!-- =====================================================================
         5. 針對此困擾的建議療程（主要轉換出口）
         ===================================================================== -->
    <section class="section section--alt" id="recommended-treatments">
      <div class="container">
        <div class="c-sechead">
          <div class="c-sechead__text">
            <span class="u-eyebrow">RECOMMENDED TREATMENTS</span>
            <h2>針對此困擾的建議療程</h2>
            <p class="concern-rx-intro">{{ concern.detail.treatmentsIntro }}</p>
          </div>
        </div>

        <p class="c-note concern-rx-note">{{ concern.detail.treatmentsNote }}</p>

        <div class="grid grid--3">
          <article v-for="(t, i) in concern.detail.treatments" :key="t.key" class="c-card c-card--treatment">
            <div class="c-card__media">
              <img :src="t.image.src" :alt="t.image.alt" :width="t.image.width" :height="t.image.height">
            </div>
            <div class="c-card__body">
              <span class="concern-rx-badge" aria-hidden="true">{{ String(i + 1).padStart(2, '0') }}</span>
              <div class="concern-rx-tagrow">
                <span v-if="t.topPick" class="c-tag concern-tag--top">最建議</span>
                <span class="c-tag c-card__tag">{{ t.categoryLabel }}</span>
                <span v-if="t.fitTag" class="c-tag c-tag--outline">{{ t.fitTag }}</span>
              </div>
              <h3 class="c-card__title"><a :href="t.href">{{ t.name }}</a></h3>
              <p class="c-card__excerpt">{{ t.excerpt }}</p>
              <span class="concern-rx-more" aria-hidden="true">了解更多 →</span>
            </div>
          </article>
        </div>
      </div>
    </section>

    <!-- =====================================================================
         6. 相關醫師
         ===================================================================== -->
    <section class="section">
      <div class="container">
        <div class="c-sechead">
          <div class="c-sechead__text">
            <span class="u-eyebrow">RELATED DOCTORS</span>
            <h2>相關醫師</h2>
            <p>{{ concern.detail.doctorsIntro }}</p>
          </div>
        </div>

        <div class="concern-doctors">
          <article v-for="doctor in concern.detail.doctors" :key="doctor.name" class="c-card c-card--doctor">
            <div class="c-card__media">
              <img :src="doctor.image.src" :alt="doctor.image.alt" :width="doctor.image.width" :height="doctor.image.height">
            </div>
            <div class="c-card__body">
              <h3 class="c-card__title">
                <a v-if="doctor.href" :href="doctor.href">{{ doctor.name }}</a>
                <template v-else>{{ doctor.name }}</template>
              </h3>
              <div class="c-card__meta"><span>{{ doctor.role }}</span></div>
            </div>
          </article>
        </div>
      </div>
    </section>

    <!-- =====================================================================
         7. 常見問題
         ===================================================================== -->
    <section class="section section--alt">
      <div class="container container--narrow">
        <div class="c-sechead">
          <div class="c-sechead__text">
            <span class="u-eyebrow">FAQ</span>
            <h2>常見問題</h2>
          </div>
        </div>
        <p class="concern-faq-updated">{{ concern.detail.faqUpdated }}</p>

        <div class="c-faq">
          <details v-for="faq in concern.detail.faqs" :key="faq.q" class="c-faq__item">
            <summary class="c-faq__q">{{ faq.q }}</summary>
            <div class="c-faq__a">
              <p>{{ faq.a }}</p>
            </div>
          </details>
        </div>
      </div>
    </section>

    <!-- =====================================================================
         8. 延伸閱讀
         ===================================================================== -->
    <section class="section">
      <div class="container">
        <div class="c-sechead">
          <div class="c-sechead__text">
            <span class="u-eyebrow">RELATED ARTICLES</span>
            <h2>延伸閱讀</h2>
            <p>與{{ concern.title }}照護相關的文章，由院內醫師與編輯部共同審核。</p>
          </div>
          <a class="c-sechead__more" href="/blog/">查看全部文章 →</a>
        </div>

        <div class="grid grid--4">
          <article v-for="article in concern.detail.articles" :key="article.title" class="c-card c-card--article">
            <div class="c-card__media">
              <img
                :src="article.image.src"
                :alt="article.image.alt"
                :width="article.image.width"
                :height="article.image.height"
              >
            </div>
            <div class="c-card__body">
              <span class="c-tag c-card__tag">{{ article.tag }}</span>
              <h3 class="c-card__title"><a :href="article.href">{{ article.title }}</a></h3>
              <p v-if="article.excerpt" class="c-card__excerpt">{{ article.excerpt }}</p>
              <div class="c-card__meta">
                <span v-for="m in article.meta" :key="m">{{ m }}</span>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  </template>

  <!-- =====================================================================
       精簡版：後台還沒有這個困擾的完整衛教文案時，只給方向不編內容
       ===================================================================== -->
  <template v-else>
    <section class="section" id="treatments">
      <div class="container">
        <div class="c-sechead">
          <div class="c-sechead__text">
            <span class="u-eyebrow">TREATMENTS</span>
            <h2>已經知道方向了？</h2>
            <p>這個困擾的完整衛教內容還在整理中，可以先從療程分類查看各項目的作用方式、恢復期與注意事項，或直接由醫師面診判斷。</p>
          </div>
          <a class="c-sechead__more" href="/treatments/">查看全部 27 項療程 →</a>
        </div>

        <div class="grid grid--4">
          <article v-for="cat in CONCERN_TREATMENT_CATEGORIES" :key="cat.href" class="c-card c-card--treatment">
            <div class="c-card__media">
              <img :src="cat.image.src" :alt="cat.image.alt" :width="cat.image.width" :height="cat.image.height" loading="lazy">
            </div>
            <div class="c-card__body">
              <h3 class="c-card__title"><a :href="cat.href">{{ cat.label }}</a></h3>
              <p class="c-card__excerpt">{{ cat.excerpt }}</p>
            </div>
          </article>
        </div>
      </div>
    </section>
  </template>

  <!-- =====================================================================
       9. 頁尾 CTA
       ===================================================================== -->
  <section class="section section--alt section--tight concern-cta">
    <div class="container container--narrow concern-cta__inner">
      <span class="u-eyebrow">NEXT STEP</span>
      <h2>還不確定哪一項療程適合自己？</h2>
      <p>每一位求美者的膚況與需求都不同，建議先與醫師面診討論，再規劃合適的照護方向。</p>
      <div class="concern-cta__actions">
        <a class="btn btn--primary ext" href="https://booking.20skin.tw/MainMs/Login" target="_blank" rel="noopener external">立即預約</a>
      </div>
    </div>
  </section>
</template>
