<script setup lang="ts">
// 模板 17 —— 診所據點細節（mockup/08-clinic-detail.html，內容實際上是二林四季皮膚科）
//
// 四季診所沒有專屬的 mockup 明細頁，本頁用同一份標記＋class 詞彙、
// 由 clinics.ts 的資料驅動兩個院區。四季診所缺的段落（院區環境相片、
// 本院區可提供的療程）一律 v-if 不渲染，不杜撰，見 clinics.ts 欄位註解。
//
// 據點頁是地區 SEO 的主要落地頁（docs/03-seo-geo.md §3 地區軸），NAP 必須
// 與頁尾（app/data/navigation.ts 的 CLINIC_NAP）逐字一致 —— clinics.ts 已經
// 直接讀 CLINIC_NAP 組出 phone/address，不會各自維護一份而失準。
import { CLINICS, clinicOpeningHours, findClinic } from '~/data/clinics'
import { doctorsByClinic } from '~/data/doctors'

const route = useRoute()
const slug = route.params.slug as string
const clinic = findClinic(slug)

if (!clinic) {
  throw createError({ statusCode: 404, statusMessage: '找不到這個院區' })
}

const otherClinic = CLINICS.find((c) => c.slug !== clinic.slug)
const residentDoctors = doctorsByClinic(clinic.slug, true)

const jsonLd: Record<string, unknown> = {
  '@context': 'https://schema.org',
  '@type': 'MedicalClinic',
  name: clinic.name,
  description: clinic.jsonLdDescription,
  address: clinic.address,
  telephone: clinic.phone,
  medicalSpecialty: clinic.medicalSpecialty,
  openingHoursSpecification: clinicOpeningHours(clinic),
}
if (clinic.latitude != null && clinic.longitude != null) {
  jsonLd.geo = { '@type': 'GeoCoordinates', latitude: clinic.latitude, longitude: clinic.longitude }
}
if (clinic.treatmentGroups?.length) {
  jsonLd.availableService = [
    ...clinic.treatmentGroups.flatMap((g) => g.items.map((i) => i.label)),
    ...(clinic.generalServices ?? []),
  ]
}

usePageHead({
  title: `${clinic.name}｜診所據點`,
  description: clinic.pageDescription,
  pageCss: '/assets/pages/08-clinic-detail.css',
  path: `/clinics/${clinic.slug}/`,
  jsonLd: [
    jsonLd,
    breadcrumbJsonLd([
      { label: '首頁', href: '/' },
      { label: '診所據點', href: '/clinics/' },
      { label: clinic.name, href: `/clinics/${clinic.slug}/` },
    ]),
  ],
})

// 今日看診時間即時標示，純前端計算（對應 mockup 內嵌的 <script>）。
// JS 失效時上方的 c-hours 表格本身仍完整可讀，這裡只是漸進增強。
const weekdayLabel = ['日', '一', '二', '三', '四', '五', '六']
const statusText = ref('今日看診時間查詢中…')
const isClosed = ref(true)
/** 表格欄位順序（一二三四五六日）中，今天對應的索引；掛載前一律不標示。 */
const todayColumn = ref(-1)

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

onMounted(() => {
  const now = new Date()
  const day = now.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6
  todayColumn.value = day === 0 ? 6 : day - 1
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const todaySlots = clinic.businessHours.filter((h) => h.day === day)

  if (!todaySlots.length) {
    statusText.value = `今日（${weekdayLabel[day]}）休診`
    isClosed.value = true
    return
  }
  const slotsText = todaySlots.map((s) => `${s.start}–${s.end}`).join('、')
  const openNow = todaySlots.some((s) => nowMinutes >= toMinutes(s.start) && nowMinutes < toMinutes(s.end))
  statusText.value = `今日（${weekdayLabel[day]}）${slotsText}${openNow ? '．看診中' : '．非看診時段'}`
  isClosed.value = !openNow
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
        <li><a href="/clinics/">診所據點</a></li>
        <li><span class="c-breadcrumb__current" aria-current="page">{{ clinic.name }}</span></li>
      </ol>
    </div>
  </nav>

  <!-- =====================================================================
       1. 頁首：H1、簡述、院區照片、第一屏 NAP、CTA
       ===================================================================== -->
  <section class="clinic-hero">
    <div class="container clinic-hero__layout">
      <div class="clinic-hero__copy">
        <span class="u-eyebrow">{{ clinic.eyebrow }}</span>
        <h1>{{ clinic.name }}</h1>
        <p class="clinic-hero__lede">{{ clinic.lede }}</p>

        <div class="clinic-hero__nap">
          <a class="clinic-hero__nap-item" :href="clinic.phoneHref">
            <svg class="clinic-hero__nap-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
            {{ clinic.phone }}
          </a>
          <span class="clinic-hero__nap-item">
            <svg class="clinic-hero__nap-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
            {{ clinic.address }}
          </span>
        </div>

        <div class="clinic-hero__cta">
          <a class="btn btn--primary ext" href="https://booking.20skin.tw/MainMs/Login" target="_blank" rel="noopener external">立即預約</a>
        </div>
      </div>

      <div class="clinic-hero__media">
        <div class="clinic-hero__frame">
          <img
            :src="clinic.heroPhoto.src"
            :alt="clinic.heroPhoto.alt"
            :width="clinic.heroPhoto.width"
            :height="clinic.heroPhoto.height"
          >
        </div>
        <p class="clinic-hero__caption">{{ clinic.heroPhoto.caption }}</p>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       3. NAP 完整資訊區
       ===================================================================== -->
  <section class="section" id="nap">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">CONTACT</span>
          <h2>聯絡資訊</h2>
          <p>診所名稱、地址、電話與官方社群一次看。</p>
        </div>
      </div>

      <div class="clinic-facts">
        <table class="c-facts">
          <tbody>
            <tr>
              <th>診所名稱</th>
              <td>{{ clinic.name }}（20SKIN 美醫集團）</td>
            </tr>
            <tr>
              <th>地址</th>
              <td>{{ clinic.address }}</td>
            </tr>
            <tr>
              <th>電話</th>
              <td><a :href="clinic.phoneHref">{{ clinic.phone }}</a></td>
            </tr>
            <tr v-if="clinic.facebookUrl">
              <th>Facebook</th>
              <td><a class="ext" :href="clinic.facebookUrl" target="_blank" rel="noopener external">{{ clinic.facebookLabel }}</a></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       4. 結構化營業時間
       ===================================================================== -->
  <section class="section" id="hours">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">OPENING HOURS</span>
          <h2>門診時段</h2>
          <p>上午、下午兩個診次，午休時段不看診。</p>
        </div>
      </div>

      <div class="clinic-hours">
        <div class="clinic-hours__status" :class="{ 'is-closed': isClosed }">
          <svg class="clinic-hours__status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>
          </svg>
          <span>{{ statusText }}</span>
        </div>

        <table class="c-hours">
          <caption class="visually-hidden">{{ clinic.name }}門診時間表</caption>
          <thead>
            <tr>
              <th scope="col" class="c-hours__corner">門診時間</th>
              <th v-for="(label, i) in ['一', '二', '三', '四', '五', '六', '日']" :key="label" scope="col" :class="{ 'is-today': i === todayColumn }">{{ label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in clinic.hoursTable" :key="row.label">
              <th scope="row">{{ row.label }}</th>
              <td v-for="(open, i) in row.days" :key="i" :class="{ 'c-hours__cell--off': !open, 'is-today': i === todayColumn }">
                <span v-if="open" class="c-hours__mark" aria-hidden="true"></span>
                <span class="visually-hidden">{{ open ? '看診' : '休診' }}</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p class="c-hours__foot">{{ clinic.hoursFootnote }}</p>

        <p class="c-note">國定假日看診時間請見公告。</p>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       5. 地圖佔位區塊 ＋ 交通與停車
       ===================================================================== -->
  <section class="section section--alt" id="location">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">GETTING HERE</span>
          <h2>位置與交通</h2>
          <p>院區位於二林鎮區內，開車與大眾運輸皆可抵達。</p>
        </div>
      </div>

      <!-- 正式站上線時，此處嵌入 Google 地圖 iframe（含院區實際座標，待補，
           見 app/data/clinics.ts 的 latitude／longitude 註解）。 -->
      <div class="clinic-map__canvas" role="img" :aria-label="`${clinic.name}位置地圖示意，正式站將嵌入 Google 地圖`">
        <div class="clinic-map__road clinic-map__road--h" aria-hidden="true"></div>
        <div class="clinic-map__road clinic-map__road--v" aria-hidden="true"></div>
        <div class="clinic-map__pin-dot" aria-hidden="true"></div>
        <svg class="clinic-map__pin" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3" fill="#fff"/>
        </svg>
      </div>
      <div class="clinic-map__foot">
        <p class="clinic-map__label">{{ clinic.address }}</p>
        <a class="btn btn--ghost btn--sm" href="#">在 Google 地圖開啟 →</a>
      </div>

      <div class="grid grid--3 clinic-transport-grid">
        <div v-for="step in clinic.transportInfo" :key="step.title" class="clinic-transport">
          <span class="clinic-transport__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <template v-if="step.icon === 'car'">
                <path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11"/><rect x="3" y="11" width="18" height="6" rx="1.5"/><circle cx="7.5" cy="18.5" r="1.5"/><circle cx="16.5" cy="18.5" r="1.5"/>
              </template>
              <template v-else-if="step.icon === 'bus'">
                <rect x="4" y="4" width="16" height="12" rx="1.5"/><path d="M4 12h16"/><circle cx="7.5" cy="18.5" r="1.5"/><circle cx="16.5" cy="18.5" r="1.5"/>
              </template>
              <template v-else>
                <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 16V8h3.5a2.5 2.5 0 0 1 0 5H9"/>
              </template>
            </svg>
          </span>
          <h3 class="c-heading-bar">{{ step.title }}</h3>
          <ul>
            <li v-for="point in step.points" :key="point">{{ point }}</li>
          </ul>
        </div>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       6. 駐診醫師（顯示本院區時段）
       ===================================================================== -->
  <section v-if="residentDoctors.length" class="section section--alt" id="doctors">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">OUR DOCTORS</span>
          <h2>駐診醫師</h2>
          <p>以下醫師於本院區駐診，時段為簡表，實際看診日以現場公告為準。</p>
        </div>
      </div>

      <div class="grid grid--4">
        <article v-for="doctor in residentDoctors" :key="doctor.slug" class="c-card c-card--doctor">
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
            <p v-if="doctor.clinics.find((c) => c.clinicSlug === clinic!.slug)?.scheduleNote" class="clinic-doctor__slot">
              <span class="u-eyebrow">本院區時段</span>{{ doctor.clinics.find((c) => c.clinicSlug === clinic!.slug)?.scheduleNote }}
            </p>
          </div>
        </article>
      </div>

      <p class="c-note clinic-doctors-note">實際排班以現場公告與每月醫師班表為準。</p>
    </div>
  </section>

  <!-- =====================================================================
       7. 本院區可提供的療程
       ===================================================================== -->
  <section v-if="clinic.treatmentGroups?.length" class="section" id="treatments">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">TREATMENTS HERE</span>
          <h2>本院區可提供的療程</h2>
          <p>依四大分類提供，實際適用性需經醫師面診評估。</p>
        </div>
      </div>

      <div class="grid grid--4">
        <div v-for="group in clinic.treatmentGroups" :key="group.categorySlug" class="clinic-cat">
          <h3 class="c-heading-bar"><a :href="`/treatments/${group.categorySlug}/`">{{ group.categoryLabel }}</a></h3>
          <div class="clinic-cat__list">
            <a
              v-for="item in group.items"
              :key="item.label"
              class="c-tag c-tag--outline"
              :href="item.slug ? `/treatments/${group.categorySlug}/${item.slug}/` : '#'"
            >{{ item.label }}</a>
          </div>
        </div>
      </div>

      <div v-if="clinic.generalServices?.length" class="clinic-general">
        <h3 class="c-heading-bar">皮膚科一般診療</h3>
        <div class="clinic-general__list">
          <span v-for="service in clinic.generalServices" :key="service" class="c-tag c-tag--outline">{{ service }}</span>
        </div>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       8. 院區環境照
       ===================================================================== -->
  <section v-if="clinic.galleryPhotos?.length" class="section" id="gallery">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">CLINIC TOUR</span>
          <h2>院區環境</h2>
          <p>立面招牌與品牌識別延續新中式美學語彙，簡約留白、細節克制。</p>
        </div>
      </div>

      <div class="grid grid--2 clinic-gallery">
        <figure v-for="photo in clinic.galleryPhotos" :key="photo.src" class="clinic-gallery__item">
          <div class="clinic-gallery__frame">
            <img :src="photo.src" :alt="photo.alt" :width="photo.width" :height="photo.height" loading="lazy">
          </div>
          <figcaption class="clinic-gallery__caption">{{ photo.caption }}</figcaption>
        </figure>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       9. 常見問題
       ===================================================================== -->
  <section class="section section--alt" id="faq">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">FAQ</span>
          <h2>常見問題</h2>
          <p>關於{{ clinic.name }}看診安排的常見疑問。</p>
        </div>
      </div>

      <div class="c-faq">
        <details v-for="(item, i) in clinic.faqs" :key="i" class="c-faq__item">
          <summary class="c-faq__q">{{ item.question }}</summary>
          <div class="c-faq__a">
            {{ item.answer }}
            <span v-if="item.lastReviewedOn" class="c-faq__meta">最後更新：{{ item.lastReviewedOn }}</span>
          </div>
        </details>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       10. 另一個院區
       ===================================================================== -->
  <section v-if="otherClinic" class="section section--alt" id="other-clinic">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">ANOTHER LOCATION</span>
          <h2>另一個院區</h2>
          <p>旗下另設有{{ otherClinic.name }}，歡迎就近選擇。</p>
        </div>
      </div>

      <div class="clinic-other clinic-other--plain">
        <h3 class="c-heading-bar">{{ otherClinic.name }}</h3>
        <address class="clinic-other__nap">
          電話：{{ otherClinic.phone }}<br>
          地址：{{ otherClinic.address }}
        </address>
        <table class="c-hours">
          <caption class="visually-hidden">{{ otherClinic.name }}門診時間表</caption>
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
            <tr v-for="row in otherClinic.hoursTable" :key="row.label">
              <th scope="row">{{ row.label }}</th>
              <td v-for="(open, i) in row.days" :key="i" :class="{ 'c-hours__cell--off': !open }">
                <span v-if="open" class="c-hours__mark" aria-hidden="true"></span>
                <span class="visually-hidden">{{ open ? '看診' : '休診' }}</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p class="c-hours__foot">{{ otherClinic.hoursFootnote }}</p>
        <div class="clinic-other__actions">
          <a class="btn btn--ghost btn--sm" :href="`/clinics/${otherClinic.slug}/`">查看診所介紹</a>
        </div>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       11. 頁尾 CTA 區
       ===================================================================== -->
  <section class="section section--alt clinic-cta">
    <div class="container clinic-cta__inner">
      <span class="u-eyebrow">BOOK A CONSULTATION</span>
      <h2>安排你的{{ clinic.name }}門診</h2>
      <p>歡迎線上預約，我們會盡快回覆您的看診需求。</p>
      <div class="clinic-cta__actions">
        <a class="btn btn--primary ext" href="https://booking.20skin.tw/MainMs/Login" target="_blank" rel="noopener external">立即預約</a>
      </div>
    </div>
  </section>
</template>
