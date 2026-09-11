// 開發期假資料。
//
// ⚠️ 這裡的內容是**示意用途**，不是真實院方資料——本輪切版時前台的
// `app/data/*.ts`（療程／醫師／文章…的正式清單）尚未就緒，README 要求
// 「沒有就先自己給少量示意資料，並在回報裡說明」。等前台資料備妥、
// 或 api.20skin.tw 上線後，這個檔案應該整份被 `src/api/client.ts`
// 對 api.20skin.tw 的呼叫取代，其餘畫面不用改一行。
//
// 醫師姓名刻意不用真人姓名（即使 public/assets/img 已有對應人像檔名），
// 避免在還沒有院方核定資料的階段，讓示意資料被誤認成正式內容。

import type { CurrentUser, RoleCode } from '../types'
import type { RelationType } from '../unit-schema'

export interface MockCredential {
  userName: string
  password: string
}

export interface MockUserRecord extends CurrentUser {
  credential: MockCredential
  /** 帳號管理畫面（docs/06 §5，下一輪才做）停用帳號用；本輪種子資料全部啟用。 */
  isActive: boolean
}

export const MOCK_USERS: MockUserRecord[] = [
  {
    id: 1,
    userName: 'sa',
    displayName: '系統管理員',
    roles: ['SuperAdmin'],
    isSuperAdmin: true,
    doctorId: null,
    mustChangePassword: false,
    isActive: true,
    credential: { userName: 'sa', password: 'Admin@123' },
  },
  {
    id: 2,
    userName: 'editor1',
    displayName: '編輯｜阿雅',
    roles: ['Editor'],
    isSuperAdmin: false,
    doctorId: null,
    mustChangePassword: false,
    isActive: true,
    credential: { userName: 'editor1', password: 'Editor@123' },
  },
  {
    id: 3,
    userName: 'doctor1',
    displayName: '示範醫師一',
    roles: ['Doctor'],
    isSuperAdmin: false,
    doctorId: 101,
    mustChangePassword: false,
    isActive: true,
    credential: { userName: 'doctor1', password: 'Doctor@123' },
  },
  {
    id: 4,
    userName: 'marketing1',
    displayName: '行銷｜小林',
    roles: ['Marketing'],
    isSuperAdmin: false,
    doctorId: null,
    mustChangePassword: false,
    isActive: true,
    credential: { userName: 'marketing1', password: 'Marketing@123' },
  },
  {
    id: 5,
    userName: 'reviewer1',
    displayName: '審核者｜院長室',
    roles: ['Reviewer'],
    isSuperAdmin: false,
    doctorId: null,
    mustChangePassword: false,
    isActive: true,
    credential: { userName: 'reviewer1', password: 'Reviewer@123' },
  },
]

/** docs/08-database.md §B-5：字詞小、讀取頻繁，種子值僅取文件裡列出的樣本。 */
export const MOCK_RISK_TERMS: string[] = [
  '保證',
  '完全根治',
  '零風險',
  '永久有效',
  '最好',
  '第一',
  '唯一',
  '折扣',
  '贈品',
  '限時優惠',
]

export interface SeedRelation {
  fromKey: string // 種子資料內部用的暫時 key，見下方各單元的 `seedKey`
  toKey: string
  relationType: RelationType
  sortOrder: number
  note?: string
}

/** 種子資料用「暫時 key」互相參照，載入時由 client.ts 換算成真正的數字 Id。 */
export interface SeedRecord {
  seedKey: string
  title: string
  slug?: string
  status: 1 | 2 | 3 | 4
  sortOrder: number
  includeInSitemap?: boolean
  isSystemLocked?: boolean
  ownerUserId?: number | null
  fields: Record<string, unknown>
  seo?: Partial<{
    seoTitle: string
    metaDescription: string
    aiSummary: string
    noIndex: boolean
  }>
}

// ⚠️ TermType 1–3（分類）的種子筆數固定由 migration 建立，IsSystemLocked=true——
// 呼應 docs/08-database.md §B-1「IsSystemLocked：系統頁與系統分類，不可刪、
// 不可改 slug」把「系統頁」與「系統分類」並列的措辭。標籤（TermType=4）不鎖，
// 日常可自由新增／刪除（docs/02-backend-cms.md §4）。
export const SEED_TERMS: SeedRecord[] = [
  // 療程分類 4
  { seedKey: 'term-cat-laser', title: '光療美顏', slug: 'laser', status: 3, sortOrder: 1, isSystemLocked: true, fields: { termType: 1, intro: '光學儀器類療程。' } },
  { seedKey: 'term-cat-microneedle', title: '微針美容', slug: 'microneedle', status: 3, sortOrder: 2, isSystemLocked: true, fields: { termType: 1, intro: '微針導入類療程。' } },
  { seedKey: 'term-cat-photoelectric', title: '光電美容', slug: 'photoelectric', status: 3, sortOrder: 3, isSystemLocked: true, fields: { termType: 1, intro: '電波與音波類療程。' } },
  { seedKey: 'term-cat-skincare', title: '醫美保養', slug: 'skincare', status: 3, sortOrder: 4, isSystemLocked: true, fields: { termType: 1, intro: '術後與日常保養類療程。' } },
  // 文章分類 4
  { seedKey: 'term-blog-med', title: '醫美新知', slug: 'medical-aesthetics', status: 3, sortOrder: 1, isSystemLocked: true, fields: { termType: 2, intro: '醫美相關新知。' } },
  { seedKey: 'term-blog-derm', title: '皮膚新知', slug: 'dermatology', status: 3, sortOrder: 2, isSystemLocked: true, fields: { termType: 2, intro: '皮膚科相關新知。' } },
  { seedKey: 'term-blog-media', title: '媒體報導', slug: 'media', status: 3, sortOrder: 3, isSystemLocked: true, fields: { termType: 2, intro: '媒體採訪與報導。' } },
  { seedKey: 'term-blog-lecture', title: '演講授課', slug: 'lectures', status: 3, sortOrder: 4, isSystemLocked: true, fields: { termType: 2, intro: '醫師對外演講與授課紀錄。' } },
  // FAQ 分類 5
  { seedKey: 'term-faq-brand', title: '品牌與診所', slug: 'brand', status: 3, sortOrder: 1, isSystemLocked: true, fields: { termType: 3, intro: '' } },
  { seedKey: 'term-faq-treatment', title: '療程相關', slug: 'treatment', status: 3, sortOrder: 2, isSystemLocked: true, fields: { termType: 3, intro: '' } },
  { seedKey: 'term-faq-concern', title: '肌膚困擾', slug: 'concern', status: 3, sortOrder: 3, isSystemLocked: true, fields: { termType: 3, intro: '' } },
  { seedKey: 'term-faq-doctor', title: '醫師與看診', slug: 'doctor', status: 3, sortOrder: 4, isSystemLocked: true, fields: { termType: 3, intro: '' } },
  { seedKey: 'term-faq-fee', title: '費用與流程', slug: 'fee', status: 3, sortOrder: 5, isSystemLocked: true, fields: { termType: 3, intro: '' } },
  // 文章標籤（示意 2 筆，不鎖定，種子預設 noindex + 不進 sitemap）
  { seedKey: 'term-tag-picosecond', title: '皮秒雷射', slug: 'picosecond', status: 3, sortOrder: 1, includeInSitemap: false, fields: { termType: 4, intro: '' }, seo: { noIndex: true } },
  { seedKey: 'term-tag-rf', title: '電波拉皮', slug: 'rf', status: 3, sortOrder: 2, includeInSitemap: false, fields: { termType: 4, intro: '' }, seo: { noIndex: true } },
]

export const SEED_DOCTORS: SeedRecord[] = [
  {
    seedKey: 'doctor-a',
    title: '示範醫師一',
    slug: 'demo-doctor-a',
    status: 3,
    sortOrder: 1,
    ownerUserId: 3, // 對到 MOCK_USERS 的 doctor1（示意 OwnerUserId 判定）
    fields: {
      jobTitle: '院長',
      isPhysician: true,
      specialty: '皮膚科',
      photoUrl: '/assets/img/doctor-chao.jpg',
      credentials: [
        { type: 1, text: '示範醫學大學醫學系畢業' },
        { type: 2, text: '示範醫院皮膚科主治醫師' },
        { type: 3, text: '台灣皮膚科醫學會專科醫師（示意）' },
      ],
      tags: ['雷射', '注射填充'],
      bio: '示意簡介文字，實際內容待院方確認後補齊。',
      publications: '',
      schedules: [{ clinicSeedKey: 'clinic-siji', dayOfWeek: 1, startTime: '09:00', endTime: '13:00', note: '' }],
    },
  },
  {
    seedKey: 'doctor-b',
    title: '示範醫師二',
    slug: 'demo-doctor-b',
    status: 3,
    sortOrder: 2,
    fields: {
      jobTitle: '主治醫師',
      isPhysician: true,
      specialty: '皮膚科',
      photoUrl: '/assets/img/doctor-huang.jpg',
      credentials: [{ type: 1, text: '示範醫學大學醫學系畢業' }],
      tags: ['皮秒雷射'],
      bio: '示意簡介文字。',
      publications: '',
      schedules: [],
    },
  },
  {
    seedKey: 'doctor-c-director',
    title: '示範藝術總監',
    slug: 'demo-art-director',
    status: 3,
    sortOrder: 3,
    fields: {
      jobTitle: '執行長・藝術總監',
      // ⚠️ 14 位團隊成員是 13 醫師 + 1 藝術總監（docs/06 §2）。這筆刻意 isPhysician=false，
      // 用來驗證編輯畫面與前台「本文由 ○○ 醫師審閱」不會誤把她算進醫師。
      isPhysician: false,
      specialty: '新中式美學創始人',
      photoUrl: '/assets/img/doctor-anqiao.jpg',
      credentials: [{ type: 2, text: '「新中式美學」品牌理念創始人（示意）' }],
      tags: [],
      bio: '示意簡介文字。',
      publications: '',
      schedules: [],
    },
  },
]

export const SEED_TREATMENTS: SeedRecord[] = [
  {
    seedKey: 'treatment-picosecond',
    title: '皮秒雷射（示意）',
    slug: 'picosecond-pro',
    status: 3,
    sortOrder: 1,
    fields: {
      categoryTermSeedKey: 'term-cat-laser',
      nameEn: 'Picosecond Laser',
      subtitle: '淨化膚色示意療程',
      indications: '色素沉澱、毛孔粗大（示意內容，待醫師確認）。',
      mechanism: '示意原理說明。',
      durationText: '約 20–30 分鐘',
      sessionsText: '建議 3–5 次，間隔 4 週',
      aftercare: '示意術後照護說明。',
      contraindications: '孕婦、光敏感疾病者不建議施做（示意內容，待醫師確認）。',
      deviceInfo: '示意儀器資訊。',
      coverImageUrl: '/assets/img/product-p01.png',
    },
  },
  {
    seedKey: 'treatment-rf',
    title: '電波拉皮（示意）',
    slug: 'radiofrequency-lift',
    status: 1,
    sortOrder: 2,
    fields: {
      categoryTermSeedKey: 'term-cat-photoelectric',
      nameEn: 'Radiofrequency Lift',
      subtitle: '',
      indications: '示意內容，此筆為 27 項療程中「無站內內容需從零撰寫」情境示範，故留在草稿。',
      mechanism: '',
      durationText: '',
      sessionsText: '',
      aftercare: '',
      contraindications: '',
      deviceInfo: '',
      coverImageUrl: '',
    },
  },
]

export const SEED_CONCERNS: SeedRecord[] = [
  {
    seedKey: 'concern-acne',
    title: '痘痘・粉刺',
    slug: 'acne',
    status: 3,
    sortOrder: 1,
    fields: {
      symptoms: '示意症狀描述。',
      causes: '示意成因說明。',
      selfCheckGuide: '示意自我判斷指引。',
      whenToSeeDoctor: '示意何時該就醫說明。',
      coverImageUrl: '/assets/img/stock-facial-calm.jpg',
    },
  },
  {
    seedKey: 'concern-sensitive',
    title: '敏感肌',
    slug: 'sensitive-skin',
    status: 3,
    sortOrder: 2,
    fields: {
      symptoms: '示意症狀描述。',
      causes: '',
      selfCheckGuide: '',
      whenToSeeDoctor: '',
      coverImageUrl: '',
    },
  },
]

export const SEED_ARTICLES: SeedRecord[] = [
  {
    seedKey: 'article-1',
    title: '（示意）淺談皮秒雷射的適應症',
    slug: 'about-picosecond',
    status: 3,
    sortOrder: 1,
    fields: {
      categoryTermSeedKey: 'term-blog-med',
      authorDoctorSeedKey: 'doctor-a',
      authorName: '',
      reviewerDoctorSeedKey: 'doctor-b',
      reviewedOn: '2026-08-01',
      displayDate: '2026-08-05',
      coverImageUrl: '/assets/img/index-p01.jpg',
      summary: '示意摘要文字。',
      bodyBlocks: '示意內文段落（正式內容待撰寫）。',
      readingMinutes: 4,
      sourceSite: 1,
    },
  },
  {
    seedKey: 'article-2',
    title: '（示意）敏感肌的日常保養重點',
    slug: 'sensitive-skin-care',
    status: 2,
    sortOrder: 2,
    ownerUserId: 3,
    fields: {
      categoryTermSeedKey: 'term-blog-derm',
      authorDoctorSeedKey: 'doctor-a',
      authorName: '',
      reviewerDoctorSeedKey: null,
      reviewedOn: '',
      displayDate: '2026-09-01',
      coverImageUrl: '',
      summary: '示意摘要文字，此筆用來示範送審中狀態（本文鎖定）。',
      bodyBlocks: '示意內文（保證有效！）— 刻意保留這句以示範高風險字詞警示。',
      readingMinutes: 3,
      sourceSite: 1,
    },
  },
  {
    seedKey: 'article-3',
    title: '（示意）2020 媒體採訪紀錄',
    slug: 'media-2020',
    status: 4,
    sortOrder: 3,
    fields: {
      categoryTermSeedKey: 'term-blog-media',
      authorDoctorSeedKey: null,
      authorName: '編輯部',
      reviewerDoctorSeedKey: null,
      reviewedOn: '',
      displayDate: '2020-05-01',
      coverImageUrl: '',
      summary: '示意摘要，示範「已下架」狀態。',
      bodyBlocks: '示意內文。',
      readingMinutes: 2,
      sourceSite: 2,
    },
  },
]

export const SEED_CASES: SeedRecord[] = [
  {
    seedKey: 'case-1',
    title: '（示意）皮秒雷射案例分享',
    slug: 'case-picosecond-01',
    status: 3,
    sortOrder: 1,
    fields: {
      treatmentSeedKey: 'treatment-picosecond',
      sessionsText: '3 次，間隔 4 週',
      narrative: '示意敘述文字。',
      individualVarianceStatement: '效果因個人體質與術後照護而異，本案例結果不代表所有使用者皆能達到相同效果。',
      hasWrittenConsent: true,
      consentReference: 'CONSENT-2026-0001（示意編號，同意書正本存放於院內）',
      shootingConditions: '同一光源、同一角度，術前與術後 4 週拍攝。',
    },
  },
  {
    seedKey: 'case-2',
    title: '（示意）電波拉皮案例分享',
    slug: 'case-rf-01',
    status: 1,
    sortOrder: 2,
    fields: {
      treatmentSeedKey: 'treatment-rf',
      sessionsText: '',
      narrative: '',
      individualVarianceStatement: '效果因個人體質與術後照護而異。',
      hasWrittenConsent: false,
      consentReference: '',
      shootingConditions: '',
    },
  },
]

export const SEED_FAQS: SeedRecord[] = [
  {
    seedKey: 'faq-1',
    title: '皮秒雷射會痛嗎？',
    status: 3,
    sortOrder: 1,
    fields: {
      categoryTermSeedKey: 'term-faq-treatment',
      webAnswer: '示意網頁版答案（150–400 字），實際內容待醫師確認後補齊。多數療程會先施作局部麻醉膏以降低不適感。',
      aiAnswer: '示意 AI 摘要版答案（60–100 字），語意需自足，供 AI FAQ 與結構化資料使用。',
      lastReviewedOn: '2026-08-01',
    },
  },
  {
    seedKey: 'faq-2',
    title: '第一次看診需要準備什麼？',
    status: 2,
    sortOrder: 2,
    fields: {
      categoryTermSeedKey: 'term-faq-doctor',
      webAnswer: '示意網頁版答案，示範送審中狀態。',
      aiAnswer: '示意 AI 摘要版答案。',
      lastReviewedOn: '2026-09-01',
    },
  },
  {
    seedKey: 'faq-3',
    title: '費用怎麼計算？',
    status: 3,
    sortOrder: 3,
    fields: {
      categoryTermSeedKey: 'term-faq-fee',
      webAnswer: '示意網頁版答案，實際費用以現場評估與報價為準。',
      aiAnswer: '示意 AI 摘要版答案。',
      lastReviewedOn: '2026-07-01',
    },
  },
]

export const SEED_CLINICS: SeedRecord[] = [
  {
    seedKey: 'clinic-siji',
    title: '四季診所',
    slug: 'siji',
    status: 3,
    sortOrder: 1,
    fields: {
      address: '彰化縣二林鎮○○路○○號（示意）',
      phone: '04-XXX-XXXX',
      lineUrl: '',
      latitude: 23.9,
      longitude: 120.4,
      mapUrl: '',
      transportInfo: '示意交通資訊。',
      intro: '示意據點介紹。',
      businessHours: [
        { dayOfWeek: 1, startTime: '09:00', endTime: '13:00' },
        { dayOfWeek: 1, startTime: '17:00', endTime: '21:00' },
      ],
      photos: [],
    },
  },
  {
    seedKey: 'clinic-erlin',
    title: '二林四季皮膚科',
    slug: 'erlin',
    status: 3,
    sortOrder: 2,
    fields: {
      address: '彰化縣二林鎮○○路○○號（示意）',
      phone: '04-XXX-XXXX',
      lineUrl: '',
      latitude: 23.9,
      longitude: 120.4,
      mapUrl: '',
      transportInfo: '',
      intro: '',
      businessHours: [{ dayOfWeek: 2, startTime: '08:30', endTime: '12:00' }],
      photos: [],
    },
  },
]

/** docs/08-database.md §C-8：11 筆系統頁種子 + 自由頁 6 筆（此處示意，未全列）。 */
export const SEED_PAGES: SeedRecord[] = [
  { seedKey: 'page-home', title: '首頁版位', status: 3, sortOrder: 0, isSystemLocked: true, fields: { pageKind: 2, systemKey: 'home', lead: '', bodyBlocks: '', superAdminOnly: false } },
  { seedKey: 'page-team', title: '醫師列表', status: 3, sortOrder: 1, isSystemLocked: true, fields: { pageKind: 2, systemKey: 'team-index', lead: '示意導言。', bodyBlocks: '', superAdminOnly: false } },
  { seedKey: 'page-treatments', title: '療程總覽', status: 3, sortOrder: 2, isSystemLocked: true, fields: { pageKind: 2, systemKey: 'treatments-index', lead: '', bodyBlocks: '', superAdminOnly: false } },
  { seedKey: 'page-concerns', title: '困擾總覽', status: 3, sortOrder: 3, isSystemLocked: true, fields: { pageKind: 2, systemKey: 'concerns-index', lead: '', bodyBlocks: '', superAdminOnly: false } },
  { seedKey: 'page-blog', title: '文章列表', status: 3, sortOrder: 4, isSystemLocked: true, fields: { pageKind: 2, systemKey: 'blog-index', lead: '', bodyBlocks: '', superAdminOnly: false } },
  { seedKey: 'page-cases', title: '案例列表', status: 3, sortOrder: 5, isSystemLocked: true, fields: { pageKind: 2, systemKey: 'cases-index', lead: '', bodyBlocks: '', superAdminOnly: false } },
  { seedKey: 'page-faq', title: 'FAQ', status: 3, sortOrder: 6, isSystemLocked: true, fields: { pageKind: 2, systemKey: 'faq-index', lead: '', bodyBlocks: '', superAdminOnly: false } },
  { seedKey: 'page-clinics', title: '據點列表', status: 3, sortOrder: 7, isSystemLocked: true, fields: { pageKind: 2, systemKey: 'clinics-index', lead: '', bodyBlocks: '', superAdminOnly: false } },
  { seedKey: 'page-contact', title: '聯絡我們', status: 3, sortOrder: 8, isSystemLocked: true, fields: { pageKind: 2, systemKey: 'contact', lead: '示意聯絡頁導言。', bodyBlocks: '', superAdminOnly: false } },
  { seedKey: 'page-search', title: '搜尋結果', status: 3, sortOrder: 9, isSystemLocked: true, fields: { pageKind: 2, systemKey: 'search', lead: '', bodyBlocks: '', superAdminOnly: false } },
  { seedKey: 'page-404', title: '404', status: 3, sortOrder: 10, isSystemLocked: true, fields: { pageKind: 2, systemKey: 'not-found', lead: '', bodyBlocks: '', superAdminOnly: false } },
  { seedKey: 'page-about', title: '品牌理念', slug: 'about', status: 3, sortOrder: 11, fields: { pageKind: 1, systemKey: '', lead: '示意導言。', bodyBlocks: '示意內文。', superAdminOnly: false } },
  { seedKey: 'page-privacy', title: '隱私權政策', slug: 'privacy', status: 3, sortOrder: 12, fields: { pageKind: 1, systemKey: '', lead: '', bodyBlocks: '示意條文內容。', superAdminOnly: true } },
  { seedKey: 'page-terms', title: '服務條款', slug: 'terms', status: 3, sortOrder: 13, fields: { pageKind: 1, systemKey: '', lead: '', bodyBlocks: '示意條文內容。', superAdminOnly: true } },
]

/** 種子關聯：全部用 seedKey 表示，client.ts 載入時換算成真正 Id。 */
export const SEED_RELATIONS: SeedRelation[] = [
  { fromKey: 'treatment-picosecond', toKey: 'doctor-a', relationType: 1, sortOrder: 1 },
  { fromKey: 'treatment-picosecond', toKey: 'concern-acne', relationType: 2, sortOrder: 1 },
  { fromKey: 'treatment-picosecond', toKey: 'article-1', relationType: 3, sortOrder: 1 },
  { fromKey: 'treatment-picosecond', toKey: 'faq-1', relationType: 4, sortOrder: 1 },
  { fromKey: 'concern-acne', toKey: 'treatment-picosecond', relationType: 5, sortOrder: 1, note: '色素沉澱與粗大毛孔的首選示意療程。' },
  { fromKey: 'concern-acne', toKey: 'faq-1', relationType: 6, sortOrder: 1 },
  { fromKey: 'clinic-siji', toKey: 'doctor-a', relationType: 8, sortOrder: 1 },
  { fromKey: 'clinic-siji', toKey: 'treatment-picosecond', relationType: 9, sortOrder: 1 },
  { fromKey: 'article-1', toKey: 'term-tag-picosecond', relationType: 11, sortOrder: 1 },
]
