// 療程的七個區塊 JSON 欄位。
//
// 形狀來源：`apps/web/app/data/treatments.ts:226-256`（`parseBlocks` 的那一批）
// 與 `apps/web/app/pages/treatments/[category]/[slug].vue` 的渲染。
//
// ⚠️ 28 筆療程裡目前只有 1 筆填了 facts／steps／mechanism —— 也就是說院方主要是
//    **從零寫**這些欄位，不是改既有的。表單做不好等於這 27 筆永遠填不起來。

import type { StructuredSchema } from '../../structured-schema'

/** `{heading, items:[{title,desc}]}` —— 細節頁的打勾清單（[slug].vue:203）。 */
export const treatmentIndicationsSchema: StructuredSchema = {
  wire: 'json-string',
  emptyIsNull: true,
  preview: '細節頁「適應症」區：一個標題 ＋ 一組打勾清單。',
  root: {
    kind: 'object',
    fields: [
      { key: 'heading', label: '區段標題', node: { kind: 'string' }, hint: '留空則前台不顯示標題。' },
      {
        key: 'items',
        label: '適應症項目',
        node: {
          kind: 'array',
          itemLabel: '項目',
          summaryKeys: ['title'],
          item: {
            kind: 'object',
            fields: [
              { key: 'title', label: '名稱', node: { kind: 'string' }, required: true, riskScan: true },
              { key: 'desc', label: '說明', node: { kind: 'string', multiline: true }, riskScan: true },
            ],
          },
        },
      },
    ],
  },
}

/** `{heading, paragraphs[], image}` —— 細節頁「原理」區（[slug].vue:214）。 */
export const treatmentMechanismSchema: StructuredSchema = {
  wire: 'json-string',
  emptyIsNull: true,
  preview: '細節頁「原理」區：標題 ＋ 數段文字 ＋ 一張搭配圖。',
  root: {
    kind: 'object',
    fields: [
      { key: 'heading', label: '區段標題', node: { kind: 'string' } },
      { key: 'paragraphs', label: '段落', node: { kind: 'array', itemLabel: '段落', item: { kind: 'string' } }, riskScan: true },
      { key: 'image', label: '搭配圖', node: { kind: 'image', shape: 'content-image' }, hint: '建議 1200×900（4:3）。' },
    ],
  },
}

/** `{num,title,desc}[]` —— 編號卡片格（[slug].vue:237）。 */
export const treatmentStepsSchema: StructuredSchema = {
  wire: 'json-string',
  emptyIsNull: true,
  preview: '細節頁「療程流程」區：編號卡片，一步一張。',
  root: {
    kind: 'array',
    itemLabel: '步驟',
    summaryKeys: ['title'],
    item: {
      kind: 'object',
      fields: [
        {
          key: 'num',
          label: '編號',
          node: { kind: 'number', integer: true },
          required: true,
          // ⚠️ 前台顯示的是這個數字本身，不是陣列位置（[slug].vue:239 `{{ step.num }}`）。
          //    搬動順序之後編號**不會**自動跟著變，要手動改。
          hint: '⚠️ 前台照這個數字顯示，不是照順序自動編號——搬動之後記得改。',
        },
        { key: 'title', label: '步驟名稱', node: { kind: 'string' }, required: true },
        { key: 'desc', label: '說明', node: { kind: 'string', multiline: true }, riskScan: true },
      ],
    },
  },
}

/** `{when,desc}[]` —— 術後照護時間軸（[slug].vue:253）。 */
export const treatmentAftercareSchema: StructuredSchema = {
  wire: 'json-string',
  emptyIsNull: true,
  preview: '細節頁「術後照護」區：依時間排的時間軸。',
  root: {
    kind: 'array',
    itemLabel: '時段',
    summaryKeys: ['when', 'desc'],
    item: {
      kind: 'object',
      fields: [
        { key: 'when', label: '時間', node: { kind: 'string', placeholder: '例如：當天、3 天內、一週後' }, required: true },
        { key: 'desc', label: '照護說明', node: { kind: 'string', multiline: true }, required: true, riskScan: true },
      ],
    },
  },
}

/** `{items[], note}` —— 禁忌症清單 ＋ 一句備註（[slug].vue:272）。 */
export const treatmentContraindicationsSchema: StructuredSchema = {
  wire: 'json-string',
  emptyIsNull: true,
  preview: '細節頁「禁忌症與注意事項」區：一組條列 ＋ 一句備註。',
  root: {
    kind: 'object',
    fields: [
      { key: 'items', label: '禁忌症項目', node: { kind: 'array', itemLabel: '項目', item: { kind: 'string' } }, riskScan: true },
      { key: 'note', label: '備註', node: { kind: 'string', multiline: true }, riskScan: true },
    ],
  },
}
