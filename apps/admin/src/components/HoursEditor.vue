<script setup lang="ts">
// 結構化營業時間編輯器。docs/08-database.md §C-7：一天可以有多列，午休斷點
// 就是這樣表達的（09:00–12:00／14:30–21:00）；某天完全沒有列＝休診。
// 刻意不做「開始／結束＋午休開始／午休結束」四欄式——那撐不住第三段診次。
import { computed } from 'vue'

interface HourRow { dayOfWeek: number; startTime: string; endTime: string }

const props = defineProps<{ modelValue: HourRow[] }>()
const emit = defineEmits<{ 'update:modelValue': [HourRow[]] }>()

const DAYS = [
  { value: 1, label: '週一' },
  { value: 2, label: '週二' },
  { value: 3, label: '週三' },
  { value: 4, label: '週四' },
  { value: 5, label: '週五' },
  { value: 6, label: '週六' },
  { value: 0, label: '週日' },
]

const rows = computed(() => props.modelValue)

function addRow() {
  emit('update:modelValue', [...props.modelValue, { dayOfWeek: 1, startTime: '09:00', endTime: '12:00' }])
}
function removeRow(index: number) {
  emit('update:modelValue', props.modelValue.filter((_, i) => i !== index))
}
function updateRow(index: number, patch: Partial<HourRow>) {
  emit('update:modelValue', props.modelValue.map((r, i) => (i === index ? { ...r, ...patch } : r)))
}
</script>

<template>
  <div class="adm-hours-editor">
    <div class="adm-hours-editor__row adm-hours-editor__row--head">
      <span>星期</span><span>開始</span><span>結束</span><span></span>
    </div>
    <!-- 一列都沒有時只剩表頭，容易看起來像沒載入完成——說明清楚這是合法狀態 -->
    <p v-if="!rows.length" class="adm-muted">目前完全沒有設定時段（等同整週公休）。</p>
    <div v-for="(row, index) in rows" :key="index" class="adm-hours-editor__row">
      <select class="adm-select" :value="row.dayOfWeek" @change="updateRow(index, { dayOfWeek: Number(($event.target as HTMLSelectElement).value) })">
        <option v-for="d in DAYS" :key="d.value" :value="d.value">{{ d.label }}</option>
      </select>
      <input class="adm-input" type="time" :value="row.startTime" @input="updateRow(index, { startTime: ($event.target as HTMLInputElement).value })">
      <input class="adm-input" type="time" :value="row.endTime" @input="updateRow(index, { endTime: ($event.target as HTMLInputElement).value })">
      <button type="button" class="btn btn--line btn--sm" @click="removeRow(index)">移除</button>
    </div>
    <button type="button" class="btn btn--ghost btn--sm" style="align-self:flex-start" @click="addRow">＋ 新增時段</button>
    <p class="adm-field__hint">同一天可新增多列表示午休斷點；某天完全不設列＝該天休診。</p>
  </div>
</template>
