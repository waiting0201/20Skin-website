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

/** 品牌理念頁的四個區塊。一次取齊，呼叫端解構即可。 */
export async function getAboutPage() {
  const about = blocksOf<Partial<AboutDocument>>(await pageIndex(), 'about', {})
  // ⚠️ 不要在這裡加 `as` —— 上面的介面就是契約，用轉型蓋過去等於把檢查關掉。
  return {
    pillars: about.pillars ?? [],
    timeline: about.timeline ?? [],
    teamPreview: about.teamPreview ?? [],
    clinics: about.clinics ?? [],
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

const LEGAL_SLUGS: LegalDoc['slug'][] = ['privacy', 'terms', 'medical-disclaimer']

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
