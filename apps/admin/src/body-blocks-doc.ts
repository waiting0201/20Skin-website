// 內文區塊（文章／困擾／案例的 `bodyBlocks`）⇄ 編輯器文件（TipTap／ProseMirror JSON）的換算。
//
// 為什麼要有這一層：後台改成「一個編輯器打到底」（Tim 指定 2026-11-11），
// 但**資料庫、前台、AI 語料、站內搜尋讀的仍然是原本的區塊陣列**
// （`apps/web/app/data/articles.ts` 的 `ArticleBodyBlock`）。編輯器只是另一種看法，
// 存進去的形狀一個鍵都沒有變 —— 所以前台不必改，`AiChunker` 也不必改。
//
// 🔴 **行內格式＝`runs`**（Tim 定案 2026-11-18，翻掉決策 17／32 的「內文純文字」）：
//    粗體、斜體、連結、文字顏色。`text` 仍然是整段的純文字（搜尋、AI 語料、摘要都讀它），
//    `runs` 是同一段文字切成帶格式的片段（`{ text, href?, bold?, italic?, color? }[]`），
//    **只在真的有格式時才出現**。前台 `components/InlineText.ts` 照它渲染。
//    掛 runs 的位置：段落／前言／提示框的 `runs`、清單的 `itemRuns`、表格的 `headerRuns`／`rowRuns`。
//    標題沒有行內格式（樣式由前台統一決定）。
//
// 🔴 **舊站匯入的 runs 不保證規整**（5725 段裡 392 段的 runs 前後多了空白、1676 處相鄰片段格式相同），
//    所以載入時先對齊成規整的形狀（`alignRuns`），並記下它的指紋（`origSig`）。
//    **文字與格式都沒動的段落原樣送回原本的 runs**，一個字元都不改 —— 否則每打開一篇
//    就等於把整篇的 runs 重寫一次（editor-check.mjs 用正式資料驗）。動過的段落才換成規整的新 runs。
//    對不齊的舊 runs（極少數）當作沒有格式顯示；沒動就原樣保留，動了就以編輯器裡的為準。
//
// 🔴 **schema 沒描述到的鍵一定要原樣保留**。
//    每個區塊的「其他鍵」存在節點的 `extra` 屬性上，換算回去時展開回來。
//
// ⚠️ 這個檔案**只放純函式、不 import 任何 TipTap 或 Vue** —— 要能被 Node 直接跑
//    （`tools/content-roundtrip/check.mjs` 用正式資料整批驗「進編輯器再出來不變」）。

export type Block = Record<string, unknown> & { type?: unknown }

/** ProseMirror JSON（`editor.getJSON()` 的形狀）。 */
export interface DocNode {
  type: string
  attrs?: Record<string, unknown>
  content?: DocNode[]
  text?: string
  marks?: { type: string, attrs?: Record<string, unknown> }[]
}

/** 每一種區塊「由編輯器負責」的鍵。其餘的鍵進 `extra`。 */
const DECLARED: Record<string, string[]> = {
  // ⚠️ 段落／前言／提示框的 `runs` 刻意不宣告：它留在 extra 裡，沒動過的段落才能原樣送回（textBlockOut）。
  lead: ['text'],
  heading: ['level', 'text', 'id'],
  paragraph: ['text'],
  figure: ['image', 'caption', 'wide'],
  list: ['ordered', 'items', 'itemRuns'],
  table: ['headers', 'rows', 'headerRuns', 'rowRuns'],
  note: ['variant', 'text'],
}

function extraOf(block: Block): Record<string, unknown> | null {
  const declared = DECLARED[String(block.type)] ?? []
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(block)) {
    if (k === 'type' || declared.includes(k)) continue
    out[k] = v
  }
  return Object.keys(out).length ? out : null
}

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))

// ── 行內格式（runs）─────────────────────────────────────────────────────

export interface Run {
  text: string
  href?: string
  bold?: true
  italic?: true
  color?: string
}
type Fmt = Omit<Run, 'text'>

/**
 * 顏色一律存成小寫 `#rrggbb`。貼上時帶進來的 `rgb(…)`、`#abc` 換算過來，其他（`red`、變數、透明度）丟掉。
 * ⚠️ 前台 `utils/inlineRuns.ts` 有同一條白名單 —— 改一邊要改另一邊。
 */
export function normalizeColor(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(s)) return s
  if (/^#[0-9a-f]{3}$/.test(s)) return '#' + [...s.slice(1)].map((c) => c + c).join('')
  const m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(1|1\.0+)\s*)?\)$/.exec(s)
  if (m) {
    const parts = m.slice(1, 4).map(Number)
    if (parts.every((n) => n <= 255)) return '#' + parts.map((n) => n.toString(16).padStart(2, '0')).join('')
  }
  return null
}

/**
 * 連結只收 `http(s)://`、站內路徑（`/…`）、錨點（`#…`）、`mailto:`、`tel:`。
 * 🔴 這是擋 `javascript:` 的那一道（前台另有一道，兩邊都要有）。
 */
export function normalizeHref(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s || /\s/.test(s)) return null
  if (/^https?:\/\/[^/]/i.test(s)) return s
  if (/^\/(?!\/)/.test(s) || s.startsWith('#')) return s
  if (/^(mailto|tel):./i.test(s)) return s
  return null
}

function fmtOf(r: Record<string, unknown>): Fmt {
  const f: Fmt = {}
  const href = normalizeHref(r.href)
  if (href) f.href = href
  if (r.bold === true) f.bold = true
  if (r.italic === true) f.italic = true
  const color = normalizeColor(r.color)
  if (color) f.color = color
  return f
}

const fmtKey = (f: Fmt) => JSON.stringify([f.href ?? null, !!f.bold, !!f.italic, f.color ?? null])
const hasFmt = (r: Run) => !!(r.href || r.bold || r.italic || r.color)

/** 逐字元的格式 → 規整的 runs（相鄰同格式合併、沒有空片段）。 */
function mergeRuns(pieces: { text: string, fmt: Fmt }[]): Run[] {
  const out: Run[] = []
  let lastKey = ''
  for (const p of pieces) {
    if (!p.text) continue
    const key = fmtKey(p.fmt)
    if (out.length && key === lastKey) out[out.length - 1]!.text += p.text
    else out.push({ text: p.text, ...p.fmt })
    lastKey = key
  }
  return out
}

/**
 * 把 runs 對齊到 `text` 上。舊站匯入的 `text` 是 runs 接起來再「空白壓成一格、去頭尾」的結果，
 * 所以 runs 裡多出來的空白要跳過。對不齊（文字本身不同）回 null。
 */
export function alignRuns(runs: unknown, text: string): Run[] | null {
  if (!Array.isArray(runs) || !runs.length) return null
  const fmts: Fmt[] = new Array(text.length)
  let p = 0
  for (const r of runs) {
    if (!r || typeof r !== 'object' || typeof (r as Run).text !== 'string') return null
    const f = fmtOf(r as Record<string, unknown>)
    const t = (r as Run).text
    for (let i = 0; i < t.length; i++) {
      const c = t[i]!
      if (p < text.length && (c === text[p] || (/\s/.test(c) && text[p] === ' '))) { fmts[p++] = f; continue }
      if (/\s/.test(c)) continue
      return null
    }
  }
  if (p !== text.length) return null
  const pieces: { text: string, fmt: Fmt }[] = []
  for (let i = 0; i < text.length; i++) pieces.push({ text: text[i]!, fmt: fmts[i]! })
  return mergeRuns(pieces)
}

/** 有格式才算數；全是純文字的 runs 等於沒有。 */
const sigOf = (runs: Run[] | null) => (runs && runs.some(hasFmt) ? JSON.stringify(runs) : '')

function marksOf(r: Run): DocNode['marks'] {
  const marks: NonNullable<DocNode['marks']> = []
  if (r.bold) marks.push({ type: 'bold' })
  if (r.italic) marks.push({ type: 'italic' })
  if (r.href) marks.push({ type: 'link', attrs: { href: r.href } })
  if (r.color) marks.push({ type: 'textStyle', attrs: { color: r.color } })
  return marks.length ? marks : undefined
}

/** ⚠️ ProseMirror 不收空字串的文字節點 —— 空段落要是「沒有 content」。 */
function inline(text: string, runs: Run[] | null = null): DocNode[] {
  if (!text) return []
  if (!runs || !runs.some(hasFmt)) return [{ type: 'text', text }]
  return runs.filter((r) => r.text).map((r) => {
    const marks = marksOf(r)
    return marks ? { type: 'text', text: r.text, marks } : { type: 'text', text: r.text }
  })
}

function para(text: string, runs: Run[] | null = null): DocNode {
  return { type: 'paragraph', content: inline(text, runs) }
}

/** 一個節點底下的文字與格式。 */
function inlineOf(node: DocNode | undefined): { text: string, runs: Run[] } {
  const pieces: { text: string, fmt: Fmt }[] = []
  const walk = (n: DocNode | undefined) => {
    if (!n) return
    if (n.type === 'text') {
      const f: Record<string, unknown> = {}
      for (const m of n.marks ?? []) {
        if (m.type === 'bold') f.bold = true
        else if (m.type === 'italic') f.italic = true
        else if (m.type === 'link') f.href = m.attrs?.href
        else if (m.type === 'textStyle') f.color = m.attrs?.color
      }
      pieces.push({ text: n.text ?? '', fmt: fmtOf(f) })
      return
    }
    for (const c of n.content ?? []) walk(c)
  }
  walk(node)
  const runs = mergeRuns(pieces)
  return { text: runs.map((r) => r.text).join(''), runs }
}

/** 段落／前言／提示框：載入時的內容與「原本長怎樣」的記號。 */
function textBlockIn(block: Block) {
  const text = str(block.text)
  const runs = alignRuns(block.runs, text)
  return { content: inline(text, runs), origText: text, origSig: sigOf(runs) }
}

/**
 * 段落／前言／提示框：換算回去。文字與格式都沒動 → 原本的 runs 原樣留著（在 extra 裡）；
 * 動過 → 換成編輯器裡的。
 */
function textBlockOut(node: DocNode, extra: Record<string, unknown>) {
  const { text, runs } = inlineOf(node)
  const sig = sigOf(runs)
  if (text === node.attrs?.origText && sig === (node.attrs?.origSig ?? '')) return { text, rest: extra }
  const rest = { ...extra }
  delete rest.runs
  if (sig) rest.runs = runs
  return { text, rest }
}

/** 清單項目、儲存格這種「一格一個字串」的：對應的 runs 陣列（沒有格式的位置是 null）。 */
const runsAt = (arr: unknown, i: number, text: string) => (Array.isArray(arr) ? alignRuns(arr[i], text) : null)

// ── 區塊 → 文件 ────────────────────────────────────────────────────────

export function blocksToDoc(blocks: unknown): DocNode {
  const list = Array.isArray(blocks) ? (blocks as Block[]) : []
  const content = list.map(blockToNode)
  // ⚠️ 空文件也要有一個段落，否則游標沒有地方可以放。換算回去時空段落會被丟掉。
  return { type: 'doc', content: content.length ? content : [para('')] }
}

function blockToNode(block: Block): DocNode {
  if (block === null || typeof block !== 'object') return { type: 'rawBlock', attrs: { raw: block } }
  const extra = extraOf(block)
  switch (block.type) {
    case 'lead': {
      const t = textBlockIn(block)
      return { type: 'lead', attrs: { extra, origText: t.origText, origSig: t.origSig }, content: t.content }
    }
    case 'heading':
      return {
        type: 'heading',
        attrs: { level: block.level === 2 ? 2 : 3, anchorId: typeof block.id === 'string' ? block.id : null, extra },
        content: inline(str(block.text)),
      }
    case 'paragraph': {
      const t = textBlockIn(block)
      return { type: 'paragraph', attrs: { extra, origText: t.origText, origSig: t.origSig }, content: t.content }
    }
    case 'figure':
      return {
        type: 'figure',
        attrs: {
          image: block.image ?? null,
          caption: typeof block.caption === 'string' ? block.caption : null,
          // null ＝ 原本沒有這個鍵（舊資料多半沒有）。換算回去時不要憑空補一個 false。
          wide: typeof block.wide === 'boolean' ? block.wide : null,
          extra,
        },
      }
    case 'list': {
      const items = Array.isArray(block.items) ? block.items.map(str) : []
      return {
        type: block.ordered ? 'orderedList' : 'bulletList',
        attrs: { extra },
        content: (items.length ? items : ['']).map((t, i) => ({ type: 'listItem', content: [para(t, runsAt(block.itemRuns, i, t))] })),
      }
    }
    case 'table': {
      const headers = Array.isArray(block.headers) ? block.headers.map(str) : []
      const rows = Array.isArray(block.rows) ? (block.rows as unknown[]).map((r) => (Array.isArray(r) ? r.map(str) : [])) : []
      const rowRuns = Array.isArray(block.rowRuns) ? block.rowRuns : []
      const cell = (type: string, runs: unknown) => (t: string, i: number): DocNode => ({ type, content: [para(t, runsAt(runs, i, t))] })
      const content: DocNode[] = []
      if (headers.length) content.push({ type: 'tableRow', content: headers.map(cell('tableHeader', block.headerRuns)) })
      rows.forEach((r, ri) => content.push({ type: 'tableRow', content: (r.length ? r : ['']).map(cell('tableCell', rowRuns[ri])) }))
      // 一列都沒有的表格 ProseMirror 不收，給一格空的讓人看得到、刪得掉。
      if (!content.length) content.push({ type: 'tableRow', content: [cell('tableCell', null)('', 0)] })
      return { type: 'table', attrs: { extra, hadHeaders: headers.length > 0 }, content }
    }
    case 'note': {
      const t = textBlockIn(block)
      return { type: 'note', attrs: { variant: block.variant === 'warn' ? 'warn' : 'info', extra, origText: t.origText, origSig: t.origSig }, content: t.content }
    }
    default:
      // 不認得的區塊：整個原樣包起來，編輯器顯示成一塊不能改、但刪得掉的方塊。
      return { type: 'rawBlock', attrs: { raw: block } }
  }
}

// ── 文件 → 區塊 ────────────────────────────────────────────────────────

/** 一排格子的 runs：任何一格有格式才輸出，沒有格式的格子是 null。 */
function runsField(cells: { runs: Run[] }[]): (Run[] | null)[] | null {
  const each = cells.map((c) => (c.runs.some(hasFmt) ? c.runs : null))
  return each.some(Boolean) ? each : null
}

const extraAttr = (node: DocNode) => (node.attrs?.extra as Record<string, unknown> | null | undefined) ?? null

export function docToBlocks(doc: DocNode): Block[] {
  const out: Block[] = []
  for (const node of doc.content ?? []) {
    const block = nodeToBlock(node)
    if (block) out.push(block)
  }
  return out
}

function nodeToBlock(node: DocNode): Block | null {
  const extra = extraAttr(node) ?? {}
  switch (node.type) {
    case 'paragraph': {
      const { text, rest } = textBlockOut(node, extra)
      // 空段落＝使用者按了兩下 Enter。前台的空 <p> 只會多一段空白，丟掉。
      if (!text.trim()) return null
      return { type: 'paragraph', text, ...rest }
    }
    case 'lead': {
      const { text, rest } = textBlockOut(node, extra)
      return text.trim() ? { type: 'lead', text, ...rest } : null
    }
    case 'heading': {
      const text = inlineOf(node).text
      if (!text.trim()) return null
      const id = typeof node.attrs?.anchorId === 'string' ? node.attrs.anchorId.trim() : ''
      return { ...extra, type: 'heading', level: node.attrs?.level === 2 ? 2 : 3, text, ...(id ? { id } : {}) }
    }
    case 'note': {
      const { text, rest } = textBlockOut(node, extra)
      return text.trim() ? { ...rest, type: 'note', variant: node.attrs?.variant === 'warn' ? 'warn' : 'info', text } : null
    }
    case 'figure': {
      const a = node.attrs ?? {}
      // ⚠️ 沒有圖的圖片區塊**不丟掉**：讓驗證擋下來（「請選擇圖片」），
      //    使用者才知道自己插了一個空框。默默丟掉會讓人以為存進去了。
      return {
        ...extra,
        type: 'figure',
        image: a.image ?? null,
        caption: typeof a.caption === 'string' ? a.caption : '',
        ...(typeof a.wide === 'boolean' ? { wide: a.wide } : {}),
      }
    }
    case 'bulletList':
    case 'orderedList': {
      const cells = (node.content ?? []).map(inlineOf).filter((c) => c.text.trim())
      if (!cells.length) return null
      const itemRuns = runsField(cells)
      return { ...extra, type: 'list', ordered: node.type === 'orderedList', items: cells.map((c) => c.text), ...(itemRuns ? { itemRuns } : {}) }
    }
    case 'table': {
      const rows = (node.content ?? []).filter((r) => r.type === 'tableRow')
      const first = rows[0]
      const firstIsHeader = !!first?.content?.length && first.content.every((c) => c.type === 'tableHeader')
      const headerCells = firstIsHeader ? first!.content!.map(inlineOf) : []
      const bodyCells = (firstIsHeader ? rows.slice(1) : rows).map((r) => (r.content ?? []).map(inlineOf))
      const headerRuns = runsField(headerCells)
      const rowRunsEach = bodyCells.map(runsField)
      const rowRuns = rowRunsEach.some(Boolean) ? rowRunsEach.map((r, i) => r ?? bodyCells[i]!.map(() => null)) : null
      // ⚠️ 全空的表格**不丟**：正式資料裡就有一個（share-461），要刪請用工具列的「刪除表格」。
      return {
        ...extra,
        type: 'table',
        headers: headerCells.map((c) => c.text),
        rows: bodyCells.map((r) => r.map((c) => c.text)),
        ...(headerRuns ? { headerRuns } : {}),
        ...(rowRuns ? { rowRuns } : {}),
      }
    }
    case 'rawBlock':
      return (node.attrs?.raw as Block) ?? null
    default:
      return null
  }
}

