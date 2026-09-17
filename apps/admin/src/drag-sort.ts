// 拖曳排序：三個「整頁就是在排序」的畫面共用（內容清單、首頁版位、導覽選單）。
//
// 2026-09-17 取代原本的上／下移動按鈕（Tim 指定）。三處的資料層都**不用改**——
// `adminApi.content.sort(unit, orderedIds)`、`home.reorderSections(orderedKeys)`、
// `site.menu.reorder(menuKey, orderedIds)` 收的都是「整串新順序」，所以拖到任意
// 位置與原本一次移動一格走的是同一條路。
//
// 🔴 **用原生 HTML5 拖放，不引第三方套件。** 後台的相依樹目前只有 vue 與
//    vue-router（apps/admin/package.json），為了一個排序互動加一顆
//    sortable 套件不划算，而原生 API 這裡要的四件事都做得到。
//
// ⚠️ **一定要用「把手」起拖，不能讓整列直接 draggable。** 三個畫面的列裡面都有
//    輸入框（選單的項目名稱、版位的標題），整列 draggable 會讓那些欄位連字都選
//    不起來——按下去就被當成要拖整列。作法是：按住把手才把那一列設成 draggable
//    （`armed`），放開或拖完就收回。
//
// ⚠️ **原生拖放在觸控裝置上不會觸發**（沒有 touch 的對應事件）。後台是工作站
//    工具，RWD 只求「看得到、按得到」（admin.css §17），這是已知且接受的限制；
//    ↑↓ 按鈕已依指示移除，日後若要補鍵盤／觸控支援是獨立的一件事。
//
// ⚠️ **同一頁可以有很多組互不相干的清單**（選單頁：主選單頂層、頁尾頂層，
//    以及每個頂層項目底下的子項目各一組）。所以每個 API 都帶 `group`，跨組拖曳
//    一律忽略——否則會把子項目拖成頂層，而那是「升層」按鈕的事。
import { shallowRef } from 'vue'

export type DragSortKey = string | number

export interface DragSortOptions<K extends DragSortKey> {
  /** 這一組目前的順序。放開時用它算出新順序。 */
  keys: (group: string) => K[]
  /** 放開時回呼，帶這一組的新順序。 */
  onReorder: (group: string, orderedKeys: K[]) => void | Promise<void>
  /** 回 false 時整個關閉（沒有編輯權限時用）。 */
  enabled?: () => boolean
}

export function useDragSort<K extends DragSortKey>(options: DragSortOptions<K>) {
  // ⚠️ 一律 shallowRef：`ref<K>` 會被 UnwrapRef 展開成 DragSortKey，泛型就守不住了
  //    （vue-tsc 會直接報 TS2345）。這裡存的都是整個換掉的值，不需要深層響應。
  /** 已經按住把手、因此可以起拖的那一列。 */
  const armed = shallowRef<K | null>(null)
  /** 正在拖的是誰。 */
  const from = shallowRef<{ group: string; key: K } | null>(null)
  /** 游標現在停在哪一列、要插在它前面還是後面。 */
  const over = shallowRef<{ key: K; after: boolean } | null>(null)

  const isEnabled = () => options.enabled?.() ?? true

  function reset() {
    armed.value = null
    from.value = null
    over.value = null
  }

  /** 綁在把手上（`v-bind="drag.handleProps(key)"`）。 */
  function handleProps(key: K) {
    return {
      class: 'adm-drag-handle',
      title: '按住拖曳可調整順序',
      // ⚠️ aria-hidden 是誠實的：拖放沒有鍵盤等價操作（↑↓ 已依指示移除），
      //    給它一個 aria-label 只會讓輔具使用者看到一個按不動的東西。
      'aria-hidden': 'true',
      onMousedown: () => { if (isEnabled()) armed.value = key },
      onMouseup: () => { armed.value = null },
    }
  }

  /** 綁在整列上（`v-bind="drag.itemProps(group, key)"`）。 */
  function itemProps(group: string, key: K) {
    return {
      draggable: isEnabled() && armed.value === key,

      onDragstart: (e: DragEvent) => {
        if (!isEnabled() || armed.value !== key) {
          e.preventDefault()
          return
        }
        from.value = { group, key }
        over.value = null
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move'
          // ⚠️ Firefox 不設 data 就不會真的開始拖（dragstart 之後什麼都不發生）。
          e.dataTransfer.setData('text/plain', String(key))
        }
      },

      onDragover: (e: DragEvent) => {
        const src = from.value
        if (!src || src.group !== group) return
        // 🔴 preventDefault 是「這裡可以放」的唯一表達方式，少了它 drop 不會觸發。
        e.preventDefault()
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
        if (src.key === key) {
          over.value = null
          return
        }
        over.value = { key, after: isAfter(e) }
      },

      onDrop: (e: DragEvent) => {
        const src = from.value
        if (!src || src.group !== group) return
        e.preventDefault()
        const after = isAfter(e)
        reset()
        if (src.key === key) return

        const list = options.keys(group).slice()
        const fromIndex = list.indexOf(src.key)
        let toIndex = list.indexOf(key)
        if (fromIndex < 0 || toIndex < 0) return
        list.splice(fromIndex, 1)
        toIndex = list.indexOf(key) + (after ? 1 : 0)
        list.splice(toIndex, 0, src.key)

        void options.onReorder(group, list)
      },

      // 拖到清單外面放開也要復原，否則 armed 會卡住、之後整列都還是 draggable。
      onDragend: reset,
    }
  }

  /** 綁在整列的 class 上（`:class="drag.itemClass(group, key)"`）。 */
  function itemClass(group: string, key: K) {
    const dragging = from.value?.group === group
    return {
      'is-dragging': dragging && from.value?.key === key,
      'is-drop-before': dragging && over.value?.key === key && !over.value.after,
      'is-drop-after': dragging && over.value?.key === key && over.value.after,
    }
  }

  return { handleProps, itemProps, itemClass, reset }
}

/** 游標落在這一列的下半部＝要插在它後面。 */
function isAfter(e: DragEvent): boolean {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  return e.clientY > rect.top + rect.height / 2
}
