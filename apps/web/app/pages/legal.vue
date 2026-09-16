<script setup lang="ts">
// 模板 21 —— 通用法務頁（mockup/21-legal.html）
//
// 三個網址 /privacy/、/terms/、/medical-disclaimer/ 共用同一個模板，但正式網址
// 不是 /legal/xxx/（docs/01-sitemap.md §1、任務指示明講）。這裡用單一頁面元件
// ＋ definePageMeta({ alias }) 讓 vue-router 把三個真正的網址都指到這一支檔案，
// 而不是照檔名慣例另外開一個會產生錯誤路由（/legal/:slug）的資料夾。
// 三個網址各自的內容再依目前路徑（useRoute().path）從 ~/data/pages.ts 的
// LEGAL_DOCS 找出對應的一份。
//
// ⚠️ mockup 只把「隱私權政策」寫成完整條文，服務條款／醫療免責聲明的分頁
// 切換得過去但沒有內容（21-legal.html 三個 tab 全部連回同一個檔案）。
// 法務文件不能用前端自己編的條文頂著——寫錯比留白風險更高，尤其醫療免責聲明
// 涉及醫療廣告與責任歸屬，這兩份的條文需要院方法務提供。這裡先給頁面骨架與
// 明確的「待補」提示，不假裝已經有內容。
import { getLegalDocs } from '~/data/pages'

const LEGAL_DOCS = await getLegalDocs()

definePageMeta({
  alias: ['/privacy/', '/terms/', '/medical-disclaimer/'],
})

const route = useRoute()
// ⚠️ LEGAL_DOCS 已在上方取好，這裡用同步 find —— computed 裡不能 await。
const doc = computed(() => LEGAL_DOCS.find((d) => d.path === route.path) ?? LEGAL_DOCS[0]!)

usePageHead({
  title: doc.value.title,
  description: `20SKIN 美醫集團官方網站的${doc.value.title}。`,
  pageCss: '/assets/pages/21-legal.css',
  path: doc.value.path,
  // 服務條款／醫療免責聲明目前只有骨架、沒有條文（見上方說明），先不索引，
  // 避免薄內容頁進了 Google 的索引預算。
  // ⚠️ 判斷由 API 做（`functions/Common/Indexability.cs`），sitemap 讀同一個值 ——
  //    條文補齊之後兩邊會**同時**恢復，不必記得回來改這裡。
  noIndex: !doc.value.indexable,
  jsonLd: breadcrumbJsonLd([
    { label: '首頁', href: '/' },
    { label: doc.value.title, href: doc.value.path },
  ]),
})
</script>

<template>
  <!-- 麵包屑 -->
  <nav class="c-breadcrumb" aria-label="麵包屑">
    <div class="container">
      <ol class="c-breadcrumb__list">
        <li><a href="/">首頁</a></li>
        <li><span class="c-breadcrumb__current" aria-current="page">{{ doc.title }}</span></li>
      </ol>
    </div>
  </nav>

  <!-- 1. 頁首 -->
  <header class="legal-head">
    <div class="container">
      <span class="u-eyebrow">LEGAL</span>
      <h1>{{ doc.title }}</h1>
      <p class="legal-head__meta">最後更新：{{ doc.updatedOn }}</p>
    </div>
  </header>

  <!-- 2. 三頁切換 -->
  <nav class="legal-tabs" aria-label="法務頁面">
    <div class="container">
      <div class="c-tabs__list">
        <a
          v-for="d in LEGAL_DOCS"
          :key="d.slug"
          class="c-tabs__btn"
          :href="d.path"
          :aria-selected="d.slug === doc.slug ? 'true' : 'false'"
          :aria-current="d.slug === doc.slug ? 'page' : undefined"
        >{{ d.navLabel }}</a>
      </div>
    </div>
  </nav>

  <!-- 3. 目錄 ＋ 條文 -->
  <section class="section section--tight" id="content">
    <div class="container legal-layout">

      <nav v-if="doc.sections.length" class="legal-toc" aria-label="條文目錄">
        <p class="legal-toc__title">條文目錄</p>
        <ul class="legal-toc__list">
          <li v-for="s in doc.sections" :key="s.id"><a :href="`#${s.id}`">{{ s.heading }}</a></li>
        </ul>
      </nav>

      <div v-if="doc.sections.length" class="legal-content">
        <section v-for="s in doc.sections" :key="s.id" class="legal-section" :id="s.id">
          <h2>{{ s.heading }}</h2>
          <!-- v-html：內容全部來自 ~/data/pages.ts 的靜態資料（我們自己寫的，不是使用者輸入），
               只有「聯絡我們」那一句需要保留行內連結，其餘都是純文字，安全。 -->
          <p v-for="(p, i) in s.paragraphs" :key="i" v-html="p"></p>
          <ul v-if="s.list" class="legal-list">
            <li v-for="(item, i) in s.list" :key="i">{{ item }}</li>
          </ul>
        </section>
      </div>

      <!-- 服務條款／醫療免責聲明：mockup 沒有寫出條文，這裡誠實顯示待補，不自行擬定內容。 -->
      <div v-else class="legal-content">
        <section class="legal-section">
          <div class="c-note c-note--warn">
            <span class="c-note__icon" aria-hidden="true">&#9888;</span>
            <p>本頁條文尚待院方法務提供，目前僅為版面骨架。上線前必須補齊，否則須自 sitemap 中移除本頁的索引。如有疑問請透過<a href="/contact/">聯絡我們</a>頁面與本院聯繫。</p>
          </div>
        </section>
      </div>

    </div>
  </section>
</template>
