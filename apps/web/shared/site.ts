// 前台與 server route 共用的站台常數（Nuxt 的 shared/ 目錄：app 與 server 都 import 得到）。

/**
 * 正式網域。canonical、JSON-LD、robots.txt 的 `Sitemap:` 行、sitemap／llms 裡的網址都用它。
 *
 * 🔴 **不要改成從請求的 Host 推導。** 前台跑在 SWA 後面，SSR function 收到的
 *    `x-forwarded-host` 是 SWA 內部的 `*.azurewebsites.net` 主機名 —— 2026-10-19 正式站的
 *    sitemap 因此整份指向 `https://463a609b-….azurewebsites.net/…`，與 canonical（這個值）不符，
 *    Search Console 會整份忽略。不論請求從哪個網域進來（測試網域、切 DNS 前後），
 *    搜尋引擎該收的都是這個網域。
 */
export const SITE_ORIGIN = 'https://20skin.tw'
