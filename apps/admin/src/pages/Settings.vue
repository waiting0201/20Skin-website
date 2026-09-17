<script setup lang="ts">
// 全站設定（/settings）—— 規格見 docs/02 §3、docs/08 §G-1。
//
// 站名／Logo／預設 OG 圖／全站 NAP 主資料／追蹤碼／`/contact/` 收件信箱，
// 外加 AI 問答面板設定（docs/04-ai-faq.md §4：不新增畫面，併入這裡）。
//
// 設定類（setting.edit，限超級管理員）：不走審核，儲存即生效，而且沒有留痕
// （2026-09-11 定案不做操作日誌，docs/08 §I）——畫面上刻意不做「版本歷程」
// 那一塊 UI，只顯示「最後修改時間」，並在下方用一段文字把「這不是版本歷程」
// 講清楚，避免有人誤以為改壞了還能像九個內容模型一樣一鍵還原。
import { computed, onMounted, reactive, ref } from 'vue'
import { adminApi, ApiError } from '@/api/client'
import type { SiteSettingsData, SiteSettingsDraft } from '@/api/site'
import { countPendingImages, resolveImage } from '@/image-value'
import { currentUser } from '@/auth'
import { hasPermission } from '@/permissions'
import ImageField from '@/components/ImageField.vue'
import type { AdminRecord } from '@/types'

const user = currentUser()
const permCtx = user ? { roles: user.roles, isSuperAdmin: user.isSuperAdmin } : null
const canEdit = computed(() => hasPermission(permCtx, 'settings.edit'))

const loading = ref(true)
const saving = ref(false)
const actionError = ref('')
const actionNotice = ref('')

// ⚠️ 型別是 SiteSettingsDraft 不是 SiteSettingsData：Logo 與預設 OG 圖在編輯中
//    可能還沒上傳（選了檔案只是預覽，見 src/image-value.ts）。
const form = reactive<SiteSettingsDraft>({
  siteName: '',
  logo: null,
  defaultOgImage: null,
  nap: [],
  trackingCodes: '',
  contactEmail: '',
  socialLinks: [],
  footerCopyright: '',
  aiFaq: { enabled: false, panelTitle: '', welcomeMessage: '', bookingUrl: '', lineUrl: '' },
  updatedAt: '',
  updatedByUserId: null,
})

// ⚠️ NAP 必須與據點頁、頁尾逐字一致（CLAUDE.md／docs/03 §4 ③：AI 靠交叉比對
// 建立實體信心，任何不一致都會降低確信度）。這裡拿「據點」內容模型的既有
// 資料做逐字比對，UI 上直接標出不一致，而不是等上線後被發現。
const clinics = ref<AdminRecord[]>([])

interface NapCheck {
  matched: AdminRecord | null
  phoneMismatch: boolean
  addressMismatch: boolean
}

const napChecks = computed<NapCheck[]>(() =>
  form.nap.map((entry) => {
    const matched = clinics.value.find((c) => c.title === entry.name) ?? null
    if (!matched) return { matched: null, phoneMismatch: false, addressMismatch: false }
    return {
      matched,
      phoneMismatch: String(matched.fields.phone ?? '') !== entry.phone,
      addressMismatch: String(matched.fields.address ?? '') !== entry.address,
    }
  }),
)

const loadError = ref('')

function messageOf(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.details.length ? `${e.message}（${e.details.join('、')}）` : e.message
  if (e instanceof Error) return e.message
  return fallback
}

// ⚠️ 原本只有 try/finally 沒有 catch：API 一掛掉就是 spinner 轉完之後一個
//    「什麼都沒有」的畫面，加上一個沒有人接的 promise rejection。
async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const [settings, clinicList] = await Promise.all([
      adminApi.site.settings.get(),
      adminApi.content.list('clinic', { pageSize: 100 }),
    ])
    Object.assign(form, settings)
    clinics.value = clinicList.items
  } catch (e) {
    loadError.value = messageOf(e, '載入設定失敗。')
  } finally {
    loading.value = false
  }
}
onMounted(load)

function addNapEntry() {
  form.nap = [...form.nap, { name: '', phone: '', address: '' }]
}
function removeNapEntry(index: number) {
  form.nap = form.nap.filter((_, i) => i !== index)
}
function copyFromClinic(index: number) {
  const check = napChecks.value[index]
  if (!check.matched) return
  form.nap[index].phone = String(check.matched.fields.phone ?? '')
  form.nap[index].address = String(check.matched.fields.address ?? '')
}

const pendingImages = computed(() => countPendingImages(form.logo) + countPendingImages(form.defaultOgImage))

async function save() {
  saving.value = true
  actionError.value = ''
  actionNotice.value = ''
  try {
    // 🔴 圖片在這一刻才真的上傳（選檔時只產生預覽，見 src/image-value.ts）。
    //    先換成 UploadedImage 再組 payload —— `update()` 收的是 SiteSettingsData，
    //    漏掉這兩行是編譯錯誤，不是執行期的靜默錯誤。
    const logo = await resolveImage(form.logo)
    const defaultOgImage = await resolveImage(form.defaultOgImage)
    form.logo = logo
    form.defaultOgImage = defaultOgImage

    const patch: Partial<SiteSettingsData> = {
      siteName: form.siteName,
      logo,
      defaultOgImage,
      nap: form.nap,
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
              <label class="adm-field__label">Logo</label>
              <ImageField :model-value="form.logo" :disabled="!canEdit" @update:model-value="(v) => (form.logo = v)" />
            </div>
            <div class="adm-field">
              <label class="adm-field__label">預設 OG 分享圖</label>
              <ImageField :model-value="form.defaultOgImage" :disabled="!canEdit" @update:model-value="(v) => (form.defaultOgImage = v)" />
              <p class="adm-field__hint">個別內容頁的 SEO 區塊若沒設定 OG 圖，退回用這張。</p>
            </div>
            <div class="adm-field">
              <label class="adm-field__label">`/contact/` 表單收件信箱</label>
              <input v-model="form.contactEmail" class="adm-input" type="email" :disabled="!canEdit">
              <p class="adm-field__hint">表單只寄通知信，後台不留存收件紀錄。</p>
            </div>
            <div class="adm-field adm-field--span2">
              <label class="adm-field__label">追蹤碼</label>
              <textarea v-model="form.trackingCodes" class="adm-textarea" :disabled="!canEdit" placeholder="GA4／GTM／Meta Pixel 等，貼上完整程式碼片段" />
            </div>
          </div>
        </div>

        <div class="adm-card">
          <p class="adm-fieldset__legend">全站 NAP 主資料</p>
          <p class="adm-field__hint" style="margin-bottom: var(--sp-3)">
            必須與各據點頁、頁尾逐字一致——AI 靠交叉比對建立實體信心，任何不一致都會降低確信度。
          </p>

          <div v-for="(entry, idx) in form.nap" :key="idx" class="adm-repeater__row" style="flex-direction: column; align-items: stretch; gap: var(--sp-2)">
            <div class="adm-repeater__fields">
              <div class="adm-field">
                <label class="adm-field__label">名稱</label>
                <input v-model="entry.name" class="adm-input" type="text" :disabled="!canEdit">
              </div>
              <div class="adm-field">
                <label class="adm-field__label">電話</label>
                <input v-model="entry.phone" class="adm-input" type="text" :disabled="!canEdit">
              </div>
              <div class="adm-field adm-field--span2">
                <label class="adm-field__label">地址</label>
                <input v-model="entry.address" class="adm-input" type="text" :disabled="!canEdit">
              </div>
            </div>

            <p v-if="!napChecks[idx]?.matched" class="adm-risk-hit">
              ⚠️ 在「據點」內容裡找不到名稱完全相同的項目（{{ entry.name || '（未命名）' }}），無法核對一致性。
            </p>
            <p v-else-if="napChecks[idx].phoneMismatch || napChecks[idx].addressMismatch" class="adm-risk-hit">
              ⚠️ 與據點頁「{{ napChecks[idx].matched!.title }}」不一致：
              <template v-if="napChecks[idx].phoneMismatch">電話（據點頁為「{{ napChecks[idx].matched!.fields.phone }}」）</template>
              <template v-if="napChecks[idx].phoneMismatch && napChecks[idx].addressMismatch">、</template>
              <template v-if="napChecks[idx].addressMismatch">地址（據點頁為「{{ napChecks[idx].matched!.fields.address }}」）</template>
              <button v-if="canEdit" type="button" class="btn btn--line btn--sm" style="margin-left: var(--sp-2)" @click="copyFromClinic(idx)">套用據點頁的值</button>
            </p>
            <p v-else class="adm-field__hint" style="color: var(--adm-ok)">✓ 與據點頁「{{ napChecks[idx].matched!.title }}」一致。</p>

            <button v-if="canEdit" type="button" class="btn btn--line btn--sm" style="align-self: flex-start" @click="removeNapEntry(idx)">移除這筆 NAP</button>
          </div>
          <button v-if="canEdit" type="button" class="btn btn--ghost btn--sm" style="margin-top: var(--sp-2)" @click="addNapEntry">＋ 新增 NAP</button>
        </div>

        <div class="adm-card">
          <p class="adm-fieldset__legend">AI 問答面板（浮動 CTA）</p>
          <p class="adm-field__hint" style="margin-bottom: var(--sp-3)">
            FAQ 題目不在這裡挑選——面板內容由 AI 依站內語料生成，這裡只管開關與面板文案。
          </p>
          <div class="adm-field-grid">
            <div class="adm-field">
              <label class="adm-checkbox">
                <input v-model="form.aiFaq.enabled" type="checkbox" :disabled="!canEdit">
                啟用浮動 AI 問答入口
              </label>
              <p class="adm-field__hint">
                ⚠️ 預設為「關閉」——AI 還沒串接前不對外顯示，面板文案可以先設定好放著。
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
              <label class="adm-field__label">轉真人出口：預約網址</label>
              <input v-model="form.aiFaq.bookingUrl" class="adm-input" type="text" :disabled="!canEdit">
            </div>
            <div class="adm-field">
              <label class="adm-field__label">轉真人出口：LINE 連結</label>
              <input v-model="form.aiFaq.lineUrl" class="adm-input" type="text" :disabled="!canEdit">
            </div>
          </div>
        </div>

        <div v-if="canEdit" class="adm-inline-actions">
          <button type="submit" class="btn btn--primary" :disabled="saving">
            <template v-if="saving">儲存中…</template>
            <template v-else-if="pendingImages">上傳 {{ pendingImages }} 張圖片並儲存</template>
            <template v-else>儲存設定</template>
          </button>
          <span class="adm-muted">最後修改：{{ form.updatedAt ? new Date(form.updatedAt).toLocaleString('zh-TW') : '尚無紀錄' }}</span>
        </div>
        <p class="adm-workflow__note">
          ⚠️ 這裡沒有版本歷程——設定類不留痕，上面的「最後修改時間」
          只是顯示用，查不到是誰、從什麼值改成什麼值。控管手段只剩「限超級管理員」這道權限門檻。
        </p>
      </form>
    </template>
  </section>
</template>
