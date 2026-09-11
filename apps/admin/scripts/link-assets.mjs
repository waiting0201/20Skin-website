// dev 用：把 mockup/assets 連進 public/，讓後台在 localhost:3300 也載得到
// base.css 的設計 token 與圖片。正式站不需要這一步 —— 後台與公開站同源，
// 直接吃公開站的 /assets/（vite.config.ts 在 build 時關掉 publicDir）。
import { mkdir, rm, symlink } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const target = join(ROOT, '..', '..', 'mockup', 'assets')
const link = join(ROOT, 'public', 'assets')

await mkdir(dirname(link), { recursive: true })
await rm(link, { recursive: true, force: true })
await symlink(relative(dirname(link), target), link, 'dir')
console.log('✓ public/assets → mockup/assets（dev 用 symlink）')
