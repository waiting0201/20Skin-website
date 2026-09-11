// 301 轉址管理（docs/10 §3.4、docs/08 §H、docs/01 §4、docs/07 §2）
//
// ⚠️ 這是 mock 的骨架，由第二輪的畫面實作填滿。
// 持久化用 ./mock-store 開獨立的 store（理由見該檔案），**不要動 client.ts 的 Db**。
//
// 上層畫面只透過 client.ts 匯出的 adminApi 取用，不直接 import 這個檔。
// 接上 api.20skin.tw 時整支換掉，畫面不必改（docs/09-frontend.md §8）。
//
// ⚠️ 這支刻意不 import client.ts —— client.ts 會 import 這支（組成 adminApi.redirect），
// 反向 import 會循環相依。跨單元的「目標路徑是否對應到真實內容」查核，
// 由 Redirects.vue 自己呼叫 adminApi.content.list() 湊出已知路徑清單後傳進來，
// 這支只負責純資料與純檢查邏輯。

import { createStore } from './mock-store'
import { ApiError } from './errors'

// ── 型別 ────────────────────────────────────────────────────────────────

/** docs/08-database.md §H `Redirects.Source`：1 遷移工具產生／2 人工新增／3 系統自動。 */
export type RedirectSource = 1 | 2 | 3
export const REDIRECT_SOURCE_LABEL: Record<RedirectSource, string> = {
  1: '遷移工具產生',
  2: '人工新增',
  3: '系統自動',
}

/** docs/08-database.md §H 允許的狀態碼；欄位本身是 smallint，不限死 301。 */
export const REDIRECT_STATUS_CODES = [301, 302, 410] as const
export type RedirectStatusCode = (typeof REDIRECT_STATUS_CODES)[number]

export interface RedirectRecord {
  id: number
  /** 正規化後的完整相對路徑（含排序後 query string），docs/08 §H：唯一。 */
  fromPath: string
  toPath: string
  statusCode: RedirectStatusCode
  isActive: boolean
  source: RedirectSource
  /** 人工抽查 ≥ 20% 的勾稽欄位（docs/08 §H）。 */
  isVerified: boolean
  createdAt: string
}

export interface RedirectListQuery {
  page?: number
  pageSize?: number
  keyword?: string
  isActive?: boolean
  source?: RedirectSource
  sortBy?: 'createdAt' | 'fromPath'
  sortDir?: 'asc' | 'desc'
}

export interface RedirectPagedResult {
  items: RedirectRecord[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}

export interface RedirectStats {
  totalCount: number
  activeCount: number
  verifiedCount: number
  bySource: Record<RedirectSource, number>
}

export interface RedirectInput {
  fromPath: string
  toPath: string
  statusCode?: RedirectStatusCode
  isActive?: boolean
  source?: RedirectSource
  isVerified?: boolean
}

export interface RedirectImportRow {
  fromPath: string
  toPath: string
  statusCode?: number
}

export type RedirectIssueCode =
  | 'INVALID_ROW'
  | 'DUPLICATE_EXISTING'
  | 'DUPLICATE_IN_BATCH'
  | 'LOOP'
  | 'TARGET_NOT_FOUND'
  | 'NO_TRAILING_SLASH'

export interface RedirectIssue {
  level: 'error' | 'warning'
  code: RedirectIssueCode
  message: string
}

export interface RedirectPreviewRow {
  /** 在這批匯入資料裡的序號（1-based），對照原始檔案的行號用。 */
  row: number
  input: RedirectImportRow
  normalizedFrom: string
  normalizedTo: string
  issues: RedirectIssue[]
  /** 命中 DUPLICATE_EXISTING 時，指向既有那一筆的 id，UI 用來顯示「目前指向哪裡」。 */
  conflictsWithId?: number
}

export interface RedirectImportPreview {
  rows: RedirectPreviewRow[]
  errorCount: number
  warningCount: number
  /** 沒有 error 等級問題、可以直接建立的筆數（不含會被 overwrite 覆蓋的重複筆數）。 */
  creatableCount: number
  /** DUPLICATE_EXISTING 但沒有其他 error——打開「覆蓋既有規則」才會被處理的筆數。 */
  overwritableCount: number
}

export interface RedirectImportOptions {
  /** 對 DUPLICATE_EXISTING 的處理方式：true 更新既有那筆的 ToPath／StatusCode，false 略過。 */
  overwriteExisting?: boolean
  defaultSource?: RedirectSource
}

export interface RedirectImportResult {
  created: number
  updated: number
  skipped: number
  preview: RedirectImportPreview
}

// ── 已知的站內頂層路徑（給「目標路徑是否存在」核對用的靜態補充） ──────────
//
// 系統頁（page-home／page-team…）在 mock 裡沒有 slug、urlPath 為 null
// （client.ts 的 recomputeUrlPath：無 slug 一律 null），單靠
// adminApi.content 撈不到這些頂層網址。這裡先手動列出 21 個模板裡「總覽∕
// 固定」類頁面的正式網址，Redirects.vue 會把這份清單和即時撈到的內容網址
// 合併，一起當作「目標路徑存在」的核對依據。
export const STATIC_TOP_LEVEL_PATHS: string[] = [
  '/',
  '/team/',
  '/treatments/',
  '/treatments/laser/',
  '/treatments/microneedle/',
  '/treatments/photoelectric/',
  '/treatments/skincare/',
  '/concerns/',
  '/blog/',
  '/blog/medical-aesthetics/',
  '/blog/dermatology/',
  '/blog/media/',
  '/blog/lectures/',
  '/cases/',
  '/faq/',
  '/clinics/',
  '/clinics/siji/',
  '/clinics/erlin/',
  '/contact/',
  '/search/',
  '/about/',
  '/privacy/',
  '/terms/',
]

// ── 正規化與純檢查邏輯（preview／commit／單筆新增修改共用） ───────────────

/**
 * docs/08-database.md §H：「存 path ＋ 排序後 query 的正規化完整相對路徑，
 * `/api/fallback` 比對前跑同一套正規化」。只套用在 FromPath——ToPath 是
 * 新站網址，遵守 trailingSlash 慣例，不能被這裡的去尾斜線邏輯誤傷。
 */
export function normalizeFromPath(input: string): string {
  const raw = (input ?? '').trim()
  if (!raw) return ''
  const [pathPart, ...rest] = raw.split('?')
  const queryPart = rest.join('?') // 中文 query 值本身理論上不會再帶 '?'，但保守起見不用 split 限制數量
  let path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`
  if (path.length > 1) path = path.replace(/\/+$/, '')
  if (!queryPart) return path
  const params = queryPart.split('&').filter(Boolean).sort()
  return params.length ? `${path}?${params.join('&')}` : path
}

/** ToPath 只做最基本的整理：去頭尾空白、補開頭斜線。不動尾端斜線。 */
export function normalizeToPath(input: string): string {
  const raw = (input ?? '').trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw // 極少數會導到外部網址（例如 blog 站，見 docs/01 決策三），原樣保留
  return raw.startsWith('/') ? raw : `/${raw}`
}

function isValidStatusCode(code: number | undefined): code is RedirectStatusCode {
  return code === undefined || (REDIRECT_STATUS_CODES as readonly number[]).includes(code)
}

/**
 * 對一批（可能只有一筆）輸入做完整檢查：欄位有效性、彼此重複、與既有資料重複、
 * 一層轉址鏈、（若提供 knownGoodPaths）目標是否指向已知存在的路徑。
 *
 * ⚠️ 只做「擋一層」的鏈路檢查（docs/08 §H）：新目標若剛好是某條既有規則的
 * 來源，或既有某條規則的目標剛好是新來源，都視為會形成連續轉址而擋下。
 * 多層遞移閉包留給上線前的驗收腳本，不在這裡做。
 */
function evaluateRows(
  inputs: RedirectImportRow[],
  existing: RedirectRecord[],
  opts: { knownGoodPaths?: Set<string>; excludeId?: number } = {},
): RedirectPreviewRow[] {
  const relevant = existing.filter((r) => opts.excludeId === undefined || r.id !== opts.excludeId)
  const existingByFrom = new Map<string, RedirectRecord>()
  for (const r of relevant) existingByFrom.set(r.fromPath, r)
  const existingFromPaths = new Set(existingByFrom.keys())
  const existingToPaths = new Set(relevant.map((r) => r.toPath))

  // 批次內互相形成鏈路的檢查（例如同一批 CSV 裡 /x→/y 又有 /y→/z）——這兩批
  // 都還沒進 d.rows，只查 existing 抓不到，要另外湊一份批次自己的 from／to 集合。
  const batchFromPaths = new Set(inputs.map((i) => normalizeFromPath(i.fromPath)).filter(Boolean))
  const batchToPaths = new Set(inputs.map((i) => normalizeToPath(i.toPath)).filter(Boolean))

  const seenInBatch = new Set<string>()
  const results: RedirectPreviewRow[] = []

  inputs.forEach((input, idx) => {
    const issues: RedirectIssue[] = []
    const normalizedFrom = normalizeFromPath(input.fromPath)
    const normalizedTo = normalizeToPath(input.toPath)

    if (!normalizedFrom || !normalizedTo) {
      issues.push({ level: 'error', code: 'INVALID_ROW', message: '來源路徑與目標路徑都不能是空的。' })
    }
    if (input.statusCode !== undefined && !isValidStatusCode(input.statusCode)) {
      issues.push({ level: 'error', code: 'INVALID_ROW', message: `狀態碼 ${input.statusCode} 不支援，僅接受 301／302／410。` })
    }

    let conflictsWithId: number | undefined

    if (normalizedFrom) {
      if (seenInBatch.has(normalizedFrom)) {
        issues.push({ level: 'error', code: 'DUPLICATE_IN_BATCH', message: '這批匯入資料裡有其他列使用同一個來源路徑，只有第一筆會被採用。' })
      } else {
        seenInBatch.add(normalizedFrom)
      }

      const existingHit = existingByFrom.get(normalizedFrom)
      if (existingHit) {
        conflictsWithId = existingHit.id
        issues.push({
          level: 'error',
          code: 'DUPLICATE_EXISTING',
          message: `這個來源已經有轉址規則，目前指向「${existingHit.toPath}」。勾選「覆蓋既有規則」才會更新。`,
        })
      }
    }

    if (normalizedFrom && normalizedTo) {
      if (normalizedFrom === normalizedTo) {
        issues.push({ level: 'error', code: 'LOOP', message: '來源與目標是同一個路徑，會造成自我轉址迴圈。' })
      } else if (existingFromPaths.has(normalizedTo) || batchFromPaths.has(normalizedTo)) {
        issues.push({ level: 'error', code: 'LOOP', message: `目標路徑「${normalizedTo}」本身也是另一條轉址規則（既有或同一批匯入）的來源，會形成連續轉址鏈（A→B→C）。` })
      } else if (existingToPaths.has(normalizedFrom) || batchToPaths.has(normalizedFrom)) {
        issues.push({ level: 'error', code: 'LOOP', message: '這個來源路徑目前是另一條規則（既有或同一批匯入）的目標，新增後會形成連續轉址鏈（A→B→C）。' })
      }
    }

    if (normalizedTo && opts.knownGoodPaths && !opts.knownGoodPaths.has(normalizedTo) && !/^https?:\/\//i.test(normalizedTo)) {
      issues.push({
        level: 'warning',
        code: 'TARGET_NOT_FOUND',
        message: '系統目前找不到這個路徑對應的內容——可能是尚未建立／尚未發布，不一定是匯入錯誤，上架前請再次確認。',
      })
    }

    if (normalizedTo && !/^https?:\/\//i.test(normalizedTo) && normalizedTo !== '/' && !normalizedTo.endsWith('/') && !/\.[a-z0-9]+$/i.test(normalizedTo)) {
      issues.push({ level: 'warning', code: 'NO_TRAILING_SLASH', message: '目標路徑沒有結尾斜線，與新站網址慣例不一致，可能導致多跳一次轉址（docs/07 §2）。' })
    }

    results.push({ row: idx + 1, input, normalizedFrom, normalizedTo, issues, conflictsWithId })
  })

  return results
}

function summarizePreview(rows: RedirectPreviewRow[]): RedirectImportPreview {
  let errorCount = 0
  let warningCount = 0
  let creatableCount = 0
  let overwritableCount = 0
  for (const r of rows) {
    const errors = r.issues.filter((i) => i.level === 'error')
    warningCount += r.issues.filter((i) => i.level === 'warning').length
    if (errors.length === 0) {
      creatableCount++
    } else {
      errorCount += errors.length
      const onlyDuplicate = errors.length === 1 && errors[0].code === 'DUPLICATE_EXISTING'
      if (onlyDuplicate) overwritableCount++
    }
  }
  return { rows, errorCount, warningCount, creatableCount, overwritableCount }
}

// ── 簡易 CSV 解析與序列化（RFC 4180 精簡版：支援雙引號escape，不支援多行儲存格以外的花招） ──

function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else { inQuotes = false }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      cells.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  cells.push(cur)
  return cells
}

function csvCell(value: string | number): string {
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** 解析上傳的 CSV 文字，回傳可以丟給 preview／commit 的列。容錯：辨識中英文表頭，辨識不出來就當作沒有表頭、用欄位順序。 */
export function parseRedirectCsv(text: string): RedirectImportRow[] {
  const lines = text.replace(/^﻿/, '').split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0)
  if (!lines.length) return []

  const headerCells = parseCsvLine(lines[0]).map((c) => c.trim().toLowerCase())
  const findCol = (...names: string[]) => headerCells.findIndex((c) => names.includes(c))
  const fromCol = findCol('frompath', '來源路徑', '來源')
  const toCol = findCol('topath', '目標路徑', '目標')
  const statusCol = findCol('statuscode', '狀態碼')
  const hasHeader = fromCol !== -1 && toCol !== -1
  const dataLines = hasHeader ? lines.slice(1) : lines

  return dataLines.map((line) => {
    const cells = parseCsvLine(line)
    if (hasHeader) {
      const statusRaw = statusCol !== -1 ? cells[statusCol] : undefined
      return {
        fromPath: cells[fromCol] ?? '',
        toPath: cells[toCol] ?? '',
        statusCode: statusRaw ? Number(statusRaw) : undefined,
      }
    }
    return {
      fromPath: cells[0] ?? '',
      toPath: cells[1] ?? '',
      statusCode: cells[2] ? Number(cells[2]) : undefined,
    }
  })
}

export function toRedirectCsv(rows: RedirectRecord[]): string {
  const header = ['來源路徑', '目標路徑', '狀態碼', '啟用', '來源', '已核實', '建立時間']
  const lines = [header.map(csvCell).join(',')]
  for (const r of rows) {
    lines.push([
      csvCell(r.fromPath),
      csvCell(r.toPath),
      csvCell(r.statusCode),
      csvCell(r.isActive ? '是' : '否'),
      csvCell(REDIRECT_SOURCE_LABEL[r.source]),
      csvCell(r.isVerified ? '是' : '否'),
      csvCell(r.createdAt),
    ].join(','))
  }
  return `﻿${lines.join('\r\n')}` // 帶 BOM，Excel 開中文 CSV 才不會亂碼
}

// ── 種子資料 ──────────────────────────────────────────────────────────
//
// ⚠️ 以下除了「已知對照」區塊逐條照抄 docs/01-sitemap.md §4 之外，其餘（尤其是
// 「主站文章」那 689 筆）都是**示意用的合成資料**，不是真的舊網址清單。
// 原因：docs/07-deployment.md §2 明講「約 700 篇文章內頁的網址型態尚未記錄」，
// 這件事被列在待補資料清單裡（見 CLAUDE.md「待客戶或主機商提供」）。
// 用 `/share.php?id={n}` 當佔位格式只是為了讓分頁、搜尋、CSV 匯入匯出、
// 衝突檢查有 770 筆量級可以測試，**正式資料要等遷移工具跑出真正的舊網址
// 清單才能取代這裡**，不要把種子資料誤當成已核對的清單。

// 小型可重現亂數產生器（不用 Math.random，讓每次「清掉 localStorage 重新種子」
// 的結果一致，方便對照與除錯）。
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 已寫進 staticwebapp.config.json 的規則，走最快路徑不經過 Function（docs/07 §2）。 */
const PROMOTED_TO_CONFIG = [
  '/index2.php',
  '/doctor.php',
  '/contact.php',
  '/product01.php',
  '/product02.php',
  '/product03.php',
  '/product04.php',
]

interface SeedInput { fromPath: string; toPath: string; statusCode?: RedirectStatusCode; source: RedirectSource; isVerified: boolean; createdAt: string; isActive?: boolean }

function buildSeed(): RedirectRecord[] {
  const rand = mulberry32(20250911)
  const now = Date.now()
  const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString()

  const seeds: SeedInput[] = []

  // 1. 已知對照（docs/01-sitemap.md §4，逐條照抄）——人工新增、已核實。
  const known: [string, string][] = [
    ['/index2.php', '/'],
    ['/doctor.php', '/team/'],
    ['/news-art.php', '/about/new-chinese-aesthetics/'],
    ['/make-up-style.php', '/about/makeup-style/'],
    ['/contact.php', '/clinics/'],
    ['/product01.php', '/treatments/laser/'],
    ['/product02.php', '/treatments/microneedle/'],
    ['/product03.php', '/treatments/photoelectric/'],
    ['/product04.php', '/treatments/skincare/'],
    ['/product01-d01.php', '/treatments/laser/picosure-pro/'],
    ['/product01-d02.php', '/treatments/laser/er-yag/'],
    ['/product02-d21.php', '/treatments/photoelectric/dermav/'],
    ['/product02-d22.php', '/treatments/photoelectric/btl-embody/'],
    ['/share.php?class=醫美新知', '/blog/medical-aesthetics/'],
    ['/share.php?class=皮膚新知', '/blog/dermatology/'],
    ['/share.php?class=媒體報導', '/blog/media/'],
    ['/share.php?class=演講授課', '/blog/lectures/'],
  ]
  for (const [from, to] of known) {
    seeds.push({ fromPath: from, toPath: to, source: 2, isVerified: true, createdAt: daysAgo(60 + Math.floor(rand() * 30)) })
  }

  // 2. 其餘療程細節頁（27 項扣掉上面已知的 4 項，合成 slug）—— 遷移工具產生、待核實。
  const categories = ['laser', 'microneedle', 'photoelectric', 'skincare']
  for (let n = 1; n <= 23; n++) {
    const cat = categories[n % categories.length]
    seeds.push({
      fromPath: `/product0${(n % 4) + 1}-d${String(30 + n).padStart(2, '0')}.php`,
      toPath: `/treatments/${cat}/treatment-${n}/`,
      source: 1,
      isVerified: n % 6 === 0,
      createdAt: daysAgo(20 + Math.floor(rand() * 40)),
    })
  }

  // 3. share.php 年份組合（4 分類 × 10 年 ≈ 40 條）—— 年份併入 query，目標仍是分類頁本身
  //    （docs/01 §4：「年份改為篩選參數＋canonical」）。
  const blogClasses: [string, string][] = [
    ['醫美新知', 'medical-aesthetics'],
    ['皮膚新知', 'dermatology'],
    ['媒體報導', 'media'],
    ['演講授課', 'lectures'],
  ]
  for (const [cls, slug] of blogClasses) {
    for (let y = 2015; y <= 2024; y++) {
      seeds.push({
        fromPath: `/share.php?class=${cls}&year=${y}`,
        toPath: `/blog/${slug}/`,
        source: 1,
        isVerified: y >= 2022,
        createdAt: daysAgo(10 + Math.floor(rand() * 50)),
      })
    }
  }

  // 4. 主站文章（合成資料，見上方大段警語）——約 689 條，湊到全部合計約 770。
  for (let n = 1; n <= 689; n++) {
    const [, slug] = blogClasses[n % blogClasses.length]
    let statusCode: RedirectStatusCode = 301
    if (n % 211 === 0) statusCode = 302
    if (n % 137 === 0) statusCode = 410
    seeds.push({
      fromPath: `/share.php?id=${n}`,
      toPath: statusCode === 410 ? '/blog/' : `/blog/${slug}/article-${n}/`,
      statusCode,
      source: 1,
      isVerified: n % 5 === 0, // 人工抽查 ≥ 20%（docs/06 §6）,
      createdAt: daysAgo(Math.floor(rand() * 90)),
    })
  }

  return seeds.map((s, idx) => ({
    id: idx + 1,
    fromPath: normalizeFromPath(s.fromPath),
    toPath: s.toPath,
    statusCode: s.statusCode ?? 301,
    isActive: s.isActive ?? true,
    source: s.source,
    isVerified: s.isVerified,
    createdAt: s.createdAt,
  }))
}

interface RedirectDb {
  nextId: number
  rows: RedirectRecord[]
}

function seedDb(): RedirectDb {
  const rows = buildSeed()
  return { nextId: rows.length + 1, rows }
}

const store = createStore<RedirectDb>('redirects', seedDb, 1)

// ── 對外 API ──────────────────────────────────────────────────────────

function assertFound(record: RedirectRecord | undefined, id: number): asserts record is RedirectRecord {
  if (!record) throw new ApiError('NOT_FOUND', `找不到轉址規則 #${id}。`)
}

export const redirectApi = {
  async list(query: RedirectListQuery = {}): Promise<RedirectPagedResult> {
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 20))
    let items = [...store.read().rows]

    if (query.keyword) {
      const kw = query.keyword.trim().toLowerCase()
      items = items.filter((r) => r.fromPath.toLowerCase().includes(kw) || r.toPath.toLowerCase().includes(kw))
    }
    if (query.isActive !== undefined) items = items.filter((r) => r.isActive === query.isActive)
    if (query.source !== undefined) items = items.filter((r) => r.source === query.source)

    const sortBy = query.sortBy ?? 'createdAt'
    const dir = query.sortDir === 'asc' ? 1 : -1
    items.sort((a, b) =>
      sortBy === 'fromPath'
        ? dir * a.fromPath.localeCompare(b.fromPath)
        : dir * a.createdAt.localeCompare(b.createdAt),
    )

    const totalCount = items.length
    const start = (page - 1) * pageSize
    return {
      items: items.slice(start, start + pageSize),
      totalCount,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    }
  },

  async stats(): Promise<RedirectStats> {
    const rows = store.read().rows
    const bySource: Record<RedirectSource, number> = { 1: 0, 2: 0, 3: 0 }
    let activeCount = 0
    let verifiedCount = 0
    for (const r of rows) {
      bySource[r.source]++
      if (r.isActive) activeCount++
      if (r.isVerified) verifiedCount++
    }
    return { totalCount: rows.length, activeCount, verifiedCount, bySource }
  },

  /** 依命中次數排序取前 N 條——UI 用來說明「這些會被寫進 staticwebapp.config.json」。 */
  /**
   * 已被提升進 `staticwebapp.config.json` 的規則（docs/07-deployment.md §2）。
   *
   * ⚠️ 這是**人工挑定的清單，不是從命中次數算出來的** —— `Redirects` 表沒有命中
   * 次數欄位，而且放不了：`/api/fallback` 對這張表只做單筆 seek、不做寫入，
   * 它那組唯讀 SQL 使用者**只能 SELECT 這一張表**（docs/08-database.md §H）。
   * 要統計命中次數得走 Application Insights 離線彙總，見 STATUS.md §八。
   *
   * 清單與 `apps/web/public/staticwebapp.config.json` 的 routes 一致；那裡改了
   * 這裡要跟著改（設定檔有 20 KB 上限，只放得下約 200 條）。
   */
  async promotedToConfig(): Promise<RedirectRecord[]> {
    const rows = store.read().rows
    return PROMOTED_TO_CONFIG.map((from) => rows.find((r) => r.fromPath === from)).filter(
      (r): r is RedirectRecord => Boolean(r),
    )
  },

  async get(id: number): Promise<RedirectRecord> {
    const record = store.read().rows.find((r) => r.id === id)
    assertFound(record, id)
    return record
  },

  async create(input: RedirectInput): Promise<RedirectRecord> {
    return store.mutate((d) => {
      const preview = evaluateRows([{ fromPath: input.fromPath, toPath: input.toPath, statusCode: input.statusCode }], d.rows)
      const blocking = preview[0].issues.find((i) => i.level === 'error')
      if (blocking) throw new ApiError(blocking.code === 'DUPLICATE_EXISTING' ? 'CONFLICT_DUPLICATE' : 'VALIDATION', blocking.message)

      const record: RedirectRecord = {
        id: d.nextId++,
        fromPath: preview[0].normalizedFrom,
        toPath: preview[0].normalizedTo,
        statusCode: input.statusCode ?? 301,
        isActive: input.isActive ?? true,
        source: input.source ?? 2,
        isVerified: input.isVerified ?? false,
        createdAt: new Date().toISOString(),
      }
      d.rows.push(record)
      return record
    })
  },

  async update(id: number, patch: Partial<RedirectInput> & { isActive?: boolean }): Promise<RedirectRecord> {
    return store.mutate((d) => {
      const record = d.rows.find((r) => r.id === id)
      assertFound(record, id)

      const nextFrom = patch.fromPath !== undefined ? patch.fromPath : record.fromPath
      const nextTo = patch.toPath !== undefined ? patch.toPath : record.toPath
      if (patch.fromPath !== undefined || patch.toPath !== undefined || patch.statusCode !== undefined) {
        const preview = evaluateRows([{ fromPath: nextFrom, toPath: nextTo, statusCode: patch.statusCode ?? record.statusCode }], d.rows, { excludeId: id })
        const blocking = preview[0].issues.find((i) => i.level === 'error')
        if (blocking) throw new ApiError(blocking.code === 'DUPLICATE_EXISTING' ? 'CONFLICT_DUPLICATE' : 'VALIDATION', blocking.message)
        record.fromPath = preview[0].normalizedFrom
        record.toPath = preview[0].normalizedTo
      }
      if (patch.statusCode !== undefined) record.statusCode = patch.statusCode
      if (patch.isActive !== undefined) record.isActive = patch.isActive
      if (patch.source !== undefined) record.source = patch.source
      if (patch.isVerified !== undefined) record.isVerified = patch.isVerified
      return record
    })
  },

  async remove(id: number): Promise<void> {
    store.mutate((d) => {
      const idx = d.rows.findIndex((r) => r.id === id)
      if (idx === -1) throw new ApiError('NOT_FOUND', `找不到轉址規則 #${id}。`)
      d.rows.splice(idx, 1)
    })
  },

  import: {
    parseCsv: parseRedirectCsv,

    /** 純檢查，不寫入。knownGoodPaths 由呼叫端（Redirects.vue）湊出已知存在的站內路徑。 */
    async preview(rows: RedirectImportRow[], knownGoodPaths?: Iterable<string>): Promise<RedirectImportPreview> {
      const evaluated = evaluateRows(rows, store.read().rows, { knownGoodPaths: knownGoodPaths ? new Set(knownGoodPaths) : undefined })
      return summarizePreview(evaluated)
    },

    async commit(rows: RedirectImportRow[], options: RedirectImportOptions = {}): Promise<RedirectImportResult> {
      return store.mutate((d) => {
        const evaluated = evaluateRows(rows, d.rows)
        const preview = summarizePreview(evaluated) // 匯入前的檢查結果，回傳給呼叫端顯示——匯入後 d.rows 已變動，不能事後重算
        let created = 0
        let updated = 0
        let skipped = 0

        for (const r of evaluated) {
          const errors = r.issues.filter((i) => i.level === 'error')
          if (errors.length === 0) {
            d.rows.push({
              id: d.nextId++,
              fromPath: r.normalizedFrom,
              toPath: r.normalizedTo,
              statusCode: (r.input.statusCode as RedirectStatusCode | undefined) ?? 301,
              isActive: true,
              source: options.defaultSource ?? 1,
              isVerified: false,
              createdAt: new Date().toISOString(),
            })
            created++
            continue
          }
          const onlyDuplicate = errors.length === 1 && errors[0].code === 'DUPLICATE_EXISTING' && r.conflictsWithId !== undefined
          if (onlyDuplicate && options.overwriteExisting) {
            const target = d.rows.find((x) => x.id === r.conflictsWithId)
            if (target) {
              target.toPath = r.normalizedTo
              if (r.input.statusCode !== undefined) target.statusCode = r.input.statusCode as RedirectStatusCode
              updated++
              continue
            }
          }
          skipped++
        }

        return { created, updated, skipped, preview }
      })
    },
  },

  csv: {
    toCsv: toRedirectCsv,
    /** 匯出目前全部規則（不受畫面上的分頁／搜尋篩選影響——備份與交接用途）。 */
    async exportAll(): Promise<string> {
      return toRedirectCsv([...store.read().rows].sort((a, b) => a.id - b.id))
    },
  },

  normalizeFromPath,
  normalizeToPath,
  /** 已知的站內頂層路徑，湊「目標路徑是否存在」核對清單用，見上方常數說明。 */
  knownStaticPaths: STATIC_TOP_LEVEL_PATHS,
}
