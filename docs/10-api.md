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
- **內容單元的請求體形狀**：型別專屬欄位可以放在巢狀的 `fields` 物件裡，也可以直接攤在頂層；**帶了 `fields` 就只讀 `fields`**，頂層同名欄位一律忽略。
  ⚠️ **兩種都要收得下，不可以只留一種。** 回應一律把型別欄位包在 `fields` 底下，所以「把讀到的東西改一改再送回去」必須要能寫進去 —— 否則欄位沒帶＝不動該欄位，會**靜靜地什麼都沒寫**（後台 2026-09-12 接上真 API 時踩到）。攤平那條路則是遷移期匯入腳本（`tools/content-import/import.mjs`）在用的，那支工具已經對正式內容跑過。
  共同欄位（`title`／`slug`／`summary`／`sortOrder`／`includeInSitemap`／`ownerUserId`）**永遠在頂層**。
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

登入與換發成功的回應體：`accessToken`／`refreshToken`／`userId`／`userName`／`doctorId`／`displayName`／`roles[]`／`permissions[]`／`isSuperAdmin`／`mustChangePassword`。

⚠️ **`userId`／`userName`／`doctorId` 由回應體直接給，前端不解 token。** access token 是自簽 JWT，要前端自己 base64 解 payload 等於讓它依賴 token 的內部格式，換簽章方式時會無聲壞掉。
⚠️ **`permissions[]` 是前端唯一的權限依據。** 角色權限可以在後台改（`PUT /admin/role/{id}/permissions`），前端若自己用角色推導一份，改完的那一刻就過期了 —— 而且不會有任何徵兆。

🔴 **`POST /auth/login` 的次數限制是後台唯一的防線**，所以它不能打折：**帳號與來源 IP 雙維度計數**（只鎖帳號擋不住撞庫、只鎖 IP 擋不住分散式嘗試），鎖定事件**即時寄出告警信、不留存紀錄**（[02](02-backend-cms.md) §4、[08](08-database.md) §I）。
原規劃三道防線都不在了：IP 白名單不做（2026-08-13）、**雙因素不做（2026-09-11）**，而後台路徑 `/admin/` 是客戶指定、公開可猜。**帳密成為唯一憑證**，密碼強度與輪替規則需一併訂定。

### 3.3 後台：九個內容模型

`{unit}` 為單元代號，**與權限碼前綴逐字對應，不做單複數轉換**：

`treatment`／`doctor`／`concern`／`article`／`case`／`faq`／`clinic`／`page`／`term`

| 端點 | 權限碼 | 說明 |
|---|---|---|
| `GET /admin/{unit}` | 登入即可 | 清單。共同參數 `page`／`pageSize`／`status`／`categoryId`／`keyword`／`ownerUserId` |
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

清單一列除了共同欄位，還帶三樣後台畫面要用的東西：

- `categoryTermId` ＋ `categoryTitle` —— 有分類的三個單元（療程／文章／FAQ）。**畫面顯示名稱，不顯示 Id**
- `usageCount` —— **只有 `term` 有值**，其餘為 `null`。它是四個相關子查詢，對有約 800 筆的文章單元不值得每次清單都算一遍
- `fields` —— **逐單元的少數幾個顯示欄位**（醫師的職稱、據點的地址電話、文章的顯示日期…），鍵名與後台 `listColumns` 逐字對應。
  ⚠️ 這**不是**完整的詳情 `fields`：清單一頁 20 列，撈詳情等於 20 份內文與圖片欄位。需要完整欄位一律走 `GET /admin/{unit}/{id}`

關聯（`relations`）**兩個方向都回**，靠 `isReverse` 分辨：

- `isReverse: false` —— 這筆內容指出去的（`FromContentItemId = 自己`），可編輯
- `isReverse: true` —— 別人指著這筆內容的（`ToContentItemId = 自己`），**唯讀**，編輯入口在對方的畫面

⚠️ 兩種的 `toContentItemId`／`toTitle` **一律是「對方」**，不是資料表裡的 To 欄位 —— 讓前端不必分兩種形狀處理。
⚠️ 反向的那幾筆**不可以拿去寫回** `PUT .../relations`，那會建出一筆方向相反的重複關聯（docs/08 §D「雙向關聯一律單向存」）。
⚠️ 只回正向的話，「反向唯讀」欄位（醫師頁的關聯療程、療程頁的駐診據點…）在畫面上會永遠是空的 —— 而那不是沒有資料，是查錯方向，**沒有任何錯誤訊息**。

⚠️ **`PUT /admin/{unit}/{id}/relations` 是整筆取代**：它會刪掉這筆內容**所有**正向關聯，再寫入送出去的那一份。只改一個關聯欄位時其餘欄位也必須一起送，少送就是刪掉。

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
| `POST /admin/upload/sas` | `upload.file` | 取短效寫入 SAS（限定容器與 blob 名稱、write only、只收圖片） |
| `POST /admin/upload/commit` | `upload.file` | 直傳完成後回報。API 讀檔頭驗真實型別，通過就回傳一組**圖片值**：`{ blobPath, url, alt, width, height, variants }` |
| `GET|PUT /admin/home-section` | `home.arrange` | 首頁版位編排。**只能引用既有內容，不收自由文案** |
| `GET|PUT /admin/menu` | `menu.edit` | 導覽選單與頁尾（限超級管理員） |
| `GET|PUT /admin/setting` | `settings.edit` | 全站設定（限超級管理員），含 AI FAQ 開關 |
| `GET|POST|PUT|DELETE /admin/redirect` | `redirect.manage` | 301 對照表（約 770 條）。清單支援 `keyword`／`isActive`／`source`／`sortBy`（`fromPath`／`createdAt`）／`sortDir`，**全部在 SQL 層** |
| `GET /admin/redirect/stats` | `redirect.manage` | 清單上方的統計卡（總數／啟用／已核對／三種來源各幾筆）。⚠️ 獨立一支而不是塞進清單回應 —— 統計是全表的、清單是一頁的 |
| `GET|POST /admin/redirect/export|import` | `redirect.manage` | CSV 匯入匯出。**約 770 條不可能手工維護**。匯入可帶 `overwriteExisting`（預設 `false`）—— 來源已存在時改成更新而不是跳過，但**不動 `Source` 與 `IsVerified`** |
| `GET|PATCH|DELETE /admin/question` | `content.faq.edit` | 未命中題目清單；清單支援 `status`／`source`／`keyword`；`PATCH` 可標記為已建立並回填 `LinkedFaqContentItemId` |
| `GET|POST|PUT|DELETE /admin/user` | `account.manage` | 帳號管理（限超級管理員） |
| `PUT /admin/user/{id}/password` | `account.manage` | 重設密碼 |
| `GET /admin/role`、`PUT /admin/role/{id}/permissions` | `account.manage` | 角色權限設定（限超級管理員） |
| `GET /admin/rebuild` | **登入即可** | 聚合窗口狀態。⚠️ 這是「重建請求送出去了沒有」，**不是建置進度** —— `repository_dispatch` 是射後不理。後台的「發布中／已上線」是樂觀顯示，不是部署成功的證據。權限刻意不是 `settings.edit`：內容編輯要看得到這個狀態字，但不該能自己觸發建置 |
| `POST /admin/rebuild` | `settings.edit` | 手動觸發全站重建。**有聚合窗口**，見 [11](11-backend-design.md) §10 |
| `GET /admin/risk-term` | **登入即可** | 啟用中的高風險字詞清單，供編輯器即時提示（[02](02-backend-cms.md) §5）。⚠️ **是提示不是閘門** —— 送審時伺服器仍會自己重掃一次，前端掃到什麼不影響能不能送審，兩邊結果不一致也不是錯誤 |
| `GET /admin/export/{kind}` | `settings.edit` | 預覽 `faq.json`／`llms.txt`／`llms-full.txt`。**實際產物在建置期產生**，此端點只供後台畫面預覽（[07](07-deployment.md) §4） |

**未列於上表的 `/admin/*` 路徑一律拒絕（403）。** 新增後台端點時必須同步補進路由表與權限表兩處（[11](11-backend-design.md) §5.3）。

🔴 **上傳沒有清單與刪除端點**（2026-09-11 定案不做媒體庫）。`GET /admin/media`、`DELETE /admin/media/{id}` 這類端點**不存在，也不要補回來** —— 圖片是內容欄位的一部分，它的建立、修改與刪除全部隨所屬內容的 `PUT`／`DELETE` 發生（[08](08-database.md) §0 決策四、[11](11-backend-design.md) §9）。SEO 區塊的 OG 圖同理，欄位名是 `ogImage`，值是同一個圖片值物件，不是 `ogImageMediaId`。

---

## 4. 權限碼與五種角色

🔴 **權限碼的權威是 [08-database.md](08-database.md) §A-2**，種子在 `functions/Data/Seed/SeedData.cs`（31 列）。

> ⚠️ 本節初版寫成 `{unit}.{action}`（如 `treatment.edit`／`treatment.publish`），
> 與 08 §A-2 相衝，**已於 2026-09-11 更正為下表**。
> 若在任何地方看到 `{unit}.view`／`{unit}.delete`／`review.decide`／`user.*`／`role.*`／
> `question.*`／`rebuild.trigger`／`setting.*`／`home.edit`，那是舊命名。
> `apps/admin/src/permissions.ts` 已於 2026-09-12 同步為下表，**而且不再自己推導**——
> 它查的是登入回應帶回來的 `permissions[]`（見 §3.2）。

31 個權限碼：

| 群組 | 權限碼 |
|---|---|
| 內容 | `content.{unit}.edit`、`content.{unit}.publish`（九個單元各一對，共 18）、`content.submit` |
| 工作流 | `review.approve`、`review.reject` |
| SEO | `seo.edit`、`redirect.manage` |
| 分類與標籤 | `taxonomy.tag.create`、`taxonomy.category.manage` |
| 頁面 | `page.legal.edit` |
| 站台編排 | `home.arrange`、`menu.edit`、`settings.edit` |
| 系統 | `account.manage`、`upload.file` |

⚠️ **沒有獨立的 `view` 權限碼。** 讀取端點是「登入即可」—— 能編輯就看得到，
行銷與審核者靠 `seo.edit`／`content.*.publish` 進來。**刪除用 `content.{unit}.edit`**，
不另設 `delete`（docs/08 §A-2 的 31 列裡沒有這兩種）。

| 角色 | 權限 |
|---|---|
| **超級管理員** | 全部 31 個 |
| **內容編輯** | 九個 `content.{unit}.edit` ＋ `content.submit` ＋ `seo.edit` ＋ `taxonomy.tag.create` ＋ `home.arrange` ＋ `upload.file`。**沒有任何 `publish`** |
| **醫師** | `content.doctor.edit`／`content.article.edit`（**僅 `OwnerUserId` 是自己的**）＋ `content.submit` ＋ `review.approve`／`review.reject` ＋ `upload.file` |
| **行銷** | `seo.edit` ＋ `content.faq.edit` ＋ `upload.file`。**沒有其他 `edit`** |
| **審核者** | 九個 `content.{unit}.publish` ＋ `review.approve`／`review.reject` |

⚠️ **發布權與編輯權必須分離。** 這是三段式工作流的前提，也是 [02](02-backend-cms.md) §5 兩層防護的第一層 —— 療程、案例、FAQ 三類內容不得跳過審核直接上線。

⚠️ **設定類不走審核，儲存即生效，而且沒有留痕**（不做操作日誌，2026-09-11 定案）。`SiteSettings`、`MenuItems`、`RolePermissions` 與帳號異動誰改了什麼，事後查不到，唯一控管是「限超級管理員」這道權限門檻（[08](08-database.md) §I）。

---

## 5. 待確認

| 項目 | 說明 |
|---|---|
| ~~**機器人驗證供應商**~~ | ✅ **已定案（2026-09-12）：reCAPTCHA v3。** 規格見下方 §5.1 |
| **`RefreshTokens` vs 短效 JWT ＋ `SecurityStamp`** | [08](08-database.md) §L 已列為二選一。建議 `RefreshTokens` ＋ rotation（撤銷重用即撤銷該使用者全部 token），因為後台要能「停用帳號後立刻踢下線」 |
| **AI FAQ 的問答端點** | **本期不做。** AI 的實作方式與時程都未定（[04-ai-faq.md](04-ai-faq.md) §4），**不要先在契約裡留 `/ai/chat`**，也不要為它加 schema 欄位（[08](08-database.md) §0 決策二） |
| **`GET /site-settings/public` 是否必要** | 見 [09](09-frontend.md) §13 —— 與「開關烤進 build」取捨 |

---

## 5.1 機器人驗證：reCAPTCHA v3（2026-09-12 定案）

套用於三支對公網開放的寫入端點：`POST /contact`、`POST /questions/miss`、`POST /auth/login`。
請求欄位一律是 **`botCheckToken`**，前端動作名稱一律是 **`contact`／`questions_miss`／`login`**。

🔴 **action 名稱只能包含 `A-Za-z/_`** —— 不可有連字號或數字。帶了不合法的字元時
`grecaptcha.execute` **不會丟例外**，只在 console 印一行 `Invalid action name` 然後
把 action 丟掉，伺服器端的比對就永遠對不上，而使用者看到的是一般的「自動化驗證未通過」。
2026-09-14 對正式環境做端到端時才抓到（原本是 `questions-miss`）。
前端兩支取 token 的模組已加上格式檢查，不合法會當場丟例外。
⚠️ `/questions/miss` 的**速率限制鍵**仍是 `questions-miss`（`LoginThrottles` 裡的既有資料列），
與 action 名稱刻意不同名 —— 改它等於把已累積的計數丟掉。

⚠️ **介面與欄位命名不帶供應商名稱**（`IBotCheckService`、`botCheckToken`）——
換成 Turnstile 時只有 `functions/Services/BotCheckService.cs` 與前端那兩支
取 token 的模組要改，呼叫端一行都不動。**不要讓 `recaptcha` 這個字漏進 Handler 或 DTO。**

### v3 不會擋下任何人，門檻是我們自己訂的

它回一個 0.0–1.0 的分數，所以有三件事缺一不可：

1. **比對 `action`。** 少了這一步，攻擊者可以拿在首頁取得的 token 來打 `/auth/login` ——
   同一把 site key 發出的 token 在任何動作上都驗得過
2. **套分數門檻**（`BotCheck__MinimumScore`，預設 `0.5`，Google 建議的起點）
3. **看 `success`。** token 過期（2 分鐘）、重複使用、site key 不符都在這裡現形

⚠️ **不要為了「乾淨」把門檻往上調。** v3 對少數真人也會給低分（隱私瀏覽、VPN、
輔助技術、極少互動就送出表單的人）。調到 0.7 擋掉的絕大多數是真的病人，
而且他們**不會知道自己被擋了** —— v3 沒有挑戰題可以解，只會看到送出失敗。
要調請先看 Application Insights 裡實際的分數分佈。

### 什麼情況放行，什麼情況擋下

| 情況 | 行為 | 理由 |
|---|---|---|
| 未設定 `BotCheck__SecretKey` | **放行** ＋ Warning | 本機開發與尚未申請金鑰的期間要能用。🔴 **正式環境上線前必須設定** |
| 連不上 Google／逾時（5 秒）／回應無法解析 | **放行** ＋ Warning | 見下方 |
| 請求**沒有帶 token** | **擋下** | 不擋的話，不送 token 就能繞過，整套驗證等於不存在 |
| `success=false` | **擋下** | token 過期、重複使用、金鑰不符 |
| `action` 不符 | **擋下** | 見上方第 1 點 |
| 分數低於門檻 | **擋下** | |

🔴 **「連不上就放行」不是把防護關掉，是兩害相權：**

- `/contact` 擋下＝Google 有狀況的期間，**院方收不到任何病人詢問**。少收一封詢問比多收一封垃圾信嚴重得多
- `/auth/login` 擋下＝**後台整個登不進去**。而登入真正的防線是次數限制（帳號 ＋ 來源 IP 雙維度，[02](02-backend-cms.md) §4），那一道不受 Google 影響

⚠️ 所以「放行」**只發生在傳輸層失敗**。Google 明確回答「這不是人」時一律擋下，兩者不可混為一談。
⚠️ 每一次放行都記 `Warning` —— 沉默的放行等於沒有防護。

⚠️ **對外的錯誤訊息一律是同一句**，不透露是分數太低、token 過期還是 action 不符 ——
那些差別對真人沒有用，對想繞過的人很有用。細節只進 log。

### 前端

- **site key 是公開值**（`NUXT_PUBLIC_RECAPTCHA_SITE_KEY`／`VITE_RECAPTCHA_SITE_KEY`），
  本來就會出現在 HTML 裡。要保密的是 secret key，那個只在 Function App 的 app settings
- 🔴 **token 在「送出的那一刻」才取。** 效期只有 2 分鐘 —— 頁面載入時就取的話，
  使用者慢慢填完再送出時早就過期，而錯誤訊息會指向「自動化驗證未通過」，查不到真正的原因
- 🔴 **Google 的 script 只在需要的頁面載入。** 前台約 950 頁，只有 `/contact/` 與 `/search/`
  需要 —— 全站載入等於在每一頁塞一支第三方追蹤 script
- 🔴 **取不到 token 時不要硬送。** 後端會擋下，而使用者只會看到一個看不懂的錯誤。
  前端要分辨「載不到驗證」（擴充套件／防火牆擋下）與「驗證不通過」，並給出替代做法
- 🔴 **徽章隱藏了，所以必須顯示 Google 指定的聲明文字**（含隱私權政策與服務條款兩個連結）。
  這是使用條款的要求，不是可選的 —— **拿掉聲明就不可以隱藏徽章，兩者是一組的**。
  隱藏的理由是版面：徽章固定在右下角，與浮動諮詢鈕（`.c-consult`）會疊在一起
- ⚠️ **徽章用 JS 隱藏，不是 CSS。** 這條規則沒有地方可以放：`mockup/` 不進版控
  （STATUS.md §八 技術債），而 `verify:css` 禁止 `app/` 底下有自己的樣式表或 `<style>` 區塊 ——
  寫進 `base.css` 的話，別人 clone 下來根本沒有那一行

### 🚨 緊急逃生口

若 reCAPTCHA 讓所有人都登不進後台（Google 有狀況、金鑰設錯、script 被擋），
把 Function App 的 **`BotCheck__SecretKey` 清空**即可立刻放行，**不需要重新部署**。
次數限制那一道不受影響。
