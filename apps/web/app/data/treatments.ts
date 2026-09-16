// 療程資料 —— 模板 6／7／8（療程總覽／療程分類／療程細節）
//
// 來源與範圍（frontend/README.md「資料現在從哪來」）：
//   內容一律照抄 mockup 原文，不自己編療程內容。
//   欄位形狀對齊 docs/08-database.md §C-1 Treatments（適應症／原理／療程時間／
//   建議次數／術後照護／禁忌症與注意事項／儀器資訊）與 §B-1 ContentItems
//   （title / slug / urlPath / summary）。
//
// 27 項療程的分類與 slug 為實數，見 docs/01-sitemap.md §1「療程 slug 對照」。
// 其中 12 項「無站內內容，需從零撰寫」（docs/06-page-inventory.md §3），
// 這 12 項與另外 11 項尚未有站內詳細內容的療程，這裡只給 title / nameEn /
// categorySlug —— 對應 docs/08 §C-1 的提醒：「這 12 筆會長時間停在
// Status=1 草稿」。療程細節頁樣板遇到資料不足時，只渲染有資料的區塊
// （mockup/04-treatment-detail.html 原始碼裡「資料不足的療程請整節移除
// 本區塊」的註記就是這樣要求的），不會為了填版面編造醫療內容。
//
// mockup 只完整示範了「鉑金版蜂巢皮秒雷射」一項（04-treatment-detail.html），
// 以及光療美顏分類頁（03-treatment-category.html）另外三項的卡片摘要／標籤。
// 其餘 23 項僅有總覽頁（12-treatment-overview.html）索引裡的中英文名稱。

export interface ImageRef {
  src: string
  alt: string
  width: number
  height: number
}

export interface TreatmentCategory {
  slug: string
  name: string
  /** u-eyebrow 用的英文標籤。僅 laser 為 mockup 原文（03-treatment-category.html），
   *  其餘三個分類 mockup 沒有寫對應的 eyebrow 文案，沿用該分類的 slug 大寫。 */
  eyebrow: string
  /** 分類頁 Hero 導言。僅 laser 為 03-treatment-category.html 的原文；
   *  其餘三個分類 mockup 未提供獨立分類頁文案，沿用總覽頁（12-treatment-overview.html
   *  §2 四大分類）介紹同一分類的段落。 */
  lede: string
  /** 分類代表圖，與總覽頁「四大分類」卡片共用同一張（12-treatment-overview.html §2）。 */
  image: ImageRef
  /** 實數，見 docs/06-page-inventory.md §3。 */
  count: number
  /** 總覽頁分類卡片下方的代表項目 chips（12-treatment-overview.html §2 原文）。 */
  sampleTags: string[]
  /** 分類頁「能改善哪些困擾」標籤列。僅 laser 有 mockup 原文
   *  （03-treatment-category.html），其餘三個分類沒有對應內頁可抄，留白時
   *  分類頁樣板整節不渲染，不替換分類編造困擾清單。 */
  concernTags?: string[]
  /** 分類頁「本分類醫師團隊」。僅 laser 有 mockup 原文，理由同上。 */
  doctors?: RelatedDoctor[]
  /** 分類頁「相關文章」。僅 laser 有 mockup 原文，理由同上。 */
  articles?: RelatedArticle[]
}

export interface TreatmentFact {
  label: string
  value: string
}

export interface TreatmentIndication {
  title: string
  desc: string
}

export interface TreatmentStep {
  num: number
  title: string
  desc: string
}

export interface TreatmentAftercareItem {
  when: string
  desc: string
}

export interface TreatmentGalleryItem extends ImageRef {
  caption: string
}

export interface RelatedDoctor {
  /** 對應 /team/{slug}/。取自 mockup/assets/img/doctor-*.jpg 的既有命名慣例
   *  （huang／chung／chao／hung），/team/ 尚未由負責該目錄的 agent 定案，
   *  待確認後校對。 */
  slug: string
  name: string
  title: string
  photo: ImageRef
}

export interface RelatedCase {
  title: string
  excerpt: string
  photo: ImageRef
}

export interface TreatmentFaqItem {
  q: string
  a: string
}

export interface RelatedArticle {
  title: string
  href: string
  category: string
  author: string
  date: string
  readingMinutes?: number
  photo: ImageRef
}

export interface Treatment {
  slug: string
  categorySlug: string
  /** ContentItems.Title */
  title: string
  /** Treatments.NameEn */
  nameEn: string
  /** 27 項中 12 項無站內內容需從零撰寫（docs/06 §3）；此欄位標記那 12 項，
   *  其餘 15 項雖然 mockup 沒有展示內容，但站內原本就有頁面，非本次新增撰寫範圍。 */
  needsContentFromScratch: boolean

  // ── 分類頁卡片（僅 laser 分類 4 項有 mockup 原文：03-treatment-category.html）──
  cardExcerpt?: string
  cardTags?: string[]
  cardImage?: ImageRef

  // ── 細節頁（僅 picosure-pro 有 mockup 原文：04-treatment-detail.html）──
  /** Treatments.Subtitle，同時作為 AI 摘要的 40–60 字直答式段落
   *  （docs/03-seo-geo.md §4 ②），渲染於細節頁 Hero 副標。 */
  summary?: string
  facts?: TreatmentFact[]
  indicationsHeading?: string
  indications?: TreatmentIndication[]
  mechanismHeading?: string
  mechanismParagraphs?: string[]
  mechanismImage?: ImageRef
  steps?: TreatmentStep[]
  aftercare?: TreatmentAftercareItem[]
  precautionsList?: string[]
  precautionsNote?: string
  device?: TreatmentFact[]
  gallery?: TreatmentGalleryItem[]
  doctors?: RelatedDoctor[]
  /** 「此療程可改善的困擾」標籤列 */
  detailTags?: string[]
  cases?: RelatedCase[]
  faqLastUpdated?: string
  faqs?: TreatmentFaqItem[]
  articles?: RelatedArticle[]
}

const doctorHuang: RelatedDoctor = {
  slug: 'huang',
  name: '黃勇學',
  title: '院長・皮膚科專科醫師',
  photo: { src: '/assets/img/doctor-huang.jpg', alt: '黃勇學 院長', width: 700, height: 1021 },
}
const doctorChung: RelatedDoctor = {
  slug: 'chung',
  name: '鍾佩宜',
  title: '醫師',
  photo: { src: '/assets/img/doctor-chung.jpg', alt: '鍾佩宜 醫師', width: 700, height: 1051 },
}
const doctorChao: RelatedDoctor = {
  slug: 'chao',
  name: '趙映程',
  title: '醫師',
  photo: { src: '/assets/img/doctor-chao.jpg', alt: '趙映程 醫師', width: 700, height: 1049 },
}
const doctorHung: RelatedDoctor = {
  slug: 'hung',
  name: '洪健睿',
  title: '醫師',
  photo: { src: '/assets/img/doctor-hung.jpg', alt: '洪健睿 醫師', width: 700, height: 1022 },
}

// ── 資料來源：content/treatments.json ＋ terms.json（docs/09 §3）──────────
//
// ⚠️ 這支檔案是「形狀轉接層」，內容在資料庫。
//
// ⚠️ **只有已發布的療程會出現。** 27 項裡多數沒有站內內容，在資料庫裡是草稿
//    （docs/08 §C-1：「這 12 筆會長時間停在 Status=1」），草稿不匯出、也不產生頁面。
//    前台原本那句「內容建置中」因此不再需要 —— 正式站不該有一個只寫著建置中的頁面。

import {
  REL, TERM, UNIT, img, loadUnit, parseBlocks, relationsOf, termsOf, type ContentRecord,
} from './_content'
import { eyebrowFor } from './_presentation'

/**
 * 一次算繪要用到的其他單元。
 *
 * 🔴 **2026-09-15：由建置期內聯改成執行期取值。** 在那之前這些是
 *    `CONTENT.terms`／`CONTENT.doctors`… 這種模組層級常數，整批資料在建置時
 *    就烤進產物。現在改成算繪當下取 —— 院方按下發布，下一個請求就看得到。
 *
 * ⚠️ **`articles` 只有「被療程關聯到的那幾篇」，不是全部 1100 篇。**
 *    療程卡片要顯示關聯文章的封面與日期，而 `relations[]` 只帶 slug／title／urlPath，
 *    所以得另外取那幾筆（`recordsByIds`）。整批載回來是 2.3 MB，
 *    而實際用到的只有十幾篇。
 */
interface TreatmentContext {
  terms: ContentRecord[]
  doctors: ContentRecord[]
  faqs: ContentRecord[]
  articles: ContentRecord[]
}

const categoryOf = (ctx: TreatmentContext, record: ContentRecord): ContentRecord | undefined =>
  ctx.terms.find((t) => t.id === record.fields.categoryTermId)

const toImage = (value: unknown, fallbackAlt = ''): ImageRef => {
  const i = img(value)
  return { src: i?.src ?? '', alt: i?.alt || fallbackAlt, width: i?.width ?? 0, height: i?.height ?? 0 }
}

function toTreatment(ctx: TreatmentContext, record: ContentRecord): Treatment {
  const f = record.fields
  const category = categoryOf(ctx, record)
  const indications = parseBlocks<{ heading: string | null; items: TreatmentIndication[] } | null>(f.indications, null)
  const mechanism = parseBlocks<{ heading: string | null; paragraphs: string[]; image: unknown } | null>(f.mechanism, null)
  const precautions = parseBlocks<{ items: string[]; note: string | null } | null>(f.contraindications, null)
  const gallery = (f.images ?? []) as { image: unknown; caption: string | null; sortOrder: number }[]

  // 「此療程可改善的困擾」是關聯（型別 2），不是一組字串欄位。
  const concernTags = relationsOf(record, REL.treatmentToConcern).map((r) => r.toTitle as string)

  return {
    slug: record.slug as string,
    categorySlug: category?.slug ?? '',
    title: record.title,
    nameEn: (f.nameEn as string) ?? '',
    // 匯出的都是已發布的，也就是都有內容。這個旗標留著只為了不動消費端的型別。
    needsContentFromScratch: false,
    cardExcerpt: record.summary ?? undefined,
    cardTags: concernTags.length ? concernTags : undefined,
    cardImage: f.cover ? toImage(f.cover, record.title) : undefined,
    summary: (f.subtitle as string) ?? undefined,
    facts: parseBlocks<TreatmentFact[]>(f.facts, []),
    indicationsHeading: indications?.heading ?? undefined,
    indications: indications?.items,
    mechanismHeading: mechanism?.heading ?? undefined,
    mechanismParagraphs: mechanism?.paragraphs,
    mechanismImage: mechanism?.image ? toImage(mechanism.image) : undefined,
    steps: parseBlocks<TreatmentStep[]>(f.steps, []),
    aftercare: parseBlocks<TreatmentAftercareItem[]>(f.aftercare, []),
    precautionsList: precautions?.items,
    precautionsNote: precautions?.note ?? undefined,
    device: parseBlocks<TreatmentFact[]>(f.deviceInfo, []),
    gallery: gallery
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((g) => ({ ...toImage(g.image), caption: g.caption ?? '' })),
    doctors: relationsOf(record, REL.treatmentToDoctor)
      .filter((r) => r.toIsPublished)
      .map((r) => {
        const doctor = ctx.doctors.find((d) => d.slug === r.toSlug)
        return {
          slug: r.toSlug as string,
          name: doctor?.title ?? (r.toTitle as string),
          title: (doctor?.fields.jobTitle as string) ?? '',
          photo: toImage(doctor?.fields.photo, r.toTitle ?? ''),
        }
      }),
    detailTags: concernTags.length ? concernTags : undefined,
    cases: [],
    faqLastUpdated: relationsOf(record, REL.treatmentToFaq)
      .map((r) => (ctx.faqs.find((x) => x.slug === r.toSlug)?.fields.lastReviewedOn as string) ?? '')
      .filter(Boolean)
      .sort()
      .at(-1)?.slice(0, 7) ?? undefined,
    faqs: relationsOf(record, REL.treatmentToFaq).map((r) => {
      const faq = ctx.faqs.find((x) => x.slug === r.toSlug)
      return { q: faq?.title ?? (r.toTitle as string), a: (faq?.fields.webAnswer as string) ?? '' }
    }),
    articles: relationsOf(record, REL.treatmentToArticle)
      .filter((r) => r.toIsPublished)
      .map((r) => {
        const a = ctx.articles.find((x) => x.slug === r.toSlug)
        const cat = a ? categoryOf(ctx, a) : undefined
        return {
          title: a?.title ?? (r.toTitle as string),
          href: r.toUrlPath ?? '#',
          category: cat?.title ?? '',
          author: '',
          date: String(a?.fields.displayDate ?? '').slice(0, 10),
          photo: toImage(a?.fields.cover, a?.title ?? ''),
        }
      }),
  }
}

/**
 * 28 項療程。
 *
 * ⚠️ 同一次算繪裡呼叫幾次都只會取一次資料 —— `loadUnit` 以請求為範圍去重
 *    （見 `_content.ts`）。所以各頁不必自己把結果傳來傳去。
 */
export async function getTreatments(): Promise<Treatment[]> {
  const [records, terms, doctors, faqs] = await Promise.all([
    loadUnit(UNIT.treatment),
    loadUnit(UNIT.term),
    loadUnit(UNIT.doctor),
    loadUnit(UNIT.faq),
  ])

  // 只取真的被關聯到的那幾篇文章（見 TreatmentContext 的說明）。
  const articleIds = [...new Set(
    records.flatMap((r) => relationsOf(r, REL.treatmentToArticle).map((x) => x.toContentItemId)),
  )]
  const articles = await recordsByIds(articleIds)

  const ctx: TreatmentContext = { terms, doctors, faqs, articles }
  return records
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    .map((r) => toTreatment(ctx, r))
}

export async function getTreatmentCategories(): Promise<TreatmentCategory[]> {
  const [terms, treatments] = await Promise.all([loadUnit(UNIT.term), getTreatments()])

  return termsOf(terms, TERM.treatmentCategory).map((term) => {
    const items = treatments.filter((t) => t.categorySlug === term.slug)
    return {
      slug: term.slug as string,
      name: term.title,
      // 英文小標由設計稿決定，不進資料庫（見 _presentation.ts）。
      eyebrow: eyebrowFor(term.slug as string),
      lede: term.summary ?? '',
      image: toImage(term.fields.cover, term.title),
      // 數量由查詢算出，不是另存一份會過期的數字。
      count: items.length,
      sampleTags: items.slice(0, 4).map((t) => t.title),
      concernTags: [...new Set(items.flatMap((t) => t.cardTags ?? []))],
      doctors: [...new Map(items.flatMap((t) => t.doctors ?? []).map((d) => [d.slug, d])).values()],
      articles: items.flatMap((t) => t.articles ?? []).slice(0, 3),
    }
  })
}

export async function getCategory(slug: string): Promise<TreatmentCategory | undefined> {
  return (await getTreatmentCategories()).find((c) => c.slug === slug)
}

export async function getTreatmentsByCategory(categorySlug: string): Promise<Treatment[]> {
  return (await getTreatments()).filter((t) => t.categorySlug === categorySlug)
}

export async function getTreatment(categorySlug: string, slug: string): Promise<Treatment | undefined> {
  return (await getTreatments()).find((t) => t.categorySlug === categorySlug && t.slug === slug)
}

/** 8 個困擾 slug 已定案（docs/01-sitemap.md §1）。用於把療程／分類頁上的
 *  困擾標籤盡量連到正式網址；找不到對應困擾分類的標籤（例如「毛孔粗大」
 *  不在 8 大困擾之列）維持純文字，不猜一個可能是錯的連結。 */
const CONCERN_SLUG_MAP: Record<string, string> = {
  '痘痘・粉刺': 'acne',
  '痘疤': 'acne',
  '痘疤・粉刺': 'acne',
  '敏感肌': 'sensitive-skin',
  '斑點・色素沉澱': 'pigmentation',
  '膚色不均': 'pigmentation',
  '抗老・緊緻': 'anti-aging',
  '細紋': 'anti-aging',
  '生髮・落髮': 'hair-loss',
  '除毛': 'hair-removal',
  '多汗・狐臭': 'hyperhidrosis',
  '一般皮膚疾病': 'dermatology',
}

export function concernHref(label: string): string | null {
  const slug = CONCERN_SLUG_MAP[label]
  return slug ? `/concerns/${slug}/` : null
}
