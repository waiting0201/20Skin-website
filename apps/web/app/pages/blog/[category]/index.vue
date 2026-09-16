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
  path: '/blog/:category(medical-aesthetics|dermatology|media|lectures)',
  validate: (route) => CATEGORY_SLUGS.includes(route.params.category as ArticleCategorySlug),
})

/** 寫死的路由樣式與資料庫的文章分類是否還對得起來。⚠️ 只在 dev 拋錯。 */
async function assertCategorySlugsInSync() {
  if (!import.meta.dev) return
  const actual = (await getArticleCategories()).map((c) => c.slug).join(',')
  if (actual !== CATEGORY_SLUGS.join(',')) {
    throw new Error(
      '[blog/[category]/index.vue] definePageMeta 裡寫死的 CATEGORY_PATH_PATTERN 與資料庫的文章分類不同步，請同步修改 path。',
    )
  }
}
await assertCategorySlugsInSync()

const route = useRoute()
</script>

<template>
  <BlogCategoryListing :category-slug="(route.params.category as ArticleCategorySlug)" :page="1" />
</template>
