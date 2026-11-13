// 單元宣告：據點 Clinic。docs/08-database.md §C-7
// （Clinics ＋ ClinicBusinessHours ＋ ClinicPhotos）。
import type { UnitDefinition } from '../unit-schema'
import { clinicTransportSchema } from './schemas/misc'
import { ledeSchema } from './schemas/shared'

export const clinicUnit: UnitDefinition = {
  key: 'clinic',
  label: '據點',
  labelSingular: '據點',
  producesUrl: true, // /clinics/{slug}/
  listColumns: [
    { key: 'title', label: '名稱' },
    { key: 'address', label: '地址', render: 'text' },
    { key: 'phone', label: '電話', render: 'text' },
    { key: 'status', label: '狀態', render: 'status' },
  ],
  fields: [
    { key: 'address', label: '地址', type: 'text', required: true, requiredOnCreate: true, group: '基本資料' },
    { key: 'phone', label: '電話', type: 'text', required: true, requiredOnCreate: true, group: '基本資料' },
    { key: 'lineUrl', label: 'LINE 連結', type: 'text', group: '基本資料' },
    // 🔴 頂層的 summary（content-fields.ts）。據點列表與品牌理念頁的院區卡片讀的就是這一句。
    { key: 'summary', label: '摘要', type: 'textarea', group: '基本資料', hint: '診所據點頁與品牌理念頁院區卡片上的那句說明；下方「簡介」留空時，據點頁的導言也用這一句。' },
    { key: 'latitude', label: '緯度', type: 'number', group: '地圖', hint: '提供給搜尋引擎的座標。頁面上的地圖是用「地址」定位的，要移動地圖請改地址。', requiredOnCreate: true },
    { key: 'longitude', label: '經度', type: 'number', group: '地圖', requiredOnCreate: true },
    { key: 'mapUrl', label: '地圖連結', type: 'text', group: '地圖' },
    { key: 'transportInfo', label: '交通與停車', type: 'structured', group: '基本資料', structured: clinicTransportSchema },
    { key: 'intro', label: '簡介', type: 'structured', group: '基本資料',
      structured: ledeSchema('據點頁主視覺底下那一句導言。⚠️ 留空不是「沒有導言」——前台會退回用「摘要」那一欄。') },
    {
      key: 'businessHours',
      label: '結構化營業時間',
      type: 'hours',
      group: '營業時間',
      hint: '一天可以新增多列，用來表示午休等中斷時段；某一天完全不設列＝當天休診。',
    },
    { key: 'photos', label: '照片', type: 'gallery', group: '圖片' },
  ],
  relations: [
    // 🔴 備註＝這位醫師在這個院區的時段說明，前台顯示在據點頁與醫師個人頁的「本院區時段」。
    //    2026-11-12 前這裡沒有開備註欄，那句話後台改不到。醫師那一端沒有門診表（見 doctor.ts）。
    { key: 'doctors', label: '駐診醫師', relationType: 8, targetUnit: 'doctor', sortable: true, editable: true,
      hasNote: true, noteLabel: '本院區時段（例：週一、三、五 上午）' },
    // 據點頁「本院區可提供的療程」那一區，依療程分類分組（2026-11-12 接上，之前挑了不會顯示）。
    { key: 'treatments', label: '可提供療程', relationType: 9, targetUnit: 'treatment', sortable: true, editable: true },
    { key: 'faqs', label: '關聯 FAQ', relationType: 10, targetUnit: 'faq', sortable: true, editable: true },
  ],
}
