// 清單頁「離開前長什麼樣」的記憶，只給「從編輯頁按返回」用。
//
// 🔴 **為什麼不放網址列。** 這份記憶只服務「編輯頁 → 按返回」那一段來回，那段路
//    不跨越重新整理，模組層的變數就夠用，不必把六個篩選條件塞進 query string 再解回來。
//    ⚠️ 2026-09-18 起重新整理**不會**登出了（refresh token 放 sessionStorage），
//    所以「可貼上的清單網址」不再是沒有意義 —— 但那是另一件事（分享一個篩選好的清單），
//    要做就是獨立做，不要把這份記憶硬改成網址同步。
//    連帶：**重新整理之後這份記憶是空的**（模組變數隨頁面一起重來），
//    畫面會回到該單元的預設清單 —— 這是預期行為，不是 bug。
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
