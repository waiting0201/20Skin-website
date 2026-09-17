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
    { key: 'categoryTitle', label: '分類', render: 'text' },
    { key: 'status', label: '狀態', render: 'status' },
    { key: 'sortOrder', label: '排序' },
    { key: 'updatedAt', label: '更新時間', render: 'date' },
  ],
  fields: [
    {
      key: 'categoryTermId',
      label: '療程分類',
      type: 'relation-single',
      required: true,
      requiredOnCreate: true,
      optionsFromTermType: 1,
      group: '基本資料',
      hint: '⚠️ 換分類會改變網址（/treatments/{分類}/{slug}/），系統會自動補一筆 301。',
    },
    { key: 'nameEn', label: '英文名', type: 'text', group: '基本資料' },
    { key: 'subtitle', label: '副標', type: 'text', group: '基本資料' },
    { key: 'indications', label: '適應症', type: 'textarea', required: true, group: '療程內容', riskScan: true },
    { key: 'mechanism', label: '原理', type: 'richtext', group: '療程內容', riskScan: true },
    { key: 'durationText', label: '療程時間', type: 'text', group: '療程內容' },
    { key: 'sessionsText', label: '建議次數', type: 'text', group: '療程內容' },
    { key: 'steps', label: '療程流程', type: 'richtext', group: '療程內容', hint: '當天會發生什麼事。與「原理」（為什麼有效）是細節頁上兩個不同的區塊。' },
    { key: 'aftercare', label: '術後照護', type: 'textarea', group: '療程內容' },
    {
      key: 'contraindications',
      label: '禁忌症與注意事項',
      type: 'textarea',
      required: true,
      group: '療程內容',
      riskScan: true,
      hint: '醫療廣告法遵兩層防護之一：本文送審時會掃描高風險字詞。',
    },
    { key: 'deviceInfo', label: '儀器／原廠資訊', type: 'text', group: '療程內容' },
    {
      key: 'facts',
      label: '規格數據列',
      type: 'richtext',
      group: '療程內容',
      hint: '細節頁照順序整列渲染的規格清單（療程時間、恢復期、麻醉方式、建議次數…）。⚠️ 與上面的「療程時間」「建議次數」重疊是刻意的：那兩欄供列表與結構化資料單獨取用，這一欄是細節頁的完整清單。',
    },
    { key: 'cover', label: '封面圖', type: 'image', group: '圖片', hint: '建議尺寸 1200×900（4:3），上傳走瀏覽器直傳 Blob。' },
    { key: 'images', label: '圖庫', type: 'gallery', group: '圖片', hint: '對應 TreatmentImages，可複選、可排序、可加圖說。' },
  ],
  relations: [
    { key: 'doctors', label: '關聯醫師', relationType: 1, targetUnit: 'doctor', sortable: true, editable: true },
    { key: 'concerns', label: '關聯困擾', relationType: 2, targetUnit: 'concern', sortable: true, editable: true },
    { key: 'articles', label: '關聯文章', relationType: 3, targetUnit: 'article', sortable: true, editable: true },
    { key: 'faqs', label: '關聯 FAQ', relationType: 4, targetUnit: 'faq', sortable: true, editable: true },
  ],
}
