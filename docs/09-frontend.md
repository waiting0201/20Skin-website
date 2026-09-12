# 09 — 前端技術架構（前台 ＋ 後台）

> 範圍：`apps/` 底下的兩個套件 —— 前台 `apps/web/`（Nuxt 3 純靜態，約 950 頁預渲染 HTML）與後台 `apps/admin/`（Vite ＋ Vue 3 的 SPA，掛在 `/admin/`）。pnpm workspace，見 [07-deployment.md](07-deployment.md) §1、§5。
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

## 3. 建置期資料流：先匯出成 JSON，再讓 Nuxt 讀檔

**這是與一般 CMS 網站最大的差異，也是最容易做錯的地方。**

```
deploy-site.yml
  ① scripts/export-content  ── Dapper／唯讀連線 ──▶ apps/web/content/*.json
  ② scripts/build-sitemap / build-llms / build-swa-config（吃同一份 JSON）
  ③ nuxt generate            ── 只讀 content/*.json ──▶ .output/public（約 950 頁）
  ④ 產物大小檢查（180 MB 警告 / 230 MB 擋下）
  ⑤ 上傳 .output/public ＋ api/ → smoke test
```

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

## 4. 純靜態站的三個執行期例外

前台原則是「執行期不打 API」（[07](07-deployment.md) §1 —— AI 爬蟲不執行 JavaScript，SPA-only 的內容對它們等於不存在）。只有三處例外，而且**都不影響初始 HTML 的內容**：

| 例外 | 端點 | 說明 |
|---|---|---|
| `/contact/` 表單送出 | `POST /contact` | 只寄通知信、**不留存收件紀錄**（[02](02-backend-cms.md) §2，個資責任）。送出結果在 client 端呈現 |
| `/search/` 未命中回寫 | `POST /questions/miss` | 站內搜尋本身是**建置期產生的索引檔**在 client 端比對，不打 API；只有「查無結果」時才回寫一筆到 `QuestionInbox`（[08](08-database.md) §F） |
| AI FAQ 啟用開關 | `GET /site-settings/public` | [04-ai-faq.md](04-ai-faq.md) §4 要求「啟用只需後台一個開關，不需重新部署」。這是 [08](08-database.md) §L 的待確認項，見 §13 |

三者都是公開寫入／讀取端點，**需要防濫用機制**（rate limit ＋ 機器人驗證），見 [10-api.md](10-api.md) §2。

### 站內搜尋的做法（2026-09-12 實作）

`/search/` 是 21 個模板之一，但沒有伺服器端搜尋服務。做法：建置期由 `content/*.json` 產生
`public/search-index.json`（`scripts/build-search-index.mjs`），前端在使用者真的搜尋時
才 `fetch` 它，於 client 端比對。

- 🔴 **索引與頁面同源。** 讀的是 `content/*.json` —— 頁面渲染用的就是這一份，
  所以不會出現「搜尋得到、點進去 404」。改成另外查一次資料庫就會有那個風險
- ⚠️ **獨立檔案，不內聯進 bundle。** 文章有約 800 篇，內聯等於讓**每一個**訪客
  都下載整份索引，而絕大多數人不會用搜尋
- ⚠️ **中文不斷詞，用子字串比對。** 站內這個量級（約 950 筆）夠用，
  而斷詞器對醫療專有名詞切得很差（「皮秒雷射」→「皮」「秒」「雷射」）
- ⚠️ **摘要要逸出再標記。** 命中的關鍵字用 `<mark>` 包起來（mockup 的呈現方式），
  所以那段是 `v-html` —— 摘要來自資料庫，不先逸出就是一個 XSS 入口
- FAQ 沒有獨立網址（[08](08-database.md) §C-6），結果指到它所屬的分類頁；
  文章標籤（`termType=4`）不進索引，理由同它們 `noIndex`：內容單薄，只會稀釋結果
- 查無結果時才回寫 `POST /questions/miss`，**只帶問題文字**，且**失敗一律靜默** ——
  那是背景的內容分析，不是使用者要求的動作，而它有頻率限制（同 IP 每小時 10 次）

⚠️ **索引檔會隨 800 篇文章成長，要設上限。** 目前 127 筆 ＝ 48 KB；約 800 篇時估
400–600 KB。腳本在超過 1 MB 時會警告 —— 到那時再評估分片或外部搜尋服務，
**不要為此改成 SSR**。

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
- ⚠️ **refresh token 也只放記憶體**，這不是漏做。正常作法是 httpOnly cookie，但本專案明文不使用跨來源 cookie（[07](07-deployment.md) §1），而後台與 API 不同網域 —— 這條路從架構上就被關掉了。**連帶後果：重新整理分頁就會登出。** 這是已知且刻意的取捨
- ⚠️ **401 只自動換發並重試一次**，而且併發時只能換一次：refresh 是輪替制（[10](10-api.md) §5），三個請求各自去換發會讓第二、三個拿著已被輪替掉的舊 token，後端判定為重用、撤銷該使用者全部 token，使用者當場被踢出去
- ⚠️ **權限判斷查的是登入回應帶回來的 `permissions[]`**（[10](10-api.md) §3.2），前端不自己用角色推導 —— 角色權限可以在後台改，推導表在那一刻就過期了
- **沒有雙因素**（2026-09-11 院方決定）。登入是單段的帳號密碼，**唯一的防護是次數限制**（[02](02-backend-cms.md) §4）—— 前端不要自行加「記住此裝置」之類會放寬判定的東西
- ⚠️ **UI 的權限判斷只管「看不看得到」，不是安全邊界。** 五種角色的授權**一律在 API 內驗證**（[07](07-deployment.md) §4）。前端藏起來的按鈕，後端還是要擋
- ⚠️ **不要用 SWA 的 `allowedRoles`。** 那是 SWA 內建驗證，跟 CMS 的五種角色是兩套系統，而且 `x-ms-client-principal` 到不了外部的 Function App

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

## 10. 發布到上線之間有延遲，這件事要做進 UI

**SWA 沒有 ISR。** 編輯按下發布之後，要重跑一次全站 build 才會出現在網站上，量級預期數分鐘到十餘分鐘（需實測，[07](07-deployment.md) §5）。

三件必須做到的事：

1. **後台顯示「發布中／已上線」狀態**，不要按完發布就顯示成功
2. **排程時間的文案寫「最早生效時間」**，不要寫「將於 14:00 發布」（[08](08-database.md) §B-1）
3. **連續發布要聚合**，發 10 篇不該觸發 10 次 build。API 端有 3–5 分鐘聚合窗口（[11](11-backend-design.md) §10），後台 UI 要據此說明

另外：**後台前端仍要對 API 的 5xx 與逾時做重試**。API 已不再跟著內容重建一起重新部署，剩下的是冷啟動與一般暫態錯誤。

⚠️ **錯誤回應也要帶 CORS 標頭**（API 端的事，但前端是受害者）—— 少了標頭，4xx/5xx 在瀏覽器只會變成一個沒有任何資訊的 network error。

---

## 11. 不做的事

| 不做 | 理由 |
|---|---|
| i18n／多語 | 範圍內沒有英文站。**不要先建語系切換的架子** |
| Nuxt SSR 模式 | `api_location` 會被指向 `.output/server`，與 `/api/fallback` 互斥（[07](07-deployment.md) §1） |
| ISR／on-demand revalidation | SWA 沒有。內容更新一律走重建 |
| 會員／預約／購物 | 已排除於範圍（CLAUDE.md 決策 4） |
| 前台直連資料庫 | 前台是靜態檔案，沒有執行期 |
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
