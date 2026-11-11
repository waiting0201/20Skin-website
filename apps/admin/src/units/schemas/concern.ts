// 肌膚困擾的區塊 JSON 欄位。
//
// 形狀來源：`apps/web/app/data/concerns.ts` 的 toConcern。
//
// ⚠️ 原本還有症狀／成因／自我判斷／何時就醫四份 schema —— 2026-11-11 起那四區改由
//    單一的「內文」編輯器取代（Tim 指定），舊欄位只剩換算用（legacy-body.ts）。

import type { StructuredSchema } from '../../structured-schema'

/** `{treatmentsIntro, treatmentsNote, doctorsIntro}`（[slug].vue:206）。 */
export const concernRecommendationIntroSchema: StructuredSchema = {
  wire: 'json-string',
  emptyIsNull: true,
  preview: '困擾細節頁下方兩個推薦區段的開場白。',
  root: {
    kind: 'object',
    fields: [
      { key: 'treatmentsIntro', label: '「建議療程」開場白', node: { kind: 'string', multiline: true }, riskScan: true },
      { key: 'treatmentsNote', label: '「建議療程」註記', node: { kind: 'string', multiline: true }, riskScan: true },
      { key: 'doctorsIntro', label: '「諮詢醫師」開場白', node: { kind: 'string', multiline: true } },
    ],
  },
}
