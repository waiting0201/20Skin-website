<script setup lang="ts">
// 前台版面框架。對應 mockup 每一頁的 <body> 外層結構：
//   skip-link → header → main#main → footer → 浮動諮詢鈕 ＋ 面板 → app.js
//
// ⚠️ 前台刻意使用原生 <a>，不用 <NuxtLink>（見 app.vue 的說明）。
import { SITE_SETTINGS } from '~/data/site-settings'

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

    <!-- AI 問答面板：由全站設定的開關決定是否輸出這段 DOM（docs/04-ai-faq.md §4） -->
    <SiteConsult v-if="SITE_SETTINGS.aiFaqEnabled" />
  </div>
</template>
