<script setup lang="ts">
// 結構化欄位的外框：說明、未宣告鍵的提示。真正的遞迴渲染在 `StructuredNode.vue`。
//
// 🔴 **這裡只有表單，沒有「進階：直接編輯 JSON」的切換鈕**
//    （Tim 指定 2026-09-18：「只接顯示表單的部分就好，進階直接編輯 JSON 客戶不會用」）。
//    拿掉的是**入口**，不是原始模式本身 —— 原始模式仍然會自己出現在兩種情況：
//    ① 這個項目沒有 schema（例如 page 的未知 slug，決策 17 刻意不硬套一份）；
//    ② 既有資料 parse 不出來或最外層型別對不上（雙重編碼、手改壞的 JSON）。
//    🔴 **那個 textarea 不可以跟著拿掉。** 那兩種情況下它是唯一看得到、也改得到
//    那份資料的地方；少了它，畫面會是一個空表單，而使用者一按儲存就把原本的值蓋掉。
//
// ⚠️ 模式旗標就是值的型別本身（見 structured-schema.ts）：字串＝原始模式、
//    物件／陣列＝結構化模式。不要另外加一個 `mode` 狀態 —— 兩份狀態一定會不同步。

import { computed, reactive, watch } from 'vue'
import StructuredNode from './StructuredNode.vue'
import { collectUndeclared, isRawMode, type StructuredSchema } from '../structured-schema'

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

/**
 * 🔴 **出錯的那一列一定要先展開。** 摺疊起來的列是 `v-if` 不是 `v-show`
 *    （StructuredNode.vue：長文章唯一的效能措施），所以裡面的紅字**根本沒有渲染**——
 *    使用者看到的是「頂端說有欄位沒填，但整頁一個紅字都找不到」。
 *
 * ⚠️ 路徑裡每一個 `[n]` 前綴就是一列的摺疊鍵（＝ StructuredNode 的 `rowKey`），
 *    所以巢狀的陣列會一路展開到最裡面那一列。
 * ⚠️ 只認自己這一欄的錯誤（`path` 前綴）—— 同一頁有好幾個結構化欄位共用同一份
 *    errors 物件。
 */
watch(() => props.errors, (errors) => {
  for (const key of Object.keys(errors)) {
    if (key !== props.path && !key.startsWith(`${props.path}.`) && !key.startsWith(`${props.path}[`)) continue
    for (const m of key.matchAll(/\[\d+\]/g)) openRows[key.slice(0, m.index! + m[0].length)] = true
  }
// 🔴 `deep` 不可省：首頁版位那一頁的 errors 是**就地改寫**的 reactive 物件
//    （EditPage 是整個換掉一份）。少了它，那一頁的摺疊列永遠不會自動展開。
}, { immediate: true, deep: true })

const raw = computed(() => isRawMode(props.modelValue))

/** schema 沒有描述、但資料裡確實存在的鍵。 */
const undeclared = computed(() => {
  if (!props.schema || raw.value) return []
  return [...collectUndeclared(props.schema.root, props.modelValue)]
})
</script>

<template>
  <div class="adm-struct">
    <p v-if="schema?.preview" class="adm-field__hint">{{ schema.preview }}</p>

    <!-- 沒有 schema：只有原始模式。⚠️ 不要硬套一份 schema —— 套錯的結果是
         「表單看起來正常、填了、前台什麼都沒變」，比一個坦白的 JSON 框糟得多。 -->
    <p v-if="!schema" class="adm-alert adm-alert--info">
      這個項目沒有對應的表單，內容以原始格式顯示。需要調整請告知工程端。
    </p>

    <!-- 有 schema 卻讀不成表單 ＝ 這一筆資料的形狀本身對不上（雙重編碼、手改壞的
         JSON）。⚠️ 這不是使用者切過來的，所以要說清楚發生了什麼、怎麼回到表單。 -->
    <p v-else-if="raw" class="adm-alert adm-alert--warn">
      這一欄目前的內容不符合表單預期的格式，暫時以原始格式顯示。
      <strong>建議先不要動它，請告知工程端</strong>——格式修好之後這一欄就會變回表單。
    </p>

    <!-- 原始 JSON 模式（只在上面兩種情況出現，沒有手動切換的入口） -->
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

    <!-- 🔴 這一行不能省。沒有它，使用者會以為表單顯示的就是全部 ——
         那正是 560 篇文章的 runs 可能消失的方式（例如整段複製到別處再貼回來）。 -->
    <p v-if="undeclared.length" class="adm-field__hint">
      這筆資料另有 {{ undeclared.length }} 項不會顯示在表單上的內容，儲存時會原樣保留，不會消失。
    </p>
  </div>
</template>

<style scoped>
.adm-struct { display: flex; flex-direction: column; gap: var(--sp-2); }
.adm-struct__raw { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: var(--fs-xs); }
</style>
