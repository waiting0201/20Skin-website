<script setup lang="ts">
// SSR 下所有「沒有對應頁面」的落點。
//
// 🔴 **靜態時代沒有這支，SSR 之後非有不可。** 預渲染的站是由 `/api/fallback`
//    接住未匹配的網址（查 301，查不到就送出建置產物裡的 404.html）。改成即時算繪
//    之後那支 function 不存在了，Nuxt 自己要處理 —— 少了這個檔案，訪客看到的是
//    **Nuxt 的預設錯誤頁**，標題長這樣：「404 - Page not found: /xxx | Nuxt」。
//    2026-09-15 實測確認過，不是推測。
//
// ⚠️ **標記不在這裡重抄一份。** 直接算繪模板 20（`pages/404.vue`），
//    那一頁的標記是逐字照抄 `mockup/20-404.html` 的，而 `verify:css` 只認得
//    mockup 的詞彙 —— 在這裡自己寫一套版面，等於發明新 class，會被擋下，
//    而且從此有兩份 404 要一起維護。
//
// ⚠️ 404 以外的錯誤（500 等）**不要也套 404 那一頁** —— 「找不到頁面」跟
//    「網站出錯了」對訪客是兩件事，而且對爬蟲更嚴重：把 500 講成 404 會讓
//    Google 以為那個網址已經永久消失，而實際上只是後端暫時掛掉。
//    mockup 沒有 500 的樣板，所以這裡用同一份頁面樣式寫一段最小的訊息。
import type { NuxtError } from '#app'
import NotFoundPage from '~/pages/404.vue'

const props = defineProps<{ error: NuxtError }>()
const isNotFound = computed(() => props.error?.statusCode === 404)

// ⚠️ 非 404 的情況才在這裡掛 head —— 404 由 `pages/404.vue` 自己掛，
//    兩邊都掛會讓標題與 canonical 互相覆蓋。
if (!isNotFound.value) {
  usePageHead({
    title: '網站暫時無法顯示',
    description: '這個頁面暫時無法顯示，請稍後再試，或改用站內搜尋與主要入口。',
    pageCss: '/assets/pages/20-404.css',
    path: '/',
    noIndex: true,
  })
}
</script>

<template>
  <NuxtLayout>
    <NotFoundPage v-if="isNotFound" />

    <!-- ⚠️ class 一律沿用 mockup/20-404.html 的詞彙（nf-*），不要新增 ——
         發明 class 必然伴隨新樣式，而樣式只能來自 mockup，verify:css 會擋下。 -->
    <section v-else class="nf-hero">
      <div class="container nf-hero__layout">
        <div class="nf-hero__copy">
          <p class="nf-hero__code">{{ error?.statusCode ?? 500 }}</p>
          <h1 class="nf-hero__title">網站暫時無法顯示</h1>
          <p class="nf-hero__lede">
            這個頁面暫時無法顯示，不是網址錯了。請稍後再試一次；若持續發生，歡迎直接與我們聯絡。
          </p>

          <div class="nf-actions">
            <a class="btn btn--ghost" href="/">回首頁</a>
            <a class="btn btn--line" href="/contact/">聯絡我們</a>
          </div>
        </div>
      </div>
    </section>
  </NuxtLayout>
</template>
