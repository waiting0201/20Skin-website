// 首頁七個版位的內容來源（模板 1，mockup/index.html）。
//
// 對應 docs/02-backend-cms.md §3 的 HomeSections 種子 key：
//   hero / specialties / featured-treatments / latest-articles / doctors / clinics / brand-story
// 正式站由 HomeSectionItems（HomeSectionId + ContentItemId + SortOrder）勾選既有內容組成 ——
// 每個版位只能引用已存在的內容，不能另打文案。這裡先把 mockup 的原文抽成同樣的形狀，
// 接上 CMS 時只換資料來源、不改元件。
//
// 欄位命名對齊 docs/08-database.md 的 ContentItems／各模型主幹（title／slug／urlPath／summary），
// 圖片用 imagePath 是建置期產物的簡化表示 —— 正式站對應的是 CoverMediaId／PhotoMediaId
// （FK 指向媒體庫，不是路徑字串），不是資料庫的實際欄位名。

import { CLINIC_NAP } from './navigation'

// ── 1. hero：主視覺輪播 ──────────────────────────────────────────────────
// 正式站對應 HomeSections.Settings 的 JSON（唯一沒有 ContentItemId 可引用的版位，
// 見 docs/02-backend-cms.md §3）。

export interface HeroSlide {
  imagePath: string
  imageWidth: number
  imageHeight: number
  alt: string
  caption: string
}

export const HERO_SLIDES: HeroSlide[] = [
  {
    imagePath: '/assets/img/banner1.jpg',
    imageWidth: 320,
    imageHeight: 220,
    alt: '四季診所院區外觀，夜間立面燈光設計',
    caption: '四季診所．院區外觀',
  },
  {
    imagePath: '/assets/img/banner2.jpg',
    imageWidth: 320,
    imageHeight: 220,
    alt: '四季診所大廳品牌牆與候診區',
    caption: '四季診所．大廳與候診區',
  },
  {
    imagePath: '/assets/img/banner3.jpg',
    imageWidth: 320,
    imageHeight: 220,
    alt: '四季診所診療室與診療設備',
    caption: '四季診所．診療室',
  },
  {
    imagePath: '/assets/img/banner4.jpg',
    imageWidth: 320,
    imageHeight: 220,
    alt: '四季診所諮詢空間一角',
    caption: '四季診所．諮詢空間',
  },
]

// ── 2. specialties：八大專科入口（肌膚困擾） ────────────────────────────
// 對應 Concerns 模型，urlPath 為 docs/01-sitemap.md §1 定案的 8 個 slug。
// mockup 除第一項外皆為 href="#" 佔位（demo 當時困擾細節頁只做了一個範例），
// 但 8 個 slug 在 sitemap 已經定案，所以這裡直接接上正式網址（與 app/data/navigation.ts
// 的 MAIN_NAV 肌膚困擾子選單一致），不是自己編的路徑。

export interface SpecialtyEntry {
  title: string
  slug: string
  urlPath: string
  imagePath: string
  iconWidth: number
  iconHeight: number
}

export const SPECIALTIES: SpecialtyEntry[] = [
  { title: '痘痘・粉刺', slug: 'acne', urlPath: '/concerns/acne/', imagePath: '/assets/img/spec-01.png', iconWidth: 46, iconHeight: 46 },
  { title: '敏感肌', slug: 'sensitive-skin', urlPath: '/concerns/sensitive-skin/', imagePath: '/assets/img/spec-02.png', iconWidth: 46, iconHeight: 46 },
  { title: '斑點・色素沉澱', slug: 'pigmentation', urlPath: '/concerns/pigmentation/', imagePath: '/assets/img/spec-03.png', iconWidth: 46, iconHeight: 46 },
  { title: '抗老・緊緻', slug: 'anti-aging', urlPath: '/concerns/anti-aging/', imagePath: '/assets/img/spec-04.png', iconWidth: 46, iconHeight: 46 },
  { title: '生髮・落髮', slug: 'hair-loss', urlPath: '/concerns/hair-loss/', imagePath: '/assets/img/spec-05.png', iconWidth: 46, iconHeight: 46 },
  { title: '除毛', slug: 'hair-removal', urlPath: '/concerns/hair-removal/', imagePath: '/assets/img/spec-06.png', iconWidth: 46, iconHeight: 46 },
  { title: '多汗・狐臭', slug: 'hyperhidrosis', urlPath: '/concerns/hyperhidrosis/', imagePath: '/assets/img/spec-07.png', iconWidth: 46, iconHeight: 46 },
  { title: '一般皮膚疾病', slug: 'dermatology', urlPath: '/concerns/dermatology/', imagePath: '/assets/img/spec-08.png', iconWidth: 46, iconHeight: 46 },
]

// ── 3. featured-treatments：精選療程 ────────────────────────────────────
// 對應 Treatments 模型。urlPath 依 docs/01-sitemap.md §1「療程 slug 對照」組出，
// 這 4 項在 mockup 裡除第一項外也是 href="#"，但療程名稱與分類都對得到 sitemap
// 已定案的 slug（Thermage FLX → photoelectric/thermage-flx、Sculptra →
// microneedle/sculptra、HydraFacial → skincare/hydrafacial），不是自己編的。

export interface FeaturedTreatment {
  title: string
  categoryLabel: string
  categorySlug: string
  slug: string
  urlPath: string
  imagePath: string
  imageWidth: number
  imageHeight: number
  alt: string
}

export const FEATURED_TREATMENTS: FeaturedTreatment[] = [
  {
    title: 'Picosure® Pro 鉑金版蜂巢皮秒雷射',
    categoryLabel: '光療美顏',
    categorySlug: 'laser',
    slug: 'picosure-pro',
    urlPath: '/treatments/laser/picosure-pro/',
    imagePath: '/assets/img/product-p01.png',
    imageWidth: 550,
    imageHeight: 550,
    alt: 'Picosure Pro 鉑金版蜂巢皮秒雷射機台',
  },
  {
    title: 'Thermage FLX 鳳凰電波',
    categoryLabel: '光電美容',
    categorySlug: 'photoelectric',
    slug: 'thermage-flx',
    urlPath: '/treatments/photoelectric/thermage-flx/',
    imagePath: '/assets/img/product-p13.png',
    imageWidth: 550,
    imageHeight: 550,
    alt: 'Thermage FLX 鳳凰電波機台',
  },
  {
    title: 'Sculptra 舒顏萃 4D聚左旋乳酸',
    categoryLabel: '微針美容',
    categorySlug: 'microneedle',
    slug: 'sculptra',
    urlPath: '/treatments/microneedle/sculptra/',
    imagePath: '/assets/img/product-p03.png',
    imageWidth: 580,
    imageHeight: 580,
    alt: 'Sculptra 舒顏萃 4D聚左旋乳酸產品',
  },
  {
    title: 'HydraFacial 海菲秀',
    categoryLabel: '醫美保養',
    categorySlug: 'skincare',
    slug: 'hydrafacial',
    urlPath: '/treatments/skincare/hydrafacial/',
    imagePath: '/assets/img/product-p16.png',
    imageWidth: 550,
    imageHeight: 550,
    alt: 'HydraFacial 海菲秀機台',
  },
]

// ── 4. latest-articles：最新文章 ─────────────────────────────────────────
// 對應 Articles 模型。⚠️ 這 4 篇在 mockup 除第一篇外皆為 href="#"，且**連第一篇
// 也沒有真正的文章 slug 可用**（/blog/{slug}/ 尚未有內容匯入）。docs 目前沒有任何
// 一份已定案的文章 slug 清單，所以 urlPath 一律先留 '#'，見本頁回報的「未處理事項」。

export interface LatestArticle {
  title: string
  categoryLabel: string
  categorySlug: string
  urlPath: string
  summary: string
  imagePath: string
  imageWidth: number
  imageHeight: number
  alt: string
  authorLabel: string
  displayDate: string
  readingMinutes: number
}

export const LATEST_ARTICLES: LatestArticle[] = [
  {
    title: '素顏也不怕！眼周精雕打造晶亮美眸',
    categoryLabel: '醫美新知',
    categorySlug: 'medical-aesthetics',
    urlPath: '#',
    summary: '從基礎保養到精緻療程，掌握眼周老化徵兆與保養重點。',
    imagePath: '/assets/img/index-p01.jpg',
    imageWidth: 480,
    imageHeight: 230,
    alt: '眼周精雕相關文章封面',
    authorLabel: '楊嵐怡 醫師',
    displayDate: '2026.06.12',
    readingMinutes: 4,
  },
  {
    title: 'Xeomin 德國天使肉毒｜美得純淨無瑕，更精準、更快速、更安全',
    categoryLabel: '醫美新知',
    categorySlug: 'medical-aesthetics',
    urlPath: '#',
    summary: '認識新一代肉毒桿菌素的作用原理與臨床應用差異。',
    imagePath: '/assets/img/index-p02.jpg',
    imageWidth: 480,
    imageHeight: 230,
    alt: 'Xeomin德國天使肉毒相關文章封面',
    authorLabel: '林源富 醫師',
    displayDate: '2026.05.28',
    readingMinutes: 5,
  },
  {
    title: '全球熱銷超過 90 國 PROFHILO 逆時針．正式進駐四季診所',
    categoryLabel: '醫美新知',
    categorySlug: 'medical-aesthetics',
    urlPath: '#',
    summary: '認識具生物再生特性的複合型玻尿酸如何應用於臨床。',
    imagePath: '/assets/img/index-p03.jpg',
    imageWidth: 480,
    imageHeight: 230,
    alt: 'PROFHILO逆時針相關文章封面',
    authorLabel: '鍾佩宜 醫師',
    displayDate: '2026.04.15',
    readingMinutes: 4,
  },
  {
    title: 'Ultherapy PRIME 韓國首爾上市記者會',
    categoryLabel: '媒體報導',
    categorySlug: 'media',
    urlPath: '#',
    summary: '四季診所受邀出席海外品牌發表活動，掌握第一手技術資訊。',
    imagePath: '/assets/img/index-p04.jpg',
    imageWidth: 480,
    imageHeight: 230,
    alt: 'Ultherapy PRIME韓國首爾記者會相關文章封面',
    authorLabel: '編輯部',
    displayDate: '2026.03.02',
    readingMinutes: 3,
  },
]

// ── 5. doctors：醫師團隊 ─────────────────────────────────────────────────
// 對應 Doctors 模型。⚠️ 14 位裡只有安喬是藝術總監、不是醫師（CLAUDE.md 關鍵數字）——
// jobTitle 逐字照抄 mockup，isPhysician 依 CLAUDE.md 的定案另外標記，不是自己編的。
// 個人頁 slug（/team/{slug}/）目前沒有任何一份定案清單，mockup 裡也只有第一位
// （黃勇學）連到 05-doctor-detail.html，其餘皆為 '#'，所以 urlPath 一律先留 '#'。

export interface HomeDoctor {
  name: string
  jobTitle: string
  isPhysician: boolean
  urlPath: string
  photoPath: string
  photoWidth: number
  photoHeight: number
}

export const FEATURED_DOCTORS: HomeDoctor[] = [
  { name: '黃勇學', jobTitle: '院長・皮膚科專科醫師', isPhysician: true, urlPath: '#', photoPath: '/assets/img/doctor-huang.jpg', photoWidth: 700, photoHeight: 1021 },
  { name: '安喬', jobTitle: '藝術總監', isPhysician: false, urlPath: '#', photoPath: '/assets/img/doctor-anqiao.jpg', photoWidth: 700, photoHeight: 921 },
  { name: '林源富', jobTitle: '肥胖醫學專科醫師', isPhysician: true, urlPath: '#', photoPath: '/assets/img/doctor-lin-yuanfu.jpg', photoWidth: 700, photoHeight: 1051 },
  { name: '施百潤', jobTitle: '家庭醫學科專科醫師', isPhysician: true, urlPath: '#', photoPath: '/assets/img/doctor-shih.jpg', photoWidth: 700, photoHeight: 1051 },
  { name: '鄭凱中', jobTitle: '重症醫學部研究醫師', isPhysician: true, urlPath: '#', photoPath: '/assets/img/doctor-cheng.jpg', photoWidth: 700, photoHeight: 1051 },
  { name: '劉柏亨', jobTitle: '中華民國專科醫師', isPhysician: true, urlPath: '#', photoPath: '/assets/img/doctor-liu.jpg', photoWidth: 700, photoHeight: 1051 },
  { name: '林鈺敏', jobTitle: '主治醫師', isPhysician: true, urlPath: '#', photoPath: '/assets/img/doctor-lin-yumin.jpg', photoWidth: 700, photoHeight: 1014 },
  { name: '楊嵐怡', jobTitle: '肥胖醫學會醫師', isPhysician: true, urlPath: '#', photoPath: '/assets/img/doctor-yang-lanyi.jpg', photoWidth: 700, photoHeight: 1021 },
  { name: '楊証傑', jobTitle: '部定專科醫師', isPhysician: true, urlPath: '#', photoPath: '/assets/img/doctor-yang-zhengjie.jpg', photoWidth: 700, photoHeight: 1014 },
  { name: '鍾佩宜', jobTitle: '皮膚科專科醫師', isPhysician: true, urlPath: '#', photoPath: '/assets/img/doctor-chung.jpg', photoWidth: 700, photoHeight: 1051 },
  { name: '蘇達華', jobTitle: '家庭醫學科專科醫師', isPhysician: true, urlPath: '#', photoPath: '/assets/img/doctor-su.jpg', photoWidth: 700, photoHeight: 1051 },
  { name: '洪健睿', jobTitle: '二林四季皮膚科主治醫師', isPhysician: true, urlPath: '#', photoPath: '/assets/img/doctor-hung.jpg', photoWidth: 700, photoHeight: 1022 },
  { name: '趙映程', jobTitle: '皮膚科專科醫師', isPhysician: true, urlPath: '#', photoPath: '/assets/img/doctor-chao.jpg', photoWidth: 700, photoHeight: 1049 },
  { name: '熊開瑾', jobTitle: '部定專科醫師', isPhysician: true, urlPath: '#', photoPath: '/assets/img/doctor-hsiung.jpg', photoWidth: 700, photoHeight: 1050 },
]

// ── 6. clinics：據點資訊 ─────────────────────────────────────────────────
// NAP（name／address／phone／urlPath）與 app/data/navigation.ts 的 CLINIC_NAP
// 共用同一份，避免兩處各自維護一份佔位電話／地址。這裡只加首頁專屬的門診時段
// 明細表（mockup 的 <table class="c-hours">），docs/08-database.md 的
// ClinicBusinessHours 是「一天可多列」的結構（午休斷點＝兩列），這裡用
// 「時段列 ＋ 7 天是否看診」表達同一件事，方便對應表格的欄位排版。

export interface ClinicHoursRow {
  timeRangeLabel: string
  /** 一～日（週一到週日）是否看診 */
  openDays: [boolean, boolean, boolean, boolean, boolean, boolean, boolean]
}

export interface HomeClinic {
  name: string
  urlPath: string
  phone: string
  address: string
  hoursRows: ClinicHoursRow[]
  hoursFootnote: string
}

export const HOME_CLINICS: HomeClinic[] = [
  {
    name: CLINIC_NAP[0].name,
    urlPath: CLINIC_NAP[0].href,
    phone: CLINIC_NAP[0].phone,
    address: CLINIC_NAP[0].address,
    hoursRows: [
      { timeRangeLabel: '09:00–13:00', openDays: [true, true, false, true, true, true, false] },
      { timeRangeLabel: '17:00–21:00', openDays: [true, true, true, true, true, false, false] },
    ],
    hoursFootnote: '週日休診。六上午看診至 12:30。',
  },
  {
    name: CLINIC_NAP[1].name,
    urlPath: CLINIC_NAP[1].href,
    phone: CLINIC_NAP[1].phone,
    address: CLINIC_NAP[1].address,
    hoursRows: [
      { timeRangeLabel: '08:30–12:00', openDays: [true, true, true, true, true, true, false] },
      { timeRangeLabel: '15:00–18:00', openDays: [true, true, true, true, true, true, false] },
      { timeRangeLabel: '18:00–21:00', openDays: [true, false, true, true, false, false, false] },
    ],
    hoursFootnote: '週日休診。',
  },
]

export const HOURS_WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const
