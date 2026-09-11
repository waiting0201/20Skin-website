<script setup lang="ts">
// 全站進入點。
//
// ⚠️ 前台刻意使用原生 <a> 做整頁換頁，不用 <NuxtLink> 的前端路由。
//    理由：mockup 的 assets/app.js 是客戶指定原樣保留的動效系統（CLAUDE.md 決策 11），
//    它在解析時一次性初始化 [data-slider] 等元素。前端路由換頁不會重跑它，
//    輪播與 tab 到了第二頁就不會動；而要讓它可重複執行就得改那支檔案。
//    這是一個 950 頁的內容站、全部預渲染成實體 HTML，整頁換頁沒有實質代價，
//    換來的是「每一頁的行為與 mockup 逐字相同」。
//    後台 /admin/** 是 SPA，不載入 app.js，也不受這條限制。
useHead({
  script: [{ src: '/assets/app.js', tagPosition: 'bodyClose' }],
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
