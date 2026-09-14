<script setup lang="ts">
// 臻美分享／分類清單，第 2 頁以後。
//
// ⚠️ 四個分類 slug 的字面值與 ../index.vue 必須一致 —— 同樣不能用變數內插，
//    理由見該檔案檔頭（Nuxt 對 definePageMeta 只做靜態分析）。
//    多了 `/page/` 這個固定片段之後路徑形狀就與 [slug].vue 不同，不會互搶，
//    但自訂 regex 仍要保留，否則 `/blog/隨便什麼/page/2/` 也會落到這裡。
import { ARTICLE_CATEGORIES, type ArticleCategorySlug } from '~/data/articles'

const CATEGORY_SLUGS = ARTICLE_CATEGORIES.map((c) => c.slug)
const CATEGORY_PATH_PATTERN = 'medical-aesthetics|dermatology|media|lectures'
if (import.meta.dev && CATEGORY_PATH_PATTERN.split('|').join(',') !== CATEGORY_SLUGS.join(',')) {
  throw new Error(
    '[blog/[category]/page/[n].vue] 寫死的分類 slug 與 articles.ts 的 ARTICLE_CATEGORIES 不同步。',
  )
}

definePageMeta({
  path: '/blog/:category(medical-aesthetics|dermatology|media|lectures)/page/:n(\\d+)',
  validate: (route) => CATEGORY_SLUGS.includes(route.params.category as ArticleCategorySlug),
})

const route = useRoute()
</script>

<template>
  <BlogCategoryListing
    :category-slug="(route.params.category as ArticleCategorySlug)"
    :page="Number(route.params.n)"
  />
</template>
