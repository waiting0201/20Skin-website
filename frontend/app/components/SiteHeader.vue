<script setup lang="ts">
// Header / 主選單 —— 標記照抄自 mockup（各頁的 <header class="c-header"> 完全相同），
// 只把寫死的 NN-xxx.html 換成 docs/01-sitemap.md 的正式網址，並由 MAIN_NAV 產生。
//
// 行為（漢堡開合、行動版子選單展開）由 mockup 的 assets/app.js 以事件委派處理，
// 不在這裡重寫（CLAUDE.md 決策 11：動效系統是客戶指定保留的部分）。
import { MAIN_NAV, EXTERNAL } from '~/data/navigation'

/** 目前所在的區段，用來標 is-active。傳頂層路徑即可，例如 '/concerns/'。 */
const props = defineProps<{ section?: string }>()

const isActive = (href: string) =>
  !!props.section && (href === props.section || href.startsWith(props.section))
</script>

<template>
  <header class="c-header" id="siteHeader">
    <div class="container">
      <div class="c-header__row">
        <a class="c-logo" href="/" aria-label="20SKIN 美醫集團，回首頁">
          <img class="c-logo__mark" src="/assets/logo.jpg" alt="20SKIN 美醫集團" width="58" height="59">
        </a>

        <nav class="c-nav" id="siteNav" aria-label="主選單">
          <ul class="c-nav__list">
            <li
              v-for="item in MAIN_NAV"
              :key="item.href"
              class="c-nav__item"
              :class="{
                'has-children': !!item.children,
                'is-active': isActive(item.href),
                'c-nav__item--external': item.external,
              }"
            >
              <a
                v-if="item.external"
                class="c-nav__link ext"
                :href="item.href"
                target="_blank"
                rel="noopener external"
              >{{ item.label }}</a>
              <a v-else class="c-nav__link" :href="item.href">
                {{ item.label }}
                <span v-if="item.children" class="c-nav__caret" aria-hidden="true">▾</span>
              </a>

              <ul v-if="item.children" class="c-nav__submenu">
                <li v-for="child in item.children" :key="child.href" class="c-nav__subitem">
                  <a :href="child.href">{{ child.label }}</a>
                </li>
              </ul>
            </li>
          </ul>
        </nav>

        <div class="c-header__cta">
          <a class="btn btn--primary btn--sm ext" :href="EXTERNAL.booking" target="_blank" rel="noopener external">立即預約</a>
          <a class="btn btn--line btn--sm ext" :href="EXTERNAL.shop" target="_blank" rel="noopener external">線上購物</a>
        </div>

        <button
          class="c-hamburger"
          type="button"
          data-nav-toggle
          aria-expanded="false"
          aria-controls="siteNav"
          aria-label="開啟主選單"
        >
          <span class="c-hamburger__box"><span></span><span></span><span></span></span>
        </button>
      </div>

      <div class="c-header__ctabar">
        <a class="ext" :href="EXTERNAL.booking" target="_blank" rel="noopener external">立即預約</a>
      </div>
    </div>
  </header>
</template>
