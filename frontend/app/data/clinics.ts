// 診所據點資料 —— 模板 16（/clinics/）與模板 17（/clinics/{slug}/）共用。
//
// 形狀對齊 docs/08-database.md §C-7 Clinics ＋ ClinicBusinessHours ＋ ClinicPhotos。
// 內容逐字取自 mockup/17-clinic-list.html 與 mockup/08-clinic-detail.html
// （後者實際內容是二林四季皮膚科；四季診所目前沒有專屬的 mockup 明細頁，
// 缺的段落一律留空由模板整段不渲染，不杜撰，見各欄位註解）。
//
// NAP（名稱／地址／電話）與 app/data/navigation.ts 的 CLINIC_NAP 是同一組事實，
// 直接從那裡取值以確保逐字一致（docs/03-seo-geo.md §4③：NAP 不一致會降低 AI
// 對品牌實體的確信度）。navigation.ts 是唯讀檔案，這裡只讀取不改寫。
import { CLINIC_NAP } from '~/data/navigation'

export type ClinicSlug = 'siji' | 'erlin'
export type TreatmentCategorySlug = 'laser' | 'microneedle' | 'photoelectric' | 'skincare'

/** ClinicBusinessHours：一天可有多列以表達午休斷點，休診日＝當天完全沒有列。
 *  day 依 schema.org 慣例 0=日 1=一…6=六。這是給 openingHoursSpecification 用
 *  的精確版本，Sat 收診時間等資訊取自 mockup 的頁尾備註文字而非表格儲存格
 *  （表格為版面簡化呈現，見下方 hoursTable 的註解）。 */
export interface ClinicBusinessHour {
  day: 0 | 1 | 2 | 3 | 4 | 5 | 6
  start: string
  end: string
}

/** c-hours 表格的顯示列。days 依表格欄位順序（一二三四五六日）記錄是否看診，
 *  刻意與上方 businessHours 分開維護 —— mockup 的表格把週六短診時段併在同一列
 *  裡用勾號表示「有看診」，實際收診時間較早，於頁尾備註文字（hoursFootnote）
 *  另外說明，兩者合起來才是完整事實，拆開存反而失真。 */
export interface ClinicHoursTableRow {
  label: string
  days: [boolean, boolean, boolean, boolean, boolean, boolean, boolean]
}

export interface ClinicPhoto {
  src: string
  width: number
  height: number
  alt: string
  caption: string
}

export interface ClinicTransportStep {
  icon: 'car' | 'bus' | 'parking'
  title: string
  points: string[]
}

export interface ClinicFaqItem {
  question: string
  answer: string
  lastReviewedOn?: string
}

export interface ClinicTreatmentGroup {
  categoryLabel: string
  categorySlug: TreatmentCategorySlug
  items: { label: string; slug?: string }[]
}

export interface Clinic {
  slug: ClinicSlug
  name: string
  eyebrow: string
  /** 列表卡片用的英文角色標籤，例如 MEDICAL AESTHETICS。 */
  roleLabel: string
  /** 列表卡片的簡述。 */
  desc: string
  /** 明細頁 Hero 的一句話介紹。 */
  lede: string
  phone: string
  phoneHref: string
  address: string
  /** 列表卡片與 NAP 區塊用的門診時段一句話摘要，逐字取自 navigation.ts 的
   *  CLINIC_NAP.hours，與頁尾保持同一來源。 */
  hoursSummary: string
  /** <title>／meta description 用。 */
  pageDescription: string
  /** JSON-LD description，含門診時段摘要，對應 mockup 的 MedicalClinic JSON-LD 寫法。 */
  jsonLdDescription: string
  /** docs/03-seo-geo.md §2 MedicalClinic.medicalSpecialty，直接取自該院區自己的簡述文字。 */
  medicalSpecialty: string[]
  facebookUrl?: string
  /** Facebook 連結的顯示文字（各院區的官方粉專名稱不同）。 */
  facebookLabel?: string
  /** 待補：mockup 全站沒有任何院區的 LINE 官方帳號連結可抄，不臆造。 */
  lineUrl?: string
  /** 待補：mockup 的「在 Google 地圖開啟」一律是 # 佔位連結，尚無實際網址。 */
  mapUrl?: string
  /** 待補：docs/08 §C-7 要求 decimal(9,6) 座標，地址本身也還是佔位地址
   *  （彰化縣二林鎮○○路○○號），沒有真實地點就沒有真實座標，不臆造，
   *  JSON-LD 的 geo 屬性在座標補齊前不會輸出。 */
  latitude?: number
  longitude?: number
  heroPhoto: ClinicPhoto
  /** 僅二林四季皮膚科的 mockup 有「院區環境」段落的實際照片；四季診所沒有
   *  對應素材可用，此欄位留空，模板整段不渲染。 */
  galleryPhotos?: ClinicPhoto[]
  transportInfo: ClinicTransportStep[]
  businessHours: ClinicBusinessHour[]
  hoursTable: ClinicHoursTableRow[]
  hoursFootnote: string
  /** 僅二林四季皮膚科的 mockup 有「本院區可提供的療程」段落；四季診所雖然是
   *  醫學美容主力院區，但 mockup 沒有給出逐項對應清單，寧可留空也不杜撰
   *  哪些療程實際在哪個院區施作。 */
  treatmentGroups?: ClinicTreatmentGroup[]
  /** 僅二林四季皮膚科的 mockup 提到「皮膚科一般診療」，四季診所定位為醫學美容
   *  為主，本來就不適用這段內容。 */
  generalServices?: string[]
  faqs: ClinicFaqItem[]
}

function nap(href: string) {
  const entry = CLINIC_NAP.find((n) => n.href === href)
  if (!entry) throw new Error(`clinics.ts：找不到 navigation.ts CLINIC_NAP 對應項目 ${href}`)
  return entry
}

const sijiNap = nap('/clinics/siji/')
const erlinNap = nap('/clinics/erlin/')

export const CLINICS: Clinic[] = [
  {
    slug: 'siji',
    name: sijiNap.name,
    eyebrow: 'SIJI CLINIC',
    roleLabel: 'MEDICAL AESTHETICS',
    desc: '以醫學美容與光電療程為主，設有獨立諮詢空間與療程室，多數雷射、電波與注射項目皆在此進行。',
    lede: '以醫學美容與光電療程為主，設有獨立諮詢空間與療程室，多數雷射、電波與注射項目皆在此進行。',
    phone: sijiNap.phone,
    phoneHref: 'tel:+886400000000',
    address: sijiNap.address,
    hoursSummary: sijiNap.hours,
    pageDescription: '四季診所（20SKIN 美醫集團）位於彰化縣二林鎮，提供醫學美容與光電雷射療程，完整地址、電話與門診時段一次看。',
    jsonLdDescription: '四季診所位於彰化縣二林鎮，提供醫學美容與光電雷射療程，週一二四五09:00–13:00／17:00–21:00，週六09:00–12:30，週三、日休診。',
    medicalSpecialty: ['醫學美容'],
    facebookUrl: 'https://www.facebook.com/20skin4g88/',
    facebookLabel: '四季診所',
    heroPhoto: {
      src: '/assets/img/photo-facade-detail.jpg',
      width: 1800,
      height: 1167,
      alt: '四季診所白磚立面與招牌',
      caption: '四季診所．院區外觀',
    },
    transportInfo: [
      { icon: 'car', title: '開車前往', points: ['下交流道後沿主要道路直行即可抵達。', '兩院區相距步行可達的距離，走錯不用重新搭車。'] },
      { icon: 'bus', title: '大眾運輸', points: ['可搭乘客運至二林站，下車後步行前往。', '詳細班次請以客運業者公告時刻表為準。'] },
      { icon: 'parking', title: '停車資訊', points: ['周邊停車位置與特約停車方式，可於預約時一併洽詢櫃檯。'] },
    ],
    businessHours: [
      { day: 1, start: '09:00', end: '13:00' },
      { day: 1, start: '17:00', end: '21:00' },
      { day: 2, start: '09:00', end: '13:00' },
      { day: 2, start: '17:00', end: '21:00' },
      { day: 4, start: '09:00', end: '13:00' },
      { day: 4, start: '17:00', end: '21:00' },
      { day: 5, start: '09:00', end: '13:00' },
      { day: 5, start: '17:00', end: '21:00' },
      { day: 6, start: '09:00', end: '12:30' },
    ],
    hoursTable: [
      { label: '09:00–13:00', days: [true, true, false, true, true, true, false] },
      { label: '17:00–21:00', days: [true, true, true, true, true, false, false] },
    ],
    hoursFootnote: '週日休診。六上午看診至 12:30。',
    faqs: [
      {
        question: '兩個院區有什麼不同？',
        answer:
          '四季診所以醫學美容與光電療程為主；二林四季皮膚科以一般皮膚疾病門診為主，同時提供基礎光電與保養類療程。兩院區的門診時段與駐診醫師不同，預約時請留意。',
      },
      {
        question: '可以在 A 院區看診、B 院區做療程嗎？',
        answer: '部分項目因設備配置只在特定院區提供。面診時醫師會說明該項目在哪一個院區施作，並協助安排時段。',
      },
      {
        question: '沒有預約可以直接到現場嗎？',
        answer: '可以現場掛號，但需視當日名額與候診狀況，已預約者優先看診。建議先行預約以縮短等候時間。',
      },
    ],
  },
  {
    slug: 'erlin',
    name: erlinNap.name,
    eyebrow: 'ERLIN CLINIC',
    roleLabel: 'DERMATOLOGY',
    desc: '以一般皮膚疾病門診為主，涵蓋濕疹、蕁麻疹、灰指甲等診療，同時提供基礎光電與保養類療程。',
    lede: '紮根彰化二林的皮膚科專科診所，一般皮膚疾病與醫學美容並行。',
    phone: erlinNap.phone,
    phoneHref: 'tel:0400000000',
    address: erlinNap.address,
    hoursSummary: erlinNap.hours,
    pageDescription: '二林四季皮膚科（20SKIN 美醫集團）位於彰化縣二林鎮，提供一般皮膚科診療與醫學美容服務，完整地址、電話與門診時段一次看。',
    jsonLdDescription: '二林四季皮膚科位於彰化縣二林鎮，提供一般皮膚科診療與醫學美容服務，週一二四五08:30–12:00／15:00–21:00，週三六08:30–12:00／15:00–18:00，週日休診。',
    medicalSpecialty: ['皮膚科', '醫學美容'],
    facebookUrl: 'https://www.facebook.com/20skin.tw',
    facebookLabel: '20SKIN 美醫集團',
    heroPhoto: {
      src: '/assets/img/photo-street-green.jpg',
      width: 1800,
      height: 1119,
      alt: '二林四季皮膚科周邊街景與行道樹',
      caption: '二林四季皮膚科．院區周邊街景',
    },
    galleryPhotos: [
      {
        src: '/assets/img/photo-glass-facade.jpg',
        width: 1488,
        height: 1800,
        alt: '玻璃立面與 20SKIN 蝕刻標誌',
        caption: '玻璃立面與品牌標誌',
      },
      {
        src: '/assets/img/photo-brand-detail.jpg',
        width: 1800,
        height: 1038,
        alt: '品牌識別牆面與大理石細節',
        caption: '品牌識別牆面細節',
      },
    ],
    transportInfo: [
      { icon: 'car', title: '開車前往', points: ['由台 19 線轉入二林市區，往鎮公所方向行駛約 5 分鐘。', '院區周邊道路標示以現場實際指標為準。'] },
      { icon: 'bus', title: '大眾運輸', points: ['可搭乘彰化客運至二林站，下車後步行約 10 分鐘可達。', '詳細班次請以客運公司公告時刻表為準。'] },
      { icon: 'parking', title: '停車資訊', points: ['院區周邊備有路邊停車格。', '鄰近設有付費停車場，步行約 3–5 分鐘可達。'] },
    ],
    businessHours: [
      { day: 1, start: '08:30', end: '12:00' },
      { day: 1, start: '15:00', end: '21:00' },
      { day: 2, start: '08:30', end: '12:00' },
      { day: 2, start: '15:00', end: '21:00' },
      { day: 3, start: '08:30', end: '12:00' },
      { day: 3, start: '15:00', end: '18:00' },
      { day: 4, start: '08:30', end: '12:00' },
      { day: 4, start: '15:00', end: '21:00' },
      { day: 5, start: '08:30', end: '12:00' },
      { day: 5, start: '15:00', end: '21:00' },
      { day: 6, start: '08:30', end: '12:00' },
      { day: 6, start: '15:00', end: '18:00' },
    ],
    hoursTable: [
      { label: '08:30–12:00', days: [true, true, true, true, true, true, false] },
      { label: '15:00–18:00', days: [true, true, true, true, true, true, false] },
      { label: '18:00–21:00', days: [true, true, false, true, true, false, false] },
    ],
    hoursFootnote: '週日休診。',
    treatmentGroups: [
      {
        categoryLabel: '光療美顏',
        categorySlug: 'laser',
        items: [
          { label: 'Picosure® Pro 蜂巢皮秒雷射', slug: 'picosure-pro' },
          { label: 'Capri 藍雷射', slug: 'capri-blue' },
          { label: 'D.O.E HELIOS III 光繞雷射', slug: 'helios-iii' },
        ],
      },
      {
        categoryLabel: '微針美容',
        categorySlug: 'microneedle',
        items: [
          { label: 'Sculptra 舒顏萃 4D聚左旋乳酸', slug: 'sculptra' },
          { label: '電動微針療程' },
        ],
      },
      {
        categoryLabel: '光電美容',
        categorySlug: 'photoelectric',
        items: [
          { label: 'Thermage FLX 鳳凰電波', slug: 'thermage-flx' },
          { label: 'Ultherapy 音波拉皮', slug: 'ulthera' },
        ],
      },
      {
        categoryLabel: '醫美保養',
        categorySlug: 'skincare',
        items: [{ label: 'HydraFacial 海菲秀', slug: 'hydrafacial' }],
      },
    ],
    generalServices: ['一般皮膚疾病', '兒童皮膚過敏', '特殊皮膚疾病', '皮膚腫瘤處理'],
    faqs: [
      {
        question: '需要預約才能看診嗎？',
        answer: '建議透過線上預約系統或 LINE 官方帳號提前預約，以掌握看診順序；亦可現場掛號，惟需視當日看診狀況等候。',
        lastReviewedOn: '2026-08',
      },
      {
        question: '可以查詢目前看診進度嗎？',
        answer: '可透過 LINE 官方帳號洽詢目前看診進度，現場亦設有看診號次顯示，方便掌握等候時間。',
        lastReviewedOn: '2026-08',
      },
      {
        question: '初診要帶什麼？',
        answer: '請攜帶健保卡與身分證件；如有其他院所的診療紀錄或用藥資訊，建議一併攜帶供醫師參考。',
        lastReviewedOn: '2026-08',
      },
      {
        question: '有提供停車位嗎？',
        answer: '院區周邊備有路邊停車格，鄰近亦有付費停車場，詳見上方「位置與交通」段落。',
        lastReviewedOn: '2026-08',
      },
      {
        question: '兒童皮膚問題可以看嗎？',
        answer: '可以，本院區提供兒童皮膚過敏及一般皮膚疾病診療服務，建議掛號時告知孩童年齡以利安排。',
        lastReviewedOn: '2026-08',
      },
    ],
  },
]

export function findClinic(slug: string): Clinic | undefined {
  return CLINICS.find((c) => c.slug === slug)
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

/** docs/03-seo-geo.md §2：MedicalClinic 的 openingHoursSpecification，支援午休斷點
 *  （同一天多列即可，不用「開始／結束＋午休開始／午休結束」四欄位硬撐）。 */
export function clinicOpeningHours(clinic: Clinic) {
  return clinic.businessHours.map((h) => ({
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: `https://schema.org/${DAY_NAMES[h.day]}`,
    opens: h.start,
    closes: h.end,
  }))
}
