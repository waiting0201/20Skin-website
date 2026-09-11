// 醫療團隊資料 —— 模板 4（/team/）與模板 5（/team/{slug}/）共用。
//
// 形狀對齊 docs/08-database.md §C-2 Doctors ＋ DoctorTags ＋ DoctorCredentials ＋ DoctorSchedules。
// 正式站這份資料由後台 CMS 產出，現階段內容逐字取自 mockup/11-team-list.html
// 與 mockup/05-doctor-detail.html，**不自行編造學經歷**。
//
// ⚠️ 團隊共 14 位成員 ＝ 13 位醫師 ＋ 1 位藝術總監。安喬（許媖琄）兼執行長與
// 「新中式美學」創始人，isPhysician 為 false —— 她不輸出 Physician JSON-LD，
// 站上也不會出現「本文由安喬醫師審閱」這類措辭。見 docs/08 §C-2、CLAUDE.md。
//
// mockup 只給了黃勇學一份完整的醫師個人頁內容（05-doctor-detail.html）。
// 其餘 13 位僅在列表頁／院區駐診卡片中出現姓名、職稱、專長標籤、看診院區，
// 依任務指示「mockup 沒做到的醫師用 name/slug/職稱即可」，其餘欄位留空，
// 個人頁模板會針對缺欄位整段不渲染（v-if），不補假資料。

export type ClinicSlug = 'siji' | 'erlin'

/** DoctorCredentials：Type 1 學歷／2 經歷（現職視為經歷的特例，不另立第四類）。 */
export interface DoctorTimelineEntry {
  label: '現職' | '學歷' | '經歷'
  text: string
}

export interface DoctorClinicAssignment {
  clinicSlug: ClinicSlug
  /** DoctorSchedules 的簡化呈現。僅 mockup/08-clinic-detail.html 有列出的 5 位醫師
   *  帶有明確時段簡述，其餘留空，個人頁與院區頁一律改顯示該院區的一般門診時段。 */
  scheduleNote?: string
}

export interface DoctorTreatmentRef {
  /** 顯示用分類標籤，取自 mockup 的 c-tag 文字（例如「微整形注射」），可能與
   *  下方 categorySlug 的官方分類不同 —— docs/01-sitemap.md §1 已註記現行分類
   *  歸屬本身有誤，改版時才會重新歸類，這裡如實反映該落差。 */
  categoryLabel: string
  categorySlug: 'laser' | 'microneedle' | 'photoelectric' | 'skincare'
  slug: string
  name: string
  image: { src: string; width: number; height: number; alt: string }
}

export interface DoctorArticleRef {
  category: string
  title: string
  excerpt: string
  /** 「作者：」或「審閱：」開頭，取自 mockup 原文。 */
  byline: string
  date: string
  image: { src: string; width: number; height: number; alt: string }
}

export interface DoctorMediaRef {
  title: string
  meta: string
}

export interface Doctor {
  slug: string
  name: string
  isPhysician: boolean
  /** 列表卡片／駐診卡片用的簡短職稱。 */
  jobTitle: string
  /** 個人頁 Hero 用的職稱，僅在與 jobTitle 不同時才給值（例如黃勇學：列表寫
   *  「院長・皮膚科專科醫師」，個人頁 Hero 寫「院長・醫療技術總監」，兩者皆為
   *  mockup 原文，保留兩處差異而不是互相覆蓋、也不是自行擇一改寫）。 */
  heroRole?: string
  /** 僅在 mockup 明確標示專科時才填，不臆測。 */
  specialty?: string
  photo: { src: string; width: number; height: number }
  /** DoctorTags —— 專長標籤，用於列表頁卡片與篩選。 */
  tags: string[]
  yearsInPractice?: string
  lede?: string
  bio?: string[]
  timeline?: DoctorTimelineEntry[]
  /** DoctorCredentials Type=3。 */
  certifications?: string[]
  /** 個人頁「專長領域」，與上方 tags（列表篩選用）分開維護，因為 mockup 兩處用詞不同。 */
  expertiseTags?: string[]
  concerns?: { slug: string; label: string }[]
  treatments?: DoctorTreatmentRef[]
  articles?: DoctorArticleRef[]
  media?: DoctorMediaRef[]
  clinics: DoctorClinicAssignment[]
}

export const DOCTORS: Doctor[] = [
  {
    slug: 'huang',
    name: '黃勇學',
    isPhysician: true,
    jobTitle: '院長・皮膚科專科醫師',
    heroRole: '院長・醫療技術總監',
    specialty: '皮膚科',
    photo: { src: '/assets/img/doctor-huang.jpg', width: 700, height: 1021 },
    tags: ['雷射光電', '痘痘・粉刺', '皮膚疾病'],
    yearsInPractice: '約 20 年',
    lede: '皮膚科專科醫師，以個人化精準評估與「彩妝式輕醫美」的節制手法，為每一位求美者規劃自然協調的樣貌。',
    bio: [
      '黃勇學醫師具中華民國皮膚科專科醫師資格，長期投入雷射光療、色素性疾患與微整形注射。主張從個人膚況與生活型態出發規劃療程，而非套用單一標準流程。',
      '治療上秉持「彩妝式輕醫美」的節制原則，重視五官與氣質的整體協調，避免過度介入造成的表情僵硬或比例失衡，追求隨時間推移仍自然合理的樣貌。',
      '現任舒顏萃 Sculptra 3D 聚左旋乳酸中區金牌教育講師，並擔任蜂巢皮秒雷射 PicoSure 亞太教育訓練講師。',
    ],
    timeline: [
      { label: '現職', text: '20SKIN 美醫集團 四季診所 院長・醫療技術總監' },
      { label: '現職', text: '二林四季皮膚科 主治醫師' },
      { label: '學歷', text: '○○大學 醫學系' },
      { label: '經歷', text: '○○醫院 皮膚科 住院醫師・總醫師' },
    ],
    certifications: [
      '中華民國皮膚科專科醫師',
      '中華民國醫用雷射醫學會 會員',
      '台灣美容醫學皮膚科醫師',
      '舒顏萃 Sculptra 3D 聚左旋乳酸中區金牌教育講師',
      '蜂巢皮秒雷射 PicoSure 亞太教育訓練講師',
    ],
    expertiseTags: ['雷射光療', '色素性疾患', '痘痘與痘疤', '皮膚腫瘤', '微整形注射', '抗老緊緻'],
    concerns: [
      { slug: 'acne', label: '痘痘・粉刺' },
      { slug: 'pigmentation', label: '斑點・色素沉澱' },
      { slug: 'anti-aging', label: '抗老・緊緻' },
      { slug: 'dermatology', label: '一般皮膚疾病' },
    ],
    treatments: [
      {
        categoryLabel: '光療美顏',
        categorySlug: 'laser',
        slug: 'picosure-pro',
        name: 'Picosure® Pro 鉑金版蜂巢皮秒雷射',
        image: { src: '/assets/img/product-p01.png', width: 550, height: 550, alt: 'Picosure Pro 鉑金版蜂巢皮秒雷射機台' },
      },
      {
        categoryLabel: '微針美容',
        categorySlug: 'microneedle',
        slug: 'sculptra',
        name: 'Sculptra 舒顏萃 4D聚左旋乳酸',
        image: { src: '/assets/img/product-p03.png', width: 580, height: 580, alt: 'Sculptra 舒顏萃 4D聚左旋乳酸產品' },
      },
      {
        categoryLabel: '微整形注射',
        categorySlug: 'microneedle',
        slug: 'xeomin',
        name: 'Xeomin 新一代天使肉毒',
        image: { src: '/assets/img/product-p05.png', width: 550, height: 550, alt: 'Xeomin 新一代天使肉毒產品' },
      },
      {
        categoryLabel: '光電美容',
        categorySlug: 'photoelectric',
        slug: 'thermage-flx',
        name: 'Thermage FLX 鳳凰電波',
        image: { src: '/assets/img/product-p13.png', width: 550, height: 550, alt: 'Thermage FLX 鳳凰電波機台' },
      },
    ],
    articles: [
      {
        category: '醫美新知',
        title: '素顏也不怕！眼周精雕打造晶亮美眸',
        excerpt: '從基礎保養到精緻療程，掌握眼周老化徵兆與保養重點。',
        byline: '作者：黃勇學 醫師',
        date: '2026.06.12',
        image: { src: '/assets/img/index-p01.jpg', width: 480, height: 230, alt: '眼周精雕相關文章封面' },
      },
      {
        category: '醫美新知',
        title: '蜂巢皮秒雷射如何處理長期色素性疾患',
        excerpt: '認識蜂巢皮秒雷射的作用原理與臨床應用範圍。',
        byline: '審閱：黃勇學 醫師',
        date: '2026.05.20',
        image: { src: '/assets/img/index-p02.jpg', width: 480, height: 230, alt: '蜂巢皮秒雷射相關文章封面' },
      },
      {
        category: '醫美新知',
        title: '聚左旋乳酸與皮膚膠原新生的臨床觀察',
        excerpt: '從皮膚科專科角度說明聚左旋乳酸的作用機轉。',
        byline: '作者：黃勇學 醫師',
        date: '2026.04.08',
        image: { src: '/assets/img/index-p03.jpg', width: 480, height: 230, alt: '舒顏萃聚左旋乳酸相關文章封面' },
      },
      {
        category: '皮膚新知',
        title: '痘痘與痘疤：從皮膚科角度分階段照護',
        excerpt: '說明不同階段痘痘與痘疤的皮膚科處理方向。',
        byline: '審閱：黃勇學 醫師',
        date: '2026.02.27',
        image: { src: '/assets/img/index-p04.jpg', width: 480, height: 230, alt: '痘痘與痘疤照護相關文章封面' },
      },
    ],
    media: [
      { title: '舒顏萃 Sculptra 3D 聚左旋乳酸中區教育訓練課程 講師', meta: '中華民國醫用雷射醫學會・2026.05' },
      { title: '蜂巢皮秒雷射 PicoSure 亞太區教育訓練 講師', meta: 'PicoSure 亞太教育訓練・2026.03' },
      { title: 'Ultherapy PRIME 韓國首爾上市記者會 出席', meta: '媒體報導・2026.01' },
      { title: '皮膚科專科醫師雷射治療應用研討會 專題演講', meta: '中華民國皮膚科醫學會・2025.11' },
    ],
    clinics: [{ clinicSlug: 'siji' }, { clinicSlug: 'erlin', scheduleNote: '一 上午／四 下午' }],
  },
  {
    slug: 'anqiao',
    name: '安喬',
    isPhysician: false,
    jobTitle: '藝術總監・執行長',
    photo: { src: '/assets/img/doctor-anqiao.jpg', width: 700, height: 921 },
    tags: ['新中式美學', '整體造型'],
    clinics: [{ clinicSlug: 'siji' }],
  },
  {
    slug: 'lin-yuanfu',
    name: '林源富',
    isPhysician: true,
    jobTitle: '肥胖醫學專科醫師',
    specialty: '肥胖醫學',
    photo: { src: '/assets/img/doctor-lin-yuanfu.jpg', width: 700, height: 1051 },
    tags: ['體態管理', '注射微整'],
    clinics: [{ clinicSlug: 'siji' }],
  },
  {
    slug: 'shih',
    name: '施百潤',
    isPhysician: true,
    jobTitle: '家庭醫學科專科醫師',
    specialty: '家庭醫學科',
    photo: { src: '/assets/img/doctor-shih.jpg', width: 700, height: 1051 },
    tags: ['注射微整', '抗老・緊緻'],
    clinics: [{ clinicSlug: 'siji' }],
  },
  {
    slug: 'cheng',
    name: '鄭凱中',
    isPhysician: true,
    jobTitle: '重症醫學部研究醫師',
    photo: { src: '/assets/img/doctor-cheng.jpg', width: 700, height: 1051 },
    tags: ['注射微整', '雷射光電'],
    clinics: [{ clinicSlug: 'siji' }],
  },
  {
    slug: 'liu',
    name: '劉柏亨',
    isPhysician: true,
    jobTitle: '中華民國專科醫師',
    photo: { src: '/assets/img/doctor-liu.jpg', width: 700, height: 1051 },
    tags: ['雷射光電', '除毛'],
    clinics: [{ clinicSlug: 'siji' }],
  },
  {
    slug: 'lin-yumin',
    name: '林鈺敏',
    isPhysician: true,
    jobTitle: '主治醫師',
    photo: { src: '/assets/img/doctor-lin-yumin.jpg', width: 700, height: 1014 },
    tags: ['皮膚疾病', '敏感肌'],
    clinics: [{ clinicSlug: 'erlin' }],
  },
  {
    slug: 'yang-lanyi',
    name: '楊嵐怡',
    isPhysician: true,
    jobTitle: '肥胖醫學會醫師',
    specialty: '肥胖醫學',
    photo: { src: '/assets/img/doctor-yang-lanyi.jpg', width: 700, height: 1021 },
    tags: ['體態管理', '抗老・緊緻'],
    clinics: [{ clinicSlug: 'siji' }, { clinicSlug: 'erlin', scheduleNote: '四 上午／六 下午' }],
  },
  {
    slug: 'yang-zhengjie',
    name: '楊証傑',
    isPhysician: true,
    jobTitle: '部定專科醫師',
    photo: { src: '/assets/img/doctor-yang-zhengjie.jpg', width: 700, height: 1014 },
    tags: ['注射微整', '輪廓調整'],
    clinics: [{ clinicSlug: 'siji' }],
  },
  {
    slug: 'chung',
    name: '鍾佩宜',
    isPhysician: true,
    jobTitle: '皮膚科專科醫師',
    specialty: '皮膚科',
    photo: { src: '/assets/img/doctor-chung.jpg', width: 700, height: 1051 },
    tags: ['斑點・色素沉澱', '雷射光電'],
    clinics: [{ clinicSlug: 'siji' }, { clinicSlug: 'erlin', scheduleNote: '三 全天／六 上午' }],
  },
  {
    slug: 'su',
    name: '蘇達華',
    isPhysician: true,
    jobTitle: '家庭醫學科專科醫師',
    specialty: '家庭醫學科',
    photo: { src: '/assets/img/doctor-su.jpg', width: 700, height: 1051 },
    tags: ['多汗・狐臭', '皮膚疾病'],
    clinics: [{ clinicSlug: 'erlin' }],
  },
  {
    slug: 'hung',
    name: '洪健睿',
    isPhysician: true,
    jobTitle: '二林四季皮膚科主治醫師',
    photo: { src: '/assets/img/doctor-hung.jpg', width: 700, height: 1022 },
    tags: ['皮膚疾病', '生髮・落髮'],
    clinics: [{ clinicSlug: 'erlin', scheduleNote: '一、二、四、五 全天' }],
  },
  {
    slug: 'chao',
    name: '趙映程',
    isPhysician: true,
    jobTitle: '皮膚科專科醫師',
    specialty: '皮膚科',
    photo: { src: '/assets/img/doctor-chao.jpg', width: 700, height: 1049 },
    tags: ['痘痘・粉刺', '敏感肌'],
    clinics: [{ clinicSlug: 'siji' }, { clinicSlug: 'erlin', scheduleNote: '二 下午／五 上午' }],
  },
  {
    slug: 'hsiung',
    name: '熊開瑾',
    isPhysician: true,
    jobTitle: '部定專科醫師',
    photo: { src: '/assets/img/doctor-hsiung.jpg', width: 700, height: 1050 },
    tags: ['雷射光電', '抗老・緊緻'],
    clinics: [{ clinicSlug: 'erlin' }],
  },
]

export function findDoctor(slug: string): Doctor | undefined {
  return DOCTORS.find((d) => d.slug === slug)
}

export function doctorsByClinic(clinicSlug: ClinicSlug, physiciansOnly = false): Doctor[] {
  return DOCTORS.filter(
    (d) => d.clinics.some((c) => c.clinicSlug === clinicSlug) && (!physiciansOnly || d.isPhysician),
  )
}
