<script setup lang="ts">
// 內文區塊的渲染（文章、困擾、案例共用）。標記照抄 mockup/07-article-detail.html 的內文區，
// 由呼叫端包在 `<article class="article-content">` 裡，並在 usePageHead 載入
// `/assets/pages/07-article-detail.css`（樣式都掛在那支）。
//
// ⚠️ 2026-11-11 由 `pages/blog/[slug].vue` 原樣抽出來 —— 困擾與案例改成單一內文編輯器之後
//    要渲染同一套區塊（Tim 指定）。三頁共用這一份，改了要三頁都看。
// 🔴 段落是純文字（`{{ }}`，決策 17）。區塊裡的 `runs` 等其他鍵前台不讀。
import type { ArticleBodyBlock } from '~/data/articles'

defineProps<{ blocks: ArticleBodyBlock[] }>()
</script>

<template>
  <template v-for="(block, i) in blocks" :key="i">
    <p v-if="block.type === 'lead'" class="article-lead">{{ block.text }}</p>
    <h2 v-else-if="block.type === 'heading' && block.level === 2" :id="block.id">{{ block.text }}</h2>
    <h3 v-else-if="block.type === 'heading' && block.level === 3">{{ block.text }}</h3>
    <p v-else-if="block.type === 'paragraph'">{{ block.text }}</p>
    <figure v-else-if="block.type === 'figure'" class="article-figure" :class="{ 'article-figure--wide': block.wide }">
      <div class="article-figure__frame">
        <img :src="block.image.src" :srcset="srcsetOf(block.image.src)" :sizes="IMAGE_SIZES.full" :alt="block.image.alt" :width="block.image.width" :height="block.image.height" loading="lazy">
      </div>
      <figcaption>{{ block.caption }}</figcaption>
    </figure>
    <div v-else-if="block.type === 'table'" class="article-table-wrap">
      <table class="article-table">
        <thead>
          <tr>
            <th v-for="h in block.headers" :key="h" scope="col">{{ h }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, r) in block.rows" :key="r">
            <td v-for="(cell, c) in row" :key="c">{{ cell }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <ol v-else-if="block.type === 'list' && block.ordered" class="article-list">
      <li v-for="(item, li) in block.items" :key="li">{{ item }}</li>
    </ol>
    <ul v-else-if="block.type === 'list' && !block.ordered" class="article-list">
      <li v-for="(item, li) in block.items" :key="li">{{ item }}</li>
    </ul>
    <div v-else-if="block.type === 'note'" class="c-note" :class="{ 'c-note--warn': block.variant === 'warn' }">
      <span class="c-note__icon" aria-hidden="true">{{ block.variant === 'warn' ? '⚠' : 'ⓘ' }}</span>
      <p>{{ block.text }}</p>
    </div>
  </template>
</template>
