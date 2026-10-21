import type { NuxtError } from '#app'

/**
 * 動態路由「查不到這筆內容」時用這一支，不要直接 `throw createError(404)`：
 *   `if (!item) throw await notFoundUnlessRedirected({ statusMessage: '…' })`
 * 先查轉址表，有規則就送 301；回傳的是要丟的 404 錯誤，由呼叫端 `throw`
 * （`throw` 才會讓 TypeScript 收窄型別，`await` 一個 `Promise<never>` 不會）。
 *
 * 🔴 **改了網址代稱的舊網址只有這裡接得住。** 後台改 slug 時 API 會自動補一筆 301
 *    （`ContentHandler.UpdateAsync`），但 `/faq/{x}/`、`/blog/{x}/` 這類網址會先被
 *    對應的動態路由接走，永遠輪不到 `[...slug].vue` 去查轉址 —— 2026-10-21 把 FAQ 分類
 *    `untitled-1792027590012` 改成 `disease` 時發現：規則在、API 也解得出來，舊網址卻是 404。
 * ⚠️ 只在「查不到」這條路上多一次 API 往返，正常瀏覽不受影響（理由同 `[...slug].vue` 檔頭）。
 * ⚠️ 轉址送出之後仍然要丟：頁面後面的程式會去讀那筆不存在的內容。
 */
export async function notFoundUnlessRedirected(error: Partial<NuxtError> & { statusMessage: string }): Promise<NuxtError> {
  // ⚠️ 這裡不是 `<script setup>` 本體，`await` 之後 Nuxt 的 context 不會自動還原 ——
  //    先拿住 nuxtApp，轉址時用 runWithContext 包回去。
  const nuxtApp = useNuxtApp()
  const hit = await resolveRedirect(useRoute().fullPath)
  if (hit?.toPath) {
    // ⚠️ `external: true` 的理由見 `[...slug].vue`：要的是 HTTP 301，不是前端換頁。
    await nuxtApp.runWithContext(() =>
      navigateTo(hit.toPath, { redirectCode: hit.statusCode || 301, external: true }))
  }
  return createError({ statusCode: 404, ...error })
}
