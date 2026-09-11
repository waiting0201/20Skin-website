// 全站設定（docs/02-backend-cms.md §3）。正式站來自資料表 SiteSettings，
// 建置期一併匯出；緊急關閉的執行期讀取方式見 docs/09-frontend.md §13。

export const SITE_SETTINGS = {
  siteName: '20SKIN 美醫集團',
  description:
    '20SKIN 美醫集團——四季診所與二林四季皮膚科，以新中式美學為理念的皮膚科專科醫療團隊。',

  /**
   * AI 問答面板的啟用開關（docs/04-ai-faq.md §4）。
   *
   * ⚠️ 正式環境的種子值是 **false**（docs/08-database.md §J-4 步驟 7）——
   * Phase 1 只交付介面，AI 未串接前不對外顯示，「一顆點下去沒反應的常駐按鈕
   * 比沒有按鈕更糟」。這裡設 true 是為了讓切版階段看得到、驗得到這個元件。
   * 接上 CMS 時這個值由資料庫決定，不要把 true 當成預設。
   */
  aiFaqEnabled: true,
} as const
