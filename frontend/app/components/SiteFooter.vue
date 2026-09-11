<script setup lang="ts">
// Footer —— 標記照抄自 mockup，連結改由 FOOTER_COLUMNS / CLINIC_NAP / LEGAL_LINKS 產生。
// 正式站這些值來自後台的「導覽選單與頁尾」與全站設定（docs/02-backend-cms.md §3）。
import { FOOTER_COLUMNS, CLINIC_NAP, LEGAL_LINKS, SOCIAL_LINKS } from '~/data/navigation'
</script>

<template>
  <footer class="c-footer">
    <div class="container c-footer__top">
      <div class="c-footer__grid">
        <div class="c-footer__brand">
          <div class="c-footer__logo">
            <img src="/assets/logo.jpg" alt="20SKIN 美醫集團標誌" width="36" height="35">
            <span>20SKIN 美醫集團</span>
          </div>
          <p class="c-footer__desc">以新中式美學為理念的皮膚科專科醫療團隊，旗下四季診所與二林四季皮膚科。</p>
          <div class="c-social">
            <a
              v-for="social in SOCIAL_LINKS"
              :key="social.href"
              :href="social.href"
              target="_blank"
              rel="noopener external"
              :aria-label="`${social.label}（另開新分頁）`"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 21v-7.5H16l.4-3H13.5V8.4c0-.87.24-1.46 1.5-1.46H16.5V4.36C16.24 4.32 15.35 4.25 14.32 4.25c-2.15 0-3.62 1.31-3.62 3.72V10.5H8.25v3h2.45V21h2.8Z"/></svg>
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
        <p>&copy; 2026 20SKIN 美醫集團．All Rights Reserved.</p>
        <div class="c-footer__legal">
          <a v-for="link in LEGAL_LINKS" :key="link.href" :href="link.href">{{ link.label }}</a>
        </div>
      </div>
    </div>
  </footer>
</template>
