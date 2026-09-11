// 單元宣告：分類與標籤 Term。docs/08-database.md §C-9、docs/02-backend-cms.md §1。
//
// ⚠️ 新增／刪除「分類」（TermType 1–3）限超級管理員（動 URL 結構與 301
// 對照表）；新增「標籤」（TermType 4）內容編輯即可。這條逐單元例外集中在
// src/permissions.ts 的 canCreateTerm／canDeleteTerm，畫面依 termType
// 呼叫，不在這裡重複判斷。
import type { UnitDefinition } from '../unit-schema'

export const termUnit: UnitDefinition = {
  key: 'term',
  label: '分類與標籤',
  labelSingular: '分類／標籤',
  producesUrl: true,
  systemAware: true, // 種子分類與系統頁一樣鎖定，不可刪、不可改 slug
  listColumns: [
    { key: 'title', label: '名稱' },
    { key: 'termType', label: '型別', render: 'text' },
    { key: 'usageCount', label: '使用筆數', render: 'text' },
    { key: 'status', label: '狀態', render: 'status' },
  ],
  fields: [
    {
      key: 'termType',
      label: '型別',
      type: 'select',
      readOnly: true, // 建立後不可改型別
      group: '基本資料',
      options: [
        { value: '1', label: '療程分類' },
        { value: '2', label: '文章分類' },
        { value: '3', label: 'FAQ 分類' },
        { value: '4', label: '文章標籤' },
      ],
    },
    { key: 'intro', label: '介紹文案', type: 'textarea', group: '基本資料' },
    { key: 'coverImageUrl', label: '封面圖', type: 'image', group: '圖片' },
    {
      key: 'usageCount',
      label: '使用筆數',
      type: 'number',
      readOnly: true,
      group: '基本資料',
      hint: '刪除前 API 會回報這個數字；仍有引用時刪除會被擋下（409 CONFLICT_STATE，docs/10 §3.3）。',
    },
  ],
}
