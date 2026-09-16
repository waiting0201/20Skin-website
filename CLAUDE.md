# 20SKIN 網站改版專案

20SKIN 美醫集團（四季診所／二林四季皮膚科）網站改版的**規劃專案**。

產出有四類：規劃文件（`docs/`）、客戶交付的 PDF（`output/`）、三份靜態設計 mockup，
以及 **2026-09-11 起進場的正式站原始碼**（`apps/web` 前台、`apps/admin` 後台）。

> 舊敘述「這個 repo 沒有正式站的原始碼」已作廢。

分析對象：https://www.20skin.tw/index2.php（現行線上網站，PHP）

---

## 目錄結構

```
CLAUDE.md              ← 你在這裡。專案索引與工作慣例
STATUS.md              ★ 進度總表：做到哪裡了（狀態的單一真相來源）
pnpm-workspace.yaml    packages = apps/*
.github/workflows/     web.yml（前台 SSR function ＋ 後台 SPA）、api.yml（獨立 Function App）
                       ⚠️ 觸發分支是 main —— 那是本機 public 推上 GitHub 之後的名字
                       （refspec public:main，比照 NTI）。⚠️ 已觸發但缺 secrets，見 STATUS.md §六
apps/
  web/                 前台：Nuxt 3 **執行期 SSR**（21 個模板，每個請求即時算繪）
                       ⚠️ 2026-09-16 由「純靜態預渲染」改成 SSR，見決策 6
                       樣式照抄 mockup/，由 pnpm verify 把關
  admin/               後台：Vite ＋ Vue 3 的 SPA，base=/admin/
                       build 產物直接寫進 apps/web/public/admin/
                       ⚠️ 建置順序：先 admin 後 web
tools/api-smoke/       API 煙霧測試（read 唯讀／write 會改資料，見該目錄 README）
tools/deploy-swa-ssr.sh  部署 SWA：前台 SSR function ＋ 後台 SPA（本機備援，正式走 CI）
                       ⚠️ 取代了 deploy-swa.sh（靜態版，2026-09-16 刪除）——
                          部署形態換了，api_location 由 api/ 改成 .output/server
tools/deploy-api.sh    部署獨立 Function App（functions/ → func-20skin-web-api-prod）
                       ⚠️ 尚未對 Azure 實跑驗證，見檔頭
tools/content-import/  mockup 內容 → 資料庫（dump／import／upload-images／golden-diff）
tools/content-export/  🔴 **前台已完全不使用它**（2026-09-16）。內容、SEO 產物與站內搜尋
                       都改成執行期打 API，`apps/web/content/*.json` 沒有任何消費者了。
                       它現在的用途只剩「離線稽核／黃金樣本比對」——
                       **不要因為看到它還在，就以為建置流程需要先跑它**
                       ⚠️ 與 API 共用 Visibility.cs 與 ExportFormats.cs
                       （<Compile Include>，不是抄一份）
tools/blob-reconcile/  孤兒檔對帳：Blob 容器 vs 資料庫引用（見該目錄 README）
                       🔴 **只能對正式資料庫跑** —— 儲存體只有一個、所有環境共用，
                          對本機庫跑會把正式的圖誤判成孤兒（實測 75%）。
                          預設只報告；孤兒超過 20% 時拒絕刪除
tools/sync-public.sh   master → public 分支（去除 reference/ output/），推 GitHub 前執行
.githooks/pre-push     安全網：擋下含非公開路徑或過大檔案的 ref 推向 Remote_GitHub
docs/                  工程端文件（真實來源）
  README.md            文件索引與快速數字
  00-site-audit.md     現況診斷
  01-sitemap.md        資訊架構
  02-backend-cms.md    後台規劃
  03-seo-geo.md        SEO / GEO 策略
  04-ai-faq.md         AI FAQ
  05-roadmap.md        導入時程（含內部風險備註）
  06-page-inventory.md 頁面清點與工程量估算
  07-deployment.md     部署架構與 CI/CD（Azure SWA ＋ Functions ＋ SQL）
  08-database.md       資料庫規劃（以功能單元劃分，35 張表）
  09-frontend.md       前端技術架構（apps/web 前台 ＋ apps/admin 後台）
  10-api.md            API 契約（端點、信封、錯誤碼、權限碼）
  11-backend-design.md 後端施工標準（分層、路由授權、EF＋Dapper、工作流狀態機）
  research/
    site-audit-raw.md  原始抓取數據與待補資料清單
  templates/           部署範本（GitHub Actions、staticwebapp.config.json）
output/                客戶交付物
  *.html               PDF 來源（樣式在此）
  *.pdf                交付的 PDF
mockup/                ★ 客戶選定 —— 設計方向 A：**21 個模板全數完成**（＝ docs/06 §1 的 21 個前台模板）
                       左右分欄、藝廊圖錄感，有暖金 --accent。頁面編號對應模板編號：
                       index=首頁　02 困擾細節　03 療程分類　04 療程細節　05 醫師個人
                       06 文章列表　07 文章內頁　08 據點細節　09 品牌理念　10 長版故事
                       11 醫師列表　12 療程總覽　13 困擾總覽　14 案例列表　15 案例內頁
                       16 FAQ　17 據點列表　18 聯絡我們　19 搜尋結果　20 404　21 法務頁
mockup2/               （落選）設計方向 B —— 只有首頁，月洞門開光、純藍白無暖色、亮底
mockup3/               （落選）設計方向 C —— 只有首頁，滿版置中壓字、玻璃卡、大圓角，輔色淡青瓷
reference/             設計樣板與院方提供的原始照片
scripts/
  build-pdf.sh         HTML → PDF
  build-mockup-fonts.sh   中文襯線字型子集
  build-mockup3-hero.py   mockup3 Hero 底圖（只裁切，不調色）
```

---

## 三份文件，各司其職

| 檔案 | 記錄什麼 |
|---|---|
| `CLAUDE.md` | **規範、關鍵數字、已定案決策** |
| [`STATUS.md`](STATUS.md) | **狀態** —— 做到哪裡了、什麼被擋住、上線前 checklist |
| [`docs/`](docs/README.md) | **規格與施工標準** |

三份不要互相抄。改了狀態就更新 `STATUS.md`，改了結論才動 `CLAUDE.md` 與 `docs/`。

---

## 兩份東西，不要搞混

| | `docs/` | `output/` |
|---|---|---|
| 對象 | 內部工程與規劃 | 客戶 |
| 格式 | Markdown | HTML → PDF |
| 內容 | 完整，含風險、原始數據、待辦 | 刻意精簡 |

**客戶版刻意省略的內容**（改動時不要加回去）：

| 省略項 | 原因 |
|---|---|
| 「緊急止血」階段 | 四個阻斷級問題不列入報價，建置時一併處理 |
| 風險與控管章節 | 內部參考，改放 [docs/05-roadmap.md](docs/05-roadmap.md) 末段 |
| 結語 | — |
| 301 執行三原則 | 客戶版只留對照表，執行細節屬內部作業 |
| **醫療廣告法遵（原 2-3 整節）** | 客戶版單純講網頁，不談法規。仍保留在 [docs/02-backend-cms.md](docs/02-backend-cms.md) §5 |

醫療廣告法遵移除後，客戶版連帶調整的措辭（勿改回）：審核工作流、版本歷程、審核者角色、案例揭露欄位、FAQ 費用類註記 —— 一律改為中性的「內容確認／審核」說法，不提法規、法遵、醫療法、衛福部。

`docs/` 是真實來源。改了數字或結論，兩邊都要同步。

---

## 常用指令

```bash
# 內容管線（⚠️ 順序：匯入 → 匯出 → 建置）
node tools/content-import/dump.mjs /tmp/frontend-data.json   # TS 資料模組 → JSON
node tools/content-import/import.mjs /tmp/frontend-data.json # → 資料庫（走真正的 API，需先啟動 func）
pnpm --filter web export:content                             # 資料庫 → apps/web/content/*.json
                                                             # 🔴 2026-09-16 起**建置完全不需要它**。
                                                             #   前台內容、SEO 產物（改走 API 的
                                                             #   /seo/*）與站內搜尋（改走 /search）
                                                             #   都是執行期取得，這批 JSON 沒有
                                                             #   任何消費者，只供離線稽核
node tools/content-import/upload-images.mjs                   # 圖片 → Blob（含對帳）
                                                             # ⚠️ 來源是 image-sources.json，不吃 dump
                                                             #    需要 az 身分有 Storage Blob Data Contributor

# 前後台建置（⚠️ 順序不可顛倒：先 admin 後 web）
pnpm --filter admin build && pnpm --filter web build

# 🔴 本機開發**一定要**指定 API 位址 —— 前台每一頁都要打它，不設定就是打正式站
#    （不設定＝打正式站 https://api.20skin.tw/api/v1）
#   apps/admin  → VITE_API_BASE_URL        （範本見 apps/admin/.env.example）
#   apps/web    → NUXT_PUBLIC_API_BASE_URL
# ⚠️ 換了位址，API 那頭的 CORS allow-list 也要放行你的來源 —— 少了它瀏覽器
#    只會給一個沒有任何資訊的 network error，看起來像斷線（docs/10 §2）。

# 驗收閘（改完前台一定要跑）
pnpm --filter web typecheck   # 🔴 型別檢查，不需要跑著的站台
                              #   2026-09-16 首次導入就抓到四個**已經在正式站上**的 bug，
                              #   全部是「Vue 讀不存在的東西不會報錯，只渲染成空白」。
                              #   ⚠️ 這類錯誤**建置一律會成功**，只靠建置等於沒有檢查。
pnpm --filter web verify:css  # 樣式照抄，不需要跑著的站台

# 🔴 verify:links 需要一個**跑著的站台**（而站台需要跑得動的 API）——
#    SSR 之下頁面是算繪當下才存在的，沒有 API 就沒有 HTML 可檢查。
#    ⚠️ 它同時拿 sitemap 當種子，所以會一併檢查「sitemap 收的網址打不打得開」。
cd functions && func start                                     # 1. API
cd apps/web && NUXT_PUBLIC_API_BASE_URL=http://localhost:7071/api/v1 npx nuxt dev   # 2. 站台
VERIFY_BASE_URL=http://localhost:3000 pnpm --filter web verify:links                # 3. 爬

# API 煙霧測試（改完 API 或後台資料層一定要跑，說明見 tools/api-smoke/README.md）
node tools/api-smoke/read.mjs                  # 唯讀，可對任何環境跑
node tools/api-smoke/write.mjs                 # 🔴 會真的改資料，只能對用完即丟的資料庫跑

# 重新產出 PDF（改完 output/*.html 之後）
./scripts/build-pdf.sh

# 重新產出中文襯線字型子集（改完 mockup/ 或 mockup2/ 的文案之後一定要跑）
./scripts/build-mockup-fonts.sh

# 重新產出 mockup3 的 Hero 底圖（調色參數改了才需要跑）
python3 scripts/build-mockup3-hero.py
```

⚠️ **2026-08-27 客戶已選定方向 A（`mockup/`）** —— 見下方「已定案的決策」第 11 條。
下表保留作對照記錄，B／C 不再更新。

三份 mockup 的區隔（原本併陳比稿時的區隔，改 `mockup/` 之前仍可參考）：

⚠️ mockup（A）與 mockup3（C）都有輪播，但不是同一件事，不要因此把兩版拉近：
A 是**版面裡的裱框輪播**（左右分欄、有邊框），C 是**滿版底圖淡入淡出**、
文字固定不動。兩者共用 `app.js` 的 `[data-slider]`，只有樣式不同。

⚠️ **mockup3 Hero 輪播的第一張是素材庫的意象圖，不是院方實景**（2026-08-20，
客戶指定「去網路找一張可以代表新中式美學的圖」）。竹影白牆，Unsplash License，
來源與授權見 [reference/hero-bamboo-source.txt](reference/hero-bamboo-source.txt)。
換掉的原因是解析度：`banner1-L.jpg` 只有 1260×800，可用區裁出 840×460 之後
要放大 2.9 倍才填得滿 Hero。**正式上線前要請院方確認這張圖的去留。**
舊的實景仍留在 `mockup3/assets/img/hero-clinic.jpg`，配方在 build 腳本檔頭。

| | mockup（A） | mockup2（B） | mockup3（C） |
|---|---|---|---|
| 參考 | website-template.jpg | template2＋template3 | **template4** |
| Hero | 白底左右分欄、裱框輪播 | 亮底、正圓月洞門 | **滿版輪播、置中壓字在玻璃卡上** |
| Hero 底圖 | 院方實景 | 院方實景 | **兩張輪播：意象圖＋診所外觀** |
| 形狀 | 直角＋細框 | 2px 近方正＋開光異形 | **大圓角、膠囊、正圓頭像** |
| 輔色 | 暖金 `--accent` | 無（純藍白） | **淡青瓷 `--aqua`** |
| 小標 | — | 直排兩字中文 | **uppercase 英文 eyebrow** |
| Footer | 一般 | 滿版＋上緣大圓弧 | **內縮的圓角深藍卡片** |

三份共用同一支字型子集與 `app.js` 的動效系統（`.js-anim` 載入序列 ＋ `IntersectionObserver` 顯影）——
動效是客戶指定保留的部分（2026-08-19），改版時不要動它。

產出後**務必目視確認 PDF**：Chrome headless 若 CJK 字型 fallback 失敗會出現空白或豆腐字，這是唯一無法靠指令驗證的風險點。用 Read 工具帶 `pages` 參數看幾頁即可。

---

## 抓取現行網站的注意事項

**`curl` 會被擋。** 主機的 Mod_Security 對非瀏覽器 User-Agent 一律回 **HTTP 406**，連 `robots.txt` 都拿不到。

要抓線上網站請用 **WebFetch**（一般瀏覽器 UA，正常回 200）。

這個現象本身是重要發現 —— 它意味著 AI 爬蟲極可能也被擋，是整份規劃優先級最高的技術項。見 [docs/03-seo-geo.md](docs/03-seo-geo.md) §1。

**但 `curl` 帶瀏覽器 User-Agent 是可以抓的**（2026-08-18 實測 HTTP 200）。被擋的是預設 UA。
抓圖片再加 `-e https://www.20skin.tw/share.php` 當 Referer 更穩。

抓圖時的實測結論（做 mockup 用得到）：

| 位置 | 解析度 |
|---|---|
| `images/banner/banner*-s.jpg` | 320×220，**沒有大圖版本**（`-b`／`-l`／無後綴皆 404） |
| `images/index/in_*_1200p*.png` | 檔名騙人，**實際只有 250×250** |
| `admin/goods_pic/*.jpg`（文章內頁） | **1200–1800px**，但多半壓了中文標題字或是研討會隨手拍，要裁切才能用 |

⚠️ 裁圖**不要用 `sips --cropOffset`** —— 它是相對「中心」的偏移，超出範圍會靜默失效或補黑邊。
本機有 Python PIL，用 `Image.crop((l,u,r,lo))` 才可靠。

---

## 專案關鍵數字

改任何跟數量有關的敘述前，先看 [docs/06-page-inventory.md](docs/06-page-inventory.md)。

| 項目 | 數量 | 備註 |
|---|---|---|
| 前台模板 | 21 | 工程計價單位 |
| URL 實例 | **1845**（實數） | 文章內頁 1108 佔 60%；另有 92＋37＋31 等列表分頁與 393 個標籤頁。sitemap 收 **1163** 條（2026-09-16 實計：blog 1124／頁面 16／醫師 14／困擾 8／療程 1）。
⚠️ 收錄範圍 = `IncludeInSitemap` **且** 內容夠實在（`Indexability.cs`，與頁面的 `noindex` 同一個判斷）。療程只剩 1 條是對的 —— 28 項裡只有一項有內容。
✅ 2026-09-16 起 1163 條**全部打得開**（`verify:links` 把關）。先前有 2 條是壞的（`/new-chinese-aesthetics/`、`/makeup-style/`，正確網址在 `/about/` 底下），根因是 `ComputeUrlPathAsync` 把非 System 的 Page 壓平成 `/{slug}/`，已改成保留父層前綴 ＋ 一支資料 migration。<br>⚠️ 值得記的是**為什麼拖到現在才發現**：靜態時代的 postbuild 過濾器會把打不開的網址當「沒有產出頁面」默默刪掉，**等於幫這個資料錯誤遮了一層** |
| 後台畫面 | 約 30 | 9 個內容模型 ＋ 首頁版位 ＋ 導覽選單。**不做操作日誌**、**不做媒體庫**（皆 2026-09-11 定案），32 與 31 都是舊數字 |
| 療程項目 | **28** | 2026-09-14 由 27 改為 28：Radiesse（再生針）與 Ellansé（洢蓮絲）原本被併成一筆，舊站是分開的兩項。適應症、許可證字號、產品圖已自舊站補齊（見 [tools/legacy-import/README.md](tools/legacy-import/README.md)）；**28 項全部的療程時間／術後照護／禁忌症仍待醫師撰寫**，舊站沒有這些資料。「12 項無站內內容」講的是外連 blog 的項數，不是要寫的量 |
| 文章 | **1100**（實數） | 主站 **709** ＋ blog 站 **391**，2026-09-14 逐篇抓取確認 |
| 團隊成員 | 14 | **13 位醫師 ＋ 1 位藝術總監**。安喬（許媖琄）兼執行長與「新中式美學」創始人，不是醫師 —— 寫「14 位醫師」是錯的。現行全擠在 `doctor.php` 單頁 |
| 301 規則 | **1000**（實數，2026-09-14 匯入） | 主站：文章內頁 780 ＋ 固定頁與療程頁 24 ＋ 臻美分享列表 196。原估「約 770」是**下限**，孤兒 `product*.php` 仍未盤點。跨網域的 blog 站不在範圍內 |

> ⚠️ 規劃書 v1.0 曾寫「250+ 篇文章」，該數字只來自「醫美新知」單一分類，**低估約 3 倍**。若在任何文件看到 250 這個數字，那是舊資料。

> 🔴 **blog 站是 391 篇，不是 101 篇**（2026-09-14 以 WP REST 的 `x-wp-total` 實數確認）。
> 101 來自 2026-07-29 讀 Yoast `post-sitemap.xml`，而 391 篇裡只有 19 篇是 07-29 之後才發佈的
> —— 也就是**當時就數錯了**，不是後來長出來的。若在任何文件看到 101，那是舊資料。
> 這與上面那次「250 篇」是同一類錯誤：**拿單一來源的清單當全體**。
>
> ⚠️ 連帶「URL 實例」已由估的約 950 改為**實數 1845**（2026-09-14 建置產物實際計數）。
> 增加的來源有三：文章 800 → 1108、列表分頁（每頁 12 篇，`/blog/` 就有 92 頁）、
> 標籤頁 10 → 393（blog 的 46 個分類壓成 4 個之後全轉成標籤）。

---

## 已定案的決策

由客戶確認，不要重新提案：

1. **全新改版重建**，不是修補現有 PHP 站
2. **`20skinblog.com` 整併進主站 `/blog/`**，保留原 slug。**本專案只負責抓回內文與圖片**（**391 篇**，見下方⚠️）；跨網域 301 不在範圍內，由院方自行處置（見 [docs/01-sitemap.md](docs/01-sitemap.md) 決策三）。
   ⚠️ **71 篇的 slug 被改寫**（WP 用底線，API 只收連字號）——「保留原 slug」靠站內 301 達成，不是放寬 API。理由見 [tools/legacy-import/README.md](tools/legacy-import/README.md)
3. 後台範圍 = **CMS ＋ 權限帳號 ＋ AI FAQ 管理**（不含數據報表模組）
4. **不含線上購物與線上預約** —— `20skinshop.com` 與 `booking.20skin.tw` 僅以外部導流連結存在，不納入 sitemap、不納入後台、不納入內容策略
5. **部署在 Azure**：**Static Web Apps（Standard）＋ 獨立 Azure Functions（Flex Consumption）＋ Blob ＋ Azure SQL**，GitHub Actions **兩條 workflow**。沒有 CDN／WAF 中間層。
   **資源已於 2026-09-11 建立**：訂閱 CSP、區域 `westus2`、資源群組 **`rg-20skin-web-prod`**。
   ⚠️ **SWA 方案由 Free 改為 Standard**（2026-09-11）—— 不是改變主意，是**訂閱裡的 Free 配額已被既有專案用滿**。連帶把單一環境儲存上限從 250 MB 拉到 500 MB。
   🔴 **不要把資源建進 `rg-20skin-prod`** —— 那是**線上預約系統**的正式環境（`booking.20skin.tw`），正是決策 4 排除在本專案外的系統。部署進去會弄壞診所營運中的預約。
   🔴 **儲存體帳戶的名字差一個字，踩到就是寫進預約系統**（2026-09-11 實際踩到）：
   本專案是 **`st20skinweb`**（`rg-20skin-web-prod`）；**`st20skinprod`** 是**預約系統的**（`rg-20skin-prod`）。
   `functions/local.settings.example.json` 原本寫的是後者，照著設定的人整台機器的上傳都會打進預約系統的儲存體。
   正式環境的 app setting 一直是對的，錯的只有本機範本 —— 這種錯**不會有任何錯誤訊息**，SAS 照簽、上傳照成功。
   交付範圍 **SWA ＋ Functions ＋ Blob ＋ 資料庫 schema**（資料庫執行個體由院方自建，見第 8 條）。
   **只有正式環境 —— 不設 staging，也不設 PR 預覽環境**（2026-08-10 定案）。前台與 API 都是 `main` 合併即上線。上線前的驗收對**尚未切 DNS 的正式環境**（`*.azurestaticapps.net`／`*.azurewebsites.net`）做；上線後沒有預演，靠 `main` 分支保護 ＋ CI 檢查 ＋ 部署後 smoke test 三道攔截。**不要在文件裡寫回 PR 預覽或 staging。**
   由平台限制逼出來的例外，**不要當成可以靠設定繞過**：1000 條 301 查 SQL 對照表（SWA 設定檔上限 20 KB）、上傳檔案放 Blob。見 [docs/07-deployment.md](docs/07-deployment.md)
   ⚠️ **`/api/fallback` 已不存在**（2026-09-16）—— 301 改由前台的 catch-all 路由查 API，見決策 6、7。
6. **前端框架 = Nuxt 3 執行期 SSR**，2026-09-16 由 Tim 定案，**翻掉原本的「純靜態 `nuxt generate`」**（2026-08-10 定案）。
   改的理由只有一個：**院方按下發布，下一個請求就要看得到**。靜態版最快也要等 CI 跑完一次全站建置（實測 3 分 11 秒），而那條路還需要一顆 GitHub PAT 與後台一顆按鈕。
   產物形狀：`.output/public`（只有靜態資產）＋ `.output/server`（Nuxt 的 SSR function，Node 22）。
   **前後台仍是兩個 pnpm workspace 套件**：`apps/web`（Nuxt SSR 前台）、`apps/admin`（Vite ＋ Vue 3 的 SPA）。後台 build 產物寫進 `apps/web/public/admin/`，**建置順序先 admin 後 web**。同一個 SWA、同一個網域、後台掛 `/admin/`。
   ⚠️ **原本「不用 SSR」的理由已失效，不要拿它回頭反對**：那個理由是「SWA 會把 `api_location` 指向 `.output/server`，與 `/api/fallback` 互斥」—— 現在 `/api/fallback` 整支刪掉了，301 改由前台的 catch-all 路由查 API（決策 7）。
   ⚠️ **Next.js 仍然不採用**：換框架要把 21 個模板從 Vue 重寫成 React，而 Nuxt 本來就有 SSR 模式。姊妹專案 VicRound 用 Next.js 是因為它是全新專案，不是因為 Nuxt 不行。
   🔴 **代價要一起記住**（實測，2026-09-15）：同一批網址，靜態 0.30–0.45 秒、SSR 0.61–0.74 秒，**大約兩倍**；而那還是資料仍內聯的版本，接上 API 之後每頁再加一次 `Nuxt → Function App → SQL` 的往返。
   見 [docs/07-deployment.md](docs/07-deployment.md) §1
7. **API 只有一處：`functions/`**（2026-09-16 起）。
   **`functions/` → 獨立 Azure Functions App（`api.20skin.tw`）**：**.NET 10 isolated ＋ EF Core（寫入）＋ Dapper（讀取）**。前台、後台與爬蟲要的一切都在這裡，**CORS 由院方自行設定**。Managed Identity 連 SQL／Blob，無密鑰。HTTP 上限 **230 秒**。**前後台共用這一個 App，不拆 `api-admin`／`api-public`**（2026-08-13，見第 10 條）。
   ⚠️ **舊敘述「API 分兩處」已作廢。** `api/`（SWA Managed Function，只有 `fallback` 一支）**2026-09-16 整支刪除** —— 它與 Nuxt 的 SSR function 互斥（兩者都要佔 SWA 的 `api_location`），而它負責的 1000 條 301 已改由前台的 `pages/[...slug].vue` 查 `GET /redirects/resolve`。
   ⚠️ 連帶的收穫：**路徑正規化從兩份變一份**。原本 `api/Fallback.cs` 與 `RedirectHandler.NormalizePath` 各有一份，兩邊分岔的症狀是「後台看得到規則，但線上不轉址」。
   ⚠️ SWA managed function 的 .NET 版本上限（`dotnet-isolated:9.0`）已不再是這個專案的限制 —— 那個位置現在跑的是 Nuxt（`node:22`）。
   🔴 **前台每一個請求都會打這個 App**，它不再只是後台的後端。它掛掉＝全站 503（前台以 5xx 表達，不會退化成 404 或空頁面，見決策 14）。
   PHP 不在 Azure Functions 支援清單內，不要提案沿用舊站語言。
8. **資料庫 schema 由 EF Core migrations 管理，是本專案的產出**（2026-08-10 定案）。院方只提供資料庫執行個體與身分／網路設定。舊敘述「資料庫由院方自建，沒有 migration workflow」**已作廢**。
   三個不可退讓的原則：**絕不在執行期呼叫 `Database.Migrate()`**（走 CI 的 `efbundle`）、**遷移必須向後相容**（先遷移後部署，中間有一段新 schema 配舊程式）、**遷移身分與執行期身分是兩個不同的 SQL 使用者**（前者要 DDL，後者只要 DML）。見 [docs/07-deployment.md](docs/07-deployment.md) §5、§6
9. **上傳檔案一律存 Azure Blob**，由**瀏覽器直傳**（後台向 API 取短效 SAS，不讓檔案流經 Function）。SAS 以 **Managed Identity** 簽發（user delegation key），不存放儲存體金鑰。
   ✅ **2026-09-16 起全架構沒有明文的 SQL 連線字串了。** 原本唯一那一個是 SWA 上給 `/api/fallback` 用的唯讀字串，那支 function 已刪除；Nuxt 的 SSR function **完全不碰 SQL**，它只打 API。見 [docs/07-deployment.md](docs/07-deployment.md) §3、§6
10. **前後台同一個 SWA、同一個網域**：`20skin.tw` 前台、**`20skin.tw/admin` 後台**（Nuxt `ssr: false` 的 SPA）。API 則在另一個網域 `api.20skin.tw`，見第 7 條。
   後台路徑 `/admin/` 為客戶指定（2026-08-10），**不要再提案改成非預設路徑** —— 早期文件曾寫 `/manage/`，那是舊版。
   **後台 IP 白名單不做**（院方決定，2026-08-13）—— 技術上做得到（獨立 Function App 支援入站 IP 限制），是院方選擇不採用，**不要重新提案**。**雙因素也不做**（院方決定，2026-09-11）。因此登入防護**只剩登入次數限制一項**，且帳密成為唯一憑證。
   **種子密碼 `Admin@123` 不視為上線阻斷項**（Tim 判定，2026-09-16，**不要再提案更換**）——舊敘述「種子密碼上線前必須更換」已作廢。剩下的防線是 reCAPTCHA v3 與登入次數限制。
   **次數限制只以帳號計數**（院方決定，2026-09-14 拿掉來源 IP 維度，**不要再提案加回去**）—— 好處是院內共用同一個對外 IP 時不會一人打錯把全院鎖在門外，代價是**「同一 IP 輪流試多個帳號」（密碼噴灑）擋不到**，那一種只剩 reCAPTCHA v3。
   ⚠️ `LoginThrottles` 的 `Dimension` 欄位與 `ThrottleDimension.IpAddress` **不要跟著拿掉** —— 公開表單（`/contact`、`/questions/miss`）的頻率限制沿用那個維度。連帶確定 API 不拆成兩個 Function App。見 [docs/02-backend-cms.md](docs/02-backend-cms.md) §4、[docs/07-deployment.md](docs/07-deployment.md) §2
11. **設計方向 = `mockup/`（方向 A）**，2026-08-27 客戶選定。白底左右分欄、版面裡的裱框輪播、直角＋細框、暖金 `--accent`，參考 `website-template.jpg`。
   **`mockup2/`（B）與 `mockup3/`（C）落選** —— 檔案保留在 repo 供日後對照，但**不再更新，也不要再提案**。之後所有視覺、切版、元件的討論一律以 `mockup/` 為準。
   動效系統（`.js-anim` 載入序列 ＋ `IntersectionObserver` 顯影）仍是客戶指定保留的部分（2026-08-19），不要動。
12. **單一語系（繁中），不做多語系**，2026-09-11 確認。沒有英文站、沒有語系切換、
   **不要先建架子**：不建 `{Entity}I18n` 側表、不加 `Lang` 欄位或 `(Lang, Slug)` 複合唯一鍵、
   API 不收 `?lang=`、前台不輸出 `hreflang`。日後真要做，是一次獨立改版，不是現在預留幾個欄位就能省下的事
   （對照 [08-database.md](docs/08-database.md) §0 決策二「不預留未定案的欄位」）。
   見 [10-api.md](docs/10-api.md) §2、[09-frontend.md](docs/09-frontend.md) §11。
13. **不做媒體庫**，2026-09-11 客戶指定。上傳不做成「所有檔案」的清單畫面，也沒有挑圖瀏覽器與獨立刪除入口 ——
   **上傳只發生在需要那張圖的欄位裡**，上傳完成就是那個欄位的值，跟著內容一起存、一起送審、一起刪。
   連帶三件事，**都不是疏漏、不要補回來**：
   ① `MediaAssets`／`MediaUsages` 兩張表不存在（**37 張表 → 35 張**），圖片改成擁有者表上的內嵌欄位
   （`CoverUrl`／`CoverBlobPath`／`CoverAlt`／`CoverWidth`／`CoverHeight`／`CoverVariants`，EF Core owned type）；
   ② **一個欄位獨佔一個 blob，不跨內容去重**，blob 名稱是隨機唯一值而非內容雜湊 ——
   沒有 `MediaUsages` 之後「還有誰在用這個檔案」無從查起，去重會讓「換圖就刪舊檔」變成可能刪掉別人正在用的檔案；
   ③ **只收圖片**（非圖片檔案在後台沒有欄位可以承接），且**換圖與移除是真的刪檔**，
   因此**版本還原救不回已刪除的圖片**。
   後台畫面 31 → 30（「資產／媒體庫」整個拿掉）。
   見 [08-database.md](docs/08-database.md) §0 決策四、[11-backend-design.md](docs/11-backend-design.md) §9、[02-backend-cms.md](docs/02-backend-cms.md) §4。


14. **前台內容一律來自資料庫**，2026-09-11 完成搬遷；**後台 2026-09-12 接上真 API**。
   🔴 **2026-09-16 起鏈路改成執行期取值**：
   `資料庫 →（Dapper 唯讀）→ API 公開端點 →（算繪當下取得）→ HTML`。
   舊敘述「建置期內聯、執行期不查詢不讀檔」**已作廢**。
   `apps/web/app/data/*.ts` 仍是**形狀轉接層**（欄位怎麼排、叫什麼名字是前台的契約），
   只是資料來源由內聯的 JSON 換成 API —— 那 2397 行的對映幾乎沒有改，
   因為端點刻意回傳與匯出相同的 `ContentRecord` 形狀（逐筆比對驗證過）。

   ⚠️ **同一個請求內只取一次。** 一頁常有三四個模組都要 `term`（療程要分類、
   文章要標籤、FAQ 要分類），去重掛在 `useNuxtApp()` 上 —— **掛在模組層級會變成
   跨請求共用**，那等於又回到「內容要等重啟才更新」。

   🔴 **「拿不到」與「查不到」一定要分開。**
   頁面的主體內容連不上 API → **503**；裝飾性資料（選單、熱門標籤、全站設定）→ 降級。
   ⚠️ 兩者都回 `null` 的話，內頁在 API 掛掉時會變成 **404** —— 那是對搜尋引擎說
   「這一頁永久不存在」。2026-09-15 實測過：把 API 停掉，`/clinics/siji/` 當場變 404。
   ⚠️ 回 200 配空畫面更糟：Google 可能把空殼收進索引。

   🔴 **「值不值得被索引」全專案只有一份判斷**（`functions/Common/Indexability.cs`）。
   它同時決定「頁面輸出不輸出 `noindex`」與「收不收進 sitemap」。
   ⚠️ 兩邊各判一次的下場已經發生過：2026-09-15 發現 sitemap 收了 29 個 `noindex` 網址。
   ⚠️ **把 sitemap 改成執行期並不會自動解決它** —— 那只消除了時間差，判斷仍在兩處。

   ⚠️ **不做快取**（Tim 定案 2026-09-16）。每一個請求都會打 API 與 SQL，包含爬蟲 ——
   Googlebot 爬 1161 條網址就是 1161 次完整往返。上線後看實際負載再決定要不要加。
   ⚠️ SWA 的 CDN **沒有清除 API**，所以快取一旦加上就不是「即時」了；真要加，
   正確的位置是應用程式層的資料快取＋發布時主動失效（VicRound 的做法），
   而在 SWA 的多執行個體下那需要共用儲存（Blob），不能用記憶體。
   ⚠️ 公開端點讀的是**已核准的版本快照**，不是 `ContentItems` 的即時欄位 ——
   兩種錯法都是災難（編輯已上線的頁面會 404／未審核的編輯直接上線）。

   🔴 **哪些欄位可以用即時值蓋掉快照，有明確規則**（`PublicContentHandler.ShapeAsync`）：
   **結構性的用即時值**（`urlPath`／`slug`／`sortOrder`／`includeInSitemap`／`updatedAt`）——
   網址必須與路由實際提供的一致，否則站內連結會指到不存在的頁；
   **內容性的用快照**（`title`／`summary`／`fields`）。
   這份清單與 `tools/content-export` 的覆寫一致，那是搬遷時用 golden-diff 驗過的行為。
   ⚠️ **2026-09-16 實際踩過**：SSR 改版時多蓋了一行 `snapshot["title"] = row.Title`，
   於是「在後台改標題、還沒送審」就直接上線。反證很乾淨 ——
   migration `RenameMakeupStylePageTitle`（09-14）只改了 `ContentItems.Title`，
   靜態版線上到 09-15 覆核時仍是舊標題（正確），SSR 版卻在沒有人重新發布的情況下換掉了。

   🔴 **站內搜尋比對的是 `ContentItems.SearchText`（純文字），不是快照**
   （`Common/SearchTextBuilder.cs`）。那是**衍生資料**，只在發布時由已核准快照重算。
   ⚠️ 直接對快照做 `LIKE` 在正式環境是 **23–24 秒**（Azure SQL Basic／5 DTU），
   而本機 SQL Server 只要 1.2 秒 —— **效能結論不要拿本機數字下**。
   ⚠️ 4000 字上限是「搜得到多少」換「搜多久」，放寬前先對正式環境量過。
   ⚠️ **版面留在前台**（`app/data/_presentation.ts`）：英文小標、圖示、
   JSON-LD 的固定描述這類設計稿決定的字串不進資料庫。判斷標準是「院方會想改它嗎？」
   ⚠️ **內容圖在 Blob，版面素材在建置產物**。路徑是決定性的
   （`media/{yyyy}/{MM}/{32hex}{ext}`），所以上傳與匯入可以分開跑、重跑安全。
   🔴 **雜湊的輸入是「用途｜原始檔名」，而原始檔名只存在 `tools/content-import/image-sources.json`。**
   內容搬進資料庫之後，`app/data/*.ts` 的圖片欄位已經是 Blob 網址 —— 拿它的檔名去算
   會得到一個全新的路徑，於是資料庫指向的檔案根本不存在（**前台全部破圖，而建置與匯入
   都不會有任何錯誤**）。`images.mjs` 因此一律以那份對照表為準，`src` 只是退路。
   ⚠️ 搬遷正確性靠 `tools/content-import/golden-diff.sh` 把關 ——
   它比對重建後的 107 頁與搬遷前的黃金樣本。
   ⚠️ **首頁版位讀的是「首頁那筆 Page 已核准的版本快照」，不是 `HomeSections` 即時表**
   （docs/08 §G-2、docs/11 §8）。那兩張表是**工作副本** —— 直接讀它等於「編輯者拖一拖版位、
   還沒送審，下一次建置就上線了」，核准這道關卡整個被繞過。連帶：匯入腳本寫完版位
   **必須重新發布首頁**，否則快照裡的版位是空的，前台首頁會是「七個版位都在、但每個都沒有內容」。
15. **機器人驗證＝reCAPTCHA v3**，2026-09-12 定案。套用於 `POST /contact`、
   `POST /questions/miss`、`POST /auth/login` 三支對公網開放的寫入端點。
   ⚠️ **介面與欄位命名不帶供應商名稱**（`IBotCheckService`、`botCheckToken`）——
   換成 Turnstile 時只有一個檔案要改，不要讓 `recaptcha` 這個字漏進 Handler 或 DTO。
   ⚠️ **v3 不會擋下任何人**，它只回 0.0–1.0 的分數 —— 門檻、`action` 比對、
   「連不上時怎麼辦」三件事缺一不可，規格見 [docs/10-api.md](docs/10-api.md) §5.1。
   ⚠️ **連不上 Google 時放行，不是擋下** —— 擋下的代價是「院方收不到病人詢問」
   與「後台整個登不進去」。放行只發生在傳輸層失敗；Google 說「不是人」時一律擋下。
   🔴 **三個地方的金鑰要一起設**（Function App 的 secret ＋ 兩個前端的 site key），
   只設一邊會讓所有送出都被擋，而錯誤訊息指不到原因。
16. **後台的權限判斷以 API 發下來的 `permissions[]` 為準**，2026-09-12 定案。
   `apps/admin/src/permissions.ts` **不再自己用角色推導**一份權限表 ——
   角色權限可以在後台畫面上改（`PUT /admin/role/{id}/permissions`），
   前端那份推導表在那一刻就過期了，而且不會有任何徵兆。
   權限碼一律用 docs/08 §A-2 的 31 列（`content.{unit}.edit` 這種），
   `{unit}.view`／`review.decide`／`user.*`／`setting.*` 全是舊命名。
   ⚠️ 這仍然只管「按鈕出不出現」，**不是安全邊界** —— 擋得住的授權在 API 的 `AppRouter`（預設拒絕）。

---

## 待客戶或主機商提供

這些拿到之前，相關結論都是估算：

- **`reference/banner1-L.jpg` 的原始檔** —— 它是唯一拍到「新中式美學」刻字牆的照片，
  但只有 1260×800；同一批的 banner2／3 都是 7900px，原檔幾乎確定存在。
  拿到之前 `mockup2/` 的 Hero 月洞門直徑必須壓在 **440px** 以內（2026-08-19 實測：
  避開天花板彩色燈箱與紅色裝飾後，唯一乾淨的區域是 x 250–1260 / y 250–800，
  **高度 550 是硬上限**，最大乾淨正方形 550×550；440px 顯示等於 Retina 1.6 倍取樣，
  已經是銳利度換份量的極限）。
  拿到原檔後圓可以直接放大，Hero 的結構不用改
- 完整 `product*.php` 檔案清單 → 找出孤兒頁面，補完 301
- Search Console 近 12 個月 URL 曝光匯出
- Access log
- 現行 `/admin/` 後台功能清單
- Mod_Security 規則設定檔
- **Azure SQL：兩組資料庫使用者**（Function App 的 Managed Identity ＝ DML；GitHub Actions 服務主體 ＝ DDL，供遷移用）、建置期唯讀連線字串、**防火牆放行（含授權 CI 動態開關 runner IP）**。
  ⚠️ 原本還要「一組給 `/api/fallback` 的唯讀連線字串」—— **2026-09-16 起不需要了**，那支 function 已刪除。見 [docs/07-deployment.md](docs/07-deployment.md) §6
- **`api.20skin.tw` 的 CORS 設定**（院方自行設定，2026-08-10 確認）。
  ✅ **Storage 帳戶的 CORS 已於 2026-09-16 設定完成**（`st20skinweb`，放行三個來源的 `PUT`／`OPTIONS`）——
  兩套各自獨立，不要以為設了一邊另一邊就會通。
  🔴 **換網域時要記得同步加**：少了它後台圖片上傳會整個壞掉，而症狀是一個沒有任何資訊的 network error。

清單見 [docs/research/site-audit-raw.md](docs/research/site-audit-raw.md) 末段。

---

## 寫作慣例

- 繁體中文，台灣用語
- 數字要有來源。估算與實數分開標示：寫「約 800 篇」時 `docs/research/` 要查得到怎麼算的；寫實數要註明量測日期與方法
- 估算與實數分開標示。實數寫「實數」，估算給範圍
- 醫療廣告法規相關敘述一律附註「請以主管機關函釋及院方法務意見為準」
