// 全站設定（docs/02-backend-cms.md §3）。正式站來自資料表 SiteSettings，
// 建置期一併匯出；緊急關閉的執行期讀取方式見 docs/09-frontend.md §13。

// ── 資料來源：content/site.json（由 SiteSettings 匯出，docs/08 §G-1）─────

import { SITE } from './_content'

export const SITE_SETTINGS = {
  siteName: SITE['site.name'] ?? '',
  description: SITE['site.description'] ?? '',

  /**
   * AI 問答面板的啟用開關（docs/04-ai-faq.md §4）。
   *
   * ⚠️ 正式環境的種子值是 **false**（docs/08 §J-4 步驟 7）——
   * Phase 1 只交付介面，AI 未串接前不對外顯示。這個值現在由資料庫決定，
   * 院方在後台按一下就能開關，不必改程式重新部署。
   */
  aiFaqEnabled: SITE['aifaq.enabled'] === 'true',

  /**
   * 面板文案與轉真人出口。
   *
   * ⚠️ 這幾個值在執行期會被 `GET /site-settings/public` 覆蓋
   * （見 `~/composables/usePublicSiteSettings`）—— 這裡的值是**預渲染時的初始值**，
   * 存在的理由是讓 hydration 之前畫面上就有正確的文字，不是唯一來源。
   */
  aiFaqPanelTitle: SITE['aifaq.panelTitle'] ?? 'AI 線上諮詢',
  aiFaqWelcomeText: SITE['aifaq.welcomeText'] ?? '',
  aiFaqHandoffBookingUrl: SITE['aifaq.handoffBookingUrl'] ?? '',
  aiFaqHandoffLineUrl: SITE['aifaq.handoffLineUrl'] ?? '',
}
