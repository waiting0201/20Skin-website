<script setup lang="ts">
// 模板 11 —— 臻美分享／分類清單，第 1 頁。版面與資料在 components/BlogCategoryListing.vue。
//
// ⚠️ 路由衝突：這個路徑（/blog/:category/）與 app/pages/blog/[slug].vue
// （/blog/:slug/）在 vue-router 眼中是同一種形狀（單一動態片段），單靠
// definePageMeta({ validate }) 並不會讓 Nuxt 自動改試下一個候選路由 ——
// validate() 只會在「已經比對到的那個路由」上擋下來丟 404，不會退回去試
// [slug].vue。實際會用哪一個路由是 vue-router 建表時的 score 排序決定。
//
// 解法是用 definePageMeta({ path }) 把路徑換成「帶自訂正規表達式」的動態片段 ——
// vue-router 的評分表給有自訂 regex 的動態片段 +10 分（BonusCustomRegExp），
// 讓這一頁穩贏純動態的 [slug].vue，四個分類以外的字串仍正確落到 [slug].vue。
//
// ⚠️ definePageMeta 的 path 一定要寫成「字面上的字串常數」，不能用樣板字串內插變數。
// Nuxt 在建置期用 AST 靜態分析 definePageMeta() 的參數，只認得 ObjectExpression／
// ArrayExpression／單純的 Literal；樣板字串或參照變數一律判定為「不可序列化」，
// 整段被丟進執行期才合併的 route.meta，**不會**寫進用來建路由表的 route.path ——
// 上面說的 +10 分因此完全不會發生，[slug].vue 還是會贏。四個分類 slug 只好在這裡
// 重複寫一次字面值；下面的檢查確保它沒有跟 ARTICLE_CATEGORIES 兜不起來。
import { ARTICLE_CATEGORIES, type ArticleCategorySlug } from '~/data/articles'

const CATEGORY_SLUGS = ARTICLE_CATEGORIES.map((c) => c.slug)
const CATEGORY_PATH_PATTERN = 'medical-aesthetics|dermatology|media|lectures'
if (import.meta.dev && CATEGORY_PATH_PATTERN.split('|').join(',') !== CATEGORY_SLUGS.join(',')) {
  throw new Error(
    '[blog/[category]/index.vue] definePageMeta 裡寫死的 CATEGORY_PATH_PATTERN 與 articles.ts 的 ARTICLE_CATEGORIES 不同步，請同步修改 path。',
  )
}

definePageMeta({
  path: '/blog/:category(medical-aesthetics|dermatology|media|lectures)',
  validate: (route) => CATEGORY_SLUGS.includes(route.params.category as ArticleCategorySlug),
})

const route = useRoute()
</script>

<template>
  <BlogCategoryListing :category-slug="(route.params.category as ArticleCategorySlug)" :page="1" />
</template>
