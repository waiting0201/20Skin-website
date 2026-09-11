// 單元宣告：療程 Treatment。欄位對齊 docs/02-backend-cms.md §1 與
// docs/08-database.md §C-1（Treatments ＋ TreatmentImages）。
import type { UnitDefinition } from '../unit-schema'

export const treatmentUnit: UnitDefinition = {
  key: 'treatment',
  label: '療程',
  labelSingular: '療程',
  producesUrl: true, // /treatments/{分類}/{slug}/
  categoryTermType: 1,
  listColumns: [
    { key: 'title', label: '名稱' },
    { key: 'categoryTermSeedKey', label: '分類', render: 'text' },
    { key: 'status', label: '狀態', render: 'status' },
    { key: 'sortOrder', label: '排序' },
    { key: 'updatedAt', label: '更新時間', render: 'date' },
  ],
  fields: [
    {
      key: 'categoryTermSeedKey',
      label: '療程分類',
      type: 'relation-single',
      required: true,
      optionsFromTermType: 1,
      group: '基本資料',
      hint: '⚠️ 換分類會改變網址（/treatments/{分類}/{slug}/），系統會自動補一筆 301（docs/08 §C-1）。',
    },
    { key: 'nameEn', label: '英文名', type: 'text', group: '基本資料' },
    { key: 'subtitle', label: '副標', type: 'text', group: '基本資料' },
    { key: 'indications', label: '適應症', type: 'textarea', required: true, group: '療程內容', riskScan: true },
    { key: 'mechanism', label: '原理', type: 'richtext', group: '療程內容', riskScan: true },
    { key: 'durationText', label: '療程時間', type: 'text', group: '療程內容' },
    { key: 'sessionsText', label: '建議次數', type: 'text', group: '療程內容' },
    { key: 'aftercare', label: '術後照護', type: 'textarea', group: '療程內容' },
    {
      key: 'contraindications',
      label: '禁忌症與注意事項',
      type: 'textarea',
      required: true,
      group: '療程內容',
      riskScan: true,
      hint: '醫療廣告法遵兩層防護之一：本文送審時會掃描高風險字詞（docs/02 §5）。',
    },
    { key: 'deviceInfo', label: '儀器／原廠資訊', type: 'text', group: '療程內容' },
    { key: 'cover', label: '封面圖', type: 'image', group: '圖片', hint: '建議尺寸 1200×900（4:3），上傳走瀏覽器直傳 Blob（docs/09 §9）。' },
    { key: 'gallery', label: '圖庫', type: 'gallery', group: '圖片', hint: '對應 TreatmentImages，可複選、可排序、可加圖說。' },
  ],
  relations: [
    { key: 'doctors', label: '關聯醫師', relationType: 1, targetUnit: 'doctor', sortable: true, editable: true },
    { key: 'concerns', label: '關聯困擾', relationType: 2, targetUnit: 'concern', sortable: true, editable: true },
    { key: 'articles', label: '關聯文章', relationType: 3, targetUnit: 'article', sortable: true, editable: true },
    { key: 'faqs', label: '關聯 FAQ', relationType: 4, targetUnit: 'faq', sortable: true, editable: true },
  ],
}
