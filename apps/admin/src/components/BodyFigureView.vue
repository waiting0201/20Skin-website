<script setup lang="ts">
// 內文編輯器裡的一張圖（TipTap NodeView）。屬性的形狀＝前台 figure 區塊的
// `{ image: {src,alt,width,height,blobPath}, caption, wide }`，見 body-blocks-doc.ts。
//
// 🔴 **不直接用 ImageField**：它在 `onBeforeUnmount` 釋放待上傳圖片的預覽網址，
//    而 NodeView 在編輯器裡會被拆掉再重建（拖曳搬移＝刪除＋插入、復原）——
//    用它的話，把一張還沒存檔的圖拖到下一段，預覽當場變破圖。
//    這裡只在「換圖」「移除」兩個明確動作時釋放；編輯器整個拆掉時由
//    BodyBlocksEditor 一次釋放剩下的。
//
// ⚠️ 上傳規則與 ImageField 相同：**選圖不上傳**，按下表單的儲存才上傳（決策 9）。

import { computed, ref } from 'vue'
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { ACCEPTED_IMAGE_TYPES } from '../api/upload'
import { createPendingImage, imagePreviewUrl, isPendingImage, releasePendingImage, validateImageFile, type ImageValue } from '../image-value'
import { imageFromJson, imageToJson } from '../structured-schema'

const props = defineProps(nodeViewProps)

const fileInput = ref<HTMLInputElement | null>(null)
const error = ref('')

const editable = computed(() => props.editor.isEditable)
const image = computed(() => imageFromJson('src-size', props.node.attrs.image) as ImageValue | null)
const previewUrl = computed(() => imagePreviewUrl(image.value))
const pending = computed(() => (isPendingImage(image.value) ? image.value : null))

function setImage(value: ImageValue | null) {
  props.updateAttributes({ image: imageToJson('src-size', value, props.node.attrs.image) })
}

async function pick(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  error.value = validateImageFile(file) ?? ''
  if (error.value) return
  releasePendingImage(props.node.attrs.image)
  setImage(await createPendingImage(file, image.value?.alt ?? null))
}

function setAlt(value: string) {
  if (!image.value) return
  setImage({ ...image.value, alt: value || null })
}

function remove() {
  releasePendingImage(props.node.attrs.image)
  props.deleteNode()
}
</script>

<template>
  <NodeViewWrapper class="adm-rte-figure" :class="{ 'is-selected': selected, 'is-wide': node.attrs.wide }">
    <div class="adm-rte-figure__bar" contenteditable="false">
      <span class="adm-rte-figure__grip" data-drag-handle title="拖曳以搬移">⠿ 圖片</span>
      <label class="adm-checkbox">
        <input type="checkbox" :checked="!!node.attrs.wide" :disabled="!editable" @change="updateAttributes({ wide: ($event.target as HTMLInputElement).checked })">
        滿版寬度
      </label>
      <input ref="fileInput" type="file" hidden :accept="ACCEPTED_IMAGE_TYPES" @change="pick">
      <button type="button" class="btn btn--line btn--sm" :disabled="!editable" @click="fileInput?.click()">{{ image ? '換一張' : '選擇圖片' }}</button>
      <button type="button" class="btn btn--line btn--sm" :disabled="!editable" @click="remove">刪除這張圖</button>
    </div>

    <div class="adm-rte-figure__frame" contenteditable="false">
      <img v-if="previewUrl" :src="previewUrl" :alt="image?.alt ?? ''">
      <button v-else type="button" class="adm-rte-figure__empty" :disabled="!editable" @click="fileInput?.click()">點這裡選擇圖片</button>
    </div>

    <div class="adm-rte-figure__fields" contenteditable="false">
      <input class="adm-input" type="text" placeholder="圖說（顯示在圖片下方，可留空）" :value="node.attrs.caption ?? ''" :disabled="!editable" @input="updateAttributes({ caption: ($event.target as HTMLInputElement).value })">
      <input v-if="image" class="adm-input" type="text" placeholder="替代文字（alt）——螢幕閱讀器與 SEO 都讀它" :value="image.alt ?? ''" :disabled="!editable" @input="setAlt(($event.target as HTMLInputElement).value)">
    </div>

    <p v-if="error" class="adm-field__error" role="alert">{{ error }}</p>
    <p v-else-if="!image" class="adm-field__error" role="alert">這個圖片區塊還沒有圖片：請選擇一張，或把它刪掉。</p>
    <p v-if="pending" class="adm-upload__pending">
      <span class="adm-badge adm-badge--review">尚未上傳</span>
      {{ pending.file.name }} —— 目前只是預覽，<strong>按下表單的儲存按鈕才會真的上傳</strong>。
    </p>
  </NodeViewWrapper>
</template>
