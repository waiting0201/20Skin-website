# 部署範本

複製到未來的網站程式碼 repo 用。說明見 [../07-deployment.md](../07-deployment.md)。

**API 分兩處，這是看範本前要先建立的心智模型：**

- ~~`api/` —— SWA 的 Managed Function~~ 🔴 **2026-09-16 整支刪除**，那個位置現在跑 Nuxt 的 SSR function（CLAUDE.md 決策 7）。
- `functions/` —— 獨立的 Azure Functions App（`api.20skin.tw`），前後台共用的應用程式 API 全在這裡。

| 檔案 | 放到 | 說明 |
|---|---|---|
| [deploy-site.yml](deploy-site.yml) | `.github/workflows/` | build 前台（`nuxt generate` 預渲染）＋ `api/`，同一次部署；部署後 smoke test |
| [deploy-api.yml](deploy-api.yml) | `.github/workflows/` | 部署 `functions/` 到獨立 Function App。OIDC 認證；部署後 smoke test |
| [staticwebapp.config.json](staticwebapp.config.json) | `frontend/public/` | SWA 路由設定（`apiRuntime` 要與 `api/` 的 `TargetFramework` 一致） |
| ~~Fallback.cs~~ | — | 🔴 **2026-09-16 刪除。** 301 改由前台的 catch-all 路由查 `GET /redirects/resolve`（docs/07 §2） |
| [Program.cs](Program.cs) | `functions/` | DI 設定：Managed Identity 連 SQL／Blob、EF Core 與 Dapper 共用連線設定 |
| ~~ScheduledPublish.cs~~ | — | 🔴 **2026-09-16 刪除。** 沒有建置期就沒有東西要觸發；排程發布因此變成即時的（docs/11 §11） |

**Secrets／變數**：SWA 用 `AZURE_STATIC_WEB_APPS_API_TOKEN`；Function App 用 OIDC 三件組（`AZURE_CLIENT_ID`／`AZURE_TENANT_ID`／`AZURE_SUBSCRIPTION_ID`）。**API 的執行期沒有任何密鑰**（Managed Identity）；SWA 端的 `api/` 仍需一組 SQL 唯讀連線字串。

---

## 兩個 .NET 專案，版本不同

| | `api/`（SWA Managed Function） | `functions/`（獨立 Function App） |
|---|---|---|
| 目標框架 | **net9.0**（SWA `apiRuntime` 上限） | **net10.0** |
| 內容 | 只有 `fallback` 一支 | 前後台共用的應用程式 API |
| 資料存取 | Dapper only | EF Core（寫入）＋ Dapper（讀取） |
| 密鑰 | 連線字串明文 | 無 —— Managed Identity |
| 部署 | 跟著每次內容重建 | 只在 `functions/**` 有變更時 |

⚠️ **`api/` 用不到 .NET 10。** SWA 的 `apiRuntime` 最高 `dotnet-isolated:9.0`，而且 Azure 兩份文件對支援清單的說法不一致（[apis-functions](https://learn.microsoft.com/en-us/azure/static-web-apps/apis-functions) 只列到 .NET 8，[configuration](https://learn.microsoft.com/en-us/azure/static-web-apps/configuration) 列到 9.0 isolated）。**開工第一週要實測確認**。

> `scheduled.yml`（GitHub Actions cron）已移除。它原本是用來代替 Managed Functions 缺少的 Timer trigger，API 搬到獨立 Function App 之後不再需要 —— 改用 `scheduled-publish.js`，而且時間是準的。

---

## 301 是怎麼運作的

⚠️ **以下這段描述的是 2026-09-16 之前的做法，保留作對照：**
`navigationFallback` 把所有找不到實體檔案的請求轉給 `/api/fallback`，Function 從 `x-ms-original-url`（**含 query string**）查 SQL 對照表，命中回 301、未命中回 404。
現在轉給的是 Nuxt 的 SSR function，由它的 catch-all 路由打 API 查表。

這麼做是因為 `staticwebapp.config.json` 有 **20 KB 上限**（約 200 條）且 `route` **不比對 query string** —— `share.php?class=醫美新知` 與 `?class=皮膚新知` 在 SWA 眼中是同一個路徑。範本裡直接寫進 config 的那幾條是最高流量的規則，走最快路徑不經過 Function。

`20skinblog.com` 的跨網域 301 **不在本專案範圍內**（該站只做內容與圖片抓取），所以對照表裡不會有它的規則。

---

## 容易踩的坑

**`staticwebapp.config.json` 放錯位置不會報錯。** 必須在 `frontend/public/`，讓 Nuxt 原樣複製到 `.output/public` 根目錄。放錯的話路由、標頭、MIME 全部靜默失效。

**`navigationFallback` 不要指向 Nuxt 的 `200.html`。** 這是靜態託管接 Nuxt SPA 的標準教學寫法，但在這個專案會**直接廢掉整批 301** —— fallback 必須指向 `/api/fallback`，未命中才回 404。`200.html` 若產生出來，放著不用即可。

**`api_location` 只能是 `api`。** Nuxt 純靜態模式仍會在本機產出 `.output/server`，那是 nitro 的殘留物，**不要上傳、更不要指給 `api_location`** —— 那個位置留給 `fallback` 這支 Managed Function。指過去等於把整批 301 換掉。

**不要把 `functions/` 的東西寫進 `api/`。** 兩者部署節奏完全不同：`api/` 跟著每次內容重建重新部署，`functions/` 只在自己有變更時部署。把應用程式 API 放進 `api/` 等於自願回到「發一篇文章就重新部署一次 API」，還會撞上 SWA `/api` 的 45 秒上限。

**`/admin/*` 一定要有 route rewrite。** `navigationFallback` 現在指向 `/api/fallback`，後台 SPA 的深層連結（如 `/admin/articles/123`）沒有實體檔案，會掉進 301 查表然後變成 404。範本已含 `"rewrite": "/admin/index.html"`。

**`navigationFallback.exclude` 少列一種副檔名**，那類資產遺失時會去打 Function，白白吃冷啟動。新增靜態資產類型時，`exclude` 與 `mimeTypes` 要一起補。

**未命中要回 404，不要回 200。** 回 200 會變成軟性 404，Google 會把那些頁面當成重複內容。

**`/admin/*` 不要用 `allowedRoles`。** 那是 SWA 內建驗證，跟 CMS 的五種角色是兩套系統。授權一律在 API 端驗證。

**SWA 的 `x-ms-client-principal` 到不了 `api.20skin.tw`。** 那個標頭是 SWA 注入給自家 Managed Functions 的，跨網域呼叫獨立 Function App 時不存在。認證 token 用 **Bearer** 帶，不要指望跨來源 cookie。

**錯誤回應也要帶 CORS 標頭。** 只在成功路徑設 CORS 是很常見的疏漏 —— 4xx／5xx 少了標頭，瀏覽器端只會看到一個沒有任何資訊的 network error，後台除錯會非常痛苦。

**`trailingSlash: "always"`** 對應 Nuxt 預渲染的目錄式輸出（`/treatments/laser/index.html`）。這個設定和 301 目標網址要一致，否則每次轉址都多跳一次。

**`platform.apiRuntime` 要與 `api/` 的 `TargetFramework` 一致。** 官方文件明講「if you set an `apiRuntime` value, make sure the value matches what you define in the csproj file」。兩邊不一致的失敗訊息不會指向這裡。

**資料庫遷移永遠不要在執行期跑。** 不要呼叫 `Database.Migrate()`／`MigrateAsync()`。EF Core 官方明列的理由包括：應用程式會因此需要 DDL 權限（與最小權限原則相衝突）、無法事先檢閱要執行的 SQL、回滾困難。遷移一律走 CI 的 `efbundle`，見 [deploy-api.yml](deploy-api.yml)。

**遷移必須向後相容。** 沒有 staging，workflow 的順序是「先遷移、後部署」—— 兩者之間有一段時間是**新 schema 配舊程式**在跑。所以改欄位要用擴張／收縮兩階段（先加新欄位並雙寫，部署後再於下一次遷移移除舊欄位），不要一次改完。

**沒有預覽環境，兩條 workflow 都是合併即上線。** 所以 `test`、大小檢查、smoke test 三者不可以跳過或設 `continue-on-error` —— 它們是僅有的攔截點。搭配 `main` 分支保護，見 [../07-deployment.md](../07-deployment.md) §5。
