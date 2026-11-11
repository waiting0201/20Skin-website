// 內文編輯器的 TipTap schema。對應 `body-blocks-doc.ts` 的換算 —— **兩邊的節點名稱要一致**。
//
// 🔴 **只開放前台渲染得出來的東西**（`apps/web/app/components/BodyBlocks.vue`）：
//    前言、H2／H3、段落、圖片、項目／編號清單、表格、提示框。
//    沒有 mark（粗體、斜體、連結，決策 17）、沒有 H1／H4、沒有引言區塊、程式碼區塊、
//    分隔線、行內換行 —— 開了就是「編輯器裡看得到、前台什麼都沒有」。
//
// ⚠️ 這支**不 import 任何 .vue**：圖片的 NodeView 由呼叫端注入（`figureView`），
//    這樣 `tools/content-roundtrip` 才能在 Node 裡拿同一份 schema 驗換算。

import { Node, Extension, mergeAttributes, type AnyExtension } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import Text from '@tiptap/extension-text'
import Paragraph from '@tiptap/extension-paragraph'
import Heading from '@tiptap/extension-heading'
import BulletList from '@tiptap/extension-bullet-list'
import OrderedList from '@tiptap/extension-ordered-list'
import ListItem from '@tiptap/extension-list-item'
import History from '@tiptap/extension-history'
import Dropcursor from '@tiptap/extension-dropcursor'
import Gapcursor from '@tiptap/extension-gapcursor'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import Placeholder from '@tiptap/extension-placeholder'

/**
 * 換算時用來放「這個區塊的其他鍵」與「原始文字」的屬性。
 *
 * 🔴 `keepOnSplit: false` 不可省：在段落中間按 Enter，ProseMirror 會把屬性複製到
 *    新的那一段 —— 少了它，同一份 `runs` 會出現在兩個段落上。
 * ⚠️ `rendered: false`：這些屬性只活在記憶體裡，不輸出到 DOM（`extra` 可能很大）。
 */
const hidden = (def: unknown = null) => ({ default: def, rendered: false, keepOnSplit: false })

const BlockMeta = Extension.create({
  name: 'blockMeta',
  addGlobalAttributes() {
    return [
      { types: ['paragraph', 'heading', 'bulletList', 'orderedList', 'table'], attributes: { extra: hidden() } },
      { types: ['paragraph'], attributes: { origText: hidden() } },
      { types: ['table'], attributes: { hadHeaders: hidden(false) } },
    ]
  },
})

/** 前言：文章最上面那一段大字（前台 `.article-lead`）。 */
export const Lead = Node.create({
  name: 'lead',
  group: 'block',
  content: 'text*',
  defining: true,
  addAttributes() {
    return { extra: hidden() }
  },
  parseHTML() {
    return [{ tag: 'p.article-lead', priority: 60 }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['p', mergeAttributes(HTMLAttributes, { class: 'adm-rte__lead' }), 0]
  },
})

/** 提示框（前台 `.c-note`），兩種樣式：說明／注意。 */
export const Note = Node.create({
  name: 'note',
  group: 'block',
  content: 'text*',
  defining: true,
  addAttributes() {
    return {
      variant: { default: 'info', keepOnSplit: true, renderHTML: (a) => ({ 'data-variant': a.variant }) },
      extra: hidden(),
    }
  },
  parseHTML() {
    return [{ tag: 'div[data-note]', getAttrs: (el) => ({ variant: (el as HTMLElement).dataset.variant === 'warn' ? 'warn' : 'info' }) }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-note': '', class: 'adm-rte__note' }), 0]
  },
})

/**
 * 圖片（前台 `<figure class="article-figure">`）。一整塊、不能在裡面打字的原子節點，
 * 圖、圖說、滿版寬度都在 NodeView 裡改。
 *
 * ⚠️ **不寫 parseHTML**：從別的網站貼進來的 `<img>` 是外部網址，不在 Blob 上
 *    （沒有衍生尺寸＝前台 srcset 全部破圖，決策 9）。要放圖只能用工具列的「插入圖片」上傳。
 */
export function createFigure(figureView?: unknown) {
  return Node.create({
    name: 'figure',
    group: 'block',
    atom: true,
    draggable: true,
    selectable: true,
    addAttributes() {
      return {
        image: { default: null, rendered: false },
        caption: { default: '', rendered: false },
        wide: { default: null, rendered: false },
        extra: hidden(),
      }
    },
    renderHTML() {
      return ['figure', { class: 'adm-rte__figure' }]
    },
    ...(figureView ? { addNodeView: () => figureView as never } : {}),
  })
}

/** 編輯器顯示不了的區塊：原樣保留、可以刪。 */
export function createRawBlock(rawView?: unknown) {
  return Node.create({
    name: 'rawBlock',
    group: 'block',
    atom: true,
    selectable: true,
    addAttributes() {
      return { raw: { default: null, rendered: false } }
    },
    renderHTML() {
      return ['div', { class: 'adm-rte__raw' }, '（這個區塊無法在編輯器中顯示，儲存時會原樣保留）']
    },
    ...(rawView ? { addNodeView: () => rawView as never } : {}),
  })
}

export interface BodyEditorOptions {
  figureView?: unknown
  placeholder?: string
}

export function createBodyExtensions(options: BodyEditorOptions = {}): AnyExtension[] {
  return [
    Document,
    Text,
    Paragraph,
    // ⚠️ 只有 2／3：前台只渲染 H2（會進文章目錄）與 H3，H1 是頁面標題。
    Heading.configure({ levels: [2, 3] }).extend({
      addAttributes() {
        return {
          ...this.parent?.(),
          // 錨點 id（文章目錄只收「H2 且有 id」）。改掉既有的 id 會讓站外的錨點連結失效。
          anchorId: hidden(),
        }
      },
    }),
    BulletList,
    OrderedList,
    // ⚠️ 清單項目只能是一個段落：前台的 `items` 是字串陣列，沒有巢狀清單。
    ListItem.extend({ content: 'paragraph' }),
    // ⚠️ 儲存格同理：前台是 `{{ cell }}`，一格一段純文字。
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader.extend({ content: 'paragraph' }),
    TableCell.extend({ content: 'paragraph' }),
    Lead,
    Note,
    createFigure(options.figureView),
    createRawBlock(),
    BlockMeta,
    History,
    Dropcursor,
    Gapcursor,
    ...(options.placeholder ? [Placeholder.configure({ placeholder: options.placeholder })] : []),
  ]
}
