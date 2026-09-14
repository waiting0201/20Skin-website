#!/usr/bin/env node
// 舊站 HTML → 輕量 DOM 樹。
//
// ⚠️ **為什麼不裝 cheerio／parse5**：這是只跑幾次的遷移工具，而 `tools/content-export`
//    與 `functions/Common/ExportFormats.cs` 一路維持零相依。為了一次性搬遷把解析器
//    塞進 workspace 相依，之後沒人會記得移除。
//
// ⚠️ **舊站的 HTML 是壞的** —— 列表頁的 `<th>` 不閉合就 `</tr>`，內文有裸的 `<br>`、
//    `<p>` 裡套 `<div>`。所以這支解析器刻意寬容：遇到不該閉的自動補、閉到沒開的忽略，
//    不丟例外。**丟例外會讓一篇壞掉的文章擋住整批匯入。**


/**
 * HTML 實體解碼。
 * ⚠️ 只認舊站實際用得到的具名實體 —— 完整的 HTML5 具名實體有 2231 個，
 *    為了搬遷把整張表抄進來不划算。數值實體（&#123; / &#x7b;）則是全支援。
 */
const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
  ldquo: '\u201c', rdquo: '\u201d', lsquo: '\u2018', rsquo: '\u2019',
  hellip: '\u2026', mdash: '\u2014', ndash: '\u2013', middot: '\u00b7',
  deg: '\u00b0', times: '\u00d7', reg: '\u00ae', copy: '\u00a9', trade: '\u2122',
  laquo: '\u00ab', raquo: '\u00bb', bull: '\u2022', prime: '\u2032', Prime: '\u2033',
  szlig: '\u00df', eacute: '\u00e9', uuml: '\u00fc', auml: '\u00e4', ouml: '\u00f6',
}

function decodeHTML(s) {
  if (!s.includes('&')) return s
  return s.replace(/&(#x([0-9a-fA-F]+)|#(\d+)|([a-zA-Z][a-zA-Z0-9]*));/g, (full, _b, hex, dec, name) => {
    if (hex) return String.fromCodePoint(parseInt(hex, 16))
    if (dec) return String.fromCodePoint(Number(dec))
    return Object.hasOwn(NAMED, name) ? NAMED[name] : full
  })
}

/** 沒有結束標籤的元素。`</br>` 這種東西舊站真的有，一併當自閉。 */
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])
/** 內容不是 HTML，要整段跳過的元素。 */
const RAW = new Set(['script', 'style', 'svg', 'noscript'])
/** `<p>` 不能巢狀；遇到這些開始標籤時，尚未閉合的 `<p>` 自動關掉。 */
const CLOSES_P = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'table', 'blockquote', 'hr', 'figure', 'section', 'article', 'pre'])
/** 同名或同層自動關閉（`<li>` 開下一個就關上一個）。 */
const IMPLICIT_CLOSE = { li: ['li'], td: ['td', 'th'], th: ['td', 'th'], tr: ['tr', 'td', 'th'], dt: ['dt', 'dd'], dd: ['dt', 'dd'], option: ['option'] }

const TOKEN = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!\s*[^>]*>|<\/\s*([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s/>=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*\/?>/g
const ATTR = /([^\s/>=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g

function parseAttrs(raw) {
  const out = {}
  if (!raw) return out
  ATTR.lastIndex = 0
  let m
  while ((m = ATTR.exec(raw)) !== null) {
    out[m[1].toLowerCase()] = decodeHTML(m[2] ?? m[3] ?? m[4] ?? '')
  }
  return out
}

/**
 * 解析成 { tag, attrs, children } 的樹。文字節點是 { text }。
 * 回傳一個 tag 為 '#root' 的節點。
 */
export function parseHTML(html) {
  const root = { tag: '#root', attrs: {}, children: [] }
  const stack = [root]
  const top = () => stack[stack.length - 1]
  const push = (text) => { if (text) top().children.push({ text: decodeHTML(text) }) }

  let i = 0
  TOKEN.lastIndex = 0
  let m
  while ((m = TOKEN.exec(html)) !== null) {
    push(html.slice(i, m.index))
    i = TOKEN.lastIndex
    const [full, closeTag, openTag, attrRaw] = m

    if (closeTag) {
      const tag = closeTag.toLowerCase()
      if (VOID.has(tag)) continue // `</br>`：當作沒看見
      // 往回找最近的同名開始標籤。找不到就整個忽略 —— 不要為了對稱去關別人的標籤。
      const at = stack.findLastIndex((n) => n.tag === tag)
      if (at > 0) stack.length = at
      continue
    }

    if (!openTag) continue // 註解／DOCTYPE
    const tag = openTag.toLowerCase()

    if (RAW.has(tag)) {
      // 跳到對應的結束標籤為止。⚠️ 用 lastIndexOf 式的貪婪會吃掉後面的內容，這裡只找最近的一個。
      const end = html.toLowerCase().indexOf(`</${tag}`, i)
      i = end === -1 ? html.length : html.indexOf('>', end) + 1
      TOKEN.lastIndex = i
      continue
    }

    if (tag === 'p' || CLOSES_P.has(tag)) {
      const at = stack.findLastIndex((n) => n.tag === 'p')
      if (at > 0) stack.length = at
    }
    const siblings = IMPLICIT_CLOSE[tag]
    if (siblings) {
      const at = stack.findLastIndex((n) => siblings.includes(n.tag))
      if (at > 0) stack.length = at
    }

    const node = { tag, attrs: parseAttrs(attrRaw), children: [] }
    top().children.push(node)
    if (!VOID.has(tag) && !full.endsWith('/>')) stack.push(node)
  }
  push(html.slice(i))
  return root
}

/** 節點底下所有文字，標籤全部剝掉。 */
export function textOf(node) {
  if (node.text !== undefined) return node.text
  return (node.children ?? []).map(textOf).join('')
}

/** 深度優先走訪，含自己。 */
export function* walk(node) {
  yield node
  for (const c of node.children ?? []) yield* walk(c)
}

export function hasClass(node, name) {
  return (node.attrs?.class ?? '').split(/\s+/).includes(name)
}
