<script setup lang="ts">
// 前台版面框架。對應 mockup 每一頁的 <body> 外層結構：
//   skip-link → header → main#main → footer → 浮動諮詢鈕 ＋ 面板 → app.js
//
// ⚠️ 前台刻意使用原生 <a>，不用 <NuxtLink>（見 app.vue 的說明）。
// AI 面板的開關**在執行期讀**，不是建置期常數 —— 院方在後台按一下就要生效，
// 不必等下一次建置（docs/08 §J-4 步驟 7 的註解、docs/09 §13）。
const siteSettings = await usePublicSiteSettings()

defineProps<{ section?: string }>()
</script>

<template>
  <div>
    <a class="skip-link" href="#main">跳到主要內容</a>

    <SiteHeader :section="section" />

    <main id="main">
      <slot />
    </main>

    <SiteFooter />

    <!-- AI 問答面板：由全站設定的開關決定是否輸出這段 DOM（docs/04-ai-faq.md §4）。
         ⚠️ 開關關閉時**整段 DOM 都不輸出** —— 不是用 CSS 藏起來。
         一顆點下去沒反應的常駐按鈕比沒有按鈕更糟（docs/04 §4）。 -->
    <SiteConsult
      v-if="siteSettings.aiFaqEnabled"
      :panel-title="siteSettings.aiFaqPanelTitle"
      :welcome-text="siteSettings.aiFaqWelcomeText"
      :booking-url="siteSettings.aiFaqHandoffBookingUrl"
      :line-url="siteSettings.aiFaqHandoffLineUrl"
    />
  </div>
</template>
