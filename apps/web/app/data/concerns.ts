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
  icon: { src: string; alt: string }
  /** 總覽頁卡片的一句話簡述，來自 13-concern-overview.html。 */
  overviewDesc: string
  overviewTags: string[]
  /** AI 摘要：40–60 字直答式段落，渲染成頁面第一段可見文字（docs/03-seo-geo.md §4 ②）。 */
  aiSummary: string
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
  CONTENT, REL, TERM, img, parseBlocks, relationsOf, termsOf, type ContentRecord,
} from './_content'
import { CONCERN_EYEBROW } from './_presentation'

const toImage = (value: unknown, fallbackAlt = ''): Image => {
  const i = img(value)
  return { src: i?.src ?? '', alt: i?.alt || fallbackAlt, width: i?.width ?? 0, height: i?.height ?? 0 }
}

interface RecommendationIntro {
  treatmentsIntro: string | null
  treatmentsNote: string | null
  doctorsIntro: string | null
}

function toConcern(record: ContentRecord): Concern {
  const f = record.fields
  const symptoms = parseBlocks<{ heading: string | null; paragraphs: string[]; media: unknown } | null>(f.symptoms, null)
  const causes = parseBlocks<{ heading: string | null; intro: string | null; facts: ConcernFact[] } | null>(f.causes, null)
  const selfCheck = parseBlocks<{ heading: string | null; intro: string | null; types: ConcernType[] } | null>(f.selfCheckGuide, null)
  const warn = parseBlocks<{ heading: string | null; items: string[] } | null>(f.whenToSeeDoctor, null)
  const intro = parseBlocks<RecommendationIntro>(f.recommendationIntro, {
    treatmentsIntro: null, treatmentsNote: null, doctorsIntro: null,
  })

  const treatments = relationsOf(record, REL.concernToTreatment).map((r) => {
    const t = CONTENT.treatments.find((x) => x.slug === r.toSlug)
    const category = t ? CONTENT.terms.find((c) => c.id === t.fields.categoryTermId) : undefined
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
  const doctors = CONTENT.doctors
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
          .map((r) => (CONTENT.faqs.find((x) => x.slug === r.toSlug)?.fields.lastReviewedOn as string) ?? '')
          .filter(Boolean)
          .sort()
          .at(-1)?.slice(0, 7) ?? '',
        faqs: relationsOf(record, REL.concernToFaq).map((r) => {
          const faq = CONTENT.faqs.find((x) => x.slug === r.toSlug)
          return { q: faq?.title ?? (r.toTitle as string), a: (faq?.fields.webAnswer as string) ?? '' }
        }),
        articles: relationsOf(record, REL.concernToArticle).map((r) => {
          const a = CONTENT.articles.find((x) => x.slug === r.toSlug)
          return {
            title: a?.title ?? (r.toTitle as string),
            href: r.toUrlPath ?? '#',
            excerpt: a?.summary ?? '',
            image: toImage(a?.fields.cover, a?.title ?? ''),
          }
        }),
      }
    : undefined

  return {
    slug: record.slug as string,
    title: record.title,
    eyebrow: CONCERN_EYEBROW,
    // 圖示是版面素材（八大專科的線條圖），不進資料庫。
    icon: { src: `/assets/img/spec-${record.slug}.png`, alt: record.title },
    overviewDesc: record.summary ?? '',
    overviewTags: treatments.slice(0, 3).map((t) => t.name),
    aiSummary: (record.seo?.aiSummary as string) ?? '',
    lede: record.summary ?? '',
    relatedConcernSlugs: relationsOf(record, REL.concernToConcern).map((r) => r.toSlug as string),
    heroImage: toImage(f.cover, record.title),
    detail,
  }
}

export const CONCERNS: Concern[] = CONTENT.concerns
  .slice()
  .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
  .map(toConcern)

/** 困擾總覽頁的「四大療程分類」導覽卡。由分類與其療程推導，不另存一份。 */
export const CONCERN_TREATMENT_CATEGORIES = termsOf(TERM.treatmentCategory).map((term) => {
  const first = CONTENT.treatments.find((t) => t.fields.categoryTermId === term.id)
  return {
    label: term.title,
    href: term.urlPath ?? '#',
    excerpt: term.summary ?? '',
    image: toImage(first?.fields.cover ?? term.fields.cover, term.title),
  }
})

/** 困擾總覽頁的推薦文章。取最新的三篇，不另存一份會過期的清單。 */
export const CONCERN_OVERVIEW_ARTICLES: ConcernArticleRef[] = CONTENT.articles
  .slice()
  .sort((a, b) => String(b.fields.displayDate ?? '').localeCompare(String(a.fields.displayDate ?? '')))
  .slice(0, 3)
  .map((a) => {
    const category = CONTENT.terms.find((t) => t.id === a.fields.categoryTermId)
    return {
      title: a.title,
      href: a.urlPath ?? '#',
      tag: category?.title ?? '',
      image: toImage(a.fields.cover, a.title),
      meta: [
        CONTENT.doctors.find((d) => d.id === a.fields.authorDoctorId)?.title ?? '',
        String(a.fields.displayDate ?? '').slice(0, 10).replace(/-/g, '.'),
      ].filter(Boolean),
    }
  })

export function findConcern(slug: string): Concern | undefined {
  return CONCERNS.find((c) => c.slug === slug)
}
