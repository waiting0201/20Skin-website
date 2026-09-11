<script setup lang="ts">
// 媒體庫（/media）—— 規格見 docs/02-backend-cms.md §4、docs/09-frontend.md §9、
// docs/08-database.md §E。
//
// ⚠️ 沒有「插入圖片」的挑圖器（docs/02 §4 決議）：圖片只能從所屬欄位上傳
// （見 EditPage.vue 的 image／gallery 欄位）。這個畫面是總覽與清理用——
// 看有哪些檔案、被誰引用、刪掉沒人用的孤兒檔。
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { adminApi, ApiError } from '@/api/client'
import { USAGE_KIND_LABEL, type MediaAssetWithUsage } from '@/api/media'
import { currentUser } from '@/auth'
import { hasPermission } from '@/permissions'
import { UNIT_REGISTRY } from '@/units'

const user = currentUser()
const permCtx = user ? { roles: user.roles, isSuperAdmin: user.isSuperAdmin } : null
const canEdit = computed(() => hasPermission(permCtx, 'media.edit'))

const items = ref<MediaAssetWithUsage[]>([])
const loading = ref(true)
const query = reactive({ keyword: '', contentType: '' as '' | 'image' | 'other', unusedOnly: false })
const expanded = ref<Set<number>>(new Set())

async function load() {
  loading.value = true
  items.value = await adminApi.media.list({
    keyword: query.keyword || undefined,
    contentType: query.contentType || undefined,
    unusedOnly: query.unusedOnly,
  })
  loading.value = false
}

onMounted(load)
watch([() => query.keyword, () => query.contentType, () => query.unusedOnly], load)

function toggleExpand(id: number) {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

const removingId = ref<number | null>(null)
const removeError = ref('')

async function remove(asset: MediaAssetWithUsage) {
  removeError.value = ''
  removingId.value = asset.id
  try {
    await adminApi.media.remove(asset.id)
    await load()
  } catch (e) {
    removeError.value = e instanceof ApiError ? e.message : '刪除失敗。'
  } finally {
    removingId.value = null
  }
}

// ── 上傳：選檔 → 取 SAS → 直傳 → 回報（docs/09-frontend.md §9）───────────
//
// ⚠️ requestUploadSas 目前必定丟錯（見 src/api/media.ts）——api.20skin.tw
// 還沒有這支端點。這裡如實顯示失敗訊息，不 catch 掉假裝成功。
const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf']
const fileInput = ref<HTMLInputElement | null>(null)
const uploadNotice = ref('')
const uploading = ref(false)

function pickFile() {
  uploadNotice.value = ''
  fileInput.value?.click()
}

async function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // 讓使用者可以重選同一個檔案
  if (!file) return

  uploadNotice.value = ''
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

  // ⚠️ 這只是前端體驗檢查，不是安全邊界。直傳模式下伺服器端看不到檔案內容，
  // 驗不了 magic bytes（docs/11-backend-design.md §9）——真正的把關在回報端點
  // 讀檔頭驗證，以及公開／私有容器隔離；副檔名終究是使用者說了算。
  if (!ALLOWED_EXT.includes(ext)) {
    uploadNotice.value = `不支援的副檔名：.${ext || '（無）'}（僅接受 ${ALLOWED_EXT.map((x) => `.${x}`).join('／')}）。⚠️ 這只是前端檢查，不是安全邊界——伺服器端看不到直傳的檔案內容，驗不了 magic bytes，真正的把關在回報端點讀檔頭與容器隔離（docs/11-backend-design.md §9）。`
    return
  }

  uploading.value = true
  try {
    await adminApi.media.requestUploadSas(file.name, file.type)
    // 不會執行到這裡：requestUploadSas 目前必定丟錯。
  } catch (err) {
    uploadNotice.value = err instanceof ApiError ? `上傳失敗：${err.message}` : '上傳失敗：未知錯誤。'
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <section>
    <div class="adm-page__head">
      <div>
        <h1 class="adm-page__title">媒體庫</h1>
        <p class="adm-page__desc">
          共 {{ items.length }} 筆・總覽與清理用，沒有「插入圖片」的挑圖器——圖片只能從所屬欄位上傳（docs/02-backend-cms.md §4）。
        </p>
      </div>
      <div v-if="canEdit" class="adm-page__actions">
        <input ref="fileInput" type="file" hidden :accept="ALLOWED_EXT.map((x) => `.${x}`).join(',')" @change="onFileSelected">
        <button type="button" class="btn btn--primary" :disabled="uploading" @click="pickFile">
          {{ uploading ? '處理中…' : '＋ 上傳檔案' }}
        </button>
      </div>
    </div>

    <p v-if="uploadNotice" class="adm-risk-hit">{{ uploadNotice }}</p>
    <p v-if="removeError" class="adm-login__error" style="margin-bottom: var(--sp-4)">{{ removeError }}</p>

    <div class="adm-filters">
      <input v-model="query.keyword" type="search" placeholder="關鍵字（檔名／說明／Alt 文字）">
      <select v-model="query.contentType">
        <option value="">全部型別</option>
        <option value="image">僅圖片</option>
        <option value="other">僅其他檔案</option>
      </select>
      <label class="adm-checkbox"><input v-model="query.unusedOnly" type="checkbox"> 只看未被引用</label>
    </div>

    <p v-if="loading" class="adm-empty">載入中…</p>
    <p v-else-if="!items.length" class="adm-empty">沒有符合條件的檔案。</p>

    <div v-else class="adm-table-wrap">
      <table class="adm-table">
        <thead>
          <tr>
            <th></th>
            <th>檔名</th>
            <th>尺寸</th>
            <th>型別</th>
            <th>Alt 文字</th>
            <th>引用</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="asset in items" :key="asset.id">
            <tr>
              <td>
                <div class="media-thumb">
                  <img v-if="asset.publicUrl" :src="asset.publicUrl" alt="">
                  <span v-else>{{ asset.contentType.split('/')[1]?.slice(0, 4) ?? '檔案' }}</span>
                </div>
              </td>
              <td class="is-wrap">
                <div class="adm-table__title">{{ asset.originalFileName }}</div>
                <div class="adm-muted" style="font-size: var(--fs-xs)">
                  {{ formatBytes(asset.byteSize) }}{{ asset.isPrivate ? '・私有容器' : '' }}
                </div>
                <div v-if="asset.caption" class="adm-muted" style="font-size: var(--fs-xs)">{{ asset.caption }}</div>
              </td>
              <td>{{ asset.width && asset.height ? `${asset.width}×${asset.height}` : '—' }}</td>
              <td>{{ asset.contentType }}</td>
              <td class="is-wrap">
                <span v-if="asset.altText">{{ asset.altText }}</span>
                <span v-else class="adm-muted">（缺 alt）</span>
              </td>
              <td>
                <button v-if="asset.usageCount" type="button" class="btn btn--ghost btn--sm" @click="toggleExpand(asset.id)">
                  {{ asset.usageCount }} 筆{{ expanded.has(asset.id) ? '▲' : '▼' }}
                </button>
                <span v-else class="adm-muted">未使用</span>
              </td>
              <td class="adm-table__actions">
                <button
                  v-if="canEdit"
                  type="button"
                  class="btn btn--line btn--sm"
                  :disabled="removingId === asset.id"
                  :title="asset.usageCount ? '仍被引用，點下去會顯示原因' : '刪除'"
                  @click="remove(asset)"
                >
                  刪除
                </button>
              </td>
            </tr>
            <tr v-if="expanded.has(asset.id) && asset.usageCount">
              <td colspan="7">
                <div class="adm-workflow__banner">
                  被以下內容引用（刪除前必須清空，docs/08-database.md §E-2）：
                  <ul style="margin: var(--sp-2) 0 0; padding-left: 1.4em">
                    <li v-for="u in asset.usages" :key="u.id">
                      {{ UNIT_REGISTRY[u.contentUnit].label }}・{{ u.contentTitle }}（{{ USAGE_KIND_LABEL[u.usageKind] }}）
                    </li>
                  </ul>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.media-thumb {
  width: 56px;
  height: 56px;
  border-radius: var(--adm-radius);
  border: 1px solid var(--line);
  background: var(--fill-media);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  color: var(--ink-50);
  font-size: var(--fs-eyebrow);
  text-transform: uppercase;
}
.media-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
