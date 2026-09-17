// 臻美分享（文章）資料。docs/08-database.md §C-4 `Articles` 的欄位對齊。
//
// 內容來源只有兩份 mockup：
//   · mockup/06-blog-list.html   —— 醫美新知分類的清單（1 精選 ＋ 10 篇卡片）
//   · mockup/07-article-detail.html —— 其中一篇（眼周）的完整內文
// 兩者都是「醫美新知」分類，所以目前只有這個分類有文章；皮膚新知／媒體報導／
// 演講授課三個分類是空的 —— 對應列表頁會顯示「尚無文章」空狀態，
// ⚠️ 不要為了填版面自己編文章。
//
// ⚠️ 醫師 slug（/team/{slug}/）目前依 public/assets/img/doctor-*.jpg 的檔名推斷
// （/team/ 由另一個 agent 建置，尚未定案）。接上真正的醫師資料後，只需要改下面
// AUTHORS 這張對照表，元件不用動。
//
// ⚠️ 內容衝突的處理方式：同一篇文章（眼周精雕）在 06／07 兩份 mockup 裡的
// 「日期」與「閱讀時間」對不上（06 寫 2026.08.10・4 分鐘；07 的 byline 寫發布
// 2026-07-28・更新 2026-08-05・審閱 2026-08-05・閱讀 6 分鐘）。這裡採 07 的版本
// 為準 —— 07 是有明確標籤（發布／更新／審閱）的完整內頁，欄位語意清楚對應
// docs/08 §C-4 的 DisplayDate／ReviewedOn，06 只是清單卡片上一個籠統的日期。
// 全站只留一份資料，兩處清單與內頁共用，不會再有兩個數字對不起來的問題。
//
// 同理，07 頁尾「相關文章」小工具裡引用的 Xeomin／Ultherapy PRIME 標題，
// 其作者與分類跟它們在 06 清單裡的正式紀錄也對不上（06：洪健睿醫師／醫美新知；
// 07 小工具：編輯部／媒體報導）。這裡不重複存第二份，「相關文章」一律用
// getRelatedArticles() 依分類即時算，資料只有一份，不會有兩邊打架的問題。

export type ArticleCategorySlug = 'medical-aesthetics' | 'dermatology' | 'media' | 'lectures'

export interface ArticleCategory {
  slug: ArticleCategorySlug
  label: string
  eyebrow: string
  /** 分類 Hero 的一句話說明。目前只有醫美新知有 mockup 原文（06-blog-list.html）。 */
  description: string
}

/** 四個分類 slug 為定案值（docs/01-sitemap.md §1、CLAUDE.md）。 */
// ── 資料來源：content/articles.json ＋ terms.json（docs/09 §3）───────────

import { REL, TERM, UNIT, img, loadUnit, parseBlocks, relationsOf, seoOverridesOf, termsOf, type ContentRecord } from './_content'
import { eyebrowFor } from './_presentation'

const toImage = (value: unknown, fallbackAlt = ''): ArticleImage => {
  const i = img(value)
  return { src: i?.src ?? '', alt: i?.alt || fallbackAlt, width: i?.width ?? 0, height: i?.height ?? 0 }
}

export async function getArticleCategories(): Promise<ArticleCategory[]> {
  const terms = await loadUnit(UNIT.term)
  return termsOf(terms, TERM.articleCategory).map((t) => ({
    slug: t.slug as ArticleCategorySlug,
    label: t.title,
    // 英文小標由設計稿決定（見 _presentation.ts）。
    eyebrow: eyebrowFor(t.slug as string),
    description: t.summary ?? '',
  }))
}

export async function getArticleCategory(slug: string): Promise<ArticleCategory | undefined> {
  return (await getArticleCategories()).find((c) => c.slug === slug)
}

export interface ArticleAuthor {
  /** 對應 /team/{slug}/；null 表示作者不是團隊成員（docs/08 §C-4 AuthorName）。 */
  doctorSlug: string | null
  name: string
  role?: string
  avatarSrc?: string
}

export interface ArticleReviewer {
  /** DB 的 ReviewerDoctorId 只能指向醫師，沒有「非醫師審閱」這個選項。 */
  doctorSlug: string
  name: string
  role?: string
}

// 依 mockup/11-team-list.html 的職稱＋ public/assets/img 檔名推斷（見檔頭說明）。
const AUTHORS = {
  huang: { doctorSlug: 'huang', name: '黃勇學 醫師', role: '院長・皮膚科專科醫師', avatarSrc: '/assets/img/doctor-huang.jpg' },
  linYuanfu: { doctorSlug: 'lin-yuanfu', name: '林源富 醫師', role: '肥胖醫學專科醫師', avatarSrc: '/assets/img/doctor-lin-yuanfu.jpg' },
  chung: { doctorSlug: 'chung', name: '鍾佩宜 醫師', role: '皮膚科專科醫師', avatarSrc: '/assets/img/doctor-chung.jpg' },
  hung: { doctorSlug: 'hung', name: '洪健睿 醫師', role: '二林四季皮膚科主治醫師', avatarSrc: '/assets/img/doctor-hung.jpg' },
  chao: { doctorSlug: 'chao', name: '趙映程 醫師', role: '皮膚科專科醫師', avatarSrc: '/assets/img/doctor-chao.jpg' },
  yangLanyi: { doctorSlug: 'yang-lanyi', name: '楊嵐怡 醫師', role: '肥胖醫學會醫師', avatarSrc: '/assets/img/doctor-yang-lanyi.jpg' },
} satisfies Record<string, ArticleAuthor>

export interface ArticleTagRef {
  slug: string
  label: string
}

/**
 * 標籤 slug → 顯示名稱。
 * ⚠️ **要查全部標籤，不是 POPULAR_TAGS** —— 後者只有前 12 個，
 *    查不到就會退回 slug，而標籤 slug 多半是百分號編碼的中文（`%e7%9a%ae…`），
 *    那會直接印在 `/blog/tag/{slug}/` 的標題上。
 */
export async function getTagLabel(slug: string): Promise<string> {
  const terms = await loadUnit(UNIT.term)
  return termsOf(terms, TERM.articleTag).find((t) => t.slug === slug)?.title ?? slug
}

export interface ArticleImage {
  src: string
  alt: string
  width: number
  height: number
}

export type ArticleBodyBlock =
  | { type: 'lead'; text: string }
  | { type: 'heading'; level: 2 | 3; id?: string; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'figure'; image: ArticleImage; caption: string; wide?: boolean }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'note'; variant: 'info' | 'warn'; text: string }

export interface RelatedTreatmentRef {
  slug: string
  categorySlug: string
  categoryLabel: string
  name: string
  image: ArticleImage
}

export interface RelatedConcernRef {
  slug: string
  label: string
}

export interface Article {
  slug: string
  title: string
  categorySlug: ArticleCategorySlug
  tags: ArticleTagRef[]
  author: ArticleAuthor
  reviewer?: ArticleReviewer
  /** ISO 日期字串。 */
  reviewedOn?: string
  /** 對外顯示日期（docs/08 §C-4 DisplayDate）。⚠️ 不是排程用的 PublishAt。 */
  displayDate: string
  /** 供 JSON-LD dateModified；沒有修訂過就與 displayDate 相同。 */
  dateModified?: string
  cover: ArticleImage
  /** 卡片摘要（DB: Articles.Summary）。 */
  summary: string
  /** SEO meta description（DB: SeoMeta.MetaDescription）。留空退回 summary。 */
  metaDescription?: string
  /** 後台 SEO 區塊的覆寫（見 _content.ts 的 seoOverridesOf）。 */
  seo: ReturnType<typeof seoOverridesOf>
  /** AI 摘要，40–60 字直答式（DB: SeoMeta.AiSummary），渲染成內頁第一段可見文字。留空退回 summary。 */
  aiSummary?: string
  readingMinutes: number
  featured?: boolean
  /** 這篇有沒有內文。內文本身用 `getArticleBody(slug)` 取，見該函式說明。 */
  hasBody: boolean
  relatedTreatments?: RelatedTreatmentRef[]
  relatedConcerns?: RelatedConcernRef[]
  authorBio?: string
}

/** 署名：醫師帶「醫師」，非醫師（藝術總監）不帶。 */
const doctorByline = (d: ContentRecord): string => (d.fields.isPhysician ? `${d.title} 醫師` : d.title)

/** 一次算繪要用到的其他單元。理由同 treatments.ts 的 TreatmentContext。 */
interface ArticleContext {
  terms: ContentRecord[]
  doctors: ContentRecord[]
  treatments: ContentRecord[]
  concerns: ContentRecord[]
}

const termTitle = (ctx: ArticleContext, id: unknown): string =>
  ctx.terms.find((t) => t.id === id)?.title ?? ''
const termSlug = (ctx: ArticleContext, id: unknown): string =>
  ctx.terms.find((t) => t.id === id)?.slug ?? ''

function toArticle(ctx: ArticleContext, record: ContentRecord): Article {
  const f = record.fields
  const authorDoctor = ctx.doctors.find((d) => d.id === f.authorDoctorId)
  const reviewerDoctor = ctx.doctors.find((d) => d.id === f.reviewerDoctorId)

  return {
    slug: record.slug as string,
    title: record.title,
    categorySlug: termSlug(ctx, f.categoryTermId) as ArticleCategorySlug,
    tags: relationsOf(record, REL.articleToTag).map((r) => ({
      slug: r.toSlug as string,
      label: r.toTitle as string,
    })),
    author: authorDoctor
      ? {
          doctorSlug: authorDoctor.slug as string,
          // ⚠️ 署名要帶「醫師」——資料庫存的是姓名（ContentItems.Title），
          //    是不是醫師由 IsPhysician 決定（14 位裡有 1 位是藝術總監，CLAUDE.md）。
          name: doctorByline(authorDoctor),
          role: (authorDoctor.fields.jobTitle as string) ?? undefined,
          avatarSrc: img(authorDoctor.fields.photo)?.src,
        }
      : { doctorSlug: null, name: (f.authorName as string) ?? '' },
    reviewer: reviewerDoctor
      ? {
          doctorSlug: reviewerDoctor.slug as string,
          name: doctorByline(reviewerDoctor),
          role: (reviewerDoctor.fields.jobTitle as string) ?? undefined,
        }
      : undefined,
    reviewedOn: (f.reviewedOn as string) ?? undefined,
    // 🔴 DisplayDate ≠ PublishAt（CLAUDE.md 關鍵數字）：前者是對外顯示與 datePublished 的來源。
    displayDate: String(f.displayDate ?? '').slice(0, 10),
    dateModified: record.updatedAt.slice(0, 10),
    cover: toImage(f.cover, record.title),
    summary: record.summary ?? '',
    metaDescription: (record.seo?.metaDescription as string) ?? undefined,
    seo: seoOverridesOf(record),
    aiSummary: (record.seo?.aiSummary as string) ?? undefined,
    readingMinutes: (f.readingMinutes as number) ?? 0,
    // ⚠️ **內文不在這裡** —— 見 getArticleBody()。這一欄留著只是為了讓
    //    「有沒有內文」可以在不載入內文的情況下判斷（清單頁用不到內文）。
    hasBody: f.bodyBlocks !== null && f.bodyBlocks !== undefined,
    relatedTreatments: ctx.treatments
      .filter((t) => t.relations.some((r) => r.relationType === REL.treatmentToArticle && r.toSlug === record.slug))
      .map((t) => ({
        slug: t.slug as string,
        categorySlug: termSlug(ctx, t.fields.categoryTermId),
        categoryLabel: termTitle(ctx, t.fields.categoryTermId),
        name: t.title,
        image: toImage(t.fields.cover, t.title),
      })),
    relatedConcerns: ctx.concerns
      .filter((c) => c.relations.some((r) => r.relationType === REL.concernToArticle && r.toSlug === record.slug))
      .map((c) => ({ slug: c.slug as string, label: c.title })),
    authorBio: authorDoctor?.summary ?? undefined,
  }
}

/**
 * 算繪一批文章紀錄需要的其他單元。
 *
 * 🔴 **2026-09-15：不再有 `ARTICLES` 這個「全部 1100 篇」的常數。**
 *    那在建置期成立（資料早就烤進產物），執行期等於每次算繪都傳 2.3 MB。
 *    改成：列表走分頁端點、內頁走 by-path、篩選（分類／標籤／作者）交給 API。
 */
async function articleContext(): Promise<ArticleContext> {
  const [terms, doctors, treatments, concerns] = await Promise.all([
    loadUnit(UNIT.term),
    loadUnit(UNIT.doctor),
    loadUnit(UNIT.treatment),
    loadUnit(UNIT.concern),
  ])
  return { terms, doctors, treatments, concerns }
}

/** 把 API 回來的紀錄組成前台的 Article 形狀。 */
export async function shapeArticles(records: ContentRecord[]): Promise<Article[]> {
  const ctx = await articleContext()
  return records.map((r) => toArticle(ctx, r))
}

/**
 * 列表每頁幾篇。
 * ⚠️ **這是必要的，不是排版偏好。** 列表頁原本把全部文章渲染在同一頁 ——
 *    種子資料 11 篇時沒問題，搬進舊站的 1100 篇之後 `/blog/` 會變成
 *    約 3.8 MB 的 HTML 加 1111 個 `<img>`（2026-09-14 估算）。
 * ⚠️ 12 ＝ 三欄 × 四列，對齊 mockup/06-blog-list.html 的版面。
 */
export const ARTICLES_PER_PAGE = 12

export interface PagedArticles {
  items: Article[]
  page: number
  totalPages: number
  total: number
}

/**
 * 切出某一頁。
 * ⚠️ 空清單時 `totalPages` 回 1 而不是 0 —— 「第 1 頁，共 0 頁」是壞掉的文案，
 *    而且會讓 `page > totalPages` 的 404 判斷把唯一一頁空狀態也擋掉。
 */
export function paginate(articles: Article[], page: number, perPage = ARTICLES_PER_PAGE): PagedArticles {
  const total = articles.length
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  const clamped = Math.min(Math.max(1, Math.trunc(page) || 1), totalPages)
  return {
    items: articles.slice((clamped - 1) * perPage, clamped * perPage),
    page: clamped,
    totalPages,
    total,
  }
}

/** 側欄「熱門標籤」要顯示幾個。⚠️ 不是排版偏好，是上限 —— 見 POPULAR_TAGS。 */
const POPULAR_TAG_LIMIT = 12

/**
 * 側欄「熱門標籤」——**依實際被引用的篇數取前 N 個**，不是全部標籤。
 *
 * ⚠️ 這裡原本是 `termsOf(TERM.articleTag)`（＝所有標籤）。種子資料只有 10 個標籤時
 *    看不出差別，搬進舊站的 391 篇之後標籤有 396 個，側欄會變成一面標籤牆，
 *    而且元件名字叫「熱門」卻列出全部，本來就自相矛盾。
 *
 * ⚠️ **這不影響標籤頁的預渲染。** `/blog/tag/{slug}/` 是靠 `crawlLinks` 從連結爬出來的，
 *    而文章內頁會列出自己的每一個標籤（blog/[slug].vue），所以沒進側欄的標籤照樣有頁面。
 */
export async function getPopularTags(): Promise<ArticleTagRef[]> {
  const rows = await apiGet<{ slug: string, title: string, articleCount: number }[]>(
    '/article/popular-tags', { limit: POPULAR_TAG_LIMIT },
  )
  return (rows ?? []).map((r) => ({ slug: r.slug, label: r.title }))
}

export const POPULAR_TREATMENTS_FOR_BLOG: RelatedTreatmentRef[] = [
  {
    slug: 'picosure-pro',
    categorySlug: 'laser',
    categoryLabel: '光療美顏',
    name: 'Picosure® Pro 鉑金版蜂巢皮秒雷射',
    image: { src: '/assets/img/product-p20.png', alt: 'Picosure Pro鉑金版蜂巢皮秒雷射機台', width: 200, height: 200 },
  },
  {
    slug: 'thermage-flx',
    categorySlug: 'photoelectric',
    categoryLabel: '光電美容',
    name: 'Thermage FLX 鳳凰電波',
    image: { src: '/assets/img/product-p13.png', alt: 'Thermage FLX鳳凰電波機台', width: 200, height: 200 },
  },
  {
    slug: 'sculptra',
    categorySlug: 'microneedle',
    categoryLabel: '微針美容',
    name: 'Sculptra 舒顏萃 4D聚左旋乳酸',
    image: { src: '/assets/img/product-p03.png', alt: 'Sculptra舒顏萃4D聚左旋乳酸產品', width: 200, height: 200 },
  },
]

/**
 * 依 slug 取一篇（含內文）。
 * ⚠️ 走 `GET /content?path=/blog/{slug}/` —— 網址是全站唯一的（docs/08 §B-1），
 *    所以這是最直接的查法，不必先知道它屬於哪個分類。
 */
export async function getArticleBySlug(slug: string): Promise<Article | undefined> {
  const record = await contentByPath(`/blog/${slug}/`)
  if (!record) return undefined
  const [shaped] = await shapeArticles([record])
  return shaped
}

/**
 * 文章內文。
 *
 * 🔴 **2026-09-15：由「建置期拆檔 ＋ import.meta.glob 動態載入」改成執行期取值。**
 *    舊做法的理由仍然值得記住：內文合計 8.4 MB，整包內聯會讓首頁訪客先下載全站
 *    文章的全文才看得到畫面；所以 `tools/content-export` 把它拆成
 *    `content/article-bodies/{slug}.json`，再用 glob 一篇一個 chunk。
 *    ⚠️ 那套做法還踩過一個坑：少了 `import.meta.server` 判斷，Vite 會把 1083 個
 *    chunk 全部列進 `<link rel=prefetch>`，瀏覽器閒置時默默把 8.4 MB 下載完，
 *    拆檔等於白做，而且沒有任何錯誤或警告（2026-09-14 實測）。
 *
 *    改成執行期之後這整個問題消失：內文只在「有人真的開那一篇」時才從 API 取，
 *    而且本來就跟著 by-path 的回應一起回來 —— 不必再拆檔、不必 glob、不會有 prefetch。
 */
export async function getArticleBody(slug: string): Promise<ArticleBodyBlock[]> {
  const record = await contentByPath(`/blog/${slug}/`)
  return parseBlocks<ArticleBodyBlock[]>(record?.fields.bodyBlocks, [])
}


/**
 * 列表：某一頁的文章。
 *
 * 🔴 **分頁、排序與篩選全部交給 API。** 原本是把 1100 篇讀進記憶體再 slice ——
 *    建置期那樣沒問題，執行期每開一次列表就要傳 2.3 MB。
 *
 * ⚠️ 空清單時 `totalPages` 回 1 而不是 0 —— 「第 1 頁，共 0 頁」是壞掉的文案，
 *    而且會讓 `page > totalPages` 的 404 判斷把唯一一頁空狀態也擋掉。
 */
async function listPage(
  page: number,
  opts: { categorySlug?: string, tagSlug?: string } = {},
): Promise<PagedArticles> {
  const terms = await loadUnit(UNIT.term)
  const categoryTermId = opts.categorySlug
    ? termsOf(terms, TERM.articleCategory).find((t) => t.slug === opts.categorySlug)?.id
    : undefined
  const tagTermId = opts.tagSlug
    ? termsOf(terms, TERM.articleTag).find((t) => t.slug === opts.tagSlug)?.id
    : undefined

  const result = await articlePage(page, ARTICLES_PER_PAGE, {
    latest: true,
    categoryTermId,
    tagTermId,
  })

  return {
    items: await shapeArticles(result.items),
    page: result.page,
    totalPages: Math.max(1, Math.ceil(result.totalCount / ARTICLES_PER_PAGE)),
    total: result.totalCount,
  }
}

export const listAllArticles = (page = 1) => listPage(page)

export const listArticlesByCategory = (categorySlug: ArticleCategorySlug, page = 1) =>
  listPage(page, { categorySlug })

export const listArticlesByTag = (tagSlug: string, page = 1) =>
  listPage(page, { tagSlug })

/** 同分類、排除自己，取最新 N 篇（頁尾「相關文章」用，見檔頭說明）。 */
export async function getRelatedArticles(article: Article, limit = 3): Promise<Article[]> {
  // 多取一篇，因為自己可能在結果裡。
  const { items } = await listPage(1, { categorySlug: article.categorySlug })
  return items.filter((a) => a.slug !== article.slug).slice(0, limit)
}

/** 'YYYY-MM-DD' → 'YYYY.MM.DD'，卡片與 byline 的顯示格式（JSON-LD 一律用原始 ISO 字串）。 */
export function formatDisplayDate(iso: string): string {
  return iso.replaceAll('-', '.')
}
