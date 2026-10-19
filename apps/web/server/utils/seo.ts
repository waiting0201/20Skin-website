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
// 🔴 `origin` 一律是正式網域（shared/site.ts 的 SITE_ORIGIN），與 canonical 同一個值。
//    2026-09-16～10-19 曾改成從請求的 `x-forwarded-host` 推導，結果在 SWA 後面拿到的是
//    內部的 `*.azurewebsites.net`，正式站整份 sitemap 指向那個主機名（Search Console 會忽略）。
//    ⚠️ 當初改成推導的理由（`postbuild.mjs` 寫死主機名、CI 網域不同而把 sitemap 清空）
//    已經不存在 —— postbuild 過濾器隨 SSR 化拿掉了，verify:links 讀 sitemap 時也會把主機名換掉。

import type { H3Event } from 'h3'
import { SITE_ORIGIN } from '#shared/site'

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
      query: { origin: SITE_ORIGIN },
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
