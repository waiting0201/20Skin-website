<script setup lang="ts">
// 通用可重複欄位編輯器：醫師學經歷、看診時段皆用這個（docs/02-backend-cms.md
// §1「可重複欄位」）。每一列的形狀由呼叫端的 RepeaterSubField[] 宣告決定，
// 不為個別單元各寫一份重複列表 UI。
import { onMounted, ref } from 'vue'
import { adminApi } from '@/api/client'
import type { RepeaterSubField } from '@/unit-schema'

const props = defineProps<{ fields: RepeaterSubField[]; modelValue: Record<string, unknown>[] }>()
const emit = defineEmits<{ 'update:modelValue': [Record<string, unknown>[]] }>()

const relationOptions = ref<Record<string, { value: string; label: string }[]>>({})

onMounted(async () => {
  for (const field of props.fields) {
    if (field.type === 'relation-single' && field.relationUnit) {
      relationOptions.value[field.key] = await adminApi.taxonomy.unitOptions(field.relationUnit)
    }
  }
})

function addRow() {
  const row: Record<string, unknown> = {}
  for (const f of props.fields) row[f.key] = ''
  emit('update:modelValue', [...props.modelValue, row])
}

function removeRow(index: number) {
  emit('update:modelValue', props.modelValue.filter((_, i) => i !== index))
}

function updateCell(index: number, key: string, value: string) {
  const next = props.modelValue.map((row, i) => (i === index ? { ...row, [key]: value } : row))
  emit('update:modelValue', next)
}
</script>

<template>
  <div class="adm-repeater">
    <div v-for="(row, index) in modelValue" :key="index" class="adm-repeater__row">
      <div class="adm-repeater__fields">
        <div v-for="f in fields" :key="f.key" class="adm-field">
          <label class="adm-field__label">{{ f.label }}</label>
          <select
            v-if="f.type === 'select'"
            class="adm-select"
            :value="String(row[f.key] ?? '')"
            @change="updateCell(index, f.key, ($event.target as HTMLSelectElement).value)"
          >
            <option value="">—</option>
            <option v-for="opt in f.options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
          <select
            v-else-if="f.type === 'relation-single'"
            class="adm-select"
            :value="String(row[f.key] ?? '')"
            @change="updateCell(index, f.key, ($event.target as HTMLSelectElement).value)"
          >
            <option value="">—</option>
            <option v-for="opt in relationOptions[f.key] ?? []" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
          <input
            v-else
            class="adm-input"
            :type="f.type === 'date' ? 'date' : f.type === 'time' ? 'time' : 'text'"
            :value="String(row[f.key] ?? '')"
            @input="updateCell(index, f.key, ($event.target as HTMLInputElement).value)"
          >
        </div>
      </div>
      <button type="button" class="btn btn--line btn--sm adm-repeater__remove" @click="removeRow(index)">移除</button>
    </div>

    <!-- 空狀態：一列都沒有時光禿一顆按鈕容易讓人以為壞了，補一行文字
         呼應 RelationPicker 的「尚未設定。」寫法，維持全後台一致 -->
    <p v-if="!modelValue.length" class="adm-muted">尚未新增任何項目。</p>

    <button type="button" class="btn btn--ghost btn--sm" style="align-self:flex-start" @click="addRow">＋ 新增一列</button>
  </div>
</template>
