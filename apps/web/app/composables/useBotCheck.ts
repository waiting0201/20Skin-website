// 機器人驗證 —— reCAPTCHA v3（2026-09-12 定案，docs/10-api.md §5）。
//
// ⚠️ **檔名與匯出刻意不帶供應商名稱**，與後端的 `IBotCheckService` 同一個理由：
//    換成 Turnstile 時只有這一個檔案要改。
//
// 🔴 **只在需要時才載入 Google 的 script。** 前台有約 950 頁，其中只有兩處需要驗證
//    （`/contact/` 送出、`/search/` 查無結果回寫）。全站載入等於在每一頁都塞一支
//    第三方追蹤 script，既慢又沒有必要。
//
// 🔴 **token 在「送出的那一刻」才取，不是頁面載入時。** v3 的 token 只有 2 分鐘效期 ——
//    載入時就取的話，使用者慢慢填完表單再送出，token 早就過期了，而錯誤訊息會是
//    「自動化驗證未通過」，完全指不到真正的原因。
//
// ⚠️ **拿不到 token 時回傳 null，由呼叫端決定怎麼辦，這裡不吞掉。**
//    後端對「沒有 token」是**擋下**（不是放行）—— 否則不送 token 就能繞過，
//    整套驗證等於不存在。所以呼叫端必須把這個情況當成錯誤，並告訴使用者替代做法。

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void
      execute: (siteKey: string, options: { action: string }) => Promise<string>
    }
  }
}

let scriptPromise: Promise<boolean> | null = null

/** 載入 Google 的 script，只載一次。回傳是否成功。 */
function loadScript(siteKey: string): Promise<boolean> {
  scriptPromise ??= new Promise<boolean>((resolve) => {
    const script = document.createElement('script')
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`
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
 * 隱藏 Google 的浮動徽章。
 *
 * 🔴 <b>Google 的條款允許隱藏，但必須在表單附近顯示指定的聲明文字</b>
 *    （含隱私權政策與服務條款兩個連結）。那段文字在 `/contact/` 的表單裡與後台登入頁。
 *    ⚠️ 拿掉聲明就不可以隱藏徽章 —— 兩者是一組的。
 *
 * 隱藏的理由是版面：徽章固定在右下角，與浮動諮詢鈕（`.c-consult`）會疊在一起。
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

export function useBotCheck() {
  const { public: { recaptchaSiteKey } } = useRuntimeConfig()

  /** 沒設定 site key＝這個環境沒有啟用驗證（本機開發）。後端那邊也會對應地放行。 */
  const enabled = Boolean(recaptchaSiteKey)

  /**
   * 取一次性的驗證權杖。
   *
   * @param action 動作名稱。⚠️ **必須與後端 `EnsureHumanAsync` 傳的字串一字不差** ——
   *   後端會比對它，對不上就擋下。目前有 `contact`、`questions-miss`、`login` 三種。
   * @returns 權杖；沒有啟用驗證時回 `null`（正常），取不到時也回 `null`（呼叫端要當錯誤處理）。
   */
  async function getToken(action: string): Promise<string | null> {
    if (!enabled) return null

    const ok = await loadScript(recaptchaSiteKey as string)
    if (!ok || !window.grecaptcha) return null

    try {
      const grecaptcha = window.grecaptcha
      await new Promise<void>((resolve) => grecaptcha.ready(resolve))
      hideBadge()
      return await grecaptcha.execute(recaptchaSiteKey as string, { action })
    } catch {
      return null
    }
  }

  return { enabled, getToken }
}
