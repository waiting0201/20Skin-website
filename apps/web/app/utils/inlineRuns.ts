/**
 * 內文的行內格式（`runs`）：粗體、斜體、連結、文字顏色（Tim 定案 2026-11-18，翻掉決策 17 的純文字）。
 *
 * 形狀：`{ text, href?, bold?, italic?, color? }[]`，由後台編輯器產生
 * （`apps/admin/src/body-blocks-doc.ts`），舊站匯入的 560 篇文章也帶著（只有連結與粗體）。
 * `text` 仍然是整段純文字 —— runs 只是同一段字切成帶格式的片段。
 *
 * 🔴 **這裡是擋 `javascript:` 的最後一道**：資料庫的 JSON 沒有結構驗證，後台那一道擋不住
 *    直接打 API 或舊資料。連結與顏色都是白名單，不合格的就當純文字，不輸出屬性。
 *    ⚠️ 白名單與後台的 `normalizeHref`／`normalizeColor` 同一條規則，改一邊要改另一邊。
 * 🔴 **不用 v-html**：渲染一律走 `h()`（`components/InlineText.ts`），所以不需要 HTML 淨化。
 */

export interface InlineRun {
  text: string
  href?: string
  bold?: boolean
  italic?: boolean
  color?: string
}

/** 渲染用：已經過白名單的一段。 */
export interface SafeRun {
  text: string
  href?: string
  external?: boolean
  bold: boolean
  italic: boolean
  color?: string
}

const OWN_HOSTS = new Set(['20skin.tw', 'www.20skin.tw'])

/**
 * 已經失效的網域：連結拿掉、文字照留（2026-11-18 實測）。
 * `goo.gl` 2025 年停止服務；`20skinmicroshaping.blogspot.com` 整站 404。
 * ⚠️ 舊站匯入的其他外連（Facebook hashtag、另外兩個 blogspot）實測還活著，不在這裡。
 */
const DEAD_HOSTS = new Set(['goo.gl', '20skinmicroshaping.blogspot.com'])

/**
 * 連結的白名單＋舊站網址的整理：
 * - 舊主站（`www.20skin.tw/xxx.php`）改成站內路徑，交給 301 對照表轉到新網址
 *   （換網域前那批網址還是活的，寫死舊網域等於永遠繞去舊站）。
 * - WordPress 後台的連結（舊 blog 匯入時夾帶的 `wp-admin`）不是給讀者的，拿掉；網址欄填成標題文字的 `/Mail【…】` 也拿掉。
 * - 已經失效的網域（`DEAD_HOSTS`）拿掉。
 */
export function safeHref(v: unknown): { href: string, external: boolean } | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s || /\s/.test(s)) return null
  if (/wp-admin\//.test(s)) return null
  // 舊 blog 一篇文章（pico-laser-remove-the-spot-once）的連結網址填成了一段標題文字（`Mail【皮秒雷射】…`），
  // 匯入時被當成相對路徑解成 `/Mail【…】`，打開是 404。連結拿掉、段落文字照留。
  if (/^\/Mail(%E3%80%90|【)/i.test(s)) return null
  if (/^\/(?!\/)/.test(s) || s.startsWith('#')) return { href: s, external: false }
  if (/^(mailto|tel):./i.test(s)) return { href: s, external: false }
  if (!/^https?:\/\/[^/]/i.test(s)) return null
  try {
    const u = new URL(s)
    const host = u.hostname.toLowerCase()
    if (DEAD_HOSTS.has(host)) return null
    if (OWN_HOSTS.has(host)) {
      // 舊文章貼的是 FB 分享出去的網址（`?no=341&utm_source=FB…&fbclid=…`）。
      // 301 對照表以完整的 path＋query 比對，多帶追蹤參數就對不上 —— 去掉再交給它。
      for (const k of [...u.searchParams.keys()]) if (/^utm_|^fbclid$/i.test(k)) u.searchParams.delete(k)
      return { href: (u.pathname || '/') + u.search + u.hash, external: false }
    }
    return { href: u.href, external: true }
  } catch {
    return null
  }
}

export function safeColor(v: unknown): string | undefined {
  return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : undefined
}

/** 與舊站匯入（`tools/legacy-import/blocks.mjs` 的 `collapse`）同一條：空白壓成一格、去頭尾。 */
const collapse = (s: string) => s.replace(/[ \s]+/g, ' ').trim()

/**
 * runs 能不能用：文字要對得上 `text`（舊站的 runs 前後可能多空白，壓過再比）。
 * 對不上（資料被別的路徑改過）就退回純文字 —— 寧可少了格式，也不要顯示跟 `text` 不同的字。
 * 沒有任何格式也回 null（直接輸出文字就好）。
 */
export function usableRuns(text: string, runs: unknown): SafeRun[] | null {
  if (!Array.isArray(runs) || !runs.length) return null
  const out: SafeRun[] = []
  let formatted = false
  for (const r of runs as InlineRun[]) {
    if (!r || typeof r.text !== 'string') return null
    const link = safeHref(r.href)
    const run: SafeRun = {
      text: r.text,
      bold: r.bold === true,
      italic: r.italic === true,
      ...(link ? { href: link.href, external: link.external } : {}),
      ...(safeColor(r.color) ? { color: safeColor(r.color) } : {}),
    }
    if (run.href || run.bold || run.italic || run.color) formatted = true
    out.push(run)
  }
  if (!formatted) return null
  if (collapse(out.map((r) => r.text).join('')) !== collapse(text)) return null
  return out
}
