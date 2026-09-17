// 讓 `node --experimental-strip-types` 吃得下後台那些**沒有副檔名**的相對 import
// （`./unit-schema`、`./units`）—— TypeScript 的慣例，Node 的 ESM 解析器不認。
//
// ⚠️ 只補副檔名，不做任何轉譯：型別剝除仍然是 Node 自己做的。
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    const base = new URL(specifier, context.parentURL)
    if (!/\.[a-z]+$/i.test(base.pathname)) {
      for (const candidate of [`${base.href}.ts`, `${base.href}/index.ts`]) {
        if (existsSync(fileURLToPath(candidate))) return next(candidate, context)
      }
    }
  }
  return next(specifier, context)
}
