// 多個單元共用的結構化欄位 schema。
//
// ⚠️ 形狀的真實來源在前台，每一份都註明對應的檔案與行號。抄錯的症狀是
//    前台那一區靜默消失（`parseBlocks` 回 fallback，HTTP 仍是 200）。

import type { StructuredSchema } from '../../structured-schema'

/**
 * 兩欄表格：`{label, value}[]`。
 *
 * 對應 `apps/web/app/data/treatments.ts` 的 `TreatmentFact`
 * （療程細節頁的「規格數據」與「儀器資訊」兩張表用同一個形狀）。
 */
export function labelValueSchema(itemLabel: string, preview: string): StructuredSchema {
  return {
    wire: 'json-string',
    emptyIsNull: true,
    preview,
    root: {
      kind: 'array',
      itemLabel,
      summaryKeys: ['label', 'value'],
      item: {
        kind: 'object',
        fields: [
          { key: 'label', label: '項目', node: { kind: 'string' }, required: true },
          { key: 'value', label: '內容', node: { kind: 'string' }, required: true },
        ],
      },
    },
  }
}

/**
 * 只有一句導言的物件：`{lede}`。
 *
 * 對應 `apps/web/app/data/clinics.ts:217`（據點）與分類頁的介紹文案。
 * ⚠️ 據點那一支在 `lede` 空的時候會退回 `record.summary` —— 所以這一欄留空
 *    不是「沒有導言」，是「用摘要當導言」。
 */
export function ledeSchema(preview: string): StructuredSchema {
  return {
    wire: 'json-string',
    emptyIsNull: true,
    preview,
    root: {
      kind: 'object',
      fields: [
        { key: 'lede', label: '導言', node: { kind: 'string', multiline: true } },
      ],
    },
  }
}
