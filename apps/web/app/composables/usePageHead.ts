// 每個前台頁面的 head：標題、meta、canonical、OG、該頁的 mockup 樣式、JSON-LD。
//
// docs/09-frontend.md §6 的落地位置。正式站這些值來自 SeoMeta（docs/08 §B-4），
// 留空時由內容自動組出 —— 組法要與後台編輯畫面的預覽一致。

const SITE_NAME = '20SKIN 美醫集團'

/** 正式網域。JSON-LD 的 url／logo 也要絕對網址，所以對外開放。 */
export const ORIGIN = 'https://20skin.tw'

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
}

export function usePageHead(options: PageHeadOptions) {
  const canonical = ORIGIN + options.path
  const blocks = options.jsonLd
    ? Array.isArray(options.jsonLd)
      ? options.jsonLd
      : [options.jsonLd]
    : []

  useHead({
    title: `${options.title}｜${SITE_NAME}`,
    meta: [
      { name: 'description', content: options.description },
      ...(options.noIndex ? [{ name: 'robots', content: 'noindex, nofollow' }] : []),
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: SITE_NAME },
      { property: 'og:title', content: `${options.title}｜${SITE_NAME}` },
      { property: 'og:description', content: options.description },
      { property: 'og:url', content: canonical },
      ...(options.ogImage ? [{ property: 'og:image', content: options.ogImage }] : []),
    ],
    link: [
      { rel: 'canonical', href: canonical },
      // 該頁專屬樣式。base.css 在 nuxt.config 全站掛上，這裡只加頁面層。
      ...(options.pageCss ? [{ rel: 'stylesheet', href: options.pageCss }] : []),
    ],
    script: blocks.map((block) => ({
      type: 'application/ld+json',
      innerHTML: JSON.stringify(block),
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
