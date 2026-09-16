// 前台用得到的全站設定（`GET /site-settings/public`，docs/10-api.md §3.1）。
//
// 🔴 **2026-09-15：這支的角色整個變了。**
//    靜態時代它是「前台唯一需要在執行期讀設定的地方」—— 療程、文章、醫師全部在
//    建置期烤進 HTML，只有 AI FAQ 的啟用開關不行（docs/08 §J-4：「啟用與停用
//    不需重新部署」）。所以它在 `onMounted` 時用 client 端 fetch 再覆蓋一次。
//
//    改成執行期 SSR 之後，**算繪當下讀到的就是最新值**，那套「先用建置期的值
//    當初始值、hydration 後再覆蓋」的機制沒有存在的理由了 —— 留著只會讓同一份
//    設定被取兩次，而且中間有一瞬間是舊值。
//
// ⚠️ 端點**只回前台需要的那幾個鍵**：收件信箱、追蹤碼等內部設定一律不外露。
//    不要因為「反正都要打一次」就把它擴充成全份設定。
//
// ⚠️ 取不到時回預設值（面板標題有字、開關為關），不讓整頁算繪失敗 ——
//    見 `_content.ts` 的 `loadSite()`。

import { getSiteSettings, type SiteSettings } from '~/data/site-settings'

export type PublicSiteSettings = SiteSettings

export function usePublicSiteSettings(): Promise<PublicSiteSettings> {
  return getSiteSettings()
}
