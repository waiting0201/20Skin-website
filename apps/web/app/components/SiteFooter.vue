<script setup lang="ts">
// Footer —— 標記照抄自 mockup，連結改由 FOOTER_COLUMNS / CLINIC_NAP / LEGAL_LINKS 產生。
// 正式站這些值來自後台的「導覽選單與頁尾」與全站設定（docs/02-backend-cms.md §3）。
//
// 🔴 **社群連結與版權文案 2026-09-18 才接上。** 在那之前兩者都是這支元件裡的字面值，
//    而後台「導覽選單與頁尾」有欄位在收它們（`footer.social.json`／`footer.copyright`）——
//    院方編了、存了、按了儲存，網站上一個像素都不會變。連公開端點都沒有回傳這兩個鍵。
// ⚠️ 兩者都屬於**裝飾性資料**（useContentApi.ts 的分類）：API 掛掉時降級，不讓整頁 503。
import { getFooterColumns, getClinicNap, getLegalLinks } from '~/data/navigation'
import { getSiteSettings } from '~/data/site-settings'
import { socialIcon } from '~/data/_presentation'

const [FOOTER_COLUMNS, CLINIC_NAP, LEGAL_LINKS, SITE] = await Promise.all([
  getFooterColumns(), getClinicNap(), getLegalLinks(), getSiteSettings(),
])

// 圖示在這裡一次算完 —— 樣板裡呼叫兩次（fill-rule 一次、d 一次）等於每個連結算兩遍。
const SOCIAL_LINKS = SITE.socialLinks.map((s) => ({ ...s, icon: socialIcon(s.url) }))

// ⚠️ 退路不帶年份：寫死年份的版權列會在跨年那一刻變成錯的，而那一行只有在
//    「API 連不上」時才會出現 —— 正常情況下顯示的是後台那一欄的值。
const COPYRIGHT = SITE.footerCopyright || `© ${new Date().getFullYear()} 20SKIN 美醫集團．All Rights Reserved.`
</script>

<template>
  <footer class="c-footer">
    <div class="container c-footer__top">
      <div class="c-footer__grid">
        <div class="c-footer__brand">
          <div class="c-footer__logo">
            <!-- 頁尾是墨藍底（--brand-700），所以用白色版標誌；頁首那張仍是 logo.jpg -->
            <img src="/assets/logo-white.png" alt="20SKIN 美醫集團標誌" width="36" height="35">
            <span>20SKIN 美醫集團</span>
          </div>
          <p class="c-footer__desc">以新中式美學為理念的皮膚科專科醫療團隊，旗下四季診所與二林四季皮膚科。</p>
          <div v-if="SOCIAL_LINKS.length" class="c-social">
            <a
              v-for="social in SOCIAL_LINKS"
              :key="social.url"
              :href="social.url"
              target="_blank"
              rel="noopener external"
              :aria-label="`${social.label}（另開新分頁）`"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path :fill-rule="social.icon.fillRule" :d="social.icon.path"/>
              </svg>
            </a>
          </div>
        </div>

        <div v-for="col in FOOTER_COLUMNS" :key="col.title" class="c-footer__col">
          <h4 class="c-footer__title">{{ col.title }}</h4>
          <ul class="c-footer__list">
            <li v-for="item in col.items" :key="item.href">
              <a
                v-if="item.external"
                :href="item.href"
                target="_blank"
                rel="noopener external"
                class="ext"
              >{{ item.label }}</a>
              <a v-else :href="item.href">{{ item.label }}</a>
            </li>
          </ul>
        </div>

        <div class="c-footer__col">
          <h4 class="c-footer__title">診所據點</h4>
          <div v-for="clinic in CLINIC_NAP" :key="clinic.name" class="c-footer__nap">
            <p class="c-footer__nap-name">{{ clinic.name }}</p>
            <p>{{ clinic.phone }}</p>
            <p>{{ clinic.address }}</p>
            <p>{{ clinic.hours }}</p>
          </div>
        </div>
      </div>
    </div>

    <div class="container">
      <div class="c-footer__bottom">
        <p>{{ COPYRIGHT }}</p>
        <div class="c-footer__legal">
          <a v-for="link in LEGAL_LINKS" :key="link.href" :href="link.href">{{ link.label }}</a>
        </div>
      </div>
    </div>
  </footer>
</template>
