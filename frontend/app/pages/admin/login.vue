<script setup lang="ts">
// 後台登入。docs/10-api.md §3.2、docs/11-backend-design.md §5.2：
// 帳號（userName，不是 email）＋ 密碼 → 若該帳號啟用雙因素，
// 只回 challengeId，不發 token；第二段驗證碼通過才建立 session。
import '~/admin/admin.css'
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { adminApi, ApiError } from '~/admin/api/client'
import { _setSession, isAuthenticated } from '~/admin/auth'

definePageMeta({ layout: false })

const route = useRoute()

// 未登入時 admin-auth middleware 會把使用者導回這裡並帶上 redirect；
// 已經登入的人直接跳過登入頁。
if (isAuthenticated()) {
  await navigateTo((route.query.redirect as string) || '/admin')
}

type Step = 'credentials' | '2fa'
const step = ref<Step>('credentials')
const userName = ref('')
const password = ref('')
const code = ref('')
const challengeId = ref('')
const errorMessage = ref('')
const submitting = ref(false)

async function submitCredentials() {
  errorMessage.value = ''
  submitting.value = true
  try {
    const result = await adminApi.auth.login(userName.value.trim(), password.value)
    if (result.requires2fa) {
      challengeId.value = result.challengeId!
      step.value = '2fa'
    } else if (result.user) {
      _setSession(result.user, `mock-token-${result.user.id}-${Date.now()}`)
      await navigateTo((route.query.redirect as string) || '/admin')
    }
  } catch (e) {
    errorMessage.value = e instanceof ApiError ? e.message : '登入失敗，請稍後再試。'
  } finally {
    submitting.value = false
  }
}

async function submit2fa() {
  errorMessage.value = ''
  submitting.value = true
  try {
    const user = await adminApi.auth.verify2fa(challengeId.value, code.value.trim())
    _setSession(user, `mock-token-${user.id}-${Date.now()}`)
    await navigateTo((route.query.redirect as string) || '/admin')
  } catch (e) {
    errorMessage.value = e instanceof ApiError ? e.message : '驗證失敗，請稍後再試。'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="adm-app">
    <div class="adm-login">
      <div class="adm-login__card">
        <div class="adm-login__brand">
          <img src="/assets/logo.jpg" alt="" width="48" height="49">
          <h1>20SKIN 後台管理</h1>
          <p>docs/02-backend-cms.md §4：雙因素驗證是登入流程的一部分，不提供略過管道。</p>
        </div>

        <form v-if="step === 'credentials'" class="adm-form" @submit.prevent="submitCredentials">
          <p v-if="errorMessage" class="adm-login__error">{{ errorMessage }}</p>
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

        <form v-else class="adm-form" @submit.prevent="submit2fa">
          <p v-if="errorMessage" class="adm-login__error">{{ errorMessage }}</p>
          <div class="adm-field">
            <label class="adm-field__label" for="code">雙因素驗證碼</label>
            <input id="code" v-model="code" class="adm-input" type="text" inputmode="numeric" autocomplete="one-time-code" required>
            <p class="adm-field__hint">六位數驗證碼，或輸入救援碼。</p>
          </div>
          <button type="submit" class="btn btn--primary btn--block" :disabled="submitting">
            {{ submitting ? '驗證中…' : '驗證並登入' }}
          </button>
        </form>

        <p class="adm-login__hint">
          示範帳號（開發期 mock，見 app/admin/api/mock-seed.ts）：<br>
          sa／Admin@123（超級管理員，需 2FA，碼 123456）<br>
          editor1／Editor@123（內容編輯）・doctor1／Doctor@123（醫師）<br>
          marketing1／Marketing@123（行銷）・reviewer1／Reviewer@123（審核者，需 2FA，碼 123456）
        </p>
      </div>
    </div>
  </div>
</template>
