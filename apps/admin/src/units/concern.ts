// 單元宣告：肌膚困擾 Concern。docs/08-database.md §C-3。
import type { UnitDefinition } from '../unit-schema'
import {
  concernCausesSchema,
  concernRecommendationIntroSchema,
  concernSelfCheckSchema,
  concernSymptomsSchema,
  concernWhenToSeeDoctorSchema,
} from './schemas/concern'

export const concernUnit: UnitDefinition = {
  key: 'concern',
  label: '肌膚困擾',
  labelSingular: '肌膚困擾',
  producesUrl: true, // /concerns/{slug}/
  listColumns: [
    { key: 'title', label: '名稱' },
    { key: 'slug', label: 'Slug' },
    { key: 'status', label: '狀態', render: 'status' },
    { key: 'updatedAt', label: '更新時間', render: 'date' },
  ],
  fields: [
    // ⚠️ 不是必填（2026-09-18，同療程那兩欄）：正式資料 8 筆裡 7 筆是空的，
    //    而必填會讓那 7 筆連換圖都存不了，紅字卻指著這一欄。
    { key: 'symptoms', label: '症狀描述', type: 'structured', group: '內容', hint: '建議填寫：空著的話，困擾頁不會出現這一區。', structured: concernSymptomsSchema },
    { key: 'causes', label: '成因', type: 'structured', group: '內容', structured: concernCausesSchema },
    { key: 'selfCheckGuide', label: '自我判斷指引', type: 'structured', group: '內容', structured: concernSelfCheckSchema },
    { key: 'whenToSeeDoctor', label: '何時該就醫', type: 'structured', group: '內容', structured: concernWhenToSeeDoctorSchema },
    {
      key: 'recommendationIntro',
      label: '建議療程／諮詢醫師的區段引言',
      type: 'structured',
      group: '內容',
      structured: concernRecommendationIntroSchema,
      hint: '⚠️ 與下方每一筆關聯的「推薦理由」不是同一件事：那是逐筆的，這是整個區段的開場白。',
    },
    { key: 'cover', label: '封面圖', type: 'image', group: '圖片' },
  ],
  relations: [
    {
      key: 'treatments',
      label: '建議療程',
      relationType: 5,
      targetUnit: 'treatment',
      sortable: true,
      editable: true,
      hasNote: true,
      noteLabel: '推薦理由',
    },
    { key: 'faqs', label: '關聯 FAQ', relationType: 6, targetUnit: 'faq', sortable: true, editable: true },
    { key: 'articles', label: '關聯文章', relationType: 7, targetUnit: 'article', sortable: true, editable: true },
  ],
}
