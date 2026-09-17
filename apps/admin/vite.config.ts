import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'

/**
 * 後台是掛在公開站 `/admin/` 底下的 SPA —— 與公開站共用同一個 Azure Static Web Apps
 * （docs/07-deployment.md §1），所以 `base` 必須是 `/admin/`，產物也直接寫進
 * web 的 `public/admin`，不經複製步驟。
 *
 * ⚠️ 建置有順序相依：**先 admin 後 web**，`nuxt generate` 才會把 public/admin 一起打包。
 *
 *     pnpm --filter admin build && pnpm --filter web build
 *
 * 後台不受「照抄 mockup」規則管（docs/09-frontend.md §8），但沿用 base.css 的
 * 設計 token，視覺才不會像兩個站。
 */
/**
 * dev 專用：把 `/assets/*` 轉到 `/admin/assets/*`。
 *
 * 🔴 **少了它，本機後台的 `base.css` 與 logo 一律 404。**
 *    `index.html` 與 `AdminLayout.vue` 寫的是**根路徑** `/assets/base.css` ——
 *    那在正式站是對的（後台與公開站同源，公開站根目錄真的有那份 assets）。
 *    但 dev 的 `publicDir` 是掛在 Vite 的 `base`（`/admin/`）底下的，
 *    於是同一個路徑在本機打不到。
 *
 * ⚠️ 症狀很容易被忽略：`admin.css` 自己撐得住版面，所以畫面「看起來還好」，
 *    只是設計 token 全部落回預設值、logo 破圖。2026-09-17 用 Playwright 實際
 *    跑後台時才從 console 的 404 抓到。
 * ⚠️ 只在 dev 生效，不影響建置產物。
 */
function serveRootAssetsInDev() {
  return {
    name: 'admin-serve-root-assets-in-dev',
    apply: 'serve' as const,
    configureServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: unknown, next: () => void) => void) => void } }) {
      server.middlewares.use((req, _res, next) => {
        if (req.url?.startsWith('/assets/')) req.url = `/admin${req.url}`
        next()
      })
    },
  }
}

export default defineConfig(({ command }) => ({
  base: '/admin/',
  plugins: [vue(), serveRootAssetsInDev()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  // public/assets 是指向 mockup/assets 的 symlink，只服務 dev（讓 base.css 與圖片載得到）。
  // 建置時關掉 publicDir —— 正式站的後台直接吃公開站那份 /assets/。
  publicDir: command === 'build' ? false : 'public',

  build: {
    outDir: '../web/public/admin',
    emptyOutDir: true,
    // 打包產物放 static/，把 assets/ 留給公開站的素材
    assetsDir: 'static',
    sourcemap: false,
  },
}))
