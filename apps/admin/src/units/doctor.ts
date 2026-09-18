// 單元宣告：醫師 Doctor。docs/08-database.md §C-2
// （Doctors ＋ DoctorTags ＋ DoctorCredentials ＋ DoctorSchedules）。
import type { UnitDefinition } from '../unit-schema'
import { doctorBioSchema, doctorPublicationsSchema } from './schemas/misc'

export const doctorUnit: UnitDefinition = {
  key: 'doctor',
  label: '醫師',
  labelSingular: '醫師',
  producesUrl: true, // /team/{slug}/
  ownershipRestricted: true, // 醫師角色只能編輯自己的個人頁（OwnerUserId）
  listColumns: [
    { key: 'title', label: '姓名' },
    { key: 'jobTitle', label: '職稱', render: 'text' },
    { key: 'isPhysician', label: '醫師？', render: 'boolean' },
    { key: 'status', label: '公開／隱藏', render: 'status' },
    { key: 'sortOrder', label: '排序' },
  ],
  fields: [
    // 一行一個職稱：前台的醫師卡與個人頁主視覺會逐行顯示（apps/web/app/utils/role.ts）。
    // ⚠️ maxLength 只是「建議字數」提示，不是硬上限 —— 真正的上限是 Doctors.JobTitle
    //    的 nvarchar(300)（migration WidenDoctorJobTitle），而 API 那一層不驗長度，
    //    超過就是 SQL 例外、存檔收到一個看不出原因的 500。
    { key: 'jobTitle', label: '職稱', type: 'textarea', required: true, group: '基本資料', maxLength: 300, hint: '一行一個職稱，前台會逐行顯示。' },
    {
      key: 'isPhysician',
      label: '是否為醫師',
      type: 'boolean',
      required: true,
      requiredOnCreate: true,
      group: '基本資料',
      hint: '⚠️ 團隊 14 位成員裡有 1 位不是醫師（藝術總監安喬／許媖琄，兼執行長）。這一欄決定前台會不會出現「本文由 ○○ 醫師審閱」，也會告訴搜尋引擎這個人是醫師，不是預設全開。',
    },
    { key: 'specialty', label: '專科', type: 'text', group: '基本資料' },
    { key: 'photo', label: '大頭照', type: 'image', group: '基本資料', hint: '建議尺寸 900×1200（3:4 直式），對齊頭部裁切。' },
    {
      key: 'credentials',
      label: '學歷與經歷',
      type: 'repeater',
      group: '學經歷',
      hint: '可以新增多筆，每筆選一種：現職／學歷／經歷／證照與學會資格。⚠️ 「現職」與「經歷」在個人頁上是時間軸的兩種不同標籤，不要混用。',
      repeaterFields: [
        {
          key: 'type',
          label: '類型',
          type: 'select',
          options: [
            { value: '4', label: '現職' },
            { value: '1', label: '學歷' },
            { value: '2', label: '經歷' },
            { value: '3', label: '證照與學會資格' },
          ],
        },
        { key: 'text', label: '內容', type: 'text' },
      ],
    },
    // ⚠️ 兩個欄位的名稱要與前台對得上（`apps/web/app/pages/team/`）：
    //    專長標籤＝醫師列表頁的卡片標籤與篩選按鈕，擅長項目那一欄在前台的標題是
    //    **「專長領域」**，2026-09-18 起後台跟著改名。**改一邊就要改另一邊。**
    // 🔴 篩選按鈕那四個詞是寫死在前台的（index.vue 的 `FOCUS_TABS`），
    //    標籤打錯字不會有任何錯誤，只是那位醫師從該分頁消失 —— hint 要講這件事。
    { key: 'tags', label: '專長標籤', type: 'tags', group: '學經歷', hint: '顯示在醫師列表頁的卡片上，也是列表頁上方「皮膚疾病／雷射光電／注射微整／體態管理」四個篩選按鈕的依據 —— 要被篩到，用字必須與按鈕完全相同。直接打字即可，不必先到「分類與標籤」建立。' },
    { key: 'expertiseTags', label: '專長領域', type: 'tags', group: '學經歷', hint: '顯示在醫師個人頁的「專長領域」區，與上面的專長標籤是兩組不同的標籤。這裡留空的話，那一區會改為顯示上面的專長標籤。' },
    { key: 'bio', label: '簡介', type: 'structured', group: '簡介', structured: doctorBioSchema },
    // ⚠️ 名稱要與前台那一區的標題一致（`apps/web/app/pages/team/[slug].vue` 的
    //    「著作與演講」）。2026-09-18 之前後台叫「著作」、前台叫「媒體報導與演講授課」
    //    —— 同一份資料兩個名字，院方看不出它會出現在哪裡。**改一邊就要改另一邊。**
    { key: 'publications', label: '著作與演講', type: 'structured', group: '簡介', structured: doctorPublicationsSchema, hint: '顯示在醫師個人頁的「著作與演講」區。' },
    {
      key: 'schedules',
      label: '看診時段',
      type: 'repeater',
      group: '看診資訊',
      hint: '這位醫師在各據點的看診時段。',
      repeaterFields: [
        { key: 'clinicId', label: '看診據點', type: 'relation-single', relationUnit: 'clinic' },
        {
          key: 'dayOfWeek',
          label: '星期',
          type: 'select',
          options: [
            { value: '1', label: '週一' },
            { value: '2', label: '週二' },
            { value: '3', label: '週三' },
            { value: '4', label: '週四' },
            { value: '5', label: '週五' },
            { value: '6', label: '週六' },
            { value: '0', label: '週日' },
          ],
        },
        { key: 'startTime', label: '開始時間', type: 'time' },
        { key: 'endTime', label: '結束時間', type: 'time' },
      ],
    },
  ],
  relations: [
    // RelationType=1（療程→醫師）從療程端維護；這裡是唯讀的反向顯示，
    // 「雙向關聯一律單向存」（docs/08 §D）。
    { key: 'treatments', label: '關聯療程', relationType: 1, targetUnit: 'treatment', sortable: false, editable: false },
  ],
}
