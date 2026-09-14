<script setup lang="ts">
// 模板 11 —— 臻美分享／全部文章，第 1 頁（mockup/06-blog-list.html）。
//
// 版面與資料都在 components/BlogAllListing.vue —— 第 2 頁以後是
// app/pages/blog/page/[n].vue，兩個路由渲染同一個元件。
</script>

<template>
  <BlogAllListing :page="1" />
</template>
