// 內文區塊（文章／困擾／案例的 `bodyBlocks`）⇄ 編輯器文件（TipTap／ProseMirror JSON）的換算。
//
// 為什麼要有這一層：後台改成「一個編輯器打到底」（Tim 指定 2026-11-11），
// 但**資料庫、前台、AI 語料、站內搜尋讀的仍然是原本的區塊陣列**
// （`apps/web/app/data/articles.ts` 的 `ArticleBodyBlock`）。編輯器只是另一種看法，
// 存進去的形狀一個鍵都沒有變 —— 所以前台不必改，`AiChunker` 也不必改。
//
// 🔴 **段落是純文字**（決策 17，Tim 2026-11-11 再確認一次「維持純文字」）。
//    編輯器裡沒有任何 mark（粗體、斜體、連結都沒有），貼上時帶進來的格式會被 schema 丟掉。
//
// 🔴 **schema 沒描述到的鍵一定要原樣保留**（560/1083 篇文章的段落帶著 `runs`）。
//    每個區塊的「其他鍵」存在節點的 `extra` 屬性上，換算回去時展開回來。
//    ⚠️ 唯一的例外是段落的 `runs`：它是舊站行內格式的**另一份文字**，
//    段落文字一被改過它就過期了（裡面還是舊的字）。所以「文字沒變才留，改過就丟」——
//    留著過期的 runs 比丟掉更糟：日後真的要渲染 runs 時，顯示的會是改之前的內容。
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
}

/** 每一種區塊「由編輯器負責」的鍵。其餘的鍵進 `extra`。 */
const DECLARED: Record<string, string[]> = {
  lead: ['text'],
  heading: ['level', 'text', 'id'],
  paragraph: ['text'],
  figure: ['image', 'caption', 'wide'],
  list: ['ordered', 'items'],
  table: ['headers', 'rows'],
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

/** ⚠️ ProseMirror 不收空字串的文字節點 —— 空段落要是「沒有 content」。 */
function inline(text: string): DocNode[] {
  return text ? [{ type: 'text', text }] : []
}

function para(text: string): DocNode {
  return { type: 'paragraph', content: inline(text) }
}

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
    case 'lead':
      return { type: 'lead', attrs: { extra }, content: inline(str(block.text)) }
    case 'heading':
      return {
        type: 'heading',
        attrs: { level: block.level === 2 ? 2 : 3, anchorId: typeof block.id === 'string' ? block.id : null, extra },
        content: inline(str(block.text)),
      }
    case 'paragraph':
      return { type: 'paragraph', attrs: { extra, origText: str(block.text) }, content: inline(str(block.text)) }
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
        content: (items.length ? items : ['']).map((t) => ({ type: 'listItem', content: [para(t)] })),
      }
    }
    case 'table': {
      const headers = Array.isArray(block.headers) ? block.headers.map(str) : []
      const rows = Array.isArray(block.rows) ? (block.rows as unknown[]).map((r) => (Array.isArray(r) ? r.map(str) : [])) : []
      const cell = (type: string) => (t: string): DocNode => ({ type, content: [para(t)] })
      const content: DocNode[] = []
      if (headers.length) content.push({ type: 'tableRow', content: headers.map(cell('tableHeader')) })
      for (const r of rows) content.push({ type: 'tableRow', content: (r.length ? r : ['']).map(cell('tableCell')) })
      // 一列都沒有的表格 ProseMirror 不收，給一格空的讓人看得到、刪得掉。
      if (!content.length) content.push({ type: 'tableRow', content: [cell('tableCell')('')] })
      return { type: 'table', attrs: { extra, hadHeaders: headers.length > 0 }, content }
    }
    case 'note':
      return { type: 'note', attrs: { variant: block.variant === 'warn' ? 'warn' : 'info', extra }, content: inline(str(block.text)) }
    default:
      // 不認得的區塊：整個原樣包起來，編輯器顯示成一塊不能改、但刪得掉的方塊。
      return { type: 'rawBlock', attrs: { raw: block } }
  }
}

// ── 文件 → 區塊 ────────────────────────────────────────────────────────

/** 一個節點底下的純文字。⚠️ 換行節點（hardBreak）沒有開放，所以不會出現。 */
function textOf(node: DocNode | undefined): string {
  if (!node) return ''
  if (node.type === 'text') return node.text ?? ''
  return (node.content ?? []).map(textOf).join('')
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
      const text = textOf(node)
      // 空段落＝使用者按了兩下 Enter。前台的空 <p> 只會多一段空白，丟掉。
      if (!text.trim()) return null
      const keep = { ...extra }
      if (text !== node.attrs?.origText) delete keep.runs
      return { type: 'paragraph', text, ...keep }
    }
    case 'lead': {
      const text = textOf(node)
      return text.trim() ? { type: 'lead', text, ...extra } : null
    }
    case 'heading': {
      const text = textOf(node)
      if (!text.trim()) return null
      const id = typeof node.attrs?.anchorId === 'string' ? node.attrs.anchorId.trim() : ''
      return { ...extra, type: 'heading', level: node.attrs?.level === 2 ? 2 : 3, text, ...(id ? { id } : {}) }
    }
    case 'note': {
      const text = textOf(node)
      return text.trim() ? { ...extra, type: 'note', variant: node.attrs?.variant === 'warn' ? 'warn' : 'info', text } : null
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
      const items = (node.content ?? []).map(textOf).filter((t) => t.trim())
      if (!items.length) return null
      return { ...extra, type: 'list', ordered: node.type === 'orderedList', items }
    }
    case 'table': {
      const rows = (node.content ?? []).filter((r) => r.type === 'tableRow')
      const first = rows[0]
      const firstIsHeader = !!first?.content?.length && first.content.every((c) => c.type === 'tableHeader')
      const headers = firstIsHeader ? first!.content!.map(textOf) : []
      const body = (firstIsHeader ? rows.slice(1) : rows).map((r) => (r.content ?? []).map(textOf))
      // ⚠️ 全空的表格**不丟**：正式資料裡就有一個（share-461），要刪請用工具列的「刪除表格」。
      return { ...extra, type: 'table', headers, rows: body }
    }
    case 'rawBlock':
      return (node.attrs?.raw as Block) ?? null
    default:
      return null
  }
}

