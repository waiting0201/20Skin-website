// 未命中題目清單（docs/02 §6、docs/04-ai-faq.md §3、docs/08-database.md §F）
//
// 上層畫面只透過 client.ts 匯出的 adminApi 取用，不直接 import 這個檔。
//
// ⚠️ 這是題庫成長的工作清單，不是搜尋日誌（docs/08 §F）：同一句話只有一列，
// 重複出現只累加 HitCount；不記錄誰在什麼時候搜的、不記 IP、不記 session。
// `Source=3`（聯絡表單提問）有硬界線：只寫問題文字本身，不寫姓名、電話、
// email，也不留任何能回連到送出者的欄位 —— DTO 裡刻意沒有這些欄位。
//
// ⚠️ 這是獨立畫面，不是 FAQ 題庫列表的一個篩選分頁（docs/02 §6 明文）。
//
// ⚠️ 「把一句提問寫回題庫」是**前台**的事（`POST /questions/miss`，匿名 ＋ 需要
// 機器人驗證），不在後台門面裡 —— 後台沒有任何畫面會製造提問。

import { normalizePaged, request, type ServerPaged } from './http'

/** 1 站內搜尋無結果／2 AI FAQ 未命中／3 聯絡表單提問／4 手動輸入（LINE 常見詢問）。 */
export type QuestionSource = 1 | 2 | 3 | 4
export const SOURCE_LABEL: Record<QuestionSource, string> = {
  1: '站內搜尋無結果',
  2: 'AI FAQ 未命中',
  3: '聯絡表單提問',
  4: '手動輸入（LINE 常見詢問）',
}

/** 1 待處理／2 已建題／3 忽略。 */
export type QuestionStatus = 1 | 2 | 3
export const QUESTION_STATUS_LABEL: Record<QuestionStatus, string> = {
  1: '待處理',
  2: '已建題',
  3: '忽略',
}

export interface QuestionInboxRecord {
  id: number
  questionText: string
  /**
   * 比對鍵（去空白、轉小寫、全形轉半形）。
   * ⚠️ 正規化與去重都在**伺服器端**做（docs/10 §3.1）——前端算一份只會有兩套規則。
   * API 不回這一欄，這裡留著只是為了不動呼叫端的型別，值一律是空字串。
   */
  normalizedText: string
  source: QuestionSource
  hitCount: number
  firstSeenAt: string
  lastSeenAt: string
  status: QuestionStatus
  linkedFaqContentItemId: number | null
  /** 已建題時連到的那一則 FAQ 標題，由 API 一併帶回（避免逐列再查一次）。 */
  linkedFaqTitle: string | null
  handledByUserId: number | null
  handledByUserName: string | null
  handledAt: string | null
}

export interface QuestionListQuery {
  status?: QuestionStatus
  source?: QuestionSource
  keyword?: string
}

interface ServerQuestion {
  id: number
  questionText: string
  source: number
  hitCount: number
  firstSeenAt: string
  lastSeenAt: string
  status: number
  linkedFaqContentItemId: number | null
  linkedFaqTitle: string | null
  handledByUserId: number | null
  handledByUserName: string | null
  handledAt: string | null
}

function toRecord(row: ServerQuestion): QuestionInboxRecord {
  return {
    id: row.id,
    questionText: row.questionText,
    normalizedText: '',
    source: row.source as QuestionSource,
    hitCount: row.hitCount,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    status: row.status as QuestionStatus,
    linkedFaqContentItemId: row.linkedFaqContentItemId,
    linkedFaqTitle: row.linkedFaqTitle,
    handledByUserId: row.handledByUserId,
    handledByUserName: row.handledByUserName,
    handledAt: row.handledAt,
  }
}

export const questionApi = {
  /**
   * `GET /admin/question`。排序由 API 決定：待處理優先、再依出現次數 —— 最多人問的先處理。
   *
   * ⚠️ 三個篩選條件（狀態／來源／關鍵字）全部交給 API 在 SQL 層過濾。
   * 在前端過濾只會搜到當頁那幾筆（docs/10 §2）。
   */
  async list(query: QuestionListQuery = {}): Promise<QuestionInboxRecord[]> {
    const paged = normalizePaged(
      await request<ServerPaged<ServerQuestion>>('/admin/question', {
        query: { status: query.status, source: query.source, keyword: query.keyword?.trim(), page: 1, pageSize: 100 },
      }),
    )
    return paged.items.map(toRecord)
  },

  /** `PATCH /admin/question/{id}`：標記為已建題並回填 LinkedFaqContentItemId。 */
  async markCreated(id: number, linkedFaqContentItemId: number, _userId: number): Promise<void> {
    await request<null>(`/admin/question/${id}`, { method: 'PATCH', body: { status: 2, linkedFaqContentItemId } })
  },

  /** `PATCH /admin/question/{id}`：標記忽略（不值得建題的雜訊）。 */
  async ignore(id: number, _userId: number): Promise<void> {
    await request<null>(`/admin/question/${id}`, { method: 'PATCH', body: { status: 3 } })
  },

  /** 退回待處理（誤按忽略、或誤連錯 FAQ 想重新處理）。 */
  async reopen(id: number): Promise<void> {
    await request<null>(`/admin/question/${id}`, { method: 'PATCH', body: { status: 1, linkedFaqContentItemId: null } })
  },

  /** `DELETE /admin/question/{id}`：清掉明顯無意義的雜訊（不是常態動作）。 */
  async remove(id: number): Promise<void> {
    await request<null>(`/admin/question/${id}`, { method: 'DELETE' })
  },
}
