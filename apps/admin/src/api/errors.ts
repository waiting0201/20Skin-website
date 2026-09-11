// API 錯誤型別。獨立成檔，讓 src/api/ 底下各區模組都能用而不必 import client.ts
// （那會造成循環相依：client.ts 匯入各區模組，各區模組又匯入 client.ts）。
//
// `code` 對應 docs/10-api.md §2 的錯誤碼值域；前端一律以 code 分支，不比對 message。
export class ApiError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}
