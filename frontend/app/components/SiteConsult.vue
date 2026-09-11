<script setup lang="ts">
// 浮動諮詢鈕 ＋ AI 諮詢面板 —— 標記照抄自 mockup。
//
// ⚠️ 這是介面示意，未串接 AI（docs/04-ai-faq.md §4：介面與功能分兩階段交付）。
//    開合、Esc 關閉、焦點交還由 mockup 的 app.js 處理；送出後只回一則佔位訊息。
//    是否輸出這段 DOM 由全站設定的啟用開關決定（見 layouts/default.vue）。
import { EXTERNAL } from '~/data/navigation'
</script>

<template>
  <button
    class="c-consult"
    type="button"
    data-consult-toggle
    aria-expanded="false"
    aria-controls="consultPanel"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3c5.52 0 10 3.58 10 8s-4.48 8-10 8c-.86 0-1.7-.09-2.5-.26L4.2 21.3a.5.5 0 0 1-.68-.6l1.1-3.3C3 15.94 2 14.06 2 11c0-4.42 4.48-8 10-8Z"/></svg>
    <span class="c-consult__label">線上諮詢</span>
  </button>

  <aside class="c-chat" id="consultPanel" role="dialog" aria-labelledby="consultTitle" hidden>
    <div class="c-chat__head">
      <div>
        <p class="c-chat__title" id="consultTitle">AI 線上諮詢</p>
        <p class="c-chat__meta">依站內內容即時回覆</p>
      </div>
      <button class="c-chat__close" type="button" data-consult-close aria-label="關閉線上諮詢">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6 18 18M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      </button>
    </div>

    <div class="c-chat__log" data-consult-log role="log" aria-live="polite">
      <p class="c-chat__msg c-chat__msg--bot">你好，我是 20SKIN 的線上諮詢助理。可以用自己的話問我療程、術後照護或看診流程的問題。</p>
      <div class="c-chat__chips">
        <button class="c-chat__chip" type="button" data-consult-ask>做雷射會痛嗎？</button>
        <button class="c-chat__chip" type="button" data-consult-ask>療程後多久可以化妝？</button>
        <button class="c-chat__chip" type="button" data-consult-ask>初診需要準備什麼？</button>
      </div>
    </div>

    <form class="c-chat__form" data-consult-form>
      <label class="visually-hidden" for="consultInput">輸入你的問題</label>
      <input
        class="c-chat__input"
        id="consultInput"
        name="q"
        type="text"
        autocomplete="off"
        placeholder="輸入你的問題⋯"
      >
      <button class="c-chat__send" type="submit" aria-label="送出問題">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 20.5 21.5 12 3 3.5 3 10l11 2-11 2z"/></svg>
      </button>
    </form>

    <p class="c-chat__foot">AI 回覆僅供衛教參考，無法取代醫師診斷。需要個人化建議請<a class="ext" :href="EXTERNAL.booking" target="_blank" rel="noopener external">預約門診</a>。</p>
  </aside>
</template>
