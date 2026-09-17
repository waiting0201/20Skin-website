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
    { key: 'jobTitle', label: '職稱', type: 'text', required: true, group: '基本資料' },
    {
      key: 'isPhysician',
      label: '是否為醫師',
      type: 'boolean',
      required: true,
      requiredOnCreate: true,
      group: '基本資料',
      hint: '⚠️ 14 位團隊成員是 13 醫師 ＋ 1 藝術總監（安喬／許媖琄，兼執行長，非醫師）。這一欄決定前台「本文由 ○○ 醫師審閱」與 Physician JSON-LD 會不會掛錯人，不是預設全開。',
    },
    { key: 'specialty', label: '專科', type: 'text', group: '基本資料' },
    { key: 'photo', label: '大頭照', type: 'image', group: '基本資料', hint: '建議尺寸 900×1200（3:4 直式），對齊頭部裁切。' },
    {
      key: 'credentials',
      label: '學歷與經歷',
      type: 'repeater',
      group: '學經歷',
      hint: '可重複欄位。型別：現職／學歷／經歷／證照與學會資格。⚠️ 「現職」與「經歷」是個人頁時間軸上兩種不同的標籤，不要混用。',
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
    { key: 'tags', label: '專長標籤', type: 'tags', group: '學經歷', hint: '列表卡片上的標籤。刻意不走「分類與標籤」模型——專長標籤不產生 URL、不需要 SEO 欄位。' },
    { key: 'expertiseTags', label: '擅長項目', type: 'tags', group: '學經歷', hint: '個人頁的「擅長項目」區塊，與上面的專長標籤是兩個不同的區塊（DoctorTags.Type）。' },
    { key: 'bio', label: '簡介', type: 'structured', group: '簡介', structured: doctorBioSchema },
    { key: 'publications', label: '著作', type: 'structured', group: '簡介', structured: doctorPublicationsSchema },
    {
      key: 'schedules',
      label: '看診時段',
      type: 'repeater',
      group: '看診資訊',
      hint: '對應 DoctorSchedules：據點 × 星期 × 時段。',
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
