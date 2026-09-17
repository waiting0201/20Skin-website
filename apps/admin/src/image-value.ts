// 圖片欄位的值：**已上傳的**（UploadedImage）與**待上傳的**（PendingImage）兩種形狀。
//
// 🔴 **選檔不等於上傳**（Tim 指定，2026-09-17）。選了檔案只在瀏覽器裡產生一個
//    object URL 做預覽，真正的三步上傳（SAS → 直傳 → commit，見 api/upload.ts）
//    要等**按下表單的儲存按鈕**才跑。
//
//    改掉舊行為（選檔當下就傳）的理由不是效能，是**垃圾檔**：
//    ① 選了圖又按取消、或表單其他欄位驗證沒過而沒存成 —— 舊流程已經把檔案
//       commit 進 `media/` 正式路徑了，而沒有任何一筆內容指得到它；
//    ② 前端刪不掉它 —— SAS 是 write-only，要刪就得再開一支刪除端點，
//       等於給瀏覽器一個刪 blob 的入口（api/upload.ts 檔頭已經否決過這條路）。
//    連續換三次圖就是三個孤兒檔，而 `tools/blob-reconcile` 只能對正式資料庫跑。
//
// ⚠️ **PendingImage 不能被 JSON 序列化後還原**（File 與 object URL 都活不過去）。
//    任何「把表單值送出去」的路徑，都要先經過 `uploadPendingImages()` 換成
//    UploadedImage；漏掉的話送出去的是 `{"pending":true,"alt":null}` 這種
//    API 看不懂、但**不會報錯**的東西。

import { toRaw } from 'vue'
import { ACCEPTED_EXTENSIONS, extensionOf, MAX_IMAGE_BYTES, uploadApi, type UploadedImage } from './api/upload'

/**
 * 已經選好、但還沒送上 Blob 的一張圖。
 *
 * ⚠️ `previewUrl` 是 `URL.createObjectURL()` 產生的，**要記得 revoke** ——
 * 換圖、移除、上傳完成、離開畫面四個時機都算（不 revoke 就是分頁級的記憶體洩漏，
 * 一張 8 MB 的原圖在後台開一下午會累積成好幾百 MB）。
 */
export interface PendingImage {
  pending: true
  file: File
  previewUrl: string
  alt: string | null
  /** 本機讀到的原始尺寸；上傳後會被 API 回報的值取代。 */
  width: number | null
  height: number | null
}

export type ImageValue = UploadedImage | PendingImage

export function isPendingImage(value: unknown): value is PendingImage {
  return typeof value === 'object' && value !== null && (value as PendingImage).pending === true
}

/** 預覽要顯示哪一個網址：待上傳的用 object URL，已上傳的用 Blob 網址。 */
export function imagePreviewUrl(value: ImageValue | null | undefined): string {
  if (!value) return ''
  return isPendingImage(value) ? value.previewUrl : value.url
}

/**
 * 選檔當下的粗篩。
 *
 * ⚠️ 這**不是防線** —— 真正判定型別是 API 在 commit 時讀檔頭做的
 * （api/upload.ts ③）。這裡擋下來只是為了不要讓人填完整張表單、按了儲存、
 * 才在上傳那一步被退回。
 */
export function validateImageFile(file: File): string | null {
  const extension = extensionOf(file.name)
  if (!ACCEPTED_EXTENSIONS.includes(extension)) {
    return `不支援的檔案類型（${extension || '無副檔名'}）。只能上傳 ${ACCEPTED_EXTENSIONS.join('／')}。`
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `檔案大小 ${(file.size / 1024 / 1024).toFixed(1)} MB 超過上限 ${MAX_IMAGE_BYTES / 1024 / 1024} MB。`
  }
  return null
}

/**
 * 讀出圖片的原始尺寸。讀不到（壞檔、瀏覽器不認的格式）就回 null，
 * **不擋下選檔** —— 尺寸只是顯示用，真正的判定在 API 那一步。
 */
function probeSize(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => resolve(null)
    img.src = url
  })
}

export async function createPendingImage(file: File, alt: string | null = null): Promise<PendingImage> {
  const previewUrl = URL.createObjectURL(file)
  const size = await probeSize(previewUrl)
  return {
    pending: true,
    file,
    previewUrl,
    alt,
    width: size?.width ?? null,
    height: size?.height ?? null,
  }
}

/** 釋放預覽用的 object URL。傳什麼進來都安全，不是 PendingImage 就什麼都不做。 */
export function releasePendingImage(value: unknown): void {
  if (isPendingImage(value)) URL.revokeObjectURL(toRaw(value).previewUrl)
}

// ── 深走訪 ────────────────────────────────────────────────────────────
//
// 表單值的形狀由單元宣告決定：圖片可能直接掛在 `fields.cover`，也可能藏在
// `fields.images[3].image` 這種圖庫列裡。所以這裡一律深走訪，不假設位置。
//
// ⚠️ 只認「陣列」與「純物件」兩種容器。File／Date 這類物件不遞迴進去 ——
//    遞迴進 File 不會有任何有用的東西，還會把它從 `toRaw` 拆出來的身分弄丟。

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** 這一份表單值裡還有幾張圖沒上傳。用來在按鈕上顯示「上傳 2 張圖片並儲存」。 */
export function countPendingImages(value: unknown): number {
  if (isPendingImage(value)) return 1
  if (Array.isArray(value)) return value.reduce<number>((sum, item) => sum + countPendingImages(item), 0)
  if (isPlainObject(value)) return Object.values(value).reduce<number>((sum, item) => sum + countPendingImages(item), 0)
  return 0
}

/**
 * 單獨一個圖片欄位（`seo.ogImage`、全站設定的 Logo 這種**型別明確**的位置）。
 * ⚠️ 用它而不是 `uploadPendingImages()`，是為了讓回傳型別就是 `UploadedImage | null`——
 * 送給 API 的那個物件才不需要靠型別斷言硬塞。
 */
export async function resolveImage(value: ImageValue | null): Promise<UploadedImage | null> {
  if (!value) return null
  if (!isPendingImage(value)) return value
  const pending = toRaw(value)
  const uploaded = await uploadApi.upload(pending.file, pending.alt)
  URL.revokeObjectURL(pending.previewUrl)
  return uploaded
}

/**
 * 把值裡所有的 PendingImage 換成上傳完成的 UploadedImage，回傳**新的**結構。
 * 用於形狀不固定的地方（內容欄位：圖可能在 `fields.cover`，也可能在 `fields.images[3].image`）。
 *
 * ⚠️ 不就地改寫來源：來源常常是 Vue 的 reactive 物件，就地改會在上傳途中
 * 觸發畫面更新（傳到一半的表單，有些欄位已經換成正式網址、有些還是 object URL）。
 *
 * ⚠️ 一張失敗就整批中止並往外拋。**不要改成「失敗的跳過、其餘照存」** ——
 * 那會存下一筆「圖少了一張，但畫面上看起來還在」的內容，而使用者不會發現。
 * 中止時已經傳完的那幾張會留在 Blob 成為孤兒檔（重試會再傳一次），這是兩害相權：
 * 孤兒檔可以離線對帳（tools/blob-reconcile），存錯的內容沒有人會去對。
 *
 * 🔴 **object URL 要等整批成功才 revoke。** 邊傳邊 revoke 的話，中途失敗時
 *    來源那份表單仍然握著那幾個 PendingImage，但它們的預覽網址已經被撤銷了 ——
 *    畫面當場變成一排破圖，而使用者其實什麼都還沒存。
 */
export async function uploadPendingImages<T>(value: T, onUploaded?: (done: number) => void): Promise<T> {
  let done = 0
  const usedPreviewUrls: string[] = []

  async function walk(node: unknown): Promise<unknown> {
    if (isPendingImage(node)) {
      const pending = toRaw(node)
      const uploaded = await uploadApi.upload(pending.file, pending.alt)
      usedPreviewUrls.push(pending.previewUrl)
      done += 1
      onUploaded?.(done)
      return uploaded
    }
    if (Array.isArray(node)) {
      const out: unknown[] = []
      for (const item of node) out.push(await walk(item))
      return out
    }
    if (isPlainObject(node)) {
      const out: Record<string, unknown> = {}
      for (const [key, item] of Object.entries(node)) out[key] = await walk(item)
      return out
    }
    return node
  }

  const result = (await walk(value)) as T
  for (const url of usedPreviewUrls) URL.revokeObjectURL(url)
  return result
}
