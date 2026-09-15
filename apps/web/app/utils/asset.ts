// `/assets/**` 的網址加上內容版號。
//
// 對照表由 `scripts/build-asset-version.mjs` 在建置前產生（見那支的檔頭：
// 為什麼 SSR 化之後不能再靠 postbuild 改寫 HTML）。
// Vite 會把這份 JSON 內聯進 client 與 server 兩邊的 bundle，執行期不讀檔。

import VERSION from '~/assets-version.json'

const TABLE = VERSION as Record<string, string>

/**
 * `/assets/base.css` → `/assets/base.css?v=a1b2c3d4`
 *
 * ⚠️ 查不到就原樣回傳，不要丟例外 —— 少一個版號的後果是那個檔案的快取比較久，
 *    讓整頁算繪失敗的後果大得多。
 * ⚠️ 已經有查詢字串的原樣回傳，避免疊成 `?v=ab12?v=ab12`
 *    （postbuild 時代踩過一次，而且疊了也載得到、看不出有錯）。
 */
export function stampAsset(path: string): string {
  if (path.includes('?')) return path
  const v = TABLE[path]
  return v ? `${path}?v=${v}` : path
}
