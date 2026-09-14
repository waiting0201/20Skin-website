#!/usr/bin/env node
// 把 apps/web/app/data/*.ts 的內容抽成一份 JSON，交給 import.mjs 寫進資料庫。
//
// 為什麼需要這一步：那些資料是 TypeScript 模組（含型別、別名 import、跨檔引用），
// 不是可以直接讀的資料檔。這支腳本用 Node 24 原生的型別剝離執行它們，
// 把每個模組的具名匯出原封不動倒出來。
//
// ⚠️ 這支腳本**不做任何轉換或判斷** —— 它只負責「把 TS 變成 JSON」。
//    哪些欄位算內容、哪些算版面，是 import.mjs 的事（docs/08 §0 決策四之後的
//    分類原則：內容進資料庫、版面留前台）。兩件事分開，出錯時才知道要看哪一支。
//
// 用法：node tools/content-import/dump.mjs [輸出路徑]
//       預設輸出到 stdout。

import { mkdtempSync, readdirSync, readFileSync, writeFileSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const DATA_DIR = join(ROOT, 'apps/web/app/data')
const CONTENT_DIR = join(ROOT, 'apps/web/content')

// Node 的型別剝離要求相對 import 帶副檔名，而 Nuxt 的別名 ~/data/* 在這裡也不存在。
// 複製一份到暫存目錄改寫，不動原始檔。
const work = mkdtempSync(join(tmpdir(), 'skin20-data-'))
cpSync(DATA_DIR, work, { recursive: true })

const files = readdirSync(work).filter((f) => f.endsWith('.ts')).sort()

for (const f of files) {
  const p = join(work, f)
  const src = readFileSync(p, 'utf8')
    // ⚠️ 字元集要含底線 —— 有 _content.ts 與 _presentation.ts 這類檔名，
    //    漏掉會以「Cannot find module '…/_content'」失敗（2026-09-14 踩到）。
    .replace(/from '~\/data\/([a-z_-]+)'/g, "from './$1.ts'")
    .replace(/from '\.\/([a-z_-]+)'/g, "from './$1.ts'")
    // 2026-09-11 內容搬進資料庫之後，_content.ts 改成 import '~~/content/*.json'。
    // ⚠️ 兩件事在裸 Node 都不成立：`~~` 是 Nuxt 的 rootDir 別名，而 JSON import
    //    在 Node ESM 需要 import attribute。兩個都要改寫，否則這支會以
    //    「Cannot find package '~~'」失敗（2026-09-14 踩到）。
    // ⚠️ content/*.json 不進版控 —— 跑這支之前要先 `pnpm --filter web export:content`。
    .replace(
      /from '~~\/content\/([a-z-]+)\.json'/g,
      (_, name) => `from '${pathToFileURL(join(CONTENT_DIR, `${name}.json`)).href}' with { type: 'json' }`,
    )
  writeFileSync(p, src)
}

const out = {}
for (const f of files) {
  const mod = await import(pathToFileURL(join(work, f)).href)
  const name = f.replace(/\.ts$/, '')
  // 只取具名匯出的「值」——型別在剝離階段就消失了，函式不是資料。
  const exports = {}
  for (const [k, v] of Object.entries(mod)) {
    if (typeof v === 'function') continue
    exports[k] = v
  }
  out[name] = exports
}

const json = JSON.stringify(out, null, 2)
const target = process.argv[2]
if (target) {
  writeFileSync(target, json + '\n')
  const units = Object.keys(out).length
  const keys = Object.values(out).reduce((n, m) => n + Object.keys(m).length, 0)
  console.error(`已抽出 ${units} 個模組、${keys} 組具名匯出 → ${target}`)
} else {
  process.stdout.write(json)
}
