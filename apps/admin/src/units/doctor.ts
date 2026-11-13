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
    { key: 'summary', label: '摘要', type: 'textarea', group: '基本資料', hint: '醫師個人頁主視覺的導言，以及文章底下的作者簡介。' },
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
    // 🔴 沒有「看診時段」那張表（2026-11-12 拿掉，field-effect.mjs 查到的）。
    //    前台從來不讀 `DoctorSchedules`：醫師在哪個院區看診、該院區的時段說明，
    //    讀的是**據點那一端**的「駐診醫師」關聯與它的備註（apps/web/app/data/doctors.ts）。
    //    在這裡逐列填星期與時間，存得進去，個人頁與據點頁一個字都不會變。正式資料 0 列。
    //    資料表與 API 欄位留著；不在這裡宣告＝存檔時不送，API 不會動它。
  ],
  relations: [
    // RelationType=1（療程→醫師）從療程端維護；這裡是唯讀的反向顯示，
    // 「雙向關聯一律單向存」（docs/08 §D）。
    { key: 'treatments', label: '關聯療程', relationType: 1, targetUnit: 'treatment', sortable: false, editable: false },
    // 🔴 困擾頁「相關醫師」那一區的名單就是這個關聯（RelationType=13，存在醫師這一端）。
    //    2026-11-13 前後台沒有任何入口：困擾那邊改得到那一區的開場白，卻增減不了醫師。
    { key: 'concerns', label: '相關肌膚困擾（這位醫師會列在該困擾頁的「相關醫師」）', relationType: 13, targetUnit: 'concern', sortable: true, editable: true },
  ],
}
