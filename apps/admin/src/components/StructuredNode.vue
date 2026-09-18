<script setup lang="ts">
// 結構化欄位的遞迴渲染器。依 `node.kind` 分派，物件／陣列／union 三種容器會遞迴呼叫自己。
//
// ⚠️ **刻意做成單一自我遞迴的元件**，不拆成 StructuredArray／StructuredUnion 兩支再互相
//    import —— 那會是 SFC 之間的循環相依，Vite 雖然吃得下 ESM 循環，但元件在
//    `<script setup>` 的註冊時機可能拿到 undefined，症狀是「某一層突然渲染不出來」。
//    自我遞迴用檔名解析，沒有這個問題。
//
// 🔴 **任何寫入都必須是「就地改那一個鍵」**：`{ ...modelValue, [key]: v }`。
//    絕對不可以用 schema 重建物件（`Object.fromEntries(node.fields.map(…))`）——
//    560/1083 篇文章的段落帶著 `runs`、長版故事頁帶著 `body`，schema 沒描述、前台也不讀，
//    但重建一次就永久消失，而且不會有任何錯誤訊息。

import { computed } from 'vue'
import ImageField from './ImageField.vue'
import type { ImageValue } from '../image-value'
import {
  emptyValueFor,
  imageFromJson,
  imageToJson,
  summaryOf,
  type StructuredNode as Node,
} from '../structured-schema'

const props = defineProps<{
  node: Node
  modelValue: unknown
  disabled?: boolean
  /** 錯誤鍵的路徑前綴，例如 `bodyBlocks[3].image`。 */
  path: string
  errors: Record<string, string>
  /** 摺疊狀態由外層保管（換一筆內容時要能整批重置）。 */
  openRows: Record<string, boolean>
}>()

const emit = defineEmits<{ 'update:modelValue': [unknown] }>()

// ── 純量 ──────────────────────────────────────────────────────────────

const asText = computed(() => (props.modelValue === null || props.modelValue === undefined ? '' : String(props.modelValue)))
const asBool = computed(() => Boolean(props.modelValue))

function setText(value: string) {
  emit('update:modelValue', value)
}
function setNumber(value: string) {
  // 空字串保持空（不要變成 0）—— 這些欄位多半是選填的。
  if (value.trim() === '') return emit('update:modelValue', null)
  const n = Number(value)
  emit('update:modelValue', Number.isFinite(n) ? n : value)
}
function setEnum(value: string) {
  // ⚠️ numeric 的 enum 一定要轉回數字：`<select>` 的值永遠是字串，
  //    而前台比對的是 `block.level === 2`（數字），不轉就永遠不成立。
  if (props.node.kind !== 'enum') return
  emit('update:modelValue', props.node.numeric ? Number(value) : value)
}

// ── 物件 ──────────────────────────────────────────────────────────────

const objectValue = computed<Record<string, unknown>>(() =>
  typeof props.modelValue === 'object' && props.modelValue !== null && !Array.isArray(props.modelValue)
    ? (props.modelValue as Record<string, unknown>)
    : {},
)

/** 🔴 展開既有物件再覆寫一個鍵 —— schema 沒描述的鍵靠這個展開運算子存活。 */
function setKey(key: string, value: unknown) {
  emit('update:modelValue', { ...objectValue.value, [key]: value })
}

// ── 陣列 ──────────────────────────────────────────────────────────────

const arrayValue = computed<unknown[]>(() => (Array.isArray(props.modelValue) ? props.modelValue : []))

function itemNode(): Node {
  return props.node.kind === 'array' ? props.node.item : props.node
}

function setItem(index: number, value: unknown) {
  emit('update:modelValue', arrayValue.value.map((row, i) => (i === index ? value : row)))
}

/** 在指定位置插入一列。⚠️ `at = length` 就是附加在最後。 */
function insertAt(at: number) {
  const next = [...arrayValue.value]
  next.splice(at, 0, emptyValueFor(itemNode()))
  emit('update:modelValue', next)
}

function removeAt(index: number) {
  // 只有非空的那一列才問 —— 空列直接刪，不要拿一個 confirm 去煩人。
  const row = arrayValue.value[index]
  const isBlank = row === null || row === undefined || (typeof row === 'object' && Object.values(row as object).every((v) => v === '' || v === null || v === false || (Array.isArray(v) && !v.length)))
  if (!isBlank && !window.confirm('這一列有內容，確定要移除嗎？')) return
  emit('update:modelValue', arrayValue.value.filter((_, i) => i !== index))
}

function move(index: number, direction: -1 | 1) {
  const target = index + direction
  if (target < 0 || target >= arrayValue.value.length) return
  const next = [...arrayValue.value]
  ;[next[index], next[target]] = [next[target], next[index]]
  emit('update:modelValue', next)
}

/** 字串陣列（段落、要點、清單項目）不要每一項包一張卡片，直接一組文字框。 */
const isStringList = computed(() => props.node.kind === 'array' && props.node.item.kind === 'string')

/**
 * 「貼上多行文字，一行一項」——行政人員實際上就是從 Word 貼過來的，
 * 沒有這個入口他們得一行按一次「新增」。
 */
function pasteLines(text: string) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  if (!lines.length) return
  emit('update:modelValue', [...arrayValue.value, ...lines])
}

const rowKey = (index: number) => `${props.path}[${index}]`

/**
 * 摺疊列預設開還是關。
 *
 * 🔴 `collapsible` 的陣列**預設關起來**（文章內文就是）。實測一篇 28 個區塊的
 *    文章全部展開會同時渲染 104 個輸入欄位，而正式資料裡最長的文章有上百個區塊。
 *    ⚠️ 這個旗標原本宣告了卻沒有人讀 —— 是實際開後台跑一遍才發現的。
 * ⚠️ 其餘陣列（規格數據列這種一列兩格的）預設開著，關起來反而多一次點擊。
 */
const defaultOpen = computed(() => !(props.node.kind === 'array' && props.node.collapsible))
const isOpen = (index: number) => props.openRows[rowKey(index)] ?? defaultOpen.value
function toggleRow(index: number) {
  props.openRows[rowKey(index)] = !isOpen(index)
}

/** 全部展開／收合：區塊多的時候，一列一列點是折磨。 */
function setAllRows(open: boolean) {
  arrayValue.value.forEach((_, index) => { props.openRows[rowKey(index)] = open })
}

// ── union（文章的區塊）────────────────────────────────────────────────

const unionVariant = computed(() => {
  if (props.node.kind !== 'union') return null
  const current = String(objectValue.value[props.node.discriminator] ?? '')
  return props.node.variants.find((v) => v.value === current) ?? null
})

function changeVariant(value: string) {
  const node = props.node
  if (node.kind !== 'union') return
  const variant = node.variants.find((v) => v.value === value)
  if (!variant) return
  // ⚠️ 換型別是唯一會丟掉鍵的操作（段落換成標題，`runs` 留著也沒有意義）。
  //    這是使用者明示的意圖，不是靜默刪除 —— 但有內容時要先問。
  const hasContent = Object.entries(objectValue.value)
    .some(([k, v]) => k !== node.discriminator && typeof v === 'string' && v.trim())
  if (hasContent && !window.confirm('換成別的區塊型別會清掉這個區塊目前的內容，確定嗎？')) return
  emit('update:modelValue', { ...(emptyValueFor(variant.node) as object), [node.discriminator]: value })
}

// ── 圖片 ──────────────────────────────────────────────────────────────

const imageValue = computed<ImageValue | null>(() =>
  props.node.kind === 'image' ? (imageFromJson(props.node.shape, props.modelValue) as ImageValue | null) : null,
)
function setImage(value: ImageValue | null) {
  if (props.node.kind !== 'image') return
  emit('update:modelValue', imageToJson(props.node.shape, value, props.modelValue))
}

// ── 錯誤 ──────────────────────────────────────────────────────────────

const ownError = computed(() => props.errors[props.path])
const fieldPath = (key: string) => (props.path ? `${props.path}.${key}` : key)
</script>

<template>
  <!-- 物件 -->
  <div v-if="node.kind === 'object'" class="adm-struct__object">
    <div v-for="f in node.fields" :key="f.key" class="adm-field" :class="{ 'adm-field--span2': f.node.kind === 'array' || f.node.kind === 'object' || (f.node.kind === 'string' && f.node.multiline) }">
      <label class="adm-field__label">
        {{ f.label }}<span v-if="f.required" class="adm-field__required">＊</span>
      </label>
      <StructuredNode
        :node="f.node"
        :model-value="objectValue[f.key]"
        :disabled="disabled"
        :path="fieldPath(f.key)"
        :errors="errors"
        :open-rows="openRows"
        @update:model-value="(v) => setKey(f.key, v)"
      />
      <p v-if="errors[fieldPath(f.key)]" class="adm-field__error" role="alert">{{ errors[fieldPath(f.key)] }}</p>
      <p v-if="f.hint" class="adm-field__hint">{{ f.hint }}</p>
    </div>
  </div>

  <!-- 陣列：字串清單（段落、要點）-->
  <div v-else-if="node.kind === 'array' && isStringList" class="adm-struct__list">
    <div v-for="(row, index) in arrayValue" :key="index" class="adm-struct__line">
      <textarea
        class="adm-textarea adm-struct__line-input"
        rows="2"
        :value="String(row ?? '')"
        :disabled="disabled"
        @input="setItem(index, ($event.target as HTMLTextAreaElement).value)"
      />
      <div class="adm-struct__line-actions">
        <button type="button" class="adm-table__drag" title="上移" :disabled="disabled || index === 0" @click="move(index, -1)">↑</button>
        <button type="button" class="adm-table__drag" title="下移" :disabled="disabled || index === arrayValue.length - 1" @click="move(index, 1)">↓</button>
        <button type="button" class="adm-table__drag" title="移除" :disabled="disabled" @click="removeAt(index)">✕</button>
      </div>
    </div>
    <p v-if="!arrayValue.length" class="adm-muted">尚未新增任何{{ node.itemLabel }}。</p>
    <div class="adm-inline-actions">
      <button type="button" class="btn btn--ghost btn--sm" :disabled="disabled" @click="insertAt(arrayValue.length)">＋ 新增{{ node.itemLabel }}</button>
      <!-- 貼多行：value 永遠清空，它只是一個入口不是欄位 -->
      <textarea
        class="adm-input adm-struct__paste"
        rows="1"
        placeholder="貼上多行文字，一行一項"
        :disabled="disabled"
        @change="pasteLines(($event.target as HTMLTextAreaElement).value); ($event.target as HTMLTextAreaElement).value = ''"
      />
    </div>
  </div>

  <!-- 陣列：一般（物件列、union 列）-->
  <div v-else-if="node.kind === 'array'" class="adm-struct__list">
    <div v-for="(row, index) in arrayValue" :key="index" class="adm-struct__row">
      <div class="adm-struct__row-head">
        <button type="button" class="adm-struct__toggle" :aria-expanded="isOpen(index)" @click="toggleRow(index)">
          <span class="adm-struct__caret">{{ isOpen(index) ? '▾' : '▸' }}</span>
          <span class="adm-struct__summary">{{ summaryOf(node, row, index) }}</span>
        </button>
        <div class="adm-struct__line-actions">
          <button type="button" class="adm-table__drag" title="上移" :disabled="disabled || index === 0" @click="move(index, -1)">↑</button>
          <button type="button" class="adm-table__drag" title="下移" :disabled="disabled || index === arrayValue.length - 1" @click="move(index, 1)">↓</button>
          <button type="button" class="adm-table__drag" title="在這一列後面插入" :disabled="disabled" @click="insertAt(index + 1)">＋</button>
          <button type="button" class="adm-table__drag" title="移除" :disabled="disabled" @click="removeAt(index)">✕</button>
        </div>
      </div>
      <!-- ⚠️ v-if 不是 v-show：摺起來就不渲染子樹。這是長文章唯一的效能措施。 -->
      <div v-if="isOpen(index)" class="adm-struct__row-body">
        <StructuredNode
          :node="node.item"
          :model-value="row"
          :disabled="disabled"
          :path="rowKey(index)"
          :errors="errors"
          :open-rows="openRows"
          @update:model-value="(v) => setItem(index, v)"
        />
      </div>
    </div>
    <p v-if="!arrayValue.length" class="adm-muted">尚未新增任何{{ node.itemLabel }}。</p>
    <div class="adm-inline-actions">
      <button type="button" class="btn btn--ghost btn--sm" :disabled="disabled" @click="insertAt(arrayValue.length)">
        ＋ 新增{{ node.itemLabel }}
      </button>
      <template v-if="node.collapsible && arrayValue.length > 1">
        <button type="button" class="btn btn--ghost btn--sm" @click="setAllRows(true)">全部展開</button>
        <button type="button" class="btn btn--ghost btn--sm" @click="setAllRows(false)">全部收合</button>
        <span class="adm-muted">共 {{ arrayValue.length }} 個{{ node.itemLabel }}</span>
      </template>
    </div>
  </div>

  <!-- union -->
  <div v-else-if="node.kind === 'union'" class="adm-struct__object">
    <div class="adm-field">
      <label class="adm-field__label">區塊種類<span class="adm-field__required">＊</span></label>
      <select
        class="adm-select"
        :value="String(objectValue[node.discriminator] ?? '')"
        :disabled="disabled"
        @change="changeVariant(($event.target as HTMLSelectElement).value)"
      >
        <option value="">請選擇…</option>
        <option v-for="v in node.variants" :key="v.value" :value="v.value">{{ v.label }}</option>
      </select>
    </div>
    <!-- 前台不認識的型別：看得到、搬得動、刪得掉，但不給編輯 ——
         我們不懂它的形狀，給一個半調子的表單只會把它改壞。 -->
    <p v-if="objectValue[node.discriminator] && !unionVariant" class="adm-alert adm-alert--warn">
      這個區塊的種類「{{ String(objectValue[node.discriminator]) }}」目前沒有對應的表單。
      它會原樣保留在頁面上，但不能在這裡修改——需要調整請告知工程端。
    </p>
    <StructuredNode
      v-else-if="unionVariant"
      :node="unionVariant.node"
      :model-value="modelValue"
      :disabled="disabled"
      :path="path"
      :errors="errors"
      :open-rows="openRows"
      @update:model-value="(v) => emit('update:modelValue', v)"
    />
  </div>

  <!-- 圖片 -->
  <!-- ⚠️ `deletesOldFile` 由 schema 宣告：首頁版位設定的圖不會被刪（沒有走發布
       流程那條清 blob 的路），在那裡顯示「會被刪」的警告就是說謊。 -->
  <ImageField
    v-else-if="node.kind === 'image'"
    :model-value="imageValue"
    :disabled="disabled"
    :deletes-old-file="node.deletesOldFile !== false"
    @update:model-value="setImage"
  />

  <!-- 純量 -->
  <select
    v-else-if="node.kind === 'enum'"
    class="adm-select"
    :class="{ 'is-invalid': ownError }"
    :value="asText"
    :disabled="disabled"
    @change="setEnum(($event.target as HTMLSelectElement).value)"
  >
    <option value="">—</option>
    <option v-for="opt in node.options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
  </select>

  <label v-else-if="node.kind === 'boolean'" class="adm-checkbox">
    <input type="checkbox" :checked="asBool" :disabled="disabled" @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)">
    是
  </label>

  <input
    v-else-if="node.kind === 'number'"
    class="adm-input"
    :class="{ 'is-invalid': ownError }"
    type="number"
    step="any"
    :value="asText"
    :disabled="disabled"
    @input="setNumber(($event.target as HTMLInputElement).value)"
  >

  <textarea
    v-else-if="node.kind === 'string' && node.multiline"
    class="adm-textarea"
    :class="{ 'is-invalid': ownError }"
    :value="asText"
    :disabled="disabled"
    :maxlength="node.maxLength"
    :placeholder="node.placeholder"
    @input="setText(($event.target as HTMLTextAreaElement).value)"
  />

  <input
    v-else
    class="adm-input"
    :class="{ 'is-invalid': ownError }"
    type="text"
    :value="asText"
    :disabled="disabled"
    :maxlength="node.kind === 'string' ? node.maxLength : undefined"
    :placeholder="node.kind === 'string' ? node.placeholder : undefined"
    @input="setText(($event.target as HTMLInputElement).value)"
  >
</template>
