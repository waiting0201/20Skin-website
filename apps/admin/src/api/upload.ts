// 上傳：瀏覽器直傳 Blob（docs/09-frontend.md §9、docs/11 §9）。
//
// 三步，缺一不可：
//   ① `POST /admin/upload/sas`    取一組**短效、write-only、限定單一 blob** 的 SAS
//   ② 瀏覽器 `PUT` 直接打 Blob     檔案不經過 API（Function 的 request body 有上限，
//                                  而且讓幾 MB 的圖穿過 Function 純粹是浪費）
//   ③ `POST /admin/upload/commit` API 讀回檔頭驗真實型別與大小，通過才搬到正式路徑
//
// 🔴 **不是媒體庫**（2026-09-11 定案）：沒有清單、沒有瀏覽、沒有獨立刪除入口。
//    上傳的終點就是「某一個內容欄位」，所以 ③ 回傳的東西就是那個欄位要存的值 ——
//    整包塞進 fields，跟著內容一起送 `PUT /admin/{unit}/{id}`（docs/08 §0 決策五）。
//
// ⚠️ **驗證在 ③ 不在 ①。** 直傳模式下伺服器看不到上傳過程，副檔名只是第一道粗篩；
//    真正判定型別是 commit 時讀檔頭做的，不通過會把 blob 直接刪掉。
//    所以前端這邊的大小／型別檢查**只是省一趟往返的體貼**，不是防線。
//
// 🔴 **這三步什麼時候跑：按下表單的「儲存」之後，不是選檔當下**（2026-09-17 改）。
//    選檔只在瀏覽器裡做預覽（`src/image-value.ts` 的 PendingImage ＋ object URL），
//    存檔時才由 `uploadPendingImages()` 把每一張待上傳的圖跑過這三步。
//    理由：選了圖又按取消（或表單驗證沒過）的話，舊流程已經在 Blob 留下一個
//    沒有人引用的檔案，而 SAS 是 write-only，前端刪不掉。

import { ApiError } from './errors'
import { request } from './http'

/**
 * 內容欄位裡存下來的圖片值（docs/08 §0 決策五）。
 * ⚠️ 沒有 Id —— 它不是一筆獨立的資料，是欄位的一部分。
 * ⚠️ `blobPath` 不可以丟掉：少了它，這張圖被換掉時就找不到檔案可刪（docs/11 §9）。
 */
export interface UploadedImage {
  blobPath: string
  url: string
  alt: string | null
  width: number | null
  height: number | null
  variants: string | null
}

/** 與 API 的 `UploadHandler.MaxImageBytes` 一致。改一邊就要改另一邊。 */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

/** 與 API 的 `AllowedImageExtensions` 一致（.jpg/.jpeg/.png/.gif/.webp）。 */
export const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/gif,image/webp'

export const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp']

interface SasResponse {
  blobPath: string
  uploadUrl: string
  expiresAt: string
}

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot < 0 ? '' : fileName.slice(dot).toLowerCase()
}

export const uploadApi = {
  /**
   * 選檔 → 直傳 → 回報，回傳可以直接塞進欄位的圖片值。
   *
   * ⚠️ 中途失敗時 `incoming/` 底下會留一個沒有人引用的 blob。這**不是漏做清理**：
   * 那個前綴是暫存區，沒有任何內容指得到它，而在前端補一支刪除呼叫等於給瀏覽器
   * 一個刪 blob 的入口（SAS 是 write-only，刪不了；要刪就得開新端點）。
   * 暫存區的清理屬於儲存體生命週期規則，不是前端的事。
   */
  async upload(file: File, alt: string | null = null): Promise<UploadedImage> {
    const extension = extensionOf(file.name)
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      throw new ApiError('UPLOAD_TYPE', `不支援的檔案類型（${extension || '無副檔名'}），只能上傳圖片。`)
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new ApiError('UPLOAD_SIZE', `檔案大小 ${(file.size / 1024 / 1024).toFixed(1)} MB 超過上限 ${MAX_IMAGE_BYTES / 1024 / 1024} MB。`)
    }

    // ① 取 SAS
    const sas = await request<SasResponse>('/admin/upload/sas', {
      method: 'POST',
      body: { fileName: file.name },
    })

    // ② 直傳。⚠️ `x-ms-blob-type: BlockBlob` 是必要標頭 —— 少了它 Blob 會回 400，
    //    而且錯誤訊息是 XML，在 console 裡看起來像是 CORS 問題，會查錯方向。
    let putResponse: Response
    try {
      putResponse = await fetch(sas.uploadUrl, {
        method: 'PUT',
        headers: {
          'x-ms-blob-type': 'BlockBlob',
          'Content-Type': file.type || 'application/octet-stream',
        },
        body: file,
      })
    } catch {
      throw new ApiError(
        'UPLOAD_TYPE',
        '直傳到儲存體失敗。多半是儲存體帳戶的 CORS 沒有放行這個來源 —— 它與 API 的 CORS 是兩套獨立設定。',
      )
    }

    if (!putResponse.ok) {
      throw new ApiError('UPLOAD_TYPE', `直傳到儲存體失敗（HTTP ${putResponse.status}）。SAS 可能已過期，請重試一次。`)
    }

    // ③ 回報。型別與大小的真正把關在這一步。
    return await request<UploadedImage>('/admin/upload/commit', {
      method: 'POST',
      body: { blobPath: sas.blobPath, originalFileName: file.name, alt },
    })
  },
}
