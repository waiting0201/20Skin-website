<script setup lang="ts">
// 後台登入。docs/10-api.md §3.2、docs/11-backend-design.md §5.2：
// 帳號（userName，**不是 email**）＋ 密碼，**單段驗證**——不做雙因素
// （2026-09-11 院方決定）。
//
// 🔴 連帶後果：登入次數限制是後台唯一的防線（IP 白名單與雙因素都不做，
// 而 /admin/ 是客戶指定、公開可猜的路徑）。**不要在這裡加任何會放寬判定的
// 東西**——「記住此裝置」、失敗提示區分帳號是否存在、前端自行放寬鎖定，
// 每一項都是在拆僅剩的那道防線。
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { adminApi, ApiError } from '@/api/client'
import { _setSession, isAuthenticated } from '@/auth'
import { botCheckEnabled } from '@/api/bot-check'

// layout: false 改由 src/router.ts 路由表 meta 處理（App.vue 依 meta.layout 決定要不要套 AdminLayout）。

const route = useRoute()
const router = useRouter()

// 未登入時 router.ts 的全域 beforeEach 會把使用者導回這裡並帶上 redirect；
// 已經登入的人直接跳過登入頁。
// ⚠️ 這裡刻意不用 `await`——<script setup> 的頂層 await 會讓元件變成非同步
// 元件，沒有 <Suspense> 邊界會出錯。不等待不影響行為：下面宣告的
// ref／function 就算元件即將被導離也不影響正確性。
if (isAuthenticated()) {
  router.replace((route.query.redirect as string) || '/')
}

const userName = ref('')
const password = ref('')
const errorMessage = ref('')
const submitting = ref(false)

// 首登強制改密碼（docs/10 §3.2）。
//
// 🔴 **登入是成功的、token 也發了** —— 不發 token 的話使用者永遠改不了密碼，
//    種子帳號等於鎖死。但在改掉之前，除了改密碼與登出以外每一支端點都會回
//    403 AUTH_MUST_CHANGE_PASSWORD，所以這裡必須把人擋在這一步，不能放進後台。
const mustChangePassword = ref(false)
const newPassword = ref('')
const newPasswordConfirm = ref('')

async function submitCredentials() {
  errorMessage.value = ''
  submitting.value = true
  try {
    const user = await adminApi.auth.login(userName.value.trim(), password.value)
    if (user.mustChangePassword) {
      mustChangePassword.value = true
      return
    }
    _setSession(user)
    await router.push((route.query.redirect as string) || '/')
  } catch (e) {
    errorMessage.value = e instanceof ApiError ? e.message : '登入失敗，請稍後再試。'
  } finally {
    submitting.value = false
  }
}

async function submitNewPassword() {
  errorMessage.value = ''
  if (newPassword.value !== newPasswordConfirm.value) {
    errorMessage.value = '兩次輸入的新密碼不一致。'
    return
  }
  submitting.value = true
  try {
    await adminApi.auth.changePassword(password.value, newPassword.value)
    // ⚠️ 改完一定要重新登入：權限與旗標都在 token 裡，舊 token 帶的還是
    //    「尚未改密碼」，拿著它進後台每一支端點都會被擋。
    const user = await adminApi.auth.login(userName.value.trim(), newPassword.value)
    _setSession(user)
    await router.push((route.query.redirect as string) || '/')
  } catch (e) {
    errorMessage.value = e instanceof ApiError ? e.message : '變更密碼失敗，請稍後再試。'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="adm-app">
    <div class="adm-login">
      <!-- 左：品牌欄（裝飾用，實際內容都在右側表單）。840px 以下收成頂端橫幅，
           見 admin.css §15。 -->
      <div class="adm-login__aside" aria-hidden="true">
        <div class="c-ring adm-login__ring"></div>
        <div class="adm-login__aside-inner">
          <!-- 動態綁定，理由見 src/AdminLayout.vue 同一張圖的註解。 -->
          <img class="adm-login__mark" :src="'/assets/logo.jpg'" alt="" width="52" height="53">
          <p class="adm-login__wordmark">20SKIN</p>
          <p class="adm-login__tagline">美醫集團・後台管理系統</p>
        </div>
      </div>

      <div class="adm-login__main">
        <div class="adm-login__card">
          <h1 class="adm-login__title">{{ mustChangePassword ? '設定新密碼' : '登入' }}</h1>
          <p class="adm-login__subtitle">
            {{ mustChangePassword ? '這組帳號還在用建立時給的密碼，請先設定新密碼才能進入後台。' : '請輸入帳號與密碼以繼續。' }}
          </p>

          <form v-if="!mustChangePassword" class="adm-form" @submit.prevent="submitCredentials">
            <p v-if="errorMessage" class="adm-alert adm-alert--danger" role="alert">{{ errorMessage }}</p>
            <div class="adm-field">
              <label class="adm-field__label" for="userName">帳號</label>
              <input id="userName" v-model="userName" class="adm-input" type="text" autocomplete="username" required>
            </div>
            <div class="adm-field">
              <label class="adm-field__label" for="password">密碼</label>
              <input id="password" v-model="password" class="adm-input" type="password" autocomplete="current-password" required>
            </div>
            <button type="submit" class="btn btn--primary btn--block" :disabled="submitting">
              {{ submitting ? '登入中…' : '登入' }}
            </button>
          </form>

          <form v-else class="adm-form" @submit.prevent="submitNewPassword">
            <p v-if="errorMessage" class="adm-alert adm-alert--danger" role="alert">{{ errorMessage }}</p>
            <div class="adm-field">
              <label class="adm-field__label" for="newPassword">新密碼</label>
              <input id="newPassword" v-model="newPassword" class="adm-input" type="password" autocomplete="new-password" required minlength="8">
            </div>
            <div class="adm-field">
              <label class="adm-field__label" for="newPasswordConfirm">再輸入一次</label>
              <input id="newPasswordConfirm" v-model="newPasswordConfirm" class="adm-input" type="password" autocomplete="new-password" required minlength="8">
            </div>
            <button type="submit" class="btn btn--primary btn--block" :disabled="submitting">
              {{ submitting ? '處理中…' : '設定新密碼並登入' }}
            </button>
          </form>

          <p v-if="botCheckEnabled" class="adm-login__hint">
            <!-- 🔴 Google 的條款：使用 reCAPTCHA 就必須顯示這段聲明，兩個連結都要留著。
                 ⚠️ 不要改寫成自己的說法 —— 它是使用條款要求的文字。 -->
            本頁受 reCAPTCHA 保護，適用 Google 的
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener external">隱私權政策</a>與
            <a href="https://policies.google.com/terms" target="_blank" rel="noopener external">服務條款</a>。
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
