<script setup lang="ts">
// 關聯選擇器：多選 ＋ 拖曳排序（此輪先用上／下移動按鈕代替真正拖曳）＋
// 可選的推薦理由欄位（docs/02-backend-cms.md §1：困擾「建議療程」的唯一
// 用途）。docs/08-database.md §D：雙向關聯一律單向存——`field.editable`
// 為 false 時代表這裡只是唯讀顯示，真正的編輯入口在對方的編輯畫面。
import { onMounted, ref } from 'vue'
import { adminApi } from '@/api/client'
import type { RelationItem } from '@/types'
import type { RelationField } from '@/unit-schema'
import { UNIT_REGISTRY } from '@/units'

const props = defineProps<{ field: RelationField; modelValue: RelationItem[] }>()
const emit = defineEmits<{ 'update:modelValue': [RelationItem[]] }>()

const options = ref<{ value: string; label: string }[]>([])
const pickerValue = ref('')

onMounted(async () => {
  options.value = await adminApi.taxonomy.unitOptions(props.field.targetUnit)
})

function availableOptions() {
  const pickedIds = new Set(props.modelValue.map((i) => i.id))
  return options.value.filter((o) => !pickedIds.has(Number(o.value)))
}

function add() {
  if (!pickerValue.value) return
  const opt = options.value.find((o) => o.value === pickerValue.value)
  if (!opt) return
  const next = [...props.modelValue, { id: Number(opt.value), title: opt.label, sortOrder: props.modelValue.length, note: '' }]
  emit('update:modelValue', next)
  pickerValue.value = ''
}

function remove(id: number) {
  emit(
    'update:modelValue',
    props.modelValue.filter((i) => i.id !== id).map((i, idx) => ({ ...i, sortOrder: idx })),
  )
}

function move(id: number, direction: -1 | 1) {
  const items = [...props.modelValue]
  const index = items.findIndex((i) => i.id === id)
  const target = index + direction
  if (target < 0 || target >= items.length) return
  ;[items[index], items[target]] = [items[target], items[index]]
  emit('update:modelValue', items.map((i, idx) => ({ ...i, sortOrder: idx })))
}

function updateNote(id: number, note: string) {
  emit('update:modelValue', props.modelValue.map((i) => (i.id === id ? { ...i, note } : i)))
}
</script>

<template>
  <div class="adm-relation">
    <p v-if="!field.editable" class="adm-relation__readonly-note">
      唯讀——這個關聯由「{{ UNIT_REGISTRY[field.targetUnit].label }}」的編輯畫面維護（雙向關聯一律單向存）。
    </p>

    <div class="adm-relation__picked">
      <div v-for="(item, idx) in modelValue" :key="item.id" class="adm-relation__row">
        <span class="adm-relation__row-title">{{ item.title }}</span>
        <input
          v-if="field.hasNote"
          class="adm-input adm-relation__row-note"
          :placeholder="field.noteLabel || '備註'"
          :value="item.note ?? ''"
          :disabled="!field.editable"
          @input="updateNote(item.id, ($event.target as HTMLInputElement).value)"
        >
        <template v-if="field.editable">
          <button type="button" class="btn btn--line btn--sm" :disabled="idx === 0" @click="move(item.id, -1)">↑</button>
          <button type="button" class="btn btn--line btn--sm" :disabled="idx === modelValue.length - 1" @click="move(item.id, 1)">↓</button>
          <button type="button" class="btn btn--line btn--sm" @click="remove(item.id)">移除</button>
        </template>
      </div>
      <p v-if="!modelValue.length" class="adm-muted">尚未設定。</p>
    </div>

    <div v-if="field.editable" class="adm-relation__add">
      <select v-model="pickerValue" class="adm-select">
        <option value="">選擇要加入的{{ UNIT_REGISTRY[field.targetUnit].label }}…</option>
        <option v-for="opt in availableOptions()" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
      </select>
      <button type="button" class="btn btn--ghost btn--sm" @click="add">加入</button>
    </div>
  </div>
</template>
