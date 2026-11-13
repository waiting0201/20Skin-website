<script setup lang="ts">
// 模板 16 —— 診所據點列表（mockup/17-clinic-list.html）
import { getClinics } from '~/data/clinics'

const CLINICS = await getClinics()

usePageHead({
  title: '診所據點',
  description: '20SKIN 美醫集團兩個院區：四季診所（醫學美容為主）與二林四季皮膚科（一般皮膚疾病門診為主），門診時段、位置與就診流程一覽。',
  // 地圖畫布沿用據點介紹頁的樣式（那支檔案只有 `.clinic-*` 的選擇器，不會動到這一頁其他區塊）。
  pageCss: ['/assets/pages/17-clinic-list.css', '/assets/pages/08-clinic-detail.css'],
  path: '/clinics/',
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: '診所據點',
      description: '20SKIN 美醫集團兩個院區的門診時段、聯絡方式與就診流程。',
    },
    breadcrumbJsonLd([
      { label: '首頁', href: '/' },
      { label: '診所據點', href: '/clinics/' },
    ]),
  ],
})

// 地圖等使用者捲到附近才掛上 iframe（理由與寫法同 clinics/[slug].vue：Google 那包程式
// 不該在首屏跟主圖搶頻寬；畫布有固定高度與底色，晚出現不會造成版面位移）。
// ⚠️ 不支援 IntersectionObserver 的環境直接載入，不要讓地圖永遠出不來。
const mapArea = ref<HTMLElement | null>(null)
const mapVisible = ref(false)
let mapObserver: IntersectionObserver | null = null
onMounted(() => {
  const el = mapArea.value
  if (!el || typeof IntersectionObserver === 'undefined') {
    mapVisible.value = true
    return
  }
  mapObserver = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      mapVisible.value = true
      mapObserver?.disconnect()
    }
  }, { rootMargin: '300px 0px' })
  mapObserver.observe(el)
})
onBeforeUnmount(() => mapObserver?.disconnect())

/** 17-clinic-list.html 自身的頁級 FAQ（非個別院區的內容，與 clinics.ts 中
 *  siji 的 faqs 同一份 mockup 來源，siji 的明細頁沒有專屬 FAQ 素材可用，
 *  借用同一段內容，兩處並非各自杜撰）。 */
const faqs = [
  {
    question: '兩個院區有什麼不同？',
    answer: '四季診所以醫學美容與光電療程為主；二林四季皮膚科以一般皮膚疾病門診為主，同時提供基礎光電與保養類療程。兩院區的門診時段與駐診醫師不同，預約時請留意。',
  },
  {
    question: '可以在 A 院區看診、B 院區做療程嗎？',
    answer: '部分項目因設備配置只在特定院區提供。面診時醫師會說明該項目在哪一個院區施作，並協助安排時段。',
  },
  {
    question: '沒有預約可以直接到現場嗎？',
    answer: '可以現場掛號，但需視當日名額與候診狀況，已預約者優先看診。建議先行預約以縮短等候時間。',
  },
]
</script>

<template>
  <!-- =====================================================================
       麵包屑
       ===================================================================== -->
  <nav class="c-breadcrumb" aria-label="麵包屑">
    <div class="container">
      <ol class="c-breadcrumb__list">
        <li><a href="/">首頁</a></li>
        <li><span class="c-breadcrumb__current" aria-current="page">診所據點</span></li>
      </ol>
    </div>
  </nav>

  <!-- =====================================================================
       1. Hero
       ===================================================================== -->
  <section class="clist-hero">
    <div class="container clist-hero__inner">
      <span class="u-eyebrow">OUR CLINICS</span>
      <h1 class="clist-hero__title">診所據點</h1>
      <p class="clist-hero__lede">兩個院區分別位於台中市南屯區與彰化縣二林鎮。醫學美容與一般皮膚疾病門診分流，看診前請先確認該院區的門診時段與駐診醫師。</p>
    </div>
  </section>

  <!-- =====================================================================
       2. 兩個院區
       ===================================================================== -->
  <section class="section section--tight" id="sites">
    <div class="container">
      <div class="clist-sites">
        <article v-for="(clinic, i) in CLINICS" :key="clinic.slug" class="clist-site">
          <div class="clist-site__media">
            <img
              :src="clinic.heroPhoto.src" :srcset="srcsetOf(clinic.heroPhoto.src)" :sizes="IMAGE_SIZES.half"
              :alt="clinic.heroPhoto.alt"
              :width="clinic.heroPhoto.width"
              :height="clinic.heroPhoto.height"
              :loading="i === 0 ? undefined : 'lazy'"
            >
          </div>
          <div>
            <span class="clist-site__role">{{ clinic.roleLabel }}</span>
            <h2 class="clist-site__name">{{ clinic.name }}</h2>
          </div>
          <p class="clist-site__desc">{{ clinic.desc }}</p>

          <dl class="clist-site__nap">
            <dt>電話</dt><dd><a :href="clinic.phoneHref">{{ clinic.phone }}</a></dd>
            <dt>地址</dt><dd>{{ clinic.address }}</dd>
            <dt>門診</dt>
            <dd>{{ clinic.hoursSummary }}</dd>
          </dl>

          <table class="c-hours">
            <caption class="visually-hidden">{{ clinic.name }}門診時間表</caption>
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
              <tr v-for="row in clinic.hoursTable" :key="row.label">
                <th scope="row">{{ row.label }}</th>
                <td v-for="(open, i) in row.days" :key="i" :class="{ 'c-hours__cell--off': !open }">
                  <span v-if="open" class="c-hours__mark" aria-hidden="true"></span>
                  <span class="visually-hidden">{{ open ? '看診' : '休診' }}</span>
                </td>
              </tr>
            </tbody>
          </table>
          <p class="c-hours__foot">{{ clinic.hoursFootnote }}</p>

          <div class="clist-site__actions">
            <a class="btn btn--ghost btn--sm" :href="`/clinics/${clinic.slug}/`">查看診所介紹</a>
            <a class="btn btn--primary btn--sm ext" :href="bookingUrl()" target="_blank" rel="noopener external">預約此院區</a>
          </div>
        </article>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       3. 位置
       ===================================================================== -->
  <section class="section section--alt" id="location">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">LOCATION</span>
          <h2>兩個院區的位置</h2>
          <p>四季診所在台中市南屯區，二林四季皮膚科在彰化縣二林鎮，分屬兩個縣市，出發前請先確認要去哪一間。</p>
        </div>
      </div>

      <!-- 🔴 2026-11-12 前這裡是設計稿的示意圖（格線上兩個假圖釘），按鈕是 `href="#"`、按了沒反應。
           兩個院區在不同縣市，一張地圖放不下，所以一個院區一張 —— 與據點介紹頁同一種
           以地址查詢的免金鑰嵌入（網址由 clinics.ts 推導），樣式沿用 08-clinic-detail.css 的地圖畫布。 -->
      <div ref="mapArea" class="grid grid--2">
        <div v-for="clinic in CLINICS" :key="clinic.slug">
          <h3 class="c-heading-bar">{{ clinic.name }}</h3>
          <div class="clinic-map__canvas">
            <iframe
              v-if="mapVisible"
              :src="clinic.mapEmbedUrl"
              :title="`${clinic.name}位置地圖`"
              loading="lazy"
              referrerpolicy="no-referrer-when-downgrade"
              allowfullscreen
            ></iframe>
          </div>
          <div class="clinic-map__foot">
            <p class="clinic-map__label">{{ clinic.address }}</p>
            <a class="btn btn--ghost btn--sm ext" :href="clinic.mapLinkUrl" target="_blank" rel="noopener external">在 Google 地圖開啟 →</a>
          </div>
        </div>
      </div>

      <div class="grid grid--3 clist-transport">
        <article class="clist-step">
          <span class="clist-step__no">開車</span>
          <h3>國道與省道</h3>
          <p>四季診所下國道一號 181 南屯交流道；二林四季皮膚科下國道一號北斗／埤頭交流道，逐段路線見各院區頁面。</p>
        </article>
        <article class="clist-step">
          <span class="clist-step__no">大眾運輸</span>
          <h3>客運與轉乘</h3>
          <p>大眾運輸的建議路線與轉乘方式，可於預約時一併洽詢櫃檯。</p>
        </article>
        <article class="clist-step">
          <span class="clist-step__no">停車</span>
          <h3>停車方式</h3>
          <p>二林四季皮膚科往前 50 公尺（右邊）設有免費專用停車場；四季診所的停車方式可於預約時洽詢櫃檯。</p>
        </article>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       4. 就診流程
       ===================================================================== -->
  <section class="section" id="visit">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">YOUR VISIT</span>
          <h2>第一次來，會經歷什麼</h2>
          <p>兩個院區的流程相同，差別只在看診的科別與醫師。</p>
        </div>
      </div>

      <div class="grid grid--4">
        <article class="clist-step">
          <span class="clist-step__no">STEP 01</span>
          <h3>線上預約</h3>
          <p>選擇院區、日期與醫師。可指定醫師，時段已滿時由門診協助安排。</p>
        </article>
        <article class="clist-step">
          <span class="clist-step__no">STEP 02</span>
          <h3>報到與諮詢</h3>
          <p>攜帶健保卡報到，由諮詢人員了解需求、用藥情形與可接受的恢復期。</p>
        </article>
        <article class="clist-step">
          <span class="clist-step__no">STEP 03</span>
          <h3>醫師面診</h3>
          <p>由醫師檢視膚況與病史，確認哪些項目適合、優先順序如何安排。</p>
        </article>
        <article class="clist-step">
          <span class="clist-step__no">STEP 04</span>
          <h3>療程與回診</h3>
          <p>確認規劃後施作，並依衛教說明照護，回診時評估恢復狀況。</p>
        </article>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       5. 常見問題
       ===================================================================== -->
  <section class="section section--alt" id="faq">
    <div class="container container--narrow">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">FAQ</span>
          <h2>關於院區的常見問題</h2>
        </div>
        <a class="c-sechead__more" href="/faq/">查看全部常見問題 →</a>
      </div>

      <div class="c-faq">
        <details v-for="(item, i) in faqs" :key="i" class="c-faq__item">
          <summary class="c-faq__q">{{ item.question }}</summary>
          <div class="c-faq__a">
            <p>{{ item.answer }}</p>
          </div>
        </details>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       6. 頁尾 CTA 區
       ===================================================================== -->
  <section class="section clist-cta">
    <div class="container clist-cta__box">
      <div class="clist-cta__text">
        <span class="u-eyebrow">BOOK A CONSULTATION</span>
        <h2>選好院區，就可以預約了</h2>
        <p>預約時可同時指定院區與醫師。若不確定該掛哪一科，也可先預約後由門診協助分流。</p>
      </div>
      <div class="clist-cta__actions">
        <a class="btn btn--primary ext" :href="bookingUrl()" target="_blank" rel="noopener external">立即預約</a>
        <a class="btn btn--line" href="/contact/">聯絡我們</a>
      </div>
    </div>
  </section>
</template>
