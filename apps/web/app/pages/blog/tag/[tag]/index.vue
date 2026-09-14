<script setup lang="ts">
// 臻美分享／標籤彙整，第 1 頁。版面與資料在 components/BlogTagListing.vue。
//
// ⚠️ noindex 是刻意的，不是漏掉：docs/02-backend-cms.md §1 —— 標籤頁內容單薄，
// 全開索引會稀釋 1100 篇文章的索引預算，個別標籤養出內容後再手動開放。
//
// 這個路由（/blog/tag/:tag/）因為多一個固定的 "tag" 靜態片段，路徑形狀和
// /blog/:slug/、/blog/:category/ 都不一樣（多一層），vue-router 用片段數就能
// 分辨，不會像 [category] 與 [slug] 那樣衝突，不需要額外處理。
//
// 標籤不是像分類一樣的固定四選一封閉清單（會隨內容成長，目前 406 個），
// 所以不驗證 tag 是否在既有清單裡 —— 查無符合的文章時顯示空狀態，而不是 404。
const route = useRoute()
</script>

<template>
  <BlogTagListing :tag-slug="(route.params.tag as string)" :page="1" />
</template>
