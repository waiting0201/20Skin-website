<script setup lang="ts">
// 臻美分享／標籤彙整，第 2 頁以後。
//
// ⚠️ `:n(\\d+)` 限制成數字，否則 `/blog/tag/botox/page/abc/` 也會落到這裡。
definePageMeta({ path: '/blog/tag/:tag/page/:n(\\d+)' })

const route = useRoute()
</script>

<template>
  <BlogTagListing :tag-slug="(route.params.tag as string)" :page="Number(route.params.n)" />
</template>
