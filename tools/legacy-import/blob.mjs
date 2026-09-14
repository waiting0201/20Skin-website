// 舊站圖片在 Azure Blob 上的位置。
//
// ⚠️ 規則與 `tools/content-import/images.mjs` **同形**：`{yyyy}/{MM}/{32hex}{ext}`，
//    與後台上傳產出的 `{yyyy}/{MM}/{Guid:N}{ext}` 無從區分，所以不需要任何特例。
//    差別只在這 32 位是算出來的而不是隨機的 —— 重跑會得到同一批路徑，不會生出孤兒檔。
//
// 🔴 **雜湊的輸入是「引用位置 ＋ 舊站原始網址」。**
//    原始網址是**不會再變**的輸入；資料庫裡存的 src 匯入後會變成 Blob 網址，
//    拿它去算會得到一批全新路徑、指向不存在的檔案（content-import 那邊 2026-09-14 踩過）。
//
// 🔴 **一個引用一個 blob，不跨文章共用**（CLAUDE.md 決策 13）。
//    同一張舊圖被 5 篇文章引用就上傳 5 份。沒有 MediaUsages 之後
//    「還有誰在用這個檔案」查不到，共用會讓「換圖＝刪舊檔」可能刪掉別人正在用的。

import { createHash } from 'node:crypto'
import { extname } from 'node:path'

export const CONTAINER = 'media'

/**
 * ⚠️ `st20skinweb` 是本專案的；`st20skinprod` 是**線上預約系統的**（CLAUDE.md 決策 5）。
 * 名字只差一個字，指錯不會有任何錯誤訊息 —— SAS 照簽、上傳照成功。
 */
export const ACCOUNT = process.env.SKIN20_STORAGE_ACCOUNT ?? 'st20skinweb'

/** 搬遷批次的日期資料夾。固定值 —— 跟著今天跑會讓路徑隨執行日期漂移，重跑就不再冪等。 */
const MIGRATION_FOLDER = '2026/09'

const EXT_BY_TYPE = { jpeg: '.jpg', png: '.png', gif: '.gif', webp: '.webp', bmp: '.bmp' }

/**
 * @param usage     引用位置，例如 `article/share-842/cover`
 * @param legacyUrl 舊站原始網址 —— 雜湊的權威輸入，見檔頭
 * @param type      實際的影像格式（imagesize.mjs 讀出來的）。⚠️ 以它為準而不是網址的副檔名：
 *                  舊站真的有 `.jpg` 其實是 PNG 的檔案，副檔名寫錯會讓瀏覽器拿到對不上的 Content-Type。
 */
export function blobFor(usage, legacyUrl, type) {
  const ext = EXT_BY_TYPE[type] ?? (extname(new URL(legacyUrl).pathname).toLowerCase() || '.jpg')
  const hex = createHash('md5').update(`${usage}|${legacyUrl}`).digest('hex')
  const blobPath = `${MIGRATION_FOLDER}/${hex}${ext}`
  return { blobPath, url: `https://${ACCOUNT}.blob.core.windows.net/${CONTAINER}/${blobPath}` }
}

/** 內容欄位要存的圖片值。形狀與 `POST /admin/upload/commit` 的回傳逐欄一致（docs/09 §9）。 */
export function imageField(usage, legacyUrl, meta) {
  if (!legacyUrl || !meta) return null
  const { blobPath, url } = blobFor(usage, legacyUrl, meta.type)
  return { blobPath, url, alt: meta.alt ?? null, width: meta.width ?? null, height: meta.height ?? null, variants: null }
}
