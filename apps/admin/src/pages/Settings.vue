<script setup lang="ts">
// 全站設定（/settings）—— 規格見 docs/02 §3、docs/08 §G-1。
//
// 站名／預設 OG 圖／追蹤碼／`/contact/` 收件信箱，
// 外加 AI 問答面板設定（docs/04-ai-faq.md §4：不新增畫面，併入這裡）。
//
// 🔴 **沒有「全站院所資訊（NAP）」的編輯區**（2026-10-01 拿掉，**不要加回來**）。
//    那一區寫的是設定鍵 `nap.json`，而**前台從來沒有讀過它** —— 頁尾、據點頁、首頁、
//    聯絡我們的名稱／電話／地址一律來自「據點」內容（`apps/web/app/data/navigation.ts`
//    的 `getClinicNap()`）。所以它不是「主資料」，是一份沒有人讀的第二份：
//    改了前台不會變，畫面上那組「與據點頁一致／不一致」的檢查，比對的是兩份
//    其中一份根本沒在用的資料。真的要改電話地址，是改據點那一筆。
//    ⚠️ 設定鍵 `nap.json` 留在資料庫（同 `site.logoImage`：拿掉要一支 migration，
//    而它沒有害處）；`PUT /admin/setting` 只更新送上來的鍵，不送就不會動到它。
//
// 🔴 **沒有 Logo 上傳欄位**（Tim 指定 2026-09-17，**不要加回來**）。站徽走建置產物
//    `/assets/logo.jpg`，前台三處（頁首、頁尾、首頁 JSON-LD 的 Organization.logo）
//    都是寫死指過去的，**從來沒有讀過 `site.logoImage`** ——
//    所以在此之前那個欄位是「傳了也沒有用」：檔案真的進 Blob、設定鍵真的被寫入，
//    而前台一個像素都不會變。要換站徽是換建置產物那張圖（並重新部署），
//    見 apps/admin/src/api/site.ts 的 `SiteSettingsData`。
//
// 設定類（setting.edit，限超級管理員）：不走審核，儲存即生效，而且沒有留痕
// （2026-09-11 定案不做操作日誌，docs/08 §I）——畫面上刻意不做「版本歷程」
// 那一塊 UI，只顯示「最後修改時間」，並在下方用一段文字把「這不是版本歷程」
// 講清楚，避免有人誤以為改壞了還能像九個內容模型一樣一鍵還原。
import { computed, onMounted, reactive, ref } from 'vue'
import { adminApi, ApiError } from '@/api/client'
import type { AiIndexStatus, SiteSettingsData, SiteSettingsDraft } from '@/api/site'
import { countPendingImages, resolveImage } from '@/image-value'
import { currentUser } from '@/auth'
import { hasPermission } from '@/permissions'
import ImageField from '@/components/ImageField.vue'

const user = currentUser()
const permCtx = user ? { roles: user.roles, isSuperAdmin: user.isSuperAdmin } : null
const canEdit = computed(() => hasPermission(permCtx, 'settings.edit'))

const loading = ref(true)
const saving = ref(false)
const actionError = ref('')
const actionNotice = ref('')

// ⚠️ 型別是 SiteSettingsDraft 不是 SiteSettingsData：預設 OG 圖在編輯中
//    可能還沒上傳（選了檔案只是預覽，見 src/image-value.ts）。
const form = reactive<SiteSettingsDraft>({
  siteName: '',
  defaultOgImage: null,
  trackingCodes: '',
  contactEmail: '',
  socialLinks: [],
  footerCopyright: '',
  aiFaq: { enabled: false, panelTitle: '', welcomeMessage: '', bookingUrl: '', lineUrl: '' },
  updatedAt: '',
  updatedByUserId: null,
})

const loadError = ref('')

function messageOf(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.details.length ? `${e.message}（${e.details.join('、')}）` : e.message
  if (e instanceof Error) return e.message
  return fallback
}

// ⚠️ 原本只有 try/finally 沒有 catch：API 一掛掉就是 spinner 轉完之後一個
//    「什麼都沒有」的畫面，加上一個沒有人接的 promise rejection。
const aiIndex = ref<AiIndexStatus | null>(null)

/** 顯示用的時間。⚠️ 後端給的是 UTC，畫面一律台北時間。 */
const aiIndexUpdatedAt = computed(() => {
  const value = aiIndex.value?.builtAt
  if (!value) return '—'
  const utc = value.endsWith('Z') ? value : `${value}Z`
  return new Date(utc).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })
})

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    Object.assign(form, await adminApi.site.settings.get())

    // ⚠️ 語料狀態失敗不該讓整頁設定載不進來 —— 它只是一行說明文字。
    aiIndex.value = await adminApi.site.aiIndex.status().catch(() => null)
  } catch (e) {
    loadError.value = messageOf(e, '載入設定失敗。')
  } finally {
    loading.value = false
  }
}
onMounted(load)

/**
 * 追蹤 ID 的格式。與 API 的 `SettingHandler.TrackingIdPattern` 逐條對應 ——
 * 改一邊就要改另一邊。
 */
const TRACKING_ID_PATTERN = /^\s*(G-[A-Z0-9]{4,20}|GTM-[A-Z0-9]{4,10})(\s*,\s*(G-[A-Z0-9]{4,20}|GTM-[A-Z0-9]{4,10}))*\s*$/i
const trackingError = ref('')

const pendingImages = computed(() => countPendingImages(form.defaultOgImage))

async function save() {
  trackingError.value = ''
  if (form.trackingCodes.trim() && !TRACKING_ID_PATTERN.test(form.trackingCodes)) {
    trackingError.value = '只收 GA4 的評估 ID（G-XXXXXXXX）或 GTM 的容器 ID（GTM-XXXXXXX），多組以逗號分隔。不要貼整段程式碼。'
    return
  }
  saving.value = true
  actionError.value = ''
  actionNotice.value = ''
  try {
    // 🔴 圖片在這一刻才真的上傳（選檔時只產生預覽，見 src/image-value.ts）。
    //    先換成 UploadedImage 再組 payload —— `update()` 收的是 SiteSettingsData，
    //    漏掉這一行是編譯錯誤，不是執行期的靜默錯誤。
    const defaultOgImage = await resolveImage(form.defaultOgImage)
    form.defaultOgImage = defaultOgImage

    const patch: Partial<SiteSettingsData> = {
      siteName: form.siteName,
      defaultOgImage,
      trackingCodes: form.trackingCodes,
      contactEmail: form.contactEmail,
      aiFaq: form.aiFaq,
    }
    const next = await adminApi.site.settings.update(patch, user!.id)
    Object.assign(form, next)
    actionNotice.value = '已儲存，立即生效。'
  } catch (e) {
    actionError.value = messageOf(e, '儲存失敗。')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="adm-page">
    <header class="adm-page__head">
      <div>
        <h1 class="adm-page__title">全站設定</h1>
        <p class="adm-page__desc">限超級管理員。</p>
      </div>
    </header>

    <div v-if="loading" class="adm-loading">
      <span class="adm-spinner" aria-hidden="true"></span>
      <span>載入中…</span>
    </div>

    <div v-else-if="loadError" class="adm-empty">
      <p class="adm-empty__title">載入不到全站設定</p>
      <p class="adm-empty__desc">{{ loadError }}</p>
      <p class="adm-empty__desc"><button type="button" class="btn btn--line btn--sm" @click="load">重新載入</button></p>
    </div>

    <template v-else>
      <p v-if="actionNotice" class="adm-alert adm-alert--success" style="margin-bottom: var(--sp-4)">{{ actionNotice }}</p>
      <p v-if="actionError" class="adm-alert adm-alert--danger" role="alert" style="margin-bottom: var(--sp-4)">{{ actionError }}</p>
      <p v-if="!canEdit" class="adm-alert adm-alert--info" style="margin-bottom: var(--sp-4)">
        目前帳號沒有編輯權限，以下僅供檢視。
      </p>

      <form class="adm-form" @submit.prevent="save">
        <div class="adm-card">
          <p class="adm-fieldset__legend">品牌基本資料</p>
          <div class="adm-field-grid">
            <div class="adm-field">
              <label class="adm-field__label">站名</label>
              <input v-model="form.siteName" class="adm-input" type="text" :disabled="!canEdit">
            </div>
            <div class="adm-field">
              <label class="adm-field__label">網站標誌（Logo）</label>
              <!-- ⚠️ 刻意**沒有上傳欄位**（Tim 指定 2026-09-17）——前台是寫死指向
                   建置產物的那張圖，上傳到這裡的檔案沒有任何地方會讀。 -->
              <div class="adm-upload__preview" style="max-width: 120px">
                <!-- ⚠️ `:src` 是綁定不是字面值，與 AdminLayout.vue／Login.vue 一致 ——
                     寫成 `src="/assets/logo.jpg"` 會被 Vite 依 `base: '/admin/'`
                     改寫成 `/admin/assets/logo.jpg`，正式環境就是 404。 -->
                <img :src="'/assets/logo.jpg'" alt="20SKIN 美醫集團標誌" width="58" height="59">
              </div>
              <p class="adm-field__hint">
                頁首、頁尾與搜尋引擎的品牌標誌都直接用網站內建的這一張，不需要另外上傳。
                要換標誌請告知工程端（換的是網站的圖檔本身，一次全站生效）。
              </p>
            </div>
            <div class="adm-field">
              <label class="adm-field__label">預設分享縮圖（貼到 LINE、Facebook 時顯示）</label>
              <ImageField :model-value="form.defaultOgImage" :disabled="!canEdit" @update:model-value="(v) => (form.defaultOgImage = v)" />
              <p class="adm-field__hint">個別頁面的 SEO 區塊沒有自己設定分享縮圖時，就用這一張。</p>
            </div>
            <div class="adm-field">
              <label class="adm-field__label">「聯絡我們」表單的收件信箱</label>
              <input v-model="form.contactEmail" class="adm-input" type="email" :disabled="!canEdit">
              <p class="adm-field__hint">表單只寄通知信，後台不留存收件紀錄。</p>
            </div>
            <div class="adm-field adm-field--span2">
              <label class="adm-field__label">分析追蹤 ID</label>
              <input
                v-model="form.trackingCodes"
                class="adm-input"
                :class="{ 'is-invalid': trackingError }"
                type="text"
                :disabled="!canEdit"
                placeholder="G-ABCD1234，多組以逗號分隔"
              >
              <p v-if="trackingError" class="adm-field__error" role="alert">{{ trackingError }}</p>
              <p class="adm-field__hint">
                填 GA4 的評估 ID（<code>G-</code> 開頭）或 GTM 的容器 ID（<code>GTM-</code> 開頭），
                網站會自動掛上官方的追蹤程式。存檔後下一個訪客就開始計數，不需要重新部署。
              </p>
              <!-- ⚠️ 這裡刻意**不收整段程式碼**（原本的 placeholder 是「貼上完整程式碼片段」）：
                   那等於任何能改設定的人都可以在全站每一頁對每一位訪客執行任意 JavaScript，
                   而設定類不走審核也不留痕，後台又沒有 IP 白名單與雙因素（CLAUDE.md 決策 10）。 -->
              <p class="adm-field__hint">
                ⚠️ 這裡只收 ID，不收整段程式碼——貼程式碼會被擋下。
                Meta Pixel 這類非 Google 的工具目前不支援，需要的話請告知工程端。
              </p>
            </div>
          </div>
        </div>

        <div class="adm-card">
          <p class="adm-fieldset__legend">院所資訊（名稱／電話／地址）</p>
          <p class="adm-field__hint">
            院所的名稱、電話、地址與看診時段請到
            <RouterLink to="/clinic">據點</RouterLink>
            裡修改。頁尾、據點頁、首頁與聯絡我們都讀那一份，改一次全站就一致。
          </p>
        </div>

        <div class="adm-card">
          <p class="adm-fieldset__legend">AI 問答面板（網頁右下角的浮動按鈕）</p>
          <p class="adm-field__hint" style="margin-bottom: var(--sp-3)">
            面板要回答什麼不在這裡挑——AI 是讀整個網站的內容自己組出答案的，這裡只管開關與面板上的文案。
          </p>
          <div class="adm-field-grid">
            <div class="adm-field">
              <label class="adm-checkbox">
                <input v-model="form.aiFaq.enabled" type="checkbox" :disabled="!canEdit">
                啟用浮動 AI 問答入口
              </label>
              <p class="adm-field__hint">
                ⚠️ 目前預設關閉。等療程與常見問題的內容補得夠完整再打開——
                內容不夠時線上諮詢會常常答不出來，比沒有這個按鈕更糟。打開不需要重新上版。
              </p>
            </div>
            <div class="adm-field">
              <label class="adm-field__label">面板標題</label>
              <input v-model="form.aiFaq.panelTitle" class="adm-input" type="text" :disabled="!canEdit">
            </div>
            <div class="adm-field adm-field--span2">
              <label class="adm-field__label">歡迎文案</label>
              <textarea v-model="form.aiFaq.welcomeMessage" class="adm-textarea" :disabled="!canEdit" />
            </div>
            <div class="adm-field">
              <label class="adm-field__label">轉接真人：預約網址</label>
              <input v-model="form.aiFaq.bookingUrl" class="adm-input" type="text" :disabled="!canEdit">
            </div>
            <div class="adm-field">
              <label class="adm-field__label">轉接真人：LINE 連結</label>
              <input v-model="form.aiFaq.lineUrl" class="adm-input" type="text" :disabled="!canEdit">
              <p class="adm-field__hint">
                留空＝依院區分流，列出每個據點的「LINE 連結」。填了就統一使用這一個帳號。
              </p>
            </div>
          </div>

          <p class="adm-field__hint" style="margin-top: var(--sp-3)">
            <template v-if="aiIndex?.ready">
              目前可回答的內容：{{ aiIndex.indexedItemCount }} 筆、{{ aiIndex.chunkCount }} 段（最後更新 {{ aiIndexUpdatedAt }}）。
              內容發布後約五分鐘內，線上諮詢就會讀到新版本。
            </template>
            <template v-else>
              內容還在整理中，線上諮詢暫時沒有可回答的資料。
            </template>
          </p>
        </div>

        <div v-if="canEdit" class="adm-inline-actions">
          <button type="submit" class="btn btn--primary" :disabled="saving">
            <template v-if="saving">儲存中…</template>
            <template v-else-if="pendingImages">上傳 {{ pendingImages }} 張圖片並儲存</template>
            <template v-else>儲存設定</template>
          </button>
          <span class="adm-muted">最後修改：{{ form.updatedAt ? new Date(form.updatedAt).toLocaleString('zh-TW') : '尚無紀錄' }}</span>
        </div>
      </form>
    </template>
  </section>
</template>
