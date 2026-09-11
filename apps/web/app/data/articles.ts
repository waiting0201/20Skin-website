// 臻美分享（文章）資料。docs/08-database.md §C-4 `Articles` 的欄位對齊。
//
// 內容來源只有兩份 mockup：
//   · mockup/06-blog-list.html   —— 醫美新知分類的清單（1 精選 ＋ 10 篇卡片）
//   · mockup/07-article-detail.html —— 其中一篇（眼周）的完整內文
// 兩者都是「醫美新知」分類，所以目前只有這個分類有文章；皮膚新知／媒體報導／
// 演講授課三個分類是空的 —— 對應列表頁會顯示「尚無文章」空狀態，
// ⚠️ 不要為了填版面自己編文章。
//
// ⚠️ 醫師 slug（/team/{slug}/）目前依 public/assets/img/doctor-*.jpg 的檔名推斷
// （/team/ 由另一個 agent 建置，尚未定案）。接上真正的醫師資料後，只需要改下面
// AUTHORS 這張對照表，元件不用動。
//
// ⚠️ 內容衝突的處理方式：同一篇文章（眼周精雕）在 06／07 兩份 mockup 裡的
// 「日期」與「閱讀時間」對不上（06 寫 2026.08.10・4 分鐘；07 的 byline 寫發布
// 2026-07-28・更新 2026-08-05・審閱 2026-08-05・閱讀 6 分鐘）。這裡採 07 的版本
// 為準 —— 07 是有明確標籤（發布／更新／審閱）的完整內頁，欄位語意清楚對應
// docs/08 §C-4 的 DisplayDate／ReviewedOn，06 只是清單卡片上一個籠統的日期。
// 全站只留一份資料，兩處清單與內頁共用，不會再有兩個數字對不起來的問題。
//
// 同理，07 頁尾「相關文章」小工具裡引用的 Xeomin／Ultherapy PRIME 標題，
// 其作者與分類跟它們在 06 清單裡的正式紀錄也對不上（06：洪健睿醫師／醫美新知；
// 07 小工具：編輯部／媒體報導）。這裡不重複存第二份，「相關文章」一律用
// getRelatedArticles() 依分類即時算，資料只有一份，不會有兩邊打架的問題。

export type ArticleCategorySlug = 'medical-aesthetics' | 'dermatology' | 'media' | 'lectures'

export interface ArticleCategory {
  slug: ArticleCategorySlug
  label: string
  eyebrow: string
  /** 分類 Hero 的一句話說明。目前只有醫美新知有 mockup 原文（06-blog-list.html）。 */
  description: string
}

/** 四個分類 slug 為定案值（docs/01-sitemap.md §1、CLAUDE.md）。 */
export const ARTICLE_CATEGORIES: ArticleCategory[] = [
  {
    slug: 'medical-aesthetics',
    label: '醫美新知',
    eyebrow: 'MEDICAL AESTHETICS',
    description: '四季診所醫療團隊的新技術與品牌活動第一手紀錄，經醫師與編輯部共同確認後刊出。',
  },
  {
    slug: 'dermatology',
    label: '皮膚新知',
    eyebrow: 'DERMATOLOGY',
    description: '皮膚科臨床衛教與保養觀念整理，經醫師與編輯部共同確認內容後刊出。',
  },
  {
    slug: 'media',
    label: '媒體報導',
    eyebrow: 'MEDIA COVERAGE',
    description: '媒體採訪與報導彙整，經醫師與編輯部共同確認內容後刊出。',
  },
  {
    slug: 'lectures',
    label: '演講授課',
    eyebrow: 'LECTURES',
    description: '醫療團隊對外授課與研討會紀錄，經醫師與編輯部共同確認內容後刊出。',
  },
]

export function getArticleCategory(slug: string): ArticleCategory | undefined {
  return ARTICLE_CATEGORIES.find((c) => c.slug === slug)
}

export interface ArticleAuthor {
  /** 對應 /team/{slug}/；null 表示作者不是團隊成員（docs/08 §C-4 AuthorName）。 */
  doctorSlug: string | null
  name: string
  role?: string
  avatarSrc?: string
}

export interface ArticleReviewer {
  /** DB 的 ReviewerDoctorId 只能指向醫師，沒有「非醫師審閱」這個選項。 */
  doctorSlug: string
  name: string
  role?: string
}

// 依 mockup/11-team-list.html 的職稱＋ public/assets/img 檔名推斷（見檔頭說明）。
const AUTHORS = {
  huang: { doctorSlug: 'huang', name: '黃勇學 醫師', role: '院長・皮膚科專科醫師', avatarSrc: '/assets/img/doctor-huang.jpg' },
  linYuanfu: { doctorSlug: 'lin-yuanfu', name: '林源富 醫師', role: '肥胖醫學專科醫師', avatarSrc: '/assets/img/doctor-lin-yuanfu.jpg' },
  chung: { doctorSlug: 'chung', name: '鍾佩宜 醫師', role: '皮膚科專科醫師', avatarSrc: '/assets/img/doctor-chung.jpg' },
  hung: { doctorSlug: 'hung', name: '洪健睿 醫師', role: '二林四季皮膚科主治醫師', avatarSrc: '/assets/img/doctor-hung.jpg' },
  chao: { doctorSlug: 'chao', name: '趙映程 醫師', role: '皮膚科專科醫師', avatarSrc: '/assets/img/doctor-chao.jpg' },
  yangLanyi: { doctorSlug: 'yang-lanyi', name: '楊嵐怡 醫師', role: '肥胖醫學會醫師', avatarSrc: '/assets/img/doctor-yang-lanyi.jpg' },
} satisfies Record<string, ArticleAuthor>

export interface ArticleTagRef {
  slug: string
  label: string
}

/** 側欄「熱門標籤」（mockup/06-blog-list.html）。 */
export const POPULAR_TAGS: ArticleTagRef[] = [
  { slug: 'botox', label: '肉毒桿菌' },
  { slug: 'hyaluronic-acid', label: '玻尿酸' },
  { slug: 'thermage', label: '電波拉提' },
  { slug: 'picosecond-laser', label: '皮秒雷射' },
  { slug: 'phototherapy', label: '光療美顏' },
  { slug: 'aftercare', label: '術後保養' },
  { slug: 'anti-aging-topic', label: '抗老緊緻' },
  { slug: 'brand-event', label: '品牌活動' },
]

export function getTagLabel(slug: string): string {
  return POPULAR_TAGS.find((t) => t.slug === slug)?.label ?? slug
}

export interface ArticleImage {
  src: string
  alt: string
  width: number
  height: number
}

export type ArticleBodyBlock =
  | { type: 'lead'; text: string }
  | { type: 'heading'; level: 2 | 3; id?: string; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'figure'; image: ArticleImage; caption: string; wide?: boolean }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'note'; variant: 'info' | 'warn'; text: string }

export interface RelatedTreatmentRef {
  slug: string
  categorySlug: string
  categoryLabel: string
  name: string
  image: ArticleImage
}

export interface RelatedConcernRef {
  slug: string
  label: string
}

export interface Article {
  slug: string
  title: string
  categorySlug: ArticleCategorySlug
  tags: ArticleTagRef[]
  author: ArticleAuthor
  reviewer?: ArticleReviewer
  /** ISO 日期字串。 */
  reviewedOn?: string
  /** 對外顯示日期（docs/08 §C-4 DisplayDate）。⚠️ 不是排程用的 PublishAt。 */
  displayDate: string
  /** 供 JSON-LD dateModified；沒有修訂過就與 displayDate 相同。 */
  dateModified?: string
  cover: ArticleImage
  /** 卡片摘要（DB: Articles.Summary）。 */
  summary: string
  /** SEO meta description（DB: SeoMeta.MetaDescription）。留空退回 summary。 */
  metaDescription?: string
  /** AI 摘要，40–60 字直答式（DB: SeoMeta.AiSummary），渲染成內頁第一段可見文字。留空退回 summary。 */
  aiSummary?: string
  readingMinutes: number
  featured?: boolean
  body?: ArticleBodyBlock[]
  relatedTreatments?: RelatedTreatmentRef[]
  relatedConcerns?: RelatedConcernRef[]
  authorBio?: string
}

export const ARTICLES: Article[] = [
  {
    slug: 'eye-area-sculpting',
    title: '素顏也不怕！眼周精雕打造晶亮美眸',
    categorySlug: 'medical-aesthetics',
    featured: true,
    tags: [
      { slug: 'eye-area', label: '眼周' },
      { slug: 'fine-lines', label: '細紋' },
      { slug: 'hyaluronic-acid', label: '玻尿酸' },
      { slug: 'botox', label: '肉毒' },
      { slug: 'anti-aging-topic', label: '抗老' },
    ],
    author: AUTHORS.huang,
    reviewer: { doctorSlug: AUTHORS.huang.doctorSlug!, name: AUTHORS.huang.name, role: AUTHORS.huang.role },
    reviewedOn: '2026-08-05',
    displayDate: '2026-07-28',
    dateModified: '2026-08-05',
    cover: {
      src: '/assets/img/stock-facial-calm.jpg',
      alt: '閉眼特寫，眼周保養情境示意',
      width: 1800,
      height: 1199,
    },
    summary: '從基礎保養到精緻療程，找到適合自己的眼周保養節奏。',
    metaDescription:
      '眼周細紋、眼袋與淚溝成因不同，本文整理眼周老化原因、常見困擾差異、可能的療程方向與術後注意事項，由黃勇學醫師審閱。',
    aiSummary:
      '眼周是全臉皮膚最薄、最早顯現老化徵兆的區域。從細紋、眼袋到淚溝，成因各不相同，這篇文章整理基礎保養重點與可能的療程方向，幫助讀者在諮詢醫師前先建立正確認識。',
    readingMinutes: 6,
    relatedConcerns: [
      { slug: 'anti-aging', label: '抗老・緊緻' },
      { slug: 'acne', label: '痘痘・粉刺' },
    ],
    relatedTreatments: [
      {
        slug: 'picosure-pro',
        categorySlug: 'laser',
        categoryLabel: '光療美顏',
        name: 'Picosure® Pro 鉑金版蜂巢皮秒雷射',
        image: { src: '/assets/img/product-p01.png', alt: 'Picosure Pro 鉑金版蜂巢皮秒雷射機台', width: 550, height: 550 },
      },
      {
        slug: 'xeomin',
        categorySlug: 'microneedle',
        categoryLabel: '微針美容',
        name: 'Xeomin 新一代天使肉毒',
        image: { src: '/assets/img/product-p05.png', alt: 'Xeomin 新一代天使肉毒產品', width: 550, height: 550 },
      },
      {
        slug: 'restylane',
        categorySlug: 'microneedle',
        categoryLabel: '微針美容',
        name: 'Restylane 瑞絲朗／彈麗玻',
        image: { src: '/assets/img/product-p04.png', alt: 'Restylane 瑞絲朗／彈麗玻產品', width: 550, height: 550 },
      },
    ],
    authorBio: '長期投入皮膚科臨床與雷射光電治療，擅長依個人膚況規劃保養與療程方向，強調自然協調而非單一標準樣貌。',
    body: [
      {
        type: 'lead',
        text: '眼周皮膚厚度只有臉頰的三分之一，油脂分泌少、微血管與淋巴循環也相對脆弱，是全臉最早出現細紋、暗沉與鬆弛徵兆的區域。這篇文章整理眼周老化的成因、常見困擾的差異，以及可能的保養與療程方向，幫助讀者在諮詢醫師前先建立基礎認識。',
      },
      { type: 'heading', level: 2, id: 'why-ages-faster', text: '眼周為什麼比其他部位更快顯老？' },
      { type: 'paragraph', text: '眼周皮膚平均厚度約0.5毫米，只有臉頰皮膚的三分之一左右，皮下脂肪與膠原蛋白含量也偏低，因此對外界刺激與地心引力的抵抗力較弱。' },
      { type: 'paragraph', text: '眼周周圍幾乎沒有皮脂腺，天然皮脂膜的保護與保濕能力有限，水分容易散失，久而久之角質層變得乾燥，細紋也更容易顯現。' },
      { type: 'paragraph', text: '眨眼動作平均一天超過一萬次，眼輪匝肌反覆收縮牽動皮膚，長期下來容易在眼尾與下眼瞼形成動態紋，若合併日曬與作息不規律，老化徵兆通常會提早出現。' },
      {
        type: 'figure',
        wide: true,
        image: { src: '/assets/img/stock-clinical-hands.jpg', alt: '戴手套進行臉部保養操作，情境示意', width: 1800, height: 1197 },
        caption: '無論選擇哪一種療程，實際做法都需要經醫師評估後執行。',
      },
      { type: 'heading', level: 2, id: 'types-different', text: '眼周細紋、眼袋、淚溝有什麼不同？' },
      { type: 'paragraph', text: '眼周常見的困擾其實成因各不相同，混為一談容易讓保養或療程規劃失焦。下表整理三種常見困擾的主要成因與可能對應方向，實際狀況仍需經醫師面診評估。' },
      {
        type: 'table',
        headers: ['困擾類型', '常見成因', '可能對應方向'],
        rows: [
          ['細紋', '皮膚乾燥、表情肌反覆收縮、膠原蛋白流失', '加強保濕防曬，可與醫師討論居家保養或光電相關療程'],
          ['眼袋', '眼周脂肪膨出，或皮膚鬆弛下垂', '依成因不同，建議與醫師討論適合的處理方向'],
          ['淚溝', '眼眶下緣骨骼與軟組織凹陷、皮下脂肪流失', '可與醫師討論填充相關療程，實際適用需經評估'],
        ],
      },
      { type: 'heading', level: 3, text: '靜態紋與動態紋有何不同？' },
      { type: 'paragraph', text: '動態紋是做表情時才出現的紋路，例如微笑時眼尾浮現的細紋，通常在放鬆後會逐漸淡化；靜態紋則是即使臉部放鬆也持續存在的紋路，多半與皮膚彈性流失有關，兩者在保養與療程規劃的優先順序上會有所不同。' },
      { type: 'heading', level: 2, id: 'treatment-options', text: '眼周可以做哪些療程？' },
      { type: 'paragraph', text: '眼周療程選項相當多元，從居家保養到門診光電、微整形都有對應做法，實際適合的組合需由醫師依個人膚況、困擾類型與生活型態綜合評估後規劃，下列僅為常見方向的概略整理。' },
      { type: 'heading', level: 3, text: '光電與微整形類' },
      {
        type: 'list',
        ordered: false,
        items: [
          '皮秒雷射：常見於細紋與膚質相關的討論方向，實際效果與所需次數依個人膚況而異',
          '電波拉皮：訴求緊緻與支撐力，常見於眼周鬆弛的討論方向',
          '玻尿酸填充：可與醫師討論用於淚溝凹陷的支撐',
          '肉毒桿菌素：常用於討論動態紋的處理方向',
        ],
      },
      { type: 'heading', level: 3, text: '居家與日常保養類' },
      {
        type: 'list',
        ordered: true,
        items: [
          '選用質地溫和、經測試不易刺激眼周的保養品',
          '白天確實使用防曬，降低光老化對眼周的影響',
          '避免用力搓揉或拉扯眼周皮膚',
          '維持規律作息，減少熬夜造成的循環不佳與浮腫',
        ],
      },
      { type: 'heading', level: 2, id: 'aftercare', text: '眼周療程術後要注意什麼？' },
      { type: 'paragraph', text: '無論選擇哪一種療程，術後照護都會直接影響恢復狀況與皮膚穩定度。以下整理幾個常見的注意方向，實際照護建議仍以醫師當次診斷與衛教說明為準。' },
      {
        type: 'list',
        ordered: true,
        items: [
          '依醫師指示做好防曬，避免直接曝曬眼周',
          '保持治療部位清潔，避免用手直接觸碰或搓揉',
          '若有輕微紅腫或不適，可與診所確認是否為正常反應',
          '按照回診時間追蹤恢復狀況，讓醫師評估後續保養方向',
        ],
      },
      {
        type: 'note',
        variant: 'info',
        text: '眼周皮膚較薄，術後保養請務必依醫師指示執行；若出現持續不適或異常反應，請儘速回診諮詢，勿自行停藥或另行處置。',
      },
      { type: 'heading', level: 2, id: 'who-should-avoid', text: '什麼情況不適合做眼周療程？' },
      { type: 'paragraph', text: '並非所有人在任何時間點都適合進行眼周療程，以下幾種情況建議先與醫師充分討論，由醫師評估是否適合、或是否需要調整時機與做法。' },
      {
        type: 'list',
        ordered: false,
        items: [
          '眼周皮膚有發炎、感染或傷口尚未癒合',
          '懷孕或哺乳期間，部分療程需暫緩',
          '有特定慢性病史或凝血功能相關疾病，尚未告知醫師',
          '近期眼周曾接受手術，仍在恢復期內',
        ],
      },
      {
        type: 'note',
        variant: 'warn',
        text: '以上僅為常見注意情況的概略整理，並非完整禁忌清單。是否適合進行療程，仍需由醫師親自問診、評估病史與現況後判斷，請勿自行判斷是否適用。',
      },
    ],
  },
  {
    slug: 'xeomin-angel-botox',
    title: 'Xeomin 德國天使肉毒｜美得純淨無瑕，更精準、更快速、更安全',
    categorySlug: 'medical-aesthetics',
    tags: [{ slug: 'botox', label: '肉毒桿菌' }],
    author: AUTHORS.linYuanfu,
    displayDate: '2026-08-03',
    cover: { src: '/assets/img/index-p02.jpg', alt: 'Xeomin德國天使肉毒文章封面', width: 480, height: 300 },
    summary: '認識新一代肉毒桿菌素的作用原理與臨床施打觀察重點。',
    readingMinutes: 5,
  },
  {
    slug: 'profhilo-taiwan-launch',
    title: '全球熱銷超過 90 國 PROFHILO 逆時針．正式進駐四季診所',
    categorySlug: 'medical-aesthetics',
    tags: [{ slug: 'hyaluronic-acid', label: '玻尿酸' }, { slug: 'brand-event', label: '品牌活動' }],
    author: AUTHORS.chung,
    displayDate: '2026-07-22',
    cover: { src: '/assets/img/banner2.jpg', alt: 'PROFHILO逆時針進駐四季診所文章封面', width: 480, height: 300 },
    summary: '認識具生物再生特性的複合型玻尿酸如何應用於臨床評估。',
    readingMinutes: 4,
  },
  {
    slug: 'ultherapy-prime-seoul',
    title: 'Ultherapy PRIME 韓國首爾上市記者會',
    categorySlug: 'medical-aesthetics',
    tags: [{ slug: 'brand-event', label: '品牌活動' }],
    author: AUTHORS.hung,
    displayDate: '2026-07-09',
    cover: { src: '/assets/img/index-p04.jpg', alt: 'Ultherapy PRIME韓國首爾記者會文章封面', width: 480, height: 300 },
    summary: '四季診所受邀出席海外品牌發表活動，掌握第一手技術資訊。',
    readingMinutes: 3,
  },
  {
    slug: 'ultraclear-launch-event',
    title: 'UltraClear 上市發表會｜堅持追求醫美新科技',
    categorySlug: 'medical-aesthetics',
    tags: [{ slug: 'brand-event', label: '品牌活動' }, { slug: 'phototherapy', label: '光療美顏' }],
    author: AUTHORS.chao,
    displayDate: '2026-06-28',
    cover: { src: '/assets/img/stock-stones.jpg', alt: '黑白疊石，水墨感意象', width: 1800, height: 1199 },
    summary: '記錄新科技發表活動的機台原理與臨床應用重點。',
    readingMinutes: 3,
  },
  {
    slug: 'post-laser-recovery-habits',
    title: '雷射術後修復期：三個你該放進日常保養的習慣',
    categorySlug: 'medical-aesthetics',
    tags: [{ slug: 'aftercare', label: '術後保養' }, { slug: 'picosecond-laser', label: '皮秒雷射' }],
    author: AUTHORS.yangLanyi,
    displayDate: '2026-06-14',
    cover: { src: '/assets/img/product-p01.png', alt: '雷射術後修復保養文章封面', width: 550, height: 550 },
    summary: '整理術後肌膚在修復期間需要留意的保養細節。',
    readingMinutes: 4,
  },
  {
    slug: 'hyaluronic-acid-faq',
    title: '玻尿酸填充常見疑問：醫師來解答',
    categorySlug: 'medical-aesthetics',
    tags: [{ slug: 'hyaluronic-acid', label: '玻尿酸' }],
    author: AUTHORS.linYuanfu,
    displayDate: '2026-05-30',
    cover: { src: '/assets/img/product-p05.png', alt: '玻尿酸填充常見疑問文章封面', width: 580, height: 580 },
    summary: '整理求美者在諮詢時最常提出的問題與醫師解答。',
    readingMinutes: 5,
  },
  {
    slug: 'thermage-mechanism',
    title: '電波拉提原理解析：熱能如何作用於真皮層',
    categorySlug: 'medical-aesthetics',
    tags: [{ slug: 'thermage', label: '電波拉提' }],
    author: AUTHORS.chung,
    displayDate: '2026-05-18',
    cover: { src: '/assets/img/product-p13.png', alt: '電波拉提原理解析文章封面', width: 550, height: 550 },
    summary: '說明電波類療程在臨床上的作用層次與應用邏輯。',
    readingMinutes: 6,
  },
  {
    slug: 'picosecond-vs-toning-laser',
    title: '淨膚雷射與皮秒雷射，差別在哪裡？',
    categorySlug: 'medical-aesthetics',
    tags: [{ slug: 'picosecond-laser', label: '皮秒雷射' }],
    author: AUTHORS.hung,
    displayDate: '2026-05-05',
    cover: { src: '/assets/img/product-p16.png', alt: '淨膚雷射與皮秒雷射比較文章封面', width: 550, height: 550 },
    summary: '整理兩種雷射適用的膚況差異與評估方式。',
    readingMinutes: 4,
  },
  {
    slug: 'botox-injection-areas',
    title: '肉毒桿菌施打部位解析：不只除皺這麼簡單',
    categorySlug: 'medical-aesthetics',
    tags: [{ slug: 'botox', label: '肉毒桿菌' }],
    author: AUTHORS.chao,
    displayDate: '2026-04-21',
    cover: { src: '/assets/img/product-p22.png', alt: '肉毒桿菌施打部位解析文章封面', width: 550, height: 550 },
    summary: '說明肉毒桿菌素在不同部位的應用邏輯。',
    readingMinutes: 4,
  },
  {
    slug: 'consultation-prep-tips',
    title: '醫美諮詢前的準備：如何與醫師溝通你的期待',
    categorySlug: 'medical-aesthetics',
    tags: [{ slug: 'anti-aging-topic', label: '抗老緊緻' }],
    author: AUTHORS.yangLanyi,
    displayDate: '2026-04-08',
    cover: { src: '/assets/img/stock-camellia.jpg', alt: '白山茶花特寫，季節感意象', width: 1800, height: 1199 },
    summary: '整理諮詢前可以先準備的肌膚紀錄與需求描述。',
    readingMinutes: 3,
  },
]

/** 側欄「熱門療程」（mockup/06-blog-list.html）。slug／分類對照 docs/01-sitemap.md §1 的定案清單。 */
export const POPULAR_TREATMENTS_FOR_BLOG: RelatedTreatmentRef[] = [
  {
    slug: 'picosure-pro',
    categorySlug: 'laser',
    categoryLabel: '光療美顏',
    name: 'Picosure® Pro 鉑金版蜂巢皮秒雷射',
    image: { src: '/assets/img/product-p20.png', alt: 'Picosure Pro鉑金版蜂巢皮秒雷射機台', width: 200, height: 200 },
  },
  {
    slug: 'thermage-flx',
    categorySlug: 'photoelectric',
    categoryLabel: '光電美容',
    name: 'Thermage FLX 鳳凰電波',
    image: { src: '/assets/img/product-p13.png', alt: 'Thermage FLX鳳凰電波機台', width: 200, height: 200 },
  },
  {
    slug: 'sculptra',
    categorySlug: 'microneedle',
    categoryLabel: '微針美容',
    name: 'Sculptra 舒顏萃 4D聚左旋乳酸',
    image: { src: '/assets/img/product-p03.png', alt: 'Sculptra舒顏萃4D聚左旋乳酸產品', width: 200, height: 200 },
  },
]

function byDisplayDateDesc(a: Article, b: Article) {
  return b.displayDate.localeCompare(a.displayDate)
}

export function getArticleBySlug(slug: string): Article | undefined {
  return ARTICLES.find((a) => a.slug === slug)
}

export function listAllArticles(): Article[] {
  return [...ARTICLES].sort(byDisplayDateDesc)
}

export function listArticlesByCategory(categorySlug: ArticleCategorySlug): Article[] {
  return ARTICLES.filter((a) => a.categorySlug === categorySlug).sort(byDisplayDateDesc)
}

export function listArticlesByTag(tagSlug: string): Article[] {
  return ARTICLES.filter((a) => a.tags.some((t) => t.slug === tagSlug)).sort(byDisplayDateDesc)
}

/** 同分類、排除自己，取最新 N 篇（頁尾「相關文章」用，見檔頭說明）。 */
export function getRelatedArticles(article: Article, limit = 3): Article[] {
  return ARTICLES.filter((a) => a.categorySlug === article.categorySlug && a.slug !== article.slug)
    .sort(byDisplayDateDesc)
    .slice(0, limit)
}

/** 'YYYY-MM-DD' → 'YYYY.MM.DD'，卡片與 byline 的顯示格式（JSON-LD 一律用原始 ISO 字串）。 */
export function formatDisplayDate(iso: string): string {
  return iso.replaceAll('-', '.')
}
