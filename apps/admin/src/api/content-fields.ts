// 九個內容單元的欄位形狀轉接：API 的 `fields` 字典 ↔ 編輯畫面的 `fields` 物件。
//
// 為什麼需要這一層，而不是兩邊直接對接：
//
//  ① **表單元件一律吐字串。** `<select>` 與 `<input type="number">` 的 value 是 string，
//     但 API 那頭 `categoryTermId` 要 int、`phase` 要 byte（C# 的 `GetByte()` 遇到
//     JSON 字串 `"1"` 直接拋例外）。這種錯**在畫面上完全看不出來** —— 送出去才 400。
//  ② **有兩處欄位的切法兩邊不一樣**，而且兩邊各自都是對的：
//     - 醫師的「專長標籤」與「擅長項目」在畫面上是兩個獨立輸入框（docs/08 §C-2 說它們
//       是個人頁上兩個不同的區塊），在資料庫是同一張 DoctorTags 靠 `Type` 分辨。
//     - 文章的「摘要」在 API 是**內容主幹**的欄位（docs/08 §B-1 `ContentItems.Summary`），
//       不在 Articles 子表，所以它在請求體是頂層的 `summary` 而不是 `fields.summary`。
//       ⚠️ 它也不是 `seo.aiSummary` —— 那是 40–60 字的 GEO 直答段落，兩者不可互換。
//  ③ **圖庫的 sortOrder 由順序決定**：畫面上是拖排順序，資料庫要一個明確的數字。
//
//  ④ **區塊 JSON 欄位在畫面上是表單，在 API 是字串。** 21 個欄位存的是 JSON，
//     編輯畫面拿到的是已經 parse 的 JS 值（`structured-schema.ts`）。這一層負責
//     parse 與 stringify，**而且要分辨兩條寫入路徑**：
//     `json-string`（19 欄，走 `JStr`）要送字串，送物件會被靜默寫成 NULL；
//     `json-value`（文章與頁面的 `bodyBlocks`）送物件。規則宣告在欄位上，
//     不在這裡 if 單元名 —— 見 `StructuredSchema.wire`。
//
// ⚠️ 這裡**不做驗證**，只做形狀轉換。必填、字數、法規揭露四欄那些把關全部在 API
//    （docs/11 §3），前端重寫一份只會有兩份會各自漂移的規則。

import type { UnitKey } from '../types'
import { UNIT_REGISTRY } from '../units'
import type { UnitField } from '../unit-schema'
import { parseStructured, toWire, type StructuredSchema } from '../structured-schema'

/**
 * 這一欄該用哪一份 schema。`page.bodyBlocks` 依 slug 分派，其餘用固定的那一份。
 * 回 undefined ＝ 沒有對應的表單，走原始 JSON 模式。
 */
export function resolveSchema(field: UnitField, context: FieldContext): StructuredSchema | undefined {
  if (field.structuredBySlug) return context.slug ? field.structuredBySlug[context.slug] : undefined
  return field.structured
}

/** 解析 schema 需要的上下文。目前只有 page 用得到 slug。 */
export interface FieldContext {
  slug: string | null
}

/** API 的 `fields` 字典。值的型別由單元決定，這裡一律當 unknown 處理。 */
export type ServerFields = Record<string, unknown>

/** 畫面的 `fields` 物件。 */
export type AdminFields = Record<string, unknown>

// ── 數值強制轉換 ──────────────────────────────────────────────────────

/**
 * 這三種欄位型別在畫面上都是 `<select>`／`<input type="number">`，值是字串，
 * 但 API 那頭一律是數字。
 *
 * ⚠️ 目前九個單元的每一個 `select` 都是數值列舉（termType／pageKind／sourceSite／
 * 學經歷型別／星期／術前術後）。日後若新增**字串值**的 select，這裡要改成看欄位宣告，
 * 不能再一律轉數字 —— 否則那個欄位會被轉成 NaN 然後變成 null。
 */
const NUMERIC_FIELD_TYPES = new Set(['number', 'select', 'relation-single'])

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** repeater／gallery 每一列裡要轉成數字的子欄位鍵。 */
const NUMERIC_SUBFIELD_KEYS = new Set(['type', 'clinicId', 'dayOfWeek', 'phase', 'sortOrder'])

function normalizeRow(row: Record<string, unknown>, index: number): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    out[key] = NUMERIC_SUBFIELD_KEYS.has(key) ? toNumberOrNull(value) : value
  }
  // ⚠️ 順序由陣列位置決定。畫面上使用者是拖／按上下移動，不會去填一個叫 sortOrder 的欄位，
  //    所以這裡一定要補；沒補的話整批都是 0，重新載入後順序就亂了。
  out.sortOrder = index
  return out
}

function asRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : []
}

// ── 醫師標籤：一張表 ↔ 兩個輸入框 ─────────────────────────────────────

const DOCTOR_TAG_SPECIALTY = 1
const DOCTOR_TAG_EXPERTISE = 2

interface ServerDoctorTag {
  type?: number
  tag?: string
  sortOrder?: number
}

function splitDoctorTags(serverTags: unknown): { tags: string[]; expertiseTags: string[] } {
  const rows = Array.isArray(serverTags) ? (serverTags as ServerDoctorTag[]) : []
  const pick = (type: number) =>
    rows
      .filter((t) => Number(t.type) === type)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((t) => String(t.tag ?? ''))
      .filter((t) => t.length > 0)
  return { tags: pick(DOCTOR_TAG_SPECIALTY), expertiseTags: pick(DOCTOR_TAG_EXPERTISE) }
}

function mergeDoctorTags(tags: unknown, expertiseTags: unknown): ServerDoctorTag[] {
  const build = (value: unknown, type: number): ServerDoctorTag[] =>
    (Array.isArray(value) ? (value as unknown[]) : [])
      .map((tag, index) => ({ type, tag: String(tag), sortOrder: index }))
      .filter((t) => t.tag.length > 0)
  return [...build(tags, DOCTOR_TAG_SPECIALTY), ...build(expertiseTags, DOCTOR_TAG_EXPERTISE)]
}

// ── API → 畫面 ────────────────────────────────────────────────────────

/**
 * @param summary 內容主幹的一句話導言（`ContentDetailDto.summary`）。文章的編輯畫面
 *   把它當成一般欄位顯示，所以在這裡塞回 `fields.summary`。
 */
export function fieldsFromServer(
  unit: UnitKey,
  serverFields: ServerFields | null | undefined,
  summary: string | null,
  context: FieldContext = { slug: null },
): AdminFields {
  const source = serverFields ?? {}
  const out: AdminFields = { ...source }

  if (unit === 'doctor') {
    const split = splitDoctorTags(source.tags)
    out.tags = split.tags
    out.expertiseTags = split.expertiseTags
  }

  if (unit === 'article') {
    out.summary = summary ?? ''
  }

  // 畫面上每一種集合型欄位都預期是陣列。API 對「沒有任何一列」回的是空陣列，
  // 但欄位本身可能根本不在字典裡（例如剛建立、還沒存過任何圖）——補成 []，
  // 讓 `v-for` 不必到處寫 `?? []`。
  for (const field of UNIT_REGISTRY[unit].fields) {
    if (isCollectionField(field) && !Array.isArray(out[field.key])) {
      out[field.key] = []
    }
    // 區塊 JSON → 已 parse 的 JS 值（parse 不了就保持字串＝原始 JSON 模式）。
    if (field.type === 'structured') {
      out[field.key] = parseStructured(resolveSchema(field, context), source[field.key])
    }
  }

  return out
}

function isCollectionField(field: UnitField): boolean {
  return field.type === 'gallery' || field.type === 'repeater' || field.type === 'tags' || field.type === 'hours'
}

// ── 畫面 → API ────────────────────────────────────────────────────────

export interface ServerBodyFields {
  fields: ServerFields
  /** 頂層的一句話導言。只有文章的畫面有這一欄，其餘單元為 undefined（＝不送、不動它）。 */
  summary?: string | null
}

/**
 * @param isCreate 新增時為 true。影響 `settableOnCreate` 那幾個欄位要不要送
 *   （`Terms.TermType`／`Pages.PageKind`：建立後不可改，但新增時是必填）。
 */
export function fieldsToServer(
  unit: UnitKey,
  adminFields: AdminFields,
  isCreate = false,
  context: FieldContext = { slug: null },
): ServerBodyFields {
  const def = UNIT_REGISTRY[unit]
  const out: ServerFields = {}
  let summary: string | null | undefined

  for (const field of def.fields) {
    // 唯讀欄位一律不回送。usageCount 是伺服器算出來的衍生值，
    // sourceSite／systemKey 是遷移與系統資料 —— 回送它們最好的情況是被忽略，
    // 最壞的情況是把正確的值覆蓋掉。
    // 例外：settableOnCreate 的那幾個在新增時必須送（見 UnitField 的說明）。
    if (field.readOnly && !(isCreate && field.settableOnCreate)) continue

    const value = adminFields[field.key]

    if (unit === 'article' && field.key === 'summary') {
      summary = value === null || value === undefined ? null : String(value)
      continue
    }

    if (unit === 'doctor' && (field.key === 'tags' || field.key === 'expertiseTags')) {
      // 兩個輸入框合成同一個 tags 陣列，在迴圈外統一處理，這裡跳過。
      continue
    }

    if (field.type === 'structured') {
      // 🔴 `wire` 決定送字串還是送物件。送錯的兩種下場都是靜默的：
      //    該送字串卻送物件 → `JStr` 回 null → 欄位被清空；
      //    該送物件卻送字串 → 以前會被雙重編碼（API 已於 2026-09-17 改成兩種都收）。
      out[field.key] = toWire(resolveSchema(field, context), value, field.structuredWire ?? 'json-string')
      continue
    }

    if (NUMERIC_FIELD_TYPES.has(field.type)) {
      out[field.key] = toNumberOrNull(value)
      continue
    }

    if (field.type === 'gallery' || field.type === 'repeater' || field.type === 'hours') {
      out[field.key] = asRows(value).map(normalizeRow)
      continue
    }

    if (field.type === 'tags') {
      out[field.key] = Array.isArray(value) ? value.map(String) : []
      continue
    }

    out[field.key] = value ?? null
  }

  if (unit === 'doctor') {
    out.tags = mergeDoctorTags(adminFields.tags, adminFields.expertiseTags)
  }

  return summary === undefined ? { fields: out } : { fields: out, summary }
}
