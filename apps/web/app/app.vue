<script setup lang="ts">
import { getSiteSettings } from '~/data/site-settings'

// 全站進入點。
//
// ⚠️ 前台刻意使用原生 <a> 做整頁換頁，不用 <NuxtLink> 的前端路由。
//    理由：mockup 的 assets/app.js 是客戶指定原樣保留的動效系統（CLAUDE.md 決策 11），
//    它在解析時一次性初始化 [data-slider] 等元素。前端路由換頁不會重跑它，
//    輪播與 tab 到了第二頁就不會動；而要讓它可重複執行就得改那支檔案。
//    這是一個 950 頁的內容站、全部預渲染成實體 HTML，整頁換頁沒有實質代價，
//    換來的是「每一頁的行為與 mockup 逐字相同」。
//    後台 /admin/** 是 SPA，不載入 app.js，也不受這條限制。
//
// 追蹤碼（GA4／GTM）也在這裡注入，不放 layouts/default.vue ——
// 404 頁（error.vue）不走 default layout，放在 layout 會讓 404 沒有任何數據。
const site = await getSiteSettings()

/**
 * 後台填的是**識別碼**（`G-XXXXXXXX`／`GTM-XXXXXXX`），不是程式碼片段。
 *
 * 🔴 這是刻意的：讓後台收一整段 `<script>` 等於**任何能改設定的人都可以在全站
 *    每一頁對每一位訪客執行任意 JavaScript**，而設定類不走審核也不留痕
 *    （docs/08 §I），後台又沒有 IP 白名單與雙因素（CLAUDE.md 決策 10）。
 *    收 ID、由前台套官方模板，那條路就整個關掉了。
 *
 * ⚠️ ID 在送進來之前已經由 API 用白名單正規表示式驗過
 *    （`SettingHandler.TrackingIdPattern`），這裡只再做一次形狀過濾當保險。
 * ⚠️ 代價：Meta Pixel 這類非 Google 的工具貼不進來。那要另開一個設定鍵，
 *    不是放寬這一欄。
 */
const trackingIds = (site.trackingIds ?? '')
  .split(',')
  .map((id: string) => id.trim())
  .filter((id: string) => /^(G-[A-Z0-9]{4,20}|GTM-[A-Z0-9]{4,10})$/i.test(id))

const gtagId = trackingIds.find((id: string) => id.toUpperCase().startsWith('G-'))
const gtmIds = trackingIds.filter((id: string) => id.toUpperCase().startsWith('GTM-'))

useHead({
  script: [
    { src: stampAsset('/assets/app.js'), tagPosition: 'bodyClose' },
    // GA4：官方 gtag.js snippet。
    ...(gtagId
      ? [
          { src: `https://www.googletagmanager.com/gtag/js?id=${gtagId}`, async: true },
          {
            innerHTML:
              `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}` +
              `gtag('js',new Date());gtag('config','${gtagId}');`,
          },
        ]
      : []),
    // GTM：官方容器 snippet。
    ...gtmIds.map((id: string) => ({
      innerHTML:
        `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});` +
        `var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';` +
        `j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);` +
        `})(window,document,'script','dataLayer','${id}');`,
    })),
  ],
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
