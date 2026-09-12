// 單元宣告：FAQ 題庫。docs/08-database.md §C-6、docs/02-backend-cms.md §6。
//
// ⚠️ 不要把這個模組讀成「FAQ 頁面」本身——`/faq/` 主頁與 `/faq/{category}/`
// 分類頁屬於「頁面」與「分類與標籤」模型（見 page.ts／term.ts），這裡維護的
// 只是題庫本體。三方權責分界見 docs/02 §6。
import type { UnitDefinition } from '../unit-schema'

export const faqUnit: UnitDefinition = {
  key: 'faq',
  label: 'FAQ 題庫',
  labelSingular: 'FAQ',
  producesUrl: false, // 不產生獨立網址；Slug 只當 /faq/ 的頁內錨點（docs/08 §C-6）
  categoryTermType: 3,
  listColumns: [
    { key: 'title', label: '問題' },
    { key: 'categoryTitle', label: '分類', render: 'text' },
    { key: 'lastReviewedOn', label: '最後更新日', render: 'date' },
    { key: 'status', label: '審核狀態', render: 'status' },
  ],
  fields: [
    {
      key: 'categoryTermId',
      label: '分類',
      type: 'relation-single',
      required: true,
      optionsFromTermType: 3,
      group: '基本資料',
      hint: '引用「分類與標籤」模型，不自行維護第二份清單（docs/02 §6）。',
    },
    {
      key: 'webAnswer',
      label: '網頁版答案',
      type: 'richtext',
      required: true,
      group: '答案',
      riskScan: true,
      hint: '建議 150–400 字。',
      minLength: 150,
      maxLength: 400,
    },
    {
      key: 'aiAnswer',
      label: 'AI 摘要版答案',
      type: 'textarea',
      required: true,
      group: '答案',
      riskScan: true,
      hint: '60–100 字，語意需自足——這是 FAQPage JSON-LD、faq.json、llms-full.txt 的唯一來源，缺一則該題無法輸出（docs/08 §C-6）。',
      minLength: 60,
      maxLength: 100,
    },
    { key: 'lastReviewedOn', label: '最後更新日', type: 'date', required: true, group: '基本資料', hint: '人工可控的時效標記，改個錯字不該讓它跳動（不等同 UpdatedAt）。' },
    { key: 'reviewedBy', label: '審閱者', type: 'text', group: '基本資料', hint: '對外顯示「這則答案由誰確認過」，例如「黃勇學 醫師」。自由文字不是外鍵——審閱者未必是站內有個人頁的醫師。' },
  ],
  relations: [
    // RelationType 4／6／10 皆從對方端維護（療程／困擾／據點 → FAQ），這裡是唯讀反向顯示。
    { key: 'treatments', label: '出現於療程頁', relationType: 4, targetUnit: 'treatment', sortable: false, editable: false },
    { key: 'concerns', label: '出現於困擾頁', relationType: 6, targetUnit: 'concern', sortable: false, editable: false },
    { key: 'clinics', label: '出現於據點頁', relationType: 10, targetUnit: 'clinic', sortable: false, editable: false },
  ],
}
