// 清單頁「離開前長什麼樣」的記憶，只給「從編輯頁按返回」用。
//
// 🔴 **為什麼不放網址列。** 後台的 access token 只存在記憶體（`src/api/http.ts`：
//    重新整理分頁就會登出），所以「可貼上的清單網址」沒有意義 —— 貼過去的人
//    只會落在登入頁。既然重新整理就是登出，模組層的記憶與網址列能撐的一樣久，
//    而且不必把六個篩選條件塞進 query string 再解回來。
//
// ⚠️ **只在「按返回」那一條路上還原，不是每次進清單都還原。** 從側邊選單點進
//    「療程」卻看到上次篩到剩三筆的畫面，會被當成資料不見了。返回連結因此帶
//    `?restore=1`，清單頁只認那個旗標。
import type { ContentStatus, UnitKey } from './types'

export interface ListViewState {
  page: number
  keyword: string
  status: '' | ContentStatus
  categoryId: string
  termType: string
  onlyMine: boolean
}

const memory = new Map<UnitKey, ListViewState>()

export function rememberListView(unit: UnitKey, state: ListViewState): void {
  memory.set(unit, { ...state })
}

export function recallListView(unit: UnitKey): ListViewState | null {
  const found = memory.get(unit)
  return found ? { ...found } : null
}

/**
 * 從編輯頁返回清單要用的路徑。
 * ⚠️ 沒有記憶時**不要帶旗標** —— 帶了會讓清單頁去還原一個不存在的狀態，
 *    雖然結果一樣，但下一個讀這段程式的人會以為「有記憶卻沒還原」。
 */
export function listPathFor(unit: UnitKey): string {
  return recallListView(unit) ? `/${unit}?restore=1` : `/${unit}`
}
