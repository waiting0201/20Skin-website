// 編輯畫面的標題列「釘在頂端」——長表單捲到一半時，發布與儲存要還在原地
// （Tim 指定 2026-09-18：「表單再往上滑的時候，右上角的發佈跟儲存按鈕也要停在右上」）。
//
// 釘住這件事本身是 CSS（`.adm-editor > .adm-page__head { position: sticky }`）。
// 這支只做一件 CSS 做不到的事：**把標題列實際的高度量出來，寫進 `--adm-page-head-h`**，
// 讓右欄的 sticky 頂端知道要讓開多少。
//
// 🔴 **為什麼不寫死一個數字**：標題列的高度會變 —— 標題長到換行、狀態徽章、
//    網址那一行有沒有、視窗寬度不同時 flex 換不換行，都會差上一整行。寫死的後果是
//    右欄卡片的上緣被標題列蓋掉一截（而且只在某些內容、某些視窗寬度下發生，
//    正是最難重現的那一種）。
//
// ⚠️ 量的是 `.adm-page__head` 自己，變數寫在最近的 `.adm-editor` 上 ——
//    右欄與標題列都在它底下，是兩者唯一的共同祖先。

import { onBeforeUnmount, ref, watch, type Ref } from 'vue'

export function useStickyHead(): { headRef: Ref<HTMLElement | null> } {
  const headRef = ref<HTMLElement | null>(null)
  let observer: ResizeObserver | undefined

  // ⚠️ 用 watch 而不是 onMounted：標題列包在 `v-if="record"` 裡（資料回來才算繪），
  //    掛載當下那個 ref 還是 null。
  watch(headRef, (el) => {
    observer?.disconnect()
    if (!el) return
    const apply = () => {
      const scope = el.closest('.adm-editor') as HTMLElement | null
      scope?.style.setProperty('--adm-page-head-h', `${Math.ceil(el.getBoundingClientRect().height)}px`)
    }
    apply()
    observer = new ResizeObserver(apply)
    observer.observe(el)
  }, { flush: 'post' })

  onBeforeUnmount(() => observer?.disconnect())

  return { headRef }
}
