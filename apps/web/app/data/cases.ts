// 案例分享資料 —— 對應 docs/08-database.md §C-5 Cases ＋ CaseImages。
//
// ⚠️ 法規揭露欄位（個案差異聲明、當事人書面同意、拍攝條件）在資料庫層是 NOT NULL，
// 見 docs/02-backend-cms.md §1／docs/08-database.md §C-5。這四欄不是裝飾，
// 是「案例」內容模型的必填欄位，前端一律要渲染出來，不可省略。
//
// mockup/14-case-list.html 列了 10 則案例卡片，但只有第一則
// 「痘疤紋理的分次調理」在 mockup/15-case-detail.html 有完整內文
// （術前術後說明、個案條件表、療程歷程、醫師說明、法規揭露聲明、同意書索引）。
// 其餘 9 則目前只有列表卡片的摘要資訊（年齡層、次數、療程分類、tag），
// 沒有敘述內文與法規揭露資料 —— 不能無中生有，所以只有第一則有真正的內頁路由，
// 其餘 9 則列表卡片維持 mockup 原樣的無效連結（`href: null`），
// 等後台真正建立這些案例（含法規揭露欄位）後再補上內頁。

export interface Image {
  src: string
  alt: string
  width: number
  height: number
}

export interface CaseListItem {
  slug: string | null
  title: string
  ageGender: string
  sessions: string
  tags: string[]
  concernSlug?: string
}

export interface CaseTimelineItem {
  when: string
  title: string
  text: string
}

export interface CaseTreatmentRef {
  name: string
  href: string
  image: Image
  excerpt: string
}

export interface CaseDetail {
  slug: string
  title: string
  concernLabel: string
  concernHref: string
  lede: string
  shootingConditions: string
  facts: {
    condition: string
    mainConcern: string
    treatmentName: string
    treatmentHref: string
    sessions: string
    period: string
    doctorName: string
    doctorHref: string | null
    recovery: string
  }
  sections: { heading: string; paragraphs: string[] }[]
  timeline: CaseTimelineItem[]
  testimonial: string
  /** 個案差異聲明（docs/08 §C-5 IndividualVarianceStatement，NOT NULL）。 */
  individualVarianceStatement: string
  /** 當事人書面同意（docs/08 §C-5 HasWrittenConsent，NOT NULL）。 */
  hasWrittenConsent: true
  /** 同意書編號／存放位置（docs/08 §C-5 ConsentReference）。只存索引，同意書本身不進系統。 */
  consentReference: string
  doctorQuote: {
    name: string
    role: string
    href: string | null
    avatar: Image
    quote: string
  }
  treatmentsUsed: CaseTreatmentRef[]
  moreCaseSlugs: string[]
}

export const CASE_LIST: CaseListItem[] = [
  {
    slug: 'acne-scar-staged-care',
    title: '痘疤紋理的分次調理',
    ageGender: '30–35 歲・女性',
    sessions: '共 4 次・歷時 6 個月',
    tags: ['痘痘・粉刺', '蜂巢皮秒雷射'],
    concernSlug: 'acne',
  },
  {
    slug: null,
    title: '顴骨斑點的階段性處理',
    ageGender: '40–45 歲・女性',
    sessions: '共 3 次・歷時 4 個月',
    tags: ['斑點・色素沉澱', '光療美顏'],
    concernSlug: 'pigmentation',
  },
  {
    slug: null,
    title: '下顎線條與輪廓支撐',
    ageGender: '45–50 歲・女性',
    sessions: '共 2 次・歷時 8 個月',
    tags: ['抗老・緊緻', '電波'],
    concernSlug: 'anti-aging',
  },
  {
    slug: null,
    title: '泛紅與敏感肌的穩定',
    ageGender: '25–30 歲・女性',
    sessions: '共 6 次・歷時 5 個月',
    tags: ['敏感肌', '醫美保養'],
    concernSlug: 'sensitive-skin',
  },
  {
    slug: null,
    title: '腋下多汗的門診處理',
    ageGender: '30–35 歲・男性',
    sessions: '共 1 次・追蹤 6 個月',
    tags: ['多汗・狐臭'],
    concernSlug: 'hyperhidrosis',
  },
  {
    slug: null,
    title: '髮線稀疏的療程規劃',
    ageGender: '35–40 歲・男性',
    sessions: '共 3 次・歷時 9 個月',
    tags: ['生髮・落髮'],
    concernSlug: 'hair-loss',
  },
  {
    slug: null,
    title: '毛孔與膚質的整體調理',
    ageGender: '25–30 歲・女性',
    sessions: '共 5 次・歷時 7 個月',
    tags: ['毛孔粗大', '光繞雷射'],
  },
  {
    slug: null,
    title: '上臉細紋的分次規劃',
    ageGender: '40–45 歲・女性',
    sessions: '共 2 次・歷時 6 個月',
    tags: ['抗老・緊緻', '注射微整'],
    concernSlug: 'anti-aging',
  },
  {
    slug: null,
    title: '四肢除毛的完整療程',
    ageGender: '20–25 歲・女性',
    sessions: '共 6 次・歷時 12 個月',
    tags: ['除毛'],
    concernSlug: 'hair-removal',
  },
]

export const CASE_FILTER_CONCERNS = [
  { label: '痘痘・粉刺', href: null },
  { label: '斑點・色素沉澱', href: null },
  { label: '抗老・緊緻', href: null },
  { label: '敏感肌', href: null },
]

export const CASE_FILTER_TREATMENTS = [
  { label: '光療美顏', href: '/treatments/laser/' },
  { label: '光電美容', href: null },
  { label: '微針美容', href: null },
]

export const CASE_HOW_TO_READ = [
  { title: '一、個案條件', text: '年齡層、性別與起點膚況不同，能參考的程度就不同。' },
  { title: '二、次數與期間', text: '做 1 次與做 6 次是兩回事，案例都會標註實際次數與歷時。' },
  { title: '三、拍攝條件', text: '光線、角度與妝容會影響觀感。院內案例照以固定條件拍攝。' },
]

export const CASE_DETAILS: CaseDetail[] = [
  {
    slug: 'acne-scar-staged-care',
    title: '痘疤紋理的分次調理',
    concernLabel: '痘痘・粉刺',
    concernHref: '/concerns/acne/',
    lede: '30–35 歲女性，兩頰多年痘疤凹陷合併局部色素沉澱。6 個月、共 4 次療程的規劃紀錄。',
    shootingConditions: '同一相機與鏡頭、固定光源與距離、未上妝、正面角度。兩張照片間隔 6 個月。',
    facts: {
      condition: '30–35 歲・女性',
      mainConcern: '痘疤凹陷、膚質紋理不均、局部色素沉澱',
      treatmentName: 'Picosure® Pro 鉑金版蜂巢皮秒雷射',
      treatmentHref: '/treatments/laser/picosure-pro/',
      sessions: '共 4 次',
      period: '2025.11 – 2026.05（約 6 個月）',
      doctorName: '黃勇學 醫師',
      doctorHref: '/team/huang/',
      recovery: '每次術後約 2–3 天輕微泛紅，未影響日常作息',
    },
    sections: [
      {
        heading: '面診時的狀況',
        paragraphs: [
          '個案自述高中時期痘痘反覆發作，發炎消退後在兩頰留下凹陷與明顯的膚質紋理，上妝後容易卡粉。曾自行使用市售酸類產品，但因刺激而中斷。',
          '面診時醫師檢視膚況，判斷主要為多年前發炎後留下的凹陷型疤痕，合併局部發炎後色素沉澱；皮膚屏障狀態尚可，無正在發炎的痘痘。',
        ],
      },
      {
        heading: '規劃的思路',
        paragraphs: [
          '凹陷型疤痕的處理需要時間，一次做強不會比較快，反而可能拉長恢復期並增加色素沉澱的風險。因此規劃採分次進行，每次間隔約 6–8 週，讓皮膚有完整的修復時間，並在每次回診依實際反應調整能量設定。',
          '色素沉澱的部分則優先處理，因為它對整體觀感的影響往往比紋理更直接，而且改善所需的時間相對短。',
        ],
      },
    ],
    timeline: [
      {
        when: '2025.11',
        title: '第 1 次・面診與首次療程',
        text: '完成膚況評估與病史確認，第一次以較保守的能量設定進行，觀察皮膚反應。術後 2 天輕微泛紅。',
      },
      {
        when: '2026.01',
        title: '第 2 次・調整設定',
        text: '回診確認前次恢復狀況良好，色素沉澱區域略淡。依醫師評估調整能量與施打範圍。',
      },
      {
        when: '2026.03',
        title: '第 3 次・加強紋理區域',
        text: '色素部分穩定後，重心轉向兩頰凹陷與紋理較明顯的區域，並同步討論居家保養的調整。',
      },
      {
        when: '2026.05',
        title: '第 4 次・階段收尾與追蹤',
        text: '完成本階段規劃，改為每 3 個月回診追蹤，依當時膚況決定是否需要後續維持。',
      },
    ],
    testimonial:
      '「最有感的其實不是某一次做完之後，而是三月拍照時發現不太需要修圖了。上妝比以前服貼，卡粉的狀況少很多。」',
    individualVarianceStatement:
      '本案例為個別紀錄，反應因個人體質、膚況、療程規劃與生活習慣而異，不代表所有人都會有相同結果，亦非療程效果之保證。實際適用性、次數與間隔，需由醫師依個人狀況面診評估後決定。',
    hasWrittenConsent: true,
    consentReference: '個案同意書已存放於院內病歷系統，索引碼由後台管理，不對外公開。',
    doctorQuote: {
      name: '黃勇學 醫師',
      role: '院長・皮膚科專科醫師',
      href: '/team/huang/',
      avatar: { src: '/assets/img/doctor-huang.jpg', alt: '黃勇學 醫師', width: 72, height: 72 },
      quote:
        '「凹陷型痘疤沒有捷徑。分次做、每次觀察反應再調整，比一次拉高能量安全，長期下來的結果也比較穩定。個案的配合度——防曬與回診——其實是影響最大的變因。」',
    },
    treatmentsUsed: [
      {
        name: 'Picosure® Pro 鉑金版蜂巢皮秒雷射',
        href: '/treatments/laser/picosure-pro/',
        image: { src: '/assets/img/product-p01.png', alt: 'Picosure Pro 鉑金版蜂巢皮秒雷射機台', width: 550, height: 550 },
        excerpt: '蜂巢透鏡導入皮秒雷射，作用於淺層色素與痘疤紋理。',
      },
      {
        name: 'HydraFacial 海菲秀',
        href: '/treatments/skincare/hydrafacial/',
        image: { src: '/assets/img/product-p09.png', alt: 'HydraFacial 海菲秀保養導入設備', width: 550, height: 550 },
        excerpt: '療程間隔期間的清潔與導入，作為維持方案。',
      },
      {
        name: '光繞雷射',
        href: '/treatments/laser/helios-iii/',
        image: { src: '/assets/img/product-p12.png', alt: 'D.O.E HELIOS III 光繞雷射機台', width: 550, height: 550 },
        excerpt: '分段式光纖雷射，訴求毛孔與膚質紋理調理。',
      },
    ],
    moreCaseSlugs: [],
  },
]

export function findCaseDetail(slug: string): CaseDetail | undefined {
  return CASE_DETAILS.find((c) => c.slug === slug)
}
