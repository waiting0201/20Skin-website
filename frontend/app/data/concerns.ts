// 肌膚困擾資料 —— 對應 docs/08-database.md §C-3 Concerns。
//
// 正式站這份資料來自後台「困擾」內容模型，建置期匯出成 content/*.json。
// 現階段先寫死，內容取自 mockup/13-concern-overview.html 與 mockup/02-concern-detail.html
// （逐字照抄，不自行編寫醫療內容 —— 見 frontend/README.md）。
//
// 8 個 slug 已由 docs/01-sitemap.md §1 定案：
// acne／sensitive-skin／pigmentation／anti-aging／hair-loss／hair-removal／hyperhidrosis／dermatology。
//
// ⚠️ mockup 只做了 acne 一頁的完整內容（症狀、成因、自我判斷、FAQ、案例延伸閱讀等）。
// 其餘 7 個困擾目前只有總覽頁上的簡述可用，`detail` 欄位刻意留空 —— 不要自己補完整內容，
// 等後台真正寫好這些困擾的醫療文案後再補上。concerns/[slug].vue 對沒有 `detail` 的困擾
// 只渲染精簡版（頁首＋簡述＋前往療程總覽），不渲染 mockup 完整版的區塊。

export interface ConcernFact {
  label: string
  text: string
}

export interface ConcernType {
  title: string
  points: string[]
  direction: string
}

export interface Image {
  src: string
  alt: string
  width: number
  height: number
}

export interface ConcernTreatmentRec {
  key: string
  name: string
  href: string
  image: Image
  categoryLabel: string
  fitTag?: string
  topPick?: boolean
  excerpt: string
}

export interface ConcernDoctorRef {
  name: string
  role: string
  href: string | null
  image: Image
}

export interface ConcernFaqItem {
  q: string
  a: string
}

export interface ConcernArticleRef {
  title: string
  href: string
  tag: string
  image: Image
  meta: string[]
  excerpt?: string
}

export interface ConcernDetail {
  symptomHeading: string
  symptomMedia: Image
  symptomParagraphs: string[]
  causesHeading: string
  causesIntro: string
  causesFacts: ConcernFact[]
  selfCheckHeading: string
  selfCheckIntro: string
  types: ConcernType[]
  warnHeading: string
  warnItems: string[]
  treatmentsIntro: string
  treatmentsNote: string
  treatments: ConcernTreatmentRec[]
  doctorsIntro: string
  doctors: ConcernDoctorRef[]
  faqUpdated: string
  faqs: ConcernFaqItem[]
  articles: ConcernArticleRef[]
}

export interface Concern {
  slug: string
  title: string
  eyebrow: string
  icon: { src: string; alt: string }
  /** 總覽頁卡片的一句話簡述，來自 13-concern-overview.html。 */
  overviewDesc: string
  overviewTags: string[]
  /** AI 摘要：40–60 字直答式段落，渲染成頁面第一段可見文字（docs/03-seo-geo.md §4 ②）。 */
  aiSummary: string
  lede: string
  relatedConcernSlugs: string[]
  heroImage: Image
  detail?: ConcernDetail
}

export const CONCERNS: Concern[] = [
  {
    slug: 'acne',
    title: '痘痘・粉刺',
    eyebrow: 'SKIN CONCERN',
    icon: { src: '/assets/img/spec-01.png', alt: '痘痘・粉刺 科別圖示' },
    overviewDesc: '從閉鎖性粉刺、丘疹膿皰到囊腫結節與後續的痘疤痘印，成因與處理方向都不相同。',
    overviewTags: ['粉刺', '痘痘反覆', '痘疤', '痘印'],
    aiSummary:
      '痘痘是毛囊皮脂腺發炎的皮膚問題，從粉刺、丘疹膿皰到囊腫結節與痘疤，型態與照護方向皆不同。',
    lede: '從粉刺、丘疹到痘疤痘印，先看懂成因與型態，再談適合的療程方向。',
    relatedConcernSlugs: ['sensitive-skin', 'pigmentation', 'anti-aging'],
    heroImage: {
      src: '/assets/img/stock-clinical-hands.jpg',
      alt: '戴手套進行肌膚檢視的療程操作情境',
      width: 1800,
      height: 1197,
    },
    detail: {
      symptomHeading: '痘痘和粉刺有什麼不同？',
      symptomMedia: {
        src: '/assets/img/stock-skincare-smile.jpg',
        alt: '日常清潔與保養情境',
        width: 1800,
        height: 1199,
      },
      symptomParagraphs: [
        '粉刺是毛孔遭皮脂與角質堵塞後的初期狀態，尚未明顯發炎。痤瘡桿菌增生、引發免疫反應後，才進一步發展為紅腫丘疹、膿皰，甚至有痛感的囊腫結節。',
        '粉刺是痘痘的前身，兩者屬於同一發炎光譜上的不同階段，照護方向也隨嚴重程度而不同。',
      ],
      causesHeading: '為什麼會長痘痘？',
      causesIntro: '通常不是單一原因，而是以下四項因素交互作用的結果。',
      causesFacts: [
        { label: '角質代謝異常', text: '老廢角質代謝不順，堵塞毛孔開口，是形成粉刺的起點。' },
        { label: '皮脂分泌過多', text: '皮脂腺受荷爾蒙刺激分泌旺盛，油脂堆積於毛囊內，加重堵塞。' },
        { label: '痤瘡桿菌增生', text: '毛囊阻塞後形成缺氧環境，有利痤瘡桿菌大量增生。' },
        { label: '發炎反應', text: '免疫系統對痤瘡桿菌代謝物產生發炎反應，形成紅腫丘疹或膿皰。' },
      ],
      selfCheckHeading: '我的痘痘屬於哪一型？',
      selfCheckIntro: '依外觀與嚴重程度，痘痘與粉刺大致可分為以下四種型態，可先初步對照，實際狀況仍建議由醫師判斷。',
      types: [
        {
          title: '粉刺型',
          points: ['毛孔阻塞形成白頭或黑頭', '通常不紅腫、無明顯痛感', '好發於額頭、鼻翼與下巴周圍'],
          direction: '著重深層清潔與角質代謝，以日常保養為主。',
        },
        {
          title: '丘疹膿皰型',
          points: ['出現紅色丘疹或黃白膿皰', '按壓多有痛感或搔癢', '好發於臉頰、下顎與胸背'],
          direction: '需搭配發炎控制，建議諮詢醫師評估用藥或療程。',
        },
        {
          title: '囊腫結節型',
          points: ['皮下觸摸有明顯硬塊', '範圍較深、較大，易反覆發作', '發炎程度較高，易遺留痘疤'],
          direction: '屬於較嚴重型態，建議及早就醫評估，避免自行處理。',
        },
        {
          title: '痘疤與痘印',
          points: ['發炎痘痘消退後遺留的痕跡', '可能為色素沉澱或凹陷疤痕', '型態不同，適用療程方向也不同'],
          direction: '依疤痕型態選擇對應的雷射或換膚療程，需經醫師評估。',
        },
      ],
      warnHeading: '什麼情況該看皮膚科？',
      warnItems: [
        '痘痘反覆發炎化膿、觸摸有明顯痛感',
        '出現大範圍囊腫或結節，且持續數週未消退',
        '自行擠壓後傷口感染、紅腫惡化',
        '痘疤範圍持續擴大，或伴隨明顯色素沉澱',
      ],
      treatmentsIntro: '以下依適合度排序，涵蓋粉刺日常保養到痘疤修復的不同階段，可作為與醫師討論的參考起點。',
      treatmentsNote: '實際適用療程需經醫師面診評估，依個人膚況調整建議組合與頻率。',
      treatments: [
        {
          key: 'picosure-pro',
          name: 'Picosure® Pro 鉑金版蜂巢皮秒雷射',
          href: '/treatments/laser/picosure-pro/',
          image: { src: '/assets/img/product-p01.png', alt: 'Picosure Pro 鉑金版蜂巢皮秒雷射機台', width: 550, height: 550 },
          categoryLabel: '光療美顏',
          fitTag: '適合：痘疤與痘印型',
          topPick: true,
          excerpt: '針對痘疤凹陷與痘印色素沉澱，有助於改善痘疤外觀與膚色均勻度。',
        },
        {
          key: 'er-yag',
          name: 'Er:YAG 鉺雅鉻雷射',
          href: '/treatments/laser/er-yag/',
          image: { src: '/assets/img/product-p02.png', alt: 'Er:YAG 鉺雅鉻雷射機台', width: 550, height: 550 },
          categoryLabel: '光療美顏',
          fitTag: '適合：痘疤與痘印型',
          excerpt: '處理凹陷性痘疤的表層重整，改善膚況粗糙不平整。',
        },
        {
          key: 'neostrata-peel',
          name: 'Neostrata 果酸換膚',
          href: '/treatments/skincare/neostrata-peel/',
          image: { src: '/assets/img/product-p10.png', alt: 'Neostrata 果酸換膚產品', width: 550, height: 550 },
          categoryLabel: '醫美保養',
          fitTag: '適合：粉刺型',
          excerpt: '加速角質代謝，有助於粉刺型痘痘的日常控油與角質調理。',
        },
        {
          key: 'hydrafacial',
          name: 'HydraFacial 海菲秀',
          href: '/treatments/skincare/hydrafacial/',
          image: { src: '/assets/img/product-p16.png', alt: 'HydraFacial 海菲秀機台', width: 550, height: 550 },
          categoryLabel: '醫美保養',
          fitTag: '適合：粉刺型',
          excerpt: '深層清潔與粉刺清除，適合作為日常保養型的基礎照護。',
        },
        {
          key: 'potenza',
          name: 'POTENZA 無限電波',
          href: '/treatments/photoelectric/potenza/',
          image: { src: '/assets/img/product-p22.png', alt: 'POTENZA 無限電波機台', width: 550, height: 550 },
          categoryLabel: '光電美容',
          fitTag: '適合：痘疤與痘印型',
          excerpt: '改善痘疤與毛孔粗大，有助於緊緻膚質紋理。',
        },
      ],
      doctorsIntro: '以下醫師於此困擾相關療程有臨床經驗，可於面診時進一步討論個人膚況。',
      doctors: [
        {
          name: '黃勇學',
          role: '院長・皮膚科專科醫師',
          href: '/team/huang/',
          image: { src: '/assets/img/doctor-huang.jpg', alt: '黃勇學 院長', width: 700, height: 1021 },
        },
        {
          name: '鍾佩宜',
          role: '醫師',
          href: null,
          image: { src: '/assets/img/doctor-chung.jpg', alt: '鍾佩宜 醫師', width: 700, height: 1051 },
        },
      ],
      faqUpdated: '最後更新：2026-08',
      faqs: [
        {
          q: '痘痘可以自己擠嗎？',
          a: '不建議自行擠壓，容易造成傷口感染、發炎範圍擴大，也可能留下明顯痘疤或色素沉澱。若痘痘反覆發炎或已形成膿皰、囊腫，建議由醫師評估後處理，日常則以溫和清潔與保濕為主。',
        },
        {
          q: '痘疤療程要做幾次？',
          a: '建議次數依疤痕型態、深淺與個人膚況而定，並非固定套用在每個人身上，需由醫師實際檢視後規劃療程組合與間隔。詳細可參考 Picosure® Pro 鉑金版蜂巢皮秒雷射，並於面診時進一步討論。',
        },
        {
          q: '口服A酸期間可以做雷射嗎？',
          a: '服藥期間皮膚屏障較脆弱、對光敏感度也較高，是否適合同時進行雷射需由醫師評估，不建議自行安排。回診時請主動告知目前用藥情況，由醫師判斷合適的時機與間隔。',
        },
        {
          q: '痘痘肌可以化妝嗎？',
          a: '可以，但建議選擇質地清爽、不易致粉刺的產品，並確實卸妝與清潔，避免殘留堵塞毛孔。若正處於發炎化膿或傷口未癒合階段，建議先減少局部上妝。',
        },
        {
          q: '生理期前爆痘正常嗎？',
          a: '生理期前荷爾蒙波動會使皮脂分泌增加，是常見現象，多能隨月經來潮後緩解。但若範圍持續擴大或發炎加劇，建議進一步就診評估。',
        },
        {
          q: '痘痘和飲食有關係嗎？',
          a: '飲食是可能的影響因素之一，部分研究指出高升糖飲食與乳製品攝取有一定關聯，但影響程度因人而異。建議搭配規律作息與正確清潔，並依個人膚況諮詢醫師。',
        },
      ],
      articles: [
        {
          title: '痘痘反覆長不停？從角質代謝看懂根本原因',
          href: '/blog/dermatology/',
          tag: '皮膚新知',
          image: { src: '/assets/img/index-p01.jpg', alt: '痘痘反覆長不停相關文章封面', width: 480, height: 230 },
          meta: ['黃勇學 院長', '2026.07.20', '5 分鐘閱讀'],
          excerpt: '從角質代謝與皮脂分泌切入，了解痘痘反覆發作的常見機轉。',
        },
        {
          title: '痘疤修復期的保養重點整理',
          href: '/blog/dermatology/',
          tag: '皮膚新知',
          image: { src: '/assets/img/index-p02.jpg', alt: '痘疤修復期保養重點相關文章封面', width: 480, height: 230 },
          meta: ['鍾佩宜 醫師', '2026.06.30', '4 分鐘閱讀'],
          excerpt: '療程後的居家照護與防曬習慣，如何幫助修復期更順利。',
        },
        {
          title: '粉刺型痘痘的日常清潔迷思',
          href: '/blog/dermatology/',
          tag: '皮膚新知',
          image: { src: '/assets/img/index-p03.jpg', alt: '粉刺型痘痘清潔迷思相關文章封面', width: 480, height: 230 },
          meta: ['編輯部', '2026.06.05', '3 分鐘閱讀'],
          excerpt: '過度清潔未必有效，釐清粉刺照護常見的錯誤觀念。',
        },
        {
          title: '口服A酸療程期間該注意的照護細節',
          href: '/blog/medical-aesthetics/',
          tag: '醫美新知',
          image: { src: '/assets/img/index-p04.jpg', alt: '口服A酸照護細節相關文章封面', width: 480, height: 230 },
          meta: ['林源富 醫師', '2026.05.18', '4 分鐘閱讀'],
          excerpt: '用藥期間的防曬、保濕與療程安排，整理常見注意事項。',
        },
      ],
    },
  },
  {
    slug: 'sensitive-skin',
    title: '敏感肌',
    eyebrow: 'SKIN CONCERN',
    icon: { src: '/assets/img/spec-02.png', alt: '敏感肌 科別圖示' },
    overviewDesc: '泛紅、刺癢、換季就不穩定。先判斷是暫時性的屏障受損，還是需要處理的皮膚疾病。',
    overviewTags: ['泛紅', '刺痛', '乾燥脫屑', '酒糟'],
    aiSummary: '泛紅、刺癢、換季就不穩定。先判斷是暫時性的屏障受損，還是需要處理的皮膚疾病。',
    lede: '泛紅、刺癢、換季就不穩定。先判斷是暫時性的屏障受損，還是需要處理的皮膚疾病。',
    relatedConcernSlugs: ['acne', 'pigmentation', 'dermatology'],
    heroImage: {
      src: '/assets/img/stock-facial-calm.jpg',
      alt: '臉部特寫，光療與肌膚意象',
      width: 1800,
      height: 1199,
    },
  },
  {
    slug: 'pigmentation',
    title: '斑點・色素沉澱',
    eyebrow: 'SKIN CONCERN',
    icon: { src: '/assets/img/spec-03.png', alt: '斑點・色素沉澱 科別圖示' },
    overviewDesc: '曬斑、肝斑與發炎後色素沉澱在深淺與成因上差很多，處理方式也不能一概而論。',
    overviewTags: ['曬斑', '肝斑', '雀斑', '膚色不均'],
    aiSummary: '曬斑、肝斑與發炎後色素沉澱在深淺與成因上差很多，處理方式也不能一概而論。',
    lede: '曬斑、肝斑與發炎後色素沉澱在深淺與成因上差很多，處理方式也不能一概而論。',
    relatedConcernSlugs: ['acne', 'anti-aging', 'sensitive-skin'],
    heroImage: {
      src: '/assets/img/stock-garden-window.jpg',
      alt: '以開窗取景的庭園意象',
      width: 1800,
      height: 1199,
    },
  },
  {
    slug: 'anti-aging',
    title: '抗老・緊緻',
    eyebrow: 'SKIN CONCERN',
    icon: { src: '/assets/img/spec-04.png', alt: '抗老・緊緻 科別圖示' },
    overviewDesc: '細紋、鬆弛與輪廓下垂通常同時發生，需要分層評估支撐力與皮膚彈性。',
    overviewTags: ['細紋', '鬆弛', '法令紋', '輪廓'],
    aiSummary: '細紋、鬆弛與輪廓下垂通常同時發生，需要分層評估支撐力與皮膚彈性。',
    lede: '細紋、鬆弛與輪廓下垂通常同時發生，需要分層評估支撐力與皮膚彈性。',
    relatedConcernSlugs: ['pigmentation', 'sensitive-skin', 'acne'],
    heroImage: {
      src: '/assets/img/stock-camellia.jpg',
      alt: '白山茶花特寫，季節感意象',
      width: 1800,
      height: 1199,
    },
  },
  {
    slug: 'hair-loss',
    title: '生髮・落髮',
    eyebrow: 'SKIN CONCERN',
    icon: { src: '/assets/img/spec-05.png', alt: '生髮・落髮 科別圖示' },
    overviewDesc: '落髮的原因包含雄性禿、休止期落髮與頭皮發炎，先確認類型才知道能不能處理。',
    overviewTags: ['雄性禿', '髮量稀疏', '頭皮出油', '產後落髮'],
    aiSummary: '落髮的原因包含雄性禿、休止期落髮與頭皮發炎，先確認類型才知道能不能處理。',
    lede: '落髮的原因包含雄性禿、休止期落髮與頭皮發炎，先確認類型才知道能不能處理。',
    relatedConcernSlugs: ['hyperhidrosis', 'dermatology', 'anti-aging'],
    heroImage: {
      src: '/assets/img/stock-zen-garden.jpg',
      alt: '枯山水庭園意象',
      width: 1800,
      height: 1199,
    },
  },
  {
    slug: 'hair-removal',
    title: '除毛',
    eyebrow: 'SKIN CONCERN',
    icon: { src: '/assets/img/spec-06.png', alt: '除毛 科別圖示' },
    overviewDesc: '腋下、四肢與臉部細毛的毛髮週期不同，所需次數與間隔也會不一樣。',
    overviewTags: ['腋下', '四肢', '比基尼線', '臉部細毛'],
    aiSummary: '腋下、四肢與臉部細毛的毛髮週期不同，所需次數與間隔也會不一樣。',
    lede: '腋下、四肢與臉部細毛的毛髮週期不同，所需次數與間隔也會不一樣。',
    relatedConcernSlugs: ['hyperhidrosis', 'hair-loss', 'sensitive-skin'],
    heroImage: {
      src: '/assets/img/stock-stones.jpg',
      alt: '黑白疊石，水墨感意象',
      width: 1800,
      height: 1199,
    },
  },
  {
    slug: 'hyperhidrosis',
    title: '多汗・狐臭',
    eyebrow: 'SKIN CONCERN',
    icon: { src: '/assets/img/spec-07.png', alt: '多汗・狐臭 科別圖示' },
    overviewDesc: '排汗量與氣味困擾會影響日常社交，門診可依程度評估合適的處理方向。',
    overviewTags: ['腋下多汗', '手汗', '異味', '衣物染色'],
    aiSummary: '排汗量與氣味困擾會影響日常社交，門診可依程度評估合適的處理方向。',
    lede: '排汗量與氣味困擾會影響日常社交，門診可依程度評估合適的處理方向。',
    relatedConcernSlugs: ['hair-removal', 'dermatology', 'hair-loss'],
    heroImage: {
      src: '/assets/img/stock-skincare-smile.jpg',
      alt: '日常保養情境',
      width: 1800,
      height: 1199,
    },
  },
  {
    slug: 'dermatology',
    title: '一般皮膚疾病',
    eyebrow: 'SKIN CONCERN',
    icon: { src: '/assets/img/spec-08.png', alt: '一般皮膚疾病 科別圖示' },
    overviewDesc: '濕疹、蕁麻疹、灰指甲、病毒疣等皮膚科門診項目，需經診斷後治療。',
    overviewTags: ['濕疹', '蕁麻疹', '灰指甲', '病毒疣'],
    aiSummary: '濕疹、蕁麻疹、灰指甲、病毒疣等皮膚科門診項目，需經診斷後治療。',
    lede: '濕疹、蕁麻疹、灰指甲、病毒疣等皮膚科門診項目，需經診斷後治療。',
    relatedConcernSlugs: ['sensitive-skin', 'hair-loss', 'hyperhidrosis'],
    heroImage: {
      src: '/assets/img/stock-bamboo-corridor.jpg',
      alt: '木格柵長廊與竹意象',
      width: 1800,
      height: 1199,
    },
  },
]

/** 困擾總覽頁「對應療程分類」四張卡，來自 13-concern-overview.html。 */
export const CONCERN_TREATMENT_CATEGORIES = [
  {
    label: '光療美顏',
    href: '/treatments/laser/',
    excerpt: '雷射與光波能量，處理色素、痘疤與膚質紋理。',
    image: { src: '/assets/img/product-p01.png', alt: 'Picosure Pro 鉑金版蜂巢皮秒雷射機台', width: 550, height: 550 },
  },
  {
    label: '光電美容',
    href: '/treatments/photoelectric/',
    excerpt: '電波、音波與磁波，訴求緊緻與支撐力。',
    image: { src: '/assets/img/product-p05.png', alt: 'Thermage FLX 鳳凰電波機台', width: 550, height: 550 },
  },
  {
    label: '微針美容',
    href: '/treatments/microneedle/',
    excerpt: '注射類項目，涵蓋填充、支撐與保濕材料。',
    image: { src: '/assets/img/product-p03.png', alt: 'Sculptra 舒顏萃 4D 聚左旋乳酸產品', width: 580, height: 580 },
  },
  {
    label: '醫美保養',
    href: '/treatments/skincare/',
    excerpt: '清潔、導入與換膚，恢復期相對短的維持方案。',
    image: { src: '/assets/img/product-p09.png', alt: 'HydraFacial 海菲秀保養導入設備', width: 550, height: 550 },
  },
]

/** 困擾總覽頁「延伸閱讀」，來自 13-concern-overview.html。 */
export const CONCERN_OVERVIEW_ARTICLES: ConcernArticleRef[] = [
  {
    title: '皮秒雷射如何作用？認識蜂巢透鏡技術原理',
    href: '/blog/medical-aesthetics/',
    tag: '醫美新知',
    image: { src: '/assets/img/index-p02.jpg', alt: '皮秒雷射原理相關文章封面', width: 480, height: 230 },
    meta: ['黃勇學 醫師', '2026.07.02'],
  },
  {
    title: '痘疤修復的雷射選擇：淺談光療與恢復期',
    href: '/blog/medical-aesthetics/',
    tag: '醫美新知',
    image: { src: '/assets/img/index-p03.jpg', alt: '痘疤雷射選擇相關文章封面', width: 480, height: 230 },
    meta: ['鍾佩宜 醫師', '2026.06.20'],
  },
  {
    title: '膚色不均與色素沉澱：光療保養的日常照護重點',
    href: '/blog/dermatology/',
    tag: '皮膚新知',
    image: { src: '/assets/img/index-p04.jpg', alt: '膚色不均日常照護相關文章封面', width: 480, height: 230 },
    meta: ['趙映程 醫師', '2026.05.11'],
  },
]

export function findConcern(slug: string): Concern | undefined {
  return CONCERNS.find((c) => c.slug === slug)
}
