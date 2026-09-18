// 表單驗證：**送出之前**在前端先擋一次。
//
// 🔴 **這不是安全邊界，也不是唯一的把關**。真正擋得住的驗證在 API
//    （`functions/Handlers/ContentHandler.cs`、`AccountHandler.cs`）。這裡存在的
//    理由只有一個：**把「送出去才知道錯」變成「按下去之前就知道錯」**，
//    而且錯誤要指得到是哪一個欄位。
//
// ⚠️ 每一條規則都對應 API 的一條，**兩邊要一起改**。下面每條都註明了對應的
//    伺服器位置；沒有對應的一律標成「建議」而不是「錯誤」，不擋送出 ——
//    前端自己發明比 API 嚴格的規則，會讓使用者存不進一筆 API 其實接受的內容，
//    而且畫面上完全看不出是誰擋的。
//
// ⚠️ 只有一個例外是**刻意比 API 嚴格**的：結構化資料覆寫的 JSON 語法檢查。
//    API 原樣存下、前台原樣輸出，壞掉的 JSON-LD 不會有任何錯誤訊息，
//    只會讓那一頁的結構化資料整段失效（docs/03 §4）。

import type { UnitDefinition, UnitField } from './unit-schema'
import { resolveSchema } from './api/content-fields'
import {
  isEmptyValue,
  isRawMode,
  topKindMatches,
  type StructuredNode,
  type StructuredSchema,
} from './structured-schema'
import type { SeoDraft } from './types'

/** 欄位鍵 → 錯誤訊息。空物件＝通過。 */
export type FieldErrors = Record<string, string>

// ── 共用規則（與 API 逐條對應）──────────────────────────────────────────

/** `ContentHandler.SlugPattern`：`^[a-z0-9]+(-[a-z0-9]+)*$`，長度上限 160。 */
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const SLUG_MAX = 160

/** `AccountHandler.UserNamePattern`：`^[a-z0-9._@-]+$`（不分大小寫）。 */
const USER_NAME_PATTERN = /^[a-z0-9._@-]+$/i

/** `AccountHandler.MinPasswordLength`。 */
export const MIN_PASSWORD_LENGTH = 6

const TITLE_MAX = 200 // ContentHandler：title 長度不可超過 200 字
const SUMMARY_MAX = 500 // ContentHandler：summary 長度不可超過 500 字
const SEO_TITLE_MAX = 200
const META_DESCRIPTION_MAX = 400
const AI_SUMMARY_MIN = 20 // ⚠️ API 是 20–300，畫面上的「建議 40–60 字」是另一回事
const AI_SUMMARY_MAX = 300

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value)
}

function isBlank(value: unknown): boolean {
  return text(value).trim().length === 0
}

// ── slug ──────────────────────────────────────────────────────────────

export function validateSlug(raw: string): string | null {
  const slug = raw.trim().toLowerCase()
  if (!slug) return null
  if (slug.length > SLUG_MAX) return `網址代稱不可超過 ${SLUG_MAX} 字（目前 ${slug.length} 字）。`
  if (!SLUG_PATTERN.test(slug)) {
    // ⚠️ 底線是最常踩的一個：blog 站搬過來的 71 篇原始 slug 用底線，
    //    API 只收連字號（CLAUDE.md 決策 2）。訊息裡直接點名它。
    return '網址代稱只能用小寫英文、數字與連字號（-），不可有底線、空白、中文，也不可以用連字號開頭或結尾。'
  }
  return null
}

// ── 帳號 ──────────────────────────────────────────────────────────────

export function validateUserName(raw: string): string | null {
  const userName = raw.trim()
  if (!userName) return '帳號名稱為必填。'
  if (!USER_NAME_PATTERN.test(userName)) return '帳號僅可使用英數字與 . _ - @ 這四個符號，不可有空白或中文。'
  return null
}

/**
 * ⚠️ API 只檢查長度 ≥ 8（`AccountHandler.MinPasswordLength`）。
 * 「要有英文字母與數字」是**畫面上原本就寫著的提示**，在這裡一併落實 ——
 * 留著一句沒有人執行的提示，比沒有提示更糟。
 */
export function validatePassword(raw: string): string | null {
  if (!raw) return '密碼為必填。'
  if (raw.length < MIN_PASSWORD_LENGTH) return `密碼長度至少 ${MIN_PASSWORD_LENGTH} 碼（目前 ${raw.length} 碼）。`
  if (!/[A-Za-z]/.test(raw) || !/[0-9]/.test(raw)) return '密碼需同時包含英文字母與數字。'
  return null
}

// ── 轉址路徑 ──────────────────────────────────────────────────────────

/**
 * `RedirectHandler` 會把路徑正規化（補開頭斜線、query 依字母排序）再存，
 * 所以這裡只擋兩件它擋不掉、但一定是錯的事：萬用字元、來源等於目標。
 */
export function validateRedirectPath(raw: string, label: string): string | null {
  const path = raw.trim()
  if (!path) return `${label}為必填。`
  if (path.includes('*')) return `${label}不可使用萬用字元——每一條舊網址要一對一對應（全部倒進分類頁會被判定為軟性 404）。`
  if (!path.startsWith('/') && !/^https?:\/\//i.test(path)) return `${label}要以 / 開頭（跨網域才寫完整網址）。`
  return null
}

// ── 內容本文 ──────────────────────────────────────────────────────────

/** 集合型欄位（圖庫／複列／標籤／看診時段）的「必填」＝至少一列。 */
function isCollectionField(field: UnitField): boolean {
  return field.type === 'gallery' || field.type === 'repeater' || field.type === 'tags' || field.type === 'hours'
}

function requiredMessage(field: UnitField): string {
  if (field.type === 'structured') return `「${field.label}」為必填，目前是空的。`
  if (field.type === 'image') return `「${field.label}」為必填，請選一張圖片。`
  if (isCollectionField(field)) return `「${field.label}」為必填，至少要有一列。`
  if (field.type === 'relation-single' || field.type === 'select') return `「${field.label}」為必填，請選擇一個項目。`
  return `「${field.label}」為必填。`
}

function validateField(field: UnitField, value: unknown): string | null {
  // 唯讀欄位不送出，也就沒有什麼好驗的。
  if (field.readOnly && !field.settableOnCreate) return null

  if (field.required) {
    if (field.type === 'structured') {
      // ⚠️ structured 的值可能是物件、陣列或（原始模式的）字串，用 isEmptyValue 一視同仁。
      if (isEmptyValue(value)) return requiredMessage(field)
    } else if (field.type === 'image') {
      if (!value) return requiredMessage(field)
    } else if (isCollectionField(field)) {
      if (!Array.isArray(value) || value.length === 0) return requiredMessage(field)
    } else if (field.type === 'boolean') {
      // ⚠️ boolean 的「必填」意思是「要有值」，而 checkbox 永遠有值（true／false）。
      //    ⚠️ 不要在這裡要求它必須是 true —— 案例的「當事人書面同意」勾不勾是事實陳述，
      //    前端逼人勾起來等於教人造假；API 也只要求欄位存在（docs/08 §C-5）。
      if (value === null || value === undefined) return requiredMessage(field)
    } else if (isBlank(value)) {
      return requiredMessage(field)
    }
  }

  // 數值欄位：填了就必須是數字。⚠️ `content-fields.ts` 會把非數字轉成 null 送出去，
  // 而 API 對非必填欄位收到 null 是「不改」——也就是**打錯字會靜默失效**。
  if (field.type === 'number' && !isBlank(value) && !Number.isFinite(Number(value))) {
    return `「${field.label}」必須是數字。`
  }

  // 圖庫：每一列都要有圖，逐列的必填子欄位也要有值（案例的「階段」是 NOT NULL，
  // 少了它整筆存檔會被 API 退回，docs/08 §C-5）。
  if (field.type === 'gallery' && Array.isArray(value)) {
    for (const [index, row] of (value as Record<string, unknown>[]).entries()) {
      if (!row.image) return `「${field.label}」第 ${index + 1} 列還沒有選圖片。`
      for (const sub of field.galleryItemFields ?? []) {
        if (sub.required && isBlank(row[sub.key])) {
          return `「${field.label}」第 ${index + 1} 列的「${sub.label}」為必填。`
        }
      }
    }
  }

  // 複列：必填子欄位。
  if (field.type === 'repeater' && Array.isArray(value)) {
    for (const [index, row] of (value as Record<string, unknown>[]).entries()) {
      for (const sub of field.repeaterFields ?? []) {
        if (sub.required && isBlank(row[sub.key])) {
          return `「${field.label}」第 ${index + 1} 列的「${sub.label}」為必填。`
        }
      }
    }
  }

  return null
}

// ── 結構化欄位 ────────────────────────────────────────────────────────

/**
 * 結構化欄位的驗證。錯誤鍵用**路徑**（`bodyBlocks[3].image`、`selfCheckGuide.types[1].title`），
 * `StructuredNode` 會依同一個路徑把紅字顯示在那一格旁邊。
 *
 * ⚠️ 兩種模式驗的東西不一樣：
 *  - **原始 JSON 模式**（值是字串）：只驗語法與最外層型別。深層形狀不驗 ——
 *    使用者刻意切到這個模式，多半就是因為表單表達不了他要的東西。
 *  - **表單模式**：遞迴驗 `required`。
 *
 * 🔴 最外層型別非驗不可：文章的內文要陣列、頁面要物件，弄反了就是整頁內文不渲染，
 *    而且 API 與前台都不會報錯。
 */
export function validateStructured(
  /** ⚠️ 只要 key／label —— 首頁版位的設定 JSON 也用這一支，那裡沒有 `UnitField`。 */
  field: Pick<UnitField, 'key' | 'label'>,
  schema: StructuredSchema | undefined,
  value: unknown,
): FieldErrors {
  const errors: FieldErrors = {}

  if (isRawMode(value)) {
    const raw = value.trim()
    if (raw === '') return errors
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (e) {
      errors[field.key] = `「${field.label}」不是有效的 JSON：${e instanceof Error ? e.message : String(e)}`
      return errors
    }
    const root = schema?.root
    if (root && !topKindMatches(root, parsed)) {
      const want = root.kind === 'array' ? '陣列' : '物件'
      errors[field.key] = `「${field.label}」的最外層必須是 ${want}。`
    }
    return errors
  }

  if (schema) walkNode(schema.root, value, field.key, field.label, errors)
  return errors
}

function walkNode(node: StructuredNode, value: unknown, path: string, label: string, errors: FieldErrors) {
  if (node.kind === 'object') {
    const row = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
    for (const f of node.fields) {
      const childPath = `${path}.${f.key}`
      if (f.required && isEmptyValue(row[f.key])) {
        errors[childPath] = `「${f.label}」為必填。`
        continue
      }
      walkNode(f.node, row[f.key], childPath, f.label, errors)
    }
    return
  }

  if (node.kind === 'array' && Array.isArray(value)) {
    value.forEach((item, index) => walkNode(node.item, item, `${path}[${index}]`, `${node.itemLabel} ${index + 1}`, errors))
    return
  }

  if (node.kind === 'union') {
    const row = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
    const current = String(row[node.discriminator] ?? '')
    if (!current) {
      errors[path] = `${label}還沒有選型別。`
      return
    }
    const variant = node.variants.find((v) => v.value === current)
    // ⚠️ 前台不認識的型別**不驗** —— 我們不懂它的形狀，不該對它有意見。
    //    它在畫面上是唯讀的，原樣保留。
    if (variant) walkNode(variant.node, value, path, label, errors)
  }
}

export interface BodyFormShape {
  title: string
  slug: string
  fields: Record<string, unknown>
}

/**
 * 本文表單。回傳 `{ 欄位鍵: 訊息 }`，`title`／`slug` 用同名的鍵。
 *
 * @param slugRequired 這個單元的 slug 是不是必填（`producesUrl` 且沒有被系統鎖定）。
 */
export function validateBody(
  def: UnitDefinition,
  form: BodyFormShape,
  slugRequired: boolean,
  /** page 的 `bodyBlocks` 要靠 slug 才找得到 schema。 */
  context: { slug: string | null } = { slug: null },
): FieldErrors {
  const errors: FieldErrors = {}

  if (isBlank(form.title)) errors.title = '標題為必填。'
  else if (form.title.trim().length > TITLE_MAX) errors.title = `標題長度不可超過 ${TITLE_MAX} 字（目前 ${form.title.trim().length} 字）。`

  // ⚠️ **不要用 `def.producesUrl` 當條件。** FAQ 不輸出獨立網址，但 API 的新增與
  //    更新都是 `NormalizeAndValidateSlug(..., required: true)` —— 空字串一樣被退回
  //    （它是 `/faq/` 的頁內錨點，docs/08 §C-6）。九個單元一律要驗。
  const slugProblem = validateSlug(form.slug)
  if (slugProblem) errors.slug = slugProblem
  else if (slugRequired && isBlank(form.slug)) {
    errors.slug = def.producesUrl ? '網址代稱為必填——它決定這一頁的網址。' : '網址代稱為必填——它是常見問題頁上的定位用代稱。'
  }

  for (const field of def.fields) {
    // 文章的「摘要」送出時是頂層的 summary，長度上限與其他欄位不同（docs/08 §B-1）。
    if (def.key === 'article' && field.key === 'summary') {
      const summary = text(form.fields[field.key])
      if (summary.length > SUMMARY_MAX) {
        errors[field.key] = `摘要長度不可超過 ${SUMMARY_MAX} 字（目前 ${summary.length} 字）。`
        continue
      }
    }

    const problem = validateField(field, form.fields[field.key])
    if (problem) {
      errors[field.key] = problem
      continue
    }

    // 結構化欄位的細部錯誤：鍵是路徑，讓紅字顯示在真正出錯的那一格旁邊。
    if (field.type === 'structured') {
      Object.assign(errors, validateStructured(field, resolveSchema(field, context), form.fields[field.key]))
    }
  }

  return errors
}

// ── SEO 區塊 ──────────────────────────────────────────────────────────

export function validateSeo(seo: SeoDraft): FieldErrors {
  const errors: FieldErrors = {}

  const seoTitle = text(seo.seoTitle)
  if (seoTitle.length > SEO_TITLE_MAX) errors.seoTitle = `SEO 標題長度不可超過 ${SEO_TITLE_MAX} 字（目前 ${seoTitle.length} 字）。`

  const metaDescription = text(seo.metaDescription)
  if (metaDescription.length > META_DESCRIPTION_MAX) {
    errors.metaDescription = `Meta Description 長度不可超過 ${META_DESCRIPTION_MAX} 字（目前 ${metaDescription.length} 字）。`
  }

  // ⚠️ API 的門檻是 20–300，不是畫面上寫的「建議 40–60 字」。
  //    40–60 是 GEO 的建議值（docs/03 §4），沒達到不會被擋；低於 20 才是真的存不進去。
  const aiSummary = text(seo.aiSummary)
  if (aiSummary.length > 0 && (aiSummary.length < AI_SUMMARY_MIN || aiSummary.length > AI_SUMMARY_MAX)) {
    errors.aiSummary = `AI 摘要填了就必須介於 ${AI_SUMMARY_MIN}–${AI_SUMMARY_MAX} 字（目前 ${aiSummary.length} 字），留空則不輸出。`
  }

  const structured = text(seo.structuredDataOverride).trim()
  if (structured) {
    try {
      JSON.parse(structured)
    } catch {
      // 🔴 壞掉的 JSON-LD 不會報錯，只會讓那一頁的結構化資料整段失效。
      //    ⚠️ 2026-09-17 更正這段註解：原本寫「前台原樣輸出」——那是錯的，
      //    在同一天接上之前，前台**根本沒有讀過這一欄**（零引用）。
      //    現在它是真的會輸出了（`usePageHead` 的覆寫分支），而且是**整段取代**
      //    這一頁自動產生的結構化資料。
      errors.structuredDataOverride = '結構化資料不是有效的 JSON，請檢查引號與逗號。'
    }
  }

  const canonical = text(seo.canonicalOverride).trim()
  if (canonical && !canonical.startsWith('/') && !/^https?:\/\//i.test(canonical)) {
    errors.canonicalOverride = 'Canonical 要以 / 開頭，或填完整的 https:// 網址。'
  }

  return errors
}

// ── 排程 ──────────────────────────────────────────────────────────────

/** `ContentHandler`：「下架時間必須晚於發布時間」。 */
export function validateSchedule(publishAt: string, unpublishAt: string): string | null {
  if (!publishAt || !unpublishAt) return null
  if (new Date(unpublishAt).getTime() <= new Date(publishAt).getTime()) {
    return '下架時間必須晚於上線時間。'
  }
  return null
}

// ── 給畫面用的小工具 ──────────────────────────────────────────────────

export function firstError(errors: FieldErrors): string | null {
  const keys = Object.keys(errors)
  return keys.length ? errors[keys[0]] : null
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0
}
