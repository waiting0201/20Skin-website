// 上傳（docs/09-frontend.md §9、docs/10-api.md §3.4）。
//
// ⚠️ **不是媒體庫**（2026-09-11 定案）：沒有清單、沒有挑圖瀏覽器、沒有刪除端點。
// 上傳的終點是「某一個內容欄位」——回報端點回傳的東西，就是那個欄位要存的東西
// （docs/08-database.md §0 決策五）。檔案的清除是內容存檔時由 API 處理的，
// 後台不需要、也沒有辦法自己刪檔。
//
// 上層畫面只透過 client.ts 匯出的 adminApi 取用，不直接 import 這個檔。
// 接上 api.20skin.tw 時整支換掉，畫面不必改（docs/09-frontend.md §8）。

import { ApiError } from './errors'

/**
 * 內嵌在內容欄位裡的一張圖片。形狀與 API 的 `UploadedImage` 逐欄對齊。
 *
 * ⚠️ `blobPath` 必須原封不動存回去——少了它，這張圖被換掉時 API 找不到檔案可刪
 * （docs/11-backend-design.md §9）。
 */
export interface UploadedImage {
  blobPath: string
  url: string
  alt: string | null
  width: number | null
  height: number | null
  variants: string | null
}

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

/** 只收圖片：沒有媒體庫之後，非圖片檔案在後台沒有任何欄位可以承接（docs/02-backend-cms.md §4）。 */
export const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/gif,image/webp'

export const uploadApi = {
  /**
   * 選檔 → 取 SAS → 瀏覽器直傳 Blob → 回報。docs/09-frontend.md §9：
   * 檔案**不經過 API 的 request body**。
   *
   * ⚠️ 刻意丟錯而不是回假網址 —— 假裝上傳成功會讓人以為這條路徑已經通了。
   * 接上 API 之後，這裡依序打 `POST /admin/upload/sas` → `PUT` 到 SAS 網址 →
   * `POST /admin/upload/commit`，把 commit 的回傳值原封不動交給呼叫端。
   */
  async upload(_file: File): Promise<UploadedImage> {
    throw new ApiError('INTERNAL', 'TODO：尚未串接 api.20skin.tw，直傳流程待實作（docs/09-frontend.md §9）。')
  },
}
