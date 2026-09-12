<script setup lang="ts">
// 模板 18 —— 聯絡我們（mockup/18-contact.html）
//
// 表單送出打 POST /contact（docs/10-api.md §3.1）：只寄通知信、不落庫。
//
// 🔴 **失敗一定要顯示失敗。** 這是一個信件黑洞最容易出現的地方：使用者以為送出了、
// 院方其實永遠收不到。所以送出結果一律照 API 回的錯誤碼顯示，不吞錯、不假裝成功，
// 並在錯誤訊息裡給出替代路徑（致電、線上預約）。
import { CLINIC_NAP } from '~/data/navigation'

usePageHead({
  title: '聯絡我們',
  description: '一般問題可先看常見問題，需要預約請用線上系統。表單適合詢問流程與其他非緊急事項。',
  pageCss: '/assets/pages/18-contact.css',
  path: '/contact/',
  jsonLd: breadcrumbJsonLd([
    { label: '首頁', href: '/' },
    { label: '聯絡我們', href: '/contact/' },
  ]),
})

interface ContactPayload {
  name: string
  phone: string
  email: string
  site: string
  topic: string
  message: string
  consent: boolean
}

// 聲明文字只在真的啟用驗證時顯示 —— 沒設定 site key 的環境顯示它是不實陳述。
const botCheckEnabled = useBotCheck().enabled

const form = reactive<ContactPayload>({
  name: '',
  phone: '',
  email: '',
  site: '',
  topic: '',
  message: '',
  consent: false,
})

type SubmitStatus = 'idle' | 'sending' | 'sent' | 'error'
const status = ref<SubmitStatus>('idle')
const errorMessage = ref('')

/**
 * `POST /contact`（docs/10-api.md §3.1）。
 *
 * 🔴 **只寄通知信，不落庫**（docs/02 §2）——姓名、電話、Email 不會進資料庫，
 *    只有提問內容本身會寫進題庫成長清單（docs/08 §F）。回應也不帶任何內部 Id。
 *
 * ⚠️ 這是前台**執行期**唯一會寫入的動作之一。它對公網開放，所以 API 那頭有
 *    頻率限制與機器人驗證（docs/10 §3.1）——429 與 BOT_CHECK_FAILED 都要照實顯示，
 *    不能把它們吞掉當成「送出成功」。
 *
 * ⚠️ 一律以**錯誤碼**分支，不比對 message 字串（docs/10 §2）。
 */
async function submitContactForm(payload: ContactPayload): Promise<void> {
  const { public: { apiBaseUrl } } = useRuntimeConfig()

  // 機器人驗證（docs/10 §5，reCAPTCHA v3）。
  //
  // 🔴 **在這裡取 token，不是在頁面載入時。** v3 的 token 只有 2 分鐘效期 ——
  //    載入時就取的話，使用者慢慢填完再送出時早就過期了，而錯誤訊息會指向
  //    「自動化驗證未通過」，完全查不到真正的原因。
  //
  // 🔴 **取不到就不要送出。** 後端對「沒有 token」是擋下（不然不送就能繞過），
  //    所以硬送只會拿到一個看不懂的錯誤。這裡直接給出真正的原因與替代做法。
  const botCheck = useBotCheck()
  const botCheckToken = await botCheck.getToken('contact')
  if (botCheck.enabled && !botCheckToken) {
    throw new Error('無法載入自動化驗證（可能被瀏覽器擴充套件或網路環境擋下）。請關閉阻擋類擴充套件後重試，或直接致電院所。')
  }

  const response = await $fetch<{ success: boolean; code: string | null; message: string | null }>(
    `${apiBaseUrl}/contact`,
    {
      method: 'POST',
      body: {
        name: payload.name,
        phone: payload.phone,
        email: payload.email,
        site: payload.site,
        topic: payload.topic,
        message: payload.message,
        privacyConsent: payload.consent,
        botCheckToken,
      },
      // 非 2xx 不要讓 $fetch 直接丟掉回應內容 —— 錯誤碼在 body 裡。
      ignoreResponseError: true,
    },
  )

  if (!response?.success) {
    throw new Error(errorTextFor(response?.code ?? null, response?.message ?? null))
  }
}

/** docs/10-api.md §2 的錯誤碼值域 → 給人看的說明。 */
function errorTextFor(code: string | null, message: string | null): string {
  switch (code) {
    case 'RATE_LIMITED':
      return '送出太過頻繁，請稍候幾分鐘再試一次。若是急事請直接致電院所。'
    case 'BOT_CHECK_FAILED':
      return '自動化驗證未通過，請重新整理頁面後再送出一次。若仍不成功，請直接致電院所。'
    case 'VALIDATION_REQUIRED':
    case 'VALIDATION_FORMAT':
      return message ?? '有欄位未填或格式不正確，請檢查後再送出。'
    default:
      return '送出失敗，請稍後再試。若是急事請直接致電院所，或使用下方的「線上預約看診」。'
  }
}

async function handleSubmit() {
  status.value = 'sending'
  errorMessage.value = ''
  try {
    await submitContactForm({ ...form })
    status.value = 'sent'
    // 送出成功後清空，避免使用者重複按送出又送一次同樣的內容。
    Object.assign(form, { name: '', phone: '', email: '', site: '', topic: '', message: '', consent: false })
  } catch (e) {
    status.value = 'error'
    errorMessage.value = e instanceof Error ? e.message : '送出失敗，請稍後再試。'
  }
}
</script>

<template>
  <!-- 麵包屑 -->
  <nav class="c-breadcrumb" aria-label="麵包屑">
    <div class="container">
      <ol class="c-breadcrumb__list">
        <li><a href="/">首頁</a></li>
        <li><span class="c-breadcrumb__current" aria-current="page">聯絡我們</span></li>
      </ol>
    </div>
  </nav>

  <!-- 1. Hero -->
  <section class="contact-hero">
    <div class="container contact-hero__layout">
      <div class="contact-hero__copy">
        <span class="u-eyebrow">CONTACT</span>
        <h1 class="contact-hero__title">聯絡我們</h1>
        <p class="contact-hero__lede">一般問題可先看<a href="/faq/">常見問題</a>，需要預約請用線上系統。表單適合詢問流程與其他非緊急事項。</p>
      </div>
      <div class="contact-hero__media">
        <div class="contact-hero__frame">
          <img src="/assets/img/photo-glass-facade.jpg" alt="四季診所玻璃立面與 20SKIN 蝕刻標誌" width="1488" height="1800">
        </div>
      </div>
    </div>
  </section>

  <!-- 2. 表單 ＋ 聯絡資訊 -->
  <section class="section section--tight" id="form">
    <div class="container contact-layout">

      <form class="contact-form" novalidate @submit.prevent="handleSubmit">
        <div class="c-sechead">
          <div class="c-sechead__text">
            <span class="u-eyebrow">SEND A MESSAGE</span>
            <h2>填寫聯絡表單</h2>
            <p>標示 <span class="contact-field__req">＊</span> 為必填。我們會於門診營業時間內回覆。</p>
          </div>
        </div>

        <div class="contact-form__grid">
          <div class="contact-field">
            <label class="contact-field__label" for="cfName">姓名<span class="contact-field__req">＊</span></label>
            <input class="contact-input" id="cfName" v-model="form.name" name="name" type="text" autocomplete="name" placeholder="王小明">
          </div>

          <div class="contact-field">
            <label class="contact-field__label" for="cfPhone">聯絡電話<span class="contact-field__req">＊</span></label>
            <input class="contact-input" id="cfPhone" v-model="form.phone" name="phone" type="tel" autocomplete="tel" placeholder="09XX-XXX-XXX">
          </div>

          <div class="contact-field">
            <label class="contact-field__label" for="cfEmail">電子郵件</label>
            <input class="contact-input" id="cfEmail" v-model="form.email" name="email" type="email" autocomplete="email" placeholder="name@example.com">
          </div>

          <div class="contact-field">
            <label class="contact-field__label" for="cfSite">希望聯絡的院區</label>
            <select class="contact-select" id="cfSite" v-model="form.site" name="site">
              <option value="">不指定</option>
              <option value="siji">四季診所</option>
              <option value="erlin">二林四季皮膚科</option>
            </select>
          </div>

          <div class="contact-field contact-field--full">
            <label class="contact-field__label" for="cfTopic">諮詢主題<span class="contact-field__req">＊</span></label>
            <select class="contact-select" id="cfTopic" v-model="form.topic" name="topic">
              <option value="">請選擇</option>
              <option value="treatment">療程相關</option>
              <option value="booking">預約與看診流程</option>
              <option value="clinic">院所與交通資訊</option>
              <option value="media">媒體與合作</option>
              <option value="other">其他</option>
            </select>
          </div>

          <div class="contact-field contact-field--full">
            <label class="contact-field__label" for="cfMessage">問題內容<span class="contact-field__req">＊</span></label>
            <textarea class="contact-textarea" id="cfMessage" v-model="form.message" name="message" placeholder="請簡述你想詢問的內容。涉及個人膚況的判斷需由醫師面診，表單無法提供診斷或治療建議。"></textarea>
            <span class="contact-field__hint">請勿在表單中填寫病歷號、身分證字號等個人敏感資料。</span>
          </div>
        </div>

        <label class="contact-consent" for="cfConsent">
          <input id="cfConsent" v-model="form.consent" name="consent" type="checkbox">
          <span>我已閱讀並同意<a href="/privacy/">隱私權政策</a>，同意 20SKIN 美醫集團為回覆本次詢問之目的蒐集與處理上述個人資料。</span>
        </label>

        <!-- 🔴 Google 的條款：隱藏浮動徽章就**必須**顯示這段聲明，而且要留著這兩個連結。
             徽章之所以隱藏，是因為它與右下角的浮動諮詢鈕（c-consult）會疊在一起。
             ⚠️ 不要把這段刪掉或改寫成自己的說法 —— 它是使用條款要求的文字。 -->
        <p v-if="botCheckEnabled" class="contact-field__hint">
          本表單受 reCAPTCHA 保護，適用 Google 的
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener external">隱私權政策</a>與
          <a href="https://policies.google.com/terms" target="_blank" rel="noopener external">服務條款</a>。
        </p>

        <p v-if="status === 'sent'" class="c-note">
          <span class="c-note__icon" aria-hidden="true">&#10003;</span>
          已送出，我們會盡快與您聯繫。若是急事請直接致電院所。
        </p>
        <p v-if="status === 'error'" class="c-note c-note--warn">
          <span class="c-note__icon" aria-hidden="true">&#9888;</span>
          {{ errorMessage }}
        </p>

        <div class="contact-actions">
          <button class="btn btn--primary" type="submit" :disabled="status === 'sending'">{{ status === 'sending' ? '送出中…' : '送出表單' }}</button>
          <button class="btn btn--line" type="reset">清除重填</button>
        </div>

      </form>

      <aside class="contact-aside">
        <div class="contact-block">
          <h2>直接聯絡</h2>

          <div v-for="clinic in CLINIC_NAP" :key="clinic.name" class="contact-nap">
            <h3>{{ clinic.name }}</h3>
            <address>
              <!-- CLINIC_NAP.phone 目前是佔位值（04-XXX-XXXX，見 ~/data/navigation.ts），
                   不是合法電話號碼，無法組成 tel: 連結；沿用 mockup 的佔位 tel 號碼，
                   等院方提供正式電話後兩處要一起換掉。 -->
              電話：<a href="tel:+886400000000">{{ clinic.phone }}</a><br>
              地址：{{ clinic.address }}<br>
              門診：{{ clinic.hours }}
            </address>
          </div>

        </div>

        <div class="contact-block">
          <h2>其他入口</h2>
          <p>預約看診、線上購物與據點資訊都有各自的入口，走對地方會比較快。</p>
          <div class="contact-aside__actions">
            <a class="btn btn--primary btn--block ext" href="https://booking.20skin.tw/MainMs/Login" target="_blank" rel="noopener external">線上預約看診</a>
            <a class="btn btn--line btn--block ext" href="https://www.20skinshop.com/" target="_blank" rel="noopener external">線上購物</a>
            <a class="btn btn--ghost btn--block" href="/clinics/">查看據點與時段</a>
          </div>
        </div>

        <div class="contact-block">
          <h2>急性症狀怎麼辦</h2>
          <p class="c-note c-note--warn">療程後若出現持續加劇的疼痛、紅腫或分泌物，請直接致電院所或儘速回診，不要以表單等待回覆。夜間、休診時段請儘速前往鄰近急診就醫。</p>
        </div>
      </aside>

    </div>
  </section>

  <!-- 3. 位置 -->
  <section class="section section--alt" id="location">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">LOCATION</span>
          <h2>兩個院區的位置</h2>
          <p>同在彰化二林，步行可達的距離內。</p>
        </div>
        <a class="c-sechead__more" href="/clinics/">查看據點資訊 →</a>
      </div>
      <div class="contact-map" role="img" aria-label="兩院區位置地圖示意，正式站將嵌入 Google 地圖"></div>
    </div>
  </section>
</template>
