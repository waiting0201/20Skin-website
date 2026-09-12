// 「單元宣告」的型別定義。docs/09-frontend.md §8：
// 「做成一組通用的 ListPage／EditPage ＋ 一份單元宣告，各模型只宣告自己的
// 欄位、清單欄與上傳提示」。
//
// 九個模型的實際宣告在 src/units/*.ts，本檔只定義「宣告要長什麼樣」。

import type { TermType, UnitKey } from './types'

export type FieldType =
  | 'text'
  | 'textarea'
  | 'richtext' // 區塊編輯器（docs/09 §8：內文以區塊結構儲存）。此輪先以文字區塊模擬，見 EditPage 註解
  | 'number'
  | 'date'
  | 'boolean'
  | 'select'
  | 'relation-single' // 單選外鍵，例如 Treatments.CategoryTermId、Cases.TreatmentId
  | 'image'
  | 'gallery'
  | 'repeater'
  | 'hours' // 星期 × 時段矩陣（docs/08 §C-7 ClinicBusinessHours）
  | 'tags' // 簡單字串陣列（docs/08 §C-2 DoctorTags，刻意不走 Terms）

export interface SelectOption {
  value: string
  label: string
}

/** repeater 欄位內的子欄位（例如醫師學經歷：型別 ＋ 文字）。 */
export interface RepeaterSubField {
  key: string
  label: string
  type: 'text' | 'select' | 'date' | 'time' | 'relation-single'
  options?: SelectOption[]
  /** relation-single 子欄位要指到哪個單元（例如看診時段的據點）。 */
  relationUnit?: UnitKey
}

export interface UnitField {
  key: string
  label: string
  type: FieldType
  required?: boolean
  /** 顯示在欄位下方的提示文字，含上傳尺寸提示（docs/09 §12 DoD）。 */
  hint?: string
  /** 字數建議下限／上限（療效類欄位常見，如 FAQ 網頁版答案 150–400 字）。 */
  minLength?: number
  maxLength?: number
  options?: SelectOption[]
  /** select／relation-single 動態從「分類與標籤」某個型別取值。 */
  optionsFromTermType?: TermType
  /** relation-single 動態從某個內容單元取值（例如文章的作者、案例的療程）。 */
  optionsFromUnit?: UnitKey
  repeaterFields?: RepeaterSubField[]
  /**
   * gallery 每一張圖除了「圖說」以外還要填的欄位。
   *
   * ⚠️ 案例圖片<b>一定要有</b>：`phase`（術前／術後）在 API 是必填，少了它整筆存檔會失敗
   * （docs/08 §C-5 CaseImages.Phase）。療程與據點的圖庫沒有這一層，留空即可。
   */
  galleryItemFields?: RepeaterSubField[]
  /** 編輯畫面分組，對應 EditPage 的 fieldset。 */
  group?: string
  /** 唯讀欄位：僅顯示，不可編輯（例如 Pages.SystemKey、Terms 的使用筆數）。 */
  readOnly?: boolean
  /**
   * 「建立後不可改，但**新增時必須給**」的欄位（`Terms.TermType`、`Pages.PageKind`）。
   *
   * ⚠️ 少了這個旗標，`readOnly` 會讓新增請求整個不帶這一欄，而 API 那頭它是必填 ——
   * 結果是「新增分類」按下去回 400，而且錯誤訊息指向一個畫面上根本改不了的欄位。
   */
  settableOnCreate?: boolean
  /** 高風險字詞即時警示要掃描的欄位（docs/02-backend-cms.md §5）。 */
  riskScan?: boolean
}

/** docs/08-database.md §D `ContentRelations.RelationType` 對照表。 */
export type RelationType = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12

export interface RelationField {
  key: string
  label: string
  relationType: RelationType
  /** 對方是哪個內容單元（用於帶出選擇器與清單）。 */
  targetUnit: UnitKey
  sortable: boolean
  /** 唯一有用途的單元：困擾「建議療程」的推薦理由（RelationType=5）。 */
  hasNote?: boolean
  noteLabel?: string
  /**
   * docs/08 §D：「雙向關聯一律單向存」。這個單元是不是 RelationType 的
   * From 端——是，這裡可編輯；不是（只是 To 端），畫面上唯讀顯示，
   * 真正的編輯入口在對方的編輯畫面。
   */
  editable: boolean
}

export interface UnitListColumn {
  key: string
  label: string
  /** 'field:xxx' 讀 fields[xxx]；'base:xxx' 讀共同欄位；預設等於 key。 */
  render?: 'text' | 'status' | 'date' | 'boolean'
}

export interface UnitDefinition {
  key: UnitKey
  label: string
  labelSingular: string
  /** 這個單元是否有分類篩選（清單頁的狀態／分類篩選）。 */
  categoryTermType?: TermType
  /** 醫師角色僅可編輯 OwnerUserId = 自己的內容（doctor／article，docs/10 §3.3）。 */
  ownershipRestricted?: boolean
  /** 是否有「系統鎖定」概念（page／term，IsSystemLocked）。 */
  systemAware?: boolean
  /** 這個單元本身是否輸出獨立網址（FAQ 不輸出，08 §C-6）。 */
  producesUrl: boolean
  fields: UnitField[]
  relations?: RelationField[]
  listColumns: UnitListColumn[]
}
