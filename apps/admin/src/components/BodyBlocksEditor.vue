<script setup lang="ts">
// 內文的單一編輯器（文章／困擾／案例的 `bodyBlocks`）。Tim 指定 2026-11-11：
// 「不要像現在這樣用分段的方式，要用一個編輯器就好，像一般部落格編輯那樣」。
//
// 🔴 **存進去的仍然是原本的區塊陣列**，編輯器只是另一種看法 —— 換算在 body-blocks-doc.ts，
//    由 `tools/content-roundtrip/editor-check.mjs` 拿正式資料整批驗。
//
// 🔴 **行內格式只有四種：粗體、斜體、連結、文字顏色**（Tim 定案 2026-11-18，翻掉決策 17 的純文字）。
//    工具列只放前台渲染得出來的東西（前台 `components/InlineText.ts`）。
//    標題不收行內格式，游標在標題裡時這四顆按鈕是灰的。
//
// 🔴 **載入時不發 update**：只有使用者真的動過才把換算結果寫回表單。
//    否則每打開一篇沒動過的文章，表單值都會被換算一次 —— 換算若有任何偏差，
//    那一篇按下「儲存」（例如只改了 SEO）就會被寫掉。

import { computed, onBeforeUnmount, ref, shallowRef, watch, toRaw } from 'vue'
import { Editor, EditorContent, VueNodeViewRenderer } from '@tiptap/vue-3'
import { createBodyExtensions } from '../body-editor-extensions'
import { blocksToDoc, docToBlocks, normalizeColor, normalizeHref, type DocNode } from '../body-blocks-doc'
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

// 🔴 **比對一定要 `toRaw`**（2026-11-12 修）。表單是 reactive 的，發出去的陣列存進去之後，
//    從 props 讀回來的是它的 **proxy** —— `v === lastEmitted` 永遠是 false，於是每打一個字
//    就 `setContent` 重設整份文件，游標被丟到文件結尾：在段落中間打字，只有第一個字落在原位，
//    其餘全部接到文章最後面。typecheck、build、兩支 round-trip 都看不到，
//    由 tools/admin-e2e/check.mjs 的「在段落中間連續打字」把關。
watch(() => props.modelValue, (v) => {
  if (toRaw(v) === toRaw(lastEmitted) || !editor.value) return
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

// ── 行內格式 ──────────────────────────────────────────────────────────

/** 游標在標題或圖片上時不能加行內格式。 */
const marksDisabled = computed(() => ['h2', 'h3', 'figure'].includes(current.value))
const isMark = (name: string) => { void tick.value; return !!editor.value?.isActive(name) }

/**
 * 色票。第一排是網站本身的顏色（base.css 的 token），其餘是一般編輯器常見的那一組。
 * ⚠️ 白色與淺色在白底上幾乎看不見 —— 留著是因為「自訂」本來就擋不住，與其藏起來不如讓人看得到結果。
 */
const BRAND_COLORS = [
  { value: '#1a5490', label: '品牌藍' },
  { value: '#2c5f8a', label: '中介藍' },
  { value: '#12365c', label: '墨藍' },
  { value: '#b08a4f', label: '暖金' },
  { value: '#22262b', label: '墨色' },
  { value: '#6b747c', label: '淺墨' },
]
const PALETTE = [
  '#000000', '#993300', '#333300', '#003300', '#003366', '#000080', '#333399', '#333333',
  '#800000', '#ff6600', '#808000', '#008000', '#008080', '#0000ff', '#666699', '#808080',
  '#ff0000', '#ff9900', '#99cc00', '#339966', '#33cccc', '#3366ff', '#800080', '#999999',
  '#ff00ff', '#ffcc00', '#ffff00', '#00ff00', '#00ffff', '#00ccff', '#993366', '#ffffff',
]
const colorOpen = ref(false)
const currentColor = computed(() => {
  void tick.value
  return normalizeColor(editor.value?.getAttributes('textStyle').color) ?? ''
})
// 點色票外面就收起來。
const colorRoot = ref<HTMLElement | null>(null)
function onDocDown(ev: MouseEvent) {
  if (colorOpen.value && colorRoot.value && !colorRoot.value.contains(ev.target as globalThis.Node)) colorOpen.value = false
}
document.addEventListener('mousedown', onDocDown)
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocDown))

function pickColor(c: string | null) {
  const v = c ? normalizeColor(c) : null
  if (v) e().setColor(v).run()
  else e().unsetColor().run()
  colorOpen.value = false
}

const linkOpen = ref(false)
const linkDraft = ref('')
const linkError = ref('')
const currentHref = computed(() => {
  void tick.value
  return (editor.value?.getAttributes('link').href as string | undefined) ?? ''
})
// 游標移進一個連結時，輸入框帶出它的網址。
watch(currentHref, (h) => { linkDraft.value = h; linkError.value = '' })
const showLinkBar = computed(() => !marksDisabled.value && (linkOpen.value || !!currentHref.value))

function openLink() {
  linkOpen.value = true
  linkDraft.value = currentHref.value
  linkError.value = ''
}
function applyLink() {
  const ed = editor.value
  if (!ed) return
  const href = normalizeHref(linkDraft.value)
  if (!href) {
    linkError.value = '網址要以 https://、http:// 或 / 開頭（站內頁面可以只填路徑，例如 /blog/ultherapy-prime/）'
    return
  }
  if (ed.state.selection.empty && !ed.isActive('link')) {
    linkError.value = '請先選取要加上連結的文字'
    return
  }
  e().extendMarkRange('link').setLink({ href }).run()
  linkOpen.value = false
  linkError.value = ''
}
function removeLink() {
  e().extendMarkRange('link').unsetLink().run()
  linkOpen.value = false
  linkDraft.value = ''
  linkError.value = ''
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
      <button type="button" class="adm-rte__btn adm-rte__btn--bold" :class="{ 'is-active': isMark('bold') }" :disabled="marksDisabled" title="粗體（⌘B）" @click="e().toggleBold().run()">B</button>
      <button type="button" class="adm-rte__btn adm-rte__btn--italic" :class="{ 'is-active': isMark('italic') }" :disabled="marksDisabled" title="斜體（⌘I）" @click="e().toggleItalic().run()">I</button>
      <button type="button" class="adm-rte__btn" :class="{ 'is-active': isMark('link') }" :disabled="marksDisabled" title="連結" @click="openLink">連結</button>
      <span ref="colorRoot" class="adm-rte__color">
        <button type="button" class="adm-rte__btn" :class="{ 'is-active': colorOpen }" :disabled="marksDisabled" title="文字顏色" :aria-expanded="colorOpen" @click="colorOpen = !colorOpen">
          <span class="adm-rte__color-a" :style="{ borderBottomColor: currentColor || 'var(--ink)' }">A</span> ▾
        </button>
        <div v-if="colorOpen && !marksDisabled" class="adm-rte__palette" role="dialog" aria-label="文字顏色">
          <p class="adm-rte__palette-label">網站色</p>
          <div class="adm-rte__swatches">
            <button v-for="c in BRAND_COLORS" :key="c.value" type="button" class="adm-rte__swatch" :class="{ 'is-active': currentColor === c.value }" :style="{ background: c.value }" :title="c.label" :aria-label="c.label" @click="pickColor(c.value)" />
          </div>
          <p class="adm-rte__palette-label">其他顏色</p>
          <div class="adm-rte__swatches">
            <button v-for="c in PALETTE" :key="c" type="button" class="adm-rte__swatch" :class="{ 'is-active': currentColor === c }" :style="{ background: c }" :title="c" :aria-label="c" @click="pickColor(c)" />
          </div>
          <div class="adm-rte__palette-foot">
            <label class="adm-rte__custom">自訂 <input type="color" :value="currentColor || '#000000'" @change="pickColor(($event.target as HTMLInputElement).value)"></label>
            <button type="button" class="adm-rte__btn" @click="pickColor(null)">清除顏色</button>
            <button type="button" class="adm-rte__btn" @click="colorOpen = false">關閉</button>
          </div>
        </div>
      </span>

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

    <!-- 連結：按了「連結」或游標停在既有的連結上時出現。 -->
    <div v-if="editor && !disabled && showLinkBar" class="adm-rte__anchor">
      <label>連結網址</label>
      <input class="adm-input" type="text" placeholder="https://… 或 /blog/…" :value="linkDraft" @input="linkDraft = ($event.target as HTMLInputElement).value" @keydown.enter.prevent="applyLink">
      <button type="button" class="adm-rte__btn" @click="applyLink">套用</button>
      <button v-if="currentHref" type="button" class="adm-rte__btn adm-rte__btn--danger" @click="removeLink">移除連結</button>
      <button v-else type="button" class="adm-rte__btn" @click="linkOpen = false">取消</button>
      <span class="adm-field__hint">站外網址在前台會開新分頁；站內頁面填路徑即可。</span>
      <span v-if="linkError" class="adm-field__error" role="alert">{{ linkError }}</span>
    </div>

    <EditorContent v-if="editor" :editor="editor" class="adm-rte__content" />

    <p v-if="imageError" class="adm-field__error" role="alert">{{ imageError }}</p>
    <p v-for="(msg, i) in nestedErrors" :key="i" class="adm-field__error" role="alert">{{ msg }}</p>
  </div>
</template>
