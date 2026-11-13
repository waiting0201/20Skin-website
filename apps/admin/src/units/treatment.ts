// 單元宣告：療程 Treatment。欄位對齊 docs/02-backend-cms.md §1 與
// docs/08-database.md §C-1（Treatments ＋ TreatmentImages）。
import type { UnitDefinition } from '../unit-schema'
import { labelValueSchema } from './schemas/shared'
import {
  treatmentAftercareSchema,
  treatmentContraindicationsSchema,
  treatmentIndicationsSchema,
  treatmentStepsSchema,
} from './schemas/treatment'
import { bodyBlocksSchema } from './schemas/article'
import { treatmentLegacyMechanism } from './schemas/legacy-body'

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
    { key: 'summary', label: '摘要', type: 'textarea', group: '基本資料', hint: '療程卡片上的那句簡述（療程分類頁、困擾頁與案例頁的相關療程）。' },
    {
      key: 'categoryTermId',
      label: '療程分類',
      type: 'relation-single',
      required: true,
      requiredOnCreate: true,
      optionsFromTermType: 1,
      group: '基本資料',
      hint: '⚠️ 換分類會改變這一頁的網址，系統會自動補一筆轉址，舊網址不會失效。',
    },
    { key: 'nameEn', label: '英文名', type: 'text', group: '基本資料' },
    { key: 'subtitle', label: '副標', type: 'text', group: '基本資料' },
    // 🔴 **適應症與禁忌症 2026-09-18 起不是必填**（Tim 定案，困擾的「症狀描述」同）。
    //    正式資料 27/28 筆的禁忌症是空的（28 項的療程時間／術後照護／禁忌症都還等
    //    醫師撰寫），而必填的檢查跑在上傳與送出**之前** —— 於是那 27 筆連換一張圖
    //    都存不了，紅字還指著另一個欄位，看起來像是圖片壞掉。
    //    API 那頭本來就允許 null，這道門檻是後台自己加的。
    //    ⚠️ 提示留著：空著不會擋存檔，但前台那一區整段不渲染。
    { key: 'indications', label: '適應症', type: 'structured', group: '療程內容', hint: '建議填寫：空著的話，療程頁不會出現「適應症」這一區。', structured: treatmentIndicationsSchema },
    // 🔴 原理＝單一編輯器（Tim 指定 2026-11-12，與困擾、案例的內文同一套，決策 32），
    //    取代原本的「區段標題／段落／搭配圖」三格。舊欄位 `mechanism` **不在畫面上、也不再送出**，
    //    資料庫裡的舊值留著：`mechanismBlocks` 是空的時候前台與 AiChunker 退回舊的左右分欄版型。
    //    還沒在編輯器存過的那一筆，打開時先帶入舊欄位換算出來的區塊，存檔＋發布後才生效。
    {
      key: 'mechanismBlocks',
      label: '原理',
      type: 'structured',
      group: '療程內容',
      structured: bodyBlocksSchema,
      legacyValue: treatmentLegacyMechanism,
      hint: '空著的話，療程頁不會出現「原理」這一區。',
    },
    // ⚠️ 這兩格**療程頁上不顯示**（頁面上的時間與次數是下方「規格數據列」裡的列），
    //    讀它們的是 AI 問答的語料（functions/Common/AiChunker.cs）。hint 要講清楚，
    //    不然就是「填了、發布了、頁面沒變」（tools/admin-e2e/field-effect.mjs 2026-11-12 查到）。
    { key: 'durationText', label: '療程時間', type: 'text', group: '療程內容', hint: '給站內 AI 問答引用，療程頁上不顯示。頁面上要出現請填在下方的「規格數據列」。' },
    { key: 'sessionsText', label: '建議次數', type: 'text', group: '療程內容', hint: '給站內 AI 問答引用，療程頁上不顯示。頁面上要出現請填在下方的「規格數據列」。' },
    { key: 'steps', label: '療程流程', type: 'structured', group: '療程內容', hint: '當天會發生什麼事。與「原理」（為什麼有效）是細節頁上兩個不同的區塊。', structured: treatmentStepsSchema },
    { key: 'aftercare', label: '術後照護', type: 'structured', group: '療程內容', structured: treatmentAftercareSchema },
    {
      key: 'contraindications',
      label: '禁忌症與注意事項',
      type: 'structured',
      group: '療程內容',
      hint: '建議填寫：空著的話，療程頁不會出現「禁忌症」這一區，頁內的目錄也不會有它。',
      structured: treatmentContraindicationsSchema,
    },
    // ⚠️ 原本是**單行 text**，但實際存的是 `{label,value}[]`（27/28 筆）——
    //    也就是要在一行輸入框裡打出一整個 JSON 陣列。
    { key: 'deviceInfo', label: '儀器／原廠資訊', type: 'structured', group: '療程內容',
      structured: labelValueSchema('項目', '細節頁「儀器與原廠資訊」那張兩欄表格（廠牌、機型、許可證字號…）。') },
    {
      key: 'facts',
      label: '規格數據列',
      type: 'structured',
      group: '療程內容',
      hint: '療程頁上的完整規格清單（上面的「療程時間」「建議次數」只給站內 AI 問答用）。',
      structured: labelValueSchema('規格', '細節頁「規格數據」那張兩欄表格，照順序整列渲染。'),
    },
    { key: 'cover', label: '封面圖', type: 'image', group: '圖片', hint: '建議尺寸 1200×900（4:3）。' },
    { key: 'images', label: '圖庫', type: 'gallery', group: '圖片', hint: '可多張、可排序、每張可加圖說。' },
  ],
  relations: [
    { key: 'doctors', label: '關聯醫師', relationType: 1, targetUnit: 'doctor', sortable: true, editable: true },
    { key: 'concerns', label: '關聯困擾', relationType: 2, targetUnit: 'concern', sortable: true, editable: true },
    { key: 'articles', label: '關聯文章', relationType: 3, targetUnit: 'article', sortable: true, editable: true },
    { key: 'faqs', label: '關聯 FAQ', relationType: 4, targetUnit: 'faq', sortable: true, editable: true },
  ],
}
