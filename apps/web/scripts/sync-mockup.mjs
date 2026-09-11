// mockup/assets → apps/web/public/assets（逐 byte 複製）
//
// 樣式的唯一真實來源是 mockup/（客戶 2026-08-27 選定的方向 A）。
// 要改樣式請**改 mockup 再跑這支**，不要改 public/assets —— 它會被覆蓋，
// 而且 verify:css 會當場抓到不一致。
//
// 為什麼是複製而不是 symlink 或交給 Vite 打包：
//   · symlink：nuxt generate 對 public/ 底下的 symlink 目錄行為不保證，踩到才知道
//   · Vite 打包：會改寫 url() 與輸出檔名，「逐 byte 相同」就無從驗證
//   · 複製：11 MB、毫秒級，而且 public/assets 的相對路徑與 mockup 完全一致，
//     base.css 裡的 url("fonts/...") 不必改一個字
//
// public/assets 不進版控（.gitignore），正式站的圖片來自 Blob（docs/07 §3）。

import { cp, mkdir, rm, readdir, readFile, writeFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const SRC = join(ROOT, '..', '..', 'mockup', 'assets')
const DEST = join(ROOT, 'public', 'assets')
const MANIFEST = join(ROOT, 'scripts', 'mockup-assets.sha256')

if (!existsSync(SRC)) {
  console.error(`✗ 找不到 mockup 素材：${SRC}`)
  process.exit(1)
}

await rm(DEST, { recursive: true, force: true })
await mkdir(dirname(DEST), { recursive: true })
await cp(SRC, DEST, { recursive: true })

// 產生指紋清單，供 verify:css 比對。只記樣式與腳本 ——
// 圖片會換成院方正式素材，不該把它們釘死。
const hashes = []
for await (const file of walk(DEST)) {
  const rel = relative(DEST, file)
  if (!/\.(css|js)$|^fonts\//.test(rel)) continue
  hashes.push(`${sha256(await readFile(file))}  ${rel}`)
}
hashes.sort()
await writeFile(MANIFEST, hashes.join('\n') + '\n')

console.log(`✓ 已同步 mockup/assets → public/assets（${hashes.length} 個樣式／腳本／字型檔已指紋化）`)

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (entry.isFile()) yield full
  }
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex')
}
