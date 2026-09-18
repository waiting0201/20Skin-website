<script setup lang="ts">
// 浮動諮詢鈕 ＋ AI 問答面板（docs/04-ai-faq.md §4、CLAUDE.md 決策 28）。
//
// 🔴 **行為寫在這裡，不是 public/assets/app.js。**
//    那支是 mockup 的原檔，`verify:css` 斷言 1 要求它與 mockup/assets/app.js **逐 byte 相同**。
//    做法是：這裡不再輸出 `data-consult-toggle`，於是 app.js §6 開頭那句
//    `if (chatToggle && chatPanel)` 就找不到東西，整段自然 no-op —— app.js 一個字都不用改。
//
// 🔴 **靜態 class 只能用 mockup 標記裡出現過的那些**（verify:css 斷言 4，元件走
//    `allMockupClasses` 那條分支）。`c-chat__msg--user` 與 `c-chat__msg--pending`
//    只存在 base.css、不在任何一頁的 HTML 裡，所以**一律用 `:class` 綁定**
//    （那支腳本自己的註解寫明動態綁定不在掃描範圍，由 code review 把關）。
//
// ⚠️ **不存對話**：訊息只在元件的記憶體裡，不寫 localStorage／sessionStorage。
//    醫療提問屬敏感，而且 docs/08 §I 明列不建 AI 對話紀錄表。重新整理就清空是預期行為。
import { EXTERNAL } from '~/data/navigation'

const props = withDefaults(
  defineProps<{ panelTitle?: string; welcomeText?: string; bookingUrl?: string; lineUrl?: string }>(),
  { panelTitle: 'AI 線上諮詢', welcomeText: '', bookingUrl: '', lineUrl: '' },
)

interface Source { title: string; url: string; kind: string }
type Role = 'user' | 'bot' | 'pending'
interface Message { role: Role; text: string; sources?: Source[]; handoff?: boolean }

/** 問題長度上限。與 API 的 `MaxQuestionLength` 一致 —— 前端先擋，省一次來回。 */
const MAX_QUESTION = 300

/** 送回伺服器的歷史則數上限。⚠️ 與 API 的 `MaxHistoryTurns` 一致。 */
const MAX_HISTORY = 4

const { public: { apiBaseUrl } } = useRuntimeConfig()

const bookingHref = computed(() => props.bookingUrl || EXTERNAL.booking)

// ⚠️ LINE 沒有寫死的預設值（`EXTERNAL` 只有預約與商城）——
//    後台沒填就不顯示那個出口，而不是連到一個猜出來的網址。
const lineHref = computed(() => props.lineUrl)

const open = ref(false)
const sending = ref(false)
const input = ref('')
const messages = ref<Message[]>([])
const logEl = ref<HTMLElement | null>(null)
const inputEl = ref<HTMLInputElement | null>(null)
const toggleEl = ref<HTMLButtonElement | null>(null)

/** 起手式提示。⚠️ 這三題必須是索引真的答得出來的 —— 點了就未命中是最糟的第一印象。 */
const STARTERS = ['做雷射會痛嗎？', '療程後多久可以化妝？', '初診需要準備什麼？']

/** 送出後就不再出現：它是起手式，不是題庫目錄（想瀏覽題目的人去 /faq/）。 */
const showStarters = computed(() => messages.value.length === 0)

const welcome = computed(() =>
  props.welcomeText
  || '你好，我是 20SKIN 的線上諮詢助理。可以用自己的話問我療程、術後照護或看診流程的問題。')

function openPanel() {
  open.value = true
  nextTick(() => inputEl.value?.focus())
}

function closePanel() {
  open.value = false
  // 焦點交還觸發鈕 —— 用鍵盤的人關掉面板之後不能被丟回頁面開頭。
  nextTick(() => toggleEl.value?.focus())
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) closePanel()
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))

/**
 * 捲到底 —— 但**使用者已經自己往上捲時不要搶**。
 * 正在讀前面的回答卻被拉到最下面，比不自動捲更惱人。
 */
function scrollToBottom(force = false) {
  const el = logEl.value
  if (!el) return
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  if (!force && !nearBottom) return
  nextTick(() => { el.scrollTop = el.scrollHeight })
}

/**
 * 🔴 **中文輸入法：組字中按 Enter 不可以送出。**
 * 用注音打到一半按 Enter 是在選字，不是要送出 —— 少了這個判斷，
 * 繁中使用者幾乎每一句都會被切成半句送出去。
 */
function onEnter(event: KeyboardEvent) {
  if (event.isComposing) return
  event.preventDefault()
  void send(input.value)
}

async function send(raw: string) {
  const question = raw.trim()
  if (!question || sending.value) return

  if (question.length > MAX_QUESTION) {
    messages.value.push({ role: 'pending', text: `問題太長了，請縮短到 ${MAX_QUESTION} 字以內。` })
    scrollToBottom(true)
    return
  }

  sending.value = true
  input.value = ''
  messages.value.push({ role: 'user', text: question })

  const placeholder: Message = { role: 'pending', text: '正在查站內資料⋯' }
  messages.value.push(placeholder)
  scrollToBottom(true)

  // 冷啟動時第一問要 6–10 秒（Function App scale-to-zero ＋ 模型一次來回）。
  // ⚠️ 沉默十秒會被讀成「壞掉了」，所以四秒後換一句誠實的說明。
  const slowTimer = window.setTimeout(() => {
    if (placeholder.role === 'pending') placeholder.text = '還在查，第一次提問會久一些⋯'
  }, 4000)

  try {
    // 🔴 取不到 token 要**停下來並說明**，比照 /contact/，不是比照搜尋頁的靜默回寫 ——
    //    後端對「沒有 token」是擋下，硬送只會換來一句看不懂的「自動化驗證未通過」。
    const botCheckToken = await useBotCheck().getToken('ai_ask')
    if (botCheckToken === null && useRuntimeConfig().public.recaptchaSiteKey) {
      replace(placeholder, {
        role: 'pending',
        text: '目前無法完成驗證，請改用 LINE 諮詢或直接預約門診。',
        handoff: true,
      })
      return
    }

    const history = messages.value
      .filter(m => m.role === 'user' || m.role === 'bot')
      .slice(-(MAX_HISTORY + 1), -1)
      .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', text: m.text }))

    const res = await $fetch<{
      success: boolean
      code: string | null
      data: { answer: string; answered: boolean; sources: Source[]; handoff: { needed: boolean } } | null
    }>(`${apiBaseUrl}/ai/ask`, {
      method: 'POST',
      body: { question, history, botCheckToken },
      ignoreResponseError: true,
    })

    if (res?.success && res.data) {
      replace(placeholder, {
        role: 'bot',
        text: res.data.answer,
        sources: res.data.sources ?? [],
        handoff: res.data.handoff?.needed ?? false,
      })
      return
    }

    // ⚠️ 一律依 `code` 分支，**不比對 message 字串**（docs/10 §2）。
    replace(placeholder, { role: 'pending', ...errorOf(res?.code ?? null) })
  }
  catch {
    // 連線失敗與服務異常對使用者是同一件事。
    replace(placeholder, { role: 'pending', ...errorOf('AI_UNAVAILABLE') })
  }
  finally {
    window.clearTimeout(slowTimer)
    sending.value = false
    scrollToBottom(true)
    nextTick(() => inputEl.value?.focus())
  }
}

function errorOf(code: string | null): { text: string; handoff: boolean } {
  switch (code) {
    case 'RATE_LIMITED':
      return { text: '您提問得有點快，約 10 分鐘後可以再試。', handoff: true }
    case 'BOT_CHECK_FAILED':
      return { text: '請重新整理頁面後再試一次。', handoff: false }
    case 'VALIDATION_RANGE':
      return { text: `問題太長了，請縮短到 ${MAX_QUESTION} 字以內。`, handoff: false }
    default:
      return { text: '線上諮詢暫時無法回覆，請改用 LINE 諮詢或直接預約門診。', handoff: true }
  }
}

function replace(target: Message, next: Message) {
  const i = messages.value.indexOf(target)
  if (i >= 0) messages.value[i] = next
  scrollToBottom()
}

function classOf(role: Role) {
  // 靜態寫 `c-chat__msg--user` 會被 verify:css 擋下（見檔頭）。
  return ['c-chat__msg', role === 'user' ? 'c-chat__msg--user' : 'c-chat__msg--bot',
    role === 'pending' ? 'c-chat__msg--pending' : '']
}
</script>

<template>
  <button
    ref="toggleEl"
    class="c-consult"
    type="button"
    :aria-expanded="open"
    aria-controls="consultPanel"
    @click="open ? closePanel() : openPanel()"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3c5.52 0 10 3.58 10 8s-4.48 8-10 8c-.86 0-1.7-.09-2.5-.26L4.2 21.3a.5.5 0 0 1-.68-.6l1.1-3.3C3 15.94 2 14.06 2 11c0-4.42 4.48-8 10-8Z"/></svg>
    <span class="c-consult__label">線上諮詢</span>
  </button>

  <aside id="consultPanel" class="c-chat" role="dialog" aria-labelledby="consultTitle" :hidden="!open">
    <div class="c-chat__head">
      <div>
        <p id="consultTitle" class="c-chat__title">{{ panelTitle }}</p>
        <p class="c-chat__meta">依站內內容即時回覆</p>
      </div>
      <button class="c-chat__close" type="button" aria-label="關閉線上諮詢" @click="closePanel">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6 18 18M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      </button>
    </div>

    <div ref="logEl" class="c-chat__log" role="log" aria-live="polite">
      <p :class="['c-chat__msg', 'c-chat__msg--bot']">{{ welcome }}</p>

      <div v-if="showStarters" class="c-chat__chips">
        <button
          v-for="starter in STARTERS"
          :key="starter"
          class="c-chat__chip"
          type="button"
          :disabled="sending"
          @click="send(starter)"
        >{{ starter }}</button>
      </div>

      <template v-for="(message, i) in messages" :key="i">
        <p :class="classOf(message.role)">{{ message.text }}</p>

        <!-- 來源：站內連結，**不套 .ext**（那是外連樣式，會讀成離站）。 -->
        <p v-if="message.sources?.length" :class="['c-chat__msg', 'c-chat__msg--bot']">
          參考來源：
          <template v-for="(source, j) in message.sources" :key="source.url">
            <span v-if="j > 0">、</span><a :href="source.url">{{ source.title }}</a>
          </template>
        </p>

        <p v-if="message.handoff" :class="['c-chat__msg', 'c-chat__msg--bot']">
          <template v-if="lineHref">
            <a class="ext" :href="lineHref" target="_blank" rel="noopener external">LINE 諮詢</a>／
          </template>
          <a class="ext" :href="bookingHref" target="_blank" rel="noopener external">預約門診</a>
        </p>
      </template>
    </div>

    <form class="c-chat__form" @submit.prevent="send(input)">
      <label class="visually-hidden" for="consultInput">輸入你的問題</label>
      <input
        id="consultInput"
        ref="inputEl"
        v-model="input"
        class="c-chat__input"
        name="q"
        type="text"
        autocomplete="off"
        :maxlength="MAX_QUESTION"
        :disabled="sending"
        :aria-busy="sending"
        :placeholder="sending ? '查詢中⋯' : '輸入你的問題⋯'"
        @keydown.enter="onEnter"
      >
      <button class="c-chat__send" type="submit" aria-label="送出問題" :disabled="sending || !input.trim()">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 20.5 21.5 12 3 3.5 3 10l11 2-11 2z"/></svg>
      </button>
    </form>

    <p class="c-chat__foot">
      AI 回覆僅供衛教參考，無法取代醫師診斷。需要個人化建議請<a class="ext" :href="bookingHref" target="_blank" rel="noopener external">預約門診</a>。
      <!-- 🔴 隱藏 reCAPTCHA 徽章的條件是在附近顯示這段聲明與兩個連結（見 useBotCheck 的 hideBadge）。 -->
      本面板受 reCAPTCHA 保護，適用 Google 的
      <a href="https://policies.google.com/privacy" target="_blank" rel="noopener external">隱私權政策</a>與
      <a href="https://policies.google.com/terms" target="_blank" rel="noopener external">服務條款</a>。
    </p>
  </aside>
</template>
