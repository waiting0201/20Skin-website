<script setup lang="ts">
// 臻美分享／分類清單，第 2 頁以後。
//
// ⚠️ 四個分類 slug 的字面值與 ../index.vue 必須一致 —— 同樣不能用變數內插，
//    理由見該檔案檔頭（Nuxt 對 definePageMeta 只做靜態分析）。
//    多了 `/page/` 這個固定片段之後路徑形狀就與 [slug].vue 不同，不會互搶，
//    但自訂 regex 仍要保留，否則 `/blog/隨便什麼/page/2/` 也會落到這裡。
import { getArticleCategories, type ArticleCategorySlug } from '~/data/articles'

// 🔴 四個分類 slug 在這裡是**寫死的字面值**，而且必須是 —— `definePageMeta` 是
//    編譯期巨集，它的 `path` 與 `validate` 引用不到執行期才從 API 取回來的分類清單
//    （2026-09-15 改成執行期 SSR 之前，那份清單是模組常數，所以原本引用得到）。
// ⚠️ 原本那段「寫死值 vs 分類清單是否同步」的檢查因此移到 setup 裡
//    （下方 assertCategorySlugsInSync），時機從建置期變成算繪期，
//    但仍然只在 dev 下拋錯 —— 正式環境不該因為這種一致性問題整頁掛掉。
const CATEGORY_PATH_PATTERN = 'medical-aesthetics|dermatology|media|lectures'
const CATEGORY_SLUGS = CATEGORY_PATH_PATTERN.split('|') as ArticleCategorySlug[]

definePageMeta({
  path: '/blog/:category(medical-aesthetics|dermatology|media|lectures)/page/:n(\\d+)',
  validate: (route) => CATEGORY_SLUGS.includes(route.params.category as ArticleCategorySlug),
})

/** 寫死的路由樣式與資料庫的文章分類是否還對得起來。⚠️ 只在 dev 拋錯。 */
async function assertCategorySlugsInSync() {
  if (!import.meta.dev) return
  const actual = (await getArticleCategories()).map((c) => c.slug).join(',')
  if (actual !== CATEGORY_SLUGS.join(',')) {
    throw new Error(
      '[blog/[category]/page/[n].vue] definePageMeta 裡寫死的 CATEGORY_PATH_PATTERN 與資料庫的文章分類不同步，請同步修改 path。',
    )
  }
}
await assertCategorySlugsInSync()

const route = useRoute()
</script>

<template>
  <BlogCategoryListing
    :category-slug="(route.params.category as ArticleCategorySlug)"
    :page="Number(route.params.n)"
  />
</template>
