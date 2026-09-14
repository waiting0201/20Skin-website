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

// ── 資料來源：content/clinics.json（docs/09 §3）──────────────────────────
//
// ⚠️ 版面用的字串（英文小標、英文角色標籤、時段表格、JSON-LD 的固定描述）留在前台 ——
//    它們由設計稿決定，不是院方會在後台改的內容（見 _presentation.ts 的分類原則）。
//    真正的內容（地址、電話、門診時段、交通資訊、照片、介紹）都在資料庫。

import { CONTENT, REL, img, parseBlocks, relationsOf, type ContentRecord } from './_content'
import { eyebrowFor } from './_presentation'
// ⚠️ CLINIC_NAP 已在檔案上方 import 過（2026-09-11 搬遷時這裡多了一份重複的）。
//    Vite 會把相同的 import 去重，所以前台建置一直是綠的，但在標準 ES module
//    裡「同一個識別字宣告兩次」是語法錯誤 —— dump.mjs 用裸 Node 跑就會當場失敗。

/** 版面字串：與內容無關，改版面才會動。 */
const PRESENTATION: Record<string, {
  eyebrow: string
  phoneHref: string
  hoursFootnote: string
  jsonLdDescription: string
  roleLabel: string
  medicalSpecialty: string[]
  facebookUrl?: string
  facebookLabel?: string
}> = {
  siji: {
    eyebrow: 'SIJI CLINIC',
    phoneHref: 'tel:+886400000000',
    hoursFootnote: '週日休診。六上午看診至 12:30。',
    jsonLdDescription: '四季診所位於彰化縣二林鎮，提供醫學美容與光電雷射療程，週一二四五09:00–13:00／17:00–21:00，週六09:00–12:30，週三、日休診。',
    roleLabel: 'MEDICAL AESTHETICS',
    medicalSpecialty: ['Dermatology', 'CosmeticDentistry'],
    facebookUrl: 'https://www.facebook.com/20skin4g88/',
    facebookLabel: '四季診所',
  },
  erlin: {
    eyebrow: 'ERLIN CLINIC',
    phoneHref: 'tel:+886400000000',
    hoursFootnote: '週日休診。',
    jsonLdDescription: '二林四季皮膚科位於彰化縣二林鎮，提供皮膚科一般診療與醫學美容療程。',
    roleLabel: 'DERMATOLOGY',
    medicalSpecialty: ['Dermatology'],
    facebookUrl: 'https://www.facebook.com/20skin.tw',
    facebookLabel: '20SKIN 美醫集團',
  },
}

function hoursTableOf(hours: { dayOfWeek: number; startTime: string; endTime: string }[]): ClinicHoursTableRow[] {
  const rows = new Map<string, ClinicHoursTableRow>()
  for (const h of hours) {
    const label = `${h.startTime.slice(0, 5)}–${h.endTime.slice(0, 5)}`
    const row = rows.get(label) ?? { label, days: [false, false, false, false, false, false, false] }
    // ⚠️ 欄位順序是「一二三四五六日」（HOURS_WEEKDAY_LABELS），而 DoctorSchedules／
    //    ClinicBusinessHours 的 DayOfWeek 是 0＝星期日（docs/08 §C-7）。差一格就整排錯開。
    row.days[(h.dayOfWeek + 6) % 7] = true
    rows.set(label, row)
  }
  return [...rows.values()]
}

const toPhoto = (value: unknown, caption: string, fallbackAlt: string): ClinicPhoto => {
  const i = img(value)
  return { src: i?.src ?? '', width: i?.width ?? 0, height: i?.height ?? 0, alt: i?.alt || fallbackAlt, caption }
}

function toClinic(record: ContentRecord): Clinic {
  const f = record.fields
  const slug = record.slug as ClinicSlug
  const look = PRESENTATION[slug] ?? {
    eyebrow: '', phoneHref: '', hoursFootnote: '', jsonLdDescription: '', roleLabel: '', medicalSpecialty: [],
  }
  const nap = CLINIC_NAP.find((n) => n.name === record.title)
  const hours = ((f.businessHours ?? []) as { dayOfWeek: number; startTime: string; endTime: string; sortOrder: number }[])
    .slice()
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.sortOrder - b.sortOrder)
  const photos = (f.photos ?? []) as { image: unknown; caption: string | null; sortOrder: number }[]
  const intro = parseBlocks<{ lede: string | null } | null>(f.intro, null)

  return {
    slug,
    name: record.title,
    eyebrow: look.eyebrow || eyebrowFor(slug),
    roleLabel: look.roleLabel,
    desc: record.summary ?? '',
    lede: intro?.lede ?? record.summary ?? '',
    phone: (f.phone as string) ?? '',
    phoneHref: look.phoneHref,
    address: (f.address as string) ?? '',
    // ⚠️ 門診時段的一句話摘要與頁尾共用同一份 NAP 主資料（docs/03 §4 ③：
    //    任何不一致都會降低 AI 對這個實體的確信度）。
    hoursSummary: nap?.hours ?? '',
    pageDescription: (record.seo?.metaDescription as string) ?? record.summary ?? '',
    jsonLdDescription: look.jsonLdDescription,
    medicalSpecialty: look.medicalSpecialty,
    facebookUrl: look.facebookUrl,
    facebookLabel: look.facebookLabel,
    latitude: (f.latitude as number) || undefined,
    longitude: (f.longitude as number) || undefined,
    heroPhoto: toPhoto(photos[0]?.image, photos[0]?.caption ?? '', record.title),
    galleryPhotos: photos.slice(1).map((p) => toPhoto(p.image, p.caption ?? '', record.title)),
    transportInfo: parseBlocks<ClinicTransportStep[]>(f.transportInfo, []),
    businessHours: hours.map((h) => ({
      day: h.dayOfWeek as ClinicBusinessHour['day'],
      start: h.startTime.slice(0, 5),
      end: h.endTime.slice(0, 5),
    })),
    // 時段表格由 businessHours 推導：同一組起訖時間是一列，該列標出星期幾有這個時段。
    // ⚠️ 不另存一份 —— 兩份會分岔。mockup 那份手寫表格就已經分岔了：它把週六標成
    //    09:00–13:00，而 businessHours 是 09:00–12:30；二林的 15:00–21:00 也被拆成兩段。
    //    頁面上的時間與實際門診時間不一樣，是這個專案裡最不該發生的錯。
    hoursTable: hoursTableOf(hours),
    hoursFootnote: PRESENTATION[slug]?.hoursFootnote ?? '',
    faqs: relationsOf(record, REL.clinicToFaq).map((r) => {
      const faq = CONTENT.faqs.find((x) => x.slug === r.toSlug)
      return {
        question: faq?.title ?? (r.toTitle as string),
        answer: (faq?.fields.webAnswer as string) ?? '',
        lastReviewedOn: (faq?.fields.lastReviewedOn as string) ?? undefined,
      }
    }),
  }
}

export const CLINICS: Clinic[] = CONTENT.clinics
  .slice()
  .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
  .map(toClinic)

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
