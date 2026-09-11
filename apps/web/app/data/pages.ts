// 品牌理念（/about/）、長版故事（/about/{slug}/）與法務頁（/privacy/、/terms/、
// /medical-disclaimer/）的內容。三者在 docs/08-database.md §C-8 都屬於 `Pages`
// 模型（自由頁，PageKind=1；法務頁另有 SuperAdminOnly=1）。
//
// 內容一律取自 mockup 原文（09-about.html、10-story.html、21-legal.html），
// 不自行編寫新事實。少數必要的接續說明（例如法務頁的「內容待補」提示）在各自
// 註解裡說明來源與理由。

// ─────────────────────────────────────────────────────────────────────────
// /about/ 品牌理念（mockup/09-about.html）
// ─────────────────────────────────────────────────────────────────────────

export const ABOUT_PILLARS = [
  {
    no: '01',
    title: '新中式美學',
    body: '以中式書畫的比例與留白為判斷依據，追求耐看而非搶眼。',
    image: { src: '/assets/img/stock-garden-window.jpg', alt: '以開窗取景的庭園意象', w: 1800, h: 1199 },
    href: '/about/new-chinese-aesthetics/',
  },
  {
    no: '02',
    title: '彩妝式輕醫美',
    body: '像上妝一樣先看整張臉的明暗關係，再決定哪裡要處理、處理到什麼程度。',
    image: { src: '/assets/img/stock-skincare-smile.jpg', alt: '日常保養情境', w: 1800, h: 1199 },
    // mockup 原始標記是 href="#"（該理念當時還沒有獨立頁面）。
    // 現在 /about/makeup-style/ 已存在，改指向正式網址，其餘文案不動。
    href: '/about/makeup-style/',
  },
  {
    no: '03',
    title: '專科醫療為底',
    body: '美學判斷之前先有醫療判斷。療程規劃一律由醫師面診評估後決定。',
    image: { src: '/assets/img/stock-clinical-hands.jpg', alt: '療程操作情境', w: 1800, h: 1197 },
    href: '/team/',
  },
]

export const ABOUT_TIMELINE = [
  { year: '2005', title: '四季診所成立', body: '於彰化二林設立診所，以皮膚科門診為主要服務。' },
  { year: '2013', title: '導入醫學美容專科團隊', body: '引進光電與微整形設備，服務自皮膚治療延伸至醫學美容。' },
  { year: '2018', title: '提出「新中式美學」主張', body: '由藝術總監安喬提出，將東方美學的比例概念系統化。' },
  { year: '2021', title: '二林四季皮膚科開幕', body: '第二院區啟用，分流一般皮膚疾病與醫學美容門診。' },
  { year: '2026', title: '品牌整合為 20SKIN 美醫集團', body: '兩院區與線上服務整合於同一品牌識別之下。' },
]

/** 團隊剪影：mockup 只放 4 張卡片（非全部 14 位），黃勇學連個人頁，其餘連列表頁。 */
export const ABOUT_TEAM_PREVIEW = [
  {
    name: '黃勇學',
    role: '院長・皮膚科專科醫師',
    image: { src: '/assets/img/doctor-huang.jpg', alt: '黃勇學 院長・皮膚科專科醫師', w: 700, h: 1021 },
    href: '/team/huang/',
  },
  {
    name: '安喬',
    role: '藝術總監',
    image: { src: '/assets/img/doctor-anqiao.jpg', alt: '安喬 藝術總監', w: 700, h: 921 },
    href: '/team/',
  },
  {
    name: '鍾佩宜',
    role: '皮膚科專科醫師',
    image: { src: '/assets/img/doctor-chung.jpg', alt: '鍾佩宜 皮膚科專科醫師', w: 700, h: 1051 },
    href: '/team/',
  },
  {
    name: '洪健睿',
    role: '二林四季皮膚科主治醫師',
    image: { src: '/assets/img/doctor-hung.jpg', alt: '洪健睿 二林四季皮膚科主治醫師', w: 700, h: 1022 },
    href: '/team/',
  },
]

export const ABOUT_CLINICS = [
  {
    name: '四季診所',
    body: '以醫學美容與光電療程為主，設有獨立諮詢空間與療程室。',
    address: '彰化縣二林鎮○○路○○號｜一二四五 09:00–13:00／17:00–21:00',
    image: { src: '/assets/img/photo-facade-detail.jpg', alt: '四季診所白磚立面與招牌', w: 1800, h: 1167 },
    href: '/clinics/',
  },
  {
    name: '二林四季皮膚科',
    body: '以一般皮膚疾病門診為主，同時提供基礎光電與保養類療程。',
    address: '彰化縣二林鎮○○路○○號｜一二四五 08:30–12:00／15:00–21:00',
    image: { src: '/assets/img/photo-street-green.jpg', alt: '二林四季皮膚科周邊街景與行道樹', w: 1800, h: 1119 },
    href: '/clinics/erlin/',
  },
]

// ─────────────────────────────────────────────────────────────────────────
// /about/{slug}/ 長版故事（mockup/10-story.html）
// ─────────────────────────────────────────────────────────────────────────

export interface StoryFaq {
  q: string
  a: string
}

export interface StoryTreatmentCard {
  title: string
  excerpt: string
  href: string
  image: { src: string; alt: string; w: number; h: number }
}

export interface StoryPage {
  slug: string
  eyebrow: string
  title: string
  lede: string
  meta: string[]
  heroImage: { src: string; alt: string; w: number; h: number }
  heroCaption: string
  /** 本文目錄，橫向條（story-toc）。留空陣列則不渲染目錄。 */
  toc: { id: string; label: string }[]
  faqs: StoryFaq[]
  treatments: StoryTreatmentCard[]
  sisterSlug: string | null
  sisterLabel: string | null
}

export const STORY_PAGES: Record<string, StoryPage> = {
  // 完整長版故事：mockup 唯一寫出全文的一篇。
  'new-chinese-aesthetics': {
    slug: 'new-chinese-aesthetics',
    eyebrow: 'NEW CHINESE AESTHETICS',
    title: '新中式美學',
    lede: '為什麼同樣是打了針、做了雷射，有些人看起來像「換了一張臉」，有些人卻只是「氣色好了」？差別往往不在儀器，而在判斷的依據。這篇文章說明 20SKIN 用什麼標準決定「做到哪裡」。',
    meta: ['最後更新 2026-08-20', '閱讀時間 約 8 分鐘', '內容由院內醫師與編輯部共同確認'],
    heroImage: { src: '/assets/img/stock-bamboo-wall.jpg', alt: '白牆上的竹影', w: 1350, h: 1800 },
    heroCaption: '留白與節制，是「新中式美學」最直接的一次示範。',
    toc: [
      { id: 'origin', label: '這個主張是怎麼來的' },
      { id: 'proportion', label: '先看比例，再看部位' },
      { id: 'restraint', label: '留白：知道哪裡不要動' },
      { id: 'practice', label: '在門診裡怎麼執行' },
      { id: 'faq', label: '關於這套做法的常見疑問' },
    ],
    faqs: [
      {
        q: '這是不是就是「做少一點」？',
        a: '不完全是。留白指的是有取捨，不是一律做保守。有些人需要的其實是把某個環節做足，只做一半反而卡在中間更不協調。重點在於判斷依據，而不是份量多寡。',
      },
      {
        q: '沒有做過醫美，適合從哪裡開始？',
        a: '建議先從一次完整的面診開始，把想改善的部分講清楚，由醫師評估後再決定是否需要療程。有時候調整保養方式或作息，就能處理掉一部分困擾。',
      },
      {
        q: '可以只做醫師建議的其中一項嗎？',
        a: '可以。規劃是建議，不是套裝。實務上多數人也是分次進行，依自己的時間與狀況決定節奏。',
      },
    ],
    treatments: [
      {
        title: 'Picosure® Pro 鉑金版蜂巢皮秒雷射',
        excerpt: '作用於淺層色素與痘疤紋理，常見於膚質整體度的討論方向。',
        href: '/treatments/laser/picosure-pro/',
        image: { src: '/assets/img/product-p01.png', alt: 'Picosure Pro 鉑金版蜂巢皮秒雷射機台', w: 550, h: 550 },
      },
      {
        title: 'Sculptra 舒顏萃 4D聚左旋乳酸',
        excerpt: '以支撐與輪廓走向為考量的注射類項目，需分次規劃。',
        href: '/treatments/microneedle/sculptra/',
        image: { src: '/assets/img/product-p03.png', alt: 'Sculptra 舒顏萃 4D 聚左旋乳酸產品', w: 580, h: 580 },
      },
      {
        title: 'Thermage FLX 鳳凰電波',
        excerpt: '訴求緊緻與支撐力，常見於臉部輪廓的整體規劃中。',
        href: '/treatments/photoelectric/thermage-flx/',
        image: { src: '/assets/img/product-p05.png', alt: 'Thermage FLX 鳳凰電波機台', w: 550, h: 550 },
      },
    ],
    sisterSlug: 'makeup-style',
    sisterLabel: '彩妝式輕醫美：像上妝一樣看待一張臉',
  },

  // ⚠️ mockup 沒有為「彩妝式輕醫美」做出對應的長版故事頁（10-story.html 只寫了
  // 新中式美學一篇）。以下內容全部逐字取自 mockup 其他頁面裡真實出現過的句子
  // （09-about.html 理念支柱、index.html 品牌理念摘要），沒有新增任何一句話，
  // 但份量因此遠比 new-chinese-aesthetics 單薄——這篇文章本身仍待內容團隊撰寫，
  // 見交付回報。
  'makeup-style': {
    slug: 'makeup-style',
    eyebrow: 'OUR APPROACH',
    title: '彩妝式輕醫美',
    lede: '像上妝一樣先看整張臉的明暗關係，再決定哪裡要處理、處理到什麼程度。20SKIN 結合皮膚科專科醫療與個人化精準評估，以「彩妝式輕醫美」的節制手法，為每一位求美者規劃屬於自己的自然樣貌，而非單一標準的臉孔。',
    meta: ['內容由院內醫師與編輯部共同確認'],
    heroImage: { src: '/assets/img/stock-skincare-smile.jpg', alt: '日常保養情境', w: 1800, h: 1199 },
    heroCaption: '強調五官與氣質的整體協調，而非單一標準的網紅罐頭臉。',
    toc: [],
    faqs: [],
    treatments: [],
    sisterSlug: 'new-chinese-aesthetics',
    sisterLabel: '新中式美學',
  },
}

// ─────────────────────────────────────────────────────────────────────────
// /privacy/、/terms/、/medical-disclaimer/ 法務頁（mockup/21-legal.html）
// ─────────────────────────────────────────────────────────────────────────

export interface LegalSection {
  id: string
  heading: string
  /** 純文字，僅「聯絡我們」那一句例外含有信任內部的 <a> 標記，頁面用 v-html 渲染。 */
  paragraphs: string[]
  list?: string[]
}

export interface LegalDoc {
  slug: 'privacy' | 'terms' | 'medical-disclaimer'
  path: string
  navLabel: string
  title: string
  updatedOn: string
  sections: LegalSection[]
}

export const LEGAL_DOCS: LegalDoc[] = [
  {
    // mockup 唯一寫出全文的一份，逐字照抄。
    slug: 'privacy',
    path: '/privacy/',
    navLabel: '隱私權政策',
    title: '隱私權政策',
    updatedOn: '2026-08-01',
    sections: [
      {
        id: 'scope',
        heading: '一、適用範圍',
        paragraphs: [
          '本政策適用於 20SKIN 美醫集團（含四季診所與二林四季皮膚科，以下合稱「本院」）所經營之官方網站 20skin.tw 及其子頁面。',
          '本網站可能連結至第三方網站或服務（例如線上預約系統、線上購物平台）。該等網站有其各自的隱私權政策，不適用本政策，請於使用前另行閱讀。',
        ],
      },
      {
        id: 'collect',
        heading: '二、蒐集的資料類型',
        paragraphs: ['本院於下列情形蒐集個人資料：'],
        list: [
          '你主動填寫聯絡表單時提供的姓名、聯絡電話、電子郵件與問題內容',
          '你使用線上諮詢功能時輸入的問題內容',
          '瀏覽網站時由伺服器自動記錄的技術性資訊，例如 IP 位址、瀏覽器類型、造訪時間與瀏覽頁面',
          '經你同意後由分析工具蒐集的匿名使用行為統計',
        ],
      },
      {
        id: 'purpose',
        heading: '三、利用目的',
        paragraphs: [
          '蒐集之個人資料僅於下列目的範圍內使用：回覆你的詢問、安排看診與後續聯繫、改善網站內容與使用體驗、以及依法令要求所必要之處理。',
          '非經你同意，本院不會將個人資料用於原始蒐集目的以外之用途，亦不會提供予無關之第三方作為行銷使用。',
        ],
      },
      {
        id: 'cookie',
        heading: '四、Cookie 與追蹤技術',
        paragraphs: [
          '本網站使用 Cookie 以維持基本功能運作，並在取得同意後使用分析類 Cookie 以了解整體使用狀況。',
          '你可透過瀏覽器設定拒絕或刪除 Cookie，但部分功能可能因此無法正常運作。',
        ],
      },
      {
        id: 'share',
        heading: '五、資料的提供與委外',
        paragraphs: ['本院於下列情形可能將資料提供予第三方：'],
        list: [
          '經你事先同意',
          '為完成你所要求之服務所必要，例如委外之網站維運或郵件寄送服務商，且該等對象受保密義務拘束',
          '依法令規定或主管機關、司法機關依法要求',
        ],
      },
      {
        id: 'security',
        heading: '六、資料安全與保存期間',
        paragraphs: [
          '本院採取合理之技術與管理措施保護所蒐集之個人資料，包含傳輸加密、存取權限控管與操作紀錄。',
          '個人資料之保存期間為蒐集目的所必要之期間，或依相關法令所定之保存年限；逾期將予以刪除或去識別化處理。',
        ],
      },
      {
        id: 'rights',
        heading: '七、你的權利',
        paragraphs: ['就本院保有之個人資料，你得依個人資料保護法規定行使下列權利：'],
        list: ['查詢或請求閱覽', '請求製給複製本', '請求補充或更正', '請求停止蒐集、處理或利用', '請求刪除'],
      },
      {
        id: 'update',
        heading: '八、政策修訂與聯絡方式',
        paragraphs: [
          '本政策如有修訂，將於本頁公告最新版本與更新日期，不另行個別通知。',
          '如對本政策有任何疑問，或欲行使前述權利，請透過<a href="/contact/">聯絡我們</a>頁面與本院聯繫。',
        ],
      },
    ],
  },
  {
    // ⚠️ mockup 沒有寫出服務條款全文（21-legal.html 的分頁切換只切到隱私權政策
    // 一份內容，另外兩份 tab 是空殼）。不自行擬定條文——法務文件寫錯比空白風險
    // 更高，這裡先留頁面骨架與待補提示，內容需由院方法務提供後填入。
    slug: 'terms',
    path: '/terms/',
    navLabel: '服務條款',
    title: '服務條款',
    updatedOn: '2026-08-01',
    sections: [],
  },
  {
    // 同上，醫療免責聲明全文亦待補。
    slug: 'medical-disclaimer',
    path: '/medical-disclaimer/',
    navLabel: '醫療免責聲明',
    title: '醫療免責聲明',
    updatedOn: '2026-08-01',
    sections: [],
  },
]

export function findLegalDocByPath(path: string): LegalDoc | undefined {
  return LEGAL_DOCS.find((doc) => doc.path === path)
}

// ─────────────────────────────────────────────────────────────────────────
// /search/ 熱門搜尋建議（mockup/19-search.html 找不到結果時的示意標籤）
// ─────────────────────────────────────────────────────────────────────────

/** ⚠️ 示意用的熱門搜尋詞，非真實統計——正式站應由站內搜尋的查詢紀錄產生。 */
export const SEARCH_SUGGESTIONS = ['皮秒雷射', '痘疤', '電波拉皮', '除毛', '肉毒', '術後保養']
