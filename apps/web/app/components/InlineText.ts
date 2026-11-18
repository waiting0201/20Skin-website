// 一段帶行內格式的文字（`runs`，見 `utils/inlineRuns.ts`）。沒有格式就是純文字。
//
// ⚠️ 用 `h()` 而不是 .vue 模板：巢狀的 a > strong > em > span 寫成模板要四層 v-if。
//    也因此**不輸出任何 class**（verify:css 斷言 4 只認 mockup 裡出現過的 class），
//    樣式靠 `07-article-detail.css` 的 `.article-content a／strong／em` 元素選擇器。
// 🔴 顏色走 inline style，值已經過白名單（`#rrggbb`）。
import { defineComponent, h, type PropType, type VNodeChild } from 'vue'
import { usableRuns, type InlineRun } from '~/utils/inlineRuns'

export default defineComponent({
  name: 'InlineText',
  props: {
    text: { type: String, required: true },
    runs: { type: Array as PropType<InlineRun[] | null>, default: null },
  },
  setup(props) {
    return () => {
      const runs = usableRuns(props.text, props.runs)
      if (!runs) return props.text
      return runs.map((r): VNodeChild => {
        let node: VNodeChild = r.text
        if (r.color) node = h('span', { style: { color: r.color } }, [node])
        if (r.italic) node = h('em', null, [node])
        if (r.bold) node = h('strong', null, [node])
        if (r.href) {
          node = h('a', {
            href: r.href,
            ...(r.external ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
          }, [node])
        }
        return node
      })
    }
  },
})
