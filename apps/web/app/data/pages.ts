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

// ── 資料來源：content/pages.json（docs/09 §3）────────────────────────────
//
// ⚠️ 品牌理念、長版故事、法務三頁的內容都存在 Pages.BodyBlocks（區塊 JSON）。
//    系統頁不可刪除、不可改 slug（docs/08 §C-8），所以這裡一律「查既有頁面」，
//    查不到就給空值，不自己補一個假的。

import { UNIT, bySlug, img, loadUnit, parseBlocks, seoOverridesOf, type ContentRecord } from './_content'
import { eyebrowFor } from './_presentation'
import { getClinicNap } from './navigation'
import { roleText } from '~/utils/role'

/** slug → 那一筆頁面。⚠️ 每個請求只取一次（`loadUnit` 以請求為範圍去重）。 */
const pageIndex = async () => bySlug(await loadUnit(UNIT.page))

const blocksOf = <T,>(index: Map<string, ContentRecord>, slug: string, fallback: T): T =>
  parseBlocks<T>(index.get(slug)?.fields.bodyBlocks, fallback)

/**
 * 品牌理念頁四個區塊的形狀。
 *
 * ⚠️ **這裡是唯一一份**。原本寫成 `typeof ABOUT_PILLARS` 之類，指向內容搬進資料庫時
 *    就刪掉的常數 —— 型別位置不會有執行期錯誤，所以它壞了很久沒人發現，而
 *    `getAboutPage()` 又用 `as` 把每一個區塊各自重寫了一份形狀，等於繞過檢查。
 *    🔴 那些手寫形狀**比真實資料窄**（少了 `href`、`image.w/h`、`clinics.image`），
 *    而樣板用得到它們 —— 照著型別去「修」樣板就會把畫面上的連結與圖片刪掉。
 *    2026-09-16 導入 `nuxt typecheck` 時一起修好（真實資料以正式 API 的 `/about/` 核對過）。
 */
interface AboutImage {
  src: string
  alt: string
  w?: number
  h?: number
}

export interface AboutPillar {
  no: string
  title: string
  body: string
  image: AboutImage
  href: string
}

export interface AboutTimelineEntry {
  year: string
  title: string
  body: string
}

export interface AboutTeamMember {
  name: string
  role: string
  image: AboutImage
  href: string
}

export interface AboutClinic {
  name: string
  body: string
  address: string
  image: AboutImage
  href: string
}

interface AboutDocument {
  pillars: AboutPillar[]
  timeline: AboutTimelineEntry[]
  teamPreview: AboutTeamMember[]
  clinics: AboutClinic[]
}

/** 品牌頁「執行理念的人」那一區放幾位。mockup/09-about.html 是一列四張（`grid--4`）。 */
const ABOUT_TEAM_PREVIEW_SIZE = 4

/**
 * 品牌理念頁的四個區塊。一次取齊，呼叫端解構即可。
 *
 * 🔴 **團隊卡片取自「醫師」單元排序的前四位，不讀 `bodyBlocks.teamPreview`**（2026-11-12）。
 *    那份是手打的姓名／職稱／照片／連結，等於醫師的第二份名單與順序 —— 在後台
 *    「內容 → 醫師」拖排序、改職稱、換照片，這一區都不會跟，而且兩邊沒有任何徵兆
 *    （正式站實際分岔：「安喬」vs「安喬老師」、四位裡三位的連結只到 `/team/`）。
 *    與首頁醫師版位（決策 30）同一條規則，排序也與 `/team/` 相同（sortOrder，同值比 id）。
 * 🔴 **院區卡片同理，取自「據點」單元**（名稱、簡述、地址、門診時段、第一張照片、網址）。
 *    那份手打的 `clinics` 與據點分岔得更明顯：名稱不同（「二林四季皮膚科診所」）、
 *    四季診所的連結只到 `/clinics/`、門診時段是手打的一行字 —— 而地址與時段是 NAP，
 *    全站只能有一個來源（`getClinicNap()`，與頁尾、據點頁同一份）。
 * ⚠️ 舊的 `teamPreview`／`clinics` 留在資料裡不刪，只在對應單元一筆都沒有時當退路。
 */
export async function getAboutPage() {
  const [index, doctors, clinicRecords, nap] = await Promise.all([
    pageIndex(), loadUnit(UNIT.doctor), loadUnit(UNIT.clinic), getClinicNap(),
  ])
  const about = blocksOf<Partial<AboutDocument>>(index, 'about', {})

  const ordered = doctors.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
  const teamPreview: AboutTeamMember[] = ordered.slice(0, ABOUT_TEAM_PREVIEW_SIZE).map((d) => {
    const photo = img(d.fields.photo)
    const role = (d.fields.jobTitle as string) ?? ''
    return {
      name: d.title,
      role,
      href: d.urlPath ?? '/team/',
      image: {
        src: photo?.src ?? '',
        alt: `${d.title} ${roleText(role)}`.trim(),
        w: photo?.width,
        h: photo?.height,
      },
    }
  })

  // 順序、名稱、地址、時段都由 getClinicNap() 給（它已依據點清單的排序排好）；
  // 簡述與照片從同一批據點紀錄補上。🔴 比 slug 不比名稱（決策 30）。
  const clinics: AboutClinic[] = nap.map((n) => {
    const record = clinicRecords.find((c) => c.slug === n.slug)
    const photos = ((record?.fields.photos ?? []) as { image: unknown; sortOrder: number }[])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
    const photo = img(photos[0]?.image)
    return {
      name: n.name,
      body: record?.summary ?? '',
      address: [n.address, n.hours].filter(Boolean).join('｜'),
      href: n.href,
      image: { src: photo?.src ?? '', alt: photo?.alt || n.name, w: photo?.width, h: photo?.height },
    }
  })

  const physicianCount = doctors.filter((d) => Boolean(d.fields.isPhysician)).length

  // ⚠️ 不要在這裡加 `as` —— 上面的介面就是契約，用轉型蓋過去等於把檢查關掉。
  return {
    pillars: about.pillars ?? [],
    timeline: about.timeline ?? [],
    teamPreview: teamPreview.length > 0 ? teamPreview : about.teamPreview ?? [],
    /** 團隊人數。醫師單元取不到東西時是 0／0，樣板據此不輸出那一句。 */
    teamCounts: { total: doctors.length, physicians: physicianCount, others: doctors.length - physicianCount },
    clinics: clinics.length > 0 ? clinics : about.clinics ?? [],
  }
}

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
  /** 後台 SEO 區塊的覆寫（見 _content.ts 的 seoOverridesOf）。 */
  seo: ReturnType<typeof seoOverridesOf>
}

const STORY_SLUGS = ['new-chinese-aesthetics', 'makeup-style']

export async function getStoryPages(): Promise<Record<string, StoryPage>> {
  const index = await pageIndex()
  return Object.fromEntries(
  STORY_SLUGS.map((slug) => {
    const record = index.get(slug)
    const doc = blocksOf<{
      meta?: string[]
      heroImage?: unknown
      heroCaption?: string | null
      toc?: { id: string; label: string }[]
      faqs?: StoryFaq[]
      treatments?: StoryTreatmentCard[]
      sister?: { slug: string; label: string } | null
    }>(index, slug, {})
    const hero = img(doc.heroImage)

    return [slug, {
      slug,
      eyebrow: eyebrowFor(slug),
      title: record?.title ?? '',
      lede: record?.summary ?? '',
      meta: doc.meta ?? [],
      heroImage: { src: hero?.src ?? '', alt: hero?.alt ?? '', w: hero?.width ?? 0, h: hero?.height ?? 0 },
      heroCaption: doc.heroCaption ?? '',
      toc: doc.toc ?? [],
      faqs: doc.faqs ?? [],
      treatments: doc.treatments ?? [],
      sisterSlug: doc.sister?.slug ?? null,
      sisterLabel: doc.sister?.label ?? null,
      seo: seoOverridesOf(record),
    } satisfies StoryPage]
  }),
  )
}

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
  /**
   * 內容夠不夠實在、值得被索引。由 API 判斷（`functions/Common/Indexability.cs`）。
   * ⚠️ 法務三頁在條文補齊前只有骨架，那種薄內容頁不該吃索引預算。
   */
  indexable: boolean
  /** 後台 SEO 區塊的覆寫（見 _content.ts 的 seoOverridesOf）。 */
  seo: ReturnType<typeof seoOverridesOf>
}

export const LEGAL_SLUGS: LegalDoc['slug'][] = ['privacy', 'terms', 'medical-disclaimer']

export async function getLegalDocs(): Promise<LegalDoc[]> {
  const index = await pageIndex()
  return LEGAL_SLUGS.map((slug) => {
    const record = index.get(slug)
    const doc = blocksOf<{ updatedOn?: string | null, sections?: LegalSection[] }>(index, slug, {})
    return {
      slug,
      path: record?.urlPath ?? `/${slug}/`,
      navLabel: record?.title ?? '',
      title: record?.title ?? '',
      updatedOn: doc.updatedOn ?? '',
      sections: doc.sections ?? [],
      indexable: record?.indexable ?? true,
      seo: seoOverridesOf(record),
    }
  })
}

export async function findLegalDocByPath(path: string): Promise<LegalDoc | undefined> {
  return (await getLegalDocs()).find((doc) => doc.path === path)
}

// ─────────────────────────────────────────────────────────────────────────
// /search/ 熱門搜尋建議（mockup/19-search.html 找不到結果時的示意標籤）
// ─────────────────────────────────────────────────────────────────────────

/** ⚠️ 示意用的熱門搜尋詞，非真實統計——正式站應由站內搜尋的查詢紀錄產生。 */
export const SEARCH_SUGGESTIONS = ['皮秒雷射', '痘疤', '電波拉皮', '除毛', '肉毒', '術後保養']
