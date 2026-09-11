// 內容圖片的 blob 路徑規則（CLAUDE.md 決策 13、docs/08 §0 決策四）。
//
// ⚠️ 路徑刻意與 UploadHandler 的上傳產物**同形**（那裡是 `{yyyy}/{MM}/{Guid:N}{ext}`），
//    讓搬進來的舊圖與日後新上傳的圖在儲存體裡無從區分，也就不需要任何特例處理。
//    差別只在這 32 位十六進位是**算出來的**而不是隨機的。
//
// 🔴 **一個引用一個 blob，不跨內容共用。**
//    59 個來源檔被引用 163 次 → 163 個 blob。這不是浪費，是 CLAUDE.md 決策 13 的
//    不變量：沒有 MediaUsages 之後「還有誰在用這個檔案」無從查起，所以 API 在換圖時
//    會直接刪掉舊 blob。若兩處共用一個檔案，有人換掉文章的作者頭像，
//    醫師個人頁的照片就跟著消失。多存十幾 MB 比斷圖便宜。
//
// ⚠️ 決定性雜湊的用途是**重跑安全**：匯入腳本跑第二次會算出同一批路徑，
//    不會每次都生出一批新 blob 與對應的孤兒檔。雜湊的輸入含「引用位置」而非只有檔名，
//    這正是「一個引用一個 blob」的實作方式。

import { createHash } from 'node:crypto'
import { basename, extname } from 'node:path'

/** 公開圖片容器。與 BLOB_PUBLIC_CONTAINER 一致。 */
export const CONTAINER = 'media'

/**
 * ⚠️ `st20skinweb` 是本專案的；`st20skinprod` 是**線上預約系統的**（CLAUDE.md 決策 5）。
 * 名字只差一個字，指錯不會有任何錯誤訊息。
 */
export const ACCOUNT = process.env.SKIN20_STORAGE_ACCOUNT ?? 'st20skinweb'

/** 搬遷批次的日期資料夾。固定值 —— 跟著今天跑會讓路徑隨執行日期漂移，重跑就不再冪等。 */
const MIGRATION_FOLDER = '2026/09'

/**
 * 算出一張圖在 Blob 上的位置。
 *
 * @param usage 引用位置，例如 `treatment/picosure-pro/cover`。**同一個檔案在不同位置
 *              會得到不同的 blob**，這是刻意的，見檔頭。
 * @param src   來源路徑，例如 `/assets/img/product-p01.png`
 */
export function blobFor(usage, src) {
  const ext = extname(src).toLowerCase()
  const hex = createHash('md5').update(`${usage}|${basename(src)}`).digest('hex')
  const blobPath = `${MIGRATION_FOLDER}/${hex}${ext}`
  return {
    blobPath,
    url: `https://${ACCOUNT}.blob.core.windows.net/${CONTAINER}/${blobPath}`,
  }
}

/**
 * 組出內容欄位要存的圖片值。形狀與 API `POST /admin/upload/commit` 的回傳值逐欄一致
 * （docs/09 §9）—— 匯入走的是同一個欄位形狀，不是另一套。
 */
export function imageField(usage, src, { alt = null, width = null, height = null } = {}) {
  if (!src) return null
  const { blobPath, url } = blobFor(usage, src)
  return { blobPath, url, alt, width, height, variants: null }
}
