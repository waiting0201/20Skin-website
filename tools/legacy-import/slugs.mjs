// 舊站 slug → 合法 slug。
//
// 🔴 **API 只收 `^[a-z0-9]+(-[a-z0-9]+)*$`**（ContentHandler.cs:69）——
//    391 篇 blog 有 71 篇過不了：底線 68 篇、全形底線 1、U+2010 連字號 1、純中文 2。
//
// ⚠️ **這與 CLAUDE.md 決策 2「保留原 slug」有衝突，解法不是放寬 API。**
//    改的是 slug、補的是站內 301：`/blog/atopic_dermatitis_2022/` → `/blog/atopic-dermatitis-2022/`
//    寫進 `Redirects`，所以院方那邊只要做單純的網域轉址，讀者仍然會走到正確的頁面
//    （多一跳而已）。放寬 API 的代價是整站往後都可能出現底線網址，
//    而底線在 Google 的斷詞裡不算分隔符 —— 那是永久性的，換不回來。

/** 舊站 slug → 合法 slug。無法產出合法值時回傳 null，由呼叫端決定退路。 */
export function normalizeSlug(raw) {
  const s = decodeURIComponent(raw)
    .normalize('NFKC')          // 全形底線 ＿ → _、U+2010 ‐ → -
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // 非英數一律當分隔（中文會整段消失，由呼叫端接手）
    .replace(/^-+|-+$/g, '')
  return s && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) ? s.slice(0, 160).replace(/-+$/, '') : null
}
