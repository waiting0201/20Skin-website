#!/usr/bin/env node
// 舊站 HTML → apps/web 的 ArticleBodyBlock[]（型別見 apps/web/app/data/articles.ts:102）。
//
// ⚠️ **前台用 `{{ }}` 逸出渲染，區塊模型沒有行內格式** —— 連結與粗體在畫面上會不見。
//    所以這裡在每個文字區塊上**多存一份 `runs`**（`{ text, href?, bold? }[]`）：
//    前台現在讀 `text` 不受影響（多的欄位會被忽略），日後若決定支援行內連結，
//    資料已經在庫裡，**不必為了這件事再對舊站抓一次 1100 篇**。
//    `bodyBlocks` 在 API 是原樣存 JSON、沒有結構驗證（ContentHandler.cs:1712），多帶欄位是安全的。
//
// ⚠️ **`<br>` 會被拆成獨立段落。** 區塊模型沒有換行，而舊站靠 `<br>` 排版；
//    併成一段會讓原本分行的文案黏成一大坨。

import { parseHTML, textOf, hasClass } from './html.mjs'

const HEADINGS = { h1: 2, h2: 2, h3: 3, h4: 3, h5: 3, h6: 3 }
const INLINE = new Set(['a', 'b', 'strong', 'em', 'i', 'u', 'span', 'font', 'sup', 'sub', 'small', 'mark', 'code', 'label', 'abbr', 'time', 'br'])
const BOLD_TAGS = new Set(['b', 'strong'])

const collapse = (s) => s.replace(/[ \s]+/g, ' ').trim()

/**
 * 把一棵子樹攤成行內 run 陣列，`<br>` 用 null 當分隔。
 * ⚠️ WordPress 的「經典編輯器轉區塊」會把整段包成 `<span style="font-weight: 400">`，
 *    那是「正常粗細」不是粗體 —— 照字面認 span 會讓整篇文章都變粗體。
 */
function inlineRuns(node, inherited = {}) {
  const out = []
  for (const c of node.children ?? []) {
    if (c.text !== undefined) { out.push({ ...inherited, text: c.text }); continue }
    if (c.tag === 'br') { out.push(null); continue }
    if (c.tag === 'img') { out.push({ img: c }); continue }
    const next = { ...inherited }
    if (BOLD_TAGS.has(c.tag)) next.bold = true
    if (c.tag === 'span' && /font-weight:\s*(400|normal)/i.test(c.attrs.style ?? '')) delete next.bold
    if (c.tag === 'a' && c.attrs.href) next.href = c.attrs.href
    out.push(...inlineRuns(c, next))
  }
  return out
}

/** run 陣列 → 以 `<br>` 切開的若干行，每行去掉空白 run。 */
function runLines(runs) {
  const lines = [[]]
  for (const r of runs) {
    if (r === null) lines.push([])
    else lines[lines.length - 1].push(r)
  }
  return lines
    .map((line) => {
      const imgs = line.filter((r) => r.img).map((r) => r.img)
      const cleaned = []
      for (const r of line) {
        if (r.img) continue
        const text = r.text.replace(/[ \s]+/g, ' ')
        if (!text.trim() && !cleaned.length) continue
        cleaned.push({ ...r, text })
      }
      // 尾端空白 run 沒有意義，砍掉才不會讓 text 帶著尾巴空格
      while (cleaned.length && !cleaned.at(-1).text.trim()) cleaned.pop()
      return { runs: cleaned, imgs }
    })
    .filter((l) => l.runs.length || l.imgs.length)
}

const runsText = (runs) => collapse(runs.map((r) => r.text).join(''))
/** 只有純文字、沒有連結也沒有粗體時，`runs` 不會比 `text` 多帶資訊 —— 省掉它。 */
const keepRuns = (runs) => (runs.some((r) => r.href || r.bold) ? runs.map((r) => ({ text: r.text, ...(r.href ? { href: r.href } : {}), ...(r.bold ? { bold: true } : {}) })) : undefined)

/**
 * WordPress 的 `src` 常常是 1024px 的縮圖版，原圖在 `srcset` 裡（實測 3094/3596 張有 srcset）。
 * ⚠️ **不能靠檔名的 `-1024x683` 去反推原圖** —— 真的有檔案本來就叫 `slide2-1024x575-1.png`。
 * 取「≥ 1600w 之中最小的那個」：內文欄寬約 800px，1600 剛好夠 Retina，
 * 再往上抓 2048 只是多存一倍空間換看不出來的差別。都不到 1600 就取最大的。
 */
function largestSrc(node) {
  const src = node.attrs.src ?? ''
  const srcset = node.attrs.srcset ?? ''
  if (!srcset) return src
  const cands = srcset.split(',')
    .map((c) => c.trim().split(/\s+/))
    .filter((c) => c.length === 2 && c[1].endsWith('w'))
    .map(([url, w]) => ({ url, w: Number.parseInt(w, 10) }))
    .filter((c) => Number.isFinite(c.w))
  if (!cands.length) return src
  const big = cands.filter((c) => c.w >= 1600).sort((a, b) => a.w - b.w)[0]
  return (big ?? cands.sort((a, b) => b.w - a.w)[0]).url
}

function imageOf(node) {
  const src = largestSrc(node)
  if (!src) return null
  // ⚠️ 換了更大的來源之後，`width`/`height` 屬性描述的是原本那張縮圖 —— 不能再用。
  //    留 null，交給 fetch-images.mjs 從真正的檔案讀出來。
  const swapped = src !== (node.attrs.src ?? '')
  const w = swapped ? NaN : Number.parseInt(node.attrs.width ?? '', 10)
  const h = swapped ? NaN : Number.parseInt(node.attrs.height ?? '', 10)
  return {
    src,
    alt: collapse(node.attrs.alt ?? ''),
    // ⚠️ 舊站常寫 `width="100%"`，parseInt 會得到 100 —— 那是百分比不是像素。
    width: Number.isFinite(w) && !String(node.attrs.width).includes('%') ? w : null,
    height: Number.isFinite(h) && !String(node.attrs.height).includes('%') ? h : null,
  }
}

/**
 * @param {string} html
 * @param {(node) => boolean} [drop]  回傳 true 的節點（含其子樹）整個丟掉，用來剝樣板
 */
export function htmlToBlocks(html, drop = () => false) {
  const blocks = []
  const pushText = (line) => {
    for (const img of line.imgs) {
      const image = imageOf(img)
      if (image) blocks.push({ type: 'figure', image, caption: '' })
    }
    const text = runsText(line.runs)
    if (!text) return
    const runs = keepRuns(line.runs)
    blocks.push({ type: 'paragraph', text, ...(runs ? { runs } : {}) })
  }

  const visit = (node) => {
    for (const c of node.children ?? []) {
      if (c.text !== undefined) {
        const text = collapse(c.text)
        if (text) blocks.push({ type: 'paragraph', text })
        continue
      }
      if (drop(c)) continue

      if (HEADINGS[c.tag]) {
        const runs = inlineRuns(c).filter(Boolean).filter((r) => !r.img)
        const text = runsText(runs)
        if (text) blocks.push({ type: 'heading', level: HEADINGS[c.tag], text, ...(c.attrs.id ? { id: c.attrs.id } : {}) })
        continue
      }

      if (c.tag === 'img') {
        const image = imageOf(c)
        if (image) blocks.push({ type: 'figure', image, caption: '' })
        continue
      }

      if (c.tag === 'figure') {
        const img = [...(function* f(n) { for (const k of n.children ?? []) { if (k.tag === 'img') yield k; else if (k.children) yield* f(k) } })(c)][0]
        const cap = (c.children ?? []).find((k) => k.tag === 'figcaption')
        const image = img ? imageOf(img) : null
        if (image) blocks.push({ type: 'figure', image, caption: cap ? collapse(textOf(cap)) : '' })
        continue
      }

      if (c.tag === 'ul' || c.tag === 'ol') {
        const items = (c.children ?? [])
          .filter((k) => k.tag === 'li')
          .map((li) => collapse(textOf(li)))
          .filter(Boolean)
        if (items.length) blocks.push({ type: 'list', ordered: c.tag === 'ol', items })
        continue
      }

      if (c.tag === 'table') {
        const rows = [...(function* f(n) { for (const k of n.children ?? []) { if (k.tag === 'tr') yield k; else if (k.children) yield* f(k) } })(c)]
          .map((tr) => (tr.children ?? []).filter((k) => k.tag === 'td' || k.tag === 'th').map((td) => collapse(textOf(td))))
          .filter((r) => r.length)
        if (rows.length) {
          // 第一列全是 <th> 才當表頭；否則補一列空表頭，免得前台的 thead 少一欄對不齊
          const firstTr = [...(function* f(n) { for (const k of n.children ?? []) { if (k.tag === 'tr') yield k; else if (k.children) yield* f(k) } })(c)][0]
          const isHeader = (firstTr.children ?? []).filter((k) => k.tag === 'td' || k.tag === 'th').every((k) => k.tag === 'th')
          const headers = isHeader ? rows[0] : rows[0].map(() => '')
          blocks.push({ type: 'table', headers, rows: isHeader ? rows.slice(1) : rows })
        }
        continue
      }

      if (c.tag === 'blockquote') {
        const text = collapse(textOf(c))
        if (text) blocks.push({ type: 'note', variant: 'info', text })
        continue
      }

      if (c.tag === 'hr' || c.tag === 'iframe' || c.tag === 'nav') continue

      // 純行內內容的容器（p／span／b……）就地產段落；帶有區塊子元素的容器往下走。
      const hasBlockChild = (c.children ?? []).some((k) => k.tag && !INLINE.has(k.tag) && k.tag !== 'img')
      if (!hasBlockChild) {
        for (const line of runLines(inlineRuns(c))) pushText(line)
      } else {
        visit(c)
      }
    }
  }

  visit(parseHTML(html))

  // 相鄰的重複段落（舊站常見的貼上兩次）與只剩標點的段落清掉
  return blocks.filter((b, i) => {
    if (b.type !== 'paragraph') return true
    if (/^[.。・\s·-]*$/.test(b.text)) return false
    const prev = blocks[i - 1]
    return !(prev && prev.type === 'paragraph' && prev.text === b.text)
  })
}

export { hasClass }
