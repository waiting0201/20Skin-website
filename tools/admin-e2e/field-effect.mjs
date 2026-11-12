// 端到端稽核：**後台每一個文字欄位改了之後，前台有沒有反應**。
//
// 🔴 **這一支會真的改資料，只能對本機資料庫跑。** 它把九個單元各挑幾筆已發布的內容，
//    在每一個文字葉節點後面接上一個唯一記號（〔Q123〕）→ 儲存 → 發布 → 爬前台，
//    回報哪些記號沒有出現在任何一頁的 HTML 裡，最後把每一筆還原並重新發布。
//    備份在動手之前就寫到磁碟（--backup 指定，預設在系統暫存目錄），中途掛掉用 `--restore` 救回來。
//
// 為什麼需要它：typecheck、build、round-trip、check.mjs 都看不到「這一格存得進去、
// 前台卻從來不讀」—— 2026-11-12 一天之內就翻出四個（頁面的導言、分類的介紹文案、
// 七個單元的摘要沒有欄位、系統頁整頁沒有東西可改）。
//
// 寫入走的是後台自己的換算層（`apps/admin/src/api/content-fields.ts` 的
// fieldsFromServer／fieldsToServer），所以送出去的形狀與在畫面上按儲存相同。
//
// ⚠️ 只測得到**文字**。圖片、數字、布林、日期、關聯、營業時段不在範圍內（結尾會列出來）。
// ⚠️ 記號出現在 hydration payload 不算 —— SSR 取過的資料全部會進 payload，
//    那不代表畫面上有渲染。比對前先把 `__NUXT_DATA__` 整段拿掉。
//
// 用法（三個服務裡要起 func 與 web；admin 不需要）：
//   node --experimental-strip-types --import ./tools/content-roundtrip/register.mjs tools/admin-e2e/field-effect.mjs
//   … field-effect.mjs --restore     # 只做還原

import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { api, apiLogin, API, WEB } from './_shared.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const adminSrc = resolve(here, '../../apps/admin/src')
const { UNIT_REGISTRY } = await import(join(adminSrc, 'units/index.ts'))
const { fieldsFromServer, fieldsToServer } = await import(join(adminSrc, 'api/content-fields.ts'))

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}
const BACKUP = argOf('backup', join(tmpdir(), 'skin20-field-effect-backup.json'))
const REPORT = argOf('report', join(tmpdir(), 'skin20-field-effect-report.json'))
const RESTORE_ONLY = process.argv.includes('--restore')

if (!/127\.0\.0\.1|localhost/.test(API)) {
  console.error(`🔴 拒絕執行：API 是 ${API}。這一支會改資料，只能對本機跑。`)
  process.exit(1)
}

const UNITS = ['clinic', 'doctor', 'treatment', 'concern', 'case', 'faq', 'term', 'page', 'article']
const PER_UNIT_DETAILS = 25
const MAX_RECORDS_PER_UNIT = 4

/**
 * 已知「頁面上不會出現」而且是刻意的。比對 `單元.欄位` 加路徑開頭；命中的另外列在報告的
 * 「已知不顯示」一段，不算失敗。⚠️ 加一條之前先確認真的有別的地方在讀它，並把理由寫清楚 ——
 * 這張表是用來分辨「刻意」與「壞掉」的，不是用來讓報告變綠的。
 */
const EXPECTED_HIDDEN = [
  { key: 'doctor.tags', why: '不顯示文字，用來驅動 /team/ 的專長篩選（按鈕是寫死的四個詞）' },
  { key: 'treatment.durationText', why: '只給 AI 問答的語料用（AiChunker），頁面上的時間在「規格數據列」' },
  { key: 'treatment.sessionsText', why: '同上' },
  { key: 'case.consentReference', why: '內部留存紀錄，不對外顯示' },
  { key: 'case.narrative', path: /^(sections|timeline|testimonial)/, why: '已由內文取代、後台不再顯示的舊鍵（決策 32），原樣往返' },
  { key: 'page.bodyBlocks', path: /^(teamPreview|clinics)/, why: '品牌理念頁改讀醫師與據點單元後留下的舊鍵（決策 30），原樣往返' },
  { key: 'page.bodyBlocks', path: /^meta\[0\]$/, onlyTitles: ['新中式美學'], why: '「最後更新 …」那一項的日期由前台自動帶，手打的字不顯示' },
  { key: 'page.summary', onlyTitles: ['品牌理念', '隱私權政策', '服務條款', '醫療免責聲明'], why: '導言只有兩個長版故事頁會顯示（欄位說明已寫明）' },
]
const expectedReason = (meta) => EXPECTED_HIDDEN.find((e) =>
  e.key === `${meta.unit}.${meta.field}`
  && (!e.path || e.path.test(meta.path ?? ''))
  && (!e.onlyTitles || e.onlyTitles.includes(meta.title)))?.why

// ── 記號 ──────────────────────────────────────────────────────────────

let seq = 0
/** n → { unit, id, title, field, label, path } */
const markers = new Map()
const mark = (meta) => {
  const n = ++seq
  markers.set(n, meta)
  return `〔Q${n}〕`
}

const CJK = /[㐀-鿿]/
/** 這些鍵的字串是網址、代號或檔案路徑，改了會壞掉而不是「沒反應」。 */
const SKIP_KEYS = new Set([
  'src', 'url', 'href', 'blobPath', 'slug', 'id', 'icon', 'type', 'kind', 'variant', 'variants', 'urlPath',
  'startTime', 'endTime', 'date', 'updatedOn', 'tone', 'level', 'phase', 'runs',
])
const looksLikeText = (s) => typeof s === 'string' && s.trim().length > 0 && CJK.test(s)

/** 走訪一個值，回傳「每個文字葉節點都接上記號」的副本。 */
function markDeep(value, meta, path = '') {
  if (typeof value === 'string') {
    return looksLikeText(value) ? value + mark({ ...meta, path }) : value
  }
  if (Array.isArray(value)) return value.map((v, i) => markDeep(v, meta, `${path}[${i}]`))
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = SKIP_KEYS.has(k) ? v : markDeep(v, meta, path ? `${path}.${k}` : k)
    }
    return out
  }
  return value
}

const TEXT_TYPES = new Set(['text', 'textarea', 'longtext'])
const DEEP_TYPES = new Set(['structured', 'gallery', 'repeater', 'tags'])
/** 單行文字欄位裡，這些鍵不是給人讀的文案。 */
const NON_COPY_FIELD = /url|phone|slug|email|license|number|date|time|latitude|longitude/i

const isEmpty = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)
  || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)

// ── 挑資料 ────────────────────────────────────────────────────────────

async function detailsOf(unit) {
  const query = unit === 'page' ? '?pageKind=1&pageSize=50' : `?pageSize=${PER_UNIT_DETAILS}&status=3`
  const list = await api(`/admin/${unit}${query}`)
  if (!list.success) throw new Error(`${unit} 清單：${list.code} ${list.message}`)
  const rows = [...list.data.items]
  if (unit === 'term') {
    // 393 筆標籤排在前面，分類要另外各抓一頁才挑得到。
    for (const t of [1, 2, 3]) rows.push(...((await api(`/admin/term?termType=${t}&status=3&pageSize=5`)).data?.items ?? []))
  }
  const out = []
  for (const row of rows) {
    const d = await api(`/admin/${unit}/${row.id}`)
    if (d.success && d.data.status === 3) out.push(d.data)
  }
  return out
}

/** 貪婪挑幾筆，讓「有值的欄位」涵蓋得最多。 */
function pickRecords(unit, details) {
  const def = UNIT_REGISTRY[unit]
  const keys = def.fields.filter((f) => !f.readOnly && (TEXT_TYPES.has(f.type) || DEEP_TYPES.has(f.type))).map((f) => f.key)
  const filled = (d) => {
    const admin = fieldsFromServer(unit, d.fields, d.summary, { slug: d.slug })
    return new Set(keys.filter((k) => !isEmpty(admin[k])))
  }
  if (unit === 'page') return details
  // 分類與標籤：四種型別各挑一筆 —— 分類頁與標籤頁是不同的樣板，只測到標籤等於沒測分類。
  if (unit === 'term') {
    const seen = new Set()
    return details.filter((d) => !seen.has(d.fields.termType) && seen.add(d.fields.termType))
  }
  const chosen = []
  const covered = new Set()
  const pool = details.map((d) => ({ d, set: filled(d) }))
  while (chosen.length < MAX_RECORDS_PER_UNIT && pool.length) {
    pool.sort((a, b) => [...b.set].filter((k) => !covered.has(k)).length - [...a.set].filter((k) => !covered.has(k)).length)
    const best = pool.shift()
    const gain = [...best.set].filter((k) => !covered.has(k)).length
    if (chosen.length > 0 && gain === 0) break
    chosen.push(best.d)
    best.set.forEach((k) => covered.add(k))
  }
  return chosen
}

// ── 寫入 ──────────────────────────────────────────────────────────────

function bodyOf(unit, detail, adminFields, title) {
  const mapped = fieldsToServer(unit, adminFields, false, { slug: detail.slug })
  const body = { title, slug: detail.slug, sortOrder: detail.sortOrder, includeInSitemap: detail.includeInSitemap, fields: mapped.fields }
  if (mapped.summary !== undefined) body.summary = mapped.summary
  return body
}

async function putAndPublish(unit, id, body, seo) {
  const put = await api(`/admin/${unit}/${id}`, { method: 'PUT', body: JSON.stringify(body) })
  if (!put.success) return `儲存失敗：${put.code} ${put.message} ${JSON.stringify(put.errors ?? [])}`
  if (seo) {
    const s = await api(`/admin/${unit}/${id}/seo`, { method: 'PUT', body: JSON.stringify(seo) })
    if (!s.success) return `SEO 儲存失敗：${s.code} ${s.message}`
  }
  const pub = await api(`/admin/${unit}/${id}/publish`, { method: 'PATCH', body: JSON.stringify({ action: 'publish' }) })
  if (!pub.success) return `發布失敗：${pub.code} ${pub.message}`
  return null
}

async function restoreAll(backup) {
  let failed = 0
  for (const { unit, detail } of backup) {
    const admin = fieldsFromServer(unit, detail.fields, detail.summary, { slug: detail.slug })
    const seo = detail.seo ? { ...detail.seo } : { seoTitle: null, metaDescription: null, aiSummary: null, ogImage: null, canonicalOverride: null, noIndex: false, structuredDataOverride: null }
    const body = bodyOf(unit, detail, admin, detail.title)
    // 🔴 原本是 NULL 的欄位要明確送 null。後台的換算層會替空的內文帶入「舊版型換算出來的起始值」
    //    （困擾、案例的 bodyBlocks，決策 32）—— 那是給人在畫面上看的，還原時送出去等於
    //    替這一筆做了版型轉換。摘要同理：備份是 NULL 就還原成 NULL。
    for (const [k, v] of Object.entries(detail.fields ?? {})) if (v === null && k in body.fields) body.fields[k] = null
    body.summary = detail.summary
    const err = await putAndPublish(unit, detail.id, body, seo)
    if (err) { failed++; console.log(`  ✗ 還原 ${unit}/${detail.id}：${err}`); continue }
    const now = (await api(`/admin/${unit}/${detail.id}`)).data
    const same = JSON.stringify(now.fields) === JSON.stringify(detail.fields) && now.title === detail.title && (now.summary ?? null) === (detail.summary ?? null)
    if (!same) { failed++; console.log(`  ✗ 還原後與備份不一致 ${unit}/${detail.id}「${detail.title}」`) }
  }
  console.log(failed ? `🔴 ${failed} 筆沒有還原乾淨` : `✓ ${backup.length} 筆全數還原並重新發布，與備份逐欄位相同`)
  return failed
}

// ── 主流程 ────────────────────────────────────────────────────────────

await apiLogin()

if (RESTORE_ONLY) {
  if (!existsSync(BACKUP)) { console.error(`找不到備份 ${BACKUP}`); process.exit(1) }
  process.exit(await restoreAll(JSON.parse(readFileSync(BACKUP, 'utf8'))) ? 1 : 0)
}

const backup = []
const notTested = []   // 不是文字、這支腳本測不到的欄位
const emptyEverywhere = [] // 挑到的資料裡沒有任何一筆有值
const plan = []

for (const unit of UNITS) {
  const details = await detailsOf(unit)
  const chosen = pickRecords(unit, details)
  const def = UNIT_REGISTRY[unit]
  for (const f of def.fields) {
    if (f.readOnly) continue
    if (!TEXT_TYPES.has(f.type) && !DEEP_TYPES.has(f.type)) notTested.push(`${def.label}｜${f.label}（${f.type}）`)
  }
  for (const r of def.relations ?? []) notTested.push(`${def.label}｜${r.label}（關聯）`)
  console.log(`${def.label}：已發布 ${details.length} 筆，挑 ${chosen.length} 筆 → ${chosen.map((d) => d.title).join('、')}`)
  for (const d of chosen) { backup.push({ unit, detail: d }); plan.push({ unit, detail: d }) }
}
writeFileSync(BACKUP, JSON.stringify(backup))
console.log(`備份已寫到 ${BACKUP}\n`)

const seenFilled = new Map() // `${unit}.${field}` → 有沒有任何一筆有值
const writeErrors = []
const urls = new Set(['/', '/about/', '/team/', '/treatments/', '/concerns/', '/blog/', '/cases/', '/faq/', '/clinics/', '/contact/'])

for (const { unit, detail } of plan) {
  const def = UNIT_REGISTRY[unit]
  const base = { unit, unitLabel: def.label, id: detail.id, title: detail.title, url: detail.urlPath }
  const admin = fieldsFromServer(unit, detail.fields, detail.summary, { slug: detail.slug })
  const next = { ...admin }
  for (const f of def.fields) {
    if (f.readOnly) continue
    const key = `${unit}.${f.key}`
    const meta = { ...base, field: f.key, label: f.label }
    const v = admin[f.key]
    if (TEXT_TYPES.has(f.type)) {
      if (NON_COPY_FIELD.test(f.key)) { if (!seenFilled.has(key)) notTested.push(`${def.label}｜${f.label}（網址／代號類文字）`); seenFilled.set(key, true); continue }
      // 空的文字欄位直接填一個記號進去 —— 「原本沒填」不代表「填了不會顯示」。
      next[f.key] = (typeof v === 'string' ? v : '') + mark({ ...meta, path: '', wasEmpty: isEmpty(v) })
      seenFilled.set(key, true)
    } else if (DEEP_TYPES.has(f.type)) {
      if (isEmpty(v) || typeof v === 'string') { if (!seenFilled.has(key)) seenFilled.set(key, false); continue }
      const before = seq
      next[f.key] = markDeep(v, meta)
      seenFilled.set(key, seenFilled.get(key) || seq > before)
    }
  }
  const title = detail.title + mark({ ...base, field: 'title', label: '標題', path: '' })
  // ⚠️ 與後台 EditPage.vue 的 showSeoBlock／showAiSummary 同一組條件：畫面上沒有的欄位不測。
  const hasSeoBlock = unit !== 'faq' && !(unit === 'term' && Number(detail.fields?.termType) === 4)
  const hasAiSummary = unit === 'concern' || unit === 'article'
  const seo = !hasSeoBlock ? null : {
    ...(detail.seo ?? { ogImage: null, canonicalOverride: null, noIndex: false, structuredDataOverride: null }),
    seoTitle: (detail.seo?.seoTitle ?? detail.title) + mark({ ...base, field: 'seo.seoTitle', label: '搜尋結果標題', path: '' }),
    metaDescription: (detail.seo?.metaDescription ?? '這一頁的搜尋結果摘要，測試用的一段文字，長度要夠。') + mark({ ...base, field: 'seo.metaDescription', label: '搜尋結果摘要', path: '' }),
    aiSummary: !hasAiSummary ? (detail.seo?.aiSummary ?? null)
      : (detail.seo?.aiSummary ?? '這是一段測試用的摘要文字，用來確認這個欄位在前台有沒有被輸出，長度需要介於二十到三百字之間。') + mark({ ...base, field: 'seo.aiSummary', label: 'AI 摘要', path: '' }),
  }
  const err = await putAndPublish(unit, detail.id, bodyOf(unit, detail, next, title), seo)
  if (err) writeErrors.push(`${def.label}/${detail.id}「${detail.title}」：${err}`)
  if (detail.urlPath) urls.add(detail.urlPath)
}
for (const [key, filled] of seenFilled) if (!filled) emptyEverywhere.push(key)

// ── 爬前台 ────────────────────────────────────────────────────────────

const stripPayload = (html) => html
  .replace(/<script[^>]*id="__NUXT_DATA__"[^>]*>[\s\S]*?<\/script>/g, '')
  .replace(/<script[^>]*>\s*window\.__NUXT__[\s\S]*?<\/script>/g, '')

// 第一輪頁面上的站內連結再跟一層（分類頁、標籤頁、關聯到的別筆內容）。
const pages = new Map()
async function fetchPage(path) {
  if (pages.has(path)) return
  try {
    const res = await fetch(WEB + path)
    pages.set(path, { status: res.status, html: stripPayload(await res.text()) })
  } catch (e) { pages.set(path, { status: 0, html: '' }) }
}
for (const u of urls) await fetchPage(u)
const second = new Set()
for (const { html } of pages.values()) {
  for (const m of html.matchAll(/href="(\/[a-z0-9\-/]*\/)"/g)) if (!pages.has(m[1])) second.add(m[1])
}
for (const u of [...second].slice(0, 400)) await fetchPage(u)
for (const u of ['/sitemap.xml', '/llms.txt', '/llms-full.txt', '/faq.json']) await fetchPage(u)

const foundOn = new Map()
for (const [path, { html }] of pages) {
  for (const m of html.matchAll(/〔Q(\d+)〕/g)) {
    const n = Number(m[1])
    if (!foundOn.has(n)) foundOn.set(n, new Set())
    foundOn.get(n).add(path)
  }
}

// ── 還原 ──────────────────────────────────────────────────────────────

console.log('\n── 還原 ──')
const restoreFailed = await restoreAll(backup)

// ── 報告 ──────────────────────────────────────────────────────────────

const MACHINE = new Set(['/sitemap.xml', '/llms.txt', '/llms-full.txt', '/faq.json'])
const byField = new Map()
for (const [n, meta] of markers) {
  const key = `${meta.unitLabel}｜${meta.label}`
  if (!byField.has(key)) byField.set(key, { total: 0, seen: 0, machineOnly: 0, expected: 0, why: '', missing: [] })
  const g = byField.get(key)
  g.total++
  const where = foundOn.get(n)
  if (where && [...where].some((p) => !MACHINE.has(p))) g.seen++
  else if (where) g.machineOnly++
  else if (expectedReason(meta)) { g.expected++; g.why = expectedReason(meta) }
  else g.missing.push(`${meta.title}${meta.path ? ` → ${meta.path}` : ''}${meta.wasEmpty ? '（原本是空的）' : ''}`)
}

console.log(`\n── 結果：${markers.size} 個記號、${pages.size} 個頁面 ──`)
const bad = []
const known = []
for (const [key, g] of byField) {
  if (g.expected) known.push(`${key}（${g.expected} 個）—— ${g.why}`)
  if (g.seen + g.expected === g.total) continue
  bad.push({ key, ...g })
}
const ok = [...byField].filter(([, g]) => g.seen === g.total).map(([k]) => k)
console.log(`\n✓ 改了前台有反應（${ok.length} 個欄位）：\n  ${ok.join('\n  ')}`)
console.log(`\n✗ 有記號沒出現在任何頁面（${bad.length} 個欄位）：`)
for (const b of bad) {
  console.log(`  ${b.key}：${b.seen}/${b.total} 出現${b.machineOnly ? `，另有 ${b.machineOnly} 個只出現在 sitemap／llms／faq.json` : ''}`)
  for (const m of b.missing.slice(0, 8)) console.log(`      ・${m}`)
  if (b.missing.length > 8) console.log(`      …還有 ${b.missing.length - 8} 個`)
}
if (known.length) console.log(`\n・已知不顯示（刻意，理由見 EXPECTED_HIDDEN）：\n  ${known.join('\n  ')}`)
if (emptyEverywhere.length) console.log(`\n? 挑到的資料全都沒有值，測不到：\n  ${emptyEverywhere.join('、')}`)
if (writeErrors.length) console.log(`\n🔴 寫入失敗：\n  ${writeErrors.join('\n  ')}`)
console.log(`\n（不是文字、這支腳本測不到）\n  ${[...new Set(notTested)].join('\n  ')}`)
const non200 = [...pages].filter(([, p]) => p.status !== 200).map(([u, p]) => `${u} ${p.status}`)
if (non200.length) console.log(`\n⚠️ 爬到非 200 的頁面：${non200.slice(0, 20).join('、')}`)

writeFileSync(REPORT, JSON.stringify({ bad, ok, emptyEverywhere, writeErrors, non200 }, null, 1))
console.log(`\n報告：${REPORT}`)
process.exit(restoreFailed || writeErrors.length || bad.length ? 1 : 0)
