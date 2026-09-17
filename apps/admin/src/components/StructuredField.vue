<script setup lang="ts">
// 結構化欄位的外框：說明、表單／原始 JSON 的切換、未宣告鍵的提示。
// 真正的遞迴渲染在 `StructuredNode.vue`。
//
// 🔴 **逃生口（進階：直接編輯 JSON）一律提供，不是出錯才給。** 三個理由：
//    ① 出錯才給的話，使用者第一次看到它就是在最慌的時候；
//    ② 有些操作（整段搬到另一筆內容、從別處貼一份）用 JSON 比表單快；
//    ③ 它讓我們不必為了 100% 覆蓋而把 schema 做得過度複雜。
//
// ⚠️ 模式旗標就是值的型別本身（見 structured-schema.ts）：字串＝原始模式、
//    物件／陣列＝結構化模式。不要另外加一個 `mode` 狀態 —— 兩份狀態一定會不同步。

import { computed, reactive, ref } from 'vue'
import StructuredNode from './StructuredNode.vue'
import {
  collectUndeclared,
  emptyValueFor,
  isRawMode,
  topKindMatches,
  type StructuredSchema,
} from '../structured-schema'

const props = defineProps<{
  schema: StructuredSchema | undefined
  modelValue: unknown
  disabled?: boolean
  /** 錯誤鍵的前綴（＝欄位鍵）。 */
  path: string
  errors: Record<string, string>
}>()

const emit = defineEmits<{ 'update:modelValue': [unknown] }>()

/** 摺疊狀態掛在這一層：換一筆內容時整個元件重建，狀態自然重置。 */
const openRows = reactive<Record<string, boolean>>({})

const raw = computed(() => isRawMode(props.modelValue))
const switchError = ref('')

/** schema 沒有描述、但資料裡確實存在的鍵。 */
const undeclared = computed(() => {
  if (!props.schema || raw.value) return []
  return [...collectUndeclared(props.schema.root, props.modelValue)]
})

function toRawMode() {
  switchError.value = ''
  emit('update:modelValue', JSON.stringify(props.modelValue ?? null, null, 2))
}

function toFormMode() {
  if (!props.schema) return
  const text = String(props.modelValue ?? '').trim()
  if (text === '') {
    emit('update:modelValue', emptyValueFor(props.schema.root))
    switchError.value = ''
    return
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    // ⚠️ 不切換、也不清掉使用者正在打的字 —— 只顯示錯在哪裡。
    switchError.value = `JSON 語法有誤，無法切換成表單：${e instanceof Error ? e.message : String(e)}`
    return
  }
  if (!topKindMatches(props.schema.root, parsed)) {
    const want = props.schema.root.kind === 'array' ? '陣列' : '物件'
    switchError.value = `這一欄的最外層必須是 ${want}，目前不是，無法切換成表單。`
    return
  }
  switchError.value = ''
  emit('update:modelValue', parsed)
}
</script>

<template>
  <div class="adm-struct">
    <p v-if="schema?.preview" class="adm-field__hint">{{ schema.preview }}</p>

    <!-- 沒有 schema：只有原始模式。⚠️ 不要硬套一份 schema —— 套錯的結果是
         「表單看起來正常、填了、前台什麼都沒變」，比一個坦白的 JSON 框糟得多。 -->
    <p v-if="!schema" class="adm-alert adm-alert--info">
      這個項目沒有對應的表單，以原始 JSON 編輯。
    </p>

    <div v-else class="adm-struct__modes">
      <button type="button" class="btn btn--sm" :class="raw ? 'btn--line' : 'btn--primary'" :disabled="disabled || !raw" @click="toFormMode">
        表單
      </button>
      <button type="button" class="btn btn--sm" :class="raw ? 'btn--primary' : 'btn--line'" :disabled="disabled || raw" @click="toRawMode">
        進階：直接編輯 JSON
      </button>
    </div>

    <p v-if="switchError" class="adm-field__error" role="alert">{{ switchError }}</p>

    <!-- 原始 JSON 模式 -->
    <textarea
      v-if="raw"
      class="adm-textarea adm-textarea--tall adm-struct__raw"
      spellcheck="false"
      :value="String(modelValue ?? '')"
      :disabled="disabled"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />

    <!-- 表單模式 -->
    <StructuredNode
      v-else
      :node="schema!.root"
      :model-value="modelValue"
      :disabled="disabled"
      :path="path"
      :errors="errors"
      :open-rows="openRows"
      @update:model-value="(v) => emit('update:modelValue', v)"
    />

    <!-- 🔴 這一行不能省。沒有它，使用者會以為表單顯示的就是全部，
         然後在 JSON 模式裡「順手清乾淨」——那正是 560 篇文章的 runs 會消失的方式。 -->
    <p v-if="undeclared.length" class="adm-field__hint">
      這筆資料另有 {{ undeclared.length }} 個不由表單管理的欄位（<code>{{ undeclared.join('、') }}</code>），儲存時會原樣保留。
    </p>
  </div>
</template>

<style scoped>
.adm-struct { display: flex; flex-direction: column; gap: var(--sp-2); }
.adm-struct__modes { display: flex; gap: var(--sp-2); }
/* 選中的那一顆 ＝ 實心藍（btn--primary），未選 ＝ 灰線框（btn--line）。
   ⚠️ 不要再對調回去：base.css 的 --ghost 是「藍框藍字」、比 --line 重，
   拿它當未選狀態的結果就是「沒選的那顆比較亮」（2026-09-17 修）。
   下面兩行凍結 disabled 時的 hover —— CSS 的 :hover 會匹配 disabled 元素，
   不凍結的話選中那顆滑過去會變色，暗示它按得下去。 */
.adm-struct__modes .btn:disabled { cursor: default; }
.adm-struct__modes .btn--primary:disabled:hover { background: var(--brand-600); border-color: var(--brand-600); }
.adm-struct__modes .btn--line:disabled:hover { border-color: var(--line); background: transparent; }
.adm-struct__raw { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: var(--fs-xs); }
</style>
