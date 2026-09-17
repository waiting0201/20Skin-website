// 頁面的 `bodyBlocks`：**同一個欄位，每一頁的形狀都不一樣**。
//
// 形狀來源：`apps/web/app/data/pages.ts`（about 在 :74-91、story 在 :105-153、
// legal 在 :157-190）。
//
// 🔴 **依 slug 分派，不是 systemKey。** 這六頁的 `SystemKey` 都是 null
//    （它們是 `PageKind.Free`），前台 `pageIndex()` 查的也是 slug。
//
// ⚠️ 17 個頁面裡只有這 6 個有內文，其餘（列表頁、聯絡、搜尋、404…）的
//    `bodyBlocks` 前台根本不讀。那些頁面**刻意不給 schema** —— 硬套一份的結果是
//    「表單看起來正常、填了、前台什麼都沒變」，比一個坦白的 JSON 框糟得多。

import type { StructuredSchema, StructuredNode } from '../../structured-schema'

/** about 頁的卡片圖：`{src, alt, w, h}`（注意是 w／h，不是 width／height）。 */
const cardImage: StructuredNode = { kind: 'image', shape: 'src-wh' }

/** `{pillars[], timeline[], teamPreview[], clinics[]}` —— 品牌理念頁。 */
export const pageAboutSchema: StructuredSchema = {
  wire: 'json-value',
  emptyIsNull: true,
  preview: '品牌理念頁的四個區塊：理念柱、品牌歷程、團隊預覽、院區預覽。',
  root: {
    kind: 'object',
    fields: [
      {
        key: 'pillars',
        label: '理念柱',
        node: {
          kind: 'array',
          itemLabel: '理念',
          summaryKeys: ['no', 'title'],
          item: {
            kind: 'object',
            fields: [
              { key: 'no', label: '編號', node: { kind: 'string', placeholder: '01' }, hint: '顯示用的字串，不是排序依據（排序看這裡的順序）。' },
              { key: 'title', label: '標題', node: { kind: 'string' }, required: true },
              { key: 'body', label: '內容', node: { kind: 'string', multiline: true } },
              { key: 'href', label: '延伸連結', node: { kind: 'string', placeholder: '/about/new-chinese-aesthetics/' } },
              { key: 'image', label: '圖片', node: cardImage },
            ],
          },
        },
      },
      {
        key: 'timeline',
        label: '品牌歷程',
        node: {
          kind: 'array',
          itemLabel: '里程碑',
          summaryKeys: ['year', 'title'],
          item: {
            kind: 'object',
            fields: [
              { key: 'year', label: '年份', node: { kind: 'string' }, required: true },
              { key: 'title', label: '標題', node: { kind: 'string' }, required: true },
              { key: 'body', label: '說明', node: { kind: 'string', multiline: true } },
            ],
          },
        },
      },
      {
        key: 'teamPreview',
        label: '團隊預覽',
        hint: '⚠️ 這是品牌頁上的預覽卡片，與「醫師」內容模型是兩份資料——改這裡不會動到醫師個人頁。',
        node: {
          kind: 'array',
          itemLabel: '成員',
          summaryKeys: ['name', 'role'],
          item: {
            kind: 'object',
            fields: [
              { key: 'name', label: '姓名', node: { kind: 'string' }, required: true },
              { key: 'role', label: '職稱', node: { kind: 'string' } },
              { key: 'href', label: '個人頁連結', node: { kind: 'string', placeholder: '/team/huang/' } },
              { key: 'image', label: '照片', node: cardImage },
            ],
          },
        },
      },
      {
        key: 'clinics',
        label: '院區預覽',
        node: {
          kind: 'array',
          itemLabel: '院區',
          summaryKeys: ['name'],
          item: {
            kind: 'object',
            fields: [
              { key: 'name', label: '名稱', node: { kind: 'string' }, required: true },
              { key: 'address', label: '地址', node: { kind: 'string' } },
              { key: 'body', label: '說明', node: { kind: 'string', multiline: true } },
              { key: 'href', label: '據點頁連結', node: { kind: 'string', placeholder: '/clinics/siji/' } },
              { key: 'image', label: '圖片', node: cardImage },
            ],
          },
        },
      },
    ],
  },
}

/** 長版故事頁（新中式美學、彩妝式輕醫美）。 */
export const pageStorySchema: StructuredSchema = {
  wire: 'json-value',
  emptyIsNull: true,
  preview: '長版故事頁：主視覺、目錄、內文段落與 FAQ。',
  root: {
    kind: 'object',
    fields: [
      { key: 'meta', label: '標頭資訊', node: { kind: 'array', itemLabel: '項目', item: { kind: 'string' } }, hint: '例如「最後更新 2026-08-20」「閱讀時間 約 8 分鐘」。' },
      // ⚠️ 這一張是 content-image（blobPath／url），與 about 的卡片圖不同形狀。
      { key: 'heroImage', label: '主視覺', node: { kind: 'image', shape: 'content-image' } },
      { key: 'heroCaption', label: '主視覺圖說', node: { kind: 'string' } },
      {
        key: 'toc',
        label: '本文目錄',
        node: {
          kind: 'array',
          itemLabel: '目錄項',
          summaryKeys: ['label'],
          item: {
            kind: 'object',
            fields: [
              { key: 'id', label: '錨點 id', node: { kind: 'string' }, required: true },
              { key: 'label', label: '顯示文字', node: { kind: 'string' }, required: true },
            ],
          },
        },
        hint: '留空則不顯示目錄。id 要對得上內文裡的錨點。',
      },
      {
        key: 'faqs',
        label: '常見問題',
        node: {
          kind: 'array',
          itemLabel: '問答',
          summaryKeys: ['q'],
          item: {
            kind: 'object',
            fields: [
              { key: 'q', label: '問題', node: { kind: 'string', multiline: true }, required: true },
              { key: 'a', label: '回答', node: { kind: 'string', multiline: true }, required: true, riskScan: true },
            ],
          },
        },
      },
      {
        key: 'sister',
        label: '姊妹頁連結',
        hint: '兩篇長版故事互相導流用。',
        node: {
          kind: 'object',
          fields: [
            { key: 'slug', label: 'slug', node: { kind: 'string', placeholder: 'makeup-style' } },
            { key: 'label', label: '顯示文字', node: { kind: 'string' } },
          ],
        },
      },
    ],
  },
}

/**
 * 法務三頁（隱私權、服務條款、醫療免責聲明）。
 *
 * 🔴 `sections` 是空陣列時，`functions/Common/Indexability.cs` 會判定這一頁
 *    「只有骨架」而輸出 noindex 並排除在 sitemap 外。所以留空不只是少內容，
 *    是整頁不被收錄。
 * ⚠️ `paragraphs` 在前台是 **`v-html`**（legal.vue:95）——這是全站唯一一處會把
 *    內容欄位當 HTML 輸出的地方，原因是「聯絡我們」那一句需要保留行內 `<a>`。
 */
export const pageLegalSchema: StructuredSchema = {
  wire: 'json-value',
  emptyIsNull: true,
  preview: '法務頁：更新日期 ＋ 逐條條文。⚠️ 條文留空的話整頁會被標成 noindex、也不進 sitemap。',
  root: {
    kind: 'object',
    fields: [
      { key: 'updatedOn', label: '最後更新日', node: { kind: 'string', placeholder: '2026-08-01' }, required: true },
      {
        key: 'sections',
        label: '條文',
        node: {
          kind: 'array',
          itemLabel: '條',
          summaryKeys: ['heading'],
          item: {
            kind: 'object',
            fields: [
              { key: 'id', label: '錨點 id', node: { kind: 'string', placeholder: 'scope' }, required: true },
              { key: 'heading', label: '標題', node: { kind: 'string', placeholder: '一、適用範圍' }, required: true },
              {
                key: 'paragraphs',
                label: '段落',
                node: { kind: 'array', itemLabel: '段落', item: { kind: 'string' } },
                hint: '⚠️ 這一欄前台是直接當 HTML 輸出的（全站唯一一處），所以可以放 <a> 連結——但也代表貼進來的標記會原樣生效，不要從網頁上直接複製貼上。',
              },
              { key: 'list', label: '條列（選填）', node: { kind: 'array', itemLabel: '項目', item: { kind: 'string' } } },
            ],
          },
        },
      },
    ],
  },
}

/** slug → schema。查不到就沒有表單（原始 JSON 模式）。 */
export const PAGE_BODY_SCHEMAS: Record<string, StructuredSchema> = {
  about: pageAboutSchema,
  'new-chinese-aesthetics': pageStorySchema,
  'makeup-style': pageStorySchema,
  privacy: pageLegalSchema,
  terms: pageLegalSchema,
  'medical-disclaimer': pageLegalSchema,
}
