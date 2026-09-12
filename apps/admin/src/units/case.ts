// 單元宣告：案例 Case。docs/08-database.md §C-5。
// ⚠️ 四個法規揭露欄位在資料庫是 NOT NULL（遷移腳本會繞過 API 直寫，
// 只有資料庫約束擋得住）。這裡在 UI 層一併標成必填，兩層防護對齊。
import type { UnitDefinition } from '../unit-schema'

export const caseUnit: UnitDefinition = {
  key: 'case',
  label: '案例',
  labelSingular: '案例',
  producesUrl: true, // /cases/{slug}/
  listColumns: [
    { key: 'title', label: '標題' },
    { key: 'treatmentTitle', label: '對應療程', render: 'text' },
    { key: 'status', label: '狀態', render: 'status' },
    { key: 'updatedAt', label: '更新時間', render: 'date' },
  ],
  fields: [
    { key: 'treatmentId', label: '對應療程', type: 'relation-single', required: true, optionsFromUnit: 'treatment', group: '基本資料' },
    { key: 'sessionsText', label: '次數與週期', type: 'text', group: '基本資料' },
    { key: 'narrative', label: '敘述', type: 'richtext', group: '基本資料', riskScan: true },
    {
      key: 'individualVarianceStatement',
      label: '個案差異聲明',
      type: 'textarea',
      required: true,
      group: '法規揭露（必填）',
      hint: '資料庫層 NOT NULL，遷移腳本繞過 API 時仍會被擋下（docs/08 §C-5）。',
    },
    { key: 'hasWrittenConsent', label: '當事人書面同意', type: 'boolean', required: true, group: '法規揭露（必填）' },
    { key: 'consentReference', label: '同意書編號／存放位置', type: 'text', required: true, group: '法規揭露（必填）', hint: '只存索引，同意書本身不進系統。' },
    { key: 'shootingConditions', label: '拍攝條件', type: 'textarea', required: true, group: '法規揭露（必填）' },
    {
      key: 'images',
      label: '案例圖片',
      type: 'gallery',
      group: '圖片',
      hint: '對應 CaseImages：術前／術後，可各自標記拍攝日期與排序。',
      // 🔴 phase 在 API 是必填（docs/08 §C-5）—— 少了它整筆存檔會被退回，
      //    所以它不是「可以之後再補」的欄位。
      galleryItemFields: [
        {
          key: 'phase',
          label: '階段',
          type: 'select',
          options: [
            { value: '1', label: '術前' },
            { value: '2', label: '術後' },
          ],
        },
        { key: 'takenOn', label: '拍攝日期', type: 'date' },
      ],
    },
  ],
}
