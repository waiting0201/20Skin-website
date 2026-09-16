// SEO 產物的代理層。
//
// 🔴 **格式不在這裡產生。** sitemap／robots／llms 的內容全部由 API 的 `/seo/*` 吐出來，
//    那一端用的是 `functions/Common/ExportFormats.cs` —— API 與建置期匯出工具
//    以 `<Compile Include>` 共用的**同一份原始碼**。
//    在前端重寫一次 XML 產生器就是第二份，而這個專案已經因為「同一段邏輯有兩份」
//    踩過（`Visibility.PublicFilter`，症狀是「列表看得到、點進去 404」，docs/11 §6.4）。
//
// ⚠️ **同源代理，不是轉址到 api 網域。** 爬蟲拿到的 sitemap 必須與網站同一個 origin，
//    否則 Search Console 會判定「sitemap 的位置與它收錄的網址不符」而整份忽略。
//
// ⚠️ `origin` 由這一層帶過去 —— 只有它知道這個請求打到的是正式站、測試站還是
//    SWA 預覽環境，三個是不同的主機名。
//    🔴 這正是 2026-09-16 那個 bug 的教訓：`postbuild.mjs` 把主機名寫死成
//    `https://20skin.tw`，而 CI 用的是 `20skin.4webdemo.com`，結果整份 sitemap 被清空。
//    主機名一律從請求推導，不要寫死。

import type { H3Event } from 'h3'

/** 這個請求是打到哪個網域的。反向代理（SWA）下要看 `x-forwarded-*`。 */
function requestOrigin(event: H3Event): string {
  const headers = getRequestHeaders(event)
  const host = headers['x-forwarded-host'] ?? headers.host ?? '20skin.tw'
  const proto = headers['x-forwarded-proto'] ?? 'https'
  return `${proto}://${host}`
}

/**
 * 代理一支 `/seo/*`。
 *
 * ⚠️ **拿不到就回 5xx，不要回空檔案。** 一個空的 sitemap 或空的 robots.txt
 *    對爬蟲的意義，跟「暫時取不到」完全不同：前者是「這個站沒有任何網址／規則」，
 *    而它會被當真。寧可讓爬蟲看到 5xx 稍後再來。
 *
 * ⚠️ 404 要照實傳遞 —— `seo.robotsTxt` 被清空時 API 回 404，那是刻意的：
 *    「沒有這個檔案」與「有一個空檔案」對爬蟲不是同一件事。
 */
export async function proxySeo(event: H3Event, path: string, contentType: string) {
  const base = useRuntimeConfig().public.apiBaseUrl

  try {
    const body = await $fetch<string>(`${base}/seo/${path}`, {
      query: { origin: requestOrigin(event) },
      responseType: 'text',
      timeout: 8000,
      retry: 1,
    })

    setHeader(event, 'content-type', contentType)
    // 這些產物變動的頻率是「有沒有新內容發布」，可以放久一點。
    setHeader(event, 'cache-control', 'public, max-age=3600')
    return body
  }
  catch (error) {
    const status = (error as { status?: number, statusCode?: number })?.status
      ?? (error as { statusCode?: number })?.statusCode
    throw createError({
      statusCode: status === 404 ? 404 : 503,
      statusMessage: status === 404 ? 'Not Found' : '內容服務暫時無法連線',
    })
  }
}
