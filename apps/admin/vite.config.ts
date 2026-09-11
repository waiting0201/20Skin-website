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
export default defineConfig(({ command }) => ({
  base: '/admin/',
  plugins: [vue()],
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
