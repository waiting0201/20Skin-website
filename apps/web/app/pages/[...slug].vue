<script setup lang="ts">
// 所有「沒有對應路由」的網址都掉到這裡 —— 舊站的 1000 條 301 就在這一步落地。
//
// 🔴 **2026-09-15 取代 `api/fallback`。** 前台改成執行期 SSR 之後，那支 SWA
//    Managed Function 與 Nuxt 的 SSR function 互斥（兩者都要佔 `api_location`），
//    所以轉址查詢搬到 API 的 `GET /redirects/resolve`，由這一頁呼叫。
//
// ⚠️ **順序不可調換：先讓 Nuxt 比對實體路由，比不到才查轉址，都沒有才 404。**
//    反過來（每個請求都先查轉址）會讓全站每一次瀏覽都多一次 API 往返，
//    而命中率是千分之幾 —— 那是拿 99.9% 的請求去補貼 0.1%。
//    這一頁是 Nuxt 路由表的最後一名（catch-all 優先權最低），順序天然成立。
//
// ⚠️ **正規化留在 API 端。** 大小寫、query string 排序那段與後台寫入時用的是
//    同一份程式碼（`RedirectHandler.NormalizePath`）；在這裡自己先正規化一次
//    等於再造一份，而分岔的症狀是「後台看得到規則，但線上不轉址」（docs/08 §H）。
//    所以這裡把**原始路徑**原樣送過去。
const route = useRoute()

// query string 要一起帶 —— 舊站的文章網址是 `/share_info.php?no=842`，
// 沒有 query 就只剩 `/share_info.php`，780 條文章轉址全部打不中。
const raw = route.fullPath

const hit = await resolveRedirect(raw)

if (hit?.toPath) {
  // ⚠️ `external: true` 是必要的：目標是站內路徑沒錯，但這一頁的任務是送出
  //    HTTP 轉址讓瀏覽器與爬蟲重新請求，不是在前端路由裡換頁 —— 少了它，
  //    Google 看到的是 200 而不是 301，舊網址的權重不會轉移過去。
  await navigateTo(hit.toPath, { redirectCode: hit.statusCode || 301, external: true })
}
else {
  // 查不到就是真的沒有這一頁。丟 404 讓 `app/error.vue` 算繪模板 20。
  // ⚠️ `fatal: true` 才會走到 error.vue；少了它 Nuxt 只會在這一頁內部標記錯誤。
  throw createError({ statusCode: 404, statusMessage: '找不到頁面', fatal: true })
}
</script>

<template>
  <!-- 走到這裡代表轉址已經送出，畫面不會被看到。 -->
  <div />
</template>
