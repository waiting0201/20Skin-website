// 肌膚困擾的五個區塊 JSON 欄位。
//
// 形狀來源：`apps/web/app/data/concerns.ts:139-143` 與
// `apps/web/app/pages/concerns/[slug].vue:130-206` 的渲染。
//
// ⚠️ 8 筆困擾裡只有 1 筆填了 symptoms／causes／selfCheckGuide —— 同療程，
//    這幾欄主要是從零寫。

import type { StructuredSchema } from '../../structured-schema'

/** `{heading, paragraphs[], media}`（[slug].vue:130-133）。 */
export const concernSymptomsSchema: StructuredSchema = {
  wire: 'json-string',
  emptyIsNull: true,
  preview: '困擾細節頁「症狀」區：標題 ＋ 數段文字 ＋ 一張搭配圖。',
  root: {
    kind: 'object',
    fields: [
      { key: 'heading', label: '區段標題', node: { kind: 'string' } },
      {
        key: 'paragraphs',
        label: '段落',
        node: { kind: 'array', itemLabel: '段落', item: { kind: 'string' } },
        riskScan: true,
        // ⚠️ 前台是 `<p v-for="p in paragraphs">` —— 一個陣列元素就是一個 <p>。
        //    整段塞成一個字串的話會變成一大坨；更糟的是 v-for 跑字串會逐字元迭代。
        hint: '一列一段。前台一段一個 <p>，不要把整篇塞進同一列。',
      },
      { key: 'media', label: '搭配圖', node: { kind: 'image', shape: 'content-image' } },
    ],
  },
}

/** `{heading, intro, facts:[{label,text}]}` —— 成因表格（[slug].vue:152）。 */
export const concernCausesSchema: StructuredSchema = {
  wire: 'json-string',
  emptyIsNull: true,
  preview: '困擾細節頁「成因」區：標題 ＋ 引言 ＋ 一張兩欄表格。',
  root: {
    kind: 'object',
    fields: [
      { key: 'heading', label: '區段標題', node: { kind: 'string' } },
      { key: 'intro', label: '引言', node: { kind: 'string', multiline: true } },
      {
        key: 'facts',
        label: '成因項目',
        node: {
          kind: 'array',
          itemLabel: '成因',
          summaryKeys: ['label'],
          item: {
            kind: 'object',
            fields: [
              // ⚠️ 這裡是 `text` 不是 `value`（療程的 facts 才是 value）。兩邊不同，別對調。
              { key: 'label', label: '成因', node: { kind: 'string' }, required: true },
              { key: 'text', label: '說明', node: { kind: 'string', multiline: true }, required: true, riskScan: true },
            ],
          },
        },
      },
    ],
  },
}

/** `{heading, intro, types:[{title, points[], direction}]}`（[slug].vue:175-178）。 */
export const concernSelfCheckSchema: StructuredSchema = {
  wire: 'json-string',
  emptyIsNull: true,
  preview: '困擾細節頁「自我判斷」區：標題 ＋ 引言 ＋ 一組類型卡片，每張卡片底下一串要點。',
  root: {
    kind: 'object',
    fields: [
      { key: 'heading', label: '區段標題', node: { kind: 'string' } },
      { key: 'intro', label: '引言', node: { kind: 'string', multiline: true } },
      {
        key: 'types',
        label: '類型',
        node: {
          kind: 'array',
          itemLabel: '類型',
          summaryKeys: ['title'],
          item: {
            kind: 'object',
            fields: [
              { key: 'title', label: '類型名稱', node: { kind: 'string' }, required: true },
              { key: 'points', label: '判斷要點', node: { kind: 'array', itemLabel: '要點', item: { kind: 'string' } } },
              { key: 'direction', label: '建議方向', node: { kind: 'string', multiline: true }, riskScan: true },
            ],
          },
        },
      },
    ],
  },
}

/** `{heading, items[]}` —— 就醫時機清單（[slug].vue:190）。 */
export const concernWhenToSeeDoctorSchema: StructuredSchema = {
  wire: 'json-string',
  emptyIsNull: true,
  preview: '困擾細節頁「何時該就醫」區：標題 ＋ 一組條列。',
  root: {
    kind: 'object',
    fields: [
      { key: 'heading', label: '區段標題', node: { kind: 'string' } },
      { key: 'items', label: '就醫時機', node: { kind: 'array', itemLabel: '項目', item: { kind: 'string' } }, riskScan: true },
    ],
  },
}

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
