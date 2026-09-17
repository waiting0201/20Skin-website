// 21 個「區塊 JSON」欄位的唯讀稽核。
//
// 用途：在把這些欄位改成表單之前，先確認資料的實際形狀 ——
//   ① 有沒有已經壞掉的（非法 JSON、被雙重編碼）
//   ② 有沒有 schema 沒有描述、但實際存在的鍵（那些鍵不可以在改版時被吃掉）
//   ③ union 的 `type` 有沒有前台不認識的值
//
// 🔴 **只讀，不寫。** 它不連資料庫也不打 API，讀的是 `apps/web/content/` 的匯出快照。
//    ⚠️ 那份快照是離線稽核用的（CLAUDE.md：前台已經完全不使用它），可能落後正式庫。
//    要稽核正式資料請先重跑 `pnpm --filter web export:content`。
//
// 用法：node tools/content-audit/audit-json-fields.mjs [content 目錄]

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(process.argv[2] ?? 'apps/web/content')
if (!existsSync(root)) {
  console.error(`找不到 ${root}。先跑 pnpm --filter web export:content，或指定目錄。`)
  process.exit(2)
}

/**
 * 欄位清單。`top` 是這一欄的最外層應該是什麼。
 * ⚠️ 形狀的真實來源是前台的型別（apps/web/app/data/*.ts）——這裡只記最外層，
 *    深層形狀不在這支腳本的職責範圍內。
 */
const FIELDS = {
  'treatments.json': { unit: '療程', fields: { facts: 'array', deviceInfo: 'array', steps: 'array', aftercare: 'array', indications: 'object', mechanism: 'object', contraindications: 'object' } },
  'doctors.json': { unit: '醫師', fields: { bio: 'object', publications: 'array' } },
  'concerns.json': { unit: '困擾', fields: { symptoms: 'object', causes: 'object', selfCheckGuide: 'object', whenToSeeDoctor: 'object', recommendationIntro: 'object' } },
  'clinics.json': { unit: '據點', fields: { intro: 'object', transportInfo: 'array' } },
  'cases.json': { unit: '案例', fields: { narrative: 'object' } },
  'terms.json': { unit: '分類與標籤', fields: { intro: 'object' } },
  'pages.json': { unit: '頁面', fields: { bodyBlocks: 'object' } },
  'articles.json': { unit: '文章', fields: { bodyBlocks: 'array' } },
}

const kindOf = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v === 'object' ? 'object' : typeof v)

let problems = 0

function auditValue(unit, field, expected, raw, label, report) {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw !== 'string') {
    report.notString.push(label)
    return null
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    report.invalid.push(`${label}：${e.message}`)
    return null
  }
  const kind = kindOf(parsed)
  if (kind === 'string') {
    // 🔴 這就是雙重編碼的指紋：parse 一次之後還是字串。
    report.doubleEncoded.push(label)
    return null
  }
  if (kind !== expected) report.wrongTop.push(`${label}：最外層是 ${kind}，應該是 ${expected}`)
  return parsed
}

/** 收集物件（或陣列成員）用到的鍵，用來找出 schema 之外的欄位。 */
function collectKeys(node, path, keys, depth = 0) {
  if (depth > 6 || node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const item of node) collectKeys(item, `${path}[]`, keys, depth + 1)
    return
  }
  const tag = node.type ? `${path}<${node.type}>` : path
  for (const [k, v] of Object.entries(node)) {
    keys.add(`${tag}.${k}`)
    collectKeys(v, `${tag}.${k}`, keys, depth + 1)
  }
}

for (const [file, spec] of Object.entries(FIELDS)) {
  const path = join(root, file)
  if (!existsSync(path)) {
    console.log(`\n── ${spec.unit}（${file}）：檔案不存在，略過`)
    continue
  }
  const rows = JSON.parse(readFileSync(path, 'utf8'))
  console.log(`\n── ${spec.unit}（${file}，${rows.length} 筆）`)

  for (const [field, expected] of Object.entries(spec.fields)) {
    const report = { invalid: [], doubleEncoded: [], wrongTop: [], notString: [] }
    const keys = new Set()
    let filled = 0

    for (const row of rows) {
      const raw = row.fields?.[field]
      if (raw === null || raw === undefined || raw === '') continue
      filled += 1
      const parsed = auditValue(spec.unit, field, expected, raw, `${row.slug ?? row.id}`, report)
      if (parsed !== null) collectKeys(parsed, field, keys)
    }

    const bad = report.invalid.length + report.doubleEncoded.length + report.wrongTop.length + report.notString.length
    problems += bad
    const mark = bad ? '✗' : '✓'
    console.log(`  ${mark} ${field.padEnd(20)} 有值 ${String(filled).padStart(4)} 筆・鍵 ${keys.size} 種`)
    for (const [name, list] of [['非法 JSON', report.invalid], ['雙重編碼', report.doubleEncoded],
                                ['最外層型別不符', report.wrongTop], ['不是字串', report.notString]]) {
      if (list.length) console.log(`      ${name}（${list.length}）：${list.slice(0, 5).join('、')}${list.length > 5 ? ' …' : ''}`)
    }
    if (process.env.SHOW_KEYS && keys.size) console.log(`      鍵：${[...keys].sort().join(' ')}`)
  }
}

// 文章內文另外走一次：它一篇一個檔，而且是 union，值得單獨統計區塊型別。
const bodiesDir = join(root, 'article-bodies')
if (existsSync(bodiesDir)) {
  const files = readdirSync(bodiesDir).filter((f) => f.endsWith('.json'))
  const types = new Map()
  const keysByType = new Map()
  let invalid = 0
  for (const f of files) {
    let blocks
    try {
      blocks = JSON.parse(readFileSync(join(bodiesDir, f), 'utf8'))
    } catch {
      invalid += 1
      continue
    }
    if (!Array.isArray(blocks)) { invalid += 1; continue }
    for (const b of blocks) {
      const t = b?.type ?? '(無 type)'
      types.set(t, (types.get(t) ?? 0) + 1)
      if (!keysByType.has(t)) keysByType.set(t, new Set())
      for (const k of Object.keys(b ?? {})) keysByType.get(t).add(k)
    }
  }
  console.log(`\n── 文章內文（article-bodies/，${files.length} 檔${invalid ? `，${invalid} 檔壞掉` : ''}）`)
  for (const [t, n] of [...types].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${t.padEnd(12)} ${String(n).padStart(6)} 個・鍵：${[...keysByType.get(t)].sort().join(' ')}`)
  }
  problems += invalid
}

console.log(`\n${problems ? `✗ 共 ${problems} 個問題` : '✓ 沒有發現格式問題'}`)
