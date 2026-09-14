// sitemap 設定、robots.txt 與 FAQ／語料匯出（docs/03 §1、docs/04 §3、docs/06 §6、docs/07 §4、docs/08 §H）
//
// 上層畫面只透過 client.ts 匯出的 adminApi 取用，不直接 import 這個檔。
//
// ⚠️ 這支刻意不 import client.ts（避免循環相依，見 redirect.ts 檔頭同樣的說明）。
// 「哪些內容項目會進到哪個 sitemap 分檔」這種跨單元的即時統計，由 SitemapSettings.vue
// 自己呼叫 adminApi.content.list() 湊資料後傳進本檔的純函式。
//
// 🔴 docs/08-database.md §H：sitemap 的 5 個分檔**不需要資料表**，收錄範圍在建置期由
//    `ContentType ＋ IncludeInSitemap ＋ Status ＋ UrlPath IS NOT NULL` 算出來。
//    這裡讀寫的「分檔設定」（是否納入、預設 changefreq／priority）是 `SiteSettings`
//    底下的一個 JSON 值（鍵 `seo.sitemapFiles`），robots.txt 是另一個鍵（`seo.robotsTxt`）。
//
// ⚠️ **匯出預覽一律走 API，前端不自己組**。同一份 faq.json／llms.txt 在建置期由
//    匯出腳本產生，後台這個畫面只是預覽（docs/07 §4）。前端若自己組一份，
//    就會有兩個產生器、兩套規則，而且**預覽跟正式產物不一樣時沒有人會發現**。

import type { UnitKey } from '../types'
import { request } from './http'
import { readSettings, settingJson, settingText, writeSettings } from './settings-client'

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

# AI 爬蟲：本站刻意放行——讀得到內容是 GEO 策略的先決條件。
# 不要在這裡加 Disallow 擋 GPTBot／ClaudeBot／PerplexityBot 等。

Sitemap: https://www.20skin.tw/sitemap.xml
`


/** robots.txt 裡出現 `Disallow: /admin` 這種寫法時回傳警告文字；沒有問題回傳 null。畫面用來擋一個明知會出問題的存檔，而不是事後才發現。 */
export function checkRobotsTxt(text: string): string | null {
  const hasAdminDisallow = text
    .split(/\r?\n/)
    .some((line) => /^\s*disallow\s*:/i.test(line) && /\/admin/i.test(line))
  if (hasAdminDisallow) {
    return '偵測到 Disallow 規則指向 /admin——這等於在公開檔案裡標示後台路徑位置，反而幫攻擊者省一步。擋索引已經由後台路由的 X-Robots-Tag 處理，不需要也不應該寫在這裡。'
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

// ── 匯出預覽 ──────────────────────────────────────────────────────────
//
// 🔴 **產生器只有一個，在後端。** faq.json／llms.txt／llms-full.txt 的正式產物由建置期的
//    匯出腳本產生（docs/07 §4），後台這個畫面只是預覽，所以它必須問同一個產生器 ——
//    前端自己組一份的話，預覽跟正式產物不一致時不會有任何徵兆。
//
// ⚠️ 連帶：這裡**不再匯出** `buildFaqJson`／`buildLlmsTxt`／`buildLlmsFullTxt`
//    與 `FaqExportItem`／`SiteFactsForExport`。Export.vue 改成直接要預覽全文。

export type ExportKind = 'faq.json' | 'llms.txt' | 'llms-full.txt'

export interface ExportPreview {
  kind: string
  itemCount: number
  generatedAt: string
  /** 預覽全文（JSON 或純文字，依 kind 而定）。 */
  content: string
}

const SITEMAP_FILES_KEY = 'seo.sitemapFiles'
const ROBOTS_KEY = 'seo.robotsTxt'

/**
 * 讀回來的分檔設定與程式碼裡的預設合併。
 *
 * ⚠️ 以**程式碼的 5 個分檔為準**，資料庫只提供那三個旋鈕的值。
 * 反過來（以資料庫為準）的話，日後程式碼新增一個分檔，舊資料庫裡沒有那一列，
 * 畫面上就會少一個分檔而且沒有任何提示。
 */
function mergeSitemapFiles(stored: Partial<SitemapFileConfig>[]): SitemapFileConfig[] {
  return defaultSitemapFiles().map((base) => {
    const found = stored.find((f) => f.key === base.key)
    if (!found) return base
    return {
      ...base,
      enabled: found.enabled ?? base.enabled,
      defaultChangeFreq: found.defaultChangeFreq ?? base.defaultChangeFreq,
      defaultPriority: found.defaultPriority ?? base.defaultPriority,
    }
  })
}

async function loadSitemapFiles(): Promise<SitemapFileConfig[]> {
  const settings = await readSettings()
  return mergeSitemapFiles(settingJson<Partial<SitemapFileConfig>[]>(settings, SITEMAP_FILES_KEY, []))
}

async function saveSitemapFiles(files: SitemapFileConfig[]): Promise<void> {
  await writeSettings({ [SITEMAP_FILES_KEY]: JSON.stringify(files) })
}

export const seoApi = {
  sitemap: {
    async list(): Promise<SitemapFileConfig[]> {
      return loadSitemapFiles()
    },

    async update(
      key: SitemapFileKey,
      patch: Partial<Pick<SitemapFileConfig, 'enabled' | 'defaultChangeFreq' | 'defaultPriority'>>,
    ): Promise<SitemapFileConfig> {
      // ⚠️ 整份讀 → 改一個 → 整份寫回。這個鍵的值是一個 JSON 陣列，
      //    資料庫層面沒有「只改其中一筆」這回事。
      const files = await loadSitemapFiles()
      const target = files.find((f) => f.key === key)
      if (!target) throw new Error(`未知的 sitemap 分檔：${key}`)
      Object.assign(target, patch)
      await saveSitemapFiles(files)
      return { ...target }
    },

    async resetDefaults(): Promise<SitemapFileConfig[]> {
      const files = defaultSitemapFiles()
      await saveSitemapFiles(files)
      return files
    },
  },

  robots: {
    async get(): Promise<{ text: string; updatedAt: string }> {
      const settings = await readSettings()
      return {
        text: settingText(settings, ROBOTS_KEY, DEFAULT_ROBOTS_TXT),
        updatedAt: settings.get(ROBOTS_KEY)?.updatedAt ?? '',
      }
    },

    async update(text: string): Promise<{ text: string; updatedAt: string }> {
      await writeSettings({ [ROBOTS_KEY]: text })
      return seoApi.robots.get()
    },

    async resetDefault(): Promise<{ text: string; updatedAt: string }> {
      await writeSettings({ [ROBOTS_KEY]: DEFAULT_ROBOTS_TXT })
      return seoApi.robots.get()
    },

    check: checkRobotsTxt,
  },

  consistency: {
    check: findSeoConsistencyIssues,
  },

  export: {
    /**
     * `GET /admin/export/{kind}`：預覽全文。
     * ⚠️ **只是預覽**，按下去不會發布任何東西 —— 正式產物在建置期產生（docs/07 §4）。
     */
    async preview(kind: ExportKind): Promise<ExportPreview> {
      return request<ExportPreview>(`/admin/export/${encodeURIComponent(kind)}`)
    },
  },
}
