// 困擾與案例的「舊固定版型區」→ 內文區塊（2026-11-11 改成單一編輯器時用）。
//
// 為什麼不寫 migration：那些舊欄位是巢狀 JSON 字串，在 T-SQL 裡轉形狀又脆又難驗；
// 而有內容的只有 1 筆困擾（acne）與 1 筆案例。所以改成**打開編輯畫面時**換算：
// `bodyBlocks` 還是空的、舊欄位有東西 → 編輯器預先帶入換算結果，使用者看過、存檔、發布，
// 那一筆就換成新內文。沒存檔之前資料庫一個位元組都沒變，前台照舊渲染舊的版型。
//
// ⚠️ 舊欄位**不清掉**（後台也不再送它們）：前台與 AiChunker 都是「bodyBlocks 有東西才用它」，
//    舊值留著，萬一要退回也還在。
//
// 形狀來源：`apps/web/app/data/concerns.ts` 的 toConcern、`cases.ts` 的 NarrativeDocument，
// 標題文字照前台舊版型上實際顯示的那幾個字。

type Json = Record<string, unknown>
type Block = Record<string, unknown>

function parse(value: unknown): Json | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Json
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const v = JSON.parse(value)
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null
  } catch {
    return null
  }
}

const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const strings = (v: unknown) => arr(v).map(s).filter(Boolean)

const h2 = (text: string): Block[] => (text ? [{ type: 'heading', level: 2, text }] : [])
const h3 = (text: string): Block[] => (text ? [{ type: 'heading', level: 3, text }] : [])
const p = (text: string): Block[] => (text ? [{ type: 'paragraph', text }] : [])
const list = (items: string[]): Block[] => (items.length ? [{ type: 'list', ordered: false, items }] : [])

/** content-image（`{blobPath,url,alt,width,height}`）→ figure 用的 src-size（多留 blobPath，理由見 structured-schema.ts）。 */
function figure(media: unknown): Block[] {
  const m = media as Json | null
  if (!m || typeof m.url !== 'string' || !m.url) return []
  return [{
    type: 'figure',
    image: { src: m.url, alt: m.alt ?? null, width: m.width ?? null, height: m.height ?? null, ...(m.blobPath ? { blobPath: m.blobPath } : {}) },
    caption: '',
  }]
}

export function concernLegacyBody(fields: Json): Block[] {
  const symptoms = parse(fields.symptoms)
  const causes = parse(fields.causes)
  const selfCheck = parse(fields.selfCheckGuide)
  const warn = parse(fields.whenToSeeDoctor)
  const out: Block[] = []

  if (symptoms) {
    out.push(...h2(s(symptoms.heading) || '症狀'), ...figure(symptoms.media), ...strings(symptoms.paragraphs).flatMap(p))
  }
  if (causes) {
    out.push(...h2(s(causes.heading) || '成因'), ...p(s(causes.intro)))
    const facts = arr(causes.facts).map((f) => f as Json).filter((f) => s(f?.label) || s(f?.text))
    if (facts.length) out.push({ type: 'table', headers: ['成因', '說明'], rows: facts.map((f) => [s(f.label), s(f.text)]) })
  }
  if (selfCheck) {
    out.push(...h2(s(selfCheck.heading) || '自我判斷'), ...p(s(selfCheck.intro)))
    for (const t of arr(selfCheck.types).map((x) => x as Json)) {
      out.push(...h3(s(t?.title)), ...list(strings(t?.points)))
      if (s(t?.direction)) out.push(...p(`照護方向：${s(t.direction)}`))
    }
  }
  if (warn) {
    const items = strings(warn.items)
    out.push(...h2(s(warn.heading) || '何時該就醫'), ...(items.length ? p('出現以下狀況，建議儘早就診：') : []), ...list(items))
  }
  return out
}

export function caseLegacyBody(fields: Json): Block[] {
  const n = parse(fields.narrative)
  if (!n) return []
  const out: Block[] = []
  for (const sec of arr(n.sections).map((x) => x as Json)) {
    out.push(...h2(s(sec?.heading)), ...strings(sec?.paragraphs).flatMap(p))
  }
  const timeline = arr(n.timeline).map((x) => x as Json)
  if (timeline.length) {
    out.push(...h2('實際的療程歷程'))
    for (const step of timeline) {
      out.push(...h3([s(step?.when), s(step?.title)].filter(Boolean).join('｜')), ...p(s(step?.text)))
    }
  }
  if (s(n.testimonial)) out.push(...h2('個案自述'), ...p(s(n.testimonial)))
  return out
}
