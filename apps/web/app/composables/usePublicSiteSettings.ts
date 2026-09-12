// `GET /site-settings/public`（docs/10-api.md §3.1）。
//
// 🔴 **前台唯一需要在執行期讀設定的地方。** 療程、文章、醫師這些資料全部在建置期
//    烤進 HTML（docs/09 §3），但 AI FAQ 的啟用開關不行 ——
//    docs/08 §J-4 的種子註解寫得很明白：「這個值必須是資料不是建置期常數，
//    因為驗收標準要求『啟用與停用不需重新部署』」。
//
// ⚠️ 端點**只回前台需要的那幾個鍵**：收件信箱、追蹤碼等內部設定一律不外露
//    （docs/10 §3.1 的白名單）。不要因為「反正都要打一次」就把它擴充成全份設定。
//
// ⚠️ 失敗時**退回建置期烤進去的值**，不是關掉面板。這支端點掛掉不該讓一個
//    原本開著的功能消失；反過來說，開關剛被打開而 API 又正好連不上時，
//    面板要到下一次建置才出現 —— 兩害相權取其輕。

import { SITE_SETTINGS } from '~/data/site-settings'

export interface PublicSiteSettings {
  aiFaqEnabled: boolean
  aiFaqPanelTitle: string
  aiFaqWelcomeText: string
  aiFaqHandoffBookingUrl: string
  aiFaqHandoffLineUrl: string
}

export function usePublicSiteSettings() {
  const settings = ref<PublicSiteSettings>({
    // 建置期的值當初始值：預渲染的 HTML 就是照這一份產生的，
    // 用它當初始值才不會在 hydration 當下閃一下。
    aiFaqEnabled: SITE_SETTINGS.aiFaqEnabled,
    aiFaqPanelTitle: SITE_SETTINGS.aiFaqPanelTitle,
    aiFaqWelcomeText: SITE_SETTINGS.aiFaqWelcomeText,
    aiFaqHandoffBookingUrl: SITE_SETTINGS.aiFaqHandoffBookingUrl,
    aiFaqHandoffLineUrl: SITE_SETTINGS.aiFaqHandoffLineUrl,
  })

  onMounted(async () => {
    const { public: { apiBaseUrl } } = useRuntimeConfig()
    try {
      const res = await $fetch<{ success: boolean; data: PublicSiteSettings | null }>(
        `${apiBaseUrl}/site-settings/public`,
      )
      if (res?.success && res.data) settings.value = res.data
    } catch {
      // 靜默退回建置期的值（理由見檔頭）。這是一個開關，不是內容 ——
      // 在頁面上顯示錯誤訊息只會讓訪客困惑。
    }
  })

  return settings
}
