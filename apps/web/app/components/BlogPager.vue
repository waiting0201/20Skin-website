<script setup lang="ts">
// 列表分頁列（標記照抄 mockup/06-blog-list.html 的 .c-pager）。
//
// ⚠️ **每一頁都是實體網址，不是 query string。** 前台是 `nuxt generate` 的純靜態產物，
//    而且 Nitro 靠 `crawlLinks` 從連結爬出要預渲染哪些頁 —— 用 `?page=2` 的話
//    第二頁以後根本不會被產生出來。
//
// ⚠️ 只顯示目前頁附近的頁碼。1111 篇 ÷ 12 ＝ 93 頁，全部印出來就是一整排數字。
const props = defineProps<{
  page: number
  totalPages: number
  /** 第 n 頁的網址。第 1 頁通常是不帶 /page/ 的原始路徑，所以交給呼叫端決定。 */
  hrefFor: (n: number) => string
}>()

/** 目前頁前後各兩頁，加上頭尾；中間斷開的地方用 null 表示省略號。 */
const numbers = computed<(number | null)[]>(() => {
  const { page, totalPages } = props
  const near = new Set<number>([1, totalPages, page])
  for (let d = 1; d <= 2; d++) {
    if (page - d >= 1) near.add(page - d)
    if (page + d <= totalPages) near.add(page + d)
  }
  const sorted = [...near].sort((a, b) => a - b)
  const out: (number | null)[] = []
  for (const [i, n] of sorted.entries()) {
    if (i > 0 && n - sorted[i - 1]! > 1) out.push(null)
    out.push(n)
  }
  return out
})
</script>

<template>
  <nav v-if="totalPages > 1" class="c-pager" aria-label="文章列表分頁">
    <a
      class="c-pager__item"
      :href="page > 1 ? hrefFor(page - 1) : undefined"
      :aria-disabled="page <= 1 ? 'true' : undefined"
    >上一頁</a>
    <template v-for="(n, i) in numbers" :key="i">
      <!-- ⚠️ 省略號沿用 .c-pager__item，不要新增 class —— mockup 的分頁列只有這一個
           class，`pnpm verify:css` 會擋下任何 mockup 標記裡沒有的 class。
           base.css 的 .c-pager__item 沒有限定 <a>，<span> 也吃得到樣式。 -->
      <span v-if="n === null" class="c-pager__item" aria-hidden="true">…</span>
      <a
        v-else
        class="c-pager__item"
        :class="{ 'is-active': n === page }"
        :href="hrefFor(n)"
        :aria-current="n === page ? 'page' : undefined"
      >{{ n }}</a>
    </template>
    <a
      class="c-pager__item"
      :href="page < totalPages ? hrefFor(page + 1) : undefined"
      :aria-disabled="page >= totalPages ? 'true' : undefined"
    >下一頁</a>
  </nav>
  <p class="blog-pager__status">第 {{ page }} 頁，共 {{ totalPages }} 頁</p>
</template>
