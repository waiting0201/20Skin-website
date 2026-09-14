<script setup lang="ts">
// 臻美分享／全部文章，第 2 頁以後。
//
// ⚠️ **路徑要多一層 `page/`，不能做成 `/blog/2/`** —— 那會和 `/blog/:slug/`
//    （文章內頁）形狀相同而互搶，和 `[category]` 當初遇到的是同一件事
//    （見 blog/[category]/index.vue 檔頭）。多一個固定片段就沒有這個問題。
//
// ⚠️ `:n(\\d+)` 限制成數字，否則 `/blog/page/abc/` 也會落到這裡。
definePageMeta({ path: '/blog/page/:n(\\d+)' })

const route = useRoute()
</script>

<template>
  <BlogAllListing :page="Number(route.params.n)" />
</template>
