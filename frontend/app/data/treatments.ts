// 療程資料 —— 模板 6／7／8（療程總覽／療程分類／療程細節）
//
// 來源與範圍（frontend/README.md「資料現在從哪來」）：
//   內容一律照抄 mockup 原文，不自己編療程內容。
//   欄位形狀對齊 docs/08-database.md §C-1 Treatments（適應症／原理／療程時間／
//   建議次數／術後照護／禁忌症與注意事項／儀器資訊）與 §B-1 ContentItems
//   （title / slug / urlPath / summary）。
//
// 27 項療程的分類與 slug 為實數，見 docs/01-sitemap.md §1「療程 slug 對照」。
// 其中 12 項「無站內內容，需從零撰寫」（docs/06-page-inventory.md §3），
// 這 12 項與另外 11 項尚未有站內詳細內容的療程，這裡只給 title / nameEn /
// categorySlug —— 對應 docs/08 §C-1 的提醒：「這 12 筆會長時間停在
// Status=1 草稿」。療程細節頁樣板遇到資料不足時，只渲染有資料的區塊
// （mockup/04-treatment-detail.html 原始碼裡「資料不足的療程請整節移除
// 本區塊」的註記就是這樣要求的），不會為了填版面編造醫療內容。
//
// mockup 只完整示範了「鉑金版蜂巢皮秒雷射」一項（04-treatment-detail.html），
// 以及光療美顏分類頁（03-treatment-category.html）另外三項的卡片摘要／標籤。
// 其餘 23 項僅有總覽頁（12-treatment-overview.html）索引裡的中英文名稱。

export interface ImageRef {
  src: string
  alt: string
  width: number
  height: number
}

export interface TreatmentCategory {
  slug: string
  name: string
  /** u-eyebrow 用的英文標籤。僅 laser 為 mockup 原文（03-treatment-category.html），
   *  其餘三個分類 mockup 沒有寫對應的 eyebrow 文案，沿用該分類的 slug 大寫。 */
  eyebrow: string
  /** 分類頁 Hero 導言。僅 laser 為 03-treatment-category.html 的原文；
   *  其餘三個分類 mockup 未提供獨立分類頁文案，沿用總覽頁（12-treatment-overview.html
   *  §2 四大分類）介紹同一分類的段落。 */
  lede: string
  /** 分類代表圖，與總覽頁「四大分類」卡片共用同一張（12-treatment-overview.html §2）。 */
  image: ImageRef
  /** 實數，見 docs/06-page-inventory.md §3。 */
  count: number
  /** 總覽頁分類卡片下方的代表項目 chips（12-treatment-overview.html §2 原文）。 */
  sampleTags: string[]
  /** 分類頁「能改善哪些困擾」標籤列。僅 laser 有 mockup 原文
   *  （03-treatment-category.html），其餘三個分類沒有對應內頁可抄，留白時
   *  分類頁樣板整節不渲染，不替換分類編造困擾清單。 */
  concernTags?: string[]
  /** 分類頁「本分類醫師團隊」。僅 laser 有 mockup 原文，理由同上。 */
  doctors?: RelatedDoctor[]
  /** 分類頁「相關文章」。僅 laser 有 mockup 原文，理由同上。 */
  articles?: RelatedArticle[]
}

export interface TreatmentFact {
  label: string
  value: string
}

export interface TreatmentIndication {
  title: string
  desc: string
}

export interface TreatmentStep {
  num: number
  title: string
  desc: string
}

export interface TreatmentAftercareItem {
  when: string
  desc: string
}

export interface TreatmentGalleryItem extends ImageRef {
  caption: string
}

export interface RelatedDoctor {
  /** 對應 /team/{slug}/。取自 mockup/assets/img/doctor-*.jpg 的既有命名慣例
   *  （huang／chung／chao／hung），/team/ 尚未由負責該目錄的 agent 定案，
   *  待確認後校對。 */
  slug: string
  name: string
  title: string
  photo: ImageRef
}

export interface RelatedCase {
  title: string
  excerpt: string
  photo: ImageRef
}

export interface TreatmentFaqItem {
  q: string
  a: string
}

export interface RelatedArticle {
  title: string
  href: string
  category: string
  author: string
  date: string
  readingMinutes?: number
  photo: ImageRef
}

export interface Treatment {
  slug: string
  categorySlug: string
  /** ContentItems.Title */
  title: string
  /** Treatments.NameEn */
  nameEn: string
  /** 27 項中 12 項無站內內容需從零撰寫（docs/06 §3）；此欄位標記那 12 項，
   *  其餘 15 項雖然 mockup 沒有展示內容，但站內原本就有頁面，非本次新增撰寫範圍。 */
  needsContentFromScratch: boolean

  // ── 分類頁卡片（僅 laser 分類 4 項有 mockup 原文：03-treatment-category.html）──
  cardExcerpt?: string
  cardTags?: string[]
  cardImage?: ImageRef

  // ── 細節頁（僅 picosure-pro 有 mockup 原文：04-treatment-detail.html）──
  /** Treatments.Subtitle，同時作為 AI 摘要的 40–60 字直答式段落
   *  （docs/03-seo-geo.md §4 ②），渲染於細節頁 Hero 副標。 */
  summary?: string
  facts?: TreatmentFact[]
  indicationsHeading?: string
  indications?: TreatmentIndication[]
  mechanismHeading?: string
  mechanismParagraphs?: string[]
  mechanismImage?: ImageRef
  steps?: TreatmentStep[]
  aftercare?: TreatmentAftercareItem[]
  precautionsList?: string[]
  precautionsNote?: string
  device?: TreatmentFact[]
  gallery?: TreatmentGalleryItem[]
  doctors?: RelatedDoctor[]
  /** 「此療程可改善的困擾」標籤列 */
  detailTags?: string[]
  cases?: RelatedCase[]
  faqLastUpdated?: string
  faqs?: TreatmentFaqItem[]
  articles?: RelatedArticle[]
}

const doctorHuang: RelatedDoctor = {
  slug: 'huang',
  name: '黃勇學',
  title: '院長・皮膚科專科醫師',
  photo: { src: '/assets/img/doctor-huang.jpg', alt: '黃勇學 院長', width: 700, height: 1021 },
}
const doctorChung: RelatedDoctor = {
  slug: 'chung',
  name: '鍾佩宜',
  title: '醫師',
  photo: { src: '/assets/img/doctor-chung.jpg', alt: '鍾佩宜 醫師', width: 700, height: 1051 },
}
const doctorChao: RelatedDoctor = {
  slug: 'chao',
  name: '趙映程',
  title: '醫師',
  photo: { src: '/assets/img/doctor-chao.jpg', alt: '趙映程 醫師', width: 700, height: 1049 },
}
const doctorHung: RelatedDoctor = {
  slug: 'hung',
  name: '洪健睿',
  title: '醫師',
  photo: { src: '/assets/img/doctor-hung.jpg', alt: '洪健睿 醫師', width: 700, height: 1022 },
}

export const treatmentCategories: TreatmentCategory[] = [
  {
    slug: 'laser',
    name: '光療美顏',
    eyebrow: 'LASER',
    lede: '以雷射與光波能量為基礎，依波長特性分別作用於色素、痘疤與膚色不均。實際儀器組合與療程間隔，需經醫師評估。',
    image: {
      src: '/assets/img/stock-facial-calm.jpg',
      alt: '臉部特寫，光療與肌膚意象',
      width: 1800,
      height: 1199,
    },
    count: 4,
    sampleTags: ['蜂巢皮秒雷射', '藍雷射', '光繞雷射', '鉺雅鉻雷射'],
    concernTags: ['痘疤', '斑點・色素沉澱', '抗老・緊緻', '毛孔粗大', '膚色不均'],
    doctors: [doctorHuang, doctorChung, doctorChao, doctorHung],
    articles: [
      {
        title: '皮秒雷射如何作用？認識蜂巢透鏡技術原理',
        href: '/blog/',
        category: '醫美新知',
        author: '黃勇學 醫師',
        date: '2026.07.02',
        readingMinutes: 4,
        photo: { src: '/assets/img/index-p02.jpg', alt: '皮秒雷射原理相關文章封面', width: 480, height: 230 },
      },
      {
        title: '痘疤修復的雷射選擇：淺談光療與恢復期',
        href: '/blog/',
        category: '醫美新知',
        author: '鍾佩宜 醫師',
        date: '2026.06.20',
        readingMinutes: 5,
        photo: { src: '/assets/img/index-p03.jpg', alt: '痘疤雷射選擇相關文章封面', width: 480, height: 230 },
      },
      {
        title: '膚色不均與色素沉澱：光療保養的日常照護重點',
        href: '/blog/',
        category: '皮膚新知',
        author: '趙映程 醫師',
        date: '2026.05.11',
        readingMinutes: 4,
        photo: { src: '/assets/img/index-p04.jpg', alt: '膚色不均日常照護相關文章封面', width: 480, height: 230 },
      },
    ],
  },
  {
    slug: 'photoelectric',
    name: '光電美容',
    eyebrow: 'PHOTOELECTRIC',
    lede: '涵蓋電波、音波與磁波等能量式項目，訴求支撐力與緊緻度，通常需分次進行。',
    image: {
      src: '/assets/img/stock-clinical-hands.jpg',
      alt: '戴手套操作能量儀器的療程情境',
      width: 1800,
      height: 1197,
    },
    count: 12,
    sampleTags: ['鳳凰電波', '超音波拉提', 'EMFACE', '除毛雷射'],
  },
  {
    slug: 'microneedle',
    name: '微針美容',
    eyebrow: 'MICRONEEDLE',
    lede: '以注射方式進行，包含填充、支撐與保濕類材料，部位與劑量需經醫師評估。',
    image: {
      src: '/assets/img/stock-injection.jpg',
      alt: '注射類療程的施作情境',
      width: 1200,
      height: 1800,
    },
    count: 5,
    sampleTags: ['舒顏萃', '洢蓮絲', '玻尿酸', '肉毒'],
  },
  {
    slug: 'skincare',
    name: '醫美保養',
    eyebrow: 'SKINCARE',
    lede: '以清潔、導入與換膚為主，恢復期短，適合作為療程間的日常維持。',
    image: {
      src: '/assets/img/stock-skincare-smile.jpg',
      alt: '白底保養情境',
      width: 1800,
      height: 1199,
    },
    count: 6,
    sampleTags: ['海菲秀', '果酸換膚', '冷凍導入', '高壓氧艙'],
  },
]

export const treatments: Treatment[] = [
  // ── 光療美顏（laser）──────────────────────────────────────────────
  {
    slug: 'picosure-pro',
    categorySlug: 'laser',
    title: '鉑金版蜂巢皮秒雷射',
    nameEn: 'PICOSURE® PRO',
    needsContentFromScratch: false,
    cardExcerpt: '蜂巢透鏡導入皮秒雷射，作用於淺層色素與痘疤紋理。',
    cardTags: ['痘疤', '斑點・色素沉澱', '膚色不均'],
    cardImage: {
      src: '/assets/img/product-p01.png',
      alt: 'Picosure Pro 鉑金版蜂巢皮秒雷射機台',
      width: 550,
      height: 550,
    },
    summary:
      '以皮秒級脈衝搭配蜂巢透鏡聚焦技術，針對色素、痘疤與毛孔問題進行調理。實際效果依個人膚況而異，須經醫師評估。',
    facts: [
      { label: '療程時間', value: '約 30–45 分鐘（依施打範圍而定）' },
      { label: '恢復期', value: '約 1–3 天輕微泛紅' },
      { label: '建議次數', value: '3–5 次為一療程，間隔 4–6 週（依個人膚況調整）' },
      { label: '麻醉方式', value: '外用表面麻醉' },
      { label: '適用部位', value: '全臉、頸部、手部' },
    ],
    indicationsHeading: '蜂巢皮秒雷射可以處理哪些問題？',
    indications: [
      { title: '淺層與深層色素斑', desc: '依部位與深淺調整能量與波長，經醫師評估後執行。' },
      { title: '痘疤與凹陷型疤痕', desc: '刺激真皮膠原新生，有助於改善疤痕輪廓。' },
      { title: '毛孔粗大', desc: '透過微創傷點刺激，有助於改善毛孔外觀。' },
      { title: '細紋', desc: '刺激膠原增生，可改善淺層細紋質地。' },
      { title: '膚色不均', desc: '均勻擊碎黑色素顆粒，有助於改善膚色不均問題。' },
      { title: '刺青去除', desc: '依墨色深淺與範圍調整能量，通常需多次療程。' },
    ],
    mechanismHeading: '蜂巢皮秒和一般雷射差在哪裡？',
    mechanismParagraphs: [
      '傳統雷射多屬奈秒等級脈衝，以光熱效應為主；皮秒雷射脈衝時間更短，改以光機械效應震碎色素顆粒，對周邊組織的熱影響較低。',
      '蜂巢透鏡將單一光束切割為數百個微光點，聚焦作用於表皮與真皮淺層，形成微創傷點刺激膠原新生，同時保留光點間的正常組織以縮短恢復期。',
    ],
    mechanismImage: {
      src: '/assets/img/stock-clinical-hands.jpg',
      alt: '戴手套進行療程操作情境',
      width: 1800,
      height: 1197,
    },
    steps: [
      { num: 1, title: '諮詢評估', desc: '醫師依膚況、病史與生活習慣進行評估與衛教，說明可能之風險與注意事項。' },
      { num: 2, title: '卸妝清潔', desc: '徹底移除彩妝、防曬與臉部油脂，保持治療部位清潔乾淨。' },
      { num: 3, title: '敷麻', desc: '視部位與範圍外用表面麻醉藥膏，降低施打不適感，需留置約 20–30 分鐘。' },
      { num: 4, title: '施打', desc: '醫師依部位調整能量與波長，施打全程監控膚況反應。' },
      { num: 5, title: '舒緩鎮定', desc: '治療後立即進行冷敷與舒緩保養，降低泛紅與不適感。' },
      { num: 6, title: '衛教', desc: '說明術後照護重點與回診安排，並提供書面衛教資料。' },
    ],
    aftercare: [
      { when: '當天', desc: '避免碰水加溫（如三溫暖、泡湯）、避免劇烈運動與飲酒。治療部位可能出現輕微泛紅或熱脹感，屬正常反應。' },
      { when: '3 天內', desc: '加強保濕並落實物理性防曬（帽子、洋傘），避免自行摳抓脫屑處。' },
      { when: '一週內', desc: '持續防曬，暫停使用果酸、A 酸等刺激性保養品，避免長時間處於高溫環境。' },
      { when: '一個月內', desc: '落實日常防曬，依醫囑安排回診追蹤；如有異常反應請盡速回診。' },
    ],
    precautionsList: [
      '懷孕或哺乳中',
      '患有光敏感性疾病，或近期服用具光敏感性之藥物',
      '施打部位有活動性感染、發炎或傷口尚未癒合',
      '近期有明顯日曬或曬傷',
      '蟹足腫（瘢瘤）體質',
      '凝血功能異常或正服用抗凝血藥物',
    ],
    precautionsNote: '以上僅為一般性提醒，實際是否適合治療，需由醫師親自面診評估後判定。',
    device: [
      { label: '原廠廠牌', value: 'Cynosure（美國）' },
      { label: '機型', value: 'PicoSure Pro' },
      { label: '醫療器材許可字號', value: '衛部醫器輸字第 0XXXXX 號' },
    ],
    gallery: [
      {
        src: '/assets/img/photo-facade-detail.jpg',
        alt: '四季診所白磚立面與招牌',
        width: 1800,
        height: 1167,
        caption: '四季診所．外觀',
      },
      {
        src: '/assets/img/photo-street-green.jpg',
        alt: '二林四季皮膚科周邊街景與行道樹',
        width: 1800,
        height: 1119,
        caption: '二林四季皮膚科．周邊環境',
      },
    ],
    doctors: [doctorHuang, doctorChung, doctorChao],
    detailTags: ['痘疤・粉刺', '斑點・色素沉澱', '抗老・緊緻', '毛孔粗大'],
    cases: [
      {
        title: '色素調理案例分享',
        excerpt: '依個人膚況規劃療程次數與間隔，逐步改善色素分布狀況。',
        photo: { src: '/assets/img/index-p01.jpg', alt: '色素調理案例情境示意', width: 480, height: 360 },
      },
      {
        title: '痘疤修復案例分享',
        excerpt: '搭配術後照護計畫，觀察疤痕輪廓隨療程推進的變化。',
        photo: { src: '/assets/img/banner3.jpg', alt: '痘疤修復案例情境示意', width: 480, height: 360 },
      },
      {
        title: '毛孔緊緻案例分享',
        excerpt: '透過多次療程觀察毛孔外觀的漸進式調理過程。',
        photo: { src: '/assets/img/banner4.jpg', alt: '毛孔緊緻案例情境示意', width: 480, height: 360 },
      },
    ],
    faqLastUpdated: '2026-08',
    faqs: [
      { q: '皮秒雷射會痛嗎？', a: '治療前會外用表面麻醉，多數人僅感覺輕微刺痛或熱脹感，實際感受因個人痛覺閾值與施打部位而異。' },
      { q: '術後多久可以化妝？', a: '若無傷口或明顯脫屑，通常隔日即可淡妝，實際時間需依當次治療反應與醫師建議調整。' },
      { q: '需要請假嗎？', a: '多數人治療後可正常上班上課，僅需注意當天避免碰水加溫與劇烈運動，不一定需要請假，仍依個人恢復狀況而定。' },
      { q: '和淨膚雷射差在哪？', a: '兩者波長與作用原理不同，皮秒雷射脈衝時間更短、以光機械效應為主；淨膚雷射則多屬奈秒等級光熱效應。實際適合的雷射類型需由醫師依膚況判斷。' },
      { q: '一次就會有效果嗎？', a: '色素、痘疤與毛孔問題多需要多次治療累積效果，建議療程為 3–5 次、間隔 4–6 週，實際次數依個人膚況而異。' },
      { q: '懷孕可以做嗎？', a: '懷孕或哺乳期間不建議進行本療程，詳見上方「禁忌症與注意事項」，實際仍需經醫師面診評估。' },
    ],
    articles: [
      {
        title: '素顏也不怕！眼周精雕打造晶亮美眸',
        href: '/blog/',
        category: '醫美新知',
        author: '楊嵐怡 醫師',
        date: '2026.06.12',
        photo: { src: '/assets/img/index-p01.jpg', alt: '眼周精雕相關文章封面', width: 480, height: 230 },
      },
      {
        title: '全球熱銷超過 90 國 PROFHILO 逆時針．正式進駐四季診所',
        href: '/blog/',
        category: '醫美新知',
        author: '鍾佩宜 醫師',
        date: '2026.04.15',
        photo: { src: '/assets/img/index-p03.jpg', alt: 'PROFHILO逆時針相關文章封面', width: 480, height: 230 },
      },
      {
        title: 'Ultherapy PRIME 韓國首爾上市記者會',
        href: '/blog/',
        category: '媒體報導',
        author: '編輯部',
        date: '2026.03.02',
        photo: { src: '/assets/img/index-p04.jpg', alt: 'Ultherapy PRIME韓國首爾記者會相關文章封面', width: 480, height: 230 },
      },
    ],
  },
  {
    slug: 'capri-blue',
    categorySlug: 'laser',
    title: '藍雷射',
    nameEn: 'CAPRI',
    needsContentFromScratch: true,
    cardExcerpt: '455nm 藍光波段雷射，用於處理表層色素與膚質紋理。',
    cardTags: ['斑點・色素沉澱', '膚色不均'],
    cardImage: {
      src: '/assets/img/product-p18.png',
      alt: 'Capri 藍雷射儀器操作面板',
      width: 550,
      height: 550,
    },
  },
  {
    slug: 'helios-iii',
    categorySlug: 'laser',
    title: '光繞雷射',
    nameEn: 'D.O.E HELIOS III',
    needsContentFromScratch: true,
    cardExcerpt: '分段式光纖雷射，訴求毛孔與膚質紋理調理。',
    cardTags: ['毛孔粗大', '抗老・緊緻', '痘疤'],
    cardImage: {
      src: '/assets/img/product-p12.png',
      alt: 'D.O.E HELIOS III 光繞雷射機台',
      width: 550,
      height: 550,
    },
  },
  {
    slug: 'er-yag',
    categorySlug: 'laser',
    title: '鉺雅鉻雷射／汽化雷射',
    nameEn: 'ER:YAG',
    needsContentFromScratch: false,
    cardExcerpt: '汽化型雷射，用於淺層角質更新與局部組織處理。',
    cardTags: ['毛孔粗大', '抗老・緊緻'],
    cardImage: {
      src: '/assets/img/product-p17.png',
      alt: 'Er:YAG 鉺雅鉻雷射／汽化雷射機台',
      width: 550,
      height: 550,
    },
  },

  // ── 光電美容（photoelectric）──────────────────────────────────────
  { slug: 'emface', categorySlug: 'photoelectric', title: 'EMFACE 恰恰電波', nameEn: 'EMFACE', needsContentFromScratch: true },
  { slug: 'dermav', categorySlug: 'photoelectric', title: 'DermaV 精靈電波', nameEn: 'DERMA V', needsContentFromScratch: false },
  { slug: 'onda', categorySlug: 'photoelectric', title: 'ONDA 極線音波', nameEn: 'ONDA', needsContentFromScratch: true },
  { slug: 'emsella', categorySlug: 'photoelectric', title: 'EMSELLA 幸福椅', nameEn: 'EMSELLA', needsContentFromScratch: true },
  { slug: 'btl-embody', categorySlug: 'photoelectric', title: 'BTL Embody 磁波椅', nameEn: 'BTL EMBODY', needsContentFromScratch: false },
  { slug: 'thermage-flx', categorySlug: 'photoelectric', title: 'Thermage FLX 鳳凰電波', nameEn: 'THERMAGE FLX', needsContentFromScratch: true },
  { slug: 'ulthera', categorySlug: 'photoelectric', title: 'Ulthera 超音波拉提', nameEn: 'ULTHERA', needsContentFromScratch: true },
  { slug: 'sylfirm', categorySlug: 'photoelectric', title: 'Sylfirm 矽谷電波', nameEn: 'SYLFIRM', needsContentFromScratch: false },
  { slug: 'potenza', categorySlug: 'photoelectric', title: 'POTENZA 黃金電波', nameEn: 'POTENZA', needsContentFromScratch: true },
  { slug: 'lightsheer-duet', categorySlug: 'photoelectric', title: 'LightSheer Duet 除毛雷射', nameEn: 'LIGHTSHEER DUET', needsContentFromScratch: false },
  { slug: 'miradry', categorySlug: 'photoelectric', title: 'miraDry 清新微波', nameEn: 'MIRADRY', needsContentFromScratch: false },
  { slug: 'regenera-activa', categorySlug: 'photoelectric', title: 'Regenera Activa 生髮療程', nameEn: 'REGENERA ACTIVA', needsContentFromScratch: true },

  // ── 微針美容（microneedle）────────────────────────────────────────
  { slug: 'sculptra', categorySlug: 'microneedle', title: 'Sculptra 舒顏萃 4D聚左旋乳酸', nameEn: 'SCULPTRA', needsContentFromScratch: false },
  { slug: 'radiesse', categorySlug: 'microneedle', title: 'Radiesse 洢蓮絲', nameEn: 'RADIESSE', needsContentFromScratch: false },
  { slug: 'belotero-revive', categorySlug: 'microneedle', title: 'Belotero Revive 保濕針', nameEn: 'BELOTERO REVIVE', needsContentFromScratch: false },
  { slug: 'restylane', categorySlug: 'microneedle', title: 'Restylane 瑞絲朗玻尿酸', nameEn: 'RESTYLANE', needsContentFromScratch: false },
  { slug: 'xeomin', categorySlug: 'microneedle', title: 'Xeomin 德國天使肉毒', nameEn: 'XEOMIN', needsContentFromScratch: false },

  // ── 醫美保養（skincare）───────────────────────────────────────────
  { slug: 'targetcool', categorySlug: 'skincare', title: 'TargetCool 冷凍導入', nameEn: 'TARGETCOOL', needsContentFromScratch: true },
  { slug: 'hbot', categorySlug: 'skincare', title: 'HBOT 高壓氧艙', nameEn: 'HBOT', needsContentFromScratch: false },
  { slug: 'hydrafacial', categorySlug: 'skincare', title: 'HydraFacial 海菲秀', nameEn: 'HYDRAFACIAL', needsContentFromScratch: true },
  { slug: 'neostrata-peel', categorySlug: 'skincare', title: 'NeoStrata 果酸換膚', nameEn: 'NEOSTRATA PEEL', needsContentFromScratch: false },
  { slug: 'retinol-peel', categorySlug: 'skincare', title: 'A醇煥膚', nameEn: 'RETINOL PEEL', needsContentFromScratch: true },
  { slug: 'neo-tec', categorySlug: 'skincare', title: 'Neo-Tec 妮傲絲翠保養', nameEn: 'NEO-TEC', needsContentFromScratch: false },
]

export function getCategory(slug: string): TreatmentCategory | undefined {
  return treatmentCategories.find((c) => c.slug === slug)
}

export function getTreatmentsByCategory(categorySlug: string): Treatment[] {
  return treatments.filter((t) => t.categorySlug === categorySlug)
}

export function getTreatment(categorySlug: string, slug: string): Treatment | undefined {
  return treatments.find((t) => t.categorySlug === categorySlug && t.slug === slug)
}

/** 8 個困擾 slug 已定案（docs/01-sitemap.md §1）。用於把療程／分類頁上的
 *  困擾標籤盡量連到正式網址；找不到對應困擾分類的標籤（例如「毛孔粗大」
 *  不在 8 大困擾之列）維持純文字，不猜一個可能是錯的連結。 */
const CONCERN_SLUG_MAP: Record<string, string> = {
  '痘痘・粉刺': 'acne',
  '痘疤': 'acne',
  '痘疤・粉刺': 'acne',
  '敏感肌': 'sensitive-skin',
  '斑點・色素沉澱': 'pigmentation',
  '膚色不均': 'pigmentation',
  '抗老・緊緻': 'anti-aging',
  '細紋': 'anti-aging',
  '生髮・落髮': 'hair-loss',
  '除毛': 'hair-removal',
  '多汗・狐臭': 'hyperhidrosis',
  '一般皮膚疾病': 'dermatology',
}

export function concernHref(label: string): string | null {
  const slug = CONCERN_SLUG_MAP[label]
  return slug ? `/concerns/${slug}/` : null
}
