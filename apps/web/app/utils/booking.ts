// 線上預約的網址：全站設定的「線上預約網址」，沒填時退回預設值。
//
// 🔴 全站只有這一個來源（2026-11-13）。在此之前這個網址在模板裡寫死了三十多處，
//    後台那一格只管 AI 面板 —— 預約系統換網址時院方改了設定，頁首與每一頁的
//    「立即預約」都不會跟。
// ⚠️ 設定在 app.vue 取得後放進 `useState('site-head')`，這裡同步讀（理由同 usePageHead）。
//    error.vue 不經過 app.vue 的那一段，讀不到時用預設值。
import { EXTERNAL } from '~/data/navigation'

export function bookingUrl(): string {
  return useState<{ bookingUrl?: string } | null>('site-head', () => null).value?.bookingUrl || EXTERNAL.booking
}
