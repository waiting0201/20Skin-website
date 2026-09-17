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
    { key: 'latitude', label: '緯度', type: 'number', group: '地圖', hint: 'LocalBusiness schema 的 geo 需要。', requiredOnCreate: true },
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
      hint: '星期 × 時段矩陣，一天可有多列以表達午休斷點；某天完全沒有列＝休診。',
    },
    { key: 'photos', label: '照片', type: 'gallery', group: '圖片' },
  ],
  relations: [
    { key: 'doctors', label: '駐診醫師', relationType: 8, targetUnit: 'doctor', sortable: true, editable: true },
    { key: 'treatments', label: '可提供療程', relationType: 9, targetUnit: 'treatment', sortable: true, editable: true },
    { key: 'faqs', label: '關聯 FAQ', relationType: 10, targetUnit: 'faq', sortable: true, editable: true },
  ],
}
