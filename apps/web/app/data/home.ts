// 首頁七個版位的內容來源（模板 1，mockup/index.html）。
//
// 對應 docs/02-backend-cms.md §3 的 HomeSections 種子 key：
//   hero / specialties / featured-treatments / latest-articles / doctors / clinics / brand-story
// 正式站由 HomeSectionItems（HomeSectionId + ContentItemId + SortOrder）勾選既有內容組成 ——
// 每個版位只能引用已存在的內容，不能另打文案。這裡先把 mockup 的原文抽成同樣的形狀，
// 接上 CMS 時只換資料來源、不改元件。
//
// 欄位命名對齊 docs/08-database.md 的 ContentItems／各模型主幹（title／slug／urlPath／summary），
// 圖片用 imagePath 是建置期產物的簡化表示 —— 正式站對應的是內嵌圖片欄位
// （CoverUrl／CoverAlt／CoverWidth…，見 docs/08-database.md §0 決策五），不是資料庫的實際欄位名。

import { CLINIC_NAP } from './navigation'

// ── 1. hero：主視覺輪播 ──────────────────────────────────────────────────
// 正式站對應 HomeSections.Settings 的 JSON（唯一沒有 ContentItemId 可引用的版位，
// 見 docs/02-backend-cms.md §3）。

export interface HeroSlide {
  imagePath: string
  imageWidth: number
  imageHeight: number
  alt: string
  caption: string
}

export interface SpecialtyEntry {
  title: string
  slug: string
  urlPath: string
  imagePath: string
  iconWidth: number
  iconHeight: number
}
export interface FeaturedTreatment {
  title: string
  categoryLabel: string
  categorySlug: string
  slug: string
  urlPath: string
  imagePath: string
  imageWidth: number
  imageHeight: number
  alt: string
}
export interface LatestArticle {
  title: string
  categoryLabel: string
  categorySlug: string
  urlPath: string
  summary: string
  imagePath: string
  imageWidth: number
  imageHeight: number
  alt: string
  authorLabel: string
  displayDate: string
  readingMinutes: number
}
export interface HomeDoctor {
  name: string
  jobTitle: string
  isPhysician: boolean
  urlPath: string
  photoPath: string
  photoWidth: number
  photoHeight: number
}
export interface ClinicHoursRow {
  timeRangeLabel: string
  /** 一～日（週一到週日）是否看診 */
  openDays: [boolean, boolean, boolean, boolean, boolean, boolean, boolean]
}
export interface HomeClinic {
  name: string
  urlPath: string
  phone: string
  address: string
  hoursRows: ClinicHoursRow[]
  hoursFootnote: string
}
// ── 資料來源：content/home.json ＋ 各單元（docs/09 §3、docs/08 §G-2）──────
//
// ⚠️ 七個版位「只能引用既有內容，不能另打文案」（docs/02 §3）。
//    精選療程／最新文章／醫師／據點走 Items（引用內容）；
//    主視覺輪播與八大專科入口沒有可引用的內容，走版位的 Settings JSON。
// ⚠️ 版位勾到草稿時匯出端已經濾掉（content-export），這裡拿到的都是已發布的。

import { UNIT, img, loadUnit } from './_content'
import { getClinicNap } from './navigation'

interface HomeSection {
  sectionKey: string
  title: string
  subtitle: string | null
  isEnabled: boolean
  sortOrder: number
  settings: unknown
  items: { contentItemId: number; contentType: number; slug: string | null; urlPath: string | null; title: string; sortOrder: number }[]
}

/**
 * 首頁的七個版位，一次取齊。
 *
 * 🔴 **2026-09-15：由建置期內聯的 content/home.json 改成執行期取 `GET /home`。**
 *    那支端點讀的是「首頁那筆 Page **已核准版本**的快照」，不是 HomeSections 即時表
 *    —— 直接讀即時表等於「編輯者拖一拖版位、還沒送審就上線」，核准這關被繞過
 *    （docs/08 §G-2、決策 14）。
 *
 * ⚠️ **七個版位合成一支函式**，不是七個各自取值：它們共用同一次 `GET /home`，
 *    而首頁本來就要全部。拆開只會讓同一份資料被組七次。
 *
 * ⚠️ 版位勾到草稿時 API 端已經濾掉，這裡拿到的都是前台看得到的。
 */
export async function getHomeData() {
  const [sections, treatments, terms, doctors, clinics, nap] = await Promise.all([
    homeSections() as Promise<HomeSection[]>,
    loadUnit(UNIT.treatment),
    loadUnit(UNIT.term),
    loadUnit(UNIT.doctor),
    loadUnit(UNIT.clinic),
    getClinicNap(),
  ])

  const section = (key: string): HomeSection | undefined =>
    sections.find((s) => s.sectionKey === key && s.isEnabled)
  const itemsOf = (key: string) =>
    section(key)?.items.slice().sort((a, b) => a.sortOrder - b.sortOrder) ?? []

  // 「最新文章」版位引用的那幾篇。⚠️ 只取被引用的，不是全部 1100 篇。
  const articleItems = itemsOf('latest-articles')
  const articles = await recordsByIds(articleItems.map((i) => i.contentItemId))

  const heroSlides: HeroSlide[] =
    ((section('hero')?.settings ?? []) as { image: unknown, caption: string }[]).map((s) => {
      const i = img(s.image)
      return {
        imagePath: i?.src ?? '',
        imageWidth: i?.width ?? 0,
        imageHeight: i?.height ?? 0,
        alt: i?.alt ?? '',
        caption: s.caption,
      }
    })

  const specialties: SpecialtyEntry[] = ((section('specialties')?.settings ?? []) as {
    title: string, slug: string, urlPath: string, icon: unknown
  }[]).map((s) => {
    const i = img(s.icon)
    return {
      title: s.title,
      slug: s.slug,
      urlPath: s.urlPath,
      imagePath: i?.src ?? '',
      iconWidth: i?.width ?? 0,
      iconHeight: i?.height ?? 0,
    }
  })

  const featuredTreatments: FeaturedTreatment[] = itemsOf('featured-treatments').map((item) => {
    const t = treatments.find((x) => x.id === item.contentItemId)
    const category = terms.find((c) => c.id === t?.fields.categoryTermId)
    const cover = img(t?.fields.cover)
    return {
      title: item.title,
      categoryLabel: category?.title ?? '',
      categorySlug: (category?.slug as string) ?? '',
      slug: (item.slug as string) ?? '',
      urlPath: item.urlPath ?? '#',
      imagePath: cover?.src ?? '',
      imageWidth: cover?.width ?? 0,
      imageHeight: cover?.height ?? 0,
      alt: cover?.alt ?? item.title,
    }
  })

  const latestArticles: LatestArticle[] = articleItems.map((item) => {
    const a = articles.find((x) => x.id === item.contentItemId)
    const category = terms.find((c) => c.id === a?.fields.categoryTermId)
    const cover = img(a?.fields.cover)
    return {
      title: item.title,
      categoryLabel: category?.title ?? '',
      categorySlug: (category?.slug as string) ?? '',
      urlPath: item.urlPath ?? '#',
      summary: a?.summary ?? '',
      imagePath: cover?.src ?? '',
      imageWidth: cover?.width ?? 0,
      imageHeight: cover?.height ?? 0,
      alt: cover?.alt ?? item.title,
      authorLabel: doctors.find((d) => d.id === a?.fields.authorDoctorId)?.title
        ?? ((a?.fields.authorName as string) ?? ''),
      displayDate: String(a?.fields.displayDate ?? '').slice(0, 10).replace(/-/g, '.'),
      readingMinutes: (a?.fields.readingMinutes as number) ?? 0,
    }
  })

  const featuredDoctors: HomeDoctor[] = itemsOf('doctors').map((item) => {
    const d = doctors.find((x) => x.id === item.contentItemId)
    const photo = img(d?.fields.photo)
    return {
      name: item.title,
      jobTitle: (d?.fields.jobTitle as string) ?? '',
      isPhysician: Boolean(d?.fields.isPhysician),
      urlPath: item.urlPath ?? '#',
      photoPath: photo?.src ?? '',
      photoWidth: photo?.width ?? 0,
      photoHeight: photo?.height ?? 0,
    }
  })

  const homeClinics: HomeClinic[] = itemsOf('clinics').map((item) => {
    const c = clinics.find((x) => x.id === item.contentItemId)
    const n = nap.find((x) => x.name === item.title)
    return {
      name: item.title,
      urlPath: item.urlPath ?? '#',
      phone: (c?.fields.phone as string) ?? '',
      address: (c?.fields.address as string) ?? '',
      hoursRows: n?.hours ? [n.hours] : [],
      hoursFootnote: '',
    }
  })

  return { heroSlides, specialties, featuredTreatments, latestArticles, featuredDoctors, homeClinics }
}

export const HOURS_WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const
