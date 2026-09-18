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
  /** 科別圖示。🔴 **可能是 null**（新增的困擾還沒有對應圖檔），模板要 `v-if`。 */
  icon: { src: string; alt: string } | null
  /** 總覽頁卡片的一句話簡述，來自 13-concern-overview.html。 */
  overviewDesc: string
  overviewTags: string[]
  /** AI 摘要：40–60 字直答式段落，渲染成頁面第一段可見文字（docs/03-seo-geo.md §4 ②）。 */
  aiSummary: string
  seo: ReturnType<typeof seoOverridesOf>
  lede: string
  relatedConcernSlugs: string[]
  heroImage: Image
  detail?: ConcernDetail
}

// ── 資料來源：content/concerns.json（docs/09 §3）─────────────────────────
//
// ⚠️ 四個內容區段（症狀／成因／自我判斷／何時就醫）各自存成區塊 JSON，
//    區段標題與插圖跟著它們所屬的區段走 —— 這正是區塊 JSON 的用途。
// ⚠️ 建議療程與諮詢醫師來自關聯；區段本身的引言存在 RecommendationIntro
//    （ContentRelations.Note 是逐筆的推薦理由，不是整段引言）。

import {
  REL, TERM, UNIT, img, loadUnit, parseBlocks, relationsOf, seoOverridesOf, termsOf,
  type ContentRecord,
} from './_content'
import { formatDisplayDate } from './articles'
import { CONCERN_EYEBROW, concernIconFor } from './_presentation'

const toImage = (value: unknown, fallbackAlt = ''): Image => {
  const i = img(value)
  return { src: i?.src ?? '', alt: i?.alt || fallbackAlt, width: i?.width ?? 0, height: i?.height ?? 0 }
}

interface RecommendationIntro {
  treatmentsIntro: string | null
  treatmentsNote: string | null
  doctorsIntro: string | null
}

/** 一次算繪要用到的其他單元。理由同 treatments.ts 的 TreatmentContext。 */
interface ConcernContext {
  treatments: ContentRecord[]
  terms: ContentRecord[]
  doctors: ContentRecord[]
  faqs: ContentRecord[]
  /** ⚠️ 只有「被困擾關聯到的那幾篇」，不是全部 1100 篇。 */
  articles: ContentRecord[]
}

function toConcern(ctx: ConcernContext, record: ContentRecord): Concern {
  const f = record.fields
  const symptoms = parseBlocks<{ heading: string | null; paragraphs: string[]; media: unknown } | null>(f.symptoms, null)
  const causes = parseBlocks<{ heading: string | null; intro: string | null; facts: ConcernFact[] } | null>(f.causes, null)
  const selfCheck = parseBlocks<{ heading: string | null; intro: string | null; types: ConcernType[] } | null>(f.selfCheckGuide, null)
  const warn = parseBlocks<{ heading: string | null; items: string[] } | null>(f.whenToSeeDoctor, null)
  const intro = parseBlocks<RecommendationIntro>(f.recommendationIntro, {
    treatmentsIntro: null, treatmentsNote: null, doctorsIntro: null,
  })

  const treatments = relationsOf(record, REL.concernToTreatment).map((r) => {
    const t = ctx.treatments.find((x) => x.slug === r.toSlug)
    const category = t ? ctx.terms.find((c) => c.id === t.fields.categoryTermId) : undefined
    return {
      key: r.toSlug as string,
      name: t?.title ?? (r.toTitle as string),
      href: r.toUrlPath ?? '#',
      image: toImage(t?.fields.cover, t?.title ?? ''),
      categoryLabel: category?.title ?? '',
      // ⚠️ Note 是逐筆的推薦理由（docs/08 §D），不是整段引言。
      excerpt: r.note ?? t?.summary ?? '',
    }
  })

  // 諮詢醫師：醫師 → 困擾是單向存在醫師那一端（型別 13），反向掃回來。
  const doctors = ctx.doctors
    .filter((d) => d.relations.some((r) => r.relationType === REL.doctorToConcern && r.toSlug === record.slug))
    .map((d) => ({
      name: d.title,
      role: (d.fields.jobTitle as string) ?? '',
      href: d.urlPath,
      image: toImage(d.fields.photo, d.title),
    }))

  const detail: ConcernDetail | undefined = symptoms || causes || selfCheck || warn
    ? {
        symptomHeading: symptoms?.heading ?? '',
        symptomMedia: toImage(symptoms?.media),
        symptomParagraphs: symptoms?.paragraphs ?? [],
        causesHeading: causes?.heading ?? '',
        causesIntro: causes?.intro ?? '',
        causesFacts: causes?.facts ?? [],
        selfCheckHeading: selfCheck?.heading ?? '',
        selfCheckIntro: selfCheck?.intro ?? '',
        types: selfCheck?.types ?? [],
        warnHeading: warn?.heading ?? '',
        warnItems: warn?.items ?? [],
        treatmentsIntro: intro.treatmentsIntro ?? '',
        treatmentsNote: intro.treatmentsNote ?? '',
        treatments,
        doctorsIntro: intro.doctorsIntro ?? '',
        doctors,
        // 「最後更新」取這一頁引用到的 FAQ 裡最新的一筆審閱日，不另存一份會過期的字串。
        faqUpdated: relationsOf(record, REL.concernToFaq)
          .map((r) => (ctx.faqs.find((x) => x.slug === r.toSlug)?.fields.lastReviewedOn as string) ?? '')
          .filter(Boolean)
          .sort()
          .at(-1)?.slice(0, 7) ?? '',
        faqs: relationsOf(record, REL.concernToFaq).map((r) => {
          const faq = ctx.faqs.find((x) => x.slug === r.toSlug)
          return { q: faq?.title ?? (r.toTitle as string), a: (faq?.fields.webAnswer as string) ?? '' }
        }),
        // ⚠️ `tag` 與 `meta` 不可省 —— 樣板的文章卡片兩個都會渲染
        //    （`{{ article.tag }}` 與 `v-for="m in article.meta"`）。
        //    2026-09-16 由 `nuxt typecheck` 抓到它們從來沒有被產生過：
        //    Vue 讀不存在的屬性不會報錯，只是把那個位置渲染成空白。
        articles: relationsOf(record, REL.concernToArticle).map((r) => {
          const a = ctx.articles.find((x) => x.slug === r.toSlug)
          const category = ctx.terms.find((t) => t.id === a?.fields.categoryTermId)
          const displayDate = String(a?.fields.displayDate ?? '').slice(0, 10)
          return {
            title: a?.title ?? (r.toTitle as string),
            href: r.toUrlPath ?? '#',
            tag: category?.title ?? '',
            excerpt: a?.summary ?? '',
            image: toImage(a?.fields.cover, a?.title ?? ''),
            // ⚠️ 日期格式沿用 `formatDisplayDate`，不要在這裡另寫一份 replaceAll。
            meta: displayDate ? [formatDisplayDate(displayDate)] : [],
          }
        }),
      }
    : undefined

  return {
    slug: record.slug as string,
    title: record.title,
    eyebrow: CONCERN_EYEBROW,
    // 圖示是版面素材（八大專科的線條圖），不進資料庫。
    // 🔴 **檔名與 slug 無關**（`spec-01.png`…`spec-08.png`），一定要查對照表 ——
    //    這裡原本是 `spec-${record.slug}.png`，八個困擾頁與總覽頁的圖示全部 404。
    icon: concernIconFor(record.slug as string, record.title),
    overviewDesc: record.summary ?? '',
    overviewTags: treatments.slice(0, 3).map((t) => t.name),
    aiSummary: (record.seo?.aiSummary as string) ?? '',
    seo: seoOverridesOf(record),
    lede: record.summary ?? '',
    relatedConcernSlugs: relationsOf(record, REL.concernToConcern).map((r) => r.toSlug as string),
    heroImage: toImage(f.cover, record.title),
    detail,
  }
}

export async function getConcerns(): Promise<Concern[]> {
  const [concerns, treatments, terms, doctors, faqs] = await Promise.all([
    loadUnit(UNIT.concern),
    loadUnit(UNIT.treatment),
    loadUnit(UNIT.term),
    loadUnit(UNIT.doctor),
    loadUnit(UNIT.faq),
  ])

  // 只取真的被困擾關聯到的那幾篇文章。
  const articleIds = [...new Set(
    concerns.flatMap((c) => relationsOf(c, REL.concernToArticle).map((r) => r.toContentItemId)),
  )]
  const articles = await recordsByIds(articleIds)

  const ctx: ConcernContext = { treatments, terms, doctors, faqs, articles }
  return concerns
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    .map((record) => toConcern(ctx, record))
}

/** 困擾總覽頁的「四大療程分類」導覽卡。由分類與其療程推導，不另存一份。 */
export async function getConcernTreatmentCategories() {
  const [terms, treatments] = await Promise.all([loadUnit(UNIT.term), loadUnit(UNIT.treatment)])
  return termsOf(terms, TERM.treatmentCategory).map((term) => {
    const first = treatments.find((t) => t.fields.categoryTermId === term.id)
    return {
      label: term.title,
      href: term.urlPath ?? '#',
      excerpt: term.summary ?? '',
      image: toImage(first?.fields.cover ?? term.fields.cover, term.title),
    }
  })
}

/**
 * 困擾總覽頁的推薦文章：最新三篇。
 *
 * ⚠️ **排序交給 API**（`sort=latest`）。原本是把全部文章讀進來自己排再切三篇 ——
 *    那在建置期沒問題，執行期等於為了三篇文章傳 2.3 MB。
 */
export async function getConcernOverviewArticles(): Promise<ConcernArticleRef[]> {
  const [{ items }, terms, doctors] = await Promise.all([
    articlePage(1, 3, { latest: true }),
    loadUnit(UNIT.term),
    loadUnit(UNIT.doctor),
  ])

  return items.map((a) => {
    const category = terms.find((t) => t.id === a.fields.categoryTermId)
    return {
      title: a.title,
      href: a.urlPath ?? '#',
      tag: category?.title ?? '',
      image: toImage(a.fields.cover, a.title),
      meta: [
        doctors.find((d) => d.id === a.fields.authorDoctorId)?.title ?? '',
        String(a.fields.displayDate ?? '').slice(0, 10).replace(/-/g, '.'),
      ].filter(Boolean),
    }
  })
}

export async function findConcern(slug: string): Promise<Concern | undefined> {
  return (await getConcerns()).find((c) => c.slug === slug)
}
