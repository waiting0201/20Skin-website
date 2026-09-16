# 07 — 部署架構與 CI/CD

> **Azure Static Web Apps（Standard）＋ 獨立 Azure Functions（Flex Consumption．NET 10）＋ Blob Storage ＋ Azure SQL**，GitHub Actions 部署。
> 部署交付範圍：**SWA ＋ Functions ＋ Blob ＋ 資料庫 schema（EF Core migrations）**。資料庫執行個體由院方自建。
> Azure 平台限制查證日期：2026-08-10，來源見末段。

架構本身很單純：一個靜態網站、一組 API、一個資料庫。但這個站有 **950 個 URL、約 800 篇文章、約 770 條 301**，這三個數字會撞到 SWA 的幾道牆。本文件就講這些牆和怎麼繞過，其餘照一般官網做即可。

> **API 拆成兩塊，這是全篇最容易搞錯的地方。**
> 前後台共用的應用程式 API 放在**獨立的 Azure Functions App**（2026-08-10 定案），由瀏覽器跨網域直接呼叫。
> ⚠️ **這段的舊結論已作廢**：原本說「`/api/fallback` 必須留在 SWA 的 Managed Functions 裡」。
> 2026-09-16 起 SWA 的那個位置跑的是 **Nuxt 的 SSR function**，1000 條 301 改由前台的
> catch-all 路由查 API。見 §2。

---

## 1. 架構

🔴 **2026-09-16 起前台是執行期 SSR**（CLAUDE.md 決策 6），架構圖已重畫。
舊圖的「預渲染 1845 頁」與「`/api/fallback`」都不存在了。

```
  瀏覽器／爬蟲
     │
     ▼  20skin.tw / www.20skin.tw
  ┌────────────────────────────────────────────────┐
  │  Azure Static Web Apps（Standard）              │
  │  · 靜態資產：/assets、/admin（後台 SPA）、圖片   │
  │  · 其餘一切 → navigationFallback → SSR function │
  │                                                │
  │  Managed Function ＝ Nuxt 的 SSR server         │
  │    （node:22，.output/server）                   │
  │  · 每個請求即時算繪                             │
  │  · 1000 條 301：catch-all 路由查 API（§2）       │
  │  · SEO 產物：robots／sitemap／llms（§4）         │
  │  🔴 它**不碰 SQL**，只打下面那個 API            │
  └────────────────────┬───────────────────────────┘
                       │ HTTPS（每個頁面請求都會發生）
                       ▼
  ┌────────────────────────────────────────────────┐
  │  api.20skin.tw                                 │
  │  獨立 Azure Functions（Flex Consumption）        │
  │  · 前台內容讀取（公開端點）                     │
  │  · 後台 CMS／認證／AI FAQ／上傳 SAS             │
  │  · Timer：VersionPrune／ThrottleSweep           │
  └────┬────────────────────────┬──────────────────┘
       │ Managed Identity       │ Managed Identity
       ▼                        ▼
  ┌──────────────┐      ┌──────────────────────┐
  │ Blob Storage │      │ Azure SQL（院方自建）  │
  └──────────────┘      └──────────────────────┘

  20skinblog.com ──▶ 只抓內容與圖片，轉址不在範圍（§2）
```

⚠️ **最重要的改變：API 從「後台的後端」變成「全站的後端」。**
它掛掉不再只是後台不能用 —— 前台每一頁都要它。前台以 **5xx** 表達這種狀況，
不會退化成 404 或空頁面（理由見 [09](09-frontend.md) §3）。

⚠️ **SSR function 與舊的 `/api/fallback` 互斥**：SWA 只有一個 `api_location`。
這正是原本「不用 SSR」的理由，而現在 `api/` 已整支刪除。

沒有 CDN／WAF 中間層。SWA 本身有全球節點與 100 GB／月流量，這個規模夠用。

**API 網域用 `api.20skin.tw`（CNAME 指向 Function App）。** 這個自訂網域掛在 Function App 上，與 SWA 的自訂網域額度無關。因為與前台不同源，**CORS 由院方自行設定**（2026-08-10 確認）。

⚠️ **跨來源的連帶影響：SWA 內建驗證的 `x-ms-client-principal` 到不了外部 Function App。** 認證與五種角色本來就規劃在 Function 內自行驗證（[02](02-backend-cms.md) §4），維持該作法即可，但 token 要用 **Bearer** 帶，不要指望跨來源 cookie。

**前端框架：Nuxt 3，純靜態模式（`nuxt generate`）**，2026-08-10 定案。輸出目錄是 **`.output/public`**（不是 `dist`）。公開頁 `prerender: true`，建置期產生實體 HTML。

⚠️ **前後台是兩個套件，不是同一份程式碼**（2026-09-11 改，pnpm workspace）：前台 `apps/web/`（Nuxt 純靜態）、後台 `apps/admin/`（Vite ＋ Vue 3 的 SPA）。後台的 build 產物直接寫進 `apps/web/public/admin/`，隨 `nuxt generate` 一起打包 —— **部署形態不變**（同一個 SWA、同一個網域、後台掛在 `/admin/`），變的只是建置期的組織方式。
**建置有順序相依：先 admin 後 web**（`pnpm --filter admin build && pnpm --filter web build`）。
> 舊敘述「同一份程式碼用 Nuxt 的 route rules 切成兩種渲染模式、`/admin/**` 設 `ssr: false`」已作廢。改的理由是與 NTI 專案的目錄結構一致，兩案共用同一套心智模型。

🔴 **2026-09-16 起改用 Nuxt 的 SSR 模式**（CLAUDE.md 決策 6）。
舊敘述「不使用 SSR，因為 `api_location` 要留給 `/api/fallback`」已作廢 —— 那支 function 已刪除。
`api_location` 現在指向 `.output/server`（Nuxt 的 SSR server，`node:22`）。

> **Next.js 仍不採用，但理由換了。** 原本的理由是「Next.js hybrid 不支援 navigation fallback，而 301 全靠它」——
> 現在 301 改由應用程式自己處理，那個理由不再成立。**現在的理由是成本**：換框架要把 21 個模板從 Vue
> 重寫成 React，而 Nuxt 本來就有 SSR 模式。姊妹專案 VicRound 用 Next.js 是因為它是全新專案。

**一個原則：公開頁面全部是建置期產生的實體 HTML 檔，執行期不打 API、不打資料庫。** [03-seo-geo.md](03-seo-geo.md) 的 GEO 策略前提是 AI 爬蟲取得到內容，而 AI 爬蟲基本上不執行 JavaScript —— SPA-only 的內容對它們等於不存在。後台 `/admin/*` 則相反，純 SPA、不預渲染、不需被索引。

**資源已於 2026-09-11 建立**，資源群組 `rg-20skin-web-prod`（westus2）：

| 資源 | 名稱 |
|---|---|
| Static Web Apps（Standard） | `swa-20skin-web-prod` |
| Azure Functions（Flex Consumption．dotnet-isolated 10.0） | `func-20skin-web-api-prod` |
| Blob Storage | `st20skinweb`（容器 `media` 公開／`media-private`／`system-state`／`deploy-package`） |
| Application Insights ＋ Log Analytics | `appi-20skin-web-prod`／`log-20skin-web-prod` |

加上院方的 Azure SQL，總共五樣。

🔴 **不要把資源建進 `rg-20skin-prod`。** 那是**線上預約系統**的正式環境，正在服務 `booking.20skin.tw`（`swa-20skin-customer-prod` ＋ `func-20skin-api-prod` 的 `ApiRouter`／`SmsReminder`）。而預約系統正是 CLAUDE.md 決策 4 明文排除在本專案之外的東西 —— 部署進去會弄壞診所正在營運的預約。

> **為什麼不用 SWA 的「Bring your own API」串接？** 這裡的作法是**不串接** —— Function App 就是一個獨立服務，前端拿完整網址呼叫它，SWA 完全不需要知道它的存在。
>
> ⚠️ 原本的理由是「BYOF 僅限 Standard 方案」，那個理由在 2026-09-11 改用 Standard 之後已經不成立。**但作法維持不變**：不串接的架構更單純（前後端各自獨立部署），而 BYOF 之下 `navigationFallback` 是否仍然可用尚未驗證 —— 770 條 301 全靠它。

---

## 2. 🔴 1000 條 301 由前台的 catch-all 路由查 API

`staticwebapp.config.json` 放不下這批規則，三個原因都是 SWA 的硬限制：

| 原因 | 說明 |
|---|---|
| 設定檔上限 **20 KB** | 一條規則約 90–110 bytes，只放得下約 180–200 條 |
| `route` **不比對 query string** | `share.php?class=醫美新知` 與 `?class=皮膚新知` 在 SWA 眼中是同一個路徑 |
| **無法依網域分流** | `20skinblog.com` 是另一個網域 |

### 現在的做法（2026-09-16 起）

```
瀏覽器請求 /share_info.php?no=842
  → SWA 找不到實體檔案 → navigationFallback → Nuxt 的 SSR function
  → Nuxt 路由表比對不到 → 掉到 catch-all（pages/[...slug].vue）
  → 打 API 的 GET /redirects/resolve?path=…
  → 命中：navigateTo(…, { redirectCode: 301, external: true })
  → 未命中：throw 404 → error.vue 算繪模板 20
```

🔴 **順序不可調換：先比對實體路由，比不到才查轉址，都沒有才 404。**
反過來（每個請求都先查轉址）會讓全站每一次瀏覽都多一次 API 往返，
而命中率是千分之幾 —— 那是拿 99.9% 的請求去補貼 0.1%。
catch-all 在 Nuxt 路由表是最後一名，這個順序天然成立。

⚠️ **帶的是完整路徑含 query string**（`route.fullPath`）。舊站的文章網址是
`/share_info.php?no=842`，少了 query 就只剩 `/share_info.php` —— **780 條文章轉址
全部打不中**。

⚠️ **`navigateTo` 要 `external: true`**。目標雖是站內路徑，但這裡的任務是送出 HTTP
轉址讓爬蟲重新請求；少了它 Google 看到的是 200 而不是 301，舊網址的權重不會轉移。

⚠️ **路徑正規化留在 API 端**（`RedirectHandler.NormalizePath`）。那一份同時是後台新增與
CSV 匯入用的 —— 讀寫共用同一段是這條規則能成立的前提。搬進前端等於再造一份，
而分岔的症狀是「後台看得到規則，但線上不轉址」，只有上線後才會發現（[08](08-database.md) §H）。

### 舊做法：`/api/fallback`（2026-09-16 刪除）

在 SSR 之前，這件事由 SWA 的 Managed Function `api/Skin20.Fallback` 做：
`navigationFallback` 把找不到檔案的請求轉給它，它讀 `x-ms-original-url` 查 SQL。

它被刪掉的原因**不是它不好，是它與 Nuxt 的 SSR function 互斥** —— SWA 只有一個
`api_location`，兩者都要佔。

刪掉之後的兩個連帶變化：

- ✅ **路徑正規化從兩份變一份**。原本 `api/Fallback.cs` 與 `RedirectHandler.NormalizePath`
  各有一份，檔頭寫著「必須逐字一致」。
- ✅ **SWA 上不再需要 SQL 唯讀連線字串** —— 那是全架構最後一個明文密鑰（§6）。
  Nuxt 的 SSR function 完全不碰 SQL，它只打 API。

### 仍然保留的：設定檔裡的 7 條快速路徑

最高流量的七條（首頁、`doctor.php`、`contact.php`、四個 `product*.php`）仍寫在
`staticwebapp.config.json`，不進 function。

⚠️ **它們與資料庫的 `Redirects` 表刻意重複。** 不是疏漏 —— 那七條走設定檔不必冷啟動。
🔴 **但這讓 smoke test 有一個陷阱**：拿 `/index2.php` 驗 301 會**永遠通過**，
即使整條「SSR → API → SQL」的查表鏈路壞掉。CI 因此改用 `/doctor.php`
（沒有快速路徑）—— 見 §5。

### 「不做 fallback」已評估並否決（2026-08-10）

不做的話約 770 個舊網址全部變 404，其中**約 700 條是文章、佔 91%**。改版後 4–8 週排名波動是正常現象，但那個前提是 301 有做；沒做則舊網址權重直接消失，媒體報導與外部引用的反向連結全部指向 404 —— **永久損失，不是恢復期**。

四個不需要 function 的替代方案都補不滿：

| 方案 | 天花板 |
|---|---|
| 全部寫進 `staticwebapp.config.json` | 20 KB 約 200 條，**仍有約 535 篇文章沒有轉址**；且不比對 query string，40 條年份組合一條都做不了 |
| 萬用字元統一導到分類頁 | Google 判定為軟性 404，效果接近沒做。[01-sitemap.md](01-sitemap.md) 已明文「禁止萬用字元」 |
| 每個舊網址放 meta refresh 靜態檔 | 回 **200 而非 301**，權重傳遞較弱且 Google 不建議；同樣處理不了 query string |
| 留舊主機做轉址 | 行不通 —— DNS 切過去後舊主機收不到請求 |
| 加 Azure Front Door 前置層 | 可行但要付費，且推翻「無中間層」決策。為省一支 80 行 function 加一整層基礎設施，不划算 |

> 🔴 **有一個未知數會影響上表**：約 700 篇文章**內頁**的網址型態尚未記錄（本次抓取只確認列表頁為 `share.php?class={中文分類}`）。若內頁也是 query string，上表前三個方案全部出局。已列入[待補資料](research/site-audit-raw.md)，取得方式：從列表頁點進任一文章即可。

### blog 站：轉址不在範圍內

`20skinblog.com` 本專案只負責**抓回 101 篇的內文與圖片**，跨網域 301 不做。技術上 SWA 也做不到（另一個網域，且 Free 的自訂網域額度已被主站用滿）。

沒有 301 的 SEO 後果與三個處理選項見 [01-sitemap.md](01-sitemap.md) 決策三 —— 需院方自行決定。

### 兩個附帶事項

- `/contact.php#20` 這類錨點無法在伺服器端轉址（`#` 之後不會送到伺服器）。作法是 `/contact.php` → `/clinics/`，再由前端 JS 讀 `location.hash` 二次導向。
- `trailingSlash` 策略要和 301 目標網址一致，否則每次轉址都多跳一次。

### 後台 IP 白名單：不做（2026-08-13 定案）

**後台不設 IP 白名單。** 技術上做得到 —— 獨立 Function App 支援 **inbound access restrictions**（平台層 IP 限制），但院方決定不採用，不要重新提案。

> ⚠️ **兩個前提在決定之後變了，記錄於此供院方日後重新評估，不是重新提案**：
> ① **雙因素也不做了**（2026-09-11），三道防線只剩登入次數限制一道；
> ② SWA 已改用 **Standard**（2026-09-11，原因見 §3），平台層的 IP 範圍限制變成可用，
>    不必再為此拆 Function App。

連帶結果：**API 維持單一 Function App，前後台共用**。原本「拆 `api-admin`／`api-public` 兩個 App」的提案只為了套白名單（限制粒度是整個 App，共用會把前台的表單送出、站內搜尋一起擋掉），白名單不做，這個拆分就沒有理由，**此項已從待決策移除**。

> 🔴 **代價要寫清楚。** 後台路徑為 `/admin/`（客戶指定，2026-08-10 定案），與舊站相同、是攻擊者第一個會試的路徑，**不提供任何隱蔽性**。原規劃的三道防線（雙因素、IP 白名單、登入次數限制）**現在只剩一道**：IP 白名單不做（2026-08-13）、**雙因素不做（2026-09-11）**。登入端點直接暴露在公網掃描下，唯一擋在前面的是次數限制。
>
> - **登入次數限制**（唯一的硬防線）：**只以帳號計數**（來源 IP 維度 2026-09-14 院方決定拿掉 —— 連帶結果是「同一 IP 輪流試多個帳號」擋不到，那一種靠 reCAPTCHA v3，見 [10-api.md](10-api.md) §5.1），鎖定事件即時觸發告警通知信（**不留存紀錄** —— 不做操作日誌，見 [08-database.md](08-database.md) §I）
> - **帳密成為唯一憑證**，所以種子密碼 `Admin@123` 上線前必須更換，並建議訂定密碼強度與輪替規則（[02-backend-cms.md](02-backend-cms.md) §4）
> - 細節見 [02-backend-cms.md](02-backend-cms.md) §4
>
> 這個決定**日後可回頭**：要加白名單時，把後台端點拆成獨立 Function App 再掛 inbound access restrictions 即可，不需要改動架構其餘部分。

---

## 3. 單一環境儲存上限 500 MB

> ⚠️ **2026-09-11 由 Free 改為 Standard**，上限從 250 MB 變成 500 MB。改的原因不是評估後改變主意，而是**訂閱裡的 Free 方案配額已被既有專案用滿**（`az staticwebapp create --sku Free` 直接回 `This subscription has too many static sites with SKU: Free`）。
> 連帶解掉的還有：自訂網域 2 → 5 個、可用 IP 範圍限制、**有 SLA**。
> 本節原標題是「🔴 Free 方案單一環境 250 MB」，數字已全部更新。

950 頁預渲染 HTML ＋ JS/CSS/字型，估約 90 MB。餘裕比 Free 時期寬鬆得多，但**會隨文章數成長**，三件事仍必須做到：

1. **所有上傳檔案一律走 Blob Storage**，一個都不進 build 產物。CMS 上傳直接寫 Blob，資料庫只存 URL。詳見下方「上傳走 Blob」。
2. **繁中字型必須子集化**。未子集化的一套 5–15 MB，在 250 MB 的預算裡不可忽略。
3. **CI 內建大小檢查**（350 MB 警告、450 MB 擋下）。

> 因為不設 PR 預覽環境（§5），實際上只有正式環境一個，全環境合計的上限不會構成問題。

> ⚠️ **Nuxt 特有的體積因子：`_payload.json`。** Nuxt 預渲染時會為每條路由額外產出一份 payload 檔，950 條路由就是 950 個檔案。上面的 90 MB 估算是在框架未定案時做的，**未計入這一項**，實測前不要當定論。若壓不下來，可在 `nuxt.config` 關閉 `renderJsonPayloads`，代價是首次導航要多打一次資料。

### 上傳走 Blob

**上傳檔案不經過 API 的 request body**，一律由瀏覽器直傳 Blob：

```
在某個圖片欄位按「上傳圖片」
  → 打 api.20skin.tw/admin/upload/sas 取得短效寫入 SAS
    （限定容器與 blob 名稱、write only、數分鐘到期）
  → 瀏覽器直接 PUT 到 Blob
  → 打 /admin/upload/commit 回報；API 讀檔頭驗證後回傳一組圖片值，
    由前端放進欄位、隨內容一起存
```

🔴 **不做媒體庫**（2026-09-11 定案）——上傳沒有自己的畫面，也沒有清單與刪除端點；圖片是內容欄位的一部分。見 [08](08-database.md) §0 決策四、[11](11-backend-design.md) §9。

即使 API 已搬到獨立 Function App、逾時放寬到 230 秒（§4），這個設計仍然要保留：讓大檔流經 Function 是白付執行時間與記憶體，而且直傳本來就比較快。

四個配套：

| 項目 | 說明 |
|---|---|
| **Storage 帳戶 CORS** | 必須放行 `https://20skin.tw` 的 `PUT`，否則瀏覽器直傳會被擋。與 Function App 的 CORS 是**兩套各自獨立的設定**，別漏掉其中一邊。上線前驗證時來源是 SWA 的預設網址，那個也要一併放行（§5） |
| **容器讀取權限** | 公開圖片容器設 blob 層級公開讀取。⚠️ **只收圖片**，所以既有的 `media-private` 容器沒有任何內容欄位會用到（[02](02-backend-cms.md) §4） |
| **`Cache-Control`** | 架構中**沒有 CDN**，圖片是由 Blob 直接服務。上傳時就要寫入長效 `Cache-Control`。⚠️ 檔名是**隨機唯一值不是內容雜湊**（一個欄位獨佔一個 blob，[08](08-database.md) §0 決策四）——內容一樣永遠不變，`immutable` 照用 |
| **SAS 用 Managed Identity 簽**（改善） | 獨立 Function App 支援 Managed Identity，可對 Storage 取 **user delegation key** 來簽 SAS，**不需要儲存帳戶金鑰**。原本卡在 SWA Free 沒有 Managed Identity，現在這個限制消失了。見 §6 |

**待決策：衍生尺寸誰來產。** [03-seo-geo.md](03-seo-geo.md) 要求 WebP／AVIF 與響應式 `srcset`，但圖片不在 repo 裡，**建置期產不出來**。API 搬家後逾時已不是障礙，所以現在有兩個都可行的選項：**瀏覽器端上傳前轉檔**（省後端資源），或**Function App 以 sharp 於上傳後轉檔**（品質與一致性較好，之前受 45 秒限制而不可行）。此項需在開工前確認。

---

## 4. 兩種 Functions 的能力差異

架構裡有兩處 Functions，能力天差地遠。**把工作放錯地方是這個架構最容易犯的錯**：

| | SWA Managed Function<br>（現在跑 Nuxt 的 SSR server） | 獨立 Function App<br>（`api.20skin.tw`，Flex Consumption） |
|---|---|---|
| HTTP 逾時 | **45 秒**（SWA `/api` 路由限制） | **230 秒**（Azure Load Balancer 閒置上限，不分方案） |
| 非 HTTP 逾時 | 不適用 | 預設 **30 分**，最大不設限 |
| Timer trigger | ❌ | ✅ |
| Durable Functions | ❌ | ✅ |
| Managed Identity／Key Vault | ❌ | ✅ |
| 入站 IP 限制 | ❌ | ✅ |
| 部署方式 | 跟著前台一起重新部署 | **獨立部署** |

三個因此改變的規劃：

1. ~~**排程發布改用 Timer trigger。**~~ 🔴 **2026-09-16：連 Timer 都不需要了。**
   演進過程：GitHub Actions cron（有排隊延遲）→ 獨立 Function App 的 Timer（每 15 分鐘輪詢、
   有異動就觸發重建）→ **什麼都不用**。
   SSR 下 `Visibility.PublicFilter` 用的是**查詢當下的 `@Now`** —— 排程時間一到，
   下一個請求自然就看得到，沒有輪詢、沒有建置。
   ⚠️ 後台文案仍寫「最早生效時間」，但那是因為時區與使用者預期，不再是因為建置耗時。
2. **連 SQL 與 Blob 改用 Managed Identity**，不再需要明文密鑰。見 §6。
3. **內容重建不再連帶重新部署 API。** 原本兩者是同一個部署單位，現在完全分離 —— 後台前端仍應對 API 的 5xx 與逾時做重試，但重試的理由從「API 剛好在重新部署」變成一般的暫態錯誤。

**沒有改變的兩件事**，不要誤以為搬家就解決了：

- **800 篇文章匯入仍用本機腳本。** HTTP 觸發的 230 秒上限擋在那裡，這是平台層的負載平衡器閒置逾時，不是可調參數。硬要走 API 就得改成 Durable 的非同步模式，為一次性作業做這個不划算。
- **`sitemap.xml`／`llms.txt` 仍在建置期產生**，產物直接進 `.output/public`。走 API 產生反而更差。

### 建置期產物（2026-09-12 實作）

`tools/content-export` 除了 `content/*.json`，另外把這幾個檔寫進 `apps/web/public/`
（`nuxt generate` 原樣帶進 `.output/public`）：

| 產物 | 來源 |
|---|---|
| `robots.txt` | `SiteSettings.seo.robotsTxt`（後台可編輯）。⚠️ 原本是手寫靜態檔 —— 改成產生的，「後台改了卻沒作用」才不會發生 |
| `sitemap.xml` ＋ 5 個分檔 | 收錄範圍＝`ContentType ＋ IncludeInSitemap ＋ 可見性 ＋ UrlPath IS NOT NULL`；分檔的旋鈕在 `SiteSettings.seo.sitemapFiles` |
| `faq.json`／`llms.txt`／`llms-full.txt` | 已發布 FAQ 與站台索引 |

🔴 **語料檔的格式只有一份產生器**：`functions/Common/ExportFormats.cs`，
由 `ContentExport.csproj` 以 `<Compile Include>` 連結。後台的 `GET /admin/export/{kind}`
是**同一支函式**的截短預覽 —— 各寫一份的話，「預覽跟正式產物不一樣」不會有任何徵兆，
而那正是那個畫面唯一的用途。

⚠️ **產物必須是決定性的**：時間戳一律用「內容的最後更新時間」，不是 `UtcNow`。
這些檔案進版控（與 `content/*.json` 同一個理由：它們是資料庫的投影），
用 `UtcNow` 會讓每次匯出都產生一份沒有意義的 diff，真正的變動就淹沒在裡面。

⚠️ **`<lastmod>` 用內容的 `UpdatedAt`，不是建置時間。** 每次建置都把全站 lastmod
推到今天，等於告訴搜尋引擎「這 950 頁每天都在改」，幾輪之後它就不再相信這個欄位。

**方案選 Flex Consumption。** Microsoft 已將原 Consumption plan 標為 legacy 並建議新專案改用 Flex Consumption。
⚠️ 附帶一提 **Flex Consumption 沒有 deployment slots**（Consumption 有 2 個、Premium 有 3 個）。本專案不設 staging（§5），所以用不到；但這也代表**日後若想加藍綠部署，得先換方案**。

另外兩點：

- **角色授權必須在 Function 內部驗證。** `staticwebapp.config.json` 的 `allowedRoles` 是 SWA 內建驗證，跟 [02](02-backend-cms.md) §4 的五種角色是兩套系統。
- **兩處 Functions 都要開 Application Insights**，否則出問題時沒有任何可查的東西。

---

## 5. 部署：兩條 GitHub Actions workflow

```
pnpm-workspace.yaml                 ← packages = apps/*
apps/
  web/             Nuxt 3 純靜態前台（21 個模板、1845 頁預渲染）
    public/staticwebapp.config.json ← 原樣複製到 .output/public 根目錄
    public/admin/                   ← apps/admin 的建置產物，不進版控
    .output/public/                 ← 建置產物，上傳的就是這一包
  admin/           Vite ＋ Vue 3 的後台 SPA，base = /admin/
                   build.outDir 直接指向 ../web/public/admin，沒有複製步驟
api/               SWA Managed Function —— 只有 fallback 這一支（.NET 9，Dapper only）
functions/         獨立 Azure Functions App —— 應用程式 API（.NET 10，EF Core ＋ Dapper）
  Data/            DbContext、Entity、Migrations —— schema 的真實來源
.github/workflows/
  deploy-site.yml  前台 ＋ api/（SWA）
  deploy-api.yml   functions/（獨立 Function App）＋ 資料庫遷移
```

⚠️ **`deploy-site.yml` 的建置順序是「先 admin 後 web」**：
`pnpm --filter admin build && pnpm --filter web build`。
反過來的話 `nuxt generate` 會打包到上一次的後台產物，症狀是「後台改了卻沒上線」。

### 技術棧與資料存取分工

**API 為 .NET 10（isolated worker）＋ EF Core ＋ Dapper**，2026-08-10 定案。兩套 ORM 不是重複，是分工：

| | 用途 | 為什麼 |
|---|---|---|
| **EF Core** | 寫入與領域邏輯：三段式審核工作流、版本歷程、權限 | 這些有規則、有狀態轉換、要留軌跡。變更追蹤與交易邊界是 EF Core 的強項，也是 schema 的真實來源（migrations） |
| **Dapper** | 讀取密集的查詢：文章列表、後台清單、**建置期的 950 頁內容匯出**、301 對照表 | 投影多、不需追蹤。建置期要一次撈出全站內容，EF Core 的變更追蹤在這裡只是純負擔 |

⚠️ **`api/` 那支 fallback 刻意只用 Dapper、不載入 EF Core。** 它只有一個查詢，而每個未命中的請求都要吃一次冷啟動 —— 載入 EF Core 會直接拖慢遷移期的 301 回應。

⚠️ **兩個 .NET 專案的目標框架不同**：`functions/`（應用程式 API）是 **net10.0**；`api/` 那支 fallback 最高只能 **net9.0**。

> **這不是選擇，是平台限制，已查證。** SWA 的 managed functions 至今不支援 .NET 10，`apiRuntime` 上限為 `dotnet-isolated:9.0`，微軟未公布時程。
>
> ⚠️ **2026-09-11 起方案已是 Standard**（原因見 §3），所以「升級 Standard ＋ 改用 bring-your-own-functions」這條路現在**是開著的** —— 把 SWA 的 `/api/*` 串到我們自己的 Function App，`api/` 就不必停在 net9.0。
>
> **但不要急著改。** BYOF 之下 `navigationFallback` 能不能照常 rewrite 到 SSR function **尚未驗證**，
> 而全站每一個頁面請求都靠它。這是可評估項，不是待辦。
>
> ⚠️ **這段已無意義（2026-09-16）**：`api/` 整支刪除，SWA 的 managed function 位置現在跑 Nuxt（`node:22`），.NET 版本限制與這個專案無關了。

範本在 [templates/](templates/)。**認證需要兩組**：SWA 用 `AZURE_STATIC_WEB_APPS_API_TOKEN`，Function App 建議用 **OIDC 服務主體**（`azure/login@v2`），不要用發布設定檔。

- **`deploy-site.yml`**：從 SQL 產生 `staticwebapp.config.json`／`sitemap.xml`／`llms.txt` → **`pnpm --filter admin build`** → `nuxt generate`（預渲染 950 頁）→ 大小檢查 → 上傳 `.output/public` ＋ `api/` → smoke test。觸發：push 到 `main`、`repository_dispatch`（後台發布內容時由 API 觸發）。
- **`deploy-api.yml`**：build → test → **資料庫遷移** → publish → smoke test。只在 `functions/**` 有變更時跑，**與內容重建完全無關** —— 發 100 篇文章不會動到 API 一次。

### 資料庫遷移

**schema 由 EF Core migrations 管理，是本專案的產出，不是院方的。** 院方提供的是資料庫**執行個體**與網路／身分設定；資料表長什麼樣子由 `functions/Data/Migrations` 決定。這是與先前規劃最大的差異 —— 舊版文件寫「資料庫由院方自建，沒有 migration workflow」，該敘述已作廢。

執行方式與三個不可退讓的原則：

| 原則 | 說明 |
|---|---|
| **不在執行期跑遷移** | 絕不呼叫 `Database.Migrate()`。EF Core 官方明列理由：應用程式會因此需要 DDL 權限（與最小權限原則衝突）、無法事先檢閱 SQL、回滾困難。遷移一律在 CI 用 **migration bundle**（`efbundle`）執行 —— 單一執行檔，交易與錯誤處理行為一致，且 EF Core 9+ 會自動取得資料庫層級的遷移鎖 |
| **遷移必須向後相容** | 沒有 staging，workflow 順序是「先遷移、後部署」，中間有一段時間是**新 schema 配舊程式**在跑。改欄位要用擴張／收縮兩階段，不要一次改完 |
| **兩個身分，不是一個** | **遷移身分**（GitHub Actions 的服務主體）需要 DDL 權限；**執行期身分**（Function App 的 Managed Identity）只要 DML。兩者絕不共用，見 §6 |

配套：

- **CI 檢查 `dotnet ef migrations has-pending-model-changes`** —— 模型改了卻忘了 `migrations add` 是這個組合最常見的錯誤，EF Core 9+ 在執行期會直接丟例外，要在 CI 先擋下來。
- **產出冪等 SQL 當建置產物留存**（`dotnet ef migrations script --idempotent`）。不是拿來執行的，是為了「出事時有東西可以看、可以交給 DBA」。保留 90 天。
- **GitHub runner 的 IP 是浮動的**，且「允許 Azure 服務存取」涵蓋不到它（runner 不是 Azure 資源）。範本的作法是執行前開一條當次專用的防火牆規則、結束時無論成敗都收掉。
- **`concurrency` 不可設 `cancel-in-progress: true`** —— 遷移進行中被中斷會留下不確定狀態。這與前台 workflow 的設定刻意相反。

> ⚠️ **兩條 workflow 的路徑過濾要互斥且完整。** 漏掉會出現「改了 API 卻沒部署」這種難查的狀況，範本的 `paths:` 已寫好，新增目錄時兩邊都要補。

### 三件要跟後台設計對齊的事

1. **SWA 沒有 ISR，發布到上線有延遲。** 編輯按下發布後要重跑一次全站 build，量級預期數分鐘到十餘分鐘（需實測）。後台要顯示「發布中／已上線」狀態。
2. **發布觸發要做聚合。** 連續發布 10 篇不該觸發 10 次 build。範本用 `concurrency: cancel-in-progress`，另建議在後台端加 3–5 分鐘的聚合窗口。
3. **後台前端仍要對 API 的 5xx 與逾時做重試** —— 但理由變了。API 不再跟著內容重建一起重新部署，剩下的是冷啟動與一般暫態錯誤。

### 環境：只有正式環境

**不設 staging，也不設 PR 預覽環境**（2026-08-10 定案）。前台與 API 都是 `main` 合併即上線，沒有預演。

這件事要講清楚，因為它決定了整份驗收計畫怎麼寫：

**上線前**其實不缺驗證環境。SWA 與 Function App 建立時各自就有預設網址（`*.azurestaticapps.net`、`*.azurewebsites.net`），**在切 DNS 之前，正式環境本身就是驗證環境** —— 全站掃描、301 驗證、CWV、後台流程都在那裡做完再切。§8 的待驗證項目全部照做，只是做的地方從「PR 預覽」變成「尚未對外的正式站」。

**上線後**才是真正的缺口。任何程式碼變更都是直接改動線上網站，沒有中間站。三件必須做到的事：

| 措施 | 說明 |
|---|---|
| **`main` 分支保護** | 唯一的人為攔截點。禁止直推、要求 review、要求 CI 通過 |
| **CI 檢查不可跳過** | 產物大小、`staticwebapp.config.json` 20 KB、API 單元測試。沒有預覽環境先撞牆，這些就是最後一道 |
| **部署後 smoke test** | 兩條 workflow 都已內建：首頁／療程頁／`/admin/` 回 200、`/index2.php` 回 301、API `/health` 回 200。失敗要有人看到 |

**風險要說在前面**：這個選擇省下的是維運複雜度，換來的是「改壞了就是線上壞了」。內容發布不經過程式碼變更，日常風險其實不高；真正的曝險集中在**改版上線後的功能迭代期**。若之後覺得這個風險過高，補一個 PR 預覽環境不需要改架構，把兩條 workflow 的 `pull_request` 觸發加回來即可。

> 連帶影響：**500 MB 全環境合計上限不再是問題**（沒有預覽環境佔用），`close_pr` job 也不需要了。CORS 白名單也只需要正式來源，不必放行預覽網域。

> ⚠️ **全站 build 時間隨文章數線性成長。** 800 篇是起點不是終點。第一次完整 build 跑出來就要判斷是否需要改成增量建置，不要拖到上線後。

---

## 6. 需要院方提供的東西

**院方提供資料庫執行個體與身分／網路設定；資料表結構由本專案的 EF Core migrations 管理**（§5）。

| 項目 | 說明 |
|---|---|
| **為 Function App 的 Managed Identity 建 SQL 使用者**（執行期身分） | 應用程式 API 走 **Microsoft Entra 驗證**，不用帳號密碼：`CREATE USER [<function-app-name>] FROM EXTERNAL PROVIDER`，授予 `db_datareader` ＋ `db_datawriter` ＋ 必要的 stored procedure 執行權。**不要給 DDL 權限** —— 執行期不做遷移 |
| **為 GitHub Actions 服務主體建 SQL 使用者**（遷移身分） | 這個才需要 DDL 權限（建議 `db_ddladmin` ＋ `db_datareader`／`db_datawriter`，仍不建議 `db_owner`）。**與上一列是兩個不同的身分，不可共用** |
| ~~**一組 SQL 唯讀連線字串**（給 SWA）~~ | ✅ **2026-09-16 起不需要了。** 它原本是給 `/api/fallback` 查 301 用的，而那支 function 已刪除。Nuxt 的 SSR function **完全不碰 SQL**，它只打 API —— 於是全架構再也沒有明文的 SQL 連線字串（§2、§6 末段） |
| **SQL 防火牆放行** | ①「允許 Azure 服務存取」—— Flex Consumption 的出口 IP 不固定；若院方要求收斂，可改用 **VNet 整合 ＋ 服務端點**（Flex Consumption 支援，Managed Functions 不支援）。② GitHub Actions runner —— build 期間要讀 DB 做預渲染、部署時要跑遷移。runner IP 浮動，**需授權 CI 以 `az sql server firewall-rule` 動態開關**（範本已含，結束即刪） |
| **一套非正式資料庫**（建議） | 沒有 staging 也沒有 PR 預覽環境（§5），上線前的後台流程驗證是直接對尚未切 DNS 的正式環境做。若那時已載入正式內容，寫入測試會落進正式資料 —— 有一套可丟棄的資料庫會乾淨很多。上線後若要做破壞性測試，也只能靠它 |

> 連線池提醒：Function App 每個執行個體各持一份連線池。連線物件放模組層級，不要每次呼叫 new 一個。

> **明文密鑰從兩個減為一個，再減為零。** 原本 SQL 連線字串與 Blob 帳戶金鑰都得明文放在 SWA 設定裡；
> API 搬到獨立 Function App 之後兩者都改用 **Managed Identity**（Blob 走 user delegation SAS，見 §3），
> 只剩 `/api/fallback` 用的那組唯讀連線字串；**2026-09-16 那支 function 刪除，最後一個也消失了**。

---

## 7. 上線切換

1. **前置（院方）**：資料庫執行個體就緒、**兩組 SQL 使用者**（執行期 Managed Identity 與遷移用服務主體，§6）已建立、防火牆放行完成。
2. **跑一次遷移建立 schema，再以本機腳本匯入約 800 篇內容**。沒有可讀的資料庫，連預渲染都跑不起來。
3. **在尚未切 DNS 的正式環境**（SWA 與 Function App 的預設網址）完成全站驗收：404 掃描、301 迴圈檢查、結構化資料驗證、CWV、**跨來源請求實測**，加上 **build 時間與產物大小實測**。這是唯一一次能在「不影響外部訪客」的前提下完整驗證的機會 —— 切 DNS 之後就沒有了。
4. SWA 綁定 `20skin.tw` 與 `www.20skin.tw`，完成網域驗證與憑證簽發。
5. **Function App 綁定 `api.20skin.tw`**（CNAME ＋ 受控憑證），並把正式站來源加進 CORS 與 Storage CORS 白名單。⚠️ **這一步要在切 DNS 之前完成** —— 否則前台上線的瞬間所有 API 呼叫會被 CORS 擋掉。
6. 降 TTL → 切 DNS。
7. 提交新 `sitemap.xml`，確認 `robots.txt` 的 Sitemap 指令與 AI 爬蟲放行生效。
8. 舊 PHP 主機保留至少 12 個月（[01-sitemap.md](01-sitemap.md) §4）。
9. 連續 8 週監控 Search Console 索引狀態與 404 報告。

> **301 在切 DNS 之前就驗得到。** 轉址邏輯是應用程式的一部分 —— 直接對 SWA 的預設網址
> （`*.azurestaticapps.net`）打 `/doctor.php` 就會走完整條路徑。
> ⚠️ **不要用 `/index2.php` 驗** —— 它在設定檔裡有快速路徑，就算整條查表鏈路壞掉也會回 301（§2）。

> **Mod_Security 的 406 問題隨舊主機一起消失**，且 SWA 不會依 User-Agent 阻擋。但步驟 7 的 AI 爬蟲驗證仍要做一次，確認 `robots.txt` 的放行區塊正確 —— 不要重演 [00-site-audit.md](00-site-audit.md) §2 的狀況。

---

## 8. 待驗證

沒有 staging 也沒有預覽環境，以下全部要在**切 DNS 之前**、對尚未對外的正式環境完成（§5）。

| 項目 | 為何重要 |
|---|---|
| **301 行為** | ✅ 2026-09-16 本機端到端驗過（`/share_info.php?no=842` → `/blog/share-842/`、大小寫正規化、未命中 404）。仍待在 Azure 上驗一次 |
| **跨來源鏈路**（新增） | 前台在 `20skin.tw`、API 在 `api.20skin.tw`。要驗 preflight、認證 token 的攜帶方式、錯誤回應是否也帶得到 CORS 標頭（**漏掉這點會讓 4xx/5xx 在瀏覽器變成看不出原因的 network error**）。CORS 由院方設定，但驗收要一起做 |
| **Managed Identity 連 SQL 與 Blob**（新增） | 沒有密鑰是好事，但也代表本機開發與 CI 的驗證路徑不同，要先確認開發流程走得通 |
| **build 產物大小 vs 500 MB** | 超過就必須改變資產策略。Nuxt 的 `_payload.json`（每路由一份，950 份）未計入原估算，要單獨量 |
| **全站 `nuxt generate` 時間**（950 頁） | 決定內容更新的可接受延遲，也決定要不要改增量建置 |
| **`/admin/**` 的 `ssr: false` 產出** | 要確認 Nuxt 實際產生的 SPA shell 檔案路徑，與 `staticwebapp.config.json` 的 `rewrite: /admin/index.html` 對得上 |
| **Blob 直傳鏈路** | Storage CORS、SAS 有效期、上傳後的 `Cache-Control` 是否正確寫入。沒有 CDN，圖片由 Blob 直接服務，快取設錯會直接反映在 CWV |
| 冷啟動對 301 的實際延遲 | 遷移期爬蟲會密集打舊網址，太慢要考慮加大 config 內的規則數或加快取 |
| 冷啟動對後台操作的體感 | Flex Consumption 可設 always-ready 執行個體降低冷啟動，但要付費。先量再決定 |
| **SWA managed function 能否用 Managed Identity 連 SQL** | 若可以，就能消滅全架構最後一組明文密鑰（§6）。改 Standard 之後值得查一次 |
| **`api/` 實際可用的 .NET 版本** | .NET 10 確定不支援（§1），但 9.0 也還沒確認：Azure 兩份文件互相矛盾 —— [apis-functions](https://learn.microsoft.com/en-us/azure/static-web-apps/apis-functions) 只列到 **.NET 8.0**，[configuration](https://learn.microsoft.com/en-us/azure/static-web-apps/configuration) 的 `apiRuntime` 表列到 **`dotnet-isolated:9.0`**。範本先寫 9.0，**第一週要實測，不通就退 8.0**。只影響 fallback 那一支，`functions/` 的 .NET 10 不受此限 |
| **遷移在正式資料庫的實際行為**（新增） | 沒有 staging，第一次跑 `efbundle` 就是對正式庫跑。至少要先在一套可丟棄的資料庫演練一次完整遷移與回滾，見 §6 |

**待決策**：圖片衍生尺寸由誰產（§3 末段）、301 對照表是否改為建置期烤成 `redirects.json`（§2）、Azure 訂閱歸屬與區域。

> 已定案、不再是待決事項（均 2026-08-10）：前端 **Nuxt 3 純靜態**、API 放**獨立 Azure Functions App**、API 語言 **.NET 10 isolated ＋ EF Core（寫入）＋ Dapper（讀取）**、**schema 由 EF Core migrations 管理**。
> **Azure 訂閱與區域已定（2026-09-11）**：CSP 訂閱、`westus2`、資源群組 `rg-20skin-web-prod`。
> **排程發布不再是待決項** —— 獨立 Function App 有 Timer trigger，直接做即可（§4）。
> **後台 IP 白名單不做**（2026-08-13），連帶確定 **API 維持單一 Function App、不拆 `api-admin`／`api-public`**（§2）。

---

## 對既有規劃文件的影響

| 文件 | 影響 |
|---|---|
| [01-sitemap.md](01-sitemap.md) §4 | 301 對照表內容不變，落地位置從主機 `.htaccess` 變成「SQL ＋ 前台 catch-all 查 API」 |
| [02-backend-cms.md](02-backend-cms.md) | 排程發布改用 **Timer trigger**（§4，已非 GitHub Actions cron）；**後台 IP 白名單與雙因素都不做**，登入防護只剩次數限制一項（§2）；角色授權在 Function 內驗證；800 篇匯入仍用本機腳本；語料匯出在建置期；**不做媒體庫**，上傳只在內容欄位裡發生且為瀏覽器直傳 Blob（§3、§4） |
| [05-roadmap.md](05-roadmap.md) | Phase 1 新增部署與 CI/CD 工項（**兩條 workflow**）；**上線前驗收改在尚未切 DNS 的正式環境**（不設 staging、不設 PR 預覽）；新增 build 時間與產物大小實測 |

**來源**

- [Quotas in Azure Static Web Apps](https://learn.microsoft.com/en-us/azure/static-web-apps/quotas) — 儲存 250 MB／500 MB、自訂網域 2 個、預覽環境 3 個
- [Configure Azure Static Web Apps](https://learn.microsoft.com/en-us/azure/static-web-apps/configuration) — **設定檔 20 KB 上限**、route 比對規則、`apiRuntime`
- [Overview of API support in Azure Static Web Apps](https://learn.microsoft.com/en-us/azure/static-web-apps/apis-overview) — **45 秒上限**、`/api` 固定前綴、**Bring your own API 僅限 Standard 方案且無法連 PR 預覽環境**、每個環境只能設定一種後端型態
- [Azure Functions scale and hosting](https://learn.microsoft.com/en-us/azure/azure-functions/functions-scale) — Flex Consumption 預設逾時 30 分／最大不設限、**HTTP 觸發 230 秒上限**（負載平衡器閒置逾時）、**Flex Consumption 無 deployment slots**、入站 IP 限制與 VNet 支援表、Consumption 已標為 legacy
- [API support with Azure Functions](https://learn.microsoft.com/en-us/azure/static-web-apps/apis-functions) — **Managed Functions 不支援 Timer trigger、Durable、Managed Identity、Key Vault**
- [Configure front-end frameworks](https://learn.microsoft.com/en-us/azure/static-web-apps/front-end-frameworks) — Nuxt 3 輸出位置 `.output/public`；**SSR 模式的 `api_location` 為 `.output/server`（與自建 Functions 互斥）**
- [Deploy hybrid Next.js websites](https://learn.microsoft.com/en-us/azure/static-web-apps/deploy-nextjs-hybrid) — **Next.js hybrid 不支援 navigation fallback、不支援串接 Azure Functions，且仍為 preview**（本站排除該方案的依據）
- [Nuxt — Rendering modes](https://nuxt.com/docs/guide/concepts/rendering) — route rules 的 `prerender: true` 與 `ssr: false`；`nuxt generate` 輸出至 `.output/public`
- [Supported languages in Azure Functions](https://learn.microsoft.com/en-us/azure/azure-functions/supported-languages) — **.NET 10 isolated GA**；**PHP 不在支援清單內**（僅能走 custom handlers）
- [Configure Azure Static Web Apps — Platform](https://learn.microsoft.com/en-us/azure/static-web-apps/configuration) — `apiRuntime` 值清單，**`dotnet-isolated:9.0` 為上限**；且 `apiRuntime` 須與 csproj 的 `TargetFramework` 一致
- [Supported languages and runtimes in Azure Static Web Apps](https://learn.microsoft.com/en-us/azure/static-web-apps/languages-runtimes) — managed functions 的執行環境清單，**無 .NET 10**
- [Static Web Apps hosting plans](https://learn.microsoft.com/en-us/azure/static-web-apps/plans)、[Quotas](https://learn.microsoft.com/en-us/azure/static-web-apps/quotas) — Free vs Standard：單一環境 250 MB／500 MB、自訂網域 2／5–6（兩份文件數字不一致）、IP 範圍限制 不可用／25、SLA 無／有、**BYOF 僅 Standard**
- [Applying Migrations — EF Core](https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/applying) — **不要在執行期跑遷移**的理由、migration bundle（`--self-contained -r linux-x64`）、`--idempotent` 腳本、EF Core 9+ 的遷移鎖與 `has-pending-model-changes`
