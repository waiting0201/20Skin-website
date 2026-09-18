import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
// 沿用 base.css 的設計 token（--brand／--ink／--line／--sp-*／--fs-*⋯，見
// index.html 的 <link>）；這份是後台專屬的密度／元件樣式（.adm-*）。
import './admin.css'
import { installErrorNet } from './app-errors'
import { restoreSession } from './auth'

const app = createApp(App)
// ⚠️ 在 mount 之前掛：掛在之後的話，第一次算繪就出錯的元件不會被接到。
installErrorNet(app)

// 🔴 **先還原登入，再掛載。** refresh token 放在 sessionStorage（src/api/http.ts），
//    重新整理時要先拿它換回一組憑證與身分，路由守衛才看得到「已登入」。
//    順序反了的症狀是：每次重整都先閃一下登入頁。
//    ⚠️ restoreSession() 不會 reject（失敗就是回 false），所以這裡不需要 catch ——
//    但仍然用 finally，讓「API 掛掉」也一定掛得起來（然後正常導向登入頁）。
restoreSession().finally(() => {
  app.use(router).mount('#app')
})
