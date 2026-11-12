<script setup lang="ts">
// 內文的單一編輯器（文章／困擾／案例的 `bodyBlocks`）。Tim 指定 2026-11-11：
// 「不要像現在這樣用分段的方式，要用一個編輯器就好，像一般部落格編輯那樣」。
//
// 🔴 **存進去的仍然是原本的區塊陣列**，編輯器只是另一種看法 —— 換算在 body-blocks-doc.ts，
//    由 `tools/content-roundtrip/editor-check.mjs` 拿正式資料整批驗。
//
// 🔴 **沒有開啟任何文字格式**（粗體、斜體、連結）：前台的段落是純文字（決策 17）。
//    工具列只放前台渲染得出來的東西。
//
// 🔴 **載入時不發 update**：只有使用者真的動過才把換算結果寫回表單。
//    否則每打開一篇沒動過的文章，表單值都會被換算一次 —— 換算若有任何偏差，
//    那一篇按下「儲存」（例如只改了 SEO）就會被寫掉。

import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { Editor, EditorContent, VueNodeViewRenderer } from '@tiptap/vue-3'
import { createBodyExtensions } from '../body-editor-extensions'
import { blocksToDoc, docToBlocks, type DocNode } from '../body-blocks-doc'
import { createPendingImage, isPendingImage, releasePendingImage, validateImageFile } from '../image-value'
import { imageToJson } from '../structured-schema'
import { ACCEPTED_IMAGE_TYPES } from '../api/upload'
import BodyFigureView from './BodyFigureView.vue'

const props = defineProps<{
  modelValue: unknown
  disabled?: boolean
  /** 錯誤鍵前綴（＝欄位鍵）。 */
  path: string
  errors: Record<string, string>
}>()

const emit = defineEmits<{ 'update:modelValue': [unknown] }>()

/** 最後一次由這裡發出去的值。外面換成別的值（換一筆內容、存檔後重載）才重設編輯器。 */
let lastEmitted: unknown = undefined

const editor = shallowRef<Editor>()
const tick = ref(0) // 工具列的狀態（目前在哪一種區塊）跟著選取變

editor.value = new Editor({
  extensions: createBodyExtensions({
    figureView: VueNodeViewRenderer(BodyFigureView),
    placeholder: '從這裡開始寫內文…',
  }),
  content: blocksToDoc(props.modelValue),
  editable: !props.disabled,
  onUpdate: ({ editor: e }) => {
    lastEmitted = docToBlocks(e.getJSON() as DocNode)
    emit('update:modelValue', lastEmitted)
  },
  onTransaction: () => { tick.value++ },
})

watch(() => props.modelValue, (v) => {
  if (v === lastEmitted || !editor.value) return
  editor.value.commands.setContent(blocksToDoc(v), false)
})
watch(() => props.disabled, (d) => editor.value?.setEditable(!d))

onBeforeUnmount(() => {
  // 還沒存檔的圖片預覽在這裡一次釋放（BodyFigureView 刻意不在卸載時釋放，見那支的檔頭）。
  editor.value?.state.doc.descendants((n) => {
    if (n.type.name === 'figure' && isPendingImage(n.attrs.image)) releasePendingImage(n.attrs.image)
  })
  editor.value?.destroy()
})

// ── 工具列 ────────────────────────────────────────────────────────────

const e = () => editor.value!.chain().focus()

/** 目前游標所在的區塊型別。 */
const current = computed(() => {
  void tick.value
  const ed = editor.value
  if (!ed) return ''
  if (ed.isActive('table')) return 'table'
  if (ed.isActive('bulletList')) return 'bulletList'
  if (ed.isActive('orderedList')) return 'orderedList'
  if (ed.isActive('heading', { level: 2 })) return 'h2'
  if (ed.isActive('heading', { level: 3 })) return 'h3'
  if (ed.isActive('lead')) return 'lead'
  if (ed.isActive('note')) return 'note'
  if (ed.isActive('figure')) return 'figure'
  return 'paragraph'
})

/** 段落型的區塊（前言／標題／段落／提示框）互相切換。 */
function setBlock(kind: string) {
  const c = e()
  switch (kind) {
    case 'paragraph': c.setParagraph().run(); break
    case 'h2': c.setHeading({ level: 2 }).run(); break
    case 'h3': c.setHeading({ level: 3 }).run(); break
    case 'lead': c.setNode('lead').run(); break
    case 'note-info': c.setNode('note', { variant: 'info' }).run(); break
    case 'note-warn': c.setNode('note', { variant: 'warn' }).run(); break
  }
}

const blockSelect = computed(() => {
  if (current.value === 'note') return editor.value?.getAttributes('note').variant === 'warn' ? 'note-warn' : 'note-info'
  return ['paragraph', 'h2', 'h3', 'lead'].includes(current.value) ? current.value : ''
})

const anchorId = computed(() => {
  void tick.value
  return (editor.value?.getAttributes('heading').anchorId as string | null) ?? ''
})
function setAnchorId(v: string) {
  editor.value?.chain().updateAttributes('heading', { anchorId: v.trim() || null }).run()
}

const imageInput = ref<HTMLInputElement | null>(null)
const imageError = ref('')
async function insertImage(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  imageError.value = validateImageFile(file) ?? ''
  if (imageError.value) return
  const pending = await createPendingImage(file)
  // 🔴 **一定要過 `imageToJson`**，不可以把 `pending` 直接塞進 attrs（2026-11-12 修）。
  //    它負責把這個欄位的形狀（`src-size`）掛在待上傳的圖上；少了它，上傳完成的圖以 API 的
  //    `{blobPath,url,…}` 原樣存進去，而內文的圖前後台讀的都是 `src` —— 症狀是
  //    「儲存成功，然後圖就不見了」：存檔後編輯器重新載入內容，那張圖沒有網址。
  //    換圖（BodyFigureView）本來就有過這一道，漏的只有「插入」這條路。
  // 🔴 **插在游標所在那一整塊的後面，不是游標的位置**（2026-11-12）。圖片只能放在最外層，
  //    直接 `insertContent` 的話：游標在表格儲存格裡會把那一格的文字清掉（實測），
  //    在段落中間會把段落切成兩段、而被改過的段落會丟掉 `runs`（決策 32）。
  const sel = editor.value!.state.selection
  const at = sel.$from.depth >= 1 ? sel.$from.after(1) : sel.to
  e().insertContentAt(at, { type: 'figure', attrs: { image: imageToJson('src-size', pending, null), caption: '', wide: null } }).run()
}

function insertTable() {
  e().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run()
}

// ── 提示 ──────────────────────────────────────────────────────────────

/** 這一欄底下的細部錯誤（例如 `bodyBlocks[5].image`）。欄位層級的那一句 EditPage 會自己顯示。 */
const nestedErrors = computed(() =>
  Object.entries(props.errors).filter(([k]) => k.startsWith(`${props.path}[`)).map(([, v]) => v),
)
</script>

<template>
  <div class="adm-rte" :class="{ 'is-disabled': disabled }">
    <div v-if="editor && !disabled" class="adm-rte__toolbar" role="toolbar" aria-label="內文編輯工具">
      <select class="adm-select adm-rte__block" :value="blockSelect" :disabled="['table', 'figure', 'bulletList', 'orderedList'].includes(current)" @change="setBlock(($event.target as HTMLSelectElement).value)">
        <option value="" disabled>—</option>
        <option value="paragraph">段落</option>
        <option value="h2">大標題（H2）</option>
        <option value="h3">小標題（H3）</option>
        <option value="lead">前言</option>
        <option value="note-info">提示框・說明</option>
        <option value="note-warn">提示框・注意</option>
      </select>

      <span class="adm-rte__sep" />
      <button type="button" class="adm-rte__btn" :class="{ 'is-active': current === 'bulletList' }" title="項目清單" @click="e().toggleBulletList().run()">• 清單</button>
      <button type="button" class="adm-rte__btn" :class="{ 'is-active': current === 'orderedList' }" title="編號清單" @click="e().toggleOrderedList().run()">1. 編號</button>

      <span class="adm-rte__sep" />
      <input ref="imageInput" type="file" hidden :accept="ACCEPTED_IMAGE_TYPES" @change="insertImage">
      <button type="button" class="adm-rte__btn" @click="imageInput?.click()">插入圖片</button>
      <button v-if="current !== 'table'" type="button" class="adm-rte__btn" @click="insertTable">插入表格</button>
      <template v-else>
        <button type="button" class="adm-rte__btn" @click="e().addRowAfter().run()">＋列</button>
        <button type="button" class="adm-rte__btn" @click="e().addColumnAfter().run()">＋欄</button>
        <button type="button" class="adm-rte__btn" @click="e().deleteRow().run()">－列</button>
        <button type="button" class="adm-rte__btn" @click="e().deleteColumn().run()">－欄</button>
        <button type="button" class="adm-rte__btn" @click="e().toggleHeaderRow().run()">切換表頭</button>
        <button type="button" class="adm-rte__btn adm-rte__btn--danger" @click="e().deleteTable().run()">刪除表格</button>
      </template>

      <span class="adm-rte__sep" />
      <button type="button" class="adm-rte__btn" title="復原（⌘Z）" :disabled="!editor.can().undo()" @click="e().undo().run()">↶</button>
      <button type="button" class="adm-rte__btn" title="重做（⌘⇧Z）" :disabled="!editor.can().redo()" @click="e().redo().run()">↷</button>
    </div>

    <!-- 錨點 id：只在游標停在 H2 時出現。文章目錄只收「H2 且有 id」的標題。 -->
    <div v-if="editor && !disabled && current === 'h2'" class="adm-rte__anchor">
      <label>錨點 id（選填）</label>
      <input class="adm-input" type="text" placeholder="例如 why-ages-faster" :value="anchorId" @change="setAnchorId(($event.target as HTMLInputElement).value)">
      <span class="adm-field__hint">填了這個大標題才會出現在文章目錄裡；改掉既有的 id 會讓別人連過來的錨點失效。</span>
    </div>

    <EditorContent v-if="editor" :editor="editor" class="adm-rte__content" />

    <p v-if="imageError" class="adm-field__error" role="alert">{{ imageError }}</p>
    <p v-for="(msg, i) in nestedErrors" :key="i" class="adm-field__error" role="alert">{{ msg }}</p>
  </div>
</template>
