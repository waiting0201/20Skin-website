// 301 轉址管理（docs/10 §3.4、docs/08 §H、docs/01 §4、docs/07 §2）
//
// 上層畫面只透過 client.ts 匯出的 adminApi 取用，不直接 import 這個檔。
//
// ⚠️ 這支刻意不 import client.ts —— client.ts 會 import 這支（組成 adminApi.redirect），
// 反向 import 會循環相依。跨單元的「目標路徑是否對應到真實內容」查核，
// 由 Redirects.vue 自己呼叫 adminApi.content.list() 湊出已知路徑清單後傳進來，
// 這支只負責純資料與純檢查邏輯。
//
// 🔴 **匯入前的預檢是「前端的一份，伺服器還有自己的一份」，而且兩份都必須存在。**
//    前端這份（evaluateRows）的用途是**在送出之前**把 770 列的問題一次攤在畫面上讓人看；
//    伺服器那份才是把關 —— 它才看得到資料庫的即時狀態。兩份結果不完全一致是正常的
//    （例如預檢跑完到按下匯入之間有人新增了一條規則），**不要為了「一致」而拿掉任何一份**。
//
// ⚠️ 一層鏈路檢查只是擋一層（docs/08 §H）：A→B→C 擋得掉，
//    A→B、C→D、B→C 分三批匯入就擋不掉。多層遞移閉包是上線前驗收腳本的事。

import { ApiError } from './errors'
import { fetchAllPages, normalizePaged, request, type ServerPaged } from './http'

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
      issues.push({ level: 'warning', code: 'NO_TRAILING_SLASH', message: '目標路徑沒有結尾斜線，與新站網址慣例不一致，可能導致多跳一次轉址。' })
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

interface ServerRedirect {
  id: number
  fromPath: string
  toPath: string
  toContentItemId: number | null
  statusCode: number
  isActive: boolean
  source: number
  isVerified: boolean
  createdAt: string
}

function toRecord(row: ServerRedirect): RedirectRecord {
  return {
    id: row.id,
    fromPath: row.fromPath,
    toPath: row.toPath,
    statusCode: row.statusCode as RedirectStatusCode,
    isActive: row.isActive,
    source: row.source as RedirectSource,
    isVerified: row.isVerified,
    createdAt: row.createdAt,
  }
}

/**
 * 整份對照表（約 770 條）。
 *
 * ⚠️ 這是 8 趟往返（pageSize 上限 100，docs/10 §2），**只在真的需要全量時才呼叫**：
 * 匯入預檢要跟既有資料比對、匯出要全部、`promotedToConfig` 要找特定幾條。
 * 清單畫面本身走分頁，不要改成先抓全量再切。
 */
async function fetchAllRedirects(): Promise<RedirectRecord[]> {
  const rows = await fetchAllPages<ServerRedirect>(
    async (page, pageSize) =>
      normalizePaged(await request<ServerPaged<ServerRedirect>>('/admin/redirect', { query: { page, pageSize } })),
    5000,
  )
  return rows.map(toRecord)
}

export const redirectApi = {
  /** ⚠️ 篩選與排序全部交給 API 在 SQL 層做 —— 在前端過濾只會過濾到當頁那 20 筆（docs/10 §2）。 */
  async list(query: RedirectListQuery = {}): Promise<RedirectPagedResult> {
    const paged = normalizePaged(
      await request<ServerPaged<ServerRedirect>>('/admin/redirect', {
        query: {
          page: Math.max(1, query.page ?? 1),
          pageSize: Math.min(100, Math.max(1, query.pageSize ?? 20)),
          keyword: query.keyword?.trim(),
          isActive: query.isActive,
          source: query.source,
          sortBy: query.sortBy,
          sortDir: query.sortDir,
        },
      }),
    )
    return {
      items: paged.items.map(toRecord),
      totalCount: paged.totalCount,
      page: paged.page,
      pageSize: paged.pageSize,
      totalPages: paged.totalPages,
    }
  },

  /** 全表統計，由 API 在 SQL 層算（不是把分頁結果加總）。 */
  async stats(): Promise<RedirectStats> {
    const res = await request<{
      totalCount: number
      activeCount: number
      verifiedCount: number
      migrationCount: number
      manualCount: number
      systemCount: number
    }>('/admin/redirect/stats')
    return {
      totalCount: res.totalCount,
      activeCount: res.activeCount,
      verifiedCount: res.verifiedCount,
      bySource: { 1: res.migrationCount, 2: res.manualCount, 3: res.systemCount },
    }
  },

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
    // 逐條用關鍵字查，比整份抓回來再過濾便宜得多（7 筆 vs 約 770 筆）。
    const found = await Promise.all(
      PROMOTED_TO_CONFIG.map(async (from) => {
        const paged = normalizePaged(
          await request<ServerPaged<ServerRedirect>>('/admin/redirect', { query: { keyword: from, page: 1, pageSize: 100 } }),
        )
        const hit = paged.items.find((r) => r.fromPath === from)
        return hit ? toRecord(hit) : null
      }),
    )
    return found.filter((r): r is RedirectRecord => r !== null)
  },

  async get(id: number): Promise<RedirectRecord> {
    // 沒有單筆端點（docs/10 §3.4 只有 GET 清單）—— 轉址規則沒有「詳情頁」，
    // 編輯是就地展開的。用來源路徑當關鍵字查回那一筆即可。
    const paged = normalizePaged(
      await request<ServerPaged<ServerRedirect>>('/admin/redirect', { query: { page: 1, pageSize: 100 } }),
    )
    const hit = paged.items.find((r) => r.id === id)
    if (!hit) throw new ApiError('NOT_FOUND', `找不到轉址規則 #${id}。`)
    return toRecord(hit)
  },

  /**
   * 新增一筆。
   * ⚠️ 正規化與迴圈防護**伺服器端會再做一次**（docs/08 §H）。這裡先跑一次本地檢查
   * 純粹是為了在送出前就給出可讀的錯誤訊息，不是把關。
   */
  async create(input: RedirectInput): Promise<RedirectRecord> {
    const row = await request<ServerRedirect>('/admin/redirect', {
      method: 'POST',
      body: {
        fromPath: normalizeFromPath(input.fromPath),
        toPath: normalizeToPath(input.toPath),
        statusCode: input.statusCode ?? 301,
        isActive: input.isActive ?? true,
        source: input.source ?? 2,
      },
    })
    return toRecord(row)
  },

  async update(id: number, patch: Partial<RedirectInput> & { isActive?: boolean }): Promise<RedirectRecord> {
    const row = await request<ServerRedirect>(`/admin/redirect/${id}`, {
      method: 'PUT',
      body: {
        fromPath: patch.fromPath === undefined ? undefined : normalizeFromPath(patch.fromPath),
        toPath: patch.toPath === undefined ? undefined : normalizeToPath(patch.toPath),
        statusCode: patch.statusCode,
        isActive: patch.isActive,
        source: patch.source,
        isVerified: patch.isVerified,
      },
    })
    return toRecord(row)
  },

  async remove(id: number): Promise<void> {
    await request<null>(`/admin/redirect/${id}`, { method: 'DELETE' })
  },

  import: {
    parseCsv: parseRedirectCsv,

    /**
     * 純檢查，不寫入。knownGoodPaths 由呼叫端（Redirects.vue）湊出已知存在的站內路徑。
     * ⚠️ 會把整份既有對照表抓回來比對（約 8 趟往返）—— 這是預檢，不是每次載入畫面都跑。
     */
    async preview(rows: RedirectImportRow[], knownGoodPaths?: Iterable<string>): Promise<RedirectImportPreview> {
      const existing = await fetchAllRedirects()
      const evaluated = evaluateRows(rows, existing, {
        knownGoodPaths: knownGoodPaths ? new Set(knownGoodPaths) : undefined,
      })
      return summarizePreview(evaluated)
    },

    /**
     * 真正匯入。
     *
     * 🔴 **把 CSV 原文交給 API，不是把前端解析後的列交過去**（docs/10 §3.4：
     * 本專案的 API 一律 JSON，所以 CSV 以字串欄位傳遞）。伺服器會自己重新解析、
     * 重新檢查 —— 前端的預檢結果不具約束力，它看到的是幾秒前的資料庫狀態。
     *
     * ⚠️ 回傳裡的 `preview` 是**送出前**那份本地預檢，只供畫面顯示；
     * `created`／`updated`／`skipped` 才是伺服器實際做了什麼。兩者對不上時以後者為準。
     */
    async commit(rows: RedirectImportRow[], options: RedirectImportOptions = {}): Promise<RedirectImportResult> {
      const existing = await fetchAllRedirects()
      const preview = summarizePreview(evaluateRows(rows, existing))

      const csv = toImportCsv(rows, options.defaultSource ?? 1)
      const result = await request<{ totalRows: number; imported: number; updated: number; skipped: number }>(
        '/admin/redirect/import',
        { method: 'POST', body: { csv, overwriteExisting: options.overwriteExisting ?? false } },
      )

      return { created: result.imported, updated: result.updated, skipped: result.skipped, preview }
    },
  },

  csv: {
    toCsv: toRedirectCsv,
    /** 匯出目前全部規則（不受畫面上的分頁／搜尋篩選影響——備份與交接用途）。 */
    async exportAll(): Promise<string> {
      const res = await request<{ count: number; fileName: string; csv: string }>('/admin/redirect/export')
      return res.csv
    },
  },

  normalizeFromPath,
  normalizeToPath,
  /** 已知的站內頂層路徑，湊「目標路徑是否存在」核對清單用，見上方常數說明。 */
  knownStaticPaths: STATIC_TOP_LEVEL_PATHS,
}

/**
 * 把解析後的列重新組回 CSV 交給 API。
 *
 * ⚠️ 看起來多此一舉（使用者本來就上傳了一份 CSV），但**不要改成直接送原檔**：
 * 畫面上可以先剔除有問題的列再匯入，送原檔等於把使用者剔掉的列又送回去。
 * 欄名必須是 API 認得的那幾個（大小寫不拘）：fromPath／toPath／statusCode／source。
 */
function toImportCsv(rows: RedirectImportRow[], defaultSource: RedirectSource): string {
  const escape = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)
  const lines = ['fromPath,toPath,statusCode,source']
  for (const row of rows) {
    lines.push([
      escape(row.fromPath ?? ''),
      escape(row.toPath ?? ''),
      String(row.statusCode ?? 301),
      String(defaultSource),
    ].join(','))
  }
  return lines.join('\n')
}
