// `/sitemap-concerns.xml` → API 的 `/seo/sitemap/concerns`。
//
// ⚠️ **五個分檔各自一支 route，不用 `[key]` 動態參數。**
//    nitro 的檔案路由不認得「路徑片段中間」的參數（`sitemap-[key].xml.ts` 不會比對到
//    `/sitemap-blog.xml`，2026-09-16 實測是 404）。而分檔本來就是 docs/08 §H 定的
//    **封閉集合**，寫成五支反而把「有哪些分檔」變成看檔名就知道的事。
//    ⚠️ 日後要加第六個分檔，這裡與 SeoHandler.Buckets 兩邊都要加 —— 那是刻意的，
//    新增一個對外的 sitemap 分檔應該是個明確的決定，不是改一個陣列就悄悄多出來。
export default defineEventHandler((event) =>
  proxySeo(event, 'sitemap/concerns', 'application/xml; charset=utf-8'))
