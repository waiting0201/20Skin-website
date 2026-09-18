// 單元宣告：頁面 Page。docs/08-database.md §C-8、docs/02-backend-cms.md §1。
//
// ⚠️ 型別差異是這個模型的核心：自由頁可新增刪除改 slug，系統頁三者皆不可
// （IsSystemLocked）。法務三頁另外限超級管理員編輯（page.ts 的權限判斷見
// src/permissions.ts 的 canEditLegalPage / canCreateTerm 兩個相鄰函式）。
import type { UnitDefinition } from '../unit-schema'
import { PAGE_BODY_SCHEMAS } from './schemas/page'

export const pageUnit: UnitDefinition = {
  key: 'page',
  label: '頁面',
  labelSingular: '頁面',
  producesUrl: true,
  systemAware: true,
  listColumns: [
    { key: 'title', label: '標題' },
    { key: 'pageKind', label: '型別', render: 'text' },
    { key: 'systemKey', label: '系統鍵值', render: 'text' },
    { key: 'status', label: '狀態', render: 'status' },
  ],
  fields: [
    {
      key: 'pageKind',
      label: '型別',
      type: 'select',
      readOnly: true, // 建立後不可改型別；新增時才選
      settableOnCreate: true,
      group: '基本資料',
      options: [
        { value: '1', label: '自由頁' },
        { value: '2', label: '系統頁' },
      ],
    },
    { key: 'systemKey', label: '系統鍵值', type: 'text', readOnly: true, group: '基本資料', hint: '系統內建頁面的識別碼，不可編輯。' },
    { key: 'lead', label: '導言', type: 'textarea', group: '內容' },
    {
      key: 'bodyBlocks',
      label: '內文',
      type: 'structured',
      group: '內容',
      hint: '系統頁列表內容由對應模型自動帶出，這裡只管頁面外框文案。',
      // 🔴 依 slug 分派：六個有內文的頁面各有各的形狀，其餘頁面的這一欄前台根本不讀。
      structuredBySlug: PAGE_BODY_SCHEMAS,
      // ⚠️ 查不到 schema 時走哪一條寫入路徑。少了它，改掉 slug 之後存檔會清空整個內文。
      structuredWire: 'json-value',
    },
    { key: 'cover', label: '封面圖', type: 'image', group: '圖片' },
    {
      key: 'listSortRule',
      label: '列表排序規則',
      type: 'select',
      group: '系統頁設定',
      options: [
        { value: '1', label: '依排序值' },
        { value: '2', label: '依發布時間（新到舊）' },
        { value: '3', label: '依標題' },
      ],
      hint: '僅系統頁使用。',
    },
    { key: 'pageSize', label: '每頁筆數', type: 'number', group: '系統頁設定', hint: '僅系統頁使用。' },
    { key: 'superAdminOnly', label: '限超級管理員編輯', type: 'boolean', readOnly: true, group: '權限', hint: '隱私權政策等三個法務頁固定為是，只有超級管理員能編輯。' },
  ],
  relations: [
    // RelationType=12「頁面→精選項目」。docs/08 §D 的 To 端可以是任何內容單元，
    // 這裡先示範接受文章；下一輪要做「首頁版位編排」時可以擴充成跨單元選擇器。
    { key: 'featuredItems', label: '精選項目', relationType: 12, targetUnit: 'article', sortable: true, editable: true },
  ],
}
