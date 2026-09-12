// 機器人驗證 —— reCAPTCHA v3（2026-09-12 定案，docs/10-api.md §5）。
//
// ⚠️ **檔名與匯出刻意不帶供應商名稱**，與後端的 `IBotCheckService` 同一個理由：
//    換成 Turnstile 時只有這一個檔案要改。
//
// 🔴 **後台只有登入這一支需要它。** 其餘端點都帶 Bearer token，已經是認證過的請求。
//    所以 script 只在登入畫面載入，不進 `http.ts` 的共用路徑。
//
// 🔴 **登入的主防線是次數限制，不是這個**（帳號 ＋ 來源 IP 雙維度，docs/02 §4）。
//    reCAPTCHA 補的是「分散式撞庫」—— 那種攻擊每個 IP 只試幾次，次數限制抓不到。
//
// ⚠️ **緊急逃生口**：若 reCAPTCHA 讓所有人都登不進後台（Google 有狀況、金鑰設錯、
//    script 被擋），把 Function App 的 `BotCheck__SecretKey` 清空即可立刻放行，
//    **不需要重新部署**。次數限制那一道不受影響。這條寫進 STATUS.md §七 的 runbook。

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void
      execute: (siteKey: string, options: { action: string }) => Promise<string>
    }
  }
}

/**
 * site key 是**公開值**，本來就會出現在 HTML 裡 —— 要保密的是 secret key，
 * 那個只在 Function App 的 app settings。留空＝這個環境不啟用驗證。
 */
const SITE_KEY = (import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined) ?? ''

export const botCheckEnabled = Boolean(SITE_KEY)

let scriptPromise: Promise<boolean> | null = null

function loadScript(): Promise<boolean> {
  scriptPromise ??= new Promise<boolean>((resolve) => {
    const script = document.createElement('script')
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(SITE_KEY)}`
    script.async = true
    script.defer = true
    script.onload = () => resolve(true)
    // 廣告／隱私擋擴充套件、公司防火牆、Google 連不上 —— 三種情況在這裡長得一樣。
    script.onerror = () => resolve(false)
    document.head.appendChild(script)
  })
  return scriptPromise
}

/**
 * 取一次性的驗證權杖。
 *
 * ⚠️ **在按下登入的那一刻才取。** v3 的 token 只有 2 分鐘效期 —— 開著登入頁去泡咖啡
 * 再回來輸入密碼，載入時取的 token 早就過期了，而錯誤訊息會是「自動化驗證未通過」，
 * 指不到真正的原因。
 *
 * @param action 必須與後端 `EnsureHumanAsync` 傳的字串一字不差（登入是 `login`）。
 * @returns 權杖；沒有啟用時回 `null`（正常），取不到時也回 `null`（呼叫端要當錯誤處理）。
 */
/**
 * 隱藏 Google 的浮動徽章。
 *
 * 🔴 <b>Google 的條款允許隱藏，但必須在表單附近顯示指定的聲明文字</b>
 *    （含隱私權政策與服務條款兩個連結）。那段文字在 `/contact/` 的表單裡與後台登入頁。
 *    ⚠️ 拿掉聲明就不可以隱藏徽章 —— 兩者是一組的。
 *
 * 隱藏的理由是版面：徽章固定在右下角，與浮動諮詢鈕（浮動元素）會疊在一起。
 *
 * ⚠️ **用 JS 不用 CSS**，因為這條規則沒有地方可以放：`mockup/` 不進版控
 *    （STATUS.md §八 技術債），而 `verify:css` 禁止 app/ 底下有自己的樣式表或
 *    `<style>` 區塊。寫進 base.css 的話，別人 clone 下來根本沒有那一行。
 * ⚠️ 用 visibility 不用 display:none —— Google 的 script 會量測徽章元素，
 *    display:none 在部分版本會讓它反覆嘗試重繪。
 */
function hideBadge() {
  for (const el of document.querySelectorAll<HTMLElement>('.grecaptcha-badge')) {
    el.style.visibility = 'hidden'
  }
}

export async function getBotCheckToken(action: string): Promise<string | null> {
  if (!botCheckEnabled) return null

  const ok = await loadScript()
  if (!ok || !window.grecaptcha) return null

  try {
    const grecaptcha = window.grecaptcha
    await new Promise<void>((resolve) => grecaptcha.ready(resolve))
    hideBadge()
    return await grecaptcha.execute(SITE_KEY, { action })
  } catch {
    return null
  }
}
