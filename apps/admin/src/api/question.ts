// 未命中題目清單（docs/02 §6、docs/04-ai-faq.md §3、docs/08-database.md §F）
//
// ⚠️ 這是 mock 的骨架，由第二輪的畫面實作填滿。
// 持久化用 ./mock-store 開獨立的 store（理由見該檔案），**不要動 client.ts 的 Db**。
//
// 上層畫面只透過 client.ts 匯出的 adminApi 取用，不直接 import 這個檔。
// 接上 api.20skin.tw 時整支換掉，畫面不必改（docs/09-frontend.md §8）。
//
// ⚠️ 這是題庫成長的工作清單，不是搜尋日誌（docs/08 §F）：同一句話只有一列，
// 重複出現只累加 HitCount；不記錄誰在什麼時候搜的、不記 IP、不記 session。
// `Source=3`（聯絡表單提問）有硬界線：只寫問題文字本身，不寫姓名、電話、
// email，也不留任何能回連到送出者的欄位——這裡刻意不提供這些欄位，
// 讓呼叫端就算想傳也沒有地方放。
//
// ⚠️ 這是獨立畫面，不是 FAQ 題庫列表的一個篩選分頁（docs/02 §6 明文）。
// 「標記已建題」需要連到某一則 FAQ 內容（LinkedFaqContentItemId），但那份
// 資料在 client.ts 的 Db 裡——這個檔案不 import client.ts（避免循環相依，
// 見 account.ts 同樣的說明），改由呼叫端的 Vue 元件自己 import '@/api/client'
// 去建立／搜尋 FAQ，再把選定的 contentItemId 傳進 markCreated()。

import { createStore } from './mock-store'
import { ApiError } from './errors'

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
  normalizedText: string
  source: QuestionSource
  hitCount: number
  firstSeenAt: string
  lastSeenAt: string
  status: QuestionStatus
  linkedFaqContentItemId: number | null
  handledByUserId: number | null
  handledAt: string | null
}

export interface QuestionListQuery {
  status?: QuestionStatus
  source?: QuestionSource
  keyword?: string
}

interface QuestionDb {
  version: number
  nextId: number
  items: QuestionInboxRecord[]
}

const DB_VERSION = 1

/** docs/08 §F：`NormalizedText` = 去空白、轉小寫、全形轉半形後的比對鍵。 */
function normalize(text: string): string {
  const halfWidth = text.replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)).replace(/　/g, ' ')
  return halfWidth.replace(/\s+/g, '').toLowerCase()
}

function seed(): QuestionDb {
  const now = Date.now()
  const daysAgo = (n: number) => new Date(now - n * 86_400_000).toISOString()
  const rows: Omit<QuestionInboxRecord, 'normalizedText'>[] = [
    {
      id: 1,
      questionText: '皮秒雷射後可以曬太陽嗎',
      source: 1,
      hitCount: 12,
      firstSeenAt: daysAgo(30),
      lastSeenAt: daysAgo(1),
      status: 1,
      linkedFaqContentItemId: null,
      handledByUserId: null,
      handledAt: null,
    },
    {
      id: 2,
      questionText: '電波拉皮跟音波拉皮差在哪',
      source: 2,
      hitCount: 8,
      firstSeenAt: daysAgo(20),
      lastSeenAt: daysAgo(2),
      status: 1,
      linkedFaqContentItemId: null,
      handledByUserId: null,
      handledAt: null,
    },
    {
      id: 3,
      questionText: '請問二林院區有停車位嗎',
      source: 3, // ⚠️ 只有問題文字，不帶任何送出者資訊（docs/08 §F 的硬界線）
      hitCount: 3,
      firstSeenAt: daysAgo(15),
      lastSeenAt: daysAgo(5),
      status: 1,
      linkedFaqContentItemId: null,
      handledByUserId: null,
      handledAt: null,
    },
    {
      id: 4,
      questionText: '雷射術後多久可以化妝',
      source: 1,
      hitCount: 25,
      firstSeenAt: daysAgo(60),
      lastSeenAt: daysAgo(3),
      // 示範已處理：已建題並回填連結
      status: 2,
      linkedFaqContentItemId: 1, // 對應 mock-seed.ts 的 faq-1（皮秒雷射會痛嗎？），僅示意連結存在
      handledByUserId: 2,
      handledAt: daysAgo(3),
    },
    {
      id: 5,
      questionText: '有沒有推薦的醫美診所',
      source: 4,
      hitCount: 1,
      firstSeenAt: daysAgo(10),
      lastSeenAt: daysAgo(10),
      // 示範忽略：問題本身跟診所內容無關，不值得建題
      status: 3,
      linkedFaqContentItemId: null,
      handledByUserId: 2,
      handledAt: daysAgo(9),
    },
  ]
  return {
    version: DB_VERSION,
    nextId: rows.length + 1,
    items: rows.map((r) => ({ ...r, normalizedText: normalize(r.questionText) })),
  }
}

const store = createStore<QuestionDb>('question-inbox', seed, DB_VERSION)

function findOrThrow(id: number): QuestionInboxRecord {
  const found = store.read().items.find((i) => i.id === id)
  if (!found) throw new ApiError('NOT_FOUND', '找不到這筆提問。')
  return found
}

export const questionApi = {
  /** `GET /admin/question`。預設依出現次數（HitCount）由高到低——最多人問的先處理。 */
  async list(query: QuestionListQuery = {}): Promise<QuestionInboxRecord[]> {
    let items = [...store.read().items]
    if (query.status) items = items.filter((i) => i.status === query.status)
    if (query.source) items = items.filter((i) => i.source === query.source)
    if (query.keyword) {
      const kw = query.keyword.trim()
      if (kw) items = items.filter((i) => i.questionText.includes(kw))
    }
    return items.sort((a, b) => b.hitCount - a.hitCount || b.lastSeenAt.localeCompare(a.lastSeenAt))
  },

  /**
   * 模擬「站內搜尋無結果／AI FAQ 未命中」把一句提問寫回題庫：
   * 命中既有的 NormalizedText 就只累加 HitCount 與更新 LastSeenAt，
   * 否則新增一筆待處理。這不是後台畫面會呼叫的端點，是給前台那三個
   * 來源未來接上時參考的寫入形狀（docs/08 §F）。
   */
  async recordSighting(questionText: string, source: QuestionSource): Promise<QuestionInboxRecord> {
    const text = questionText.trim()
    if (!text) throw new ApiError('VALIDATION_REQUIRED', '問題內容為必填。')
    const key = normalize(text)
    return store.mutate((db) => {
      const existing = db.items.find((i) => i.normalizedText === key)
      const now = new Date().toISOString()
      if (existing) {
        existing.hitCount += 1
        existing.lastSeenAt = now
        if (existing.status === 3) existing.status = 1 // 忽略過的問題若又有人問，重新回到待處理
        return existing
      }
      const record: QuestionInboxRecord = {
        id: db.nextId++,
        questionText: text,
        normalizedText: key,
        source,
        hitCount: 1,
        firstSeenAt: now,
        lastSeenAt: now,
        status: 1,
        linkedFaqContentItemId: null,
        handledByUserId: null,
        handledAt: null,
      }
      db.items.push(record)
      return record
    })
  },

  /** `PATCH /admin/question/{id}`：標記為已建題並回填 LinkedFaqContentItemId。 */
  async markCreated(id: number, linkedFaqContentItemId: number, userId: number): Promise<QuestionInboxRecord> {
    findOrThrow(id)
    return store.mutate((db) => {
      const item = db.items.find((i) => i.id === id)!
      item.status = 2
      item.linkedFaqContentItemId = linkedFaqContentItemId
      item.handledByUserId = userId
      item.handledAt = new Date().toISOString()
      return item
    })
  },

  /** `PATCH /admin/question/{id}`：標記忽略（不值得建題的雜訊）。 */
  async ignore(id: number, userId: number): Promise<QuestionInboxRecord> {
    findOrThrow(id)
    return store.mutate((db) => {
      const item = db.items.find((i) => i.id === id)!
      item.status = 3
      item.handledByUserId = userId
      item.handledAt = new Date().toISOString()
      return item
    })
  },

  /** 退回待處理（例如誤按忽略、或誤連錯 FAQ 想重新處理）。 */
  async reopen(id: number): Promise<QuestionInboxRecord> {
    findOrThrow(id)
    return store.mutate((db) => {
      const item = db.items.find((i) => i.id === id)!
      item.status = 1
      item.linkedFaqContentItemId = null
      item.handledByUserId = null
      item.handledAt = null
      return item
    })
  },

  /** `DELETE /admin/question/{id}`：清掉明顯無意義的雜訊（不是常態動作）。 */
  async remove(id: number): Promise<void> {
    findOrThrow(id)
    store.mutate((db) => {
      db.items = db.items.filter((i) => i.id !== id)
    })
  },
}
