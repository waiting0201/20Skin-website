<script setup lang="ts">
// 模板 22 —— 允赫齒科（mockup/22-dental.html）
//
// 2026-11-13 取代原本的「案例分享」（/cases/ 與案例內頁，Tim 定案，CLAUDE.md 決策 34）。
// 允赫齒科是集團在二林的牙科診所；它是一張固定頁（Pages，slug=dental），不是「據點」的第三筆。
//
// ⚠️ 這一頁沒有「立即預約」：允赫齒科不在線上預約系統裡（舊站寫的是現場掛號），
//    主要動作是撥電話，其次是 LINE。不要為了跟其他頁一致就補一顆 bookingUrl() 的按鈕。
// ⚠️ 區段標題與英文小標寫在樣板裡（決策 14：版面留前台）；後台改得到的是每一區的內容。
import { getDentalPage } from '~/data/pages'

const maybePage = await getDentalPage()
if (!maybePage) {
  throw await notFoundUnlessRedirected({ statusMessage: '找不到這個頁面' })
}
const page = maybePage

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

const jsonLd: Record<string, unknown> = {
  '@context': 'https://schema.org',
  '@type': 'Dentist',
  name: page.title,
  ...(page.lede ? { description: page.lede } : {}),
  ...(page.address ? { address: page.address, hasMap: page.mapLinkUrl } : {}),
  ...(page.phone ? { telephone: page.phone } : {}),
  ...(page.hours.length
    ? {
        openingHoursSpecification: page.hours.map((h) => ({
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: `https://schema.org/${DAY_NAMES[h.day] ?? 'Monday'}`,
          opens: h.start,
          closes: h.end,
        })),
      }
    : {}),
  ...(page.services.length ? { availableService: page.services.flatMap((g) => g.items) } : {}),
  ...(page.facebookUrl ? { sameAs: [page.facebookUrl] } : {}),
}

usePageHead({
  seo: page.seo,
  title: page.title,
  description: page.lede
    || '允赫齒科（20SKIN 美醫集團）位於彰化縣二林鎮，健保掛號。主治項目、門診時段、電話與交通方式一次看。',
  pageCss: '/assets/pages/22-dental.css',
  path: '/dental/',
  jsonLd: [
    jsonLd,
    breadcrumbJsonLd([
      { label: '首頁', href: '/' },
      { label: page.title, href: '/dental/' },
    ]),
  ],
})

// 今日看診時間即時標示，純前端計算（做法同 clinics/[slug].vue）。
// JS 失效時 c-hours 表格本身仍完整可讀，這裡只是漸進增強。
const weekdayLabel = ['日', '一', '二', '三', '四', '五', '六']
const statusText = ref('今日看診時間查詢中…')
const isClosed = ref(true)
/** 表格欄位順序（一二三四五六日）中，今天對應的索引；掛載前一律不標示。 */
const todayColumn = ref(-1)

function toMinutes(hhmm: string) {
  const [h = 0, m = 0] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

// 地圖等捲到附近才掛上 iframe —— 理由見 clinics/[slug].vue（Google 那包約 360 KB，會跟首屏搶頻寬）。
const mapCanvas = ref<HTMLElement | null>(null)
const mapVisible = ref(false)
let mapObserver: IntersectionObserver | null = null

onMounted(() => {
  const now = new Date()
  const day = now.getDay()
  todayColumn.value = day === 0 ? 6 : day - 1
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const todaySlots = page.hours.filter((h) => h.day === day).sort((a, b) => a.start.localeCompare(b.start))
  if (!todaySlots.length) {
    statusText.value = `今日（${weekdayLabel[day]}）休診`
    isClosed.value = true
  } else {
    const slotsText = todaySlots.map((s) => `${s.start}–${s.end}`).join('、')
    const openNow = todaySlots.some((s) => nowMinutes >= toMinutes(s.start) && nowMinutes < toMinutes(s.end))
    statusText.value = `今日（${weekdayLabel[day]}）${slotsText}${openNow ? '．看診中' : '．非看診時段'}`
    isClosed.value = !openNow
  }

  const el = mapCanvas.value
  if (!el) return
  if (typeof IntersectionObserver === 'undefined') {
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
</script>

<template>
  <!-- 麵包屑 -->
  <nav class="c-breadcrumb" aria-label="麵包屑">
    <div class="container">
      <ol class="c-breadcrumb__list">
        <li><a href="/">首頁</a></li>
        <li><span class="c-breadcrumb__current" aria-current="page">{{ page.title }}</span></li>
      </ol>
    </div>
  </nav>

  <!-- 1. 頁首：名稱、一句話、電話地址、兩個聯絡動作 -->
  <section class="dental-hero">
    <div class="container dental-hero__layout">
      <div class="dental-hero__copy">
        <span class="u-eyebrow">YUNHE DENTAL</span>
        <h1>{{ page.title }}</h1>
        <p v-if="page.lede" class="dental-hero__lede">{{ page.lede }}</p>

        <a v-if="page.phone" class="dental-hero__tel" :href="page.phoneHref">{{ page.phone }}</a>
        <p v-if="page.address" class="dental-hero__addr">{{ page.address }}</p>

        <div v-if="page.phone || page.lineUrl" class="dental-hero__cta">
          <a v-if="page.phone" class="btn btn--primary" :href="page.phoneHref">撥打電話</a>
          <a v-if="page.lineUrl" class="btn btn--line ext" :href="page.lineUrl" target="_blank" rel="noopener external">LINE 專人諮詢</a>
        </div>
      </div>

      <div class="dental-hero__media">
        <div class="dental-hero__frame">
          <img :src="page.heroImage.src" :srcset="srcsetOf(page.heroImage.src)" :sizes="IMAGE_SIZES.half" :alt="page.heroImage.alt" :width="page.heroImage.width || undefined" :height="page.heroImage.height || undefined">
        </div>
        <p v-if="page.heroCaption" class="dental-hero__caption">{{ page.heroCaption }}</p>
      </div>
    </div>
  </section>

  <!-- 2. 主治項目 -->
  <section v-if="page.services.length" class="section" id="services">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">SERVICES</span>
          <h2>主治項目</h2>
          <p v-if="page.servicesNote">{{ page.servicesNote }}</p>
        </div>
      </div>

      <div class="dental-services__grid">
        <div v-for="(group, gi) in page.services" :key="gi" class="dental-services__group">
          <p class="dental-services__kind">{{ group.kind }}</p>
          <ul class="dental-services__list">
            <li v-for="item in group.items" :key="item">{{ item }}</li>
          </ul>
        </div>
      </div>
    </div>
  </section>

  <!-- 3. 門診時段 ＋ 聯絡方式 -->
  <section class="section section--alt" id="visit">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">OPENING HOURS</span>
          <h2>門診時段與聯絡</h2>
          <p>現場掛號，名額有限。出門前建議先來電確認當天的診次。</p>
        </div>
      </div>

      <div class="dental-visit__layout">
        <div class="dental-visit__col dental-hours">
          <template v-if="page.hoursTable.length">
            <div class="dental-hours__status" :class="{ 'is-closed': isClosed }">
              <svg class="dental-hours__status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>
              </svg>
              <span>{{ statusText }}</span>
            </div>

            <table class="c-hours">
              <caption class="visually-hidden">{{ page.title }}門診時間表</caption>
              <thead>
                <tr>
                  <th scope="col" class="c-hours__corner">門診時間</th>
                  <th v-for="(label, i) in ['一', '二', '三', '四', '五', '六', '日']" :key="label" scope="col" :class="{ 'is-today': i === todayColumn }">{{ label }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in page.hoursTable" :key="row.label">
                  <th scope="row">{{ row.label }}</th>
                  <td v-for="(open, i) in row.days" :key="i" :class="{ 'c-hours__cell--off': !open, 'is-today': i === todayColumn }">
                    <span v-if="open" class="c-hours__mark" aria-hidden="true"></span>
                    <span class="visually-hidden">{{ open ? '看診' : '休診' }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </template>

          <ul v-if="page.hoursNotes.length" class="dental-hours__notes">
            <li v-for="note in page.hoursNotes" :key="note">{{ note }}</li>
          </ul>
        </div>

        <div class="dental-visit__col dental-contact">
          <table class="c-facts">
            <caption class="visually-hidden">{{ page.title }}聯絡方式</caption>
            <tbody>
              <tr v-if="page.phone">
                <th scope="row">電話</th>
                <td><a :href="page.phoneHref">{{ page.phone }}</a></td>
              </tr>
              <tr v-if="page.address">
                <th scope="row">地址</th>
                <td>{{ page.address }}</td>
              </tr>
              <tr v-if="page.registration">
                <th scope="row">掛號方式</th>
                <td>{{ page.registration }}</td>
              </tr>
              <tr v-if="page.lineUrl">
                <th scope="row">LINE</th>
                <td><a class="ext" :href="page.lineUrl" target="_blank" rel="noopener external">專人諮詢</a></td>
              </tr>
              <tr v-if="page.facebookUrl">
                <th scope="row">Facebook</th>
                <td><a class="ext" :href="page.facebookUrl" target="_blank" rel="noopener external">{{ page.title }}粉絲專頁</a></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </section>

  <!-- 4. 如何前往：Google 地圖（以地址查詢，做法同兩個據點頁）＋ 開車路線 -->
  <section v-if="page.address || page.transport.length" class="section" id="route">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">GETTING HERE</span>
          <h2>如何前往{{ page.title }}</h2>
        </div>
      </div>

      <div class="dental-route__layout">
        <div v-if="page.address">
          <div ref="mapCanvas" class="dental-route__canvas">
            <iframe
              v-if="mapVisible"
              :src="page.mapEmbedUrl"
              :title="`${page.title}位置地圖`"
              loading="lazy"
              referrerpolicy="no-referrer-when-downgrade"
              allowfullscreen
            ></iframe>
          </div>
          <div class="dental-route__mapfoot">
            <p class="dental-route__addr">{{ page.address }}</p>
            <a class="btn btn--ghost btn--sm ext" :href="page.mapLinkUrl" target="_blank" rel="noopener external">在 Google 地圖開啟</a>
          </div>
        </div>

        <!-- 交通方式來自後台的「交通與停車」（與據點同一種輸入）。
             「停車」那幾段是提示框，其餘（開車、大眾運輸）是照順序編號的步驟。 -->
        <div v-if="page.transport.length">
          <template v-for="mode in page.transport" :key="mode.title">
            <p v-if="mode.icon === 'parking'" class="c-note dental-route__parking">
              <span class="c-note__icon" aria-hidden="true">P</span>
              <span><strong>{{ mode.title }}</strong>：{{ mode.points.join(' ') }}</span>
            </p>
            <template v-else>
              <h3>{{ mode.title }}</h3>
              <ol class="dental-route__steps">
                <li v-for="step in mode.points" :key="step">{{ step }}</li>
              </ol>
            </template>
          </template>
        </div>
      </div>
    </div>
  </section>

  <!-- 5. 院內環境 -->
  <section v-if="page.gallery.length" class="section" id="gallery">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">INSIDE THE CLINIC</span>
          <h2>院內環境</h2>
        </div>
      </div>

      <div class="grid grid--3 dental-gallery">
        <figure v-for="photo in page.gallery" :key="photo.src" class="dental-gallery__item">
          <div class="dental-gallery__frame">
            <img :src="photo.src" :srcset="srcsetOf(photo.src)" :sizes="IMAGE_SIZES.grid3" :alt="photo.alt" :width="photo.width || undefined" :height="photo.height || undefined" loading="lazy">
          </div>
          <figcaption v-if="photo.caption" class="dental-gallery__caption">{{ photo.caption }}</figcaption>
        </figure>
      </div>
    </div>
  </section>

  <!-- 6. 頁尾 CTA 區 -->
  <section v-if="page.phone || page.lineUrl" class="section section--alt dental-cta">
    <div class="container dental-cta__inner">
      <span class="u-eyebrow">CONTACT</span>
      <h2>來之前，先打個電話</h2>
      <p>門診時間可能調整，來電可以確認當天的診次與掛號名額。</p>
      <div class="dental-cta__actions">
        <a v-if="page.phone" class="btn btn--primary" :href="page.phoneHref">撥打 {{ page.phone }}</a>
        <a v-if="page.lineUrl" class="btn btn--line ext" :href="page.lineUrl" target="_blank" rel="noopener external">LINE 專人諮詢</a>
      </div>
    </div>
  </section>
</template>
