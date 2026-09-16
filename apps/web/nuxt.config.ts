// 20SKIN 前端 —— Nuxt 3 執行期 SSR（docs/07-deployment.md §1、docs/09-frontend.md §1）
//
// 兩種產物、一份程式碼：
//   · 前台  執行期 SSR       → 每個請求即時算繪，資料來自 api.20skin.tw
//   · 後台  apps/admin       → 建置產物放在 public/admin/，SWA 當靜態檔送，noindex
//
// ⚠️ 2026-09-15 起改為**執行期 SSR**（Tim 定案，翻掉原決策 6）。
//    原本「不要改成 SSR」的理由是「SWA 會把 api_location 指向 .output/server，
//    那個位置要留給 /api/fallback」—— 那個前提在這條路上自己消失了：
//    301 改由 Nuxt 的 server middleware 查 Redirects，`api/` 整支不再存在。

// 資產版號對照表由 scripts/build-asset-version.mjs 在建置前產生。
// ⚠️ 設定檔在 Node 端載入，所以這裡直接讀檔把版號寫死進 <link>；頁面層的樣式
//    與動效腳本走 app/utils/asset.ts 的 stampAsset()，兩邊用的是同一份對照表。
// 🔴 這個 import 讓「沒跑過 build-asset-version」變成**建置當場失敗**，
//    而不是安靜地產出一批沒有版號、被一年 immutable 鎖住的網址。
import ASSET_VERSION from './app/assets-version.json'

export default defineNuxtConfig({
  compatibilityDate: '2026-09-11',
  ssr: true,

  // 使用 app/ 目錄結構（Nuxt 4 的檔案配置，在 Nuxt 3 需明確開啟）。
  // 少了這行，Nuxt 會去找 ./pages、./layouts，app/ 底下的東西一個都不會載入，
  // 而且不會報錯 —— 只會安靜地渲染出 Nuxt 的預設歡迎頁。
  future: { compatibilityVersion: 4 },

  experimental: {
    // 🔴 **非開不可。** 資料層改成執行期取值之後，`loadUnit()` 用 `useNuxtApp()`
    //    存放「單一請求內的去重快取」，而它常常是在 `await` 之後才被呼叫
    //    （例如 `Promise.all([loadUnit(...), getTreatments()])` 裡面那一層）。
    //    少了 asyncContext，那些呼叫會丟 **`[nuxt] instance unavailable`**，
    //    而且不是建置期錯誤 —— 是算繪當下的 500，2026-09-15 實測 16 頁裡有 9 頁掛掉。
    //    ⚠️ 症狀有欺騙性：沒有跨 await 呼叫的頁面（/faq/、/about/）照常 200，
    //    看起來像「某幾頁的資料有問題」，其實是 context 傳遞問題。
    asyncContext: true,
  },

  // 樣式一律來自 public/assets（mockup 的逐 byte 複製，見 scripts/sync-mockup.mjs）。
  // ⚠️ 不要把 CSS 搬進 app/assets 交給 Vite 打包 —— 那會改寫 url() 與檔名，
  //    「照抄 mockup」就驗不了了。base.css 全站共用，各頁 CSS 由該頁自己 useHead 掛上。
  app: {
    head: {
      htmlAttrs: { lang: 'zh-Hant' },
      charset: 'utf-8',
      viewport: 'width=device-width, initial-scale=1',
      link: [{ rel: 'stylesheet', href: `/assets/base.css?v=${ASSET_VERSION['/assets/base.css'] ?? ''}` }],
    },
  },

  // 後台不在這個專案裡 —— 它是 apps/admin（Vite SPA），建置產物直接寫進
  // 本專案的 public/admin/，隨建置一起打包（docs/09-frontend.md §1）。
  // ⚠️ 建置有順序相依：先 admin 後 web。

  // 🔴 **執行期每個請求都會打 API。** 這是 SSR 化的重點：療程、文章、醫師
  //    這些資料不再於建置期烤進 HTML，而是算繪當下去拿，所以院方按下發布，
  //    下一個請求就看得到。
  // ⚠️ 第 2 段（資料層）完成前，`app/data/*.ts` 仍然吃建置期內聯的
  //    `content/*.json` —— 也就是說**這條分支現在還沒有「即時」這個性質**。
  //
  // ⚠️ 這是 `public`，會被寫進產物，**不要放任何密鑰**。它只是一個公開網址。
  // ⚠️ 後台與 API 不同網域（20skin.tw ↔ api.20skin.tw），所以一定是絕對網址；
  //    寫成相對路徑會打到 SWA 自己的 /api，那裡只有 fallback 一支（CLAUDE.md 決策 7）。
  runtimeConfig: {
    public: {
      apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL || 'https://api.20skin.tw/api/v1',

      // reCAPTCHA v3 的 site key（docs/10 §5）。
      // ⚠️ site key 是**公開值**，本來就會出現在 HTML 裡 —— 要保密的是 secret key，
      //    那個只在 Function App 的 app settings（BotCheck__SecretKey）。
      // ⚠️ 留空＝這個環境不啟用驗證。後端沒設 secret key 時也會放行，兩邊要一起設。
      recaptchaSiteKey: process.env.NUXT_PUBLIC_RECAPTCHA_SITE_KEY || '',
    },
  },

  nitro: {
    // SWA 的 managed function（Node）。工作流是手寫的，不靠 SWA 自動偵測，
    // 所以這裡明講，免得本機與 CI 產出的形狀不一樣。
    preset: 'azure-swa',

    // ⚠️ **不預渲染任何一頁。** 全站即時算繪是這次改版的目的本身
    //    —— 院方按下發布，下一次請求就看得到，不經過任何建置。
    // ⚠️ **也不做快取**（Tim 定案 2026-09-15）。代價是每個請求都會打 API，
    //    包含爬蟲；SWA 沒有快取清除 API，加了 TTL 就不是「即時」了。

    // ── staticwebapp.config.json 由 preset 產生，來源是這裡 ─────────────
    //
    // 🔴 **設定檔不再放在 `public/`。** preset 每次建置都會把這份 config 寫成
    //    `apps/web/staticwebapp.config.json`（注意：是專案根目錄，**不是**
    //    `.output/public/`）。留一份在 `public/` 會變成兩個來源、兩份內容，
    //    而 SWA 只讀其中一份 —— 到底讀哪一份要看工作流怎麼設，不值得賭。
    //    那個檔案是**建置產物**，已加進 .gitignore。
    //
    // ⚠️ preset 會把下面的 `routes` 合併進它自己產生的那幾條
    //    （`/200`、`/404`、`/index.html` → `/`、`/` → `/api/server`），
    //    同名的以我們這份為準（見 nitropack/presets/azure/utils.mjs）。
    azure: {
      config: {
        trailingSlash: 'auto',

        platform: {
          // 🔴 **一定要明寫。** preset 的預設值是 `node:18`，而 SWA 對
          //    Node 18 的支援 **2025-05-31 就結束了**；它的原始碼只認得
          //    16／18／20 三個版本（`supportedNodeVersions`），寫在
          //    package.json 的 `engines: 22` 它也會忽略、退回 18。
          //    這裡直接覆蓋掉整個 platform 區塊才擋得住。
          apiRuntime: 'node:22',
        },

        // 全站即時算繪：靜態檔以外的一切都交給 Nuxt 的 SSR function。
        // ⚠️ `/api/server` 這個路徑不是打錯 —— preset 產生的 function 綁的是
        //    `{*url}` catch-all，所以 `/api/` 底下任何路徑都會進到 Nuxt 的
        //    handler，它再從 `x-ms-original-url` 取回原始網址來算繪。
        navigationFallback: {
          rewrite: '/api/server',
          exclude: [
            '/api/*',
            '/assets/*',
            '/admin/*',
            // ⚠️ 副檔名清單擋掉的是「找不到的靜態檔」—— 少了它，一張不存在的
            //    圖片會回傳一整頁 HTML 而不是 404。
            // 🔴 **`xml`／`txt`／`json` 刻意不在清單裡。** sitemap、robots.txt、
            //    llms.txt、faq.json 是 Nuxt 的 server route（`server/routes/`），
            //    它們必須進得了 SSR function —— 列進排除清單就等於「這些路徑只能是
            //    靜態檔」，而靜態檔正是這次改版要拿掉的東西。
            //    ⚠️ 代價：一個不存在的 `.json` 會由 SSR 回 404（而不是 SWA 直接回），
            //    多一次 function 呼叫。可接受 —— 那種請求本來就不該存在。
            '*.{js,css,map,png,jpg,jpeg,gif,svg,ico,webp,avif,woff,woff2,ttf,pdf}',
          ],
        },

        globalHeaders: {
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
        },

        routes: [
          { route: '/admin/static/*', headers: { 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Robots-Tag': 'noindex, nofollow' } },
          { route: '/admin/*', rewrite: '/admin/index.html', headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } },

          // ── /assets 的快取：**只有加得到版號的才配 immutable** ──────────
          //
          // 🔴 一年 immutable 的前提是網址會隨內容改變。`stampAsset()` 只加得到
          //    「由程式組出來的」那幾個網址（base.css、app.js、各頁 CSS）——
          //    模板裡寫死的 `<img src="/assets/img/...">` 有 113 處、76 個檔案，
          //    那些**加不到**。給它們 immutable 就是把 abf0bac 修掉的 bug
          //    換個地方再犯一次：換了圖，回訪的人一年之內看不到。
          //
          // ⚠️ 不要為了湊 immutable 去改那 113 處標記。前台的標記是照抄 mockup 的
          //    （CLAUDE.md 決策 11），把 `src="..."` 全改成 `:src="stampAsset(...)"`
          //    會讓它跟 mockup 對不起來，而圖片過期的代價只是視覺，遠小於樣式過期。
          { route: '/assets/base.css', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } },
          { route: '/assets/app.js', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } },
          { route: '/assets/pages/*', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } },

          // 字型：被 base.css 以固定路徑參照，stampAsset() 加不到 CSS 內部的網址。
          // 重跑字型子集（改了 mockup 文案就要跑）之後若還是 immutable，回訪的讀者會缺字。
          { route: '/assets/fonts/*', headers: { 'Cache-Control': 'public, max-age=604800' } },
          // 其餘（img/、logo.jpg）：沒有版號，走一週 TTL 靠 304 重新驗證，成本極低。
          { route: '/assets/*', headers: { 'Cache-Control': 'public, max-age=604800' } },

          { route: '/sitemap.xml', headers: { 'Cache-Control': 'public, max-age=3600' } },
          { route: '/llms.txt', headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } },

          // 舊站的七條固定頁 301。⚠️ 與資料庫的 Redirects 表**刻意重複**：
          // 這七條走設定檔不進 function，是最常被打到的那幾條的快速路徑。
          { route: '/index2.php', redirect: '/', statusCode: 301 },
          { route: '/doctor.php', redirect: '/team/', statusCode: 301 },
          { route: '/contact.php', redirect: '/clinics/', statusCode: 301 },
          { route: '/product01.php', redirect: '/treatments/', statusCode: 301 },
          { route: '/product02.php', redirect: '/treatments/microneedle/', statusCode: 301 },
          { route: '/product03.php', redirect: '/treatments/photoelectric/', statusCode: 301 },
          { route: '/product04.php', redirect: '/treatments/skincare/', statusCode: 301 },
        ],

        mimeTypes: { '.webmanifest': 'application/manifest+json' },
      },
    },
  },

  // mockup 的 app.js 是客戶指定保留的動效系統（CLAUDE.md 決策 11），
  // 原樣以 <script defer> 載入，不移植成 Vue 行為。
  typescript: { strict: true },

  devtools: { enabled: false },
})
