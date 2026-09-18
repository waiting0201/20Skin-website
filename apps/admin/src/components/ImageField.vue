<script setup lang="ts">
// 內容欄位裡的一張圖（docs/08-database.md §0 決策五、docs/09-frontend.md §9）。
//
// ⚠️ **這裡沒有「從媒體庫挑圖」**（2026-09-11 定案不做媒體庫）。一個欄位獨佔一張圖：
// 上傳就在這個欄位裡發生，換掉或移除時 API 會把舊檔從 Blob 刪掉
// （docs/11-backend-design.md §9）。所以這個元件只有三個動作：選圖、改 alt、移除。
//
// 🔴 **選了圖不會馬上上傳**（Tim 指定，2026-09-17）。這個元件**完全不打網路** ——
//    它只做三件事：擋掉明顯不合格的檔案、用 `URL.createObjectURL()` 產生預覽、
//    把一個 PendingImage 交給表單。真正的上傳在表單的儲存流程裡
//    （`uploadPendingImages()`，見 src/image-value.ts 檔頭的理由）。
//    ⚠️ 所以**不要在這裡呼叫 `adminApi.upload`** —— 那正是改掉的舊行為，
//    會在使用者放棄編輯時於 Blob 留下沒有人引用的孤兒檔。
//
// ⚠️ 移除既有的圖是**真的會刪檔**，不是只解除引用——存檔之後那個網址就是 404，
// 版本還原也救不回來。按鈕文案要照實說，不要寫成「取消選取」。
//
// ⚠️ **沒有「貼上圖片網址」這條路**。圖片值一定要帶 blobPath，否則換圖時找不到
// 舊檔可刪（docs/11 §9），API 會直接擋下沒有 blobPath 的圖片值。網址只能由
// `POST /admin/upload/commit` 產生。

import { computed, onBeforeUnmount, ref } from 'vue'
import { ACCEPTED_IMAGE_TYPES } from '../api/upload'
import {
  createPendingImage,
  imagePreviewUrl,
  isPendingImage,
  releasePendingImage,
  validateImageFile,
  type ImageValue,
} from '../image-value'

// 🔴 **`withDefaults` 不是可有可無的。** Vue 對宣告成 boolean 的 prop 有「缺席即 false」
//    的轉型規則 —— 沒傳 `deletes-old-file` 時 `props.deletesOldFile` 是 **false**，
//    不是 undefined。所以「沒指定就當成 true」必須在這裡明講，
//    不能寫成 `props.deletesOldFile !== false` 之類的防呆（那樣九個內容模型那邊
//    **每一個圖片欄位的刪檔警告都會靜默消失**，而畫面上完全看不出來 ——
//    2026-09-18 實際踩到，靠端到端檢查才發現）。
const props = withDefaults(defineProps<{
  modelValue: ImageValue | null
  disabled?: boolean
  /**
   * 換圖／移除之後，舊檔案會不會真的被刪掉。
   *
   * 🔴 **這是事實的兩種版本，不是文案偏好。** 九個內容模型的圖走發布流程，
   *    發布時會清掉上一版獨有的 blob（`ContentHandler`）—— 那裡要照實警告。
   *    首頁版位設定的圖**沒有走那條路**（孤兒檔靠 `tools/blob-reconcile` 離線對帳），
   *    在那裡顯示同一句話就是**對使用者說謊**。
   * ⚠️ 預設 true：新的使用處若忘了指定，寧可多一句警告，不要少一句。
   */
  deletesOldFile?: boolean
}>(), { deletesOldFile: true })

const emit = defineEmits<{ 'update:modelValue': [ImageValue | null] }>()

const fileInput = ref<HTMLInputElement | null>(null)
const error = ref('')

const previewUrl = computed(() => imagePreviewUrl(props.modelValue))
const pending = computed(() => (isPendingImage(props.modelValue) ? props.modelValue : null))

function sizeText(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function pick(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // 同一個檔案連選兩次也要能觸發 change
  if (!file) return

  error.value = ''

  const problem = validateImageFile(file)
  if (problem) {
    error.value = problem
    return
  }

  // 換圖時把上一張待上傳的預覽釋放掉。⚠️ 只釋放「待上傳」的那種 ——
  // 已經在 Blob 上的圖不歸前端管，它的刪除是存檔時 API 做的事。
  releasePendingImage(props.modelValue)
  emit('update:modelValue', await createPendingImage(file, props.modelValue?.alt ?? null))
}

function setAlt(value: string) {
  if (!props.modelValue) return
  emit('update:modelValue', { ...props.modelValue, alt: value || null })
}

function remove() {
  releasePendingImage(props.modelValue)
  error.value = ''
  emit('update:modelValue', null)
}

// 元件被拆掉時（換一筆內容、離開畫面）也要釋放，否則預覽用的 object URL
// 會活到整個分頁關掉為止。
onBeforeUnmount(() => releasePendingImage(props.modelValue))
</script>

<template>
  <div class="adm-upload">
    <div class="adm-upload__preview">
      <img v-if="previewUrl" :src="previewUrl" :alt="modelValue?.alt ?? ''">
      <span v-else>尚無圖片</span>
    </div>

    <div class="adm-upload__row">
      <input ref="fileInput" type="file" hidden :accept="ACCEPTED_IMAGE_TYPES" @change="pick">
      <button type="button" class="btn btn--line btn--sm" :disabled="disabled" @click="fileInput?.click()">
        {{ modelValue ? '換一張' : '選擇圖片' }}
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
         分不出差異——改用 .adm-field__error（危險色）,讓「檔案不合格」這種
         真的需要使用者注意的訊息不會被當成裝飾性小字忽略掉。 -->
    <p v-if="error" class="adm-field__error" role="alert">{{ error }}</p>

    <!-- 待上傳：講清楚「現在看到的只是預覽，還沒有進到伺服器」。
         ⚠️ 不要把這段拿掉 —— 沒有它的話，使用者選完圖看到預覽就以為完成了，
         直接關掉分頁，圖片其實一個位元組都沒有離開這台電腦。 -->
    <p v-if="pending" class="adm-upload__pending">
      <span class="adm-badge adm-badge--review">尚未上傳</span>
      {{ pending.file.name }}（{{ sizeText(pending.file.size) }}<template v-if="pending.width">・{{ pending.width }}×{{ pending.height }}</template>）
      —— 目前只是瀏覽器裡的預覽，<strong>按下表單的儲存按鈕才會真的上傳</strong>。
    </p>
    <p v-else-if="modelValue && props.deletesOldFile" class="adm-upload__todo">
      ⚠️ 移除或換圖之後，舊的圖片檔會在存檔時真的刪掉，還原成舊版本也救不回來。
    </p>
  </div>
</template>

<style scoped>
.adm-upload__pending {
  font-size: var(--fs-xs);
  color: var(--ink-70);
  line-height: 1.7;
}
</style>
