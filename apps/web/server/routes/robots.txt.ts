// `/robots.txt` —— 內容來自 SiteSettings.seo.robotsTxt（後台改得動）。
// ⚠️ 設定被清空時 API 回 404，這裡照實傳遞 —— 「沒有這個檔案」與「有一個空檔案」
//    對爬蟲不是同一件事。
export default defineEventHandler((event) => proxySeo(event, 'robots.txt', 'text/plain; charset=utf-8'))
