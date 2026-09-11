import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
// 沿用 base.css 的設計 token（--brand／--ink／--line／--sp-*／--fs-*⋯，見
// index.html 的 <link>）；這份是後台專屬的密度／元件樣式（.adm-*）。
import './admin.css'

createApp(App).use(router).mount('#app')
