// 單元宣告：頁面 Page。docs/08-database.md §C-8、docs/02-backend-cms.md §1。
//
// ⚠️ 型別差異是這個模型的核心：自由頁可新增刪除改 slug，系統頁三者皆不可
// （IsSystemLocked）。法務三頁另外限超級管理員編輯（page.ts 的權限判斷見
// src/permissions.ts 的 canEditLegalPage / canCreateTerm 兩個相鄰函式）。
import type { UnitDefinition } from '../unit-schema'
import { PAGE_BODY_SCHEMAS, dentalHoursNotesSchema, dentalServicesSchema } from './schemas/page'
import { clinicTransportSchema } from './schemas/misc'

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
    { key: 'summary', label: '導言', type: 'textarea', group: '內容', hint: '長版故事頁（新中式美學、彩妝式輕醫美）與允赫齒科頁標題下方的那一段。其他頁面不會顯示。' },
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
  // 🔴 允赫齒科頁（slug=dental）的表單**照「據點」的排法與輸入元件**（Tim 指定 2026-11-13：
  //    「齒科後台的更新模式要跟據點的一樣，免得客戶又要學另一套」）。
  //    分組名稱、欄位名稱、順序都對齊 units/clinic.ts；多出來的只有據點沒有的那幾格
  //    （掛號方式、Facebook、主治項目、門診提醒、頁首照片）。
  //    值存在這一頁的 bodyBlocks 裡（storedIn），前台讀法見 apps/web/app/data/pages.ts 的 getDentalPage。
  // ⚠️ 沒有緯度、經度、地圖連結：這一頁的地圖只用地址查詢，JSON-LD 不輸出座標。
  // ⚠️ 沒有「駐診醫師／可提供療程／關聯 FAQ」：那是據點單元的關聯，頁面沒有。
  fieldsBySlug: {
    dental: [
      { key: 'address', label: '地址', type: 'text', required: true, group: '基本資料', storedIn: 'bodyBlocks', hint: '頁面上的地圖是用這一格的地址定位的，要移動地圖請改地址。' },
      { key: 'phone', label: '電話', type: 'text', required: true, group: '基本資料', storedIn: 'bodyBlocks' },
      { key: 'lineUrl', label: 'LINE 連結', type: 'text', group: '基本資料', storedIn: 'bodyBlocks', hint: '留空就不顯示「LINE 專人諮詢」按鈕。' },
      { key: 'facebookUrl', label: 'Facebook 粉絲專頁', type: 'text', group: '基本資料', storedIn: 'bodyBlocks' },
      { key: 'registration', label: '掛號方式', type: 'text', group: '基本資料', storedIn: 'bodyBlocks', hint: '例如「現場掛號（健保）」。' },
      { key: 'summary', label: '摘要', type: 'textarea', group: '基本資料', hint: '頁首標題下方的那一段介紹。' },
      { key: 'transportInfo', label: '交通與停車', type: 'structured', group: '基本資料', structured: { ...clinicTransportSchema, preview: '「如何前往」那一區：一種交通方式一段。' }, storedIn: 'bodyBlocks',
        hint: '「開車」的說明會依序編號成路線步驟；「停車」顯示成路線下方的一行提示。' },
      { key: 'servicesNote', label: '主治項目說明', type: 'textarea', group: '主治項目', storedIn: 'bodyBlocks', hint: '「主治項目」標題下方的一句話。' },
      { key: 'services', label: '主治項目', type: 'structured', group: '主治項目', structured: dentalServicesSchema, storedIn: 'bodyBlocks' },
      {
        key: 'businessHours',
        label: '結構化營業時間',
        type: 'hours',
        group: '營業時間',
        storedIn: 'bodyBlocks',
        hint: '一天可以新增多列，用來表示午休等中斷時段；某一天完全不設列＝當天休診。',
      },
      { key: 'hoursNotes', label: '門診提醒', type: 'structured', group: '營業時間', structured: dentalHoursNotesSchema, storedIn: 'bodyBlocks' },
      { key: 'heroImage', label: '頁首照片', type: 'image', group: '圖片', storedIn: 'bodyBlocks', hint: '建議橫幅 5:3、寬 1200px 以上。沒有上傳時顯示預設的診間照片。' },
      { key: 'heroCaption', label: '頁首照片圖說', type: 'text', group: '圖片', storedIn: 'bodyBlocks' },
      { key: 'photos', label: '照片', type: 'gallery', group: '圖片', storedIn: 'bodyBlocks', hint: '院內環境那一區，建議三張、橫幅 5:3。一張都沒有時顯示預設的三張院內照片；只要傳了一張，就只顯示這裡的。' },
    ],
  },
  relations: [],
}
