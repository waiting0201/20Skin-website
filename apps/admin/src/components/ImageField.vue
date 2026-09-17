<script setup lang="ts">
// 內容欄位裡的一張圖（docs/08-database.md §0 決策五、docs/09-frontend.md §9）。
//
// ⚠️ **這裡沒有「從媒體庫挑圖」**（2026-09-11 定案不做媒體庫）。一個欄位獨佔一張圖：
// 上傳就在這個欄位裡發生，換掉或移除時 API 會把舊檔從 Blob 刪掉
// （docs/11-backend-design.md §9）。所以這個元件只有三個動作：上傳、改 alt、移除。
//
// ⚠️ 移除是**真的會刪檔**，不是只解除引用——存檔之後那個網址就是 404，
// 版本還原也救不回來。按鈕文案要照實說，不要寫成「取消選取」。
//
// ⚠️ **沒有「貼上圖片網址」這條路**。圖片值一定要帶 blobPath，否則換圖時找不到
// 舊檔可刪（docs/11 §9），API 會直接擋下沒有 blobPath 的圖片值。網址只能由
// `POST /admin/upload/commit` 產生。

import { ref } from 'vue'
import { adminApi, ApiError } from '../api/client'
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES, type UploadedImage } from '../api/upload'

const props = defineProps<{
  modelValue: UploadedImage | null
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [UploadedImage | null] }>()

const fileInput = ref<HTMLInputElement | null>(null)
const busy = ref(false)
const error = ref('')

async function pick(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // 同一個檔案連選兩次也要能觸發 change
  if (!file) return

  error.value = ''

  // 先在前端擋掉明顯過大的檔案：直傳模式下檔案不經過 API，
  // 讓使用者傳完 30 MB 才在回報那一步被拒絕是白等（docs/11 §9）。
  if (file.size > MAX_IMAGE_BYTES) {
    error.value = `檔案大小超過上限（${MAX_IMAGE_BYTES / 1024 / 1024} MB）。`
    return
  }

  busy.value = true
  try {
    const image = await adminApi.upload.upload(file)
    emit('update:modelValue', image)
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '上傳失敗。'
  } finally {
    busy.value = false
  }
}

function setAlt(value: string) {
  if (!props.modelValue) return
  emit('update:modelValue', { ...props.modelValue, alt: value || null })
}

function remove() {
  emit('update:modelValue', null)
}
</script>

<template>
  <div class="adm-upload">
    <div class="adm-upload__preview">
      <img v-if="modelValue?.url" :src="modelValue.url" :alt="modelValue.alt ?? ''">
      <span v-else>尚無圖片</span>
    </div>

    <div class="adm-upload__row">
      <input ref="fileInput" type="file" hidden :accept="ACCEPTED_IMAGE_TYPES" @change="pick">
      <button type="button" class="btn btn--line btn--sm" :disabled="disabled || busy" @click="fileInput?.click()">
        {{ busy ? '上傳中…' : modelValue ? '換一張' : '上傳圖片' }}
      </button>
      <button v-if="modelValue" type="button" class="btn btn--line btn--sm" :disabled="disabled" @click="remove">
        移除
      </button>
    </div>

    <input
      v-if="modelValue"
      class="adm-input"
      type="text"
      placeholder="替代文字（alt）——螢幕閱讀器與 SEO 都讀它"
      :value="modelValue.alt ?? ''"
      :disabled="disabled"
      @input="setAlt(($event.target as HTMLInputElement).value)"
    >

    <!-- 錯誤訊息原本跟下面的提醒文字共用同一個灰色 class，跟一般說明文字
         分不出差異——改用 .adm-field__error（危險色）,讓「上傳失敗」這種
         真的需要使用者注意的訊息不會被當成裝飾性小字忽略掉。 -->
    <p v-if="error" class="adm-field__error" role="alert">{{ error }}</p>
    <p v-if="modelValue" class="adm-upload__todo">
      ⚠️ 移除或換圖之後，舊檔案會在存檔時從 Blob 刪除，版本還原不會把它變回來。
    </p>
  </div>
</template>
