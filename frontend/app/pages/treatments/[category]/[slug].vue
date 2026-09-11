<script setup lang="ts">
// 模板 8 —— 療程細節（mockup/04-treatment-detail.html）
//
// 動態路由：/treatments/{category}/{slug}/，27 項療程的 slug 對照見
// docs/01-sitemap.md §1。mockup 只完整示範了「鉑金版蜂巢皮秒雷射」一項，
// 其餘 26 項目前只有 title / nameEn / categorySlug（docs/06-page-inventory.md
// §3：12 項無站內內容需從零撰寫；另外 14 項雖然舊站有頁面，但這裡尚未取得
// 內容可搬）。
//
// 因此本頁樣板會依照 ~/data/treatments.ts 裡實際存在的欄位，逐節判斷要不要
// 渲染 —— mockup/04-treatment-detail.html 原始碼裡「資料不足的療程請整節
// 移除本區塊」的註記就是這樣要求的。沒有內容的療程一律顯示「內容建置中」
// 提示＋預約 CTA，不編造適應症、原理或術後照護等醫療內容。
import { getTreatment, getCategory, concernHref } from '~/data/treatments'

const route = useRoute()
const categorySlug = route.params.category as string
const slug = route.params.slug as string

const category = getCategory(categorySlug)
const treatment = getTreatment(categorySlug, slug)

if (!category || !treatment) {
  throw createError({ statusCode: 404, statusMessage: '找不到這個療程' })
}

// 是否有可用的細節內容（facts／indications／mechanism 等）。
// 只有這些欄位有值時才顯示完整版型，否則顯示「內容建置中」的精簡版。
const hasFullContent = Boolean(treatment.summary && treatment.facts?.length)

const tocItems = computed(() => {
  const items: { href: string; label: string }[] = []
  if (treatment.facts?.length) items.push({ href: '#facts', label: '事實一覽' })
  if (treatment.indications?.length) items.push({ href: '#indications', label: '適應症' })
  if (treatment.mechanismParagraphs?.length) items.push({ href: '#mechanism', label: '原理' })
  if (treatment.steps?.length) items.push({ href: '#process', label: '療程流程' })
  if (treatment.aftercare?.length) items.push({ href: '#aftercare', label: '術後照護' })
  if (treatment.precautionsList?.length) items.push({ href: '#precautions', label: '禁忌症' })
  if (treatment.device?.length) items.push({ href: '#device', label: '儀器資訊' })
  if (treatment.gallery?.length) items.push({ href: '#gallery', label: '圖庫' })
  if (treatment.doctors?.length) items.push({ href: '#doctors', label: '醫師團隊' })
  if (treatment.detailTags?.length) items.push({ href: '#tags', label: '可改善困擾' })
  if (treatment.cases?.length) items.push({ href: '#cases', label: '相關案例' })
  if (treatment.faqs?.length) items.push({ href: '#faq', label: '常見問題' })
  if (treatment.articles?.length) items.push({ href: '#articles', label: '相關文章' })
  return items
})

const description = treatment.summary
  ?? `${treatment.title}（${treatment.nameEn}）屬於${category.name}分類，詳細療程內容規劃中，實際適用性需經醫師面診評估。`

// MedicalProcedure（docs/03-seo-geo.md §2）—— 欄位缺什麼就不寫什麼，不補內容。
const procedureJsonLd: Record<string, unknown> = {
  '@context': 'https://schema.org',
  '@type': 'MedicalProcedure',
  name: `${treatment.title}${treatment.nameEn ? `（${treatment.nameEn}）` : ''}`,
}
if (treatment.mechanismParagraphs?.length) {
  procedureJsonLd.howPerformed = treatment.mechanismParagraphs.join(' ')
}
if (treatment.steps?.length) {
  procedureJsonLd.preparation = treatment.steps.map((s) => `${s.title}：${s.desc}`).join(' ')
}
if (treatment.aftercare?.length) {
  procedureJsonLd.followup = treatment.aftercare.map((a) => `${a.when}：${a.desc}`).join(' ')
}
if (treatment.indications?.length) {
  procedureJsonLd.indication = treatment.indications.map((i) => i.title)
}
if (treatment.precautionsList?.length) {
  procedureJsonLd.contraindication = treatment.precautionsList
}

// ⚠️ 沒有內容的療程不可被索引。
//
// 27 項療程裡目前只有 1 項有站內細節內容，其餘 26 項要由醫師撰寫
// （docs/06-page-inventory.md §3：12 項連原始素材都沒有）。下面那個「內容建置中」
// 區塊是給切版與 demo 看模板用的 —— 一個對外說「建置中」的療程頁比沒有那一頁更糟，
// 它會進 sitemap、會被 Google 索引、會被 AI 當成 20SKIN 對該療程的正式說明。
//
// 正式站不會走到這裡：這些療程在 CMS 裡是草稿（Status=1），
// 建置期的內容匯出只匯已發布且在時間窗內的內容（docs/09-frontend.md §3），
// 根本不會產生這一頁。noIndex 是那之前的安全網，兩道都要有。
usePageHead({
  title: treatment.title,
  description,
  pageCss: '/assets/pages/04-treatment-detail.css',
  path: `/treatments/${category.slug}/${treatment.slug}/`,
  noIndex: !hasFullContent,
  jsonLd: [
    breadcrumbJsonLd([
      { label: '首頁', href: '/' },
      { label: '專業服務', href: '/treatments/' },
      { label: category.name, href: `/treatments/${category.slug}/` },
      { label: treatment.title, href: `/treatments/${category.slug}/${treatment.slug}/` },
    ]),
    // 內容不全時不輸出 MedicalProcedure：只有 name 的空殼 schema 會讓
    // 搜尋引擎與 AI 以為這裡有一份療程說明，實際上什麼都沒有。
    ...(hasFullContent ? [procedureJsonLd] : []),
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
        <li><a href="/treatments/">專業服務</a></li>
        <li><a :href="`/treatments/${category.slug}/`">{{ category.name }}</a></li>
        <li><span class="c-breadcrumb__current" aria-current="page">{{ treatment.title }}</span></li>
      </ol>
    </div>
  </nav>

  <!-- =====================================================================
       頁首 Hero
       ===================================================================== -->
  <section class="tdetail-hero">
    <div class="container tdetail-hero__layout">
      <div class="tdetail-hero__copy">
        <span class="u-eyebrow">{{ treatment.nameEn }}</span>
        <h1 class="tdetail-hero__title">{{ treatment.title }}</h1>
        <p class="tdetail-hero__subtitle">{{ description }}</p>
        <div class="tdetail-hero__tags">
          <a class="c-tag" :href="`/treatments/${category.slug}/`">{{ category.name }}</a>
        </div>
        <div class="tdetail-hero__cta">
          <a class="btn btn--primary ext" href="https://booking.20skin.tw/MainMs/Login" target="_blank" rel="noopener external">立即預約</a>
        </div>
      </div>

      <div class="tdetail-hero__frame">
        <img
          :src="(treatment.cardImage ?? category.image).src"
          :alt="(treatment.cardImage ?? category.image).alt"
          :width="(treatment.cardImage ?? category.image).width"
          :height="(treatment.cardImage ?? category.image).height"
        >
      </div>
    </div>
  </section>

  <!-- =====================================================================
       內容建置中（stub）——沒有站內細節內容的療程，不編造醫療內容
       ===================================================================== -->
  <section v-if="!hasFullContent" class="section section--tight">
    <div class="container">
      <p class="c-note">
        <span class="c-note__icon" aria-hidden="true">&#9432;</span>
        本項目的詳細療程說明建置中，適應症、原理與術後照護等內容將由醫師撰寫後補上。若近期有需求，歡迎直接預約門診由醫師說明。
      </p>
    </div>
  </section>

  <!-- =====================================================================
       目錄導覽 ＋ 內文（2 欄版面：左 sticky TOC／右內文）
       ===================================================================== -->
  <section v-else class="section section--tight">
    <div class="container tdetail-layout">

      <!-- -- 目錄／段落導覽 ------------------------------------------------ -->
      <aside class="tdetail-toc" aria-label="頁面段落導覽">
        <p class="tdetail-toc__title">頁面導覽</p>
        <ul class="tdetail-toc__list">
          <li v-for="item in tocItems" :key="item.href"><a :href="item.href">{{ item.label }}</a></li>
        </ul>
      </aside>

      <div class="tdetail-content">

        <!-- -- 事實表格 ------------------------------------------------------ -->
        <section v-if="treatment.facts?.length" class="tdetail-block" id="facts">
          <div class="c-sechead">
            <div class="c-sechead__text">
              <h2>療程資訊一覽</h2>
            </div>
          </div>
          <table class="c-facts">
            <tbody>
              <tr v-for="fact in treatment.facts" :key="fact.label"><th>{{ fact.label }}</th><td>{{ fact.value }}</td></tr>
            </tbody>
          </table>
        </section>

        <!-- -- 適應症 ---------------------------------------------------------- -->
        <section v-if="treatment.indications?.length" class="tdetail-block" id="indications">
          <div class="c-sechead">
            <div class="c-sechead__text">
              <h2>{{ treatment.indicationsHeading }}</h2>
            </div>
          </div>
          <ul class="tdetail-checklist">
            <li v-for="ind in treatment.indications" :key="ind.title"><span><strong>{{ ind.title }}</strong><span>{{ ind.desc }}</span></span></li>
          </ul>
        </section>

        <!-- -- 原理 ------------------------------------------------------------ -->
        <section v-if="treatment.mechanismParagraphs?.length" class="tdetail-block" id="mechanism">
          <div class="c-sechead">
            <div class="c-sechead__text">
              <h2>{{ treatment.mechanismHeading }}</h2>
            </div>
          </div>
          <div class="tdetail-split">
            <div class="tdetail-split__copy">
              <p v-for="(p, i) in treatment.mechanismParagraphs" :key="i">{{ p }}</p>
            </div>
            <div v-if="treatment.mechanismImage" class="tdetail-split__frame">
              <img
                :src="treatment.mechanismImage.src"
                :alt="treatment.mechanismImage.alt"
                :width="treatment.mechanismImage.width"
                :height="treatment.mechanismImage.height"
                loading="lazy"
              >
            </div>
          </div>
        </section>

        <!-- -- 療程流程 --------------------------------------------------------- -->
        <section v-if="treatment.steps?.length" class="tdetail-block tdetail-block--band" id="process">
          <div class="c-sechead">
            <div class="c-sechead__text">
              <h2>一次療程會經歷什麼？</h2>
            </div>
          </div>
          <div class="tdetail-steps">
            <div v-for="step in treatment.steps" :key="step.num" class="tdetail-step">
              <span class="tdetail-step__num">{{ step.num }}</span>
              <h3 class="tdetail-step__title">{{ step.title }}</h3>
              <p class="tdetail-step__desc">{{ step.desc }}</p>
            </div>
          </div>
        </section>

        <!-- -- 術後照護 --------------------------------------------------------- -->
        <section v-if="treatment.aftercare?.length" class="tdetail-block" id="aftercare">
          <div class="c-sechead">
            <div class="c-sechead__text">
              <h2>術後要注意什麼？</h2>
            </div>
          </div>
          <div class="tdetail-timeline">
            <div v-for="item in treatment.aftercare" :key="item.when" class="tdetail-timeline__item">
              <span class="tdetail-timeline__when">{{ item.when }}</span>
              <p class="tdetail-timeline__desc">{{ item.desc }}</p>
            </div>
          </div>
        </section>

        <!-- -- 禁忌症與注意事項 --------------------------------------------------- -->
        <section v-if="treatment.precautionsList?.length" class="tdetail-block" id="precautions">
          <div class="c-sechead">
            <div class="c-sechead__text">
              <h2>禁忌症與注意事項</h2>
            </div>
          </div>
          <div class="c-note c-note--warn">
            <span class="c-note__icon" aria-hidden="true">&#9888;</span>
            <div class="tdetail-warn-body">
              <strong>符合以下任一情形，請務必於門診主動告知醫師：</strong>
              <ul class="tdetail-warn-list">
                <li v-for="item in treatment.precautionsList" :key="item">{{ item }}</li>
              </ul>
              <p class="tdetail-warn-note">{{ treatment.precautionsNote }}</p>
            </div>
          </div>
        </section>

        <!-- -- 儀器／原廠資訊 ------------------------------------------------------ -->
        <section v-if="treatment.device?.length" class="tdetail-block tdetail-device" id="device">
          <div class="c-sechead">
            <div class="c-sechead__text">
              <h2>儀器與原廠資訊</h2>
            </div>
          </div>
          <table class="c-facts">
            <tbody>
              <tr v-for="fact in treatment.device" :key="fact.label"><th>{{ fact.label }}</th><td>{{ fact.value }}</td></tr>
            </tbody>
          </table>
        </section>

        <!-- -- 圖庫 ------------------------------------------------------------------ -->
        <section v-if="treatment.gallery?.length" class="tdetail-block tdetail-block--band" id="gallery">
          <div class="c-sechead">
            <div class="c-sechead__text">
              <h2>院區情境</h2>
            </div>
          </div>
          <div class="tdetail-gallery">
            <figure v-for="img in treatment.gallery" :key="img.src" class="tdetail-gallery__item">
              <div class="tdetail-gallery__frame">
                <img :src="img.src" :alt="img.alt" :width="img.width" :height="img.height" loading="lazy">
              </div>
              <figcaption class="tdetail-gallery__cap">{{ img.caption }}</figcaption>
            </figure>
          </div>
        </section>

        <!-- -- 本療程醫師團隊 ----------------------------------------------------------- -->
        <section v-if="treatment.doctors?.length" class="tdetail-block" id="doctors">
          <div class="c-sechead">
            <div class="c-sechead__text">
              <h2>本療程醫師團隊</h2>
            </div>
          </div>
          <div class="grid grid--3">
            <article v-for="doc in treatment.doctors" :key="doc.slug" class="c-card c-card--doctor">
              <div class="c-card__media">
                <img :src="doc.photo.src" :alt="doc.photo.alt" :width="doc.photo.width" :height="doc.photo.height" loading="lazy">
              </div>
              <div class="c-card__body">
                <h3 class="c-card__title"><a :href="`/team/${doc.slug}/`">{{ doc.name }}</a></h3>
                <div class="c-card__meta"><span>{{ doc.title }}</span></div>
              </div>
            </article>
          </div>
        </section>

        <!-- -- 此療程可改善的困擾 -------------------------------------------------------- -->
        <section v-if="treatment.detailTags?.length" class="tdetail-block" id="tags">
          <div class="c-sechead">
            <div class="c-sechead__text">
              <h2>此療程可改善的困擾</h2>
            </div>
          </div>
          <div class="tdetail-tags">
            <template v-for="tag in treatment.detailTags" :key="tag">
              <a v-if="concernHref(tag)" class="c-tag" :href="concernHref(tag)!">{{ tag }}</a>
              <span v-else class="c-tag">{{ tag }}</span>
            </template>
          </div>
        </section>

        <!-- -- 相關案例 ------------------------------------------------------------------
             一律使用情境示意圖，不放實際治療前後對比照。 -->
        <section v-if="treatment.cases?.length" class="tdetail-block" id="cases">
          <div class="c-sechead">
            <div class="c-sechead__text">
              <h2>相關案例分享</h2>
            </div>
          </div>
          <div class="grid grid--3">
            <article v-for="c in treatment.cases" :key="c.title" class="c-card">
              <div class="c-card__media">
                <img :src="c.photo.src" :alt="c.photo.alt" :width="c.photo.width" :height="c.photo.height" loading="lazy">
              </div>
              <div class="c-card__body">
                <h3 class="c-card__title"><a href="/cases/">{{ c.title }}</a></h3>
                <p class="c-card__excerpt">{{ c.excerpt }}</p>
                <div class="tdetail-case__disclosure">
                  <p>療程效果因人而異，本案例不代表所有人之療程效果。</p>
                  <p>已取得當事人書面同意刊登；圖像拍攝條件（光線、角度、妝容）可能影響呈現效果。</p>
                </div>
              </div>
            </article>
          </div>
        </section>

        <!-- -- 常見問題 ------------------------------------------------------------------- -->
        <section v-if="treatment.faqs?.length" class="tdetail-block tdetail-block--band" id="faq">
          <div class="c-sechead">
            <div class="c-sechead__text">
              <h2>常見問題</h2>
              <p v-if="treatment.faqLastUpdated">最後更新：{{ treatment.faqLastUpdated }}</p>
            </div>
          </div>
          <div class="c-faq">
            <details v-for="item in treatment.faqs" :key="item.q" class="c-faq__item">
              <summary class="c-faq__q">{{ item.q }}</summary>
              <div class="c-faq__a">
                <p>{{ item.a }}</p>
              </div>
            </details>
          </div>
        </section>

        <!-- -- 相關文章 ------------------------------------------------------------------- -->
        <section v-if="treatment.articles?.length" class="tdetail-block" id="articles">
          <div class="c-sechead">
            <div class="c-sechead__text">
              <h2>相關文章</h2>
            </div>
            <a class="c-sechead__more" href="/blog/">查看全部文章 →</a>
          </div>
          <div class="grid grid--3">
            <article v-for="article in treatment.articles" :key="article.title" class="c-card c-card--article">
              <div class="c-card__media">
                <img :src="article.photo.src" :alt="article.photo.alt" :width="article.photo.width" :height="article.photo.height" loading="lazy">
              </div>
              <div class="c-card__body">
                <span class="c-tag c-card__tag">{{ article.category }}</span>
                <h3 class="c-card__title"><a :href="article.href">{{ article.title }}</a></h3>
                <div class="c-card__meta">
                  <span>{{ article.author }}</span>
                  <span>{{ article.date }}</span>
                </div>
              </div>
            </article>
          </div>
        </section>

      </div>
    </div>
  </section>

  <!-- =====================================================================
       頁尾 CTA 區
       ===================================================================== -->
  <section class="section section--alt">
    <div class="container tdetail-cta-band">
      <h2>想進一步了解是否適合自己？</h2>
      <p>實際治療方案需由醫師依現場評估膚況後規劃，歡迎預約門診諮詢，由醫師為你說明適合的方向。</p>
      <div class="tdetail-cta-band__actions">
        <a class="btn btn--primary ext" href="https://booking.20skin.tw/MainMs/Login" target="_blank" rel="noopener external">立即預約</a>
      </div>
    </div>
  </section>
</template>
