// API 錯誤型別。獨立成檔，讓 src/api/ 底下各區模組都能用而不必 import client.ts
// （那會造成循環相依：client.ts 匯入各區模組，各區模組又匯入 client.ts）。
//
// `code` 對應 docs/10-api.md §2 的錯誤碼值域；前端一律以 code 分支，不比對 message。
export class ApiError extends Error {
  code: string

  /** 細節，對應信封的 `errors[]`（docs/10 §2：code 給程式判斷、message 給人看、errors 放細節）。 */
  details: string[]

  /** HTTP 狀態碼。0 代表請求根本沒送到（網路錯誤／CORS 被擋）。 */
  status: number

  constructor(code: string, message: string, details: string[] = [], status = 0) {
    super(message)
    this.code = code
    this.details = details
    this.status = status
  }
}

/**
 * ⚠️ CORS 失敗與斷線在瀏覽器端長得一模一樣 —— `fetch()` 只會 reject 一個沒有任何
 * 資訊的 TypeError，看不到狀態碼也看不到回應內容（docs/10 §2 提醒「4xx／5xx 也要帶
 * CORS 標頭」講的就是這個坑的另一半）。所以這裡的訊息刻意把兩種可能都講出來，
 * 不要改成只講其中一種。
 */
export const NETWORK_ERROR_CODE = 'NETWORK_ERROR'
