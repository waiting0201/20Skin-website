/**
 * Blob 上的內容圖的響應式 `srcset`（2026-10-02，Function 端產衍生尺寸）。
 *
 * 🔴 **靠命名規則，不靠資料庫。** 每一張原圖旁邊固定有四個 WebP：
 *    `media/2026/09/{32hex}.jpg` → `….w480.webp`／`.w800`／`.w1200`／`.w1600`
 *    由 API 在上傳 commit 時產生（`functions/Common/ImageVariants.cs`），既有的圖由
 *    `tools/image-variants` 補產。前台不查「有沒有」，看到 Blob 上的 jpg／png／webp 就組。
 *    ⚠️ 所以**衍生圖缺一張就是破圖**（瀏覽器挑到那個寬度就 404）——
 *       部署順序一定是「API 上線 → 補產工具跑完 → 前台上線」。
 *    ⚠️ 為什麼不用 `UploadedImage.Variants`：圖片也散在區塊 JSON 與舊站匯入的內文 `src` 裡，
 *       只有命名規則能一次涵蓋，而不必改寫已發布的快照。
 *
 * ⚠️ `src` 仍保留原圖：不支援 `srcset` 的環境、與 Google 圖片搜尋看到的都是它。
 * ⚠️ 版面素材（`/assets/img/…`）不在 Blob 上，這裡一律回 `undefined` —— 綁上去也不會輸出屬性。
 */

/** 與 API 的 `ImageVariants.Widths` 必須一致。 */
const VARIANT_WIDTHS = [480, 800, 1200, 1600] as const

// ⚠️ 只認本專案的儲存體。衍生圖只會產在 `st20skinweb`；別的帳號（例如預約系統的 `st20skinprod`）
//    的圖組出 srcset 就是四個 404。
const BLOB_IMAGE = /^(https:\/\/st20skinweb\.blob\.core\.windows\.net\/media\/.+)\.(jpe?g|png|webp)$/i

export function srcsetOf(src: string | null | undefined): string | undefined {
  if (!src) return undefined
  const m = BLOB_IMAGE.exec(src)
  if (!m) return undefined
  // 已經是衍生圖（`.w800.webp`）就不再往下展開
  if (/\.w\d+$/.test(m[1]!)) return undefined
  return VARIANT_WIDTHS.map((w) => `${m[1]}.w${w}.webp ${w}w`).join(', ')
}

/**
 * `sizes` 的幾種版面，對齊 base.css 的格線（容器 1200px；1024 以下兩欄；480 以下單欄）。
 *
 * 🔴 `sizes` 寫錯不會破圖，只會讓瀏覽器挑錯寬度 —— 寫太大等於沒做（手機一樣抓 1600），
 *    寫太小會糊。不確定時寧可挑大一號的版面。
 */
export const IMAGE_SIZES = {
  /** 三欄卡片（`.grid--3`）。 */
  grid3: '(max-width: 480px) 100vw, (max-width: 1024px) 50vw, 400px',
  /** 四欄卡片（`.grid--4`）。 */
  grid4: '(max-width: 480px) 100vw, (max-width: 1024px) 50vw, 300px',
  /** 左右分欄的一半（Hero、內頁大圖）。 */
  half: '(max-width: 1024px) 100vw, 600px',
  /** 佔滿容器（文章內文圖）。 */
  full: '(max-width: 1200px) 100vw, 1200px',
  /** 側欄、小卡片的縮圖。 */
  thumb: '(max-width: 480px) 50vw, 240px',
} as const
