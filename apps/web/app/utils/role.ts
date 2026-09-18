// 職稱字串 → 逐行職稱。
//
// 後台的職稱欄位是多行文字框（apps/admin/src/units/doctor.ts），一行一個職稱；
// 主視覺頭銜（bio.heroRole）同理。前台的醫師卡與個人頁主視覺逐行顯示。
//
// ⚠️ 全形中點「・」也算分隔符 —— 那是搬遷進資料庫之前的寫法（「院長・皮膚科專科醫師」），
//    而且這個 codebase 本來就已經把它當分隔符用（team/[slug].vue 拿第一段當 SEO 標題）。
//    吃這一種的好處是舊資料不必改就會正確斷行；代價是職稱本身不能含中點，實務上不會。

const SEPARATOR = /[\r\n・]+/

/** 逐行職稱。空字串、undefined、只有分隔符的字串一律回空陣列。 */
export function roleLines(raw?: string | null): string[] {
  if (!raw) return []
  return raw
    .split(SEPARATOR)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

/**
 * 壓回單行，用中點串接。
 *
 * ⚠️ alt、meta description、JSON-LD 這類不能有換行的地方一律走這一支 ——
 *    原始字串直接內嵌的話，換行在 HTML 裡會塌成一個空格（「院長 皮膚科專科醫師」）。
 */
export function roleText(raw?: string | null): string {
  return roleLines(raw).join('・')
}
