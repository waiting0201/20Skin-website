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
  /** 後台 SEO 區塊的覆寫（見 _content.ts 的 seoOverridesOf）。 */
  seo: ReturnType<typeof seoOverridesOf>
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

// ── 資料來源：content/doctors.json（建置期由資料庫匯出，docs/09 §3）──────
//
// ⚠️ 這支檔案從「內容本體」變成「形狀轉接層」：欄位怎麼排、叫什麼名字是前台的契約，
//    內容本身在資料庫。兩者分開之後，院方在後台改一個字，重建就會反映在這裡。
//
// ⚠️ 反向關聯（這位醫師出現在哪些療程）要從療程那一端掃回來 ——
//    雙向關聯一律單向存（docs/08 §D），不是資料缺漏。

import { REL, TERM, UNIT, bySlug, img, inboundRelations, loadUnit, parseBlocks, relationsOf, seoOverridesOf, termBy, type ContentRecord } from './_content'

interface BioDocument {
  heroRole: string | null
  yearsInPractice: string | null
  paragraphs: string[]
}

/** 一次算繪要用到的其他單元。理由同 treatments.ts 的 TreatmentContext。 */
interface DoctorContext {
  treatments: ContentRecord[]
  terms: ContentRecord[]
  clinics: ContentRecord[]
  /** 醫師 id → 他署名的文章。由 API 以 authorDoctorId 篩出來，不是前端過濾。 */
  articlesByAuthor: Map<number, ContentRecord[]>
}

function toDoctor(ctx: DoctorContext, record: ContentRecord): Doctor {
  const f = record.fields
  const bio = parseBlocks<BioDocument>(f.bio, { heroRole: null, yearsInPractice: null, paragraphs: [] })
  const tags = (f.tags ?? []) as { type: number; tag: string; sortOrder: number }[]
  const credentials = (f.credentials ?? []) as { type: number; text: string; sortOrder: number }[]

  // 時間軸的標籤與 DoctorCredentials.Type 一一對應（docs/08 §C-2）。
  // ⚠️ 現職（4）與經歷（2）是兩種標籤，2026-09-11 之前資料庫沒有 4，併在一起畫面會變。
  const label: Record<number, DoctorTimelineEntry['label']> = { 4: '現職', 1: '學歷', 2: '經歷' }
  // ⚠️ 依 sortOrder 還原「文件順序」，不要用 API 回傳的順序 ——
  //    那是 Type → SortOrder 排的（BuildDoctorFields），會把「現職」排到學歷與經歷後面。
  //    個人頁的時間軸是一份有敘事順序的清單，不是依類型分組。
  const timeline = credentials
    .filter((c) => c.type !== 3)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => ({ label: label[c.type] ?? '經歷', text: c.text }))

  const photo = img(f.photo)

  return {
    slug: record.slug as string,
    name: record.title,
    seo: seoOverridesOf(record),
    isPhysician: Boolean(f.isPhysician),
    jobTitle: (f.jobTitle as string) ?? '',
    heroRole: bio.heroRole ?? undefined,
    specialty: (f.specialty as string) ?? undefined,
    photo: { src: photo?.src ?? '', width: photo?.width ?? 0, height: photo?.height ?? 0 },
    tags: tags.filter((t) => t.type === 1).map((t) => t.tag),
    // ⚠️ 沒有專長領域（後台的「專長領域」欄）時要回 undefined 而不是空陣列 —— 個人頁的 displayTags 用
    //    `expertiseTags ?? tags` 退回專長標籤，空陣列不會觸發 ?? ，整個「專長領域」區塊就消失了。
    expertiseTags: tags.some((t) => t.type === 2)
      ? tags.filter((t) => t.type === 2).map((t) => t.tag)
      : undefined,
    yearsInPractice: bio.yearsInPractice ?? undefined,
    lede: record.summary ?? undefined,
    bio: bio.paragraphs.length ? bio.paragraphs : undefined,
    timeline: timeline.length ? timeline : undefined,
    certifications: credentials
      .filter((c) => c.type === 3)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => c.text),
    concerns: relationsOf(record, REL.doctorToConcern).map((r) => ({
      slug: r.toSlug as string,
      label: r.toTitle as string,
    })),
    treatments: inboundRelations(ctx.treatments, REL.treatmentToDoctor, record.slug as string)
      .map((t) => {
        const categoryId = t.fields.categoryTermId as number
        const category = ctx.terms.find((x) => x.id === categoryId)
        const cover = img(t.fields.cover)
        return {
          categoryLabel: category?.title ?? '',
          categorySlug: (category?.slug ?? '') as DoctorTreatmentRef['categorySlug'],
          slug: t.slug as string,
          name: t.title,
          image: { src: cover?.src ?? '', width: cover?.width ?? 0, height: cover?.height ?? 0, alt: cover?.alt ?? '' },
        }
      }),
    // 個人頁的文章列表＝這位醫師署名的文章（docs/08 §C-4 AuthorDoctorId）。
    // 個人頁的文章＝這位醫師署名的那幾篇。⚠️ 由 API 以 authorDoctorId 篩出來，
    //    不是撈回 1100 篇再前端過濾。
    articles: (ctx.articlesByAuthor.get(record.id) ?? [])
      .map((a) => {
        const cover = img(a.fields.cover)
        const category = ctx.terms.find((x) => x.id === a.fields.categoryTermId)
        return {
          category: category?.title ?? '',
          title: a.title,
          excerpt: a.summary ?? '',
          href: a.urlPath ?? '#',
          // ⚠️ `ContentRecord` 沒有 `name` 欄位（醫師的顯示名就是 `title`）——
          //    原本寫 `record.name ?? record.title`，左邊永遠是 undefined，
          //    等於一條永遠不會走到的路徑。2026-09-16 由 typecheck 抓到。
          byline: record.title,
          date: String(a.fields.displayDate ?? '').slice(0, 10),
          image: { src: cover?.src ?? '', width: cover?.width ?? 0, height: cover?.height ?? 0, alt: cover?.alt ?? '' },
        }
      }),
    media: parseBlocks<DoctorMediaRef[]>(f.publications, []),
    // 駐診據點寫在據點那一端（型別 8），備註放在關聯的 Note。
    clinics: ctx.clinics.flatMap((c) =>
      relationsOf(c, REL.clinicToDoctor)
        .filter((r) => r.toSlug === record.slug)
        .map((r) => ({
          clinicSlug: c.slug as ClinicSlug,
          ...(r.note ? { scheduleNote: r.note } : {}),
        })),
    ),
  }
}

export async function getDoctors(): Promise<Doctor[]> {
  const [doctors, treatments, terms, clinics] = await Promise.all([
    loadUnit(UNIT.doctor),
    loadUnit(UNIT.treatment),
    loadUnit(UNIT.term),
    loadUnit(UNIT.clinic),
  ])

  // 每位醫師署名的文章各自向 API 要。⚠️ 14 位醫師＝14 次查詢，但每次只回那幾篇；
  //    相對於「撈 1100 篇回來自己分組」，傳輸量差三個數量級。
  const byAuthor = await Promise.all(
    doctors.map(async (d) => [d.id, (await articlePage(1, 100, { authorDoctorId: d.id })).items] as const),
  )
  const ctx: DoctorContext = {
    treatments, terms, clinics,
    articlesByAuthor: new Map(byAuthor),
  }

  return doctors
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    .map((record) => toDoctor(ctx, record))
}

export async function findDoctor(slug: string): Promise<Doctor | undefined> {
  return (await getDoctors()).find((d) => d.slug === slug)
}

export async function doctorsByClinic(clinicSlug: ClinicSlug, physiciansOnly = false): Promise<Doctor[]> {
  return (await getDoctors()).filter(
    (d) => d.clinics.some((c) => c.clinicSlug === clinicSlug) && (!physiciansOnly || d.isPhysician),
  )
}
