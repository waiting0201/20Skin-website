// 每個前台頁面的 head：標題、meta、canonical、OG、該頁的 mockup 樣式、JSON-LD。
//
// docs/09-frontend.md §6 的落地位置。正式站這些值來自 SeoMeta（docs/08 §B-4），
// 留空時由內容自動組出 —— 組法要與後台編輯畫面的預覽一致。

const SITE_NAME = '20SKIN 美醫集團'

/** 正式網域。JSON-LD 的 url／logo 也要絕對網址，所以對外開放。 */
export const ORIGIN = 'https://20skin.tw'

/**
 * 後台 SEO 區塊（`SeoMeta`，docs/08 §B-4）填的覆寫值。
 *
 * 🔴 **2026-09-17 之前這一整組除了 metaDescription 與 aiSummary 以外全是死的** ——
 *    欄位在後台改得動、存得起來，但前台從來沒有讀過它們。
 *    `seoTitle`／`ogImage`／`canonicalOverride`／`noIndex`／`structuredDataOverride`
 *    五欄全部零引用（`noIndex` 連 API 端也沒有人讀）。
 *
 * ⚠️ 這些值來自**已核准的版本快照**，所以後台改完要重新發布才會生效。
 */
export interface SeoOverrides {
  seoTitle?: string | null
  metaDescription?: string | null
  ogImage?: { src?: string | null } | null
  canonicalOverride?: string | null
  noIndex?: boolean | null
  structuredDataOverride?: string | null
}

export interface PageHeadOptions {
  /** <title> 的前半段。最終輸出為「{title}｜20SKIN 美醫集團」。 */
  title: string
  description: string
  /** 這一頁吃哪一支 mockup 頁面樣式，例如 '/assets/pages/16-faq.css'。 */
  pageCss?: string
  /** 目前路徑，用來組 canonical，例如 '/faq/'。 */
  path: string
  /** OG 分享圖的絕對或站內路徑。 */
  ogImage?: string
  /** 這一頁的結構化資料（docs/03-seo-geo.md §2）。可給多筆。 */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[]
  /** 標籤頁等不希望被索引的頁面（docs/08 §B-4）。 */
  noIndex?: boolean
  /** 後台 SEO 區塊的覆寫。內容頁請一律把 `record.seo` 傳進來。 */
  seo?: SeoOverrides | null
}

/**
 * 🔴 **`JSON.stringify` 不會跳脫 `<`。** 字串裡只要有 `</script>` 就會提前結束標籤，
 *    後面的內容變成可執行的 HTML —— 在覆寫值來自資料庫之後，那就是一條 stored XSS。
 *
 * ⚠️ 這個跳脫**對既有的自動產生內容一樣要套**，不是只為覆寫功能服務：
 *    標題、摘要這些欄位本來就可能被貼進奇怪的東西。
 *    `\u003c` 在 JSON 字串裡與 `<` 等價，schema.org 的消費端讀得到同一個值。
 */
export function serializeJsonLd(block: Record<string, unknown>): string {
  return JSON.stringify(block).replaceAll('<', '\\u003c')
}

/**
 * 後台填的結構化資料覆寫。
 *
 * ⚠️ 覆寫就是**整段取代**，不是合併 —— 合併的語意無法定義（哪一個 `@type` 勝出？
 * `@id` 撞了怎麼辦？）。所以填了它，這一頁自動產生的 MedicalWebPage、麵包屑
 * 全部不輸出。
 * ⚠️ 壞掉的 JSON **退回自動產生的那幾段**，不讓整頁 500。一頁的結構化資料壞掉
 * 不該把頁面一起拖下水。
 */
export function parseOverride(raw: string | null | undefined): Record<string, unknown>[] | null {
  if (!raw || !raw.trim()) return null
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.every((x) => x && typeof x === 'object') ? parsed : null
    if (parsed && typeof parsed === 'object') return [parsed]
    return null
  } catch {
    console.warn('[usePageHead] 結構化資料覆寫不是有效的 JSON，改用自動產生的版本')
    return null
  }
}

export function usePageHead(options: PageHeadOptions) {
  const seo = options.seo ?? null

  // canonical 覆寫：可以是站內路徑或完整網址（後台驗證擋的就是這兩種以外的）。
  const canonicalOverride = seo?.canonicalOverride?.trim()
  const canonical = canonicalOverride
    ? (canonicalOverride.startsWith('http') ? canonicalOverride : ORIGIN + canonicalOverride)
    : ORIGIN + options.path

  const title = seo?.seoTitle?.trim() || options.title
  const description = seo?.metaDescription?.trim() || options.description
  const ogImage = seo?.ogImage?.src || options.ogImage
  // ⚠️ 兩個來源是 OR：`indexable`（內容夠不夠實在，API 判的）與編輯的明確意願。
  //    任一成立就 noindex。
  const noIndex = Boolean(options.noIndex || seo?.noIndex)

  const override = parseOverride(seo?.structuredDataOverride)
  const blocks = override ?? (options.jsonLd
    ? Array.isArray(options.jsonLd)
      ? options.jsonLd
      : [options.jsonLd]
    : [])

  useHead({
    title: `${title}｜${SITE_NAME}`,
    meta: [
      { name: 'description', content: description },
      ...(noIndex ? [{ name: 'robots', content: 'noindex, nofollow' }] : []),
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: SITE_NAME },
      { property: 'og:title', content: `${title}｜${SITE_NAME}` },
      { property: 'og:description', content: description },
      { property: 'og:url', content: canonical },
      ...(ogImage ? [{ property: 'og:image', content: ogImage }] : []),
    ],
    link: [
      { rel: 'canonical', href: canonical },
      // 該頁專屬樣式。base.css 在 nuxt.config 全站掛上，這裡只加頁面層。
      // ⚠️ 一定要過 stampAsset —— /assets/* 是一年 immutable，沒有版號就改不動了
      //    （SSR 之後 postbuild 改寫不到算繪出來的 HTML，見 scripts/build-asset-version.mjs）。
      ...(options.pageCss ? [{ rel: 'stylesheet', href: stampAsset(options.pageCss) }] : []),
    ],
    script: blocks.map((block) => ({
      type: 'application/ld+json',
      innerHTML: serializeJsonLd(block),
    })),
  })
}

/** 麵包屑的 JSON-LD（docs/03-seo-geo.md §2，全站啟用）。 */
export function breadcrumbJsonLd(trail: { label: string; href: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.label,
      item: ORIGIN + item.href,
    })),
  }
}
