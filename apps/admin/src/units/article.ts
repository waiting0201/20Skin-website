// 單元宣告：文章 Article。docs/08-database.md §C-4。
import type { UnitDefinition } from '../unit-schema'
import { articleBodySchema } from './schemas/article'

export const articleUnit: UnitDefinition = {
  key: 'article',
  label: '文章',
  labelSingular: '文章',
  producesUrl: true, // /blog/{slug}/
  categoryTermType: 2,
  ownershipRestricted: true, // 醫師角色只能編輯自己署名的文章（AuthorDoctorId → OwnerUserId）
  listColumns: [
    { key: 'title', label: '標題' },
    { key: 'categoryTitle', label: '分類', render: 'text' },
    { key: 'displayDate', label: '顯示日期', render: 'date' },
    { key: 'status', label: '狀態', render: 'status' },
  ],
  fields: [
    { key: 'categoryTermId', label: '文章分類', type: 'relation-single', required: true, optionsFromTermType: 2, group: '基本資料', requiredOnCreate: true },
    { key: 'authorDoctorId', label: '作者（醫師）', type: 'relation-single', optionsFromUnit: 'doctor', group: '基本資料', hint: '作者為團隊成員時選這一欄。' },
    { key: 'authorName', label: '作者署名', type: 'text', group: '基本資料', hint: '作者非團隊成員時填寫；與「作者（醫師）」擇一。' },
    { key: 'reviewerDoctorId', label: '審閱醫師', type: 'relation-single', optionsFromUnit: 'doctor', group: '基本資料' },
    { key: 'reviewedOn', label: '審閱日期', type: 'date', group: '基本資料' },
    {
      key: 'displayDate',
      label: '對外顯示日期',
      type: 'date',
      required: true,
      group: '基本資料',
      hint: '⚠️ 與右側的「上線時間」是兩回事——這一欄是 datePublished 的來源，遷移文章時要帶入舊站原始日期。',
    },
    { key: 'cover', label: '封面圖', type: 'image', group: '圖片', hint: '建議尺寸 1600×1000（16:10）。' },
    { key: 'summary', label: '摘要', type: 'textarea', required: true, group: '內容' },
    { key: 'bodyBlocks', label: '內文', type: 'structured', required: true, group: '內容', structured: articleBodySchema },
    { key: 'readingMinutes', label: '閱讀時間（分鐘）', type: 'number', group: '內容', hint: '可由字數自動估算，此輪先手動填。' },
    {
      key: 'sourceSite',
      label: '來源網站',
      type: 'select',
      group: '遷移資訊',
      readOnly: true,
      options: [
        { value: '1', label: '主站 share.php' },
        { value: '2', label: '20skinblog.com' },
      ],
      hint: '唯讀。標示這篇文章是從哪個舊站搬過來的，供日後篩選使用。',
    },
  ],
  relations: [
    { key: 'treatments', label: '關聯療程', relationType: 3, targetUnit: 'treatment', sortable: true, editable: true },
    // RelationType=7（困擾→文章）從困擾端維護，這裡唯讀反向顯示。
    { key: 'concerns', label: '關聯困擾', relationType: 7, targetUnit: 'concern', sortable: false, editable: false },
    { key: 'tags', label: '標籤', relationType: 11, targetUnit: 'term', sortable: true, editable: true },
  ],
}
