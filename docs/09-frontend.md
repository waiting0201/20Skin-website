# 09 — 前端技術架構（前台 ＋ 後台）

> 範圍：`apps/` 底下的兩個套件 —— 前台 `apps/web/`（Nuxt 3 純靜態，1845 頁預渲染 HTML）與後台 `apps/admin/`（Vite ＋ Vue 3 的 SPA，掛在 `/admin/`）。pnpm workspace，見 [07-deployment.md](07-deployment.md) §1、§5。
>
> 設計來源是 `mockup/`（方向 A，客戶 2026-08-27 選定）。切版一律以 mockup 為準，不做視覺重新詮釋。
>
> 對應文件：模板與畫面數見 [06-page-inventory.md](06-page-inventory.md)、後台功能規格見 [02-backend-cms.md](02-backend-cms.md)、資料來源見 [10-api.md](10-api.md)。

---

## 1. 兩個套件，一個部署

| | 前台 `apps/web/` | 後台 `apps/admin/` |
|---|---|---|
| 框架 | Nuxt 3，`nuxt generate` | Vite ＋ Vue 3，`base: '/admin/'` |
| 路由 | 檔案路由，`/` 以下全部 | vue-router，`createWebHistory('/admin/')` |
| 渲染 | 建置期產生實體 HTML | 純前端 SPA，不預渲染 |
| 資料 | **建置期烤進 HTML**，執行期不打 API（三個例外見 §4） | 執行期一律打 `api.20skin.tw` |
| 索引 | 要被 Google 與 AI 爬蟲讀到 | `noindex, nofollow` |
| 產物 | `.output/public/` ← **上傳的就是這一包** | `apps/web/public/admin/` ← 被上一格打包進去 |

**兩個套件，但只有一個部署單位。** 後台的 `build.outDir` 直接指向 `../web/public/admin`，沒有複製步驟；`nuxt generate` 把它一起打包。最後仍是同一個 SWA、同一個網域、後台掛在 `/admin/`。

⚠️ **建置有順序相依：先 admin 後 web。**

```bash
pnpm --filter admin build && pnpm --filter web build
```

反過來的話 `nuxt generate` 打包到的是上一次的後台產物，症狀是「後台改了卻沒上線」—— 而且不會有任何錯誤訊息。

**不拆成兩個 repo、兩個 SWA。** SWA Free 的自訂網域額度只有 2 個，已被 `20skin.tw` 與 `www.20skin.tw` 用滿（[07](07-deployment.md) §1）。

> 2026-09-11 改。原本是「同一個 Nuxt 專案用 route rules 切兩種渲染模式」，改成雙套件是為了與 NTI 專案的目錄結構一致，兩案共用同一套心智模型。**部署形態完全沒變。**

⚠️ **`/admin/*` 必須在 `staticwebapp.config.json` 有自己的 `rewrite`**，否則後台的深層連結（`/admin/articles/123`）沒有實體檔案，會掉進 `navigationFallback` → `/api/fallback` → 查 301 對照表 → 404。範本已含，見 [templates/](templates/)。

⚠️ **`nuxt generate` 仍會產出 `.output/server`，那是 nitro 的殘留物，不要上傳。** 那個位置在 SWA 的框架設定裡是 `api_location`，要留給 `/api/fallback`。上傳等於廢掉整批 301。

---

## 2. 目錄結構

```
pnpm-workspace.yaml         # packages = apps/*
apps/
├── web/                    # 前台
│   ├── nuxt.config.ts
│   ├── public/
│   │   ├── staticwebapp.config.json  # ★ 必須在這裡，Nuxt 原樣複製到 .output/public 根目錄
│   │   ├── assets/         # ← mockup/assets 的逐 byte 複製，不進版控
│   │   └── admin/          # ← apps/admin 的建置產物，不進版控
│   ├── app/
│   │   ├── pages/          # 21 個模板（§5）
│   │   ├── components/     # Site{Header,Footer,Consult}，標記照抄 mockup
│   │   ├── composables/    # usePageHead / breadcrumbJsonLd
│   │   └── data/           # 暫時的內容來源，形狀對齊 docs/08 的欄位
│   ├── content/            # ★ 建置期資料快照（§3），不進版控
│   └── scripts/
│       ├── sync-mockup.mjs     # mockup/assets → public/assets
│       ├── verify-css.mjs      # 驗收閘：樣式照抄
│       ├── verify-links.mjs    # 驗收閘：站內連結無斷鏈
│       ├── postbuild.mjs       # 404.html ＋ 產物大小閘
│       ├── export-content.*    # SQL → content/*.json（未實作）
│       ├── build-sitemap.*     # sitemap index ＋ 5 個分檔（未實作）
│       ├── build-llms.*        # llms.txt / llms-full.txt / faq.json（未實作）
│       └── build-swa-config.*  # 高流量 301 寫進設定檔（檢查 20 KB，未實作）
└── admin/                  # 後台（§8）
    ├── vite.config.ts      # base=/admin/、outDir=../web/public/admin
    └── src/
        ├── units/          # 九個內容模型的單元宣告
        ├── components/     # ListPage / EditPage 等通用元件
        ├── pages/          # 儀表板／登入／清單／編輯
        └── api/client.ts   # 唯一的資料存取門面
```

`base.css` 與 `app.js` 的動效系統是**客戶指定保留的部分**（2026-08-19）。移植進 Nuxt 時照搬，不要換成別的動效庫。
**後台不載入 `app.js`**，但沿用 `base.css` 的設計 token（`index.html` 直接 `<link>` 公開站那份 `/assets/base.css`）。

---

## 3. 執行期資料流：每個請求向 API 取

🔴 **2026-09-16 起改成執行期取值**（CLAUDE.md 決策 6、14）。
舊標題是「建置期資料流：先匯出成 JSON，再讓 Nuxt 讀檔」，那套已作廢。

```
瀏覽器請求 /treatments/laser/picosure-pro/
  → SWA → navigationFallback → Nuxt 的 SSR function
  → app/data/*.ts 向 api.20skin.tw 取這一頁要的單元
  → 算繪 HTML → 回應
```

**院方按下發布，下一個請求就看得到。** 中間沒有建置、沒有部署、沒有快取。

### 三條必須守住的規則

🔴 **① 同一個請求內只取一次。**
一頁常有三四個模組都要 `term`（療程要分類、文章要標籤、FAQ 要分類）。
去重掛在 `useNuxtApp()` 上（`loadUnit()`）——
⚠️ **掛在模組層級會變成跨請求共用**，那等於又回到「內容要等重啟才更新」。

🔴 **② 「拿不到」與「查不到」要分開。**

| 情況 | 回應 |
|---|---|
| 端點說「沒有這一筆」 | **404**（那一頁真的不存在） |
| 連不上／逾時／5xx，而它是**頁面的主體內容** | **503** |
| 連不上，而它是**裝飾性資料**（選單、熱門標籤、全站設定） | 降級，照常算繪 |

⚠️ 兩者都回 `null` 的話，API 掛掉時內頁會變成 **404** —— 那是對搜尋引擎說
「這一頁永久不存在」。2026-09-15 實測過：把 API 停掉，`/clinics/siji/` 當場變 404。
⚠️ **回 200 配空畫面更糟**：Google 可能把空殼收進索引。

🔴 **③ `experimental.asyncContext` 必須開著。**
`useNuxtApp()` 在 `await` 之後會失去 context。少了這個選項，跨 `await` 的取值會丟
`[nuxt] instance unavailable` —— 不是建置期錯誤，是算繪當下的 500。
⚠️ **症狀有欺騙性**：沒有跨 await 呼叫的頁面照常 200，看起來像「某幾頁的資料有問題」。
2026-09-15 實測 16 頁裡 9 頁掛掉。

### `data/*.ts` 仍是形狀轉接層

欄位怎麼排、叫什麼名字仍是前台的契約，只是資料來源換了。
那 2397 行的對映幾乎沒有改 —— 端點刻意回傳與匯出相同的 `ContentRecord` 形狀
（逐筆比對驗證過）。

⚠️ **唯一需要重新設計而不只是改寫法的是 `articles.ts`**：
原本 `export const ARTICLES = CONTENT.articles`（1111 筆在模組層級載入）。
執行期不能這樣做 —— 列表走分頁端點、內頁走 by-path、篩選與排序與聚合交給 API。

> 🔴 **文章內文不在 `articles.json` 裡，在 `content/article-bodies/{slug}.json`。**
> `app/data/_content.ts` 是 `import articlesJson from '~~/content/articles.json'` ——
> **Vite 會把整份 JSON 內聯進一個每一頁都要下載的共用 chunk**。
> 種子資料只有 11 篇、內文全是 null 時看不出問題；搬進舊站的 1100 篇之後，
> 光內文就 4.5 MB，等於首頁訪客要先下載全站文章的全文才看得到畫面，
> **而建置不會有任何警告**（2026-09-14 實測共用 chunk 384 KB，index.html 直接引用）。
>
> 所以 `tools/content-export` 把內文拆成一篇一個檔，前台用
> `import.meta.glob` 動態載入（`data/articles.ts` 的 `getArticleBody()`），
> Vite 為每一篇產生獨立 chunk。預渲染時內文會被寫進該頁的 HTML 與 `_payload.json`，
> 讀者不會多發一個請求。
>
> ⚠️ 判斷準則：**放進 `content/*.json` 的東西，每一位訪客都會下載。**
> 清單頁要用的欄位（標題、摘要、封面、日期）留在裡面是對的；
> 只有單一頁面會用到又很大的東西，要拆出去。

**為什麼要中間這層 JSON，而不是讓 Nuxt 在 prerender 時直接查資料庫：**

| 理由 | 說明 |
|---|---|
| 950 次 route render × N 次查詢 | 直接查 DB 會在 build 期間打出數千次往返。一次匯出、之後全部讀檔，build 時間可預測 |
| build 產物可重現、可除錯 | 「上線的那一版內容長什麼樣」是一個可留存的檔案，不是某次 build 當下的資料庫狀態 |
| 資料庫驅動不進前端相依 | Nuxt 端不需要 `mssql` 之類的套件，也不需要在 build 環境處理 Entra 驗證 |
| 防火牆開窗時間最短 | GitHub runner 的 IP 是浮動的，要由 CI 動態開關防火牆規則（[07](07-deployment.md) §6）。只有步驟 ① 需要連線，開窗從「整個 build」縮成「幾十秒」 |

匯出範圍就是 [08-database.md](08-database.md) §0 決策一說的那一個查詢 —— `ContentItems` 主幹 join 九張 TPT 子表、`SeoMeta`、`ContentRelations`、`MediaUsages`。**共用主幹表的價值在這裡兌現**：一次撈完，不是九個 union。

🔴 **匯出讀的是「已核准的那一版快照」，不是 `ContentItems` 的即時欄位。**

```
ContentVersions.Snapshot  WHERE Id = ContentItems.PublishedVersionId
```

⚠️ **這一點做錯的後果是二選一的災難**，而且兩種都比沒做還糟：

| 做法 | 後果 |
|---|---|
| 讀即時欄位 ＋ 可見性看 `Status = 3` | 編輯一個已上線的療程頁，它會**從網站上消失（404）**，直到重新核准 |
| 讀即時欄位 ＋ 可見性不看 `Status` | **未經審核的編輯直接上線** —— 醫療內容的審核閘形同虛設 |
| **讀已核准的快照 ＋ 可見性看 `PublishedVersionId`** | ✅ 編輯期間頁面照常在線上顯示舊版，核准後才換新版 |

可見性判定式與 API 共用同一段（[11-backend-design.md](11-backend-design.md) §6.4）：

```
PublishedVersionId IS NOT NULL
AND Status <> 4（已下架）
AND (PublishAt   IS NULL OR PublishAt   <= @now)
AND (UnpublishAt IS NULL OR UnpublishAt >  @now)
```

條件寫兩份遲早會分岔，症狀是「列表看得到、點進去 404」。

> ⚠️ 本節初版寫「只匯出 `Status = 3` 的即時欄位」，與 [11](11-backend-design.md) §7 規則 2
> 相衝，**2026-09-11 更正**。

⚠️ **`_payload.json` 要一起量。** Nuxt 預渲染會為每條路由額外產出一份 payload，950 條路由就是 950 個檔案，[07](07-deployment.md) §3 的 90 MB 估算沒有計入這一項。壓不下來時可在 `nuxt.config` 關掉 `renderJsonPayloads`，代價是首次導航多打一次資料。

---

## 4. 執行期端點

🔴 **2026-09-16 起「執行期不打 API」這個原則整個反過來了** —— 前台每一頁都打。
舊標題是「純靜態站的三個執行期例外」。

⚠️ **不變的是「初始 HTML 必須完整」**：AI 爬蟲不執行 JavaScript，SPA-only 的內容對它們
等於不存在。SSR 反而讓這件事更穩 —— 內容在伺服器端就算繪進 HTML，不依賴 hydration。

除了每頁都要的內容讀取（§3）之外，另外三支是**使用者動作**觸發的：

| 例外 | 端點 | 說明 |
|---|---|---|
| `/contact/` 表單送出 | `POST /contact` | 只寄通知信、**不留存收件紀錄**（[02](02-backend-cms.md) §2，個資責任）。送出結果在 client 端呈現 |
| `/search/` 未命中回寫 | `POST /questions/miss` | 站內搜尋走 `GET /search`（見下）；只有「API 正常回應、而且真的零筆」時才回寫一筆到 `QuestionInbox`（[08](08-database.md) §F） |
| AI FAQ 啟用開關 | `GET /site-settings/public` | [04-ai-faq.md](04-ai-faq.md) §4 要求「啟用只需後台一個開關，不需重新部署」。這是 [08](08-database.md) §L 的待確認項，見 §13 |

三者都是公開寫入／讀取端點，**需要防濫用機制**（rate limit ＋ 機器人驗證），見 [10-api.md](10-api.md) §2。

### 站內搜尋的做法（2026-09-16 改為 API）

`/search/` 呼叫 **`GET /search?q=`**（[10](10-api.md) §3），伺服器端對已核准的版本快照
做子字串比對；前端只負責排版、型別篩選與關鍵字標記。

🔴 **2026-09-16 之前是「建置期索引 ＋ client 端比對」，換掉它的理由不是效能。**
那份 `public/search-index.json` 是**建置期**產物 —— 全站改 SSR 之後，它是唯一還需要等
重新建置才會更新的東西。院方發布一篇新文章，站內搜尋卻搜不到，而畫面上不會有任何徵兆。
換掉之後「發布即時可見」才真的全站成立。（`scripts/build-search-index.mjs` 與那支索引檔已刪除。）

- ⚠️ **比對範圍因此變大了。** 舊索引的比對欄位只存「標題＋摘要＋內文」的**前 600 字**，
  超過的部分搜不到。2026-09-16 實測：「皮秒雷射」由 71 筆變成 309 筆，
  且舊索引找得到的**全部涵蓋**（11 個關鍵字逐一比對，涵蓋率 100%）
- 🔴 **不設筆數上限，這是刻意的。** 畫面上有「型別篩選 tab ＋ 各類筆數」，
  任何上限都會讓那些數字變成謊話。而且排序是「標題命中優先、再依型別」，
  截斷不是均勻掉幾筆而是**整類整類地砍掉**：實測上限 100 時「黃勇學」只涵蓋舊索引 77 筆裡的 29 筆；
  放寬到 300 時「皮秒」竟然比「皮秒雷射」還少（268 < 277）—— 子字串查詢回得比超字串少，
  這種結果沒有人能理解，而它只是截斷的副作用
- ⚠️ **真正的上限是語料本身**：可索引內容約 1228 筆，最壞情況是全中。
  本機實測最壞情況（搜 `a`）1228 筆、回應 **309 KB**、0.2–1.2 秒 ——
  相較之下舊做法是**每次進搜尋頁就下載 564 KB**。不設上限連傳輸量都比舊做法省
- ⚠️ 代價是這條查詢對 `Snapshot`（NVARCHAR(MAX)）做 `LIKE` 全表掃描，索引幫不上忙。
  內容量成長到數千筆時的升級路徑是 **SQL Server 全文檢索（`CONTAINS`）**，不是把上限加回來
- ⚠️ **中文不斷詞，用子字串比對**（`LIKE`）。斷詞器對醫療專有名詞切得很差
  （「皮秒雷射」→「皮」「秒」「雷射」）
- 🔴 **搜尋與頁面讀同一份已核准快照**，所以不會出現「搜尋得到、點進去 404」——
  這是舊做法（索引與頁面同源）唯一值得保留的性質，不要讓搜尋改讀 `ContentItems` 即時欄位
- ⚠️ **摘要要逸出再標記。** 命中的關鍵字用 `<mark>` 包起來（mockup 的呈現方式），
  所以那段是 `v-html` —— 摘要來自資料庫，不先逸出就是一個 XSS 入口
- FAQ 沒有獨立網址（[08](08-database.md) §C-6），結果指到它所屬的分類頁；
  文章標籤（`termType=4`）不進結果，理由同它們 `noIndex`：內容單薄，只會稀釋結果
- 🔴 **「查無結果」與「連不上」必須分開。** 只有前者才回寫 `POST /questions/miss` ——
  連不上時回寫等於把故障寫成一堆假的「使用者問了我們答不出來的問題」，而題庫的去重會讓假資料留下來。
  畫面上同理：連不上時說的是「搜尋暫時無法使用」，不是「沒有找到結果」
- 回寫**只帶問題文字**，且**失敗一律靜默** —— 那是背景的內容分析，不是使用者要求的動作，
  而它有頻率限制（同 IP 每小時 10 次）。**只在 client 端回寫**：SSR 期間送出的話，
  來源 IP 會是伺服器，頻率限制會把全站的搜尋算成同一個人

⚠️ API 全掛時整站 503（主體內容拿不到就是 5xx，見 §3），搜尋頁不例外。
上面那段「搜尋暫時無法使用」的文案，涵蓋的是**只有 `/search` 失敗、其他還活著**的情況。

---

## 5. 21 個模板 → 頁面對應

模板清單與 URL 對應以 [06-page-inventory.md](06-page-inventory.md) §1 為準，`mockup/` 的檔名即模板編號：

| mockup | 模板 | Nuxt 路由 | 資料來源（`content/*.json`） |
|---|---|---|---|
| `index` | 首頁 | `/` | `HomeSections` ＋ 各版位引用的內容（[02](02-backend-cms.md) §3） |
| `09`、`10` | 品牌理念、長版故事 | `/about/`、`/about/{slug}/` | Pages（自由頁） |
| `11`、`05` | 醫師列表、個人頁 | `/team/`、`/team/{slug}/` | Doctors ＋ Credentials／Schedules |
| `12`、`03`、`04` | 療程總覽、分類、細節 | `/treatments/`、`/{category}/`、`/{category}/{slug}/` | Terms（療程分類）＋ Treatments |
| `13`、`02` | 困擾總覽、細節 | `/concerns/`、`/concerns/{slug}/` | Concerns ＋ 建議療程關聯 |
| `06`、`07` | 文章列表、內頁 | `/blog/`、`/blog/{category}/`、`/blog/tag/{tag}/`、`/blog/{slug}/` | Articles ＋ Terms |
| `14`、`15` | 案例列表、內頁 | `/cases/`、`/cases/{slug}/` | Cases ＋ **法規揭露欄位** |
| `16` | FAQ | `/faq/`、`/faq/{category}/` | Faqs ＋ Terms（FAQ 分類） |
| `17`、`08` | 據點列表、細節 | `/clinics/`、`/clinics/{slug}/` | Clinics ＋ BusinessHours |
| `18` | 聯絡我們 | `/contact/` | Pages（系統頁）＋ §4 表單 |
| `19`、`20`、`21` | 搜尋、404、法務頁 | `/search/`、404、`/privacy/` 等 | Pages ＋ §4 索引 |

**路由不要自己拼。** `ContentItems.UrlPath` 是儲存時由後端算好寫入的完整路徑，且有 filtered unique index 保證全站唯一（[08](08-database.md) §B-1）。前端**照著 `UrlPath` 產生路由與連結**，不要在前端重算一次規則 —— 重算的那一份一定會跟資料庫分岔，而分岔的症狀是 301 對照表指向一個不存在的頁面。

`trailingSlash: "always"` 與預渲染的目錄式輸出（`/treatments/laser/index.html`）一致，這個設定要和 301 的目標網址一致，否則每次轉址都多跳一次。

---

## 6. SEO 與 GEO 的落地位置

[03-seo-geo.md](03-seo-geo.md) 的要求幾乎全部落在前端渲染這一層。逐項對應：

| 要求 | 落地 |
|---|---|
| 每頁 Title／Meta／canonical／OG | `usePageHead()` composable 讀 `SeoMeta`；留空時由內容自動組出（規則與後台的預覽一致） |
| **AI 摘要放頁面最上方** | `SeoMeta.AiSummary`（40–60 字）渲染成第一段可見文字，**同時**輸出至結構化資料。不是只放進 meta |
| 8 類 JSON-LD | `usePageHead({ jsonLd })`，一個模板一種 schema 型別（[03](03-seo-geo.md) §2）。`StructuredDataOverride` 有值時整段取代 |
| BreadcrumbList | `breadcrumbJsonLd()`；麵包屑元件由 `UrlPath` 推導層級 |
| `NoIndex` | 逐頁 meta robots。⚠️ 與 `IncludeInSitemap` 是兩件事，標籤頁兩者都要設（[08](08-database.md) §B-4） |
| sitemap 分檔、`llms.txt`、`faq.json` | **建置期腳本產生**，不是前端渲染，也不走 API（[07](07-deployment.md) §4） |
| CWV：LCP < 2.5s、INP < 200ms、CLS < 0.1 | §7 |

⚠️ **重要內容不得只靠 JavaScript 渲染。** 療程說明、FAQ、醫師資料必須存在於初始 HTML。這是整份 GEO 策略的先決條件，也是選純靜態而非 SPA 的唯一理由。

---

## 7. 圖片與字型

**架構中沒有 CDN，圖片由 Blob Storage 直接服務**（[07](07-deployment.md) §3）。因此：

- 上傳時就寫入長效 `Cache-Control`。**檔名是隨機唯一值，不是內容雜湊** —— 一個欄位獨佔一個 blob，不跨內容去重（[08](08-database.md) §0 決策四）。內容永遠不變，一樣可以用 `immutable` 快取
- `srcset` 的各尺寸來自圖片欄位的 `{前綴}Variants`（JSON，[08](08-database.md) §0 決策四）。**衍生尺寸由誰產是待決項**（瀏覽器端上傳前轉檔 vs Function 端以 sharp 轉檔，[07](07-deployment.md) §3 末段）—— 前端這側兩種都吃得下，但要先定案才能寫上傳流程
- 每張圖必須有明確的 `width`／`height`，這是 CLS 的主要來源
- 首屏外一律 lazy load

**繁中字型必須子集化**（未子集化一套 5–15 MB，在 250 MB 的預算裡不可忽略）。改了 mockup 或前台的文案之後要重跑：

```bash
./scripts/build-mockup-fonts.sh
```

⚠️ 子集化的字元集要涵蓋**資料庫裡的內容**，不只是 mockup 的樣稿文案。950 頁的實際用字遠多於樣稿 —— 子集少了字，前台會出現豆腐字，而這是建置期檢查不出來的。建議由 `content/*.json` 產生字元集。

---

## 8. 後台 SPA

30 個畫面（[06](06-page-inventory.md) §5），全部在 `/admin/**`，`ssr: false`。
（原本是 31 —— 2026-09-11 定案不做媒體庫，「資產／媒體庫」整個拿掉，CLAUDE.md 決策 13。）

### 認證與授權

- **Bearer token，不使用跨來源 cookie。** 前台在 `20skin.tw`、API 在 `api.20skin.tw`，兩者不同源（[07](07-deployment.md) §1）
- **access token 只放記憶體**，refresh 走 [10-api.md](10-api.md) §3.2 的端點。放 `localStorage` 等於把 token 交給任何一次 XSS
- 🟡 **refresh token 放 `sessionStorage`**（Tim 定案 2026-09-18）。原本兩顆都只放記憶體，連帶後果是**重新整理分頁就會登出** —— 編輯到一半按 F5、或後台開著隔天回來都要重打帳密。正常作法是 httpOnly cookie，但本專案明文不使用跨來源 cookie（[07](07-deployment.md) §1）而後台與 API 不同網域，那條路從架構上就關掉了
  - ⚠️ **是 `sessionStorage` 不是 `localStorage`**：分頁關掉就沒了，換到的是「重新整理不登出」而不是「這台機器永久登入」
  - ⚠️ 代價：一次 XSS 可以拿走 refresh token（30 天有效），而後台沒有 IP 白名單也沒有雙因素（CLAUDE.md 決策 10）。接得住的只剩後端的輪替 —— 舊 token 一被重用就撤銷該使用者全部憑證（[11](11-backend-design.md) §5.2）
  - 🔴 **還原要在掛載 app 之前做完**（`main.ts` 先 `await restoreSession()` 再 `mount`）。路由守衛只看「現在是不是已登入」，換發還沒回來就掛載的症狀是每次重整都先閃一下登入頁
  - 🔴 **`/auth/logout` 一定要把 refresh token 送過去**，後端那一支靠 body 裡的 token 找出要撤銷哪一筆；不送等於空操作，那顆憑證會活到自然過期 —— 憑證持久化之後這件事才真的有後果
  - ⚠️ **複製分頁會把 `sessionStorage` 一起複製過去**，兩個分頁各自換發會觸發「重用即全撤」而一起被踢出去。已知邊角，重新登入即可
- ⚠️ **401 只自動換發並重試一次**，而且併發時只能換一次：refresh 是輪替制（[10](10-api.md) §5），三個請求各自去換發會讓第二、三個拿著已被輪替掉的舊 token，後端判定為重用、撤銷該使用者全部 token，使用者當場被踢出去
- ⚠️ **權限判斷查的是登入回應帶回來的 `permissions[]`**（[10](10-api.md) §3.2），前端不自己用角色推導 —— 角色權限可以在後台改，推導表在那一刻就過期了
- **沒有雙因素**（2026-09-11 院方決定）。登入是單段的帳號密碼，**唯一的防護是次數限制**（[02](02-backend-cms.md) §4）—— 前端不要自行加「記住此裝置」之類會放寬判定的東西
- ⚠️ **UI 的權限判斷只管「看不看得到」，不是安全邊界。** 五種角色的授權**一律在 API 內驗證**（[07](07-deployment.md) §4）。前端藏起來的按鈕，後端還是要擋
- ⚠️ **不要用 SWA 的 `allowedRoles`。** 那是 SWA 內建驗證，跟 CMS 的五種角色是兩套系統，而且 `x-ms-client-principal` 到不了外部的 Function App

### 選項與關聯挑選器

- 🔴 **挑選器的選項「打開才載」，而且只載第一頁**（100 筆）。掛載就載等於「使用者不會動的欄位也照樣把整個單元抓回來」——首頁版位編排實測 35 次請求裡有 24 次是這樣來的（文章 1100 筆 ÷ 100）
- ⚠️ 超過一頁的單元（文章、標籤 406 筆）改出現**關鍵字搜尋框**（`taxonomy.unitOptionsPage`）。塞 1100 個 `<option>` 的下拉本來就不是能用的介面
- 🔴 **能由 API 一起帶回來的顯示欄位就不要另外查**：版位項目的標題在 `HomeSectionItemDto.ContentTitle` 裡，不需要拿 id 去把整個單元抓回來配
- ⚠️ 選項載不回來要**明說**——空的下拉會被讀成「沒有東西可選」，接著使用者就把原本的值清掉了

### 編輯畫面的版面

- 兩欄：主欄 ＋ 右欄。內容編輯頁的右欄是排程／危險區（300px，sticky）；首頁版位編排的右欄是主視覺輪播（400px，**不 sticky**——它是那一頁最高的卡片）
- 🔴 **標題列 sticky**（`.adm-editor > .adm-page__head`），發布與儲存捲不走。`>` 不可省：`.adm-page__head` 也被當成卡片內的標題列用
- 🔴 右欄的 sticky 頂端要讓開標題列，而標題列高度會變 —— `src/sticky-head.ts` 量測後寫進 `--adm-page-head-h`，不要改回寫死的數字

### 送出前的驗證：紅字在欄位下，畫面跳過去

規則在 `apps/admin/src/validation.ts`（與 API 逐條對應），**呈現**分成兩件事，缺一不可：

- **紅字在那一格下面**（`.adm-field__error`，`role="alert"`）—— 頂端那句總結只說「有幾個」，說不出「錯在哪一格」
- **畫面捲到第一個出錯的欄位並把游標放進去**（`apps/admin/src/scroll-to-error.ts`）—— 儲存按鈕釘在頂端，按下去的那一刻出錯的欄位幾乎一定在畫面外

🔴 **錨點是欄位外框上的 `data-error-key`，值＝錯誤鍵本身**（含 `bodyBlocks[3].image` 這種路徑）。
忘了加不會壞掉，只會退回「捲不過去」——`scroll-to-error.ts` 會逐段退到父層找。

🔴 **摺疊起來的區塊要先自己展開**（`StructuredField.vue` 的 watch）：摺疊列是 `v-if` 不是
`v-show`，收起來的那一列裡面的紅字**根本沒有渲染** —— 症狀是「說有欄位沒填，但整頁找不到紅字」。

⚠️ 捲動要讓開兩層 sticky（頂列 ＋ 編輯頁標題列），高度**現場量**，理由同 `sticky-head.ts`。
⚠️ 由 `tools/admin-e2e/check.mjs` 把關 —— typecheck 與 build 都看不到捲動與展開。

### 九個內容模型共用一組清單／編輯畫面

九個模型的 CRUD 形狀完全一樣（列表／編輯／排序／上下架／送審／版本／SEO 區塊），差別只在欄位。**做成一組通用的 `ListPage`／`EditPage` ＋ 一份「單元宣告」**，各模型只宣告自己的欄位、清單欄與上傳提示：

```
apps/admin/src/units/treatment.ts     # 欄位、清單欄、關聯選擇器、上傳尺寸提示
apps/admin/src/units/doctor.ts
...
apps/admin/src/components/ListPage.vue  # 分頁 20 筆、關鍵字、狀態／分類篩選、批次上下架、排序
apps/admin/src/components/EditPage.vue  # 左側本文、底部共用 SEO 區塊、右側工作流側欄
apps/admin/src/router.ts               # /、/login、/:unit、/:unit/:id（base 已是 /admin/）
```

⚠️ **vue-router 的路徑不要再帶 `/admin`。** Vite 的 `base: '/admin/'` 已經吃掉那一段，
路由寫 `/:unit` 而不是 `/admin/:unit`，否則會變成 `/admin/admin/xxx`。

這麼做的理由是 18 個畫面（9 模型 × 列表＋編輯）不該有 18 份 CRUD 程式碼 —— 要改「送審後不可編輯」這種規則時，改一處而不是九處。**共用 SEO 區塊**尤其如此：[02](02-backend-cms.md) §1 要求它統一內嵌在每一筆內容的編輯畫面底部。

### 幾個不在通用形狀裡的畫面

| 畫面 | 特殊之處 |
|---|---|
| 首頁版位編排 | **只能挑選已存在的內容，不能另打一份文案**（[02](02-backend-cms.md) §3）。UI 上就不該有自由文字欄位 |
| 導覽選單與頁尾 | 樹狀拖曳、最多兩層；`booking.20skin.tw` 與 `20skinshop.com` 兩個外部連結在此維護，強制標記為外部 |
| 審核佇列 | 查 `ContentReviews WHERE Status=1`；退回需填原因。**退回通知不寄信**，改由儀表板待辦清單呈現（[08](08-database.md) §B-3） |
| 301 轉址管理 | 約 770 條，必須有匯入匯出。**不要做成一頁全載** |
| 未命中題目清單 | 獨立畫面，不塞在 FAQ 題庫的分頁裡（[02](02-backend-cms.md) §6） |
| 儀表板 | 沒有專屬資料表，全部是聚合查詢（[08](08-database.md) §K） |

### 富文本與高風險字詞

- 編輯器輸出走白名單清洗，貼上時去樣式。**內文以區塊結構儲存**（`BodyBlocks`，JSON）
- **高風險字詞即時警示**（[02](02-backend-cms.md) §5 第二層防護）：字詞清單由 `RiskTerms` 在登入後取回並快取。**警示不阻擋輸入**，命中結果隨送審單送出，存進 `ContentReviews.RiskFlags` 供審核者重點檢視

---

## 9. 上傳：欄位裡直傳 Blob

🔴 **沒有媒體庫**（2026-09-11 定案）。上傳只發生在需要那張圖的欄位裡 —— 沒有清單畫面、沒有挑圖瀏覽器、沒有刪除入口。

```
在某個圖片欄位按「上傳圖片」
  → POST /admin/upload/sas        取短效寫入 SAS（限定容器與 blob 名稱、write only、數分鐘到期）
  → 瀏覽器直接 PUT 到 Blob
  → POST /admin/upload/commit     回報；API 讀檔頭驗真實型別，回傳一組圖片值
  → 前端把那組值放進欄位，隨內容一起 PUT /admin/{unit}/{id} 存下
```

⚠️ **回報端點回傳的東西，就是欄位要存的東西**（`{ blobPath, url, alt, width, height, variants }`，[08](08-database.md) §0 決策四）。`blobPath` 要原封不動存回去 —— 少了它，這張圖被換掉時 API 找不到檔案可刪。

**檔案不經過 API 的 request body。** 讓大檔流經 Function 是白付執行時間與記憶體，而且直傳本來就比較快（[07](07-deployment.md) §3）。

圖片欄位的 UI 只有三個動作：**上傳、改 alt、移除**。

🔴 **「移除」是真的會刪檔**，不是解除引用 —— 存檔之後那個網址就是 404，版本還原也救不回來（[11](11-backend-design.md) §9）。按鈕與還原畫面的文案要照實說。

⚠️ **Storage 帳戶的 CORS 必須放行 `https://20skin.tw` 的 `PUT`**，這與 Function App 的 CORS 是**兩套各自獨立的設定**。上線前驗收時來源是 SWA 的預設網址（`*.azurestaticapps.net`），那個也要一併放行。

⚠️ **SAS 會過期。** 大檔上傳到一半 SAS 失效要能重新取一組續傳，不要讓使用者從頭來過。

---

## 10. 發布即時生效

🔴 **2026-09-16 起這一節的前提沒了。** 舊標題是「發布到上線之間有延遲，這件事要做進 UI」，
前提是「SWA 沒有 ISR，發布後要重跑全站 build」。改成執行期 SSR 之後**沒有建置這一步**。

連帶移除的（`ssr-migration` 分支）：

| 原本的要求 | 現在 |
|---|---|
| 後台顯示「發布中／已上線」 | 拿掉 —— 沒有「進行中」這個狀態 |
| 連續發布要聚合（3–5 分鐘窗口） | 拿掉 —— 沒有 build 要聚合 |
| 「重新發布網站」按鈕 ＋ GitHub PAT | 拿掉 —— 沒有東西要重建 |

✅ **排程發布連帶變成即時的。** 它原本要靠一支 Timer 每 15 分鐘輪詢、發現有內容跨過
時間窗就觸發 build（再等約 4 分鐘）。SSR 下 `Visibility.PublicFilter` 用的是**查詢當下的
`@Now`** —— 時間一到，下一個請求自然就看得到。那支 Timer 因此刪除。

⚠️ **唯一還有延遲的是站內搜尋索引**（§4）—— 它仍是建置期產物。

⚠️ **排程時間的文案已於 2026-09-16 改成「上線時間」** —— SSR 下它是精確的（[08](08-database.md) §B-1）。

另外：**後台前端仍要對 API 的 5xx 與逾時做重試**（冷啟動與一般暫態錯誤）。

⚠️ **錯誤回應也要帶 CORS 標頭**（API 端的事，但前端是受害者）—— 少了標頭，4xx/5xx 在瀏覽器只會變成一個沒有任何資訊的 network error。

---

## 11. 不做的事

| 不做 | 理由 |
|---|---|
| i18n／多語 | 範圍內沒有英文站。**不要先建語系切換的架子** |
| ~~Nuxt SSR 模式~~ | 🔴 **這一列已作廢** —— 2026-09-16 起前台**就是**執行期 SSR（CLAUDE.md 決策 6）。原本的理由是「與 `/api/fallback` 互斥」，而那支 function 已整支刪除 |
| ISR／on-demand revalidation | SWA 沒有。⚠️ 但**不再需要** —— 改成 SSR 之後每個請求都即時取值，而且刻意不做快取（決策 14） |
| 會員／預約／購物 | 已排除於範圍（CLAUDE.md 決策 4） |
| 前台直連資料庫 | 前台的 SSR function **只打 API，完全不碰 SQL**（決策 9：全架構已沒有明文連線字串）。⚠️ 舊理由「前台是靜態檔案，沒有執行期」已作廢 |
| **媒體庫**（清單、挑圖瀏覽器、獨立刪除入口） | 2026-09-11 客戶指定不做。圖片只能從所屬欄位上傳，見 §9 與 [08](08-database.md) §0 決策四 |
| 上傳非圖片檔案 | 沒有媒體庫之後，PDF 之類的檔案在後台沒有欄位可以承接（[02](02-backend-cms.md) §4） |

---

## 12. DoD（每個前台模板完成前）

- [ ] 版面與 `mockup/` 一致（客戶已確認的設計，不做重新詮釋）
- [ ] 動效系統（`.js-anim` ＋ `IntersectionObserver`）行為與 mockup 相同
- [ ] Title／Meta／canonical／OG／JSON-LD／麵包屑齊備，`AiSummary` 渲染在首段
- [ ] 重要內容存在於初始 HTML（關掉 JavaScript 仍讀得到）
- [ ] 圖片 WebP ＋ 明確 width/height ＋ 首屏外 lazy load
- [ ] 三斷點 RWD、鍵盤可操作、語意化標籤
- [ ] Lighthouse 行動版 ≥ 90
- [ ] 路由來自 `UrlPath`，未在前端重算路徑規則

後台畫面另加：

- [ ] 權限不足時該畫面／按鈕不出現，**且 API 端擋得住直接呼叫**
- [ ] 未存變更離開前有攔截
- [ ] 上傳欄位顯示建議尺寸提示
- [ ] 發布後顯示「發布中」而非直接成功

---

## 13. 待確認

| 項目 | 影響 |
|---|---|
| **AI FAQ 開關的執行期讀取方式** | 純靜態前台要在執行期讀 `SiteSettings`（[08](08-database.md) §L）。建議：面板**開關本身**烤進 build，另留一支 `GET /site-settings/public` 供「不重新部署就能停用」的緊急關閉 —— 兩者取其嚴。需與後端一起定 |
| **圖片衍生尺寸由誰產** | [07](07-deployment.md) §3 待決。影響上傳流程與 `Variants` 的寫入時機 |
| **站內搜尋索引的大小** | 800 篇文章的索引檔實測後才知道能不能接受。壓不下來要另案評估 |
| **build 時間與產物大小** | 950 頁 ＋ 950 份 `_payload.json`，[07](07-deployment.md) §8 列為切 DNS 前必測項 |
| **字型子集的字元集來源** | 由 `content/*.json` 產生（§7 建議），需在建置腳本定案 |
