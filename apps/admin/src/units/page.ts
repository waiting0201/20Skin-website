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
  // 頁面不給拖曳排序：六頁各有自己的路由，前台不讀它們的順序；
  // 拖了只會改到更新時間（長版故事頁的「最後更新」讀它）。
  listSortable: false,
  listColumns: [
    { key: 'title', label: '標題' },
    { key: 'status', label: '狀態', render: 'status' },
  ],
  fields: [
    // 🔴 2026-11-12 整理：這張表單只留前台真的會讀的欄位。
    //    拿掉的是「型別」「系統鍵值」「封面圖」「列表排序規則」「每頁筆數」與「精選項目」——
    //    前台一個都不讀，填了、存了、發布了，什麼都不會變。資料庫的欄位與舊值都留著
    //    （不在這裡宣告＝存檔時不送，API 不會動它）。
    //    清單也只列自由頁（ListPage.vue 的 pageKind），所以「型別」永遠是自由頁。
    // 🔴 「導言」改接頂層的 summary：長版故事頁標題下那一段前台讀的是 summary，
    //    不是 Pages.Lead —— 原本那一格改了不會生效（兩頁的兩份值目前相同，換過來不掉資料）。
    { key: 'summary', label: '導言', type: 'textarea', group: '內容', hint: '長版故事頁（新中式美學、彩妝式輕醫美）標題下方的那一段。其他頁面不會顯示。' },
    {
      key: 'bodyBlocks',
      label: '內文',
      type: 'structured',
      group: '內容',
      // 🔴 依 slug 分派：六個有內文的頁面各有各的形狀，其餘頁面的這一欄前台根本不讀。
      structuredBySlug: PAGE_BODY_SCHEMAS,
      // ⚠️ 查不到 schema 時走哪一條寫入路徑。少了它，改掉 slug 之後存檔會清空整個內文。
      structuredWire: 'json-value',
    },
    { key: 'superAdminOnly', label: '限超級管理員編輯', type: 'boolean', readOnly: true, group: '權限', hint: '隱私權政策等三個法務頁固定為是，只有超級管理員能編輯。' },
  ],
  relations: [],
}
