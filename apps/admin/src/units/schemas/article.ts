// 文章內文的區塊編輯器。
//
// 形狀來源：`apps/web/app/data/articles.ts:112-119` 的 `ArticleBodyBlock`，
// 渲染在 `apps/web/app/pages/blog/[slug].vue:211-246`（`v-for` ＋ `v-if` 鏈）。
//
// 🔴 **段落是純文字**（前台是 `{{ block.text }}`）。不支援行內粗體與連結 ——
//    Tim 定案 2026-09-17，要加就得同時改前台的渲染與加一套 HTML 淨化，是另一件事。
//    所以這裡不要放任何「格式」按鈕，要強調就另起一個「提示框」區塊。
//
// 🔴 **`wire` 是 `json-value`**：`ApplyArticleFields` 走 `ReadBodyBlocks`，
//    最外層必須是**陣列**。這一欄與 page 的 bodyBlocks 是全部 21 欄裡唯二不送字串的。
//
// 正式資料的用量（1083 篇實測）：段落 14208、圖片 3435、標題 2464、
// 清單 472、表格 15、提示框 5、前言 1。七種都在用，一種都不能省。

import type { StructuredSchema } from '../../structured-schema'

export const articleBodySchema: StructuredSchema = {
  wire: 'json-value',
  emptyIsNull: true,
  preview: '文章內頁的本文，由上到下一個區塊接一個區塊。段落是純文字，不支援粗體與行內連結。',
  root: {
    kind: 'array',
    itemLabel: '區塊',
    // 一篇文章動輒數十個區塊，預設摺疊；摺起來的那一列不渲染子樹。
    collapsible: true,
    item: {
      kind: 'union',
      discriminator: 'type',
      variants: [
        {
          value: 'lead',
          label: '前言',
          node: {
            kind: 'object',
            fields: [
              { key: 'text', label: '文字', node: { kind: 'string', multiline: true }, required: true, riskScan: true },
            ],
          },
        },
        {
          value: 'heading',
          label: '標題',
          node: {
            kind: 'object',
            fields: [
              {
                key: 'level',
                label: '層級',
                // ⚠️ numeric：前台比對的是 `block.level === 2`（數字）。
                //    `<select>` 吐字串，不轉的話所有 H2 都會掉到 H3 的分支去。
                node: { kind: 'enum', numeric: true, options: [
                  { value: '2', label: 'H2（會進文章目錄）' },
                  { value: '3', label: 'H3' },
                ] },
                required: true,
              },
              { key: 'text', label: '文字', node: { kind: 'string' }, required: true },
              {
                key: 'id',
                label: '錨點 id',
                node: { kind: 'string', placeholder: '例如 why-ages-faster' },
                // 🔴 文章目錄只收「level 2 且有 id」的標題（blog/[slug].vue:52-56）。
                //    沒有 id 的 H2 照樣顯示，只是目錄裡沒有它。
                //    改掉既有的 id 會讓站外連進來的錨點連結失效。
                hint: '只有 H2 需要。空著的話這個標題不會出現在文章目錄裡；改掉既有的 id 會讓別人連過來的錨點失效。',
              },
            ],
          },
        },
        {
          value: 'paragraph',
          label: '段落',
          node: {
            kind: 'object',
            fields: [
              { key: 'text', label: '文字', node: { kind: 'string', multiline: true }, required: true, riskScan: true },
            ],
          },
        },
        {
          value: 'figure',
          label: '圖片',
          node: {
            kind: 'object',
            fields: [
              // ⚠️ 這裡是 `src-size` 不是 content-image —— 舊站匯入寫的是
              //    `{src, alt, width, height}`，沒有 blobPath（legacy-import/import.mjs:120）。
              { key: 'image', label: '圖片', node: { kind: 'image', shape: 'src-size' }, required: true },
              { key: 'caption', label: '圖說', node: { kind: 'string', multiline: true } },
              { key: 'wide', label: '滿版寬度', node: { kind: 'boolean' } },
            ],
          },
        },
        {
          value: 'list',
          label: '清單',
          node: {
            kind: 'object',
            fields: [
              { key: 'ordered', label: '編號清單', node: { kind: 'boolean' }, hint: '不勾＝項目符號。' },
              { key: 'items', label: '項目', node: { kind: 'array', itemLabel: '項目', item: { kind: 'string' } }, riskScan: true },
            ],
          },
        },
        {
          value: 'table',
          label: '表格',
          node: {
            kind: 'object',
            fields: [
              { key: 'headers', label: '表頭', node: { kind: 'array', itemLabel: '欄', item: { kind: 'string' } } },
              {
                key: 'rows',
                label: '內容',
                node: { kind: 'array', itemLabel: '列', item: { kind: 'array', itemLabel: '格', item: { kind: 'string' } } },
                hint: '一列一組，每一格對應上面的一個表頭。欄數要跟表頭一樣多。',
              },
            ],
          },
        },
        {
          value: 'note',
          label: '提示框',
          node: {
            kind: 'object',
            fields: [
              {
                key: 'variant',
                label: '樣式',
                node: { kind: 'enum', options: [
                  { value: 'info', label: 'ⓘ 說明' },
                  { value: 'warn', label: '⚠ 注意' },
                ] },
                required: true,
              },
              { key: 'text', label: '文字', node: { kind: 'string', multiline: true }, required: true, riskScan: true },
            ],
          },
        },
      ],
    },
  },
}
