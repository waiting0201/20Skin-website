// sitemap 設定與 FAQ／語料匯出（docs/03 §1、docs/04 §3、docs/06 §6、docs/07 §4、docs/08 §H）
//
// ⚠️ 這是 mock 的骨架，由第二輪的畫面實作填滿。
// 持久化用 ./mock-store 開獨立的 store（理由見該檔案），**不要動 client.ts 的 Db**。
//
// 上層畫面只透過 client.ts 匯出的 adminApi 取用，不直接 import 這個檔。
// 接上 api.20skin.tw 時整支換掉，畫面不必改（docs/09-frontend.md §8）。
//
// ⚠️ 這支刻意不 import client.ts（避免循環相依，見 redirect.ts 檔頭同樣的說明）。
// 「哪些內容型別／哪些內容項目會進到哪個 sitemap 分檔」這種跨單元的即時統計，
// 由 SitemapSettings.vue／Export.vue 自己呼叫 adminApi.content.list() 湊資料後
// 傳進本檔的純函式；本檔只管設定值本身的存讀，以及純文字組裝邏輯。
//
// ⚠️ docs/08-database.md §H 說得很清楚：sitemap 的 5 個分檔**不需要資料表**，
// 內容範圍在建置期由 `ContentType ＋ IncludeInSitemap ＋ Status ＋ UrlPath IS NOT NULL`
// 算出來。這裡持久化的「分檔設定」（是否納入、預設 changefreq／priority）是
// docs/08 §G-1 `SiteSettings` 底下的一組 JSON 值，不是新表；mock 用獨立
// store 只是第二輪畫面平行開發的權宜（理由見 mock-store.ts 檔頭）。

import { createStore } from './mock-store'
import type { UnitKey } from '../types'

// ── Sitemap 分檔設定 ──────────────────────────────────────────────────

export type SitemapFileKey = 'pages' | 'treatments' | 'concerns' | 'doctors' | 'blog'
export type ChangeFreq = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'

export interface SitemapFileConfig {
  key: SitemapFileKey
  label: string
  fileName: string
  /** 說明用：這個分檔大致收哪些內容型別。實際收錄範圍在建置期由內容欄位決定，這裡僅供畫面顯示。 */
  sourceUnits: UnitKey[]
  enabled: boolean
  defaultChangeFreq: ChangeFreq
  defaultPriority: number // 0–1
}

export const CHANGE_FREQ_OPTIONS: ChangeFreq[] = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never']

function defaultSitemapFiles(): SitemapFileConfig[] {
  return [
    { key: 'pages', label: '固定頁面', fileName: 'sitemap-pages.xml', sourceUnits: ['page', 'clinic', 'case', 'faq'], enabled: true, defaultChangeFreq: 'monthly', defaultPriority: 0.5 },
    { key: 'treatments', label: '療程', fileName: 'sitemap-treatments.xml', sourceUnits: ['treatment', 'term'], enabled: true, defaultChangeFreq: 'weekly', defaultPriority: 0.8 },
    { key: 'concerns', label: '困擾', fileName: 'sitemap-concerns.xml', sourceUnits: ['concern'], enabled: true, defaultChangeFreq: 'weekly', defaultPriority: 0.7 },
    { key: 'doctors', label: '醫師', fileName: 'sitemap-doctors.xml', sourceUnits: ['doctor'], enabled: true, defaultChangeFreq: 'monthly', defaultPriority: 0.6 },
    { key: 'blog', label: '文章', fileName: 'sitemap-blog.xml', sourceUnits: ['article', 'term'], enabled: true, defaultChangeFreq: 'weekly', defaultPriority: 0.6 },
  ]
}

// ── robots.txt ────────────────────────────────────────────────────────
//
// 預設內容對齊 docs/03-seo-geo.md §1：
//   - 一定要有 Sitemap 指令
//   - 封鎖 /search/ 這類無價值參數頁
//   - **不封鎖 AI 爬蟲**（GPTBot／ClaudeBot…，見 docs/03 §1 表格第一列）
//   - **不列 `Disallow: /admin/`**——寫進公開檔案等於標示位置，擋索引改由
//     該路由的 `X-Robots-Tag: noindex, nofollow` 負責（已由部署範本涵蓋）
const DEFAULT_ROBOTS_TXT = `User-agent: *
Disallow: /search/

# AI 爬蟲：本站刻意放行，見 docs/03-seo-geo.md §1（GEO 策略的先決條件）。
# 不要在這裡加 Disallow 擋 GPTBot／ClaudeBot／PerplexityBot 等，
# 也不要加 Disallow: /admin/——原因見 docs/03-seo-geo.md §1。

Sitemap: https://www.20skin.tw/sitemap.xml
`

interface SeoSettingsDb {
  sitemapFiles: SitemapFileConfig[]
  robotsTxt: string
  robotsUpdatedAt: string
}

function seedSeoSettings(): SeoSettingsDb {
  return { sitemapFiles: defaultSitemapFiles(), robotsTxt: DEFAULT_ROBOTS_TXT, robotsUpdatedAt: new Date().toISOString() }
}

const store = createStore<SeoSettingsDb>('seo-settings', seedSeoSettings, 1)

/** robots.txt 裡出現 `Disallow: /admin` 這種寫法時回傳警告文字；沒有問題回傳 null。畫面用來擋一個明知會出問題的存檔，而不是事後才發現。 */
export function checkRobotsTxt(text: string): string | null {
  const hasAdminDisallow = text
    .split(/\r?\n/)
    .some((line) => /^\s*disallow\s*:/i.test(line) && /\/admin/i.test(line))
  if (hasAdminDisallow) {
    return '偵測到 Disallow 規則指向 /admin——docs/03-seo-geo.md §1：這等於在公開檔案裡標示後台路徑位置，反而幫攻擊者省一步。擋索引已經由後台路由的 X-Robots-Tag 處理，不需要也不應該寫在這裡。'
  }
  return null
}

// ── 內容型別 × IncludeInSitemap × NoIndex 一致性檢查 ─────────────────
//
// docs/08 §B-4：「NoIndex 與 IncludeInSitemap 是兩件事」。這裡只提供純檢查
// 函式，實際內容清單由 SitemapSettings.vue 呼叫 adminApi.content.list() 逐單元湊出來。

export interface SeoConsistencyInput {
  id: number
  unit: UnitKey
  title: string
  urlPath: string | null
  includeInSitemap: boolean
  noIndex: boolean
}

export interface SeoConsistencyIssue {
  id: number
  unit: UnitKey
  title: string
  urlPath: string | null
  /** 目前只會出現這一種自相矛盾組合：sitemap 說收錄、頁面卻標 noindex。 */
  reason: string
}

/** 找出「sitemap 要送出去、頁面卻標 noindex」的自相矛盾項目。相反組合（不收錄＋noindex，例如標籤頁）是正常設計，不算問題。 */
export function findSeoConsistencyIssues(items: SeoConsistencyInput[]): SeoConsistencyIssue[] {
  return items
    .filter((i) => i.includeInSitemap && i.noIndex && i.urlPath)
    .map((i) => ({ id: i.id, unit: i.unit, title: i.title, urlPath: i.urlPath, reason: 'IncludeInSitemap 開啟，但 SEO 區塊的 NoIndex 也開啟——sitemap 會把這頁送出去，Google 卻被告知不要收錄，等於送出矛盾訊號。' }))
}

// ── FAQ／語料匯出：預覽用的純文字組裝 ─────────────────────────────────
//
// ⚠️ docs/07-deployment.md §4：「sitemap.xml／llms.txt 仍在建置期產生，
// 產物直接進 .output/public。走 API 產生反而更差」。這裡的函式只是把資料
// 組成字串給畫面「預覽＋下載」，**不會、也不該把結果送到任何地方發布**——
// 真正的產出時機是 CI 的 nuxt generate，不是這個畫面按一顆按鈕。

export interface FaqExportItem {
  id: number
  question: string
  categoryLabel: string
  aiSummary: string
  webAnswer: string
  urlPath: string | null
  updatedAt: string
}

export interface SiteFactsForExport {
  siteName: string
  tagline: string
  keyFacts: string[]
  /** { 分類標題: [{標題, 網址, 一句話摘要}] }，例如療程、困擾、醫師、據點。 */
  sections: { title: string; items: { title: string; url: string | null; summary: string }[] }[]
}

export function buildFaqJson(items: FaqExportItem[]): string {
  const payload = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    generatedNote: '此為後台預覽輸出，正式檔案於建置期（nuxt generate）產生，見 docs/07-deployment.md §4。',
    mainEntity: items.map((f) => ({
      '@type': 'Question',
      name: f.question,
      url: f.urlPath ?? undefined,
      dateModified: f.updatedAt,
      acceptedAnswer: { '@type': 'Answer', text: f.aiSummary },
    })),
  }
  return JSON.stringify(payload, null, 2)
}

export function buildLlmsTxt(facts: SiteFactsForExport): string {
  const lines: string[] = [`# ${facts.siteName}`, '', `> ${facts.tagline}`, '']
  if (facts.keyFacts.length) {
    lines.push('## 關鍵事實', '')
    for (const f of facts.keyFacts) lines.push(`- ${f}`)
    lines.push('')
  }
  for (const section of facts.sections) {
    lines.push(`## ${section.title}`, '')
    for (const item of section.items) {
      lines.push(item.url ? `- [${item.title}](${item.url})：${item.summary}` : `- ${item.title}：${item.summary}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

export function buildLlmsFullTxt(facts: SiteFactsForExport, faqs: FaqExportItem[]): string {
  const lines: string[] = [facts.siteName, facts.tagline, '', '關鍵事實：', ...facts.keyFacts.map((f) => `- ${f}`), '']
  for (const section of facts.sections) {
    lines.push(`# ${section.title}`, '')
    for (const item of section.items) {
      lines.push(`## ${item.title}`)
      if (item.url) lines.push(`網址：${item.url}`)
      lines.push(item.summary, '')
    }
  }
  if (faqs.length) {
    lines.push('# 常見問題', '')
    for (const f of faqs) {
      lines.push(`## ${f.question}`, `分類：${f.categoryLabel}　最後更新：${f.updatedAt.slice(0, 10)}`, f.webAnswer, '')
    }
  }
  return lines.join('\n')
}

// ── 對外 API ──────────────────────────────────────────────────────────

export const seoApi = {
  sitemap: {
    async list(): Promise<SitemapFileConfig[]> {
      return [...store.read().sitemapFiles]
    },
    async update(key: SitemapFileKey, patch: Partial<Pick<SitemapFileConfig, 'enabled' | 'defaultChangeFreq' | 'defaultPriority'>>): Promise<SitemapFileConfig> {
      return store.mutate((d) => {
        const file = d.sitemapFiles.find((f) => f.key === key)
        if (!file) throw new Error(`未知的 sitemap 分檔：${key}`)
        Object.assign(file, patch)
        return { ...file }
      })
    },
    async resetDefaults(): Promise<SitemapFileConfig[]> {
      return store.mutate((d) => {
        d.sitemapFiles = defaultSitemapFiles()
        return [...d.sitemapFiles]
      })
    },
  },

  robots: {
    async get(): Promise<{ text: string; updatedAt: string }> {
      const d = store.read()
      return { text: d.robotsTxt, updatedAt: d.robotsUpdatedAt }
    },
    async update(text: string): Promise<{ text: string; updatedAt: string }> {
      return store.mutate((d) => {
        d.robotsTxt = text
        d.robotsUpdatedAt = new Date().toISOString()
        return { text: d.robotsTxt, updatedAt: d.robotsUpdatedAt }
      })
    },
    async resetDefault(): Promise<{ text: string; updatedAt: string }> {
      return store.mutate((d) => {
        d.robotsTxt = DEFAULT_ROBOTS_TXT
        d.robotsUpdatedAt = new Date().toISOString()
        return { text: d.robotsTxt, updatedAt: d.robotsUpdatedAt }
      })
    },
    check: checkRobotsTxt,
  },

  consistency: {
    check: findSeoConsistencyIssues,
  },

  export: {
    buildFaqJson,
    buildLlmsTxt,
    buildLlmsFullTxt,
  },
}
