// 單元宣告：療程 Treatment。欄位對齊 docs/02-backend-cms.md §1 與
// docs/08-database.md §C-1（Treatments ＋ TreatmentImages）。
import type { UnitDefinition } from '../unit-schema'
import { labelValueSchema } from './schemas/shared'
import {
  treatmentAftercareSchema,
  treatmentContraindicationsSchema,
  treatmentIndicationsSchema,
  treatmentMechanismSchema,
  treatmentStepsSchema,
} from './schemas/treatment'

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
      hint: '⚠️ 換分類會改變這一頁的網址，系統會自動補一筆轉址，舊網址不會失效。',
    },
    { key: 'nameEn', label: '英文名', type: 'text', group: '基本資料' },
    { key: 'subtitle', label: '副標', type: 'text', group: '基本資料' },
    { key: 'indications', label: '適應症', type: 'structured', required: true, group: '療程內容', structured: treatmentIndicationsSchema },
    { key: 'mechanism', label: '原理', type: 'structured', group: '療程內容', structured: treatmentMechanismSchema },
    { key: 'durationText', label: '療程時間', type: 'text', group: '療程內容' },
    { key: 'sessionsText', label: '建議次數', type: 'text', group: '療程內容' },
    { key: 'steps', label: '療程流程', type: 'structured', group: '療程內容', hint: '當天會發生什麼事。與「原理」（為什麼有效）是細節頁上兩個不同的區塊。', structured: treatmentStepsSchema },
    { key: 'aftercare', label: '術後照護', type: 'structured', group: '療程內容', structured: treatmentAftercareSchema },
    {
      key: 'contraindications',
      label: '禁忌症與注意事項',
      type: 'structured',
      required: true,
      group: '療程內容',
      hint: '⚠️ 這一欄與本文都會即時提示高風險字詞，但系統不會擋下——送出前請自行確認文案。',
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
      hint: '⚠️ 與上面的「療程時間」「建議次數」重複是刻意的：那兩欄給列表與搜尋引擎單獨取用，這一欄是療程頁上的完整清單。🔴 這一欄也是「這個療程算不算寫完了」的判斷依據——空著的話整頁不會被搜尋引擎收錄。',
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
