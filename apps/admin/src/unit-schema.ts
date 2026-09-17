// 「單元宣告」的型別定義。docs/09-frontend.md §8：
// 「做成一組通用的 ListPage／EditPage ＋ 一份單元宣告，各模型只宣告自己的
// 欄位、清單欄與上傳提示」。
//
// 九個模型的實際宣告在 src/units/*.ts，本檔只定義「宣告要長什麼樣」。

import type { TermType, UnitKey } from './types'
import type { StructuredSchema } from './structured-schema'

export type FieldType =
  | 'text'
  | 'textarea'
  | 'longtext' // 比 textarea 高的純文字框（FAQ 的網頁版答案這種長文）。
               // ⚠️ 2026-09-17 由 'richtext' 更名：那個名字名不副實——它的實作一直只是
               //    textarea ＋ min-height，全後台從來沒有富文本。而原本標成 richtext 的
               //    欄位大多其實是「區塊 JSON」，那些已改用 'structured'。
  | 'structured' // 區塊 JSON：用 shape 宣告出表單，取代要人手打 JSON 的 textarea（見 structured-schema.ts）
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
  /**
   * 這一格在 API 是必填（例如案例圖片的 `phase`，docs/08 §C-5 NOT NULL）。
   * ⚠️ 標了它，`src/validation.ts` 才會在送出前擋下來；沒標的話症狀是
   * 「填完整張表單、按下儲存、整筆被退回」，而錯誤訊息指不到是哪一列。
   */
  required?: boolean
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
  /**
   * **新增那一刻** API 就要求要有值的欄位（`ContentHandler.Apply*Fields` 裡
   * `else if (isCreate) throw ValidationRequired` 的那一批）。
   *
   * 🔴 這與 `required` 是兩件事，不要合併：
   *    - `required` ＝ 這個欄位在編輯畫面上是必填（多半是內容完整性的要求，
   *      例如文章的內文）——**更新時**才擋。
   *    - `requiredOnCreate` ＝ 資料庫是 NOT NULL 且沒有預設值，**建立時**就得給。
   *
   * ⚠️ 少了這個標記的下場是實際發生過的：清單頁的「＋ 新增」直接呼叫
   *    `content.create()` 並把所有欄位填成空字串，於是新增文章／療程／案例／
   *    FAQ／據點**一按就 400**，而使用者連一個可以填的欄位都沒看到。
   */
  requiredOnCreate?: boolean
  /**
   * `type === 'structured'` 時的形狀宣告。
   * ⚠️ 形狀的真實來源是前台的型別（`apps/web/app/data/*.ts`），每一份 schema
   *    的檔頭都要註明對應的檔案與行號 —— 抄錯的症狀是前台那一區靜默消失。
   */
  structured?: StructuredSchema
  /**
   * `page.bodyBlocks` 專用：**依 slug** 分派不同的 schema。
   *
   * ⚠️ 是 slug 不是 systemKey —— 品牌理念、長版故事、法務三頁的 `SystemKey` 都是 null
   *    （它們是 `PageKind.Free`），前台 `apps/web/app/data/pages.ts` 查的也是 slug。
   * ⚠️ **查不到就沒有表單**，退回原始 JSON 模式。不要為未知頁面硬套一份 schema：
   *    套錯的結果是「表單看起來正常、填了、前台什麼都沒變」，比一個坦白的 JSON 框糟得多。
   */
  structuredBySlug?: Record<string, StructuredSchema>
  /**
   * 用 `structuredBySlug` 時必填：**查不到 schema 的情況下**，這一欄走哪一條寫入路徑。
   * ⚠️ 少了它，改掉 page 的 slug 之後下一次存檔會把整個內文欄位清空。
   */
  structuredWire?: StructuredSchema['wire']
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
