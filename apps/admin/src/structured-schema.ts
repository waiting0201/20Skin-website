// 「結構化欄位」的描述語言：用一份可遍歷的宣告，換掉 21 個要人手打 JSON 的 textarea。
//
// 🔴 **這是第二份形狀定義，真實來源在前台**（`apps/web/app/data/*.ts` 的型別）。
//    每一份 schema 的檔頭都必須註明它對應哪一個檔案的哪一行 —— 那是兩邊防漂移的唯一手段。
//    共用同一份宣告這條路評估過並否決：後台只有 vue ＋ vue-router 兩個相依，
//    把 web 的資料層 import 進來會拖進整套 Nuxt 的 auto-import。
//
// ⚠️ **抄錯的症狀是靜默的。** 前台的 `parseBlocks()` 對不合預期的值一律回 fallback ——
//    那一整區從頁面上消失，HTTP 仍然是 200，仍然收在 sitemap 裡。所以每加一份 schema，
//    都要在前台實際看過那一區。`tools/content-roundtrip` 是機器能幫上忙的那一半。
//
// ⚠️ 這個檔案**只放型別與純函式**，不含任何 Vue —— 它要能被 Node 直接跑
//    （round-trip 檢查腳本要用它）。

import type { SelectOption } from './unit-schema'

// ── 節點 ──────────────────────────────────────────────────────────────

export type StructuredNode =
  | { kind: 'string'; multiline?: boolean; maxLength?: number; placeholder?: string }
  | { kind: 'number'; integer?: boolean }
  | { kind: 'boolean' }
  /**
   * 封閉選項。
   * ⚠️ `numeric` 決定送出去是數字還是字串 —— `<select>` 的值一律是字串，
   * 而 `heading.level` 在前台是 `2 | 3`（數字）。少了這個旗標，前台比對
   * `block.level === 2` 永遠不成立，那個標題就會掉到 H3 的分支去。
   */
  | { kind: 'enum'; options: SelectOption[]; numeric?: boolean }
  | { kind: 'image'; shape: ImageShape; /** 換圖／移除會不會真的刪掉舊檔（預設 true）。見 ImageField 的同名 prop。 */ deletesOldFile?: boolean }
  | { kind: 'object'; fields: StructuredField[] }
  | { kind: 'array'; item: StructuredNode; itemLabel: string; summaryKeys?: string[]; collapsible?: boolean }
  | { kind: 'union'; discriminator: string; variants: StructuredVariant[] }

export interface StructuredField {
  key: string
  label: string
  node: StructuredNode
  hint?: string
  /** 空值就擋下送出。⚠️ 只標 API 或前台真的需要的，不要把「建議填」也標成必填。 */
  required?: boolean
  /** 高風險字詞掃描（docs/02 §5）。只對 string 節點有意義。 */
  riskScan?: boolean
}

export interface StructuredVariant {
  /** discriminator 的值，例如 'paragraph'。 */
  value: string
  label: string
  node: Extract<StructuredNode, { kind: 'object' }>
}

/**
 * 圖片在這些 JSON 欄位裡的三種投影 —— **三種都是正式資料裡實際存在的形狀**。
 *
 * 🔴 選錯不會報錯，前台就是不顯示那張圖。
 *
 * | shape | 實際形狀 | 出現在 |
 * |---|---|---|
 * | `content-image` | `{blobPath,url,alt,width,height,variants}` | 療程的原理、困擾的症狀、長文頁的主圖 |
 * | `src-size` | `{src,alt,width,height}`（**沒有 blobPath**） | 文章內文的 figure |
 * | `src-wh` | `{src,alt,w,h}` | 品牌理念頁的理念柱／團隊／院區 |
 */
export type ImageShape = 'content-image' | 'src-size' | 'src-wh'

// ── 一個欄位的完整宣告 ────────────────────────────────────────────────

export interface StructuredSchema {
  root: StructuredNode
  /**
   * 🔴 **這一欄在 API 走哪一條寫入路徑。不要改成在序列化那裡 if 單元名。**
   *
   * - `json-string`：`ContentHandler.JStr()` 只收 JSON 字串。送物件／陣列進去，
   *   欄位會被寫成 **NULL**（靜默清空，不報錯）。19 個欄位走這條。
   * - `json-value`：`ApplyArticleFields`／`ApplyPageFields` 的 `bodyBlocks`。
   *   兩種形狀都收（見 `ReadBodyBlocks`），但送物件才是原本的契約。
   */
  wire: 'json-string' | 'json-value'
  /** 判定為空時送 `null` 而不是 `{}`／`[]`，對齊資料庫的 nullable。 */
  emptyIsNull?: boolean
  /** 編輯畫面上的一句話：這一欄在前台長什麼樣子。 */
  preview?: string
}

// ── 空值 ──────────────────────────────────────────────────────────────

export function emptyValueFor(node: StructuredNode): unknown {
  switch (node.kind) {
    case 'object': {
      const out: Record<string, unknown> = {}
      for (const f of node.fields) out[f.key] = emptyValueFor(f.node)
      return out
    }
    case 'array': return []
    case 'boolean': return false
    case 'image': return null
    // ⚠️ union 刻意回 null：新增一列時還不知道要哪一種區塊，
    //    要等使用者從下拉選了型別，才 emptyValueFor(variant.node)。
    case 'union': return null
    default: return ''
  }
}

/** 這個值算不算「空」（決定 emptyIsNull 要不要送 null）。 */
export function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0 || value.every(isEmptyValue)
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).every(isEmptyValue)
  return false
}

// ── 讀進來 ────────────────────────────────────────────────────────────

/**
 * 🔴 **表單值的型別本身就是模式旗標**，這是整套設計的樞紐：
 *
 * - `object`／`array`（含 `null`）⇒ **結構化模式**，渲染表單
 * - `string` ⇒ **原始 JSON 模式**，渲染等寬文字框
 *
 * 一條約定同時解決三件事：既有資料 parse 失敗、使用者主動要編 JSON、
 * 這個頁面沒有對應的 schema。不需要 wrapper 物件，也不需要平行的旁路欄位。
 *
 * ⚠️ 連帶的好處：`uploadPendingImages()` 是深走訪陣列與純物件的，所以藏在
 * `fields.bodyBlocks[7].image` 裡的待上傳圖片會自動被處理，一行都不用改；
 * 而字串不是容器，原始模式的值會原樣通過。
 */
export function parseStructured(schema: StructuredSchema | undefined, raw: unknown): unknown {
  if (schema === undefined) return typeof raw === 'string' ? raw : raw == null ? '' : JSON.stringify(raw, null, 2)
  if (raw === null || raw === undefined || raw === '') return emptyValueFor(schema.root)
  if (typeof raw !== 'string') return raw // API 形狀若改了的防禦

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return raw // 語法壞掉 → 原始模式，讓人看得到原文去修
  }
  // parse 一次還是字串 ＝ 雙重編碼的指紋。不要再 parse 第二次把它「修好」——
  // 那會讓一筆壞資料看起來正常，然後被存回去，問題就永遠查不出來了。
  if (typeof parsed === 'string') return raw
  if (!topKindMatches(schema.root, parsed)) return raw
  return parsed
}

export function topKindMatches(root: StructuredNode, value: unknown): boolean {
  if (root.kind === 'array') return Array.isArray(value)
  if (root.kind === 'object' || root.kind === 'union') return typeof value === 'object' && value !== null && !Array.isArray(value)
  return true
}

/** 目前是不是「原始 JSON 模式」。 */
export function isRawMode(value: unknown): value is string {
  return typeof value === 'string'
}

// ── 送出去 ────────────────────────────────────────────────────────────

/**
 * 表單值 → 送給 API 的形狀。
 *
 * ⚠️ 原始模式（字串）一律原樣／parse 後送出 —— 語法與最外層型別在
 * `validation.ts` 已經擋過，這裡不重複判斷。
 */
export function toWire(
  schema: StructuredSchema | undefined,
  value: unknown,
  /**
   * 沒有 schema 時（例如 page 的未知 slug）這一欄走哪一條寫入路徑。
   *
   * 🔴 **不可以省略。** 少了它，一筆原本在結構化模式下編輯的值遇到「schema 查不到」
   *    就會被當成空字串送出 —— 也就是**整欄被清空**。schema 查不到是會發生的：
   *    改了 page 的 slug，下一次送出就找不到原本那一份。
   */
  fallbackWire: StructuredSchema['wire'] = 'json-string',
): unknown {
  const wire = schema?.wire ?? fallbackWire

  if (schema === undefined) {
    if (isRawMode(value)) {
      const text = value.trim()
      if (text === '') return null
      return wire === 'json-value' ? JSON.parse(text) : text
    }
    // 結構化模式的值卻沒有 schema：照 wire 正常送出，不要把它當成空的。
    if (value === null || value === undefined) return null
    return wire === 'json-value' ? value : JSON.stringify(value)
  }

  if (isRawMode(value)) {
    const text = value.trim()
    if (text === '') return null
    return wire === 'json-value' ? JSON.parse(text) : text
  }

  if (schema.emptyIsNull !== false && isEmptyValue(value)) return null
  return wire === 'json-value' ? value : JSON.stringify(value)
}

// ── 給畫面用的小工具 ──────────────────────────────────────────────────

/**
 * 摺疊起來的那一列要顯示什麼。
 *
 * ⚠️ 呼叫端傳進來的是**陣列節點**，而摘要看的是那一列（成員）的形狀 ——
 * union 的判斷要往 `node.item` 走一層。少了這一步，文章的區塊列會顯示
 * 原始的型別代碼（`lead`、`paragraph`）而不是「前言」「段落　實際文字…」。
 */
export function summaryOf(node: StructuredNode, value: unknown, index: number): string {
  if (value === null || value === undefined) return `第 ${index + 1} 項`
  if (typeof value !== 'object') return String(value).slice(0, 60) || `第 ${index + 1} 項`

  const row = value as Record<string, unknown>
  const itemNode = node.kind === 'array' ? node.item : node

  if (itemNode.kind === 'union') {
    const current = String(row[itemNode.discriminator] ?? '')
    const variant = itemNode.variants.find((v) => v.value === current)
    if (!variant) return `未知型別：${current || '—'}`
    // ⚠️ 要跳過 discriminator 本身 —— 它是物件的第一個鍵，不跳過的話
    //    摘要就會變成型別代碼而不是內容。
    const text = firstText(row, itemNode.discriminator)
    return text ? `${variant.label}　${text}` : variant.label
  }

  if (node.kind === 'array' && node.summaryKeys?.length) {
    const parts = node.summaryKeys.map((k) => row[k]).filter((v) => typeof v === 'string' && v).map(String)
    if (parts.length) return parts.join('・').slice(0, 80)
  }
  return firstText(row) || `第 ${index + 1} 項`
}

/**
 * 摺疊列要顯示哪一段文字。
 *
 * ⚠️ **不能只取「第一個字串值」。** 物件的鍵順序是資料決定的，文章的標題區塊是
 * `{type, level, id, text}` —— 照順序取會拿到錨點 id（`why-ages-faster`），
 * 提示框會拿到樣式代碼（`info`）。所以先照這份偏好清單找真正的內容欄位。
 */
const SUMMARY_PREFERRED_KEYS = ['text', 'title', 'heading', 'label', 'name', 'caption', 'q', 'when', 'lede']

function firstText(row: Record<string, unknown>, skipKey?: string): string {
  const pick = (key: string) => {
    const v = row[key]
    return typeof v === 'string' && v.trim() ? v.trim().slice(0, 60) : ''
  }
  for (const key of SUMMARY_PREFERRED_KEYS) {
    if (key === skipKey) continue
    const hit = pick(key)
    if (hit) return hit
  }
  for (const [key, v] of Object.entries(row)) {
    if (key === skipKey || SUMMARY_PREFERRED_KEYS.includes(key)) continue
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 60)
  }
  // 清單與表格這種「內容全在子陣列裡」的區塊：沒有可顯示的字串，就報幾項。
  for (const v of Object.values(row)) {
    if (Array.isArray(v) && v.length) return `${v.length} 項`
  }
  return ''
}

/**
 * 這一筆物件裡有哪些鍵是 schema 沒有描述的。
 *
 * 🔴 **那些鍵一定要原樣保留。** 560/1083 篇文章的段落帶著 `runs`（舊站的行內
 * 格式），長版故事頁帶著 `body` —— 前台都不讀，但用 schema 重建一次物件就會
 * 永久消失，而且不會有任何錯誤訊息。畫面上要用這份清單告訴使用者「另有 N 個
 * 欄位不由表單管理，儲存時會原樣保留」，否則他會在 JSON 模式裡順手清乾淨。
 */
export function undeclaredKeys(node: StructuredNode, value: unknown): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return []
  const row = value as Record<string, unknown>
  if (node.kind === 'object') {
    const declared = new Set(node.fields.map((f) => f.key))
    return Object.keys(row).filter((k) => !declared.has(k))
  }
  if (node.kind === 'union') {
    const variant = node.variants.find((v) => String(row[node.discriminator]) === v.value)
    if (!variant) return []
    const declared = new Set([node.discriminator, ...variant.node.fields.map((f) => f.key)])
    return Object.keys(row).filter((k) => !declared.has(k))
  }
  return []
}

/** 整棵樹裡所有 schema 沒描述的鍵（去重），用來在欄位底部顯示一行提示。 */
export function collectUndeclared(node: StructuredNode, value: unknown, out = new Set<string>()): Set<string> {
  if (value === null || value === undefined) return out
  if (node.kind === 'array' && Array.isArray(value)) {
    for (const item of value) collectUndeclared(node.item, item, out)
    return out
  }
  if (node.kind === 'object' && typeof value === 'object' && !Array.isArray(value)) {
    for (const k of undeclaredKeys(node, value)) out.add(k)
    const row = value as Record<string, unknown>
    for (const f of node.fields) collectUndeclared(f.node, row[f.key], out)
    return out
  }
  if (node.kind === 'union' && typeof value === 'object' && !Array.isArray(value)) {
    for (const k of undeclaredKeys(node, value)) out.add(k)
    const row = value as Record<string, unknown>
    const variant = node.variants.find((v) => String(row[node.discriminator]) === v.value)
    if (variant) for (const f of variant.node.fields) collectUndeclared(f.node, row[f.key], out)
    return out
  }
  return out
}

// ── 圖片投影 ──────────────────────────────────────────────────────────
//
// `ImageField` 的契約是 `ImageValue`（一定帶 blobPath）。JSON 裡的三種形狀
// 都要能來回換算，而且**換算回去時刻意多留一個 blobPath 鍵**：
// 前台讀的是 `src`／`url`，多一個鍵不影響渲染；但 API 的 `CollectBlobPathsFromJson`
// 找的正是 `blobPath`，補上之後「換掉一張內文圖，舊檔會被刪」才成立。
// 舊資料沒有這個鍵 → 第一次存檔時「換圖前的清單」是空的 → 不會誤刪，只會少刪。

export interface ImageLike {
  blobPath: string
  url: string
  alt: string | null
  width: number | null
  height: number | null
  variants: string | null
}

export function imageFromJson(shape: ImageShape, value: unknown): ImageLike | null {
  if (value === null || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  // 待上傳的圖片（PendingImage）原樣通過，不要投影 —— 它還沒有 url。
  if (v.pending === true) return value as unknown as ImageLike
  const num = (x: unknown) => (typeof x === 'number' ? x : null)
  const str = (x: unknown) => (typeof x === 'string' ? x : null)
  switch (shape) {
    case 'content-image':
      return { blobPath: str(v.blobPath) ?? '', url: str(v.url) ?? '', alt: str(v.alt), width: num(v.width), height: num(v.height), variants: str(v.variants) }
    case 'src-size':
      return { blobPath: str(v.blobPath) ?? '', url: str(v.src) ?? '', alt: str(v.alt), width: num(v.width), height: num(v.height), variants: null }
    case 'src-wh':
      return { blobPath: str(v.blobPath) ?? '', url: str(v.src) ?? '', alt: str(v.alt), width: num(v.w), height: num(v.h), variants: null }
  }
}

export function imageToJson(shape: ImageShape, value: unknown, original: unknown): unknown {
  if (value === null || value === undefined) return null
  const v = value as Record<string, unknown>
  if (v.pending === true) return value // 還沒上傳，等 uploadPendingImages 換掉它
  // 未宣告的鍵（例如某些 figure 帶的額外欄位）原樣保留
  const keep = typeof original === 'object' && original !== null ? { ...(original as Record<string, unknown>) } : {}
  switch (shape) {
    case 'content-image':
      return { ...keep, blobPath: v.blobPath, url: v.url, alt: v.alt ?? null, width: v.width ?? null, height: v.height ?? null, variants: v.variants ?? null }
    case 'src-size':
      return { ...keep, src: v.url, alt: v.alt ?? null, width: v.width ?? null, height: v.height ?? null, blobPath: v.blobPath }
    case 'src-wh':
      return { ...keep, src: v.url, alt: v.alt ?? null, w: v.width ?? null, h: v.height ?? null, blobPath: v.blobPath }
  }
}
