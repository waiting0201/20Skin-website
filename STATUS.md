# 專案進度總表

> **這份文件是「做到哪裡了」的單一真相來源。** 每完成一項就更新對應那格。
>
> 分工：本檔記錄**狀態**；[`docs/`](docs/README.md) 的十二份文件記錄各領域的**規格與施工標準**；
> [`CLAUDE.md`](CLAUDE.md) 記錄**專案規範、關鍵數字與已定案決策**。三份不要互相抄，各司其職。

**最後更新**：2026-09-11

---

## 一句話現況

**規劃全部完成，前台切版與後台地基已落地，但資料庫、API 與 Azure 資源一個都還沒開。**

`apps/web` 的 21 個模板全數完成（220 條預渲染路由），`apps/admin` **31／31 個畫面全數完成**。
**資料庫 schema 也完成了** —— 37 張表的 EF Core migration 已在真的 SQL Server 2022 上
實測建立成功，種子資料 165 列。

**但前後台接的仍是 localStorage mock**：`functions/` 只有資料層，**API 端點一支都還沒寫**。
下一步是 `RouterFunction` 與各單元的 Handler。

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
| **後台開發** | 🟡 | **31／31 畫面完成**；接 mock，未接 API（§三） |
| **資料模型與 migrations** | ✅ | 37 張表 ＋ 種子，**已對真 SQL Server 實測建立成功**（§四） |
| **API** | 🟡 | 專案骨架與資料層完成；**端點一支都還沒寫**（§五） |
| 部署與 CI/CD | ⬜ | 範本在 [`docs/templates/`](docs/templates/)，**Azure 資源未開、workflow 未進 repo**（§六） |
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
| 產物大小閘 | 14.6 MB（180 MB 警告／230 MB 擋下，對應 SWA Free 的 250 MB） |
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

### ✅ 已完成（31／31 畫面）

| 群組 | 畫面 | 數 |
|---|---|---|
| 內容模型 | 九個模型 ×（列表＋編輯），共用 `ListPage`／`EditPage` ＋ 單元宣告 | 18 |
| 帳號 | 登入（單段帳密）、帳號管理、角色權限設定 | 3 |
| 工作流 | 審核佇列 | 1 |
| 資產 | 媒體庫 | 1 |
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
| 上傳未串接 | `media.requestUploadSas()` 刻意丟 TODO，不假裝成功 |
| 富文本 | 等寬文字框模擬，未接區塊編輯器 |
| 拖曳排序 | 現為上／下移動按鈕 |
| slug 唯一性 | mock 只檢查單元內；正式是全站 `UrlPath` 唯一索引 |
| **首頁版位的送審不進共用審核佇列** | mock 的各區 store 是分開的，而審核佇列的資料在 `client.ts` 裡。審核者要直接在首頁版位頁面核准／退回。**接上真 API 後自然消失**（後端本來就是同一張 `ContentReviews`） |
| **登入帳密與帳號管理是兩份資料** | `client.ts` 的 `auth.login()` 讀 `MOCK_USERS`，帳號管理操作自己的 store。在後台停用帳號不影響那組帳密還能不能登入。同上，接 API 後合一 |
| 301 種子約 772 筆，其中約 689 筆是合成佔位 | 文章內頁的舊網址型態**尚未確認**（[07](docs/07-deployment.md) §2 的 🔴 待補資料）。功能是真的，但**不要拿這份 mock 當「已核對清單」** |
| NAP 一致性用名稱字串比對 | 不是外鍵。據點名稱打錯字會誤判成「找不到對應據點」而非「不一致」。正式 API 上線後建議改 FK |

**mock 帳號**：`sa`／`Admin@123`、`editor1`／`Editor@123`、`doctor1`／`Doctor@123`、
`marketing1`／`Marketing@123`、`reviewer1`／`Reviewer@123`

---

## 四、資料模型 ✅

**37 張表的 EF Core migration 完成，已對真的 SQL Server 2022 實測。**
schema 的真實來源是 `functions/Data/Migrations/`（docs/07 §5）。

| 單元 | 張數 |
|---|---|
| A 帳號與權限 | 7 |
| B 內容主幹（工作流／版本／SEO） | 5 |
| C 九個內容模型（TPT） | 16 |
| D 內容關聯 | 1 |
| E 媒體庫 | 2 |
| F FAQ 題庫成長 | 1 |
| G 站台編排 | 4 |
| H SEO 與 301 | 1 |

### ✅ 實測驗證過的（不是只有產得出 SQL）

| 項目 | 結果 |
|---|---|
| 建立 37 張表 | ✅ 對 `Skin20_Verify`（定序 `Chinese_Taiwan_Stroke_CI_AS`）實跑成功 |
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

## 五、API 🟡

**專案骨架與資料層完成，端點一支都還沒寫。**

✅ 已完成：`Skin20.Api.csproj`（.NET 10 isolated ＋ EF Core 10 ＋ Dapper）、`Program.cs`
（Managed Identity 連 SQL／Blob，**執行期無密鑰**）、`Skin20DbContext` ＋ 37 張表的
Configuration ＋ migration ＋ 種子、`ISqlConnectionFactory`（Dapper 讀取路徑）、
`Skin20DbContextFactory`（設計期，供 `dotnet ef`）。

⬜ 未做：`RouterFunction` catch-all ＋ `AppRouter` 集中式分派與預設拒絕授權、
各單元 Handler、Dapper ReadService、`ApiResponse` 信封與 `ExceptionMiddleware`、
JWT 與登入次數限制、Timer Function（排程發布／版本修剪／計數清理）、
`openapi.yaml`。施工標準見 [11](docs/11-backend-design.md)。

兩處 API 的分工是全篇最容易搞錯的地方：

| | `functions/` → `api.20skin.tw` | `api/` → SWA Managed Function |
|---|---|---|
| 內容 | 全部應用程式端點 | **只有 `/api/fallback`**，約 770 條 301 |
| 框架 | .NET 10 ＋ EF Core ＋ Dapper | **最高 net9.0**，**Dapper only** |
| 狀態 | ⬜ | ⬜（範本已寫：[`docs/templates/Fallback.cs`](docs/templates/Fallback.cs)） |

---

## 六、部署 ⬜

**Azure 資源一個都還沒開。** 範本在 [`docs/templates/`](docs/templates/)，尚未複製到 repo 根的
`.github/workflows/`。

需要建立：SWA（Free）、Azure Functions App（Flex Consumption）、Blob Storage，
加上院方的 Azure SQL，共四樣。

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

- [ ] **`/api/fallback` 的 301 行為**（`x-ms-original-url` 帶不帶得到 query string）— **開工第一週的技術驗證**
- [ ] 跨來源鏈路（preflight、Bearer、**4xx／5xx 是否也帶 CORS 標頭**）
- [ ] Managed Identity 連 SQL 與 Blob
- [ ] build 產物大小 vs 250 MB（含 Nuxt 每路由一份的 `_payload.json`）
- [ ] 全站 `nuxt generate` 時間（950 頁）
- [ ] Blob 直傳鏈路（Storage CORS、SAS 效期、`Cache-Control`）
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
| `RefreshTokens` vs 短效 JWT ＋ `SecurityStamp` | 二選一，不要兩套都做 |

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
