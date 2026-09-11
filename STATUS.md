# 專案進度總表

> **這份文件是「做到哪裡了」的單一真相來源。** 每完成一項就更新對應那格。
>
> 分工：本檔記錄**狀態**；[`docs/`](docs/README.md) 的十二份文件記錄各領域的**規格與施工標準**；
> [`CLAUDE.md`](CLAUDE.md) 記錄**專案規範、關鍵數字與已定案決策**。三份不要互相抄，各司其職。

**最後更新**：2026-09-11

---

## 一句話現況

**規劃、前台、後台、資料庫、API 全部完成，且已實際部署到 Azure 的正式環境（尚未切 DNS）。**

`apps/web` 的 21 個模板全數完成（220 條預渲染路由），`apps/admin` **30／30 個畫面全數完成**。
**資料庫 schema 也完成了** —— 35 張表的 EF Core migration 已在真的 SQL Server 2022 上
實測建立成功，種子資料 165 列。

**API 也完成了** —— 35 張表 ＋ 全部端點 ＋ 三支 Timer，已在本機對真的 SQL Server 2022
跑過端到端驗證（登入、首登強制改密碼、預設拒絕授權、九個內容單元的清單）。

⚠️ **2026-09-11 改動：不做媒體庫**（客戶指定）。後台的「媒體庫」畫面整個拿掉（31 → 30），
`MediaAssets`／`MediaUsages` 兩張表刪除（37 → 35），圖片改成擁有者表上的內嵌欄位。
遷移 `20260911100157_RemoveMediaLibrary` **已套用到正式 Azure SQL**（2026-09-11，本機 `efbundle`）。
🔴 **但正式 Function App 還是舊組建，尚未重新部署** —— 見 §六。
決策與連帶後果見 CLAUDE.md 決策 13。

**已部署並驗收** —— <https://jolly-hill-015d56f1e.5.azurestaticapps.net>。
本次補建了 CLAUDE.md 決策 7 當中先前**完全沒有建立**的另一半 API：
`api/`（SWA Managed Function，`/api/fallback`，約 770 條 301 的落地位置）。

**剩下三個缺口**：前後台接的仍是 localStorage mock（前端還沒接上 API）、
`Redirects` 表 0 列（真實 301 清單未匯入）、CI workflow 未進 repo（目前靠本機腳本部署）。

---

## 圖例

| 記號 | 意思 |
|---|---|
| ✅ | 完成且驗證過 |
| 🟡 | 部分完成／有已知缺口 |
| ⬜ | 未開工 |
| 🔴 | 被擋住，需要外部輸入 |
| ⛔ | 本期不納入（已決策） |

---

## 一、總覽

| 階段（[05-roadmap](docs/05-roadmap.md)） | 狀態 | 備註 |
|---|---|---|
| 現況診斷與資訊架構 | ✅ | [00](docs/00-site-audit.md)、[01](docs/01-sitemap.md)。約 950 URL、約 770 條 301 |
| UI/UX 設計定稿 | ✅ | `mockup/` 方向 A，客戶 2026-08-27 選定。21 個模板全數完成 |
| 技術架構與規格 | ✅ | [07](docs/07-deployment.md) 部署、[08](docs/08-database.md) 資料庫、[09](docs/09-frontend.md) 前端、[10](docs/10-api.md) API 契約、[11](docs/11-backend-design.md) 後端施工標準 |
| **前台開發** | 🟡 | 21 個模板切版完成、SEO 與 JSON-LD 落地；**內容仍是 `app/data/*.ts`，未接資料庫**（§二） |
| **後台開發** | 🟡 | **30／30 畫面完成**；接 mock，未接 API（§三） |
| **資料模型與 migrations** | ✅ | 35 張表 ＋ 種子，**已對真 SQL Server 實測建立成功**（§四），兩支遷移**都已套用到正式庫**（§六） |
| **API** | ✅ | 端點、服務、三支 Timer 完成，**已對真 SQL Server 端到端驗證**（§五） |
| 部署與 CI/CD | 🟡 | **已部署並實測**（前台 ＋ 後台 ＋ 兩個 API）；workflow 未進 repo，目前靠 `tools/deploy-swa.sh` 本機部署（§六） |
| 內容遷移（約 800 篇） | ⬜ | 需先有資料庫 |
| 療程內容（27 項，12 項從零寫） | 🔴 | **需醫師投入，Phase 1 最大瓶頸** |
| 上線前驗收 | ⬜ | checklist 見 §七 |
| — 線上購物／線上預約 | ⛔ | 僅外部導流連結（CLAUDE.md 決策 4） |
| — 多語系 | ⛔ | 單一語系繁中（決策 12） |
| — 操作日誌 | ⛔ | 2026-09-11 定案不做（[08](docs/08-database.md) §I） |
| — 後台 IP 白名單 | ⛔ | 院方決定不做（2026-08-13） |
| — 後台雙因素 | ⛔ | 院方決定不做（2026-09-11）。🔴 **連帶後果見 §八** |
| — AI 問答功能本體 | ⛔ | 本期只交付介面，且預設關閉（[04](docs/04-ai-faq.md) §4） |

---

## 二、前台（`apps/web`）🟡

Nuxt 3 純靜態，21 個模板 → **220 條預渲染路由、106 頁 HTML**。

### ✅ 已完成

| 項目 | 說明 |
|---|---|
| 21 個模板 | 首頁、療程 ×3、困擾 ×2、案例 ×2、醫師 ×2、據點 ×2、文章 ×2、品牌 ×2、FAQ ×2、聯絡、搜尋、404、法務 |
| 共用外框 | Header／Footer／浮動諮詢面板，標記照抄 `mockup/` |
| 動效系統 | `mockup/assets/app.js` 原樣載入（客戶指定保留，CLAUDE.md 決策 11） |
| SEO | 逐頁 Title／Meta／canonical／OG／JSON-LD；8 類 schema 依模板分派；麵包屑全站 |
| **`verify:css`** | 樣式與 mockup **逐 byte 相同**、前台零自建樣式、零發明 class（29 個元件 × 21 頁 mockup 標記） |
| **`verify:links`** | 掃產出的 HTML，6134 個站內連結**零斷鏈** |
| 產物大小閘 | 14.7 MB（350 MB 警告／450 MB 擋下，對應 SWA **Standard** 的 500 MB） |
| 404 落點 | postbuild 把 `404/index.html` 複製成根目錄 `404.html`（`api/fallback` 要讀它） |

### 🟡 有缺口

| 缺口 | 說明 |
|---|---|
| **內容在 `app/data/*.ts`，不是資料庫** | 建置期匯出（`content/*.json`）未實作，見 [09](docs/09-frontend.md) §3 |
| **26 個療程頁沒有內容** | 顯示「內容建置中」，已加 `noIndex` 且不輸出 `MedicalProcedure`。正式站這些是草稿，根本不會產生該頁 |
| **文章只有 11 篇、全屬「醫美新知」** | 其餘三個分類顯示空狀態。三個空分類的 Hero 文案是改寫的通用句，**待院方補真文案** |
| **案例只有 1 則有內頁** | 其餘 9 則維持 `href="#"` —— 捏造個案差異聲明與同意書索引是法規紅線 |
| **7 個困擾頁只有一句話簡述** | AI 摘要 30–38 字（規範 40–60），沒有為了湊字數編醫療內容 |
| **服務條款、醫療免責聲明無條文** | 「待院方法務提供」骨架 ＋ `noIndex` |
| 站內搜尋 | 只有版面與空狀態，建置期索引未做 |
| `/contact/` 表單 | 只有版面，送出留成 TODO，不假裝成功 |
| `sitemap.xml`／`llms.txt`／`faq.json` | 建置期腳本未實作 |
| 237 個 `href="#"` | mockup 遺留的佔位連結，`verify:links` 會列出數量，不會無聲增加 |

---

## 三、後台（`apps/admin`）🟡

Vite ＋ Vue 3 的 SPA，`base=/admin/`，build 產物寫進 `apps/web/public/admin/`。
⚠️ **建置順序：先 admin 後 web。**

### ✅ 已完成（30／30 畫面）

| 群組 | 畫面 | 數 |
|---|---|---|
| 內容模型 | 九個模型 ×（列表＋編輯），共用 `ListPage`／`EditPage` ＋ 單元宣告 | 18 |
| 帳號 | 登入（單段帳密）、帳號管理、角色權限設定 | 3 |
| 工作流 | 審核佇列 | 1 |
| FAQ 題庫 | 未命中題目清單 | 1 |
| SEO | sitemap 設定、301 轉址管理、FAQ／語料匯出 | 3 |
| 系統 | 儀表板、全站設定、首頁版位編排、導覽選單與頁尾 | 4 |

機制面已實作：工作流四態（**「已排程」是推導狀態，不是第五種**）、發布權與編輯權分離、
醫師只能改自己的內容、行銷只能改 SEO 區塊、共用 SEO 區塊、版本歷程與還原、
送審時掃高風險字詞、權限矩陣（五角色 × `{unit}.{action}`，畫面上的矩陣由
`permissions.ts` **推導**而非另抄一份）、發布聚合重建示意、301 的 CSV 匯入匯出
與衝突／迴圈檢查、robots.txt 的 `Disallow: /admin` 防呆、NAP 一致性比對。

### 🟡 有缺口

| 缺口 | 說明 |
|---|---|
| **接的是 mock**（localStorage） | `src/api/client.ts` 是唯一門面，接 API 時只改這一個檔 |
| 上傳未串接 | `adminApi.upload.upload()` 刻意丟 TODO，不假裝成功。圖片欄位先以「貼上網址」示意（`ImageField.vue`） |
| 富文本 | 等寬文字框模擬，未接區塊編輯器 |
| 拖曳排序 | 現為上／下移動按鈕 |
| slug 唯一性 | mock 只檢查單元內；正式是全站 `UrlPath` 唯一索引 |
| **首頁版位的送審不進共用審核佇列** | mock 的各區 store 是分開的，而審核佇列的資料在 `client.ts` 裡。審核者要直接在首頁版位頁面核准／退回。**接上真 API 後自然消失**（後端本來就是同一張 `ContentReviews`） |
| **登入帳密與帳號管理是兩份資料** | `client.ts` 的 `auth.login()` 讀 `MOCK_USERS`，帳號管理操作自己的 store。在後台停用帳號不影響那組帳密還能不能登入。同上，接 API 後合一 |
| 301 種子約 772 筆，其中約 689 筆是合成佔位 | 文章內頁的舊網址型態**尚未確認**（[07](docs/07-deployment.md) §2 的 🔴 待補資料）。功能是真的，但**不要拿這份 mock 當「已核對清單」**，也**不要匯入正式庫** —— 資料庫的 `Redirects` 目前是 0 列（§六） |
| NAP 一致性用名稱字串比對 | 不是外鍵。據點名稱打錯字會誤判成「找不到對應據點」而非「不一致」。正式 API 上線後建議改 FK |

**mock 帳號**：`sa`／`Admin@123`、`editor1`／`Editor@123`、`doctor1`／`Doctor@123`、
`marketing1`／`Marketing@123`、`reviewer1`／`Reviewer@123`

---

## 四、資料模型 ✅

**35 張表的 EF Core migration 完成，已對真的 SQL Server 2022 實測。**
schema 的真實來源是 `functions/Data/Migrations/`（docs/07 §5）。

| 單元 | 張數 |
|---|---|
| A 帳號與權限 | 7 |
| B 內容主幹（工作流／版本／SEO） | 5 |
| C 九個內容模型（TPT） | 16 |
| D 內容關聯 | 1 |
| E 上傳 | **0** —— 不做媒體庫，圖片是內嵌欄位（docs/08 §0 決策四） |
| F FAQ 題庫成長 | 1 |
| G 站台編排 | 4 |
| H SEO 與 301 | 1 |

### ✅ 實測驗證過的（不是只有產得出 SQL）

| 項目 | 結果 |
|---|---|
| 建立 35 張表 | ✅ 對 `Skin20_Verify`（定序 `Chinese_Taiwan_Stroke_CI_AS`）實跑成功 |
| **兩支遷移接續套用** | ✅ 2026-09-11 對 `Skin20_MediaVerify` 實跑：`InitialSchema` → `RemoveMediaLibrary`，結果 35 張表、0 個媒體殘留、10 個內嵌圖片欄位 |
| 約束名稱重複 | **0**（TPT 的 PK 命名坑已避開，見下） |
| 匿名 DEFAULT 約束 | **0**（20 個具名 `DF_`） |
| `UrlPath` 全站唯一 | ✅ 實測插入重複網址被擋下 |
| `ContentType` 值域 | ✅ 實測插入 99 被 CHECK 擋下 |
| 「退回必填原因」 | ✅ 實測 `Status=3` 未填 `DecisionNote` 被擋下 |
| BIN2 定序 | ✅ `Slug`／`UrlPath`／`Redirects.FromPath`／`ToPath` 四欄逐欄套用 |
| 複合外鍵 | ✅ `ContentRelations` 兩條指向 `(Id, ContentType)` 替代索引鍵 |

### ✅ 種子資料（165 列，順序依 docs/08 §J-4）

角色 5／權限碼 31／角色權限 65／使用者 1／分類 13／頁面 17／版位 7／選單 13／設定 15／風險字詞 25

三個關鍵值已實測確認：**AI FAQ 開關＝關閉**、**外部網域只有 2 筆**（`booking` 與 `shop`，
整個 schema 的唯一落點）、**內容編輯的 `*.publish` 權限＝0**（發布權與編輯權分離）。

### 🔴 一個假設，需要你追認

**FAQ 五大分類的種子用了 `mockup/16-faq.html` 那一組**（`treatment`／`aftercare`／`visit`／
`fee`／`clinic`），不是 docs/08 §C-9 的清單。理由寫在 `SeedData.FaqCategories` 的註解裡：
08 那組**沒有 slug**，而 `/faq/{category}/` 需要 slug 才成立；且它有「肌膚困擾」，
與 `/concerns/` 整段重複。**改這裡一處即可切換，但那時已產生的 URL 需要補 301。**

### ⚠️ 踩到並修掉的四個問題

| 問題 | 說明 |
|---|---|
| **10 張表共用 `PK_ContentItems`** | 在 `HasKey()` 上強制命名，TPT 下被九個子表繼承。SQL Server 的約束名稱必須整個 schema 唯一，**migration 建到第二張子表就會失敗**。改為交給 EF 依表名產生 |
| `CS0111` 重複定義 | `PropertyBuilder<string?>` 與 `PropertyBuilder<string>` 在 CLR 層同型別，nullable 註記不影響簽章 |
| `SetValueGenerated` 不存在 | `IMutableProperty` 只有可寫屬性 |
| NuGet 降版 | `Microsoft.Data.SqlClient 6.1.1` 要求 `Azure.Identity >= 1.14.2` |

### ⚠️ docs/08 寫不出來的三處（未自行發明欄位補洞）

1. **`Terms` 的 `UNIQUE (TermType, Slug)` 在 TPT 下無法表達** —— `TermType` 在子表、`Slug` 在父表，
   索引要求同一張實體表。**判定為不需要補**：所有 Term 都有 `UrlPath`，`UQ_ContentItems_UrlPath`
   已保證全站唯一；而原約束想擋的「療程分類與文章分類同名」其實**應該允許**（網址本來就不同）
2. `ContentRelations` 的 `PageToFeatured`（12）**目標型別未指定**，CHECK 暫時放寬為除 Page 外皆可
3. `Pages.ListSortRule` **沒有值域列舉**，只有 tinyint 範圍

### ⬜ 未做

內容匯入（約 800 篇，需先有 API 或直連腳本）、`efbundle` 的 CI 步驟、
本機開發用的 `docker` 建庫腳本（目前是手動指令）

---

## 五、API ✅

`functions/`（.NET 10 isolated ＋ EF Core 10 ＋ Dapper）。**已在本機對真的 SQL Server 2022 跑起來。**

### ✅ 端到端驗證過的（不是只有 build 過）

| 驗證 | 結果 |
|---|---|
| `GET /health` | 200，統一信封 |
| 前台白名單以外的路由 | **404**（當成不存在，不是 401 —— 新端點忘了補白名單會在開發階段就現形） |
| `/admin/*` 未帶憑證 | 401 |
| **未登記於權限表的 `/admin/*`** | **403「此端點未登記於權限表」** —— 預設拒絕生效 |
| 首登（種子密碼） | 200 ＋ `mustChangePassword: true`，**token 照發** |
| 首登後打後台 | **403 `AUTH_MUST_CHANGE_PASSWORD`** |
| 改密碼 → 重新登入 | 旗標清除，後台可用 |
| 九個內容單元的清單 | 全部 200；`term` 13 筆、`page` 17 筆（與種子相符） |
| `GET /site-settings/public` | 200，`aiFaqEnabled = false`（與種子相符） |

### ✅ 組成

| 層 | 內容 |
|---|---|
| `Common/` | `ApiResponse` ＋ `Paging`（上限 100）、`ErrorCodes` ＋ `AppException`、`Clock`、**`Visibility`**、`Constants` |
| `Middleware/` | `ExceptionMiddleware` —— SQL 547／2601／2627 翻成 409 |
| `Functions/` | `RouterFunction` catch-all ＋ **三支 Timer**（排程發布／版本修剪／登入計數清理） |
| `Routing/` | `AppRouter` 三個 partial：分派、前台白名單（**只有四支**）、後台權限表（**預設拒絕**） |
| `Handlers/` | 15 支，涵蓋 docs/10 §3 的全部端點 |
| `Services/` | JWT（手刻 HS256）、登入次數限制（DB 版、雙維度）、通知信、機器人驗證、Blob SAS、重建 |
| `Services/Dapper/` | 10 支純讀 ReadService |

### ⚠️ 整合時修掉的六個問題

| 問題 | 說明 |
|---|---|
| 🔴 **種子帳號永遠登不進去** | 登入在 `MustChangePassword` 時回 403 不發 token，但改密碼端點需要 token —— **死結**。改為照發 token ＋ 旗標，由 Router 擋下其餘端點 |
| 🔴 **`must_change_password` claim 沒有被還原** | token 發得出來、端點也打得通，那道閘**靜默失效**。只有實際跑過才發現 |
| 🔴 **可見性綁在編輯狀態上** | 編輯已上線的療程頁會讓它從網站消失（404）。見下方「架構更正」 |
| **TPT 的 `term.Title`** | `Title` 在父表 `ContentItems`，join `Terms` 讀不到 |
| **沒有分類欄位的單元** | `term`／`page` 沒有 `term` 別名，SELECT 仍寫 `term.Title` → 無法繫結 |
| **路由漏傳 `req`** | `DELETE /admin/user/{id}` 拿不到目前登入者，「不可停用自己」做不出來 |

### 🔴 架構更正：可見性與編輯狀態分開

原本 `docs/11` §6.4 寫可見性是 `Status = 3`，`docs/09` §3 寫匯出讀即時欄位 —— 兩者相衝，而且兩種修法都是災難：

| 做法 | 後果 |
|---|---|
| 讀即時欄位 ＋ 可見性看 `Status = 3` | 編輯已上線的療程頁 → **該頁 404**，直到重新核准 |
| 讀即時欄位 ＋ 可見性不看 `Status` | **未經審核的編輯直接上線** —— 醫療內容的審核閘形同虛設 |
| ✅ **讀已核准的快照 ＋ 可見性看 `PublishedVersionId`** | 編輯期間照常顯示舊版，核准後才換新版 |

`docs/09` §3 與 `docs/11` §6.4／§7 已於 2026-09-11 更正。

### ⬜ 未做

`openapi.yaml`（手寫，catch-all 路由下自動產生器內省不出端點）、
**首頁版位的送審整合**（目前直接寫入，未走草稿／送審／核准；`docs/08` §G-2 要求掛在
`SystemKey='home'` 的 ContentItem 上）、單元測試（至少要涵蓋權限判定表與可見性判定式）。

---

## 六、部署 🟡

**2026-09-11 已實際部署上線可驗收的正式環境**（尚未切 DNS）：
前台 220 條路由、後台 SPA、獨立 Function App、SWA Managed Function `/api/fallback`
全部在 Azure 上跑起來並逐項驗過。剩下的缺口是 **CI（workflow 未進 repo，目前靠本機腳本部署）**
與 **301 對照表沒有資料**。

**驗收網址：<https://jolly-hill-015d56f1e.5.azurestaticapps.net>**

### ✅ 已建立（`rg-20skin-web-prod`／westus2／CSP 訂閱）

| 資源 | 名稱 | 備註 |
|---|---|---|
| Static Web Apps | `swa-20skin-web-prod` | **Standard**（見下方） |
| Azure Functions | `func-20skin-web-api-prod` | Flex Consumption ＋ **dotnet-isolated 10.0** ＋ SystemAssigned 身分 |
| Blob Storage | `st20skinweb` | 容器 `media`（公開讀）／`media-private`／`system-state`／`deploy-package` |
| Application Insights | `appi-20skin-web-prod` | ＋ `log-20skin-web-prod` |

Function App 的受控識別已授予 Storage 的 **Blob Data Contributor** 與 **Blob Delegator**
（後者是簽 user delegation SAS 必要的），執行期不需要儲存體金鑰。
`Jwt__Secret` 已產生並只存在 Azure 的應用程式設定裡。

### 🔴 兩件必須知道的事

**① 不要把資源建進 `rg-20skin-prod`。**
那是**線上預約系統**的正式環境，正在服務 `booking.20skin.tw` —— `swa-20skin-customer-prod`
（Standard）、`swa-20skin-admin-prod`、`func-20skin-api-prod`（`ApiRouter` ＋ `SmsReminder`）。
而預約系統正是 CLAUDE.md 決策 4 明文排除在本專案外的東西。部署進去會**弄壞診所營運中的預約**。

**② SWA 由 Free 改為 Standard。**
不是改變主意 —— `az staticwebapp create --sku Free` 直接回
`This subscription has too many static sites with SKU: Free`，配額已被既有專案用滿。
連帶影響（`docs/07` §3 已全面更新）：單一環境儲存 **250 MB → 500 MB**、自訂網域 2 → 5、
**有 SLA**、IP 範圍限制變成可用。產物大小閘同步放寬為 350 MB 警告／450 MB 擋下
（目前 14.7 MB）。

### ✅ Azure SQL 已就緒（2026-09-11）

`20skin-website.database.windows.net` / `20Skin-website`，**與其餘資源同一個資源群組與區域**
（`rg-20skin-web-prod`／westus2），所以沒有跨區查詢的問題。

| 項目 | 值 |
|---|---|
| 方案 | **Basic**（2 GB／5 DTU） |
| 定序 | **`Chinese_Taiwan_Stroke_CI_AS`** ✅（docs/08 §0 決策三） |
| schema | **35 張表 ＋ 165 列種子已套用**，用 `efbundle`（docs/11 §13）。兩支遷移都已套用，見下方 |
| 驗證 | `InitialSchema` 當時：表數 37、匿名約束 0、AI FAQ 開關 `false`、外部網域 2 筆 |

### ✅ 遷移到 `RemoveMediaLibrary`（2026-09-11）

不做媒體庫的 schema 改動**已套用到正式庫**。以本機 `efbundle` 執行，身分走
`Authentication=Active Directory Default` ——`az` 登入的帳號正是這台 SQL Server 的
**Entra 管理員**，所以不必等 CI 服務主體建好就有 DDL 權限。

驗證：`dotnet ef migrations list` 對 `20Skin-website` 回報 `InitialSchema` 與
`RemoveMediaLibrary` 兩支**都已套用、沒有 pending**。整份遷移包在單一交易裡
（`DROP TABLE MediaAssets`／`MediaUsages` ＋ 10 個 `DROP COLUMN *MediaId` ＋ 60 個
內嵌圖片欄位 `ADD`），提交成功即代表全部生效。

⚠️ **這支遷移不向後相容，也刻意不做成向後相容**（docs/11 §13 第 2 條的例外）：
正式庫當時只有種子資料、沒有任何內容，沒有資料要保。**等到有內容之後就不是這樣了。**

🔴 **第二步還沒做：正式 Function App 仍是舊組建。**
`func-20skin-web-api-prod` 上跑的程式還會去查已經被刪掉的 `MediaAssets` ——
現在是「新 schema 配舊程式」的空窗。站還沒切 DNS、資料庫也沒有內容，沒有實際影響，
但**不要停在只做一半**：

1. 重新部署 `func-20skin-web-api-prod`（⚠️ `tools/deploy-swa.sh` **不含它**，
   那支腳本只管 SWA 的前台／後台／`/api/fallback`；獨立 Function App 不隨內容重建，
   見 CLAUDE.md 決策 7）
2. `tools/deploy-swa.sh` 重新部署前台與 `apps/admin` 產物（媒體庫畫面已拿掉）

**三組 SQL 身分**（docs/08 §J-3）：

| 身分 | 權限 | 狀態 |
|---|---|---|
| `func-20skin-web-api-prod`（受控識別） | `db_datareader` ＋ `db_datawriter`，**不給 DDL** | ✅ |
| `fallback_readonly`（帳密） | **只有 `SELECT` `Redirects` 一張表** | ✅ 實測：讀得到 `Redirects`、讀不到 `Users` |
| CI 遷移身分（DDL） | 待建服務主體 | ⬜ 等 repo 上 GitHub |

`fallback_readonly` 的連線字串已寫進 SWA 的 `SKIN20_SQL_CONNECTION`，密碼未經對話、
產生後直接寫入並刪除暫存。**這是全架構唯一的明文密鑰**，權限收斂到單一資料表。

> ⚠️ **Basic 的兩個上限要盯著**：2 GB（主要成長來源是 `ContentVersions.Snapshot`，
> 由 `VersionPrune` Timer 每筆保留 30 版擋著）、5 DTU（建置期全站匯出與 800 篇遷移會慢）。
> 反過來 Basic 是**常駐**的，比 Serverless 好 —— 後者的自動暫停會讓遷移期的
> `/api/fallback` 301 查詢撞上數十秒的喚醒延遲。

### ✅ 已部署並實測（2026-09-11）

部署方式是 **`tools/deploy-swa.sh`（本機執行）**，不是 CI —— workflow 還沒進 repo。
那支腳本的檔頭記了四件不寫下來就會忘的事（建置順序、CLI 必給的兩個旗標、
404 頁要複製進 API 產物、`api/` 是 net9.0）。

| 項目 | 狀態 |
|---|---|
| 前台 220 條路由 | ✅ 首頁／療程／療程細節／醫師／困擾／文章／案例／FAQ／據點／聯絡／搜尋全數 200 |
| 後台 SPA 深層連結 | ✅ `/admin/`、`/admin/treatment`、`/admin/redirects`、`/admin/settings` 皆 200，`X-Robots-Tag: noindex` ＋ `Cache-Control: no-store` 有生效 |
| 獨立 Function App | ✅ `/health` 200；受控識別連 Azure SQL 成功；未授權 401、未註冊路由 404、首登未改密碼 403 |
| **`/api/fallback`** | ✅ **本次補建**（見下方）。函式已上線、查得到 DB、未命中回 404 ＋ 正確版面 |
| 設定檔快速路徑 301 | ✅ `/index2.php` → `/`、`/doctor.php` → `/team/` 等 7 條 |
| 靜態資產 | ✅ `/assets/*`、`/_nuxt/*` 直接 200（修掉多一跳的問題，見下方） |

### ✅ 本次補建：`api/`（SWA Managed Function）

CLAUDE.md 決策 7 的兩個 API 當中，`api/` 這一半**先前根本沒有建立** ——
資料夾不存在，SWA 上 `functions show` 回空陣列，所以約 770 條 301 沒有任何東西在接。
本次補上：`api/Skin20.Fallback.csproj`（**net9.0**）＋ `Program.cs` ＋ `Fallback.cs`。

三個刻意的決定，都寫在原始碼註解裡：

- **只用 Dapper、不載入 EF Core**，也**不用 ASP.NET Core Integration**（收 `HttpRequestData`）——
  Managed Functions 沒有預熱，每個未命中都吃一次冷啟動。
- **查兩個鍵**（解碼與百分比編碼各一）。後台存進 `FromPath` 的是 CSV 的原樣文字
  （docs/08 §H 的例子 `/share.php?class=醫美新知` 中文未編碼），但 `x-ms-original-url`
  一定是編碼過的。只查一種，那約 40 條中文 query 的年份組合必然對不上。
- **`MemoryCache` 設 `SizeLimit`**。未命中也要快取（否則爬蟲每打一次就查一次 DB），
  但沒有上限的話一條隨機網址就能撐大記憶體。

**正規化已實測平價**：把 `RedirectHandler.NormalizePath`（寫入端）與 `Fallback.Normalize`
（讀取端）放進同一支程式跑 9 組輸入，含中文 query、參數順序顛倒、大小寫、空參數，
**9 組全部對得上**。這是 docs/08 §H 點名「不先講清楚就會上線才發現」的那件事。

### 🔴 301 對照表是空的

`Redirects` 表**目前 0 列**（以 `fallback_readonly` 實際連線查證）。
STATUS 先前寫的「301 種子約 772 筆」指的是**後台畫面的 mock 資料**，不在資料庫裡。

所以 `/api/fallback` 現在對每一個舊網址都回 404 —— 這是正確行為，不是故障
（函式本身已驗證：全新網址 0.43 秒回應，若連不上 DB 不可能這麼快）。

**在真實 301 清單匯入之前，遷移期轉址等於沒有。** 而清單本身卡在
「文章內頁的舊網址型態尚未確認」（docs/07 §2 的 🔴 待補資料）——
不要拿那份合成佔位資料匯入正式庫。

### ⚠️ 部署時發現並修掉的兩個問題

**① `trailingSlash: "always"` 讓每一個靜態資產都多一跳 301。**
`/assets/base.css` → 301 → `/assets/base.css/` → 200，`_nuxt` 的 JS chunk 也一樣。
等於每次頁面載入，每一支 CSS／JS／字型都付兩趟來回 —— 對一個以 SEO 與 CWV 為目的的改版
是直接的傷害。改成 **`"auto"`** 之後實測：資產直接 200，而 `/treatments` → `/treatments/`
的頁面正規化**仍然保留**（301）。`always` 是嚴格較差的設定。
放棄 `always` 不影響 SEO：104／105 個頁面都有 `<link rel="canonical">`。

> ⚠️ 那批 301 帶著 `/assets/*` 路由給的 `max-age=31536000, immutable` ——
> 改設定之後仍有節點回舊的 301，要等邊際快取過期或帶 cache-buster 才看得到新結果。
> 本次實測就撞到這個，不要誤判成設定沒生效。

**② SWA 的 `responseOverrides.404` 對 function 回的 404 不生效。**
原本打算讓 SWA 把 404 改寫成前台的 `/404.html`，實測拿到的是函式內嵌的字串。
而 `navigationFallback` 會把**全站每一個**找不到的請求都送進 `/api/fallback`，
也就是說 404 版面完全由那支函式決定。
解法：`tools/deploy-swa.sh` 在部署時把 `404.html`（14.7 KB）複製進 API 產物，
函式讀檔後常駐記憶體。已移除那段沒有作用的 `responseOverrides`
（留著反而會讓缺圖的請求回一整頁 HTML）。
⚠️ **連帶後果：改了 404 頁的版面要重新部署 API，不是只重新部署前台。**

### ⬜ 未做

| 項目 | 說明 |
|---|---|
| **兩條 workflow 進 repo** | 範本在 [`docs/templates/`](docs/templates/)，尚未複製到 `.github/workflows/`。目前部署靠 `tools/deploy-swa.sh` 本機執行 |
| **`favicon.ico`／`sitemap.xml`／`llms.txt`** | 線上實測皆 404，三者都還沒產生 |
| ~~部署程式碼~~ | ✅ **已部署**（見上方） |
| ~~Azure SQL~~ | ✅ **已就緒**（見下方） |
| 自訂網域 | `20skin.tw`／`www.20skin.tw`／`api.20skin.tw` 都還沒綁 |
| CORS | Function App 的 allow-list 由院方設定 |
| 其餘應用程式設定 | `GITHUB_REPO`／`GITHUB_DISPATCH_TOKEN`（待 repo 上 GitHub）、`Smtp__*`（待院方）、`BotCheck__SecretKey`（供應商未定） |

### ✅ 版控與分流已就緒

| | master → `Remote_NAS` | public → `Remote_GitHub` |
|---|---|---|
| 內容 | 完整（含 `reference/` 32 MB、`output/` 4.7 MB） | 去除上述兩者 |
| 狀態 | ✅ 已推 | 🔴 **remote URL 未設定** |
| 封包 | — | 0.5 MB |

機制：`tools/sync-public.sh`（index plumbing 重建 tree、append-only、永不需 force push）
＋ `.githooks/pre-push`（路徑清單 ＋ **雙層體積斷言**：單檔 2 MB／封包 50 MB）。

⚠️ **重新 clone 之後必須執行 `git config core.hooksPath .githooks`**，否則安全網不生效。

---

## 七、上線前 checklist

全部要在**切 DNS 之前**、對尚未對外的正式環境完成（[07](docs/07-deployment.md) §8 —— 沒有 staging、沒有 PR 預覽）。

- [x] ~~**`/api/fallback` 部署得起來、接得到 SQL**~~ — ✅ 2026-09-11。`dotnet-isolated:9.0` 在 SWA 上可用（docs/07 §8 原本標「不通就退 8.0」的疑慮解除）
- [ ] **`/api/fallback` 真的轉得成**（`x-ms-original-url` 帶不帶得到 query string）— 🔴 **`Redirects` 表 0 列，沒有資料可以打中**。正規化已用離線平價測試驗過 9 組（§六），但端到端還缺一次真命中
- [ ] 跨來源鏈路（preflight、Bearer、**4xx／5xx 是否也帶 CORS 標頭**）
- [ ] Managed Identity 連 SQL 與 Blob
- [ ] build 產物大小 vs 250 MB（含 Nuxt 每路由一份的 `_payload.json`）
- [ ] 全站 `nuxt generate` 時間（950 頁）
- [ ] Blob 直傳鏈路（Storage CORS、SAS 效期、`Cache-Control`）
- [ ] **換圖與移除真的把舊檔從 Blob 刪掉**（docs/11 §9.2）——本機只驗到「刪不掉也不會翻掉存檔」，真的刪成功還沒驗過
- [ ] **孤兒檔對帳工具**（回報成功但沒按存檔的檔案；要掃十個內嵌圖片欄位 ＋ `BodyBlocks`，docs/08 §E）
- [ ] 冷啟動對 301 與後台操作的實際延遲
- [ ] `api/` 實際可用的 .NET 版本（9.0 未證實，兩份 Azure 文件互相矛盾）
- [ ] 遷移在正式資料庫的實際行為（先在可丟棄的庫演練一次完整遷移與回滾）
- [ ] 全站 404 掃描、301 迴圈檢查、結構化資料驗證、CWV
- [ ] **種子密碼 `Admin@123` 更換**（🔴 沒有雙因素，帳密是唯一憑證）
- [ ] AI 爬蟲以實際 UA 逐一驗證回應 200

---

## 八、擋住的事項

### 🔴 需要你決定

| 項目 | 說明 |
|---|---|
| **`Remote_GitHub` 的 URL** | 沒有它推不了 public 分支 |
| **FAQ 五大分類，兩份文件對不上** | [08](docs/08-database.md) §C-9 種子（品牌與診所／療程相關／肌膚困擾／醫師與看診／費用與流程）vs `mockup/16-faq.html`（療程相關／術後照護／看診與預約／費用與付款／院所資訊）。**建議以 mockup 為準** —— 前者沒有 slug，且「肌膚困擾」與 `/concerns/` 整段重複。動到網址結構，所以先不改 |
| 圖片衍生尺寸誰產 | 瀏覽器端上傳前轉檔 vs Function 端 sharp（[07](docs/07-deployment.md) §3） |
| 301 對照表是否改建置期烤 `redirects.json` | 可省掉 SWA 上唯一的明文密鑰（[07](docs/07-deployment.md) §2） |
| 機器人驗證供應商 | reCAPTCHA v3 或 Turnstile，**介面不要帶供應商名稱** |
| **301 的「命中次數」放不進架構** | 後台原本想用命中次數排出「哪幾條值得寫進 `staticwebapp.config.json` 快速路徑」，但 [`Redirects`](docs/08-database.md) §H **沒有這個欄位，而且放不了**：`/api/fallback` 對這張表只做單筆 seek 不做寫入，它那組唯讀 SQL 使用者**只能 SELECT 這一張表**。<br>已改為顯示「目前已寫進設定檔的 7 條」（人工挑定，與 `apps/web/public/staticwebapp.config.json` 一致）。<br>若真的要命中次數，唯一不牴觸架構的作法是 **Application Insights 的請求記錄離線彙總**，需另案評估。 |
| **醫師的「醫學審閱」無法實作** | [02](docs/02-backend-cms.md) §4 寫醫師「可對**指派**內容執行醫學審閱」，但 ①「醫師」角色只有 `review.decide`、沒有 `review.view`，進不了審核佇列；② [`ContentReviews`](docs/08-database.md) §B-3 **沒有「指派給誰」的欄位**，做不出「只看指派給我的」。<br>唯一現成的線索是 `Articles.ReviewerDoctorId`（審閱醫師），**但只有文章有**，療程與案例都沒有。<br>三個選項：**(a)** 醫學審閱只涵蓋文章，用 `ReviewerDoctorId` 篩選；**(b)** 為 `ContentReviews` 加 `AssignedReviewerId`（**新增欄位，與 [08](docs/08-database.md) §0 決策二「不預留未定案的欄位」相衝，需明確定案**）；**(c)** 拿掉醫師的審閱職責，只留「編輯自己的內容」。<br>⚠️ **在定案之前不要自行加欄位。** |
| ~~`RefreshTokens` vs 短效 JWT ＋ `SecurityStamp`~~ | ✅ **已定案（2026-09-11）：採 `RefreshTokens` ＋ rotation**。後台只剩一道防線，「停用帳號要能**即時**失效」比省一張表重要，短效 JWT 仍有空窗 |
| **`llms.txt` 的內容範圍** | [03](docs/03-seo-geo.md) §4 ④ 說它是全站核心資訊 ＋ 頁面索引，[04](docs/04-ai-faq.md) §3 只定義了 FAQ 專屬的 `faq.json`／`llms-full.txt` —— **兩份文件對 `llms.txt` 沒有交集的權威定義**。目前實作比照 sitemap 的資料來源、依型別分組各取前 20 筆，**是假設不是規格** |
| **後台密碼強度與輪替規則** | [02](docs/02-backend-cms.md) §4 註明待訂。目前用 ≥8 碼的保守底線。🔴 沒有雙因素，帳密是唯一憑證 —— 這條不該一直待訂 |

### 🔴 安全防線只剩一道

原規劃三道：雙因素（2026-09-11 不做）、IP 白名單（2026-08-13 不做）、登入次數限制。
**現在只剩最後一道**，而後台路徑 `/admin/` 是客戶指定、與舊站相同、公開可猜。

連帶要求（已寫進 [02](docs/02-backend-cms.md) §4、[07](docs/07-deployment.md) §2、[10](docs/10-api.md) §3.2）：
次數限制必須**帳號 ＋ 來源 IP 雙維度計數**、鎖定即時告警、**種子密碼上線前必須更換**、
需訂定密碼強度與輪替規則。

### 🔴 待院方或主機商提供

完整 `product*.php` 清單（找孤兒頁面）、Search Console 近 12 個月 URL 匯出、access log、
現行 `/admin/` 功能清單、Mod_Security 規則、**兩組 SQL 使用者 ＋ 一組唯讀連線字串 ＋ 防火牆放行**、
`api.20skin.tw` 的 CORS、`reference/banner1-L.jpg` 原始檔、兩個院區的**真實地址與電話**
（目前是 `04-XXX-XXXX`／`○○路○○號` 佔位值，連 JSON-LD 的 `geo` 都輸出不了）。

### 🔴 後台 SPA 的權限碼與 API 對不上（接真 API 前必須修）

`apps/admin/src/permissions.ts` 用的是 `{unit}.{action}`（`treatment.edit`／`review.decide`／
`user.view`⋯），但 **API 與資料庫用的是 [08](docs/08-database.md) §A-2 的 31 列**
（`content.treatment.edit`／`review.approve`／`account.manage`⋯）。

起因是我在寫 [10-api.md](docs/10-api.md) §4 時自創了一套命名，沒有對齊先前就存在的
`docs/08` §A-2。**`docs/10` 已於 2026-09-11 更正**，程式碼（種子、`Common/Constants.cs`、
`AppRouter.Admin.cs`）從一開始就跟著 `docs/08`，所以**只有後台 SPA 那一份是舊的**。

⚠️ 目前後台接 mock，還看不出問題；**接上真 API 的那一刻，權限判斷會全部失效**
（JWT 的 `permissions` claim 對不上任何一個 UI 判斷）。修法是把 `permissions.ts` 的
矩陣改成 31 列，並把 `can(unit, action)` 的呼叫端一併換掉。

### ⚠️ 技術債

| 項目 | 說明 |
|---|---|
| **`mockup/` 不進版控，但建置相依於它** | `sync:assets` 與 `verify:css` 都要讀它。**別台機器 clone 下來 build 不起來，CI 也一樣** —— 要讓 CI 跑 `nuxt generate` 得先解決取得方式 |
| [`docs/templates/ScheduledPublish.cs`](docs/templates/ScheduledPublish.cs) 與 [11](docs/11-backend-design.md) §7 不一致 | 範本寫 Timer 翻狀態、且用了 schema 沒有的 `Scheduled`／`Archived`。已在範本頂端加 🔴 警告，**程式碼未改** |
| mockup 的 `<figcaption>` 包在 `<div>` 裡 | 07、15 兩頁。依規格只能是 `<figure>` 直接子元素，Vue 編譯會警告。**沒修** —— 移出去會讓圖說從受限寬度變滿版 |

---

## 九、怎麼維護這份文件

- **每完成一項就更新對應那格**，不要累積到最後補
- 狀態寫在這裡，**規格寫在 `docs/`，決策寫在 `CLAUDE.md`** —— 不要互相抄
- 數字要跟 [`docs/06-page-inventory.md`](docs/06-page-inventory.md) 與 [`docs/08-database.md`](docs/08-database.md) 對得上
- 缺口要寫清楚**為什麼沒做**：等資料、等決策、還是技術債。只寫「未完成」等於沒寫
