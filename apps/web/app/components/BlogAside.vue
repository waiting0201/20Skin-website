<script setup lang="ts">
// 列表頁側欄（站內搜尋／熱門標籤／熱門療程）。
//
// ⚠️ 三個列表頁（全部文章、分類、標籤）原本各自抄一份完全相同的側欄。
//    加分頁之後每一種列表都會多一個 `/page/{n}/` 的路由，再抄下去就是六份。
import { getPopularTags, POPULAR_TREATMENTS_FOR_BLOG } from '~/data/articles'

const POPULAR_TAGS = await getPopularTags()
</script>

<template>
<aside class="blog-aside" aria-label="側邊資訊">
  <div class="blog-aside__block">
    <h3 class="c-heading-bar">站內搜尋</h3>
    <form class="blog-search" role="search" action="/search/" method="get">
      <label class="visually-hidden" for="blogSearchInput">搜尋文章</label>
      <input class="blog-search__input" id="blogSearchInput" name="q" type="search" placeholder="輸入關鍵字…">
      <button class="btn btn--primary btn--sm" type="submit" aria-label="搜尋">
        <svg class="btn__icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5Zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14Z"/></svg>
      </button>
    </form>
  </div>

  <div class="blog-aside__block">
    <h3 class="c-heading-bar">熱門標籤</h3>
    <div class="blog-tags">
      <a v-for="tag in POPULAR_TAGS" :key="tag.slug" class="c-tag" :href="`/blog/tag/${tag.slug}/`">{{ tag.label }}</a>
    </div>
  </div>

  <div class="blog-aside__block">
    <h3 class="c-heading-bar">熱門療程</h3>
    <ul class="blog-mini-list">
      <li v-for="item in POPULAR_TREATMENTS_FOR_BLOG" :key="item.slug" class="blog-mini">
        <a class="blog-mini__media" :href="`/treatments/${item.categorySlug}/${item.slug}/`">
          <img :src="item.image.src" :alt="item.image.alt" :width="item.image.width" :height="item.image.height" loading="lazy">
        </a>
        <div class="blog-mini__body">
          <span class="c-tag c-tag--outline">{{ item.categoryLabel }}</span>
          <h4 class="blog-mini__title"><a :href="`/treatments/${item.categorySlug}/${item.slug}/`">{{ item.name }}</a></h4>
        </div>
      </li>
    </ul>
  </div>
</aside>
</template>
