# 10 — API 契約

> 本文件規範**寫什麼**（端點、形狀、權限）；**怎麼寫**見 [11-backend-design.md](11-backend-design.md)。
>
> 資料表與欄位定義以 [08-database.md](08-database.md) 為準；後台功能語意以 [02-backend-cms.md](02-backend-cms.md) 為準。

---

## 1. 兩處 API，能力與職責完全不同

**這是整份架構最容易搞錯的地方**（[07-deployment.md](07-deployment.md) §4）：

| | `functions/` → `api.20skin.tw` | `api/` → SWA Managed Function |
|---|---|---|
| 內容 | **本文件的全部端點** | **只有 `/api/fallback` 一支**，約 770 條 301 |
| 框架 | .NET 10 isolated ＋ EF Core ＋ Dapper | **最高 net9.0**，**Dapper only** |
| HTTP 逾時 | 230 秒 | 45 秒 |
| Timer／Managed Identity | ✅ | ❌ |
| 部署 | 只在 `functions/**` 變更時 | 跟著每次內容重建 |

⚠️ **不要把應用程式 API 寫進 `api/`**，也不要用 SWA 的 Bring-your-own-API 串接（需 Standard 方案）。反過來，**`/api/fallback` 也不能搬到 `api.20skin.tw`** —— `navigationFallback` 只能 rewrite 到站內路徑，指不到外部網址。

---

## 2. 契約規範

- **位址**：`https://api.20skin.tw/api/v1/...`（`host.json` 的 `routePrefix` 為 `api/v1`）。下方 §3 的路徑一律省略此前綴。
- **風格**：RESTful，JSON。**請求與回應一律 camelCase。**
- **語系**：單一語系（繁中）。**沒有 `?lang=`、沒有 i18n 子表、沒有 hreflang。**
- **認證**：前台公開端點全部匿名；`/admin/*` 一律需要 **Bearer** token（不使用跨來源 cookie，[07](07-deployment.md) §1）。五種角色的 RBAC 一律在 API 內驗證。
- **回應信封**：所有端點一律回傳統一信封，**不回裸 data**：

  ```jsonc
  // 成功
  { "success": true, "code": null, "data": { ... }, "message": "Success",
    "errors": [], "timestamp": "2026-09-11T10:00:00.0000000+00:00" }
  // 失敗
  { "success": false, "code": "VALIDATION_REQUIRED", "data": null,
    "message": "缺少必填欄位。", "errors": ["title is required"], "timestamp": "..." }
  ```

  **`code` 給程式判斷、`message` 給人看、`errors` 放細節。前端一律以 `code` 分支，不得比對 `message` 字串。**
- **分頁**：`page` / `pageSize`（預設 20、**上限 100**）。雙模式 —— 帶分頁參數時 `data` 為 `{ items, totalCount, page, pageSize, totalPages }`；不帶時為平面陣列（供下拉選單）。
  ⚠️ **`pageSize` 必須有上限。** 後台清單有約 800 篇文章，一個 `pageSize=99999` 就能拖垮 API 與資料庫。
- **關鍵字篩選**：後台清單共同支援 `keyword`，**在 SQL 層過濾**。清單一律分頁，在前端過濾只會搜到當頁那 20 筆。
- **快取**：後台端點一律 `Cache-Control: no-store`。公開端點（§3.1）只有 `/site-settings/public` 需要快取，給短 `s-maxage`。
- **CORS**：allow-list 為正式前台來源與上線前驗收用的 SWA 預設網址，**不使用 `*`**（後台端點帶憑證）。由院方設定（[07](07-deployment.md) §1）。
  ⚠️ **4xx／5xx 的回應也要帶 CORS 標頭** —— 少了它，瀏覽器端只會看到一個沒有任何資訊的 network error。
- **文件化**：以手寫 `functions/openapi.yaml` 進版控為準（catch-all 路由下自動產生器內省不出端點，見 [11](11-backend-design.md) §2）。改端點時同步本文件 §3。

### 錯誤碼值域

| `code` | HTTP | 用於 |
|---|---|---|
| `VALIDATION_REQUIRED` | 400 | 缺必填欄位 |
| `VALIDATION_FORMAT` | 400 | 格式錯誤（email、日期、slug） |
| `VALIDATION_RANGE` | 400 | 長度／數值超出範圍（SEO 標題、AI 摘要 40–60 字） |
| `AUTH_INVALID_CREDENTIALS` | 401 | 帳密錯誤。**不區分「帳號不存在」與「密碼錯誤」** |
| `AUTH_TOKEN_INVALID` | 401 | token 缺失／過期／簽章不符 |
| `AUTH_MUST_CHANGE_PASSWORD` | 403 | 首次登入尚未改密碼 |
| `AUTH_ACCOUNT_INACTIVE` | 403 | 帳號停用 |
| `FORBIDDEN` | 403 | 權限碼不足 |
| `NOT_FOUND` | 404 | 資源不存在 |
| `CONFLICT_DUPLICATE` | 409 | `UrlPath`／slug／帳號重複 |
| `CONFLICT_STATE` | 409 | 狀態不允許此操作（如送審中仍嘗試編輯本文、刪除仍被引用的分類） |
| `CONFLICT_LOCKED` | 409 | `IsSystemLocked`：系統頁與系統分類不可刪、不可改 slug |
| `UPLOAD_TYPE` / `UPLOAD_SIZE` | 400 | 副檔名或大小不在白名單 |
| `RATE_LIMITED` | 429 | 公開端點或登入頻率限制 |
| `BOT_CHECK_FAILED` | 400 | 機器人驗證未通過（供應商見 §5 待確認） |
| `INTERNAL` | 500 | 未預期例外，**不得洩漏堆疊** |

新增錯誤碼時同步本表與 `Common/ErrorCodes.cs`。

---

## 3. 端點群組

### 3.1 公開（匿名，前台用）

前台是建置期預渲染的靜態站，**執行期只打這四支**（[09-frontend.md](09-frontend.md) §4）：

| 端點 | 說明 |
|---|---|
| `GET /health` | 冒煙測試用。兩條 workflow 的部署後檢查都打它 |
| `POST /contact` | `/contact/` 表單。**只寄通知信，不落庫**（[02](02-backend-cms.md) §2）。回應不帶任何內部 Id |
| `POST /questions/miss` | 站內搜尋查無結果時回寫一筆到 `QuestionInbox`（[08](08-database.md) §F）。去重由伺服器端做 |
| `GET /site-settings/public` | 只回前台需要的鍵：**AI FAQ 啟用開關**、面板文案、轉真人出口網址。**收件信箱、追蹤碼等內部設定一律不外露** |

⚠️ **`POST /contact` 與 `POST /questions/miss` 是對公網開放的寫入端點**，必須有 rate limit ＋ 機器人驗證（§5）。`/contact` 另須記錄隱私同意時間 —— 但**只在寄出的通知信裡帶，不入庫**。

> 沒有前台內容端點。療程、文章、醫師這些資料**不經由 API 提供給前台** —— 它們在建置期由匯出腳本直接查 SQL 烤進 HTML（[09](09-frontend.md) §3）。這是純靜態架構的直接結果，不是遺漏。

### 3.2 認證

| 端點 | 說明 |
|---|---|
| `POST /auth/login` | body 為 `userName` ＋ `password`。**登入識別不是 email**（[08](08-database.md) §A-1）。**單段驗證** —— 通過就直接發 access ＋ refresh token，沒有雙因素（2026-09-11 院方決定） |
| `POST /auth/refresh` | refresh token 輪替（見 §5 待確認） |
| `POST /auth/logout` | 撤銷該 refresh token |
| `POST /auth/change-password` | 需有效 token，**不需權限碼** —— 首登強制改密碼時使用者還沒有任何權限 |

🔴 **`POST /auth/login` 的次數限制是後台唯一的防線**，所以它不能打折：**帳號與來源 IP 雙維度計數**（只鎖帳號擋不住撞庫、只鎖 IP 擋不住分散式嘗試），鎖定事件**即時寄出告警信、不留存紀錄**（[02](02-backend-cms.md) §4、[08](08-database.md) §I）。
原規劃三道防線都不在了：IP 白名單不做（2026-08-13）、**雙因素不做（2026-09-11）**，而後台路徑 `/admin/` 是客戶指定、公開可猜。**帳密成為唯一憑證**，密碼強度與輪替規則需一併訂定。

### 3.3 後台：九個內容模型

`{unit}` 為單元代號，**與權限碼前綴逐字對應，不做單複數轉換**：

`treatment`／`doctor`／`concern`／`article`／`case`／`faq`／`clinic`／`page`／`term`

| 端點 | 權限碼 | 說明 |
|---|---|---|
| `GET /admin/{unit}` | 登入即可 | 清單。共同參數 `page`／`pageSize`／`status`／`categoryId`／`keyword` |
| `GET /admin/{unit}/{id}` | 登入即可 | 單筆（含 `SeoMeta`、關聯、`BodyBlocks`） |
| `POST /admin/{unit}` | `content.{unit}.edit` | 新增 |
| `PUT /admin/{unit}/{id}` | `content.{unit}.edit` | 更新本文 |
| `PUT /admin/{unit}/{id}/seo` | **`seo.edit`** | **只寫 `SeoMeta`。** 行銷角色的落點 —— 可改全站 SEO 欄位，不可改醫療敘述本文（[02](02-backend-cms.md) §4） |
| `PUT /admin/{unit}/{id}/relations` | `content.{unit}.edit` | 關聯（療程↔困擾↔文章↔FAQ↔醫師），寫 `ContentRelations` |
| `POST /admin/{unit}/{id}/submit` | `content.submit` | 送審，建立 `ContentReviews` 一筆並附 `RiskFlags` |
| `PATCH /admin/{unit}/{id}/schedule` | `content.{unit}.publish` | 設定 `PublishAt`／`UnpublishAt` |
| `PATCH /admin/{unit}/{id}/publish` | `content.{unit}.publish` | 直接發布／下架（僅具發布權的角色） |
| `PUT /admin/{unit}/sort` | `content.{unit}.edit` | 批次排序 |
| `DELETE /admin/{unit}/{id}` | `content.{unit}.edit` | 刪除。`IsSystemLocked` 者回 409 `CONFLICT_LOCKED` |
| `GET /admin/{unit}/{id}/versions` | `content.{unit}.edit` | 版本清單 |
| `GET /admin/{unit}/{id}/versions/{no}` | `content.{unit}.edit` | 單一版本快照（供差異比對） |
| `POST /admin/{unit}/{id}/versions/{no}/restore` | `content.{unit}.edit` | 還原為草稿，**不直接上線** |

三個逐單元的例外：

- **`term`（分類與標籤）**：`POST`／`DELETE` **限超級管理員**（動到 URL 結構與 301 對照表）；新增標籤屬 `term.edit`（[02](02-backend-cms.md) §4）。刪除前回 `usageCount`，仍有引用則回 409 `CONFLICT_STATE` 並說明筆數
- **`page`**：系統頁**不可新增、不可刪除、不可改 slug**（`IsSystemLocked`）；法務三頁**限超級管理員**
- **`doctor`／`article`**：醫師角色只能動**自己的**內容 —— 以 `ContentItems.OwnerUserId` 判定（見 [11](11-backend-design.md) §5.4，這是「授權集中在 Router」唯一的例外）

### 3.4 後台：工作流、站台編排與系統

| 端點 | 權限碼 | 說明 |
|---|---|---|
| `GET /admin/review` | `review.approve` | 審核佇列，查 `ContentReviews WHERE Status=1`，依 `SubmittedAt` |
| `POST /admin/review/{id}/approve` | `review.approve` | 核准。核准即進入發布判定（[11](11-backend-design.md) §7） |
| `POST /admin/review/{id}/reject` | `review.reject` | 退回，**`decisionNote` 必填** |
| `GET /admin/dashboard` | 登入即可 | 聚合查詢，**無專屬資料表**。含「我的退件」＝ `ContentReviews WHERE Status=3 AND SubmittedByUserId=@me` |
| `POST /admin/media/sas` | `media.manage` | 取短效寫入 SAS（限定容器與 blob 名稱、write only） |
| `GET|POST|DELETE /admin/media` | `media.manage` | 媒體清單／回報寫入／刪除。刪除前檢查 `MediaUsages` |
| `GET|PUT /admin/home-section` | `home.arrange` | 首頁版位編排。**只能引用既有內容，不收自由文案** |
| `GET|PUT /admin/menu` | `menu.edit` | 導覽選單與頁尾（限超級管理員） |
| `GET|PUT /admin/setting` | `settings.edit` | 全站設定（限超級管理員），含 AI FAQ 開關 |
| `GET|POST|PUT|DELETE /admin/redirect` | `redirect.manage` | 301 對照表（約 770 條） |
| `GET|POST /admin/redirect/export|import` | `redirect.manage` | CSV 匯入匯出。**約 770 條不可能手工維護** |
| `GET|PATCH|DELETE /admin/question` | `content.faq.edit` | 未命中題目清單；`PATCH` 可標記為已建立並回填 `LinkedFaqContentItemId` |
| `GET|POST|PUT|DELETE /admin/user` | `account.manage` | 帳號管理（限超級管理員） |
| `PUT /admin/user/{id}/password` | `account.manage` | 重設密碼 |
| `GET /admin/role`、`PUT /admin/role/{id}/permissions` | `account.manage` | 角色權限設定（限超級管理員） |
| `POST /admin/rebuild` | `settings.edit` | 手動觸發全站重建。**有聚合窗口**，見 [11](11-backend-design.md) §10 |
| `GET /admin/export/{kind}` | `settings.edit` | 預覽 `faq.json`／`llms.txt`／`llms-full.txt`。**實際產物在建置期產生**，此端點只供後台畫面預覽（[07](07-deployment.md) §4） |

**未列於上表的 `/admin/*` 路徑一律拒絕（403）。** 新增後台端點時必須同步補進路由表與權限表兩處（[11](11-backend-design.md) §5.3）。

---

## 4. 權限碼與五種角色

🔴 **權限碼的權威是 [08-database.md](08-database.md) §A-2**，種子在 `functions/Data/Seed/SeedData.cs`（31 列）。

> ⚠️ 本節初版寫成 `{unit}.{action}`（如 `treatment.edit`／`treatment.publish`），
> 與 08 §A-2 相衝，**已於 2026-09-11 更正為下表**。
> 若在任何地方看到 `{unit}.view`／`{unit}.delete`／`review.decide`／`user.*`／`role.*`／
> `question.*`／`rebuild.trigger`，那是舊命名。
> **`apps/admin/src/permissions.ts` 目前仍是舊命名**，接上真 API 前必須同步（見 STATUS.md §八）。

31 個權限碼：

| 群組 | 權限碼 |
|---|---|
| 內容 | `content.{unit}.edit`、`content.{unit}.publish`（九個單元各一對，共 18）、`content.submit` |
| 工作流 | `review.approve`、`review.reject` |
| SEO | `seo.edit`、`redirect.manage` |
| 分類與標籤 | `taxonomy.tag.create`、`taxonomy.category.manage` |
| 頁面 | `page.legal.edit` |
| 站台編排 | `home.arrange`、`menu.edit`、`settings.edit` |
| 系統 | `account.manage`、`media.manage` |

⚠️ **沒有獨立的 `view` 權限碼。** 讀取端點是「登入即可」—— 能編輯就看得到，
行銷與審核者靠 `seo.edit`／`content.*.publish` 進來。**刪除用 `content.{unit}.edit`**，
不另設 `delete`（docs/08 §A-2 的 31 列裡沒有這兩種）。

| 角色 | 權限 |
|---|---|
| **超級管理員** | 全部 31 個 |
| **內容編輯** | 九個 `content.{unit}.edit` ＋ `content.submit` ＋ `seo.edit` ＋ `taxonomy.tag.create` ＋ `home.arrange` ＋ `media.manage`。**沒有任何 `publish`** |
| **醫師** | `content.doctor.edit`／`content.article.edit`（**僅 `OwnerUserId` 是自己的**）＋ `content.submit` ＋ `review.approve`／`review.reject` ＋ `media.manage` |
| **行銷** | `seo.edit` ＋ `content.faq.edit` ＋ `media.manage`。**沒有其他 `edit`** |
| **審核者** | 九個 `content.{unit}.publish` ＋ `review.approve`／`review.reject` |

⚠️ **發布權與編輯權必須分離。** 這是三段式工作流的前提，也是 [02](02-backend-cms.md) §5 兩層防護的第一層 —— 療程、案例、FAQ 三類內容不得跳過審核直接上線。

⚠️ **設定類不走審核，儲存即生效，而且沒有留痕**（不做操作日誌，2026-09-11 定案）。`SiteSettings`、`MenuItems`、`RolePermissions` 與帳號異動誰改了什麼，事後查不到，唯一控管是「限超級管理員」這道權限門檻（[08](08-database.md) §I）。

---

## 5. 待確認

| 項目 | 說明 |
|---|---|
| **機器人驗證供應商** | `POST /contact`、`POST /questions/miss`、`POST /auth/login` 需要。reCAPTCHA v3（分數制，需比對 `action` 並訂門檻）與 Cloudflare Turnstile 皆可。**介面命名不要帶供應商名稱**（`IBotCheckService`），換供應商時呼叫端不該改動。**開工前定案** |
| **`RefreshTokens` vs 短效 JWT ＋ `SecurityStamp`** | [08](08-database.md) §L 已列為二選一。建議 `RefreshTokens` ＋ rotation（撤銷重用即撤銷該使用者全部 token），因為後台要能「停用帳號後立刻踢下線」 |
| **AI FAQ 的問答端點** | **本期不做。** AI 的實作方式與時程都未定（[04-ai-faq.md](04-ai-faq.md) §4），**不要先在契約裡留 `/ai/chat`**，也不要為它加 schema 欄位（[08](08-database.md) §0 決策二） |
| **`GET /site-settings/public` 是否必要** | 見 [09](09-frontend.md) §13 —— 與「開關烤進 build」取捨 |
