// 20SKIN 前端 —— Nuxt 3 純靜態（docs/07-deployment.md §1、docs/09-frontend.md §1）
//
// 兩種產物、一份程式碼：
//   · 前台  prerender: true  → 建置期產生實體 HTML，執行期不打 API
//   · 後台  ssr: false       → /admin/** 純前端 SPA，noindex
//
// ⚠️ 不要改成 SSR 模式。SWA 會把 Nuxt 3 SSR 的 api_location 指向 .output/server，
//    那個位置要留給 /api/fallback 這支 Managed Function，兩者互斥（docs/07 §1）。
export default defineNuxtConfig({
  compatibilityDate: '2026-09-11',
  ssr: true,

  // 使用 app/ 目錄結構（Nuxt 4 的檔案配置，在 Nuxt 3 需明確開啟）。
  // 少了這行，Nuxt 會去找 ./pages、./layouts，app/ 底下的東西一個都不會載入，
  // 而且不會報錯 —— 只會安靜地渲染出 Nuxt 的預設歡迎頁。
  future: { compatibilityVersion: 4 },

  // 樣式一律來自 public/assets（mockup 的逐 byte 複製，見 scripts/sync-mockup.mjs）。
  // ⚠️ 不要把 CSS 搬進 app/assets 交給 Vite 打包 —— 那會改寫 url() 與檔名，
  //    「照抄 mockup」就驗不了了。base.css 全站共用，各頁 CSS 由該頁自己 useHead 掛上。
  app: {
    head: {
      htmlAttrs: { lang: 'zh-Hant' },
      charset: 'utf-8',
      viewport: 'width=device-width, initial-scale=1',
      link: [{ rel: 'stylesheet', href: '/assets/base.css' }],
    },
  },

  // 後台不在這個專案裡 —— 它是 apps/admin（Vite SPA），建置產物直接寫進
  // 本專案的 public/admin/，隨 nuxt generate 一起打包（docs/09-frontend.md §1）。
  // ⚠️ 建置有順序相依：先 admin 後 web。

  // 前台是建置期預渲染的靜態站，**執行期只打四支 API**（docs/09 §4、docs/10 §3.1）：
  // /health、POST /contact、POST /questions/miss、GET /site-settings/public。
  // 療程、文章、醫師這些資料不經由 API —— 建置期就烤進 HTML 了。
  //
  // ⚠️ 這是 `public`，會被寫進產物，**不要放任何密鑰**。它只是一個公開網址。
  // ⚠️ 後台與 API 不同網域（20skin.tw ↔ api.20skin.tw），所以一定是絕對網址；
  //    寫成相對路徑會打到 SWA 自己的 /api，那裡只有 fallback 一支（CLAUDE.md 決策 7）。
  runtimeConfig: {
    public: {
      apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL || 'https://api.20skin.tw/api/v1',
    },
  },

  nitro: {
    prerender: {
      crawlLinks: true,
      routes: ['/', '/404'],
      // 沒有 staging、沒有 PR 預覽，`main` 合併即上線（docs/07-deployment.md §5）——
      // build 是唯一的攔截點，所以渲染失敗必須讓 build 當場失敗。
      // 設 false 的代價實測過：一頁 500 之後 build 照樣顯示成功，
      // 那一頁靜靜地從產物裡消失，只有連結檢查才抓得到。
      failOnError: true,
    },
  },

  // mockup 的 app.js 是客戶指定保留的動效系統（CLAUDE.md 決策 11），
  // 原樣以 <script defer> 載入，不移植成 Vue 行為。
  typescript: { strict: true },

  devtools: { enabled: false },
})
