// 單元宣告：肌膚困擾 Concern。docs/08-database.md §C-3。
import type { UnitDefinition } from '../unit-schema'
import { concernRecommendationIntroSchema } from './schemas/concern'
import { bodyBlocksSchema } from './schemas/article'
import { concernLegacyBody } from './schemas/legacy-body'

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
    { key: 'summary', label: '摘要', type: 'textarea', group: '內容', hint: '困擾頁標題下方的導言，以及肌膚困擾總覽卡片上的說明。' },
    // 🔴 內文＝單一編輯器（Tim 指定 2026-11-11），取代原本的症狀／成因／自我判斷／何時就醫四欄。
    //    那四欄**不在畫面上、也不再送出**，資料庫裡的舊值留著（前台在內文為空時退回舊版型）。
    //    內文還是空的時候，編輯器先帶入那四欄換算出來的區塊，存檔後才生效。
    // ⚠️ 不是必填（理由同 2026-09-18 那次）：8 筆裡 7 筆是空的，必填會讓它們連換圖都存不了。
    {
      key: 'bodyBlocks',
      label: '內文',
      type: 'structured',
      group: '內容',
      structured: bodyBlocksSchema,
      legacyValue: concernLegacyBody,
      hint: '空著的話，困擾頁只會顯示上方的簡述與下方的建議療程。',
    },
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
