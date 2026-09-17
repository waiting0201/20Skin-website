<script setup lang="ts">
// 模板 3 —— 長版故事（mockup/10-story.html）
//
// 兩個網址共用一個模板：/about/new-chinese-aesthetics/、/about/makeup-style/
// （docs/01-sitemap.md §1）。mockup 只把「新中式美學」寫成完整的一篇，
// 「彩妝式輕醫美」目前只有零散的句子（見 ~/data/pages.ts 的註解），
// ⚠️ 2026-09-14 曾把 makeup-style 的顯示名稱改成「新中式美學」，2026-09-17 又把
//    **前台文案**改回「彩妝式輕醫美」（Tim 指定，只有首頁 hero 維持新名）——
//    因為兩頁同名讓文案出現「新中式美學與新中式美學」這種句子。
//    🔴 種子與遷移 10 仍帶新名，資料庫那一半還沒動，見 STATUS §七。
// 所以這一頁的部分區塊（目錄／常見疑問／相關療程）用 v-if 依資料是否存在顯示，
// 不是所有故事頁都會長得一樣豐富。
import { getStoryPages } from '~/data/pages'

const STORY_PAGES = await getStoryPages()

const route = useRoute()
const slug = route.params.slug as string
const story = STORY_PAGES[slug]

if (!story) {
  throw createError({ statusCode: 404, statusMessage: '找不到這篇品牌故事' })
}

// ⚠️ 原本這裡有 `definePageMeta({ validate })` —— 理由同 faq/[category].vue：
//    編譯期巨集引用不到執行期取回的 STORY_PAGES。驗證改在下方以 404 表達。

usePageHead({
  // 後台 SEO 區塊的覆寫。⚠️ 讀的是已核准的版本快照，改完要重新發布才會生效。
  seo: story.seo,
  title: story.title,
  description: story.lede,
  pageCss: '/assets/pages/10-story.css',
  path: `/about/${story.slug}/`,
  jsonLd: breadcrumbJsonLd([
    { label: '首頁', href: '/' },
    { label: '品牌理念', href: '/about/' },
    { label: story.title, href: `/about/${story.slug}/` },
  ]),
})
</script>

<template>
  <!-- 麵包屑 -->
  <nav class="c-breadcrumb" aria-label="麵包屑">
    <div class="container">
      <ol class="c-breadcrumb__list">
        <li><a href="/">首頁</a></li>
        <li><a href="/about/">品牌理念</a></li>
        <li><span class="c-breadcrumb__current" aria-current="page">{{ story.title }}</span></li>
      </ol>
    </div>
  </nav>

  <!-- 1. 頁首 Hero -->
  <header class="story-hero">
    <div class="container story-hero__layout">
      <div class="story-hero__copy">
        <span class="u-eyebrow">{{ story.eyebrow }}</span>
        <h1>{{ story.title }}</h1>
        <p class="story-hero__lede">{{ story.lede }}</p>
        <div class="story-hero__meta">
          <span v-for="m in story.meta" :key="m">{{ m }}</span>
        </div>
      </div>

      <div class="story-hero__media">
        <div class="story-hero__frame">
          <img :src="story.heroImage.src" :alt="story.heroImage.alt" :width="story.heroImage.w" :height="story.heroImage.h">
        </div>
        <p class="story-hero__caption">{{ story.heroCaption }}</p>
      </div>
    </div>
  </header>

  <!-- 2. 目錄 -->
  <nav v-if="story.toc.length" class="story-toc" aria-label="本文目錄">
    <div class="container story-toc__inner">
      <span class="story-toc__label">本文目錄</span>
      <ul class="story-toc__list">
        <li v-for="item in story.toc" :key="item.id"><a :href="`#${item.id}`">{{ item.label }}</a></li>
      </ul>
    </div>
  </nav>

  <!-- 內容區塊：目前只有「新中式美學」有完整的原文，用條件判斷 slug 而非硬編每一段。 -->
  <template v-if="story.slug === 'new-chinese-aesthetics'">
    <!-- 3. 這個主張是怎麼來的 -->
    <section class="section" id="origin">
      <div class="container story-origin__layout">
        <figure class="story-origin__media">
          <img src="/assets/img/doctor-anqiao.jpg" alt="安喬（許媖琄），20SKIN 美醫集團執行長・藝術總監" width="700" height="921" loading="lazy">
        </figure>

        <div class="story-origin__body">
          <div class="c-sechead">
            <div class="c-sechead__text">
              <span class="u-eyebrow">WHERE IT STARTED</span>
              <h2>這個主張是怎麼來的</h2>
            </div>
          </div>

          <p class="story-origin__role">安喬（許媖琄）｜執行長・藝術總監・「新中式美學」創始人</p>

          <p class="story-origin__lead">新中式美學不是療程，而是一套判斷標準。她的養成背景在美學與造型，而非醫學；進到門診後最直接的觀察是：討論經常停在單一部位，很少有人先問「這張臉整體想給人什麼印象」。</p>

          <blockquote class="story-pull">
            <p>以古為師，將東方的美學藝術，與「醫美微整形」創新結合。</p>
            <cite>—— 安喬，「新中式美學」創始人</cite>
          </blockquote>

          <a class="btn btn--ghost story-origin__cta" href="/team/">認識醫療團隊</a>
        </div>
      </div>
    </section>

    <!-- 4. 先看比例，再看部位 -->
    <section class="section section--alt" id="proportion">
      <div class="container story-split">
        <div class="story-split__copy">
          <div class="c-sechead">
            <div class="c-sechead__text">
              <span class="u-eyebrow">PROPORTION FIRST</span>
              <h2>先看比例，再看部位</h2>
            </div>
          </div>
          <p>面診時，醫師與美學團隊會先看整張臉的骨架走向、明暗分布與左右差異，再回到當事人最在意的那個部位。順序反過來的話，很容易把資源投在一個其實不影響整體印象的地方。</p>
          <p>常見的判斷面向包含：</p>
          <ul class="story-list">
            <li><strong>縱向比例</strong>：額、中臉、下臉三段的長度關係，決定臉看起來是年輕還是成熟</li>
            <li><strong>橫向寬度</strong>：顴骨、下顎與臉頰的寬度落差，影響臉型的柔和程度</li>
            <li><strong>明暗結構</strong>：光線落在臉上的位置，比單一部位的體積更影響「立體感」</li>
            <li><strong>動態表情</strong>：靜態好看不夠，說話與笑起來的樣子才是別人真正看到的</li>
          </ul>
          <p>這些面向沒有標準答案，也不存在一組適用所有人的數值。實際評估仍需由醫師面診後判斷。</p>
        </div>
        <div class="story-split__media">
          <figure class="story-figure">
            <div class="story-figure__frame">
              <img src="/assets/img/stock-garden-window.jpg" alt="以開窗取景的庭園意象" width="1800" height="1199" loading="lazy">
            </div>
            <figcaption>面診的第一步是看整體關係，而不是急著決定要做哪一台儀器。</figcaption>
          </figure>
        </div>
      </div>
    </section>

    <!-- 5. 留白：知道哪裡不要動 -->
    <section class="section" id="restraint">
      <div class="container story-split">
        <div class="story-split__media">
          <figure class="story-figure">
            <div class="story-figure__frame">
              <img src="/assets/img/stock-bamboo-corridor.jpg" alt="木格柵長廊與竹，光影間隔的留白意象" width="1800" height="1199" loading="lazy">
            </div>
            <figcaption>留白不是空無一物，而是刻意保留的呼吸空間。</figcaption>
          </figure>
        </div>
        <div class="story-split__copy">
          <div class="c-sechead">
            <div class="c-sechead__text">
              <span class="u-eyebrow">THE ART OF RESTRAINT</span>
              <h2>留白：知道哪裡不要動</h2>
            </div>
          </div>
          <p>中式繪畫裡，空白不是「還沒畫完」，而是構圖的一部分。放到臉上，意思是：有些不對稱、有些紋路、有些個人特徵，本身就是這張臉辨識度的來源，動掉之後五官會變得標準，但也變得沒有記憶點。</p>
          <p>因此規劃療程時，我們會明確地把「不建議處理」的項目也講出來，並說明理由。同樣地，需要分次進行的療程不會壓縮到一次做完——皮膚有它自己的修復節奏，急不得。</p>
          <div class="c-note">
            <span class="c-note__icon" aria-hidden="true">&#9432;</span>
            <p>本文說明的是美學判斷的思考方式，不涉及療程效果的保證。任何療程的適用性、次數與間隔，均需由醫師依個人膚況、病史與需求面診評估後決定。</p>
          </div>
        </div>
      </div>
    </section>

    <!-- 6. 在門診裡怎麼執行 -->
    <section class="section section--alt" id="practice">
      <div class="container story-split">
        <div class="story-split__copy">
          <div class="c-sechead">
            <div class="c-sechead__text">
              <span class="u-eyebrow">IN PRACTICE</span>
              <h2>在門診裡怎麼執行</h2>
            </div>
          </div>
          <p>理念要能被執行，才不只是一句標語。實務上分成四個步驟：</p>
          <ul class="story-list">
            <li><strong>一、了解需求</strong>：先聽當事人的描述與生活型態，包含工作性質、可接受的恢復期與預算範圍</li>
            <li><strong>二、醫師評估</strong>：由醫師檢視膚況、病史與用藥情形，確認哪些項目在醫療上適合、哪些需要暫緩</li>
            <li><strong>三、整體規劃</strong>：把可行的項目排出優先順序與時間軸，說明每一次要處理什麼、預期的恢復期</li>
            <li><strong>四、逐次調整</strong>：每次回診依實際反應調整後續規劃，而不是照著第一次的計畫走完</li>
          </ul>
          <p>過程中，美學建議與醫療判斷是兩件事：美學團隊提供比例與整體感的意見，最終是否施作、如何施作，一律由醫師決定。</p>
        </div>
        <div class="story-split__media">
          <figure class="story-figure">
            <div class="story-figure__frame">
              <img src="/assets/img/stock-corridor.jpg" alt="明亮候診空間，等候看診情境示意" width="1237" height="1800" loading="lazy">
            </div>
            <figcaption>從評估到施作，每一步都在同一套流程裡進行。</figcaption>
          </figure>
        </div>
      </div>
    </section>
  </template>

  <!-- 常見疑問（有資料才顯示） -->
  <section v-if="story.faqs.length" class="section" id="faq">
    <div class="container container--narrow">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">COMMON QUESTIONS</span>
          <h2>關於這套做法的常見疑問</h2>
        </div>
      </div>

      <div class="c-faq">
        <details v-for="item in story.faqs" :key="item.q" class="c-faq__item">
          <summary class="c-faq__q">{{ item.q }}</summary>
          <div class="c-faq__a">
            <p>{{ item.a }}</p>
          </div>
        </details>
      </div>

      <div class="c-note c-note--warn">
        <span class="c-note__icon" aria-hidden="true">&#9888;</span>
        <p>本文為理念說明，內容不構成醫療建議，也無法取代醫師的診斷。個別狀況差異大，是否適合進行任何療程，請於門診由醫師親自評估。</p>
      </div>
    </div>
  </section>

  <!-- 姊妹篇 -->
  <div v-if="story.sisterSlug" class="story-sister">
    <div class="container story-sister__inner">
      <span class="story-sister__label">同系列文章</span>
      <h2 class="story-sister__title"><a :href="`/about/${story.sisterSlug}/`">{{ story.sisterLabel }} →</a></h2>
    </div>
  </div>

  <!-- 相關療程（有資料才顯示） -->
  <section v-if="story.treatments.length" class="section section--alt" id="treatments">
    <div class="container">
      <div class="c-sechead">
        <div class="c-sechead__text">
          <span class="u-eyebrow">RELATED TREATMENTS</span>
          <h2>依這套思路規劃的療程</h2>
          <p>以下為門診中較常一併討論的項目，實際適用性需經醫師面診評估。</p>
        </div>
        <a class="c-sechead__more" href="/treatments/">查看全部療程 →</a>
      </div>

      <div class="grid grid--3">
        <article v-for="item in story.treatments" :key="item.title" class="c-card c-card--treatment">
          <div class="c-card__media">
            <img :src="item.image.src" :alt="item.image.alt" :width="item.image.w" :height="item.image.h" loading="lazy">
          </div>
          <div class="c-card__body">
            <h3 class="c-card__title"><a :href="item.href">{{ item.title }}</a></h3>
            <p class="c-card__excerpt">{{ item.excerpt }}</p>
          </div>
        </article>
      </div>
    </div>
  </section>

  <!-- 頁尾 CTA -->
  <section class="section story-cta">
    <div class="container story-cta__box">
      <div class="story-cta__text">
        <span class="u-eyebrow">BOOK A CONSULTATION</span>
        <h2>想知道這套判斷放在自己臉上是什麼樣子？</h2>
        <p>歡迎預約門診，由醫師與美學團隊一起看過之後，再談需不需要做、要做什麼。</p>
      </div>
      <div class="story-cta__actions">
        <a class="btn btn--primary ext" href="https://booking.20skin.tw/MainMs/Login" target="_blank" rel="noopener external">立即預約</a>
        <a class="btn btn--line" href="/team/">認識醫療團隊</a>
      </div>
    </div>
  </section>
</template>
