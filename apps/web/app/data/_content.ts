// 建置期資料快照的載入層（docs/09-frontend.md §3）。
//
// ```
// tools/content-export ──Dapper／唯讀──▶ apps/web/content/*.json ──▶ 這裡 ──▶ app/data/*.ts
// ```
//
// ⚠️ **這裡只做「讀檔與查找」，不做內容判斷。** 每個單元的形狀由各自的 data/*.ts 組出來，
//    那是前台的契約；這支只負責把 JSON 變成可查的索引。
//
// ⚠️ JSON 由 Vite 在建置期內聯，**執行期不會發生任何讀檔或查詢** —— 前台是純靜態產物。
//
// 🔴 content/ 不進版控，由 `pnpm --filter web export:content` 產生。
//    檔案不存在時建置會直接失敗，這是刻意的：與其產生一個內容空白卻「成功」的網站，
//    不如當場停下來。

import treatmentsJson from '~~/content/treatments.json'
import doctorsJson from '~~/content/doctors.json'
import concernsJson from '~~/content/concerns.json'
import articlesJson from '~~/content/articles.json'
import casesJson from '~~/content/cases.json'
import faqsJson from '~~/content/faqs.json'
import clinicsJson from '~~/content/clinics.json'
import pagesJson from '~~/content/pages.json'
import termsJson from '~~/content/terms.json'
import siteJson from '~~/content/site.json'

/** 一筆內容的快照形狀，逐欄對應 ContentHandler.SaveVersionAsync 產生的 JSON。 */
export interface ContentRecord {
  id: number
  unit: string
  contentType: number
  slug: string | null
  urlPath: string | null
  title: string
  summary: string | null
  sortOrder: number
  includeInSitemap: boolean
  fields: Record<string, unknown>
  seo: Record<string, unknown> | null
  relations: RelationRecord[]
  updatedAt: string
}

export interface RelationRecord {
  relationType: number
  toContentItemId: number
  sortOrder: number
  note: string | null
  toSlug: string | null
  toUrlPath: string | null
  toTitle: string | null
  /** 指向草稿的關聯照樣輸出 —— 由使用端決定要不要渲染成連結。 */
  toIsPublished: boolean
}

/** 內嵌圖片欄位（docs/08 §0 決策四）。 */
export interface ContentImage {
  blobPath: string
  url: string
  alt: string | null
  width: number | null
  height: number | null
  variants: string | null
}

export const CONTENT = {
  treatments: treatmentsJson as unknown as ContentRecord[],
  doctors: doctorsJson as unknown as ContentRecord[],
  concerns: concernsJson as unknown as ContentRecord[],
  articles: articlesJson as unknown as ContentRecord[],
  cases: casesJson as unknown as ContentRecord[],
  faqs: faqsJson as unknown as ContentRecord[],
  clinics: clinicsJson as unknown as ContentRecord[],
  pages: pagesJson as unknown as ContentRecord[],
  terms: termsJson as unknown as ContentRecord[],
}

export const SITE: Record<string, string | null> = siteJson as Record<string, string | null>

/** 關聯型別（docs/08 §D）。 */
export const REL = {
  treatmentToDoctor: 1,
  treatmentToConcern: 2,
  treatmentToArticle: 3,
  treatmentToFaq: 4,
  concernToTreatment: 5,
  concernToFaq: 6,
  concernToArticle: 7,
  clinicToDoctor: 8,
  clinicToTreatment: 9,
  clinicToFaq: 10,
  articleToTag: 11,
  pageToFeatured: 12,
  doctorToConcern: 13,
  concernToConcern: 14,
} as const

/** 分類與標籤的型別（docs/08 §C-9）。 */
export const TERM = { treatmentCategory: 1, articleCategory: 2, faqCategory: 3, articleTag: 4 } as const

const bySlug = <T extends ContentRecord>(rows: T[]) =>
  new Map(rows.filter((r) => r.slug).map((r) => [r.slug as string, r]))

export const INDEX = {
  treatment: bySlug(CONTENT.treatments),
  doctor: bySlug(CONTENT.doctors),
  concern: bySlug(CONTENT.concerns),
  article: bySlug(CONTENT.articles),
  case: bySlug(CONTENT.cases),
  faq: bySlug(CONTENT.faqs),
  clinic: bySlug(CONTENT.clinics),
  page: bySlug(CONTENT.pages),
}

/** 分類與標籤要用「型別＋slug」查，光看 slug 會撞名（FAQ 分類與文章標籤都有 aftercare）。 */
export const termBy = (type: number, slug: string): ContentRecord | undefined =>
  CONTENT.terms.find((t) => t.slug === slug && t.fields.termType === type)

export const termsOf = (type: number): ContentRecord[] =>
  CONTENT.terms.filter((t) => t.fields.termType === type).sort((a, b) => a.sortOrder - b.sortOrder)

/** 取出某筆內容的某一種關聯，已依 sortOrder 排序。 */
export const relationsOf = (record: ContentRecord | undefined, type: number): RelationRecord[] =>
  (record?.relations ?? []).filter((r) => r.relationType === type).sort((a, b) => a.sortOrder - b.sortOrder)

/**
 * 反向查關聯。雙向關聯一律單向存（docs/08 §D），所以「這位醫師出現在哪些療程」
 * 只能從療程那一端掃回來 —— 不是資料缺漏，是刻意的單一來源。
 */
export const inboundRelations = (rows: ContentRecord[], type: number, toSlug: string): ContentRecord[] =>
  rows.filter((r) => r.relations.some((x) => x.relationType === type && x.toSlug === toSlug))

/** 區塊 JSON 欄位。存進資料庫時是字串，讀出來要解析（docs/09 §8）。 */
export function parseBlocks<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value.length === 0) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

/** 內嵌圖片 → 前台慣用的 { src, alt, width, height }。 */
export function img(value: unknown): { src: string; alt: string; width: number; height: number } | undefined {
  const image = value as ContentImage | null | undefined
  if (!image?.url) return undefined
  return {
    src: image.url,
    alt: image.alt ?? '',
    width: image.width ?? 0,
    height: image.height ?? 0,
  }
}
