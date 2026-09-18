<script setup lang="ts">
// 關聯選擇器：多選 ＋ 排序（**維持上／下移動按鈕**）＋
// ⚠️ 2026-09-17 把排序改成拖曳的範圍是「整頁就是在排序」的那三個畫面
//    （內容清單、首頁版位、導覽選單）。這裡與 `StructuredNode` 的陣列列是
//    **表單裡的欄位**，刻意不跟著改 —— 是範圍決定，不是漏做。
// 可選的推薦理由欄位（docs/02-backend-cms.md §1：困擾「建議療程」的唯一
// 用途）。docs/08-database.md §D：雙向關聯一律單向存——`field.editable`
// 為 false 時代表這裡只是唯讀顯示，真正的編輯入口在對方的編輯畫面。
import { computed, ref } from 'vue'
import { adminApi } from '@/api/client'
import type { RelationItem } from '@/types'
import type { RelationField } from '@/unit-schema'
import { UNIT_REGISTRY } from '@/units'

const props = defineProps<{ field: RelationField; modelValue: RelationItem[] }>()
const emit = defineEmits<{ 'update:modelValue': [RelationItem[]] }>()

const options = ref<{ value: string; label: string }[]>([])
const totalCount = ref(0)
const pickerValue = ref('')
const keyword = ref('')
const loading = ref(false)
const loadError = ref('')
/** 載過了沒有。⚠️ 不能用 `options.length` 判斷 —— 空單元（0 筆）會變成每次都重載。 */
const loaded = ref(false)

/**
 * 🔴 **選項是「打開挑選器才載」，不是掛載就載**（2026-09-18）。
 *
 * 原本寫在 `onMounted`：一進編輯頁，每一個關聯欄位都把**整個目標單元**抓回來
 * （`unitOptions()` 會翻頁抓完），而使用者十次有九次根本不會動那個欄位。
 * 首頁版位編排最慘 —— 五個挑選器裡有一個指向文章（1100 筆，12 趟往返），
 * 實測整頁 35 次請求裡有 24 次是它。
 *
 * ⚠️ `@focus` 與 `@mousedown` 都要掛：鍵盤 Tab 進來只有 focus，滑鼠點下去
 *    有些瀏覽器是先開清單才給 focus。重複呼叫由 `loaded`／`loading` 擋掉。
 */
async function ensureOptions() {
  if (loaded.value || loading.value) return
  await fetchOptions()
}

async function fetchOptions(kw = '') {
  loading.value = true
  loadError.value = ''
  try {
    const res = await adminApi.taxonomy.unitOptionsPage(props.field.targetUnit, kw)
    options.value = res.options
    totalCount.value = res.totalCount
    loaded.value = true
  } catch {
    // ⚠️ 選項載不回來要**說出來**。原本這裡連 try 都沒有，症狀是一個空的下拉選單 ——
    //    使用者會把它讀成「沒有東西可以選」，而不是「沒載到」。
    loadError.value = '選項沒有載回來，請再點一次或重新載入這一頁。'
    loaded.value = false
  } finally {
    loading.value = false
  }
}

/** 超過一頁就沒辦法用「整份列出來」那一招，改用關鍵字搜尋。 */
const needsSearch = computed(() => loaded.value && totalCount.value > options.value.length)

let searchTimer: ReturnType<typeof setTimeout> | undefined
function onSearchInput() {
  clearTimeout(searchTimer)
  // ⚠️ 打字要 debounce：每一個字元打一次 API，在正式環境（Azure SQL Basic）
  //    就是一串互相追著跑的請求，而且回來的順序不保證。
  searchTimer = setTimeout(() => void fetchOptions(keyword.value.trim()), 300)
}

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
      <!-- ⚠️ 搜尋框只在「一頁列不完」時出現（needsSearch）——
           28 筆的療程不需要先搜尋才選得到。 -->
      <input
        v-if="needsSearch"
        v-model="keyword"
        type="search"
        class="adm-input adm-relation__search"
        :placeholder="`搜尋${UNIT_REGISTRY[field.targetUnit].label}…`"
        @input="onSearchInput"
      >
      <select v-model="pickerValue" class="adm-select" @focus="ensureOptions" @mousedown="ensureOptions">
        <option value="">
          <template v-if="loading">載入中…</template>
          <template v-else>選擇要加入的{{ UNIT_REGISTRY[field.targetUnit].label }}…</template>
        </option>
        <option v-for="opt in availableOptions()" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
      </select>
      <button type="button" class="btn btn--ghost btn--sm" @click="add">加入</button>
    </div>
    <p v-if="loadError" class="adm-field__error">{{ loadError }}</p>
    <p v-else-if="needsSearch" class="adm-field__hint">
      共 {{ totalCount }} 筆，這裡只列出前 {{ options.length }} 筆 —— 要找的不在清單裡就用上面的搜尋框。
    </p>
  </div>
</template>
