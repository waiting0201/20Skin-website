// 驗證沒過時，把畫面帶到第一個出錯的欄位。
//
// 為什麼需要它：後台的表單很長（療程有 7 個區塊 JSON 欄位、一篇文章上百個區塊），
// 而儲存按鈕是**釘在頂端**的（admin.css §14）——按下去的那一刻，出錯的那一格
// 幾乎一定在畫面外。紅字寫得再清楚，看不到就等於沒寫，使用者看到的只有頂端
// 一句「有 3 個欄位需要修正」，然後得自己捲著找。
//
// 🔴 **這支只負責「帶過去」，不負責「顯示」**。紅字本身仍然由每個欄位自己的
//    `.adm-field__error` 渲染（那是 `role="alert"`，讀屏軟體靠它）。兩件事分開，
//    少任何一件都不完整：只有紅字＝找不到；只有捲動＝到了也不知道錯在哪。
//
// ⚠️ 錨點是 `data-error-key`，值要與 `FieldErrors` 的鍵**一模一樣**，包含
//    `bodyBlocks[3].image` 這種路徑。加了新欄位卻忘了加錨點不會壞掉，
//    只是退回「捲不過去」——見 `anchorFor()` 的逐段退回。

import { nextTick } from 'vue'

/** 欄位錨點的屬性名。模板上寫 `:data-error-key="…"`。 */
const ANCHOR_ATTR = 'data-error-key'

/** 捲到位之後，欄位上緣與（釘住的）標題列之間留的空隙。 */
const GAP = 16

/**
 * 找出某個錯誤鍵對應的欄位。
 *
 * ⚠️ **找不到就逐段退到父層**：`bodyBlocks[3].image` → `bodyBlocks[3]` → `bodyBlocks`。
 *    結構化欄位的深層路徑不見得每一層都有錨點（例如純量節點本身沒有外框），
 *    退到看得到的那一層，至少人會被帶到正確的區塊。
 *
 * ⚠️ 用 `querySelectorAll` 再比對屬性值，不組 CSS 選擇器 —— 鍵裡有 `[`、`]`、`.`，
 *    拼進選擇器要跳脫，而數量本來就只有幾十個，比對一遍更便宜也更不會錯。
 */
function anchorFor(key: string, root: ParentNode): HTMLElement | null {
  const all = [...root.querySelectorAll<HTMLElement>(`[${ANCHOR_ATTR}]`)]
  let path = key
  while (path) {
    const hit = all.find((el) => el.getAttribute(ANCHOR_ATTR) === path)
    if (hit) return hit
    const cut = Math.max(path.lastIndexOf('.'), path.lastIndexOf('['))
    if (cut <= 0) return null
    path = path.slice(0, cut)
  }
  return null
}

/**
 * 捲到位時要讓開多少：固定的頂列 ＋ 釘在頂端的編輯頁標題列。
 *
 * 🔴 **不可以寫死數字**，理由與 `src/sticky-head.ts` 同一條：標題列的高度會隨
 *    標題換行與視窗寬度變。這裡直接量現在畫面上的那兩個元素。
 * ⚠️ 兩者都要確認 `position: sticky` 才算 —— 窄螢幕下它們不一定還釘著。
 */
function stickyOffset(el: HTMLElement): number {
  let offset = GAP
  const topbar = document.querySelector<HTMLElement>('.adm-topbar')
  if (topbar && getComputedStyle(topbar).position === 'sticky') offset += topbar.offsetHeight
  // 🔴 `:scope >` 不可省，理由同 admin.css：`.adm-page__head` 在首頁版位那一頁
  //    還被當成卡片內的標題列用，抓錯會量到一個根本沒有釘住的東西。
  const head = el.closest('.adm-editor')?.querySelector<HTMLElement>(':scope > .adm-page__head')
  if (head && getComputedStyle(head).position === 'sticky') offset += head.offsetHeight
  return offset
}

/** 欄位裡第一個可以打字／選擇的控制項（沒有就不 focus，例如整段是圖片上傳）。 */
function focusableIn(el: HTMLElement): HTMLElement | null {
  const control = el.querySelector<HTMLElement>(
    'input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])',
  )
  return control ?? null
}

/**
 * 把畫面帶到 `errors` 裡**位置最上面**的那一個欄位，並把游標放進去。
 *
 * ⚠️ 挑的是「畫面上最上面」而不是物件的第一個鍵 —— 兩者多半一致，但
 *    結構化欄位的細部錯誤是 `Object.assign` 併進來的，順序不保證跟著版面走。
 *
 * ⚠️ **要等 DOM**：紅字是這一刻才渲染的，摺疊起來的區塊也是這一刻才被展開
 *    （見 StructuredField.vue 的 watch），量太早會量到舊的版面。
 *
 * @param root 限定搜尋範圍（同一頁有兩張表單時用，例如 EditPage 的本文與 SEO）。
 * @returns 有沒有真的找到欄位。沒有錨點的表單會回 false，頂端那句總結訊息
 *          因此不能省 —— 它仍然是那種情況下唯一的線索。
 */
export async function revealFirstError(
  errors: Record<string, string>,
  root: ParentNode = document,
): Promise<boolean> {
  const keys = Object.keys(errors)
  if (!keys.length) return false

  // 兩次：第一次等紅字與展開後的摺疊列渲染，第二次等那些新節點影響到的版面。
  await nextTick()
  await nextTick()

  const found = keys
    .map((key) => anchorFor(key, root))
    .filter((el): el is HTMLElement => el !== null)
  if (!found.length) return false

  const target = found.reduce((top, el) =>
    el.getBoundingClientRect().top < top.getBoundingClientRect().top ? el : top)

  // 🔴 `preventScroll` 不可省：瀏覽器自己的 focus 捲動不認得釘住的標題列，
  //    會把欄位剛好停在它底下（看起來就像「跳過去了但什麼都沒有」）。
  focusableIn(target)?.focus({ preventScroll: true })

  const offset = stickyOffset(target)
  const rect = target.getBoundingClientRect()
  // 已經整個在可視範圍內（而且沒被標題列蓋住）就不要捲 —— 無謂的跳動很干擾。
  const visible = rect.top >= offset && rect.bottom <= window.innerHeight
  if (!visible) {
    const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: Math.max(0, rect.top + window.scrollY - offset), behavior: smooth ? 'smooth' : 'auto' })
  }
  return true
}
