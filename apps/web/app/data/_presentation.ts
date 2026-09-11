// 版面用的常數 —— **刻意不進資料庫**。
//
// 分類原則（2026-09-11 搬 mockup 內容進資料庫時定的）：
//   內容 → 資料庫；版面 → 這裡。
//   判斷標準是一句話：「院方會想在後台改它嗎？」
//
// 這裡放的是設計稿決定的東西：英文小標、圖示代號、JSON-LD 的固定描述。
// 它們跟著版面走，不是跟著內容走 —— 塞進內容模型只會讓後台長出一堆沒人維護的欄位。

/** 各區塊的英文小標（u-eyebrow）。設計稿決定，不隨內容變動。 */
export const EYEBROW: Record<string, string> = {
  // 療程分類
  laser: 'LASER',
  microneedle: 'MICRONEEDLE',
  photoelectric: 'PHOTOELECTRIC',
  skincare: 'SKINCARE',
  // 文章分類
  'medical-aesthetics': 'AESTHETICS',
  dermatology: 'DERMATOLOGY',
  media: 'MEDIA',
  lectures: 'LECTURES',
}

/** 八個困擾頁共用同一個小標 —— 它標示的是「這是困擾頁」，不是哪一個困擾。 */
export const CONCERN_EYEBROW = 'SKIN CONCERN'

/** 找不到對應小標時的預設值：用 slug 大寫（既有資料檔原本就是這個規則）。 */
export const eyebrowFor = (slug: string): string => EYEBROW[slug] ?? slug.toUpperCase()
