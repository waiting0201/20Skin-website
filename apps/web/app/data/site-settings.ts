// 全站設定（docs/02-backend-cms.md §3）。來源是資料表 SiteSettings。
//
// 🔴 **2026-09-15 起是執行期取值。** 在那之前這裡讀的是建置期匯出的
//    `content/site.json`，那份含全部 16 個鍵（伺服器端讀資料庫拿得到）。
//    改成即時算繪之後改走 `GET /site-settings/public` —— **只有前台真的要的那幾個鍵**，
//    `contact.recipientEmail` 這種內部設定不會、也不可以出現在公開端點上。

import { loadSite, type PublicSiteSettings } from './_content'

export type SiteSettings = PublicSiteSettings

/**
 * 全站設定。
 *
 * ⚠️ `aiFaqEnabled` 的正式環境種子值是 **false**（docs/08 §J-4 步驟 7）——
 *    Phase 1 只交付介面，AI 未串接前不對外顯示。這個值由資料庫決定，
 *    院方在後台按一下就生效。
 *
 * ⚠️ 執行期取值之後，`~/composables/usePublicSiteSettings` 那層「client 端再覆蓋一次」
 *    已經沒有存在的理由 —— 算繪當下讀到的就是最新值。它仍留著是為了
 *    hydration 之後的一致性，不是唯一來源。
 */
export const getSiteSettings = (): Promise<SiteSettings> => loadSite()
