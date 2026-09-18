# 10 — API 契約

> 本文件規範**寫什麼**（端點、形狀、權限）；**怎麼寫**見 [11-backend-design.md](11-backend-design.md)。
>
> 資料表與欄位定義以 [08-database.md](08-database.md) 為準；後台功能語意以 [02-backend-cms.md](02-backend-cms.md) 為準。

---

## 1. API 只有一處：`functions/`

🔴 **2026-09-16 起只有一個 API。** 舊敘述「兩處 API，能力與職責完全不同」**已作廢**
（CLAUDE.md 決策 7）。

`functions/` → **`api.20skin.tw`**（獨立 Azure Functions App）：
.NET 10 isolated ＋ EF Core（寫入）＋ Dapper（讀取）、Managed Identity 連 SQL 與 Blob、
HTTP 上限 230 秒、有 Timer trigger。**前台、後台與爬蟲要的一切都在這裡。**

⚠️ **原本還有一個 `api/`（SWA Managed Function，只有 `fallback` 一支），整支已刪除。**
它與 Nuxt 的 SSR function 互斥 —— 兩者都要佔 SWA 的 `api_location`，而前台改成執行期
SSR 之後那個位置給了 Nuxt。它負責的 1000 條 301 改由前台的 `pages/[...slug].vue`
查 `GET /redirects/resolve`。

⚠️ 連帶的收穫：**路徑正規化從兩份變一份**。原本 `api/Fallback.cs` 與
`RedirectHandler.NormalizePath` 各有一份，兩邊分岔的症狀是「後台看得到規則，但線上不轉址」。

⚠️ 那個位置現在跑的是 Node 22（Nuxt），所以 SWA managed function 的 .NET 版本上限
（`dotnet-isolated:9.0`）已不再是這個專案的限制。

🔴 **前台每一個請求都會打這個 App**，它不再只是後台的後端 —— 它掛掉等於全站 503
（前台以 5xx 表達，不會退化成 404 或空頁面，見 CLAUDE.md 決策 14）。

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
| `AI_UNAVAILABLE` | 503 | AI 問答暫時不能用：模型服務連不上／逾時／金鑰未設定／語料索引尚未建立。🔴 **「答不出來」不是這一個** —— 那是 200 配 `answered: false`（見 §3.1 的 `POST /ai/ask`） |
| `INTERNAL` | 500 | 未預期例外，**不得洩漏堆疊** |

新增錯誤碼時同步本表與 `Common/ErrorCodes.cs`。

---

## 3. 端點群組

### 3.1 公開（匿名，前台用）

🔴 **2026-09-16 起前台是執行期 SSR，這一區從四支變成一整套**（CLAUDE.md 決策 6）。
舊敘述「沒有前台內容端點，資料在建置期烤進 HTML」**已作廢**。

#### 動作類（使用者觸發）

| 端點 | 說明 |
|---|---|
| `GET /health` | 冒煙測試用。兩條 workflow 的部署後檢查都打它 |
| `POST /contact` | `/contact/` 表單。**只寄通知信，不落庫**（[02](02-backend-cms.md) §2）。回應不帶任何內部 Id |
| `POST /questions/miss` | 站內搜尋查無結果時回寫一筆到 `QuestionInbox`（[08](08-database.md) §F）。去重由伺服器端做。🔴 **只有 `GET /search` 正常回應、而且真的零筆時才送** —— 連不上時送出等於把故障寫成一堆假問題，而去重會讓它們留下來。⚠️ **AI 問答不走這一支**：那邊伺服器自己就知道有沒有命中，回寫在 `AiHandler` 內完成（讓前台再打一次等於多一次機器人驗證與一次頻率限制計數，而且內容可被偽造） |
| `POST /ai/ask` | 站內 AI 問答（[04](04-ai-faq.md) §4、CLAUDE.md 決策 28）。請求 `{ question(1–300 字), history?[{role,text}], botCheckToken }`；回應 `{ answer, answered, sources[{title,url,kind}], handoff{needed,reason}, disclaimer }`。<br>🔴 **`answered: false` 也是 200** —— 答不出來是一個成功的回答，用 4xx 表達會讓前台顯示成錯誤。<br>🔴 **模型看不到任何網址**：片段在 prompt 裡是 `[S1]`、`[S2]`，模型回一行 `SOURCES: S1,S3`，由伺服器對映回 `urlPath` —— 它不可能捏造連結。<br>⚠️ **不存對話**（[08](08-database.md) §I），多輪由前台帶 `history`，伺服器只取最後 4 則且明確標注「不得作為事實來源」。<br>⚠️ 前台一律依 `handoff.reason` 分支文案（`no_match`／`out_of_scope`／`needs_doctor`／`upstream_error`），不比對 `message` |

⚠️ **這兩支是對公網開放的寫入端點**，必須有 rate limit ＋ 機器人驗證（§5）。
`/contact` 另須記錄隱私同意時間 —— 但**只在寄出的通知信裡帶，不入庫**。

#### 內容讀取（前台每一頁都會打）

| 端點 | 說明 |
|---|---|
| `GET /{unit}` | 九個單元的列表。⚠️ **`article` 會自動分頁**（每頁 12、上限 100）—— 1100 筆一次送出沒有任何呼叫端需要。支援 `?sort=latest`、`?categoryTermId=`、`?tagTermId=`、`?authorDoctorId=` |
| `GET /content?path=…` | 依網址取單筆，**含內文**。網址全站唯一（[08](08-database.md) §B-1），所以這是內頁最直接的查法 |
| `GET /content/batch?ids=…` | 依 id 批次取（上限 100）。給「關聯目標需要的欄位不只標題」用 —— 療程卡片要關聯文章的封面與日期，而 `relations[]` 只帶 slug／title／urlPath |
| `GET /article/popular-tags?limit=` | 側欄熱門標籤，**依實際引用篇數在 SQL 層聚合** |
| `GET /home` | 首頁七個版位。🔴 讀的是**首頁那筆 Page 已核准版本的快照**，不是 `HomeSections` 即時表（[08](08-database.md) §G-2） |
| `GET /menu` | 導覽選單與頁尾。`linkKind=1` 的網址由 `ContentItems.UrlPath` 決定，不另存一份 |
| `GET /redirects/resolve?path=…` | 舊網址解析。**單筆 seek**，命中回 `{ toPath, statusCode }`，未命中 404 |
| `GET /search?q=` | 站內搜尋。回 `[{ t, u, ti, ex }]`（型別標籤／網址／標題／摘要）。對**已核准版本快照**做 `LIKE` 子字串比對，標題命中排前面。🔴 **不設筆數上限** —— 前台有型別篩選 tab 的筆數，任何上限都會讓那些數字變成謊話，而排序讓截斷變成整類整類地砍掉（[09](09-frontend.md) §4）。上限是語料本身（約 1228 筆／309 KB） |
| `GET /site-settings/public` | 只回前台需要的鍵：站名、描述、**AI FAQ 啟用開關**、面板文案、轉真人出口。🔴 **收件信箱、追蹤碼等內部設定一律不外露** —— 這一區加東西等於對全世界公開 |

⚠️ **回傳的是版本快照本身，不另外定義一組公開 DTO。** 那是刻意的：
`tools/content-export` 產出的形狀就是前台 `app/data/_content.ts` 的契約（`ContentRecord`）。
再定義一份等於把同一個形狀維護兩次，而兩邊分岔時不會有任何錯誤訊息。
⚠️ 這**不是**在外洩內部格式 —— 那份快照在靜態時代就已經整包內聯進產物、隨每一頁送到瀏覽器。

⚠️ **每一筆都帶 `indexable`**：「內容夠不夠實在，值得被索引嗎」。
🔴 前台的 `noindex` 與 sitemap 的收錄範圍**讀同一個值**（`Common/Indexability.cs`）——
兩邊各判一次的下場已經發生過：2026-09-15 發現 sitemap 收了 29 個 `noindex` 網址。

#### SEO 產物

| 端點 | 對外路徑 |
|---|---|
| `GET /seo/robots.txt` | `/robots.txt` |
| `GET /seo/sitemap.xml` | `/sitemap.xml` |
| `GET /seo/sitemap/{key}` | `/sitemap-{key}.xml`（五個分檔） |
| `GET /seo/llms.txt` | `/llms.txt` |
| `GET /seo/llms-full.txt` | `/llms-full.txt` |
| `GET /seo/faq.json` | `/faq.json` |

⚠️ **由 Nuxt 的 server route 同源代理出去**，不是讓爬蟲直接打 api 網域 ——
sitemap 必須與它收錄的網址同一個 origin，否則 Search Console 會整份忽略。
⚠️ **格式走 `Common/ExportFormats.cs`**，與建置期匯出工具共用同一份原始碼
（`<Compile Include>`）。在前端重寫一次 XML 產生器就是第二份。
⚠️ **`origin` 由呼叫端帶**（Nuxt 從請求推導）—— 正式站、測試站與 SWA 預覽環境是三個主機名。
🔴 這是 2026-09-16 的直接教訓：把主機名寫死成 `https://20skin.tw` 讓正式站的 sitemap 變成空的。
⚠️ **`robots.txt` 的設定被清空時回 404，不要送出空檔案** —— 空的 robots.txt 與「沒有這個檔案」
對爬蟲的意義不同。

### 3.2 認證

| 端點 | 說明 |
|---|---|
| `POST /auth/login` | body 為 `userName` ＋ `password`。**登入識別不是 email**（[08](08-database.md) §A-1）。**單段驗證** —— 通過就直接發 access ＋ refresh token，沒有雙因素（2026-09-11 院方決定） |
| `POST /auth/refresh` | refresh token 輪替（見 §5 待確認） |
| `POST /auth/logout` | 撤銷該 refresh token |
| `POST /auth/change-password` | 需有效 token，**不需權限碼** —— 它改的是自己的密碼，與任何後台權限無關 |

登入與換發成功的回應體：`accessToken`／`refreshToken`／`userId`／`userName`／`doctorId`／`displayName`／`roles[]`／`permissions[]`／`isSuperAdmin`／`mustChangePassword`。

> 🔴 **2026-09-17：「首登強制改密碼」整套不做了**（Tim 指定：「密碼設定好就好，管理者不用再另設」）。
> 管理者在帳號管理填的那一組就是最終密碼；新增與重設帳號一律把 `MustChangePassword` 寫成 `false`，
> `AppRouter` 那道 403 `AUTH_MUST_CHANGE_PASSWORD` 的閘也移除了。
> ⚠️ **閘要跟畫面一起拿掉。** 只拿掉登入頁那一關的話，舊資料裡旗標仍是 1 的帳號會登得進來、
> 然後每一支端點都回 403，而畫面上沒有任何東西解釋得了為什麼。
> ⚠️ `mustChangePassword` 這個回應欄位與資料表欄位**保留但已惰性**（拆掉要一支 migration），
> **不要再拿它擋人**。後台的帳號清單也已經拿掉對應的「密碼」欄。
> ⚠️ 密碼長度下限由 **8 改為 6**（`AccountHandler.MinPasswordLength` ＝ `apps/admin/src/validation.ts`
> 的 `MIN_PASSWORD_LENGTH`，**兩邊要一起改**）。

⚠️ **`userId`／`userName`／`doctorId` 由回應體直接給，前端不解 token。** access token 是自簽 JWT，要前端自己 base64 解 payload 等於讓它依賴 token 的內部格式，換簽章方式時會無聲壞掉。
⚠️ **`permissions[]` 是前端唯一的權限依據。** 角色權限可以在後台改（`PUT /admin/role/{id}/permissions`），前端若自己用角色推導一份，改完的那一刻就過期了 —— 而且不會有任何徵兆。

🔴 **`POST /auth/login` 的次數限制是後台唯一的硬防線**：**只以帳號計數**（2026-09-14 院方決定拿掉來源 IP 維度），鎖定事件**即時寄出告警信、不留存紀錄**（[02](02-backend-cms.md) §4、[08](08-database.md) §I）。告警信裡仍會寫出來源 IP，但那只是線索，不代表那個 IP 被鎖。
⚠️ **連帶缺口**：同一個 IP 輪流試多個帳號（密碼噴灑）碰不到任何一個帳號的門檻，次數限制擋不到。擋它的只剩 §5.1 的 reCAPTCHA v3 —— 而 v3 是分數制、連不上 Google 時放行。
原規劃三道防線都不在了：IP 白名單不做（2026-08-13）、**雙因素不做（2026-09-11）**，而後台路徑 `/admin/` 是客戶指定、公開可猜。**帳密成為唯一憑證**。
⚠️ 密碼長度下限 6 碼（2026-09-17 由 8 調降，Tim 指定），且不再強制首登更換 —— 輪替規則仍未訂定。

### 3.3 後台：九個內容模型

`{unit}` 為單元代號，**與權限碼前綴逐字對應，不做單複數轉換**：

`treatment`／`doctor`／`concern`／`article`／`case`／`faq`／`clinic`／`page`／`term`

| 端點 | 權限碼 | 說明 |
|---|---|---|
| `GET /admin/{unit}` | 登入即可 | 清單。共同參數 `page`／`pageSize`／`status`／`categoryId`／`keyword`／`ownerUserId`。**`term` 另支援 `termType`**（1 療程分類／2 文章分類／3 FAQ 分類／4 文章標籤）—— 那一張表混了四種東西，實測 406 筆裡 393 筆是標籤，沒有它就找不到那 4 筆療程分類。⚠️ 其餘單元忽略此參數（只有 `Terms` 有這個欄位）；值域外當成「不篩」而不是 400 |
| `GET /admin/{unit}/{id}` | 登入即可 | 單筆（含 `SeoMeta`、關聯、`BodyBlocks`） |
| `POST /admin/{unit}` | `content.{unit}.edit` | 新增 |
| `PUT /admin/{unit}/{id}` | `content.{unit}.edit` | 更新本文 |
| `PUT /admin/{unit}/{id}/seo` | **`seo.edit`** | **只寫 `SeoMeta`。** 行銷角色的落點 —— 可改全站 SEO 欄位，不可改醫療敘述本文（[02](02-backend-cms.md) §4） |
| `PUT /admin/{unit}/{id}/relations` | `content.{unit}.edit` | 關聯（療程↔困擾↔文章↔FAQ↔醫師），寫 `ContentRelations` |
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

### 3.4 後台：站台編排與系統

> 🔴 **2026-09-17：送審與審核佇列的四支端點整個刪除**（Tim 指定，CLAUDE.md 決策 20）：
> `POST /admin/{unit}/{id}/submit`、`GET /admin/review`、`POST /admin/review/{id}/approve`、
> `POST /admin/review/{id}/reject`。`ReviewHandler`、`ReviewReadService`、後台的審核佇列畫面
> 也一併移除。
> ⚠️ **為什麼不能只留端點不留畫面**（與「版本歷程」那次的取捨相反）：送審會把內容推進
> `Status = InReview`，而那個狀態下 API 一律拒絕更新 —— 沒有核准端點的話，內容會卡死在
> 一個**編不了也上不了線**的狀態。
> ⚠️ 既有卡在 `InReview` 的資料仍救得回來：`PATCH .../publish` 不檢查來源狀態。
> ⚠️ `ContentReviews` 這張表**保留**（沒有人再寫入），拆表要一支 migration 而它不佔執行期成本。

| 端點 | 權限碼 | 說明 |
|---|---|---|
| `GET /admin/dashboard` | 登入即可 | 聚合查詢，**無專屬資料表**。只回九個單元 × 四態的筆數矩陣（「待審核」「近期送審」「我的退件」三段隨審核佇列一起移除） |
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
| `GET /admin/risk-term` | **登入即可** | 啟用中的高風險字詞清單，供編輯器即時提示（[02](02-backend-cms.md) §5）。⚠️ **是提示不是閘門** —— 送審時伺服器仍會自己重掃一次，前端掃到什麼不影響能不能送審，兩邊結果不一致也不是錯誤 |
| `GET /admin/export/{kind}` | `settings.edit` | 預覽 `faq.json`／`llms.txt`／`llms-full.txt`。**實際產物在建置期產生**，此端點只供後台畫面預覽（[07](07-deployment.md) §4） |

**未列於上表的 `/admin/*` 路徑一律拒絕（403）。** 新增後台端點時必須同步補進路由表與權限表兩處（[11](11-backend-design.md) §5.3）。

🔴 **上傳沒有清單與刪除端點**（2026-09-11 定案不做媒體庫）。`GET /admin/media`、`DELETE /admin/media/{id}` 這類端點**不存在，也不要補回來** —— 圖片是內容欄位的一部分，它的建立、修改與刪除全部隨所屬內容的 `PUT`／`DELETE` 發生（[08](08-database.md) §0 決策四、[11](11-backend-design.md) §9）。SEO 區塊的 OG 圖同理，欄位名是 `ogImage`，值是同一個圖片值物件，不是 `ogImageMediaId`。

---

## 4. 權限碼與四種角色

🔴 **權限碼的權威是 [08-database.md](08-database.md) §A-2**，種子在 `functions/Data/Seed/SeedData.cs`（28 列）。

> 🔴 **2026-09-17：送審那一層整個移除**（Tim 指定，CLAUDE.md 決策 20）。
> 連帶三件事，**都不是漏寫**：
> ① 權限碼由 31 變成 **28** —— `content.submit`／`review.approve`／`review.reject` 刪除；
> ② 角色由 5 變成 **4** —— 「審核者」刪除；
> ③ **「內容編輯」拿到九個 `content.{unit}.publish`**，因為握有 publish 的角色只有審核者，
> 不移交的話全院只剩超級管理員能讓任何內容上線。
> ⚠️ 權限碼的 **Id 沒有往前補**，19–21 留成空號（理由見 `SeedData.CrossUnitPermissions` 的註解：
> `RolePermissions` 是後台畫面改得動的資料，renumber 會靜默改變既有列的意義）。

> ⚠️ 本節初版寫成 `{unit}.{action}`（如 `treatment.edit`／`treatment.publish`），
> 與 08 §A-2 相衝，**已於 2026-09-11 更正為下表**。
> 若在任何地方看到 `{unit}.view`／`{unit}.delete`／`review.decide`／`user.*`／`role.*`／
> `question.*`／`rebuild.trigger`／`setting.*`／`home.edit`，那是舊命名。
> `apps/admin/src/permissions.ts` 已於 2026-09-12 同步為下表，**而且不再自己推導**——
> 它查的是登入回應帶回來的 `permissions[]`（見 §3.2）。

28 個權限碼：

| 群組 | 權限碼 |
|---|---|
| 內容 | `content.{unit}.edit`、`content.{unit}.publish`（九個單元各一對，共 18） |
| SEO | `seo.edit`、`redirect.manage` |
| 分類與標籤 | `taxonomy.tag.create`、`taxonomy.category.manage` |
| 頁面 | `page.legal.edit` |
| 站台編排 | `home.arrange`、`menu.edit`、`settings.edit` |
| 系統 | `account.manage`、`upload.file` |

⚠️ **沒有獨立的 `view` 權限碼。** 讀取端點是「登入即可」—— 能編輯就看得到，
行銷靠 `seo.edit` 進來。**刪除用 `content.{unit}.edit`**，
不另設 `delete`（docs/08 §A-2 的 28 列裡沒有這兩種）。

| 角色 | 權限 |
|---|---|
| **超級管理員** | 全部 28 個 |
| **內容編輯** | 九個 `content.{unit}.edit` ＋ **九個 `content.{unit}.publish`** ＋ `seo.edit` ＋ `taxonomy.tag.create` ＋ `home.arrange` ＋ `upload.file` |
| **醫師** | `content.doctor.edit`／`content.article.edit`（**僅 `OwnerUserId` 是自己的**）＋ `upload.file` |
| **行銷** | `seo.edit` ＋ `content.faq.edit` ＋ `upload.file`。**沒有其他 `edit`** |

🔴 **「發布權與編輯權分離」2026-09-17 起不再成立。** 舊敘述「這是三段式工作流的前提，
療程、案例、FAQ 三類內容不得跳過審核直接上線」**已作廢** —— 內容編輯現在自己就能發布。
這是刻意的取捨（見上方方框），不是漏改。
⚠️ [02](02-backend-cms.md) §5 的兩層防護只剩第二層（高風險字詞提示）。
醫療廣告法規相關敘述請以主管機關函釋及院方法務意見為準。

⚠️ **設定類不走審核，儲存即生效，而且沒有留痕**（不做操作日誌，2026-09-11 定案）。`SiteSettings`、`MenuItems`、`RolePermissions` 與帳號異動誰改了什麼，事後查不到，唯一控管是「限超級管理員」這道權限門檻（[08](08-database.md) §I）。

---

## 5. 待確認

| 項目 | 說明 |
|---|---|
| ~~**機器人驗證供應商**~~ | ✅ **已定案（2026-09-12）：reCAPTCHA v3。** 規格見下方 §5.1 |
| **`RefreshTokens` vs 短效 JWT ＋ `SecurityStamp`** | [08](08-database.md) §L 已列為二選一。建議 `RefreshTokens` ＋ rotation（撤銷重用即撤銷該使用者全部 token），因為後台要能「停用帳號後立刻踢下線」 |
| ~~**AI FAQ 的問答端點**~~ | ✅ **已定案（2026-09-18）：`POST /ai/ask`**，契約見 §3.1。舊敘述「本期不做、不要先在契約裡留 `/ai/chat`」**已作廢**。⚠️ 但「不為它加 schema 欄位」那半仍然成立 —— 索引狀態存在 Blob 的 manifest，**整套 0 支 migration**（CLAUDE.md 決策 28） |
| **`GET /site-settings/public` 是否必要** | 見 [09](09-frontend.md) §13 —— 與「開關烤進 build」取捨 |

---

## 5.1 機器人驗證：reCAPTCHA v3（2026-09-12 定案）

套用於三支對公網開放的寫入端點：`POST /contact`、`POST /questions/miss`、`POST /auth/login`。
請求欄位一律是 **`botCheckToken`**，前端動作名稱一律是 **`contact`／`questions_miss`／`login`／`ai_ask`**。

🔴 **action 名稱只能包含 `A-Za-z/_`** —— 不可有連字號或數字。帶了不合法的字元時
`grecaptcha.execute` **不會丟例外**，只在 console 印一行 `Invalid action name` 然後
把 action 丟掉，伺服器端的比對就永遠對不上，而使用者看到的是一般的「自動化驗證未通過」。
2026-09-14 對正式環境做端到端時才抓到（原本是 `questions-miss`）。
前端兩支取 token 的模組已加上格式檢查，不合法會當場丟例外。
⚠️ `/questions/miss` 的**速率限制鍵**仍是 `questions-miss`（`LoginThrottles` 裡的既有資料列），
與 action 名稱刻意不同名 —— 改它等於把已累積的計數丟掉。

⚠️ **AI 問答有自己的配額**：bucket `ai-ask`，預設 **20 次／10 分鐘**
（`RateLimit__PublicQuota__ai-ask__MaxRequests`／`__WindowMinutes`）。
表單那組「5 次／10 分」會在第一段對話中途就把使用者鎖住 —— 一段真實對話是 3–8 輪。
🔴 **超限後鎖一整個視窗**（不是「等下一次就好」），所以前台的文案要寫「約 10 分鐘後可再試」。

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
- `/auth/login` 擋下＝**後台整個登不進去**。而登入真正的硬防線是次數限制（**只以帳號計數**，[02](02-backend-cms.md) §4），那一道不受 Google 影響

⚠️ 所以「放行」**只發生在傳輸層失敗**。Google 明確回答「這不是人」時一律擋下，兩者不可混為一談。
⚠️ 每一次放行都記 `Warning` —— 沉默的放行等於沒有防護。

⚠️ **對外的錯誤訊息一律是同一句**，不透露是分數太低、token 過期還是 action 不符 ——
那些差別對真人沒有用，對想繞過的人很有用。細節只進 log。

### 前端

- **site key 是公開值**（`NUXT_PUBLIC_RECAPTCHA_SITE_KEY`／`VITE_RECAPTCHA_SITE_KEY`），
  本來就會出現在 HTML 裡。要保密的是 secret key，那個只在 Function App 的 app settings
- 🔴 **token 在「送出的那一刻」才取。** 效期只有 2 分鐘 —— 頁面載入時就取的話，
  使用者慢慢填完再送出時早就過期，而錯誤訊息會指向「自動化驗證未通過」，查不到真正的原因
- 🔴 **Google 的 script 只在需要的頁面載入。** 前台 1845 頁，只有 `/contact/` 與 `/search/`
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
