// 單元宣告：肌膚困擾 Concern。docs/08-database.md §C-3。
import type { UnitDefinition } from '../unit-schema'

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
    { key: 'symptoms', label: '症狀描述', type: 'textarea', required: true, group: '內容' },
    { key: 'causes', label: '成因', type: 'textarea', group: '內容' },
    { key: 'selfCheckGuide', label: '自我判斷指引', type: 'textarea', group: '內容' },
    { key: 'whenToSeeDoctor', label: '何時該就醫', type: 'textarea', group: '內容' },
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
