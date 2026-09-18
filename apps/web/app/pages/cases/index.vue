<script setup lang="ts">
// 模板 13 —— 案例列表（mockup/14-case-list.html）
//
// 只有「痘疤紋理的分次調理」在 mockup 有完整內頁內容與法規揭露欄位
// （個案差異聲明、當事人書面同意、拍攝條件，見 docs/08-database.md §C-5）。
// 其餘 9 則案例目前只有列表卡片的摘要資訊，沒有這些必填欄位可用，
// 所以維持 mockup 原樣的無效連結，不接到還不存在的內頁 —— 見 ~/data/cases.ts 開頭的說明。
//
// 🔴 **兩排篩選 2026-09-18 才真的接上**（做法比照醫師列表 2026-09-16 那次）。
//    在那之前是照抄 mockup 的字面值，七顆按鈕裡六顆連到 `#`，按下去毫無反應；
//    名稱又與後台的困擾／療程分類各存一份，改了後台不會跟。
// ⚠️ **用查詢字串做，不做 client 端顯示／隱藏** —— SSR 之下前者不需要 JS、
//    可以分享網址，後者會讓「篩選後的畫面」在 HTML 裡看不出來。
import { getCaseList, caseFilters, CASE_HOW_TO_READ } from '~/data/cases'

const route = useRoute()

const ALL_CASES = await getCaseList()
const FILTERS = caseFilters(ALL_CASES)

/** 認得的值才生效；網址被亂改時退回「全部」，不要變成空清單。 */
const pick = (key: 'concern' | 'treatment', options: { slug: string }[]) => computed(() => {
  const q = route.query[key]
  const v = typeof q === 'string' ? q : ''
  return options.some((o) => o.slug === v) ? v : ''
})

const concern = pick('concern', FILTERS.concerns)
const treatment = pick('treatment', FILTERS.treatments)

/** 兩個條件是**交集**（既屬這個困擾、又是這個療程分類）。切換其中一個時保留另一個。 */
const CASE_LIST = computed(() => ALL_CASES.filter((c) =>
  (!concern.value || c.concerns.some((x) => x.slug === concern.value))
  && (!treatment.value || c.category?.slug === treatment.value),
))

/** 切換其中一個條件、保留另一個的網址。傳 '' 代表取消該條件。 */
function hrefWith(patch: { concern?: string, treatment?: string }) {
  const next = { concern: concern.value, treatment: treatment.value, ...patch }
  const qs = new URLSearchParams()
  if (next.concern) qs.set('concern', next.concern)
  if (next.treatment) qs.set('treatment', next.treatment)
  const q = qs.toString()
  return q ? `/cases/?${q}` : '/cases/'
}

usePageHead({
  title: '案例分享',
  description:
    '20SKIN 美醫集團案例分享，每則案例標註個案條件、療程次數與時間區間。反應因個人體質與膚況而異，需經醫師面診評估。',
  pageCss: '/assets/pages/14-case-list.css',
  // ⚠️ **篩選只是檢視方式，不是另一個頁面** —— canonical 一律指回 `/cases/`，
  //    帶條件的網址不會被當成獨立頁面收錄。刻意不加 `noIndex`：同時輸出 noindex
  //    與指向別頁的 canonical 是互相衝突的訊號（理由見 team/index.vue）。
  path: '/cases/',
  jsonLd: breadcrumbJsonLd([
    { label: '首頁', href: '/' },
    { label: '案例分享', href: '/cases/' },
  ]),
})
</script>

<template>
  <!-- =====================================================================
       麵包屑
       ===================================================================== -->
  <nav class="c-breadcrumb" aria-label="麵包屑">
    <div class="container">
      <ol class="c-breadcrumb__list">
        <li><a href="/">首頁</a></li>
        <li><span class="c-breadcrumb__current" aria-current="page">案例分享</span></li>
      </ol>
    </div>
  </nav>

  <!-- =====================================================================
       1. Hero ＋ 個別差異聲明（左文右圖，圖為非療效意象圖）
       ===================================================================== -->
  <section class="cases-hero">
    <div class="container cases-hero__layout">
      <div class="cases-hero__copy">
        <span class="u-eyebrow">CASES</span>
        <h1 class="cases-hero__title">案例分享</h1>
        <p class="cases-hero__lede">每則案例標註個案條件、次數與時間區間——不只是一組對照圖。</p>

        <p class="c-note c-note--warn cases-hero__note">
          <span class="c-note__icon" aria-hidden="true">&#9888;</span>
          案例為個別紀錄，反應因個人體質、膚況與生活習慣而異，不代表所有人都會有相同結果，亦非療程效果之保證。是否適合進行療程，需由醫師面診評估後決定。
        </p>
      </div>
      <div class="cases-hero__media">
        <img src="/assets/img/stock-stones.jpg" alt="黑白疊石，水墨感意象" width="1800" height="1199">
      </div>
    </div>
  </section>

  <!-- =====================================================================
       2. 篩選列
       ===================================================================== -->
  <section v-if="FILTERS.concerns.length || FILTERS.treatments.length" class="cases-filters">
    <div class="container cases-filters__row">
      <nav v-if="FILTERS.concerns.length" class="c-tabs" aria-label="依困擾篩選">
        <div class="c-tabs__list">
          <a
            class="c-tabs__btn"
            :href="hrefWith({ concern: '' })"
            :aria-selected="!concern"
          >全部案例</a>
          <a
            v-for="tab in FILTERS.concerns"
            :key="tab.slug"
            class="c-tabs__btn"
            :href="hrefWith({ concern: tab.slug })"
            :aria-selected="concern === tab.slug"
          >{{ tab.label }}</a>
        </div>
      </nav>

      <div v-if="FILTERS.treatments.length" class="cases-filters__by" role="group" aria-label="依療程篩選">
        <span class="cases-filters__label">依療程：</span>
        <a class="c-tag" :class="{ 'is-active': !treatment }" :href="hrefWith({ treatment: '' })">全部</a>
        <a
          v-for="tag in FILTERS.treatments"
          :key="tag.slug"
          class="c-tag"
          :class="{ 'is-active': treatment === tag.slug }"
          :href="hrefWith({ treatment: tag.slug })"
        >{{ tag.label }}</a>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       3. 案例格
       ===================================================================== -->
  <section class="section section--tight" id="cases">
    <div class="container">
      <!-- ⚠️ 兩個條件是交集，交出空集合是做得到的（例：某個困擾沒有那個分類的案例）。
           空的格線看起來像壞掉，所以照 blog 列表的做法在下面給一句話。
           ⚠️ 註解夾在 v-if 與 v-else 之間會讓兩者接不起來，所以寫在這裡。 -->
      <div v-if="CASE_LIST.length" class="grid grid--3">
        <article v-for="item in CASE_LIST" :key="item.title" class="c-card">
          <div class="cases-card__ba">
            <div class="cases-card__pane">
              <span class="cases-card__badge">BEFORE</span>
            </div>
            <div class="cases-card__pane">
              <span class="cases-card__badge">AFTER</span>
            </div>
          </div>
          <div class="cases-card__body">
            <h3 class="cases-card__title">
              <a :href="item.slug ? `/cases/${item.slug}/` : '#'">{{ item.title }}</a>
            </h3>
            <div class="cases-card__facts">
              <span>{{ item.ageGender }}</span>
              <span>{{ item.sessions }}</span>
            </div>
            <div class="cases-card__tags">
              <span v-for="tag in item.tags" :key="tag" class="c-tag">{{ tag }}</span>
            </div>
          </div>
        </article>
      </div>
      <p v-else>目前沒有符合這個條件的案例。</p>

      <!-- ⚠️ mockup 的分頁列（1／2／3，全部連 `#`）2026-09-18 移除：案例沒有分頁，
           這一頁一次就把全部案例算繪出來。留著等於再一組「按了不會有事」的控制項，
           而且它會對訪客謊報「還有第 2、3 頁」。⚠️ 之後真的要分頁，做法比照
           `/blog/page/{n}/`（各頁 self-canonical、可被索引），不是把這段貼回來。 -->
    </div>
  </section>

  <!-- =====================================================================
       4. 怎麼看案例
       ===================================================================== -->
  <section class="section section--alt" id="how-to-read">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">HOW TO READ</span>
          <h2>看案例時，三件事比對照圖重要</h2>
          <p>照片只呈現結果，真正能拿來對照自己狀況的是條件與過程。</p>
        </div>
      </div>

      <div class="grid grid--3">
        <article v-for="item in CASE_HOW_TO_READ" :key="item.title" class="cases-how">
          <h3>{{ item.title }}</h3>
          <p>{{ item.text }}</p>
        </article>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       4b. 看完案例，然後呢（左圖右文，收尾意象圖）
       ===================================================================== -->
  <section class="section cases-band">
    <div class="container cases-band__layout">
      <div class="cases-band__media">
        <img src="/assets/img/stock-camellia.jpg" alt="白山茶，季節與細節意象" width="1800" height="1199" loading="lazy">
      </div>
      <div class="cases-band__copy">
        <div class="c-sechead">
          <div class="c-sechead__text">
            <span class="u-eyebrow">BEFORE YOU DECIDE</span>
            <h2>看完案例，然後呢？</h2>
          </div>
        </div>
        <p>案例是別人的起點與過程，你的規劃仍需要醫師依實際膚況面診後才能決定。</p>
      </div>
    </div>
  </section>

  <!-- =====================================================================
       5. 頁尾 CTA 區
       ===================================================================== -->
  <section class="section cases-cta">
    <div class="container cases-cta__box">
      <div class="cases-cta__text">
        <span class="u-eyebrow">BOOK A CONSULTATION</span>
        <h2>想知道自己的狀況能做到哪裡？</h2>
        <p>案例是別人的起點與結果，你的規劃需要醫師依實際膚況評估後才能給。</p>
      </div>
      <div class="cases-cta__actions">
        <a class="btn btn--primary ext" href="https://booking.20skin.tw/MainMs/Login" target="_blank" rel="noopener external">立即預約</a>
        <a class="btn btn--line" href="/concerns/">先看肌膚困擾</a>
      </div>
    </div>
  </section>
</template>
