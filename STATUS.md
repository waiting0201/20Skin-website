# 專案進度總表

> **這份文件是「做到哪裡了」的單一真相來源。** 每完成一項就更新對應那格。
>
> 分工：本檔記錄**狀態**；[`docs/`](docs/README.md) 的十二份文件記錄各領域的**規格與施工標準**；
> [`CLAUDE.md`](CLAUDE.md) 記錄**專案規範、關鍵數字與已定案決策**。三份不要互相抄，各司其職。

**最後更新**：2026-09-12

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

⚠️ **2026-09-12：前後台都接上真 API 了。** 後台 `src/api/` 底下的 localStorage mock 全部移除
（`mock-store.ts`／`mock-seed.ts` 已刪），改走 `api.20skin.tw`；前台的 `/contact/` 表單與
AI FAQ 開關也接上了那三支執行期端點。詳見 §三。

**剩下兩個缺口**：`Redirects` 表 0 列（真實 301 清單未匯入）、
CI workflow 未進 repo（目前靠本機腳本部署）。
✅ **2026-09-14：10 支遷移全部套用到正式庫，Function App 也部署了新組建**（見 §六）。

✅ **2026-09-14：測試站 `20skin.4webdemo.com` 整條鏈打通，端到端驗過**（見 §六）。

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
| **前台開發** | 🟡 | 21 個模板切版完成、SEO 與 JSON-LD 落地；內容全部來自資料庫；`/contact/` 與 AI FAQ 開關已接執行期端點（§二） |
| **後台開發** | 🟡 | **30／30 畫面完成**，**已接上真 API**（2026-09-12，§三） |
| **資料模型與 migrations** | ✅ | 35 張表 ＋ 種子，**已對真 SQL Server 實測建立成功**（§四）。共 10 支遷移，**2026-09-14 全部套用到正式庫**（§六） |
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

### ✅ 內容已全部來自資料庫（2026-09-11）

`資料庫 →（Dapper 唯讀）→ apps/web/content/*.json →（Vite 內聯）→ 靜態產物`。
`app/data/*.ts` 從內容本體變成形狀轉接層（3507 → 2148 行），30 個消費端一行未改。

| 單元 | 筆數 |
|---|---|
| 療程 27／醫師 14／困擾 8／文章 11／FAQ 36／據點 2／案例 1／頁面 17／分類標籤 23 | **139 筆已發布** |
| 關聯 103 筆、首頁 7 個版位、導覽選單與頁尾、全站設定 | |

驗收：`golden-diff.sh` 比對重建後的 107 頁與搬遷前的黃金樣本；
`verify:css`／`verify:links` 全過、零斷鏈、220 條路由。
剩餘差異都可解釋：圖片改成 Blob 網址、顯示名稱改用資料庫正式名稱、
時段表格改由 `businessHours` 推導（**修正**：mockup 那份手寫表格早就與實際門診時間分岔）。

### 🟡 有缺口

| 缺口 | 說明 |
|---|---|
| 🔴 **`aifaq.enabled` 曾被匯入腳本蓋成 `true`** | 種子刻意是 `false`（docs/04 §4：AI 未串接前不對外顯示，「一顆點下去沒反應的常駐按鈕比沒有按鈕更糟」），但搬遷前的 `app/data/site-settings.ts` 寫死 `true`（樣稿要展示那個面板），匯入腳本把它一起搬了過去。2026-09-12 發現並修掉 —— **功能開關不是內容，不由匯入決定**。本機 `Skin20_Dev` 已改回 `false`；🔴 **正式庫上線前要確認這個值** |
| **圖片尚未上傳到 Blob** | 61 個 blob，跑 `node tools/content-import/upload-images.mjs`。🔴 **需要 az 身分對 `st20skinweb` 有 `Storage Blob Data Contributor`** —— 訂閱層級的 Owner **不等於** Blob 資料層存取權，這兩件事在 Azure 是分開的（2026-09-14 踩到）。在那之前前台的內容圖是破圖 |
| **26 個療程頁沒有內容** | 顯示「內容建置中」，已加 `noIndex` 且不輸出 `MedicalProcedure`。正式站這些是草稿，根本不會產生該頁 |
| **文章只有 11 篇、全屬「醫美新知」** | 其餘三個分類顯示空狀態。三個空分類的 Hero 文案是改寫的通用句，**待院方補真文案** |
| 🔴 **案例列表從 9 則變成 1 則** | 另外 8 則缺四個法規揭露必填欄位（個案差異聲明、拍攝條件、書面同意、同意書索引，[08](docs/08-database.md) §C-5 全部 NOT NULL）。**捏造是法規紅線**，所以沒有進資料庫。要恢復列表必須由院方補齊那四個欄位 —— 這是內容問題不是程式問題 |
| **7 個困擾頁只有一句話簡述** | AI 摘要 30–38 字（規範 40–60），沒有為了湊字數編醫療內容 |
| **服務條款、醫療免責聲明無條文** | 「待院方法務提供」骨架 ＋ `noIndex` |
| ~~站內搜尋~~ | ✅ **2026-09-12 完成**。建置期由 `content/*.json` 產生 `search-index.json`（127 筆／48 KB），client 端子字串比對 ＋ 型別篩選 ＋ 關鍵字標記；查無結果時回寫 `POST /questions/miss`。已用 Playwright 對建置產物實測（結果數、篩選、標記、空狀態、只回報一次、摘要有逸出） |
| ~~`/contact/` 表單~~ | ✅ **2026-09-12 已接上 `POST /contact`**。只寄通知信、不落庫；失敗照實顯示錯誤碼（429／機器人驗證／欄位），不吞錯 |
| ~~`sitemap.xml`／`llms.txt`／`faq.json`~~ | ✅ **2026-09-12 完成**，連同 `robots.txt` 一起由 `tools/content-export` 產生（詳見 [07](docs/07-deployment.md) §4）。sitemap 91 個網址 ÷ 5 個分檔；robots.txt 改成從 `SiteSettings.seo.robotsTxt` 產生，後台改得動了 |
| 208 個 `href="#"` | mockup 遺留的佔位連結，`verify:links` 會列出數量，不會無聲增加 |

### ✅ 執行期端點已接上（2026-09-12）

前台是預渲染靜態站，**執行期只打四支**（docs/09 §4）。目前狀態：

| 端點 | 狀態 |
|---|---|
| `GET /health` | ✅ 部署後 smoke test 用 |
| `POST /contact` | ✅ 已接。`site`（院區）與 `topic`（主題）一併進通知信 —— 少了它們，院方收到的信沒有分流資訊 |
| `GET /site-settings/public` | ✅ 已接。**AI FAQ 開關改成執行期讀**，院方在後台按一下就生效，不必等下一次建置（docs/08 §J-4 步驟 7 的要求）。讀失敗時退回建置期烤進去的值，不是關掉面板 |
| `POST /questions/miss` | ✅ 已接。站內搜尋查無結果時回寫，**只帶問題文字**、失敗靜默（它有頻率限制，同 IP 每小時 10 次） |

API 位址走 `runtimeConfig.public.apiBaseUrl`（`NUXT_PUBLIC_API_BASE_URL`），預設正式站網址。

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
送審時掃高風險字詞、權限矩陣（五角色 × docs/10 §4 的 31 個權限碼，**整份來自
`GET /admin/role`** —— 這個畫面本身就是用來改那張表的，前端寫死一份等於改完還是顯示舊的）、
發布聚合狀態、301 的 CSV 匯入匯出
與衝突／迴圈檢查、robots.txt 的 `Disallow: /admin` 防呆、NAP 一致性比對。

### ✅ 已接上真 API（2026-09-12）

localStorage mock 全部移除 —— `src/api/mock-store.ts` 與 `src/api/mock-seed.ts` **已刪除**。
`src/api/` 底下每一支都改走 `api.20skin.tw`，畫面元件一律經過 `adminApi` 門面，不自己 fetch。

| 檔案 | 角色 |
|---|---|
| `src/api/http.ts` | **新增。** 唯一的 HTTP 出口：信封拆解、錯誤碼、Bearer、401 自動換發、分頁正規化 |
| `src/api/content-fields.ts` | **新增。** 九個單元的欄位形狀轉接（見下方「兩個一定要知道的坑」） |
| `src/api/settings-client.ts` | **新增。** `GET\|PUT /admin/setting` 的鍵值層，`site.ts` 與 `seo.ts` 共用 |
| `client.ts`／`account.ts`／`redirect.ts`／`seo.ts`／`site.ts`／`question.ts`／`upload.ts` | 全部重寫為真 API 呼叫 |

驗收：本機對真的 SQL Server 2022 跑了兩支端到端煙霧測試（已進版控，
見 [`tools/api-smoke/`](tools/api-smoke/README.md)），**讀取 36 項、寫入 55 項全過** ——
登入與首登改密碼、九個單元的清單顯示欄位、詳情的欄位鍵名、正反向關聯、
送審→審核佇列→核准、首頁版位工作流、版本還原、分類引用計數、
網址改回舊值、轉址匯入覆蓋、題目來源篩選、前台三支公開端點。

⚠️ **型別檢查與 build 抓不到這一類錯誤** —— 少回一個欄位是空白欄、字串沒轉數字是靜默忽略、
關聯查錯方向看起來像「還沒有資料」。改完 API 或後台資料層請把這兩支跑一遍。

**API 位址**：`VITE_API_BASE_URL`（見 `apps/admin/.env.example`），預設正式站網址。
⚠️ 本機開發要一併在 API 那頭的 CORS allow-list 放行 `http://localhost:3300`，
少了它瀏覽器只給一個**沒有任何資訊**的 network error，看起來像斷線。

### ⚠️ 兩個一定要知道的坑

**① 表單元件一律吐字串，API 那頭要數字。**
`<select>` 與 `<input type="number">` 的 value 是 string，但 `categoryTermId` 要 int、
`phase` 要 byte。更糟的是**更新時傳字串不會報錯，會被靜靜忽略**（`JInt` 對 JSON 字串回 null）——
「換分類」按下去回 200、重整後分類沒變。轉型集中在 `content-fields.ts`，
新增欄位時型別要在單元宣告裡寫對。

**② 讀回來的形狀與寫出去的形狀曾經不對稱。**
回應把型別欄位包在 `fields` 底下，但寫入端原本只讀頂層 —— 「把讀到的東西改一改再送回去」
會什麼都沒寫進去。已於 2026-09-12 修正為**兩種都收、巢狀優先**（docs/10 §2）。
攤平那條路不可移除：遷移期的匯入腳本送的就是攤平的形狀。

### 🟡 還有缺口

| 缺口 | 說明 |
|---|---|
| 富文本 | 等寬文字框模擬，未接區塊編輯器 |
| 拖曳排序 | 現為上／下移動按鈕 |
| 「我的退件」只看得到內容與原因 | `GET /admin/review` 只查待審那一批（docs/10 §3.4），已核准／已退回的送審紀錄沒有端點可查 —— 所以畫面上顯示不出「誰在什麼時候送審／核准」。這是契約範圍，不是漏接 |
| 首頁版位的送審者與時間 | 同上。只在「送審中」時用首頁那筆 Page 的 `updatedAt` 近似顯示 |
| 「上一次改密碼是什麼時候」 | `Users` 沒有 `PasswordUpdatedAt`（docs/08 §A-1）。畫面改用 `mustChangePassword` 表示「密碼未更換」，對「種子密碼上線前必須更換」這個唯一用途夠用 |
| 角色權限沒有「還原預設值」 | 預設值是種子資料，上線後可能已被刻意調整。前端不自己記一份 —— 那份一定會跟種子分岔。要回到種子值請重跑種子 |
| 首頁版位沒有「撤回」 | docs/11 §7 的工作流是送審 → 核准／退回，**沒有送審者自己收回這一步**。原本 mock 有這顆按鈕，是 mock 自己發明的 |
| NAP 一致性用名稱字串比對 | 不是外鍵。據點名稱打錯字會誤判成「找不到對應據點」而非「不一致」。建議日後改 FK |
| 301 對照表是空的 | 見 §六。後台功能是真的，但資料庫的 `Redirects` 目前 0 列 |

**種子帳號**：`sa@system.local`／`Admin@123`（登入識別**不是** `sa`，也不是 email 格式，docs/08 §A-1）。
🔴 首登強制改密碼，**上線前必須換掉**。

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
| 🔴 **遷移裡的 SQL 字串常值少了 `N` 前綴**（2026-09-12） | 少了它，SQL Server 會先把常值當成 varchar（走資料庫定序的編碼頁）再轉 nvarchar。中文多半活得下來，但 `⚠️` 這類 BMP 外的字元變成 `??` —— **而且不會有錯誤**，遷移照跑成功，只是字沒了。寫 `migrationBuilder.Sql` 時每一個字串常值都要 `N'…'` |
| ⚠️ **EF 產出的 `UpdateData` 是無條件覆蓋** | 用來補種子預設值時會把使用者改過的資料一起蓋掉。要改成帶 `WHERE SettingValue = <舊種子值>` 的 `migrationBuilder.Sql` —— 遷移可以補預設值，不可以覆寫使用者的資料 |

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

### ✅ 2026-09-12 後台接線時補齊與修掉的

**新增端點**（已同步 docs/10 §3.4）：

| 端點 | 為什麼需要 |
|---|---|
| `GET /admin/rebuild` | 後台的「發布中／已上線」狀態字。權限刻意是「登入即可」—— 內容編輯要看得到，但不該能自己觸發建置 |
| `GET /admin/risk-term` | 編輯器的高風險字詞即時提示。**是提示不是閘門**，送審時伺服器仍會自己重掃 |
| `GET /admin/redirect/stats` | 301 清單上方的統計卡。獨立一支而不是塞進清單回應 —— 統計是全表的、清單是一頁的 |

**既有端點補上後台真的會用到的東西**：

| 補了什麼 | 為什麼 |
|---|---|
| 登入回應加 `userId`／`userName`／`doctorId` | 否則前端只剩「自己 base64 解 token」一途，等於依賴 token 內部格式 |
| 清單回 `fields`（逐單元幾個顯示欄位）＋ `categoryTitle` ＋ `usageCount` | 後台清單要顯示職稱、地址、看診日期、分類名稱、引用筆數。⚠️ 不是完整詳情 —— 一頁 20 列撈詳情等於 20 份內文 |
| 詳情回**反向關聯**（`isReverse`） | 只回正向的話，醫師頁的「關聯療程」永遠是空的 —— 那不是沒有資料，是查錯方向，**沒有錯誤訊息** |
| 選單節點回 `contentType`／`contentTitle` | 選單編輯器要顯示「站內內容：○○療程」，否則每個節點都要再打一次 API |
| 301 清單支援 `isActive`／`source`／`sortBy`／`sortDir` | 後台那些篩選與排序是真的 UI。**在前端過濾只會過濾到當頁 20 筆** |
| 301 匯入支援 `overwriteExisting` | 後台有「覆蓋既有規則」勾選。預設 `false`：770 條重匯一次是常態，預設覆蓋等於一次誤操作蓋掉所有人工修正 |
| 未命中題目清單支援 `source` 篩選 | 同上，必須在 SQL 層 |
| 設定新增鍵 `seo.sitemapFiles` | sitemap 分檔設定原本是後台自己的 localStorage。遷移 `20260912091129_AddSitemapFilesSetting` |

**修掉的五個 bug**（都是既有的，不是這次改出來的）：

| 問題 | 後果 |
|---|---|
| 🔴 **送審沿用最後一筆既有版本，不重新快照** | `ContentReviews.VersionId` 核准後成為 `PublishedVersionId`，也就是匯出真正讀的那一份。任何不產生版本的編輯路徑（**首頁版位就是**）送審核准之後，上線的是**改動前**的內容，而畫面顯示「已發布」。實測抓到：拖完版位、送審、核准，快照裡仍是拖動前的排列 |
| 🔴 **匯出讀 `HomeSections` 即時表，不是已核准快照** | 等於「編輯者拖一拖版位、還沒送審，下一次建置就上線了」—— 核准那道關卡完全被繞過。連帶：匯入腳本寫完版位沒有重新發布首頁，正式資料的首頁快照裡版位是空的（已一併修正） |
| **`PublishedFaqRow` 宣告成 `DateOnly`** | Dapper 對 record 建構式不做 `DateOnly` 轉換，`GET /admin/export/faq.json` 與 `llms-full.txt` 執行期 500。編譯看不出來，而且只有匯出預覽會呼叫 |
| 🔴 **匯出腳本的可見性條件與 API 分岔** | `Visibility.cs` 第一行就寫著「這段條件只能有一份」，但 `tools/content-export` 手寫了一份 `ci.Status = 3`，API 用的是 `PublishedVersionId IS NOT NULL AND Status <> 4`。意思是**編輯一個已上線的頁面（工作副本回到草稿）之後重新建置，那一頁會從網站上消失** —— 正是那段註解預言的症狀。而本次「存首頁版位會把首頁打回草稿」的改動會讓它每次都踩到。現已改為 `<Compile Include>` 連結同一份原始碼，**從機制上**不可能再分岔 |
| **改網址時的自動 301 是無條件 `Add`** | slug 或分類改回曾經用過的值（A→B→A）就撞上 `Redirects` 的唯一索引 —— 編輯者拿到一個指向 slug 的 409「這個值已經有人用了」，而且**整筆內容存不進去**。改為 upsert，並把「指向現用網址」的殭屍規則清掉（那會讓 `/api/fallback` 把活著的頁面轉走）。⚠️ 只動 `Source=SystemAuto` 的；人工與遷移工具建立的規則不碰 |

**連帶的行為改變**（不是漏做，是修正）：

- `PUT /admin/home-section` 現在會把首頁那筆 Page **打回草稿**（docs/11 §7 規則 2），而且**不再觸發重建** —— 改的是工作副本，前台沒有變化
- 版本還原會**連版位一起還原**（版位是首頁上唯一會變的東西）
- 送審每次都會多一筆版本列。由 `VersionPrune` 收；「核准了卻沒上線」沒有東西收得掉

### ✅ 機器人驗證：reCAPTCHA v3（2026-09-12 定案並實作）

三支對公網開放的寫入端點都套上了：`POST /contact`、`POST /questions/miss`、
**`POST /auth/login`**（原本沒有，但 docs/10 §5 一直要求）。規格見 [10](docs/10-api.md) §5.1。

用假的 siteverify 端點跑過九項行為，全部符合設計：

| 情況 | 預期 | 結果 |
|---|---|---|
| 沒帶 token | 擋下 | ✅ 不擋的話，不送 token 就能繞過 |
| `success=false`（過期／重複使用） | 擋下 | ✅ |
| 分數 0.1 < 門檻 0.5 | 擋下 | ✅ |
| `action` 不符（拿 login 的 token 打 contact） | 擋下 | ✅ |
| 對外訊息不透露原因 | — | ✅ 一律同一句，細節只進 log |
| `success=true` ＋ 分數與 action 都對 | 放行 | ✅ |
| 連不上驗證服務 | **放行** | ✅ |
| 逾時 | **放行**，5 秒內收手 | ✅ 實測 5.0s |
| 未設定 SecretKey | **放行** ＋ Warning | ✅ |

🔴 **「連不上就放行」是刻意的，不是把防護關掉。** 另一邊更糟：`/contact` 擋下＝
Google 有狀況的期間院方收不到任何病人詢問；`/auth/login` 擋下＝後台整個登不進去。
放行**只發生在傳輸層失敗**，Google 明確說「不是人」時一律擋下。

🚨 **逃生口**：reCAPTCHA 若讓所有人都登不進後台，清空 Function App 的
`BotCheck__SecretKey` 即可立即放行，不需重新部署。

🔴 **上線前要做的兩件事**（STATUS §七）：
① 申請正式站台的金鑰對，設 `BotCheck__SecretKey`（Function App）與
`NUXT_PUBLIC_RECAPTCHA_SITE_KEY`／`VITE_RECAPTCHA_SITE_KEY`（兩個前端）；
② **兩邊要一起設** —— 前端留空但後端設了 secret key，所有送出都會因為
「沒有帶 token」被擋下，而錯誤訊息指不到這個原因。

⚠️ 分數門檻預設 0.5（Google 建議的起點）。**不要為了「乾淨」往上調** ——
v3 對少數真人也會給低分，而他們不會知道自己被擋了（沒有挑戰題可解）。

前端那一半也用 Playwright 對**建置產物**驗過九項：聲明文字與兩個連結都在、
送出時真的帶了 token、`action` 是 `contact`（不是別頁的 token）、徽章確實被隱藏、
以及**驗證載不起來時不會硬送出去**，而是顯示真正的原因與替代做法（致電）——
最後這一項是重點：硬送只會讓病人以為詢問已經送到。

⚠️ **徽章用 JS 隱藏，不是 CSS。** 這條規則沒有地方可以放：`mockup/` 不進版控（見本節
技術債），而 `verify:css` 禁止 `app/` 底下有自己的樣式表 —— 寫進 `base.css` 的話，
別人 clone 下來根本沒有那一行。

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

### 🔴 三件必須知道的事

**① 不要把資源建進 `rg-20skin-prod`。**
那是**線上預約系統**的正式環境，正在服務 `booking.20skin.tw` —— `swa-20skin-customer-prod`
（Standard）、`swa-20skin-admin-prod`、`func-20skin-api-prod`（`ApiRouter` ＋ `SmsReminder`）。
而預約系統正是 CLAUDE.md 決策 4 明文排除在本專案外的東西。部署進去會**弄壞診所營運中的預約**。

**② 儲存體帳戶只差一個字，本機範本指錯到預約系統。**
`st20skinweb`（`rg-20skin-web-prod`）是本專案的；**`st20skinprod`（`rg-20skin-prod`）是線上預約系統的**。
`functions/local.settings.example.json` 原本寫成後者，2026-09-11 已修。
正式環境的 app setting 一直是對的（`st20skinweb`），錯的只有本機範本 ——
**這種錯不會有任何錯誤訊息**：SAS 照簽、上傳照成功，只是檔案寫進了診所營運中的系統。
⚠️ 查這件事時 `az functionapp config appsettings list` 連帶印出了
`DEPLOYMENT_STORAGE_CONNECTION_STRING` 的帳戶金鑰明文，**建議輪替**
（`az storage account keys renew -g rg-20skin-web-prod -n st20skinweb --key key1`，
輪替後要更新該 app setting）。

**③ SWA 由 Free 改為 Standard。**
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
| schema | **35 張表 ＋ 165 列種子已套用**，用 `efbundle`（docs/11 §13）。**10 支遷移全部套用**（2026-09-14），見下方 |
| 驗證 | `InitialSchema` 當時：表數 37、匿名約束 0、AI FAQ 開關 `false`、外部網域 2 筆 |

### ✅ 測試站 `20skin.4webdemo.com`（2026-09-14 打通）

測試網域是 **`20skin.4webdemo.com`**（已綁上 SWA、狀態 Ready，CORS 只放行它）。
🔴 **正式網域 `20skin.tw` 尚未進場** —— 相關的 DNS 與自訂網域綁定都還沒做。

原本兩個前端在建置時把 `https://api.20skin.tw/api/v1` 烤進產物，而那個主機名稱
公開 DNS 查不到 —— 表單送出與後台登入都是 `ERR_NAME_NOT_RESOLVED`。
**測試期改指 Function App 的預設主機名稱**，不必動任何 DNS：

```bash
API='https://func-20skin-web-api-prod.azurewebsites.net/api/v1'
NUXT_PUBLIC_API_BASE_URL="$API" VITE_API_BASE_URL="$API" \
NUXT_PUBLIC_RECAPTCHA_SITE_KEY='<site key>' VITE_RECAPTCHA_SITE_KEY='<site key>' \
  tools/deploy-swa.sh
```

⚠️ **上線時要再重建一次**，把位址換回 `api.20skin.tw`，那時才需要做子網域綁定
（DNS 加 CNAME ＋ Azure 加自訂網域 ＋ 簽憑證）。已列進 §七。

端到端驗證（真瀏覽器 → 真 reCAPTCHA token → 真 API → 真 Google siteverify），**8 項全過**：

| 驗什麼 | 結果 |
|---|---|
| `GET /site-settings/public`（CORS 有放行） | ✅ |
| 站內搜尋查無結果 → `POST /questions/miss` | ✅ **Google 判定為真人並放行** |
| 後台登入頁的 reCAPTCHA 聲明文字 | ✅ |
| 錯誤帳密 → 通過機器人驗證、擋在帳密 | ✅ 證明 token 有效 |
| 種子帳號登入 → 導向「首登強制改密碼」 | ✅ |

### 🔴 只有端到端才抓得到的一個 bug：action 名稱不可有連字號

reCAPTCHA v3 的 action 只接受 `A-Za-z/_`。原本用的是 **`questions-miss`** ——
`grecaptcha.execute` **不會丟例外**，只在 console 印一行 `Invalid action name`
然後把 action 丟掉，伺服器端的比對就永遠對不上，使用者看到的是一般的
「自動化驗證未通過」。`contact` 與 `login` 沒有連字號，所以只有這一支壞掉。

⚠️ **本機那套假的 siteverify 抓不到這個** —— 它給什麼就回什麼。這是只有對真的 Google
跑才會現形的一類錯誤。已改為 `questions_miss`，並在兩支前端取 token 的模組加上格式檢查
（不合法當場丟例外，不要等上線）。
⚠️ 速率限制的鍵仍是 `questions-miss`（`LoginThrottles` 裡的既有資料列），刻意不同名。

### ✅ 第 3–10 支遷移（2026-09-14 全部套用到正式庫）

以本機 `efbundle` 執行，身分是伺服器的 Entra 管理員。⚠️ **順序是「先遷移、後部署」**
（CLAUDE.md 決策 8）—— 新版程式會讀 `Facts`、`RecommendationIntro`、主幹的 `Summary`，
先部署會炸在缺欄位上。

⚠️ 第 4 支（`MoveSummaryToContentTrunk`）會 `DROP COLUMN Articles.Summary`，
但**在那之前先把資料複製到 `ContentItems.Summary`**（產生的 SQL 逐行確認過），沒有遺失。
回復點：Azure SQL 的 PITR 涵蓋到 2026-09-11 09:10Z。

| # | 遷移 | 內容 |
|---|---|---|
| 3 | `AddContentFieldsForMigration` | 四個內容欄位，見下表 |
| 4 | `MoveSummaryToContentTrunk` | `Summary` 移到內容主幹 `ContentItems` |
| 5 | `AddTreatmentFactsAndConcernIntro` | `Treatments.Facts`、`Concerns.RecommendationIntro` |
| 6 | `AddDoctorToConcernRelation` | 新的 `RelationType` |
| 7 | `AddConcernToConcernRelation` | 新的 `RelationType` |
| 8 | `AddSitemapFilesSetting`（2026-09-12） | 種子加一列 `seo.sitemapFiles`（sitemap 分檔設定）。**只 INSERT 一列，向後相容** |
| 9 | `SeedRobotsTxtGuardrails`（2026-09-12） | robots.txt 的種子值加上兩行警語（不封鎖 AI 爬蟲、不要寫 `Disallow: /admin/`）。⚠️ **只在值仍是原始種子時才更新** —— EF 產出的 `UpdateData` 是無條件覆蓋，會把院方改過的 robots.txt 靜靜蓋掉 |
| 10 | `RenameMakeupStylePageTitle`（2026-09-14） | 頁面 1114（`/about/makeup-style/`）的種子標題「彩妝式輕醫美」→「新中式美學」。只 `UpdateData` 一格，向後相容。⚠️ **這只改種子／工作副本的 `ContentItems.Title`** —— 前台匯出讀的是已核准的版本快照（`tools/content-export` 的 `TitleOf`），正式庫要改名還是得在後台改完後**重新發布**該頁 |

第 3 支的四個欄位（已對本機 `Skin20_Dev` 實跑）：

| 欄位 | 為什麼非補不可 |
|---|---|
| `DoctorCredentials.Type` 放寬到 **4＝現職** | 個人頁時間軸把「現職」與「經歷」當兩種標籤，併一起畫面標籤就變了 |
| `DoctorTags.Type`（1 專長標籤／2 擅長項目） | 個人頁是兩個區塊，沒有這欄會混成同一串 |
| `Faqs.ReviewedBy` nvarchar(100) | 「這則答案由誰確認過」，前台有顯示 |
| `Treatments.Steps` nvarchar(max) | 療程流程。與「原理」是細節頁兩個區塊，併一格後台會看到兩件事混在一起 |

⚠️ `DoctorTags.Type` 的一次性回填值手動改成 1（EF 預設產 0，會違反 `CK_DoctorTags_Type`）。
兩邊的 `DoctorTags` 目前都是空的，但遷移不該只在空表上成立（docs/11 §13）。

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

1. `tools/deploy-api.sh` 重新部署 `func-20skin-web-api-prod`
   ⚠️ **這支腳本 2026-09-11 新寫、尚未對 Azure 實跑驗證** —— 在此之前這個 App
   是手動部署的，repo 裡沒有紀錄。權威來源是 `docs/templates/deploy-api.yml`（CI 版），
   本腳本是它的本機等價物。**第一次跑請盯著輸出，跑通後把檔頭那段警告拿掉。**
   ⚠️ `tools/deploy-swa.sh` **不含這個 App**，那支只管 SWA 的前台／後台／`/api/fallback`；
   獨立 Function App 不隨內容重建（CLAUDE.md 決策 7）
2. `tools/deploy-swa.sh` 重新部署前台與 `apps/admin` 產物（媒體庫畫面已拿掉）
   🔴 **這一步同時修掉一個正式環境上的既有故障**：`staticwebapp.config.json` 的
   `/admin/*` rewrite 把 `/admin/static/*.js` 也改寫成 `index.html`，
   **後台在正式環境上是白畫面**（2026-09-11 實測：`/admin/` 與它的 JS 回同一份 740 bytes）。
   已補一條 `/admin/static/*` 排在它前面，但**要重新部署才會生效**。
   與這輪的媒體庫改動無關，來自 `7d6e65b` 的 workspace 重構。

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
- [ ] **`api.20skin.tw` 綁到 Function App**（DNS 加 CNAME ＋ Azure 加自訂網域 ＋ 簽憑證）
      ＋ **用該位址重建前台與後台**（測試期指的是 `func-20skin-web-api-prod.azurewebsites.net`）
      ＋ **CORS 加上正式前台來源** —— 🔴 三件缺一，切 DNS 當天表單與後台就同時停擺
- [ ] **reCAPTCHA 後台的網域清單加上正式網域**（測試網域 `20skin.4webdemo.com` 已驗證可用）
- [ ] **SMTP 設定**（`Smtp__Host`／`Smtp__FromAddress`…）與 `contact.recipientEmail` —— 🔴 目前**都沒設**，表單就算通過驗證也不會寄出任何通知信，只會在 log 留 warning
- [ ] **`aifaq.enabled` 在正式庫必須是 `false`**（docs/04 §4）—— 匯入腳本曾把它蓋成 `true`（已修，見 §二）
- [ ] **reCAPTCHA v3 的金鑰對**（[10](docs/10-api.md) §5.1）—— 🔴 **三個地方要一起設**：
      `BotCheck__SecretKey`（Function App）、`NUXT_PUBLIC_RECAPTCHA_SITE_KEY`（前台建置）、
      `VITE_RECAPTCHA_SITE_KEY`（後台建置）。
      ⚠️ 只設後端不設前端＝**所有送出與登入都被擋**，而錯誤訊息指不到這個原因
- [ ] **reCAPTCHA 的分數分佈**（App Insights）—— 上線頭幾天看一次真實分數，
      再決定 `BotCheck__MinimumScore` 要不要動。**預設 0.5 不要先調高**
- [ ] **確認 reCAPTCHA 的聲明文字有顯示**（`/contact/` 與 `/admin/` 登入頁）——
      徽章是隱藏的，Google 的條款要求顯示那段文字與兩個連結，拿掉聲明就不可以隱藏徽章
- [ ] AI 爬蟲以實際 UA 逐一驗證回應 200
- [ ] **`/about/makeup-style/` 在正式庫已改名為「新中式美學」**（2026-09-14 更名）——
      repo 端（種子、遷移 10、前台文案、mockup、docs、客戶 PDF）都改完了，
      但**資料庫裡的頁面標題、導覽選單標籤與內文仍是舊名**。
      要在後台改完 → **重新發布該頁**（匯出讀的是已核准的版本快照，不是 `ContentItems.Title`）
      → 重跑 `pnpm --filter web export:content`。
      ⚠️ 連帶三處目前會出現重複字樣，需院方決定要不要合併：
      首頁品牌理念兩格同名、AI FAQ 兩題重複、`/about/` 底下兩個同名頁面

---

## 八、擋住的事項

### 🔴 需要你決定

| 項目 | 說明 |
|---|---|
| **`Remote_GitHub` 的 URL** | 沒有它推不了 public 分支 |
| **FAQ 五大分類，兩份文件對不上** | [08](docs/08-database.md) §C-9 種子（品牌與診所／療程相關／肌膚困擾／醫師與看診／費用與流程）vs `mockup/16-faq.html`（療程相關／術後照護／看診與預約／費用與付款／院所資訊）。**建議以 mockup 為準** —— 前者沒有 slug，且「肌膚困擾」與 `/concerns/` 整段重複。動到網址結構，所以先不改 |
| 圖片衍生尺寸誰產 | 瀏覽器端上傳前轉檔 vs Function 端 sharp（[07](docs/07-deployment.md) §3） |
| 301 對照表是否改建置期烤 `redirects.json` | 可省掉 SWA 上唯一的明文密鑰（[07](docs/07-deployment.md) §2） |
| ~~機器人驗證供應商~~ | ✅ **已定案並實作（2026-09-12）：reCAPTCHA v3**。見 §五 |
| **301 的「命中次數」放不進架構** | 後台原本想用命中次數排出「哪幾條值得寫進 `staticwebapp.config.json` 快速路徑」，但 [`Redirects`](docs/08-database.md) §H **沒有這個欄位，而且放不了**：`/api/fallback` 對這張表只做單筆 seek 不做寫入，它那組唯讀 SQL 使用者**只能 SELECT 這一張表**。<br>已改為顯示「目前已寫進設定檔的 7 條」（人工挑定，與 `apps/web/public/staticwebapp.config.json` 一致）。<br>若真的要命中次數，唯一不牴觸架構的作法是 **Application Insights 的請求記錄離線彙總**，需另案評估。 |
| **醫師的「醫學審閱」無法實作** | [02](docs/02-backend-cms.md) §4 寫醫師「可對**指派**內容執行醫學審閱」，但 ①「醫師」角色只有 `review.decide`、沒有 `review.view`，進不了審核佇列；② [`ContentReviews`](docs/08-database.md) §B-3 **沒有「指派給誰」的欄位**，做不出「只看指派給我的」。<br>唯一現成的線索是 `Articles.ReviewerDoctorId`（審閱醫師），**但只有文章有**，療程與案例都沒有。<br>三個選項：**(a)** 醫學審閱只涵蓋文章，用 `ReviewerDoctorId` 篩選；**(b)** 為 `ContentReviews` 加 `AssignedReviewerId`（**新增欄位，與 [08](docs/08-database.md) §0 決策二「不預留未定案的欄位」相衝，需明確定案**）；**(c)** 拿掉醫師的審閱職責，只留「編輯自己的內容」。<br>⚠️ **在定案之前不要自行加欄位。** |
| ~~`RefreshTokens` vs 短效 JWT ＋ `SecurityStamp`~~ | ✅ **已定案（2026-09-11）：採 `RefreshTokens` ＋ rotation**。後台只剩一道防線，「停用帳號要能**即時**失效」比省一張表重要，短效 JWT 仍有空窗 |
| **`llms.txt` 的內容範圍** | [03](docs/03-seo-geo.md) §4 ④ 說它是全站核心資訊 ＋ 頁面索引，[04](docs/04-ai-faq.md) §3 只定義了 FAQ 專屬的 `faq.json`／`llms-full.txt` —— **兩份文件對 `llms.txt` 沒有交集的權威定義**。目前實作比照 sitemap 的資料來源、依型別分組各取前 20 筆，**是假設不是規格** |
| **後台密碼強度與輪替規則** | [02](docs/02-backend-cms.md) §4 註明待訂。目前用 ≥8 碼的保守底線。🔴 沒有雙因素，帳密是唯一憑證 —— 這條不該一直待訂 |

### 🟡 安全防線：一主一補

原規劃三道：雙因素（2026-09-11 不做）、IP 白名單（2026-08-13 不做）、登入次數限制。
2026-09-12 補上 **reCAPTCHA v3** 作為第二道，擋的是次數限制抓不到的**分散式撞庫**
（每個 IP 只試幾次、換一批 IP 再來）。

⚠️ **它不能取代次數限制** —— v3 是分數制、連不上 Google 時放行（否則後台會整個登不進去）。
⚠️ **它也帶來一個新的失效模式**：金鑰設錯或 script 被擋時沒有人登得進後台。
逃生口是清空 Function App 的 `BotCheck__SecretKey`（立即生效，不需重新部署）。
⚠️ 後台路徑 `/admin/` 仍是客戶指定、與舊站相同、公開可猜。

連帶要求（已寫進 [02](docs/02-backend-cms.md) §4、[07](docs/07-deployment.md) §2、[10](docs/10-api.md) §3.2）：
次數限制必須**帳號 ＋ 來源 IP 雙維度計數**、鎖定即時告警、**種子密碼上線前必須更換**、
需訂定密碼強度與輪替規則。

### 🔴 待院方或主機商提供

完整 `product*.php` 清單（找孤兒頁面）、Search Console 近 12 個月 URL 匯出、access log、
現行 `/admin/` 功能清單、Mod_Security 規則、**兩組 SQL 使用者 ＋ 一組唯讀連線字串 ＋ 防火牆放行**、
`api.20skin.tw` 的 CORS、`reference/banner1-L.jpg` 原始檔、兩個院區的**真實地址與電話**
（目前是 `04-XXX-XXXX`／`○○路○○號` 佔位值，連 JSON-LD 的 `geo` 都輸出不了）。

### ✅ 後台 SPA 的權限碼已對齊（2026-09-12 修正）

`apps/admin/src/permissions.ts` 原本用的是 `{unit}.{action}`（`treatment.edit`／`review.decide`／
`user.view`⋯），與 API 和資料庫用的 [08](docs/08-database.md) §A-2 那 31 列對不上。
起因是 [10-api.md](docs/10-api.md) §4 初版自創了一套命名，沒有對齊先前就存在的 `docs/08` §A-2。

修法不只是改名：**`permissions.ts` 不再自己用角色推導權限**，改成查登入回應帶回來的
`permissions[]`（docs/10 §3.2）。理由是後台的角色權限**可以在畫面上改**
（`PUT /admin/role/{id}/permissions`），前端只要自己記一份推導表，改完的那一刻就過期了 ——
而且不會有任何徵兆。路由表與 30 個畫面的呼叫端一併換成新命名。

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
