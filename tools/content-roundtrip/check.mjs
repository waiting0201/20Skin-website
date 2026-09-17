// 21 個結構化欄位的 round-trip 回歸測試。
//
// 🔴 **這是「schema 有沒有抄對」唯一能自動驗的那一半。**
//    抄錯的症狀是前台那一區靜默消失（`parseBlocks` 回 fallback，HTTP 仍是 200），
//    人眼看後台看不出來 —— 所以要用正式資料整批跑一次。
//
// 流程：`parseStructured` →（**完全不編輯**）→ `toWire` → 與原字串做深度相等比對。
//   通過條件：每一筆都與原值完全相同（鍵集合、值、陣列順序都要一樣）。
//
// ⚠️ 比對用**深度相等**不是字串相等 —— `JSON.stringify` 的鍵順序會跟著物件的
//    插入順序跑，那不是差異。但深度相等仍然涵蓋「鍵有沒有被吃掉」，
//    那正是這支腳本最重要的職責（560/1083 篇文章的段落帶著 `runs`）。
//
// 用法：node --experimental-strip-types tools/content-roundtrip/check.mjs

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const adminSrc = resolve(here, '../../apps/admin/src')

const { parseStructured, toWire, isEmptyValue, emptyValueFor } = await import(join(adminSrc, 'structured-schema.ts'))
const { UNIT_REGISTRY } = await import(join(adminSrc, 'units/index.ts'))
// ⚠️ 直接 import schema 檔本身，不要走 `api/site.ts` —— 那會把整包 API client
//    （fetch、token、路由）拖進 Node。那個檔對 HomeSectionKey 只有 `import type`，
//    所以這個檔是純資料，Node 直接跑得動。
const { HOME_SECTION_SETTINGS_SCHEMA } = await import(join(adminSrc, 'units/schemas/home.ts'))

const contentDir = resolve(process.argv[2] ?? 'apps/web/content')
if (!existsSync(contentDir)) {
  console.error(`找不到 ${contentDir}。先跑 pnpm --filter web export:content。`)
  process.exit(2)
}

/** 單元 → 匯出檔名。 */
const FILES = {
  treatment: 'treatments.json',
  doctor: 'doctors.json',
  concern: 'concerns.json',
  clinic: 'clinics.json',
  case: 'cases.json',
  term: 'terms.json',
  page: 'pages.json',
  article: 'articles.json',
  faq: 'faqs.json',
}

function deepEqual(a, b) {
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]))
  const ka = Object.keys(a).sort()
  const kb = Object.keys(b).sort()
  if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false
  return ka.every((k) => deepEqual(a[k], b[k]))
}

/** 把 wire 值正規化成可比對的 JS 值（json-string 的要 parse 回來）。 */
function normalize(wireValue) {
  if (wireValue === null || wireValue === undefined) return null
  if (typeof wireValue === 'string') {
    try { return JSON.parse(wireValue) } catch { return wireValue }
  }
  return wireValue
}

function resolveSchema(field, slug) {
  if (field.structuredBySlug) return slug ? field.structuredBySlug[slug] : undefined
  return field.structured
}

let checked = 0
let failed = 0
let normalized = 0
const rawModeHits = []

function checkRecord(unit, field, record, rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === '') return
  const slug = record.slug ?? null
  const schema = resolveSchema(field, slug)
  const label = `${unit}.${field.key} [${slug ?? record.id}]`

  const parsed = parseStructured(schema, rawValue)
  checked += 1

  // 字串代表「沒切成表單」—— 沒有 schema 的頁面是預期行為，其餘就是抄錯了。
  if (typeof parsed === 'string') {
    if (schema === undefined) rawModeHits.push(label)
    else {
      failed += 1
      console.log(`  ✗ ${label}：有 schema 卻切不進表單（parse 失敗或最外層型別不符）`)
    }
    return
  }

  const wire = toWire(schema, parsed, field.structuredWire ?? 'json-string')
  const before = normalize(rawValue)
  const after = normalize(wire)

  // `emptyIsNull` 會把「每一格都空的物件」收斂成 null。那是**刻意**的正規化
  // （避免新建的欄位存出一個 `{"a":null,"b":null}`），不是內容遺失 ——
  // 兩邊都是空的就算通過，但要記數讓它看得見。
  // ⚠️ 只有兩邊**都**空才算：原值有內容而往返後變空，仍然是失敗。
  if (!deepEqual(before, after) && isEmptyValue(before) && isEmptyValue(after)) {
    normalized += 1
    return
  }

  if (!deepEqual(before, after)) {
    failed += 1
    console.log(`  ✗ ${label}：往返後與原值不同`)
    console.log(`      原值：${JSON.stringify(before).slice(0, 200)}`)
    console.log(`      往返：${JSON.stringify(after).slice(0, 200)}`)
  }
}

for (const [unit, file] of Object.entries(FILES)) {
  const def = UNIT_REGISTRY[unit]
  const structuredFields = def.fields.filter((f) => f.type === 'structured')
  if (!structuredFields.length) continue

  const path = join(contentDir, file)
  if (!existsSync(path)) { console.log(`\n── ${def.label}：${file} 不存在，略過`); continue }
  const rows = JSON.parse(readFileSync(path, 'utf8'))
  console.log(`\n── ${def.label}（${rows.length} 筆・${structuredFields.length} 個結構化欄位）`)
  for (const row of rows) {
    for (const field of structuredFields) checkRecord(unit, field, row, row.fields?.[field.key])
  }
}

// 文章內文另外走一次：匯出時它被拆成一篇一個檔。
const bodiesDir = join(contentDir, 'article-bodies')
if (existsSync(bodiesDir)) {
  const field = UNIT_REGISTRY.article.fields.find((f) => f.key === 'bodyBlocks')
  const files = readdirSync(bodiesDir).filter((f) => f.endsWith('.json'))
  console.log(`\n── 文章內文（${files.length} 篇）`)
  for (const f of files) {
    const raw = readFileSync(join(bodiesDir, f), 'utf8')
    checkRecord('article', field, { slug: f.replace(/\.json$/, '') }, raw)
  }
}

// ── 首頁版位的設定 JSON（HomeSections.Settings）────────────────────────
//
// 🔴 這一份與九個內容模型的區塊 JSON 是同一類東西、同一種錯法：抄錯不會有編譯錯誤，
//    症狀是前台首頁那一區靜默消失。所以一起在這裡驗。
//
// ⚠️ **匯出檔裡的 `settings` 已經是 parse 過的值**，而後台讀到的是**字串**
//    （`GET /admin/home-section` 回的是 `Settings` 欄位原文）——
//    這裡要先 stringify 回去才是在驗同一條路徑。少了這一步，
//    `parseStructured` 的「最外層型別對不對」整個被跳過（它對非字串一律原樣放行），
//    而那正是 hero 最容易出事的地方（陣列被壓成物件 → 首頁 500）。
const homePath = join(contentDir, 'home.json')
if (existsSync(homePath)) {
  const rows = JSON.parse(readFileSync(homePath, 'utf8'))
    .filter((r) => HOME_SECTION_SETTINGS_SCHEMA[r.sectionKey])
  console.log(`\n── 首頁版位設定（${rows.length} 個有 schema 的版位）`)
  for (const row of rows) {
    const raw = row.settings === null || row.settings === undefined ? null : JSON.stringify(row.settings)
    checkRecord('home', { key: row.sectionKey, structured: HOME_SECTION_SETTINGS_SCHEMA[row.sectionKey] },
      { slug: row.sectionKey }, raw)
  }
}

// ── 空白值：新建一筆內容時每一欄的起始狀態 ────────────────────────────
//
// round-trip 驗的是「既有資料進得來、出得去」；這一段驗的是「從零開始也不會壞」。
// 🔴 新欄位如果吐出 `{}` 或 `""` 而不是 null，走 json-value 的那兩欄會被 API 擋下新增。
console.log('\n── 空白值（新建內容時的起始狀態）')
let emptyFailed = 0
for (const [unit, def] of Object.entries(UNIT_REGISTRY)) {
  for (const field of def.fields.filter((f) => f.type === 'structured')) {
    const schemas = field.structuredBySlug ? Object.entries(field.structuredBySlug) : [[null, field.structured]]
    for (const [slug, schema] of schemas) {
      if (!schema) continue
      const label = `${unit}.${field.key}${slug ? ` (${slug})` : ''}`
      try {
        const empty = emptyValueFor(schema.root)
        const wire = toWire(schema, empty, field.structuredWire ?? 'json-string')
        if (wire !== null) {
          emptyFailed += 1
          console.log(`  ✗ ${label}：空白值沒有收斂成 null，而是 ${JSON.stringify(wire).slice(0, 80)}`)
        }
        // 再走一次 parse，確認空白值進得了表單模式
        if (typeof parseStructured(schema, null) === 'string') {
          emptyFailed += 1
          console.log(`  ✗ ${label}：空白值切不進表單模式`)
        }
      } catch (e) {
        emptyFailed += 1
        console.log(`  ✗ ${label}：${e.message}`)
      }
    }
  }
}
for (const [key, schema] of Object.entries(HOME_SECTION_SETTINGS_SCHEMA)) {
  const label = `home.${key}`
  const wire = toWire(schema, emptyValueFor(schema.root), schema.wire)
  if (wire !== null) {
    emptyFailed += 1
    console.log(`  ✗ ${label}：空白值沒有收斂成 null，而是 ${JSON.stringify(wire).slice(0, 80)}`)
  }
  if (typeof parseStructured(schema, null) === 'string') {
    emptyFailed += 1
    console.log(`  ✗ ${label}：空白值切不進表單模式`)
  }
}
if (!emptyFailed) console.log('  ✓ 每一份 schema 的空白值都收斂成 null，也都進得了表單')
failed += emptyFailed

console.log('\n─────────────')
if (rawModeHits.length) {
  console.log(`ℹ 沒有 schema 而走原始 JSON 模式：${rawModeHits.length} 筆`)
  console.log(`   ${rawModeHits.slice(0, 8).join('、')}${rawModeHits.length > 8 ? ' …' : ''}`)
}
if (normalized) console.log(`ℹ 空值正規化（全空的物件 → null，刻意行為）：${normalized} 筆`)
console.log(`檢查 ${checked} 筆　${failed ? `✗ 失敗 ${failed}` : '✓ 全數往返一致'}`)
process.exit(failed ? 1 : 0)
