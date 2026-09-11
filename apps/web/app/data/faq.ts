// FAQ 題庫（docs/08-database.md §C-6 `Faqs`）＋ FAQ 分類（§C-9 `Terms`，TermType=3）。
//
// 正式站題庫與分類是兩張表：Faqs.CategoryTermId FK → Terms（分類與標籤模型），
// 前端不自建第二份分類清單（docs/02-backend-cms.md §6 分界表）。這裡先用一份平面
// 資料模擬這個關聯，形狀對齊 —— 接上 CMS 時只換來源、不改元件。
//
// ⚠️ 分類命名尚未定案：docs/08-database.md §C-9 的 FAQ 分類種子是「品牌與診所／
// 療程相關／肌膚困擾／醫師與看診／費用與流程」，但 mockup/16-faq.html 實際做出來
// 的 5 個 tab 是「療程相關／術後照護／看診與預約／費用與付款／院所資訊」，兩者
// 對不起來。內容規則是「照抄 mockup 原文」，所以這裡採用 mockup 的 5 類（含其
// data-tab 的英文 slug），docs 那份種子清單需要內容／後端團隊回頭核對，不是前端
// 能單方面決定的事——見交付回報。
//
// 兩份答案都是 NOT NULL：WebAnswer 是頁面顯示用的完整說明（150–400 字），
// AiAnswer 是 60–100 字的語意自足摘要，供 FAQPage JSON-LD／faq.json／llms-full.txt
// 使用。mockup 只寫了網頁版一份文字，AiAnswer 由網頁版摘要濃縮而成（不是新事實，
// 只是縮寫既有內容以符合欄位長度限制），供後續編輯覆核。
// LastReviewedOn 是 date 型別；mockup 只標到月份（例如「2026-08」），這裡一律
// 補上當月 01 日，等內容團隊給出正式日期後再覆蓋。

export interface FaqCategory {
  /** Terms.Slug，同時是 mockup data-tab 的值。 */
  slug: string
  /** Terms 顯示名稱（= mockup 的 tab 文案）。 */
  label: string
}

export interface FaqItem {
  /** 對應 ContentItems.Title（問題本體）。 */
  question: string
  categorySlug: string
  /** WebAnswer，nvarchar(max)，150–400 字，頁面顯示用。 */
  webAnswer: string
  /** AiAnswer，nvarchar(500)，60–100 字，FAQPage JSON-LD 唯一來源。 */
  aiAnswer: string
  /** LastReviewedOn，date。 */
  lastReviewedOn: string
  /** mockup 顯示的審閱者（非 Faqs 表欄位，工作流走 ContentReviews，這裡僅供頁面顯示）。 */
  reviewedBy: string
}

// ── 資料來源：content/faqs.json ＋ terms.json（docs/09 §3）────────────────

import { CONTENT, TERM, termsOf, type ContentRecord } from './_content'

export const FAQ_CATEGORIES: FaqCategory[] = termsOf(TERM.faqCategory).map((t) => ({
  slug: t.slug as string,
  label: t.title,
}))

const categorySlugOf = (record: ContentRecord): string =>
  CONTENT.terms.find((t) => t.id === record.fields.categoryTermId)?.slug ?? ''

export const FAQ_ITEMS: FaqItem[] = CONTENT.faqs
  .slice()
  .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
  .map((record) => ({
    question: record.title,
    categorySlug: categorySlugOf(record),
    webAnswer: (record.fields.webAnswer as string) ?? '',
    aiAnswer: (record.fields.aiAnswer as string) ?? '',
    lastReviewedOn: (record.fields.lastReviewedOn as string) ?? '',
    // ⚠️ 2026-09-11 起是 Faqs.ReviewedBy 的真欄位，不再是前台寫死的字串。
    reviewedBy: (record.fields.reviewedBy as string) ?? '',
  }))

export function faqItemsByCategory(slug: string): FaqItem[] {
  return FAQ_ITEMS.filter((item) => item.categorySlug === slug)
}

/** FAQPage JSON-LD（docs/03-seo-geo.md §2）。AiAnswer 是唯一來源。 */
export function faqPageJsonLd(items: FaqItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.aiAnswer,
      },
    })),
  }
}
