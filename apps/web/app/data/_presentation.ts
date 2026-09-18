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

// ── 八大困擾的科別圖示 ──────────────────────────────────────────────────
//
// 🔴 **檔名與 slug 無關**，所以這張對照表不可以用字串拼接代替。
//    圖檔是設計稿交付的 `spec-01.png`…`spec-08.png`（`mockup/assets/img/`，
//    由 `sync:assets` 複製進 `public/`），編號是設計稿裡的排列順序。
//    2026-09-11 內容搬進資料庫時，這裡被改成 `spec-${slug}.png` —— 八個困擾頁的
//    hero 圖示與總覽頁的八個入口圖示因此**全部 404**（2026-09-18 Tim 回報）。
//    與 CLAUDE.md 決策 14 那個「拿 Blob 網址的檔名去算路徑」是同一類錯誤：
//    **算得出一個看起來很合理、但不存在的路徑，而建置與型別檢查都不會有意見。**
//
// ⚠️ 圖示是版面素材（決策 14），所以留在這裡而不是資料庫 —— 它跟著設計稿走，
//    不是院方會想在後台換的東西。
// ⚠️ **新增第九個困擾時這裡沒有對應的圖**，`concernIconFor()` 因此會回 null，
//    模板不渲染那個 `<img>`。**不要改成退回某一張預設圖** —— 掛一個別的科別的
//    線條圖比沒有圖更糟。
const CONCERN_ICON_FILES: Record<string, string> = {
  acne: 'spec-01.png',
  'sensitive-skin': 'spec-02.png',
  pigmentation: 'spec-03.png',
  'anti-aging': 'spec-04.png',
  'hair-loss': 'spec-05.png',
  'hair-removal': 'spec-06.png',
  hyperhidrosis: 'spec-07.png',
  dermatology: 'spec-08.png',
}

/** 困擾的科別圖示；沒有對應圖檔時回 null（模板要用 `v-if` 跳過，不要硬渲染）。 */
export const concernIconFor = (slug: string, title: string): { src: string; alt: string } | null => {
  const file = CONCERN_ICON_FILES[slug]
  return file ? { src: `/assets/img/${file}`, alt: `${title} 科別圖示` } : null
}

/** 找不到對應小標時的預設值：用 slug 大寫（既有資料檔原本就是這個規則）。 */
export const eyebrowFor = (slug: string): string => EYEBROW[slug] ?? slug.toUpperCase()

// ── 頁尾社群圖示 ────────────────────────────────────────────────────────
//
// 連結本身是內容（後台的「導覽選單與頁尾」在管，2026-09-18 接上），
// 但「長什麼樣子」是版面 —— 所以圖示留在這裡，依網址的網域挑一個。
//
// ⚠️ `.c-social svg` 的樣式是 `fill: #fff`，**沒有 stroke** —— 這裡的路徑
//    一律要是可以直接填色的封閉形狀，描邊式的圖示畫出來會是一團實心色塊。
// ⚠️ 認不出來的網域用「外開連結」圖示，不要硬套 Facebook ——
//    2026-09-18 之前那個 SVG 是寫死的，院方填 Instagram 也會頂著 FB 的 f。
const SOCIAL_ICONS: { match: RegExp, path: string, evenOdd?: boolean }[] = [
  {
    match: /(^|\.)facebook\.com$|(^|\.)fb\.(com|me)$/,
    path: 'M13.5 21v-7.5H16l.4-3H13.5V8.4c0-.87.24-1.46 1.5-1.46H16.5V4.36C16.24 4.32 15.35 4.25 14.32 4.25c-2.15 0-3.62 1.31-3.62 3.72V10.5H8.25v3h2.45V21h2.8Z',
  },
  {
    match: /(^|\.)instagram\.com$/,
    evenOdd: true,
    path: 'M7.8 3h8.4A4.8 4.8 0 0 1 21 7.8v8.4a4.8 4.8 0 0 1-4.8 4.8H7.8A4.8 4.8 0 0 1 3 16.2V7.8A4.8 4.8 0 0 1 7.8 3Zm0 2A2.8 2.8 0 0 0 5 7.8v8.4A2.8 2.8 0 0 0 7.8 19h8.4a2.8 2.8 0 0 0 2.8-2.8V7.8A2.8 2.8 0 0 0 16.2 5H7.8Zm4.2 2.9a4.1 4.1 0 1 1 0 8.2 4.1 4.1 0 0 1 0-8.2Zm0 2a2.1 2.1 0 1 0 0 4.2 2.1 2.1 0 0 0 0-4.2Zm4.6-2.8a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3Z',
  },
  {
    match: /(^|\.)line\.me$|(^|\.)line\.naver\.jp$/,
    path: 'M12 3.4c5 0 9 3.2 9 7.2 0 1.6-.6 3-1.9 4.4-1.9 2.2-6.1 4.8-7.1 5.2-.95.4-.83-.26-.79-.5l.13-.77c.04-.24.07-.6-.03-.83-.11-.26-.5-.4-.8-.46C6.1 17 3 14 3 10.6c0-4 4-7.2 9-7.2Z',
  },
  {
    match: /(^|\.)youtube\.com$|(^|\.)youtu\.be$/,
    evenOdd: true,
    path: 'M21.6 7.6a2.5 2.5 0 0 0-1.76-1.77C18.25 5.4 12 5.4 12 5.4s-6.25 0-7.84.43A2.5 2.5 0 0 0 2.4 7.6 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.4 2.5 2.5 0 0 0 1.76 1.77c1.59.43 7.84.43 7.84.43s6.25 0 7.84-.43a2.5 2.5 0 0 0 1.76-1.77A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.4ZM10 15.2V8.8L15.6 12 10 15.2Z',
  },
]

/** 外開連結——認不出網域時用它。 */
const SOCIAL_ICON_FALLBACK = 'M5 5h6v2H7v10h10v-4h2v6H5V5Zm8 0h6v6h-2V8.4l-6.3 6.3-1.4-1.4L15.6 7H13V5Z'

/** 社群網址 → 圖示路徑（與是否需要 evenodd 填法）。網址壞掉時退回外開連結圖示。 */
export function socialIcon(url: string): { path: string, fillRule: 'evenodd' | 'nonzero' } {
  let host = ''
  try {
    host = new URL(url).hostname.toLowerCase()
  }
  catch {
    // 後台那一欄是自由輸入的文字，可能是 `facebook.com/x`（沒有協定）這種。
    host = (url.split('/')[0] ?? '').toLowerCase()
  }

  const hit = SOCIAL_ICONS.find((i) => i.match.test(host))
  return {
    path: hit?.path ?? SOCIAL_ICON_FALLBACK,
    fillRule: hit?.evenOdd ? 'evenodd' : 'nonzero',
  }
}
