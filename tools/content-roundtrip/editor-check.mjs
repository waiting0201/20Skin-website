// 內文編輯器的 round-trip：正式資料的 `bodyBlocks` → 編輯器文件 → ProseMirror schema 驗證 → 區塊。
//
// 🔴 改了 `apps/admin/src/body-blocks-doc.ts` 或 `body-editor-extensions.ts` 一定要跑。
//    換算寫錯的症狀是「使用者只改了一個字、按儲存，整篇的某一類區塊消失或變形」——
//    而那篇文章在畫面上看起來完全正常（編輯器顯示的是換算後的樣子）。
//
// ⚠️ 中間刻意經過 `schema.nodeFromJSON(…).toJSON()`：那是編輯器實際載入時會做的事，
//    schema 不收的形狀（空的文字節點、儲存格裡放清單）會在 `schema.nodeFromJSON` ＋ `check()` 丟例外，
//    只比對兩支純函式抓不到這一類。
//
// 通過條件：每一篇都與原值深度相等。
//
// 用法（從 repo 根目錄）：
//   node --experimental-strip-types --import ./tools/content-roundtrip/register.mjs \
//        tools/content-roundtrip/editor-check.mjs [apps/web/content]

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const adminSrc = resolve(here, '../../apps/admin/src')
// ⚠️ TipTap 裝在 apps/admin 底下（pnpm 不提升），從那裡解析。
const requireAdmin = createRequire(join(adminSrc, '../package.json'))
const { getSchema } = await import(requireAdmin.resolve('@tiptap/core'))

const { blocksToDoc, docToBlocks } = await import(join(adminSrc, 'body-blocks-doc.ts'))
const { createBodyExtensions } = await import(join(adminSrc, 'body-editor-extensions.ts'))

const schema = getSchema(createBodyExtensions())

const contentDir = resolve(process.argv[2] ?? 'apps/web/content')

function deepEqual(a, b) {
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]))
  const ka = Object.keys(a).sort()
  const kb = Object.keys(b).sort()
  if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false
  return ka.every((k) => deepEqual(a[k], b[k]))
}

let checked = 0
let failed = 0

function check(label, blocks) {
  if (!Array.isArray(blocks) || !blocks.length) return
  checked += 1
  let after
  try {
    const doc = schema.nodeFromJSON(blocksToDoc(blocks))
    doc.check()
    after = docToBlocks(doc.toJSON())
  } catch (e) {
    failed += 1
    console.log(`  ✗ ${label}：編輯器載入失敗 —— ${e.message}`)
    return
  }
  if (deepEqual(blocks, after)) return
  failed += 1
  const i = blocks.findIndex((b, n) => !deepEqual(b, after[n]))
  console.log(`  ✗ ${label}：第 ${i + 1} 個區塊往返後不同（原 ${blocks.length} 個、後 ${after.length} 個）`)
  console.log(`      原值：${JSON.stringify(blocks[i]).slice(0, 200)}`)
  console.log(`      往返：${JSON.stringify(after[i] ?? null).slice(0, 200)}`)
}

const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v)

const bodiesDir = join(contentDir, 'article-bodies')
if (existsSync(bodiesDir)) {
  const files = readdirSync(bodiesDir).filter((f) => f.endsWith('.json'))
  console.log(`── 文章內文（${files.length} 篇）`)
  for (const f of files) check(`article [${f.replace(/\.json$/, '')}]`, parse(readFileSync(join(bodiesDir, f), 'utf8')))
}
for (const [unit, file] of [['concern', 'concerns.json'], ['case', 'cases.json']]) {
  const path = join(contentDir, file)
  if (!existsSync(path)) continue
  const rows = JSON.parse(readFileSync(path, 'utf8'))
  console.log(`── ${unit}（${rows.length} 筆）`)
  for (const r of rows) if (r.fields?.bodyBlocks) check(`${unit} [${r.slug}]`, parse(r.fields.bodyBlocks))
}

console.log(`\n${checked} 份內文，${failed} 份失敗`)
process.exit(failed ? 1 : 0)
