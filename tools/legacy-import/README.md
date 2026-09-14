# tools/legacy-import — 舊站文章搬遷

把兩個舊站的文章連同內文與圖片抓回來，寫進資料庫。

| | 來源 | 篇數 | 技術 |
|---|---|---|---|
| 主站 | `www.20skin.tw/share_info.php?no=N` | **709**（實數） | PHP，爬 HTML |
| blog | `20skinblog.com` | **391**（實數） | WordPress 6.5.10，走 REST API |

> 🔴 **blog 站是 391 篇不是 101 篇。** 規劃書（docs/06 §部落格站）的 101 來自
> 2026-07-29 讀 Yoast `post-sitemap.xml`，2026-09-14 以 `x-wp-total` 實數確認是 391，
> 其中只有 19 篇是 07-29 之後才發佈的 —— 也就是**當時就數錯了**，不是後來長出來的。
> 跟主站「250 篇」那次低估是同一類錯誤（CLAUDE.md 關鍵數字）。

---

## 五個階段，順序不可跳

```bash
# 1. 探勘：逐分類爬列表，取得 709 篇的 no
node tools/legacy-import/discover.mjs

# 2. 抓原始檔（兩支可同時跑，打的是不同主機）
node tools/legacy-import/fetch-main.mjs      # 709 個內頁 → .cache/main/{no}.html
node tools/legacy-import/fetch-blog.mjs      # WP REST    → .cache/blog/*.json

# 3. 解析（不連網，改規則就重跑）
node tools/legacy-import/parse-main.mjs      # → parsed-main.json
node tools/legacy-import/parse-blog.mjs      # → parsed-blog.json

# 4. 抓圖並讀出實際尺寸
node tools/legacy-import/fetch-images.mjs    # → .cache/img/ ＋ images.json

# 5. 寫進資料庫（先 --dry-run 看一遍）
node tools/legacy-import/upload-images.mjs                       # 圖 → Blob
API_BASE_URL=… ADMIN_PASSWORD=… node tools/legacy-import/import.mjs
# 轉址表另外匯入：POST /admin/redirect/import ← redirects.csv
```

**階段二與階段四會對院方的正式主機發幾千個請求。** 兩站都還在服務病人，
每支腳本都限了速，而且**可續跑** —— 中斷了再跑一次只會補沒抓到的。
`.cache/` 不進版控但**不要刪**：刪了就得整批重抓。

---

## 踩過的坑

| 現象 | 原因 |
|---|---|
| 列表頁抓到 0 個連結 | 文章列不是 `<a href>`，是 `<tr onclick='location.href="share_info.php?no=842"'>`。而且標題那格的 `<th>` 不閉合就 `</tr>` |
| `curl` 一律 406 | Mod_Security 擋非瀏覽器 UA（CLAUDE.md）。帶瀏覽器 UA 就正常 |
| `share.php` 只有 91 篇 | 不帶 `class` 不是「全部文章」。要逐分類爬 |
| 圖片解析度偏低 | WP 的 `<img src>` 常常是 1024px 縮圖，原圖在 `srcset`。**不能靠檔名的 `-1024x683` 反推** —— 真有檔案本來就叫 `slide2-1024x575-1.png` |
| 兩篇日期的年份是 `0206` | 編輯把 `2026` 打錯，WP 照收。以 `modified` 修正 |
| blog 每篇都有 4 張以上的圖 | 其中兩張（橫幅 ＋ logo）出現在全部 391 篇，是頁尾樣板不是內容，剝掉 |
| 每篇開頭多一份目錄 | ez-toc 外掛的產物。前台自己會從 heading 算目錄，而且那份目錄的錨點指向舊網域 |

---

## 重跑很貴

匯入是冪等的，但**不便宜**：重跑會把 1100 篇全部 `PUT` 一次（更新會把內容打回草稿），
再寫一次關聯，再逐篇發布 —— 約 4400 次 API 往返，在本機 `func` 打 westus2 的
Azure SQL 上要一個多小時。瓶頸是往返延遲不是資料庫（實測 DTU 只用到 4%），
所以腳本用 `CONCURRENCY = 8` 並行。

⚠️ **不要為了修幾筆而重跑全部。** 失敗清單在 `.cache/import-failed.json`，
需要的話用 `--limit` 或另外挑出來處理。日後若常常要補跑，值得加一個
「內容沒變就跳過」的比對（目前沒有，因為資料庫沒有存內容雜湊）。

⚠️ **重跑期間前台不會斷。** 匯出讀的是已核准的版本快照，
工作副本回到草稿不影響已經上線的那一版（docs/11 §6.4）。

---

## 三個做了取捨的地方

**① 主站文章的 slug 是 `share-{no}`。**
舊站沒有 slug，只有流水號。中文標題產不出有意義的英文 slug，
所以用流水號 —— 它是決定性的，也讓 301 對照表變成一對一。
日後院方在後台改 slug 是安全的：改 slug 會自動寫一筆 301（STATUS §四）。

**② blog 有 71 篇的 slug 被改寫（底線 → 連字號）。**
API 只收 `^[a-z0-9]+(-[a-z0-9]+)*$`，而 WP 有 68 篇用底線、
1 篇全形底線、1 篇 U+2010 連字號、2 篇純中文（改用 `post-{id}`）。
**解法不是放寬 API** —— 底線在 Google 的斷詞裡不算分隔符，
放寬等於讓整站往後都可能出現底線網址，而且換不回來。
改成補一條站內 301（`/blog/atopic_dermatitis_2022/` → `/blog/atopic-dermatitis-2022/`），
院方那邊做單純的網域轉址就仍然會走到正確的頁面，只多一跳。

**③ blog 的 46 個 WP 分類壓成 4 個站內分類，原分類全部轉成標籤。**
`ArticleCategorySlug` 只有四個值且是定案值（docs/01 §1），
前台的 `/blog/{category}/` 與英文小標都綁在上面。
映射規則：`肌膚問題` 整支 → 皮膚新知、`演講和媒體` → 媒體報導、其餘 → 醫美新知。
**一個分類都沒有消失**，它們都在標籤裡。

---

## 兩件要回報院方的事

**① blog 的 WordPress 有垃圾注入的殘留。**
標籤庫裡有 `1Win Brasil`、`pin up casino`、`Новости Криптовалют`、`Форекс Обучение`
等 11 個博弈／加密貨幣的分類與標籤（2026-09-14）。
**它們沒有掛在任何一篇文章上**（`count` 全為 0），所以搬進來的內容是乾淨的，
但這通常代表該站曾被植入垃圾內容，值得檢查外掛與帳號。

**② 主站舊文章裡的外部連結多半已經死了。**
709 篇的內文連結幾乎全是 Facebook hashtag 與 `goo.gl` 短網址，
而 `goo.gl` 已於 2025 年停止服務。內文轉成區塊時這些連結會被攤平成純文字
（前台的區塊模型沒有行內連結），等於順手清掉一批死連結。

---

## 行內連結沒有丟，只是還沒渲染

前台的 `ArticleBodyBlock` 用 `{{ }}` 逸出渲染，沒有行內格式 ——
連結與粗體在畫面上看不到。但解析器**在每個文字區塊上多存了一份 `runs`**
（`{ text, href?, bold? }[]`），blog 站那 3290 條站內互連也已經改寫成
`/blog/{slug}/` 的新網址。

所以日後若決定支援行內連結，資料已經在資料庫裡，
**不必為了這件事再對舊站抓一次 1100 篇**。
`bodyBlocks` 在 API 是原樣存 JSON、沒有結構驗證，多帶欄位是安全的。

---

## 另外抓的一頁：contact.php（院區資料）

文章之外，**三個院區的地址、電話、LINE、交通與空間照只存在 `contact.php`**。

```bash
node tools/legacy-import/fetch-contact.mjs
#   → .cache/contact/contact.php.html      原始頁面
#   → .cache/contact/img/*                 18 張圖（門診時段表 ＋ 手繪地圖 ＋ 空間照）
#   → tools/legacy-import/contact.json     人工對照後的結構化資料（進版控）

node tools/legacy-import/import-contact.mjs --dry-run   # 先看一遍要改什麼
node tools/legacy-import/import-contact.mjs             # contact.json → 資料庫（走 API，需先啟動 func）
SKIN20_EXPORT_SQL=… pnpm --filter web export:content    # 資料庫 → content/*.json
```

⚠️ **`import-contact.mjs` 只寫 `contact.php` 抓得到的欄位**：地址、電話、LINE、門診時段、
開車路線。經緯度、`mapUrl`、大眾運輸與停車資訊**刻意不碰** ——
地圖指錯地方比沒有地圖糟。

`contact.json` **不是腳本產的** —— 只有三筆，而且時段得看圖判讀，所以是人工填的，
改了舊站要自己對一次。抓回來的當下（2026-09-14）：

| | 電話 | 地址 |
|---|---|---|
| 四季診所 | 04-23103389 | **台中市南屯區**公益路二段120號 |
| 二林四季皮膚科診所 | 04-8958678 | 526 彰化縣二林鎮儒林路二段310號 |
| 允赫齒科 | 04-8969966 | 526 彰化縣二林鎮儒林路二段306號 |

### 抓這一頁踩到的坑

| 現象 | 原因 |
|---|---|
| `contact.php` 回 **409** ＋ 一段 JS | Mod_Security 的第二道關卡，跟 CLAUDE.md 記的「非瀏覽器 UA 回 406」是不同一件事。帶 `Cookie: humans_21909=1` 就 200 |
| 抓不到門診時間 | **頁面上沒有任何一段文字寫時段**，三家都是一張圖。`contact.json` 的 `businessHours` 是看圖填的 |
| 允赫齒科的時段表看起來只剩 5 格 | `dental-time.png` 是 **RGBA**，被關掉的格子是**用白色塗掉的**（不是刪掉）。在黑底上打開會看到底下原本的 ○ —— 也就是這張表被改過，現存內容只剩「一晚、二早、三午、五晚、六早」 |

### 三件要先問院方，不要直接照抄上線

1. **四季診所在台中，不在二林。**（已於 2026-09-14 改掉，記在這裡是因為它值得記得）
   佔位資料把兩家都寫成彰化縣二林鎮，於是「兩院區相距步行可達」這種話寫進了三個模板。
   **佔位資料不會只錯在自己那一格** —— 它會長出一批建立在它之上的文案。
2. **門診時段的可信度存疑。** 時段圖的檔名是民國年的上傳時間 ——
   四季是 `1150626`（2026-06-26），**二林是 `1120831`（2023-08-31，三年沒換過）**；
   允赫齒科那張還被塗改過，頁面自己也寫「實際門診時間請來電確認為主」。
   **上線前必須由院方書面確認**，這是會讓病人白跑一趟的資料。
3. **允赫齒科（牙科）要不要納入新站尚未定案。** 資料先抓齊，`clinics.json` 目前只有兩家。

### 這頁抓不到、新站卻需要的

- **經緯度與 Google Maps 連結** —— 舊站的地圖是一張手繪 png，`latitude`／`longitude`／`mapUrl` 都得另外補。
- **大眾運輸與停車資訊** —— 舊站只寫「自行開車」。
- **空間照只有 750×450**，做首圖偏小；`reference/` 裡的院方原始照片解析度高得多，優先用那批。

---

## 又一頁：product01–04.php（療程資料）

```bash
node tools/legacy-import/fetch-treatments.mjs     # 4 個分類頁 ＋ 14 個細節頁 ＋ 28 張產品圖 → .cache/treatments/
node tools/legacy-import/parse-treatments.mjs     # → tools/legacy-import/treatments.json（進版控）
node tools/legacy-import/import-treatments.mjs --dry-run
node tools/legacy-import/import-treatments.mjs    # → 資料庫（走 API，需先啟動 func）
```

**分類頁才是主要來源，不是細節頁。** 28 項在分類頁上就帶了分類、英文名、中文名、適應症、
醫療器材許可證字號與產品圖；站內細節頁只有 14 頁，提供「小標題 ＋ 段落」——
正好是 `Treatments.Indications` 的 `items[].title` 與 `.desc`。

### 🔴 28 項，不是 27（已補上第 28 筆）

舊站把 **RADIESSE（再生針）** 與 **Ellanse（洢蓮絲）** 列成兩項，
而資料庫只有一筆 `radiesse`、標題卻寫「**Radiesse 洢蓮絲**」——
洢蓮絲是 Ellansé（PCL）、再生針是 Radiesse（CaHA），**不同廠牌的不同產品被併成一筆**。

2026-09-14 依「資料按照舊網站」處理：`radiesse` 的標題改回「Radiesse 再生針」，
`ellanse`（`/treatments/microneedle/ellanse/`）補建為第 28 筆。

### 🔴 許可證字號有 16 項在舊站上是重複的

| 字號 | 被掛在幾項身上 |
|---|---|
| 衛署醫器輸字第028717號 | **5 項** —— 光繞雷射、EMFACE、BTL Embody、高壓氧艙、EMSELLA |
| 衛署醫器輸字第021691號 | 4 項 —— 鉺雅鉻雷射、DermaV、TargetCool、ONDA |
| 衛署醫器輸字第021227號 | 3 項 —— Sculptra、Belotero Revive、Xeomin |
| 衛署醫器輸字第022991號 | 3 項 —— Radiesse、Restylane、Ellansé |
| 衛署醫器輸字第025955號 | 2 項 —— MiraDry、果酸換膚 |

許可證字號是主管機關核發給**單一品項**的識別碼，重複就代表至少有一項是錯的。
**照搬仍是決定（2026-09-14「資料按照舊網站」）** —— 這些字號現在就公開在舊站上，
搬過來不是產生新的宣稱。`import-treatments.mjs` 每次執行都會把重複清單印出來。
⚠️ 28 項都該由院方核對；相關敘述請以主管機關函釋及院方法務意見為準。

### 中文名改採舊站的說法（18 項）

新站原本用的是市場通稱，2026-09-14 一律改回舊站：
`POTENZA 黃金電波` → `無限電波`、`EMFACE 恰恰電波` → `菲斯波`、
`EMSELLA 幸福椅` → `倍達樂非侵入式治療裝置`、`Ulthera 超音波拉提` → `美國音波`⋯

⚠️ **只換中文那一段，英文前綴保留。** 標題格式在 28 筆之間本來就不一致
（有 5 筆根本沒有英文前綴），統一格式是設計決定，不是資料搬遷該做的事。

⚠️ **分類沒有跟著舊站改。** 舊站的四個分類（光療美顏／微針美容／光電美容／醫學美容護膚）
與新站的 `laser`／`photoelectric`／`microneedle`／`skincare` **不是同一套切法**。
分類是 [docs/01](../../docs/01-sitemap.md) §1 的定案值，而且決定 `urlPath` ——
改它等於改 28 個網址，那是資訊架構的決定，不是資料搬遷。

### 產品圖：28 張，走 content-import 的上傳管線

去背 PNG（550–1444px）已上傳，28 項全部有封面。對照表在
`tools/content-import/image-sources.json`，來源檔在 `.cache/treatments/img/`：

```bash
node tools/content-import/upload-images.mjs --dry-run
node tools/content-import/upload-images.mjs      # 需要 az 身分對 st20skinweb 有寫入權限
```

⚠️ **刻意放進既有的對照表，不另開一支上傳腳本** —— 那支腳本的對帳會檢查
「資料庫引用的每個 blobPath 都找得到檔案」，療程封面若不在它的視野裡就會被判成孤兒引用。
順帶修好那段對帳：它原本只比對自己的清單，所以 1100 篇文章的四千張圖（另一條管線傳的）
一直被誤判，2026-09-14 起改成把儲存體上已有的也算進來。

⚠️ `er-yag` 的封面由 `product-p17.png` 改為舊站實際使用的 `product-p02.png`。

### 12 個外連 blog 的療程：不必重抓，改成站內關聯

舊站那 12 個「more」按鈕指向 `20skinblog.com`，而那 391 篇已經在資料庫裡了。
`import-treatments.mjs` 把它們改寫成 `treatmentToArticle` 關聯（**11 筆**），
權重不再送往外部網域（[docs/01](../../docs/01-sitemap.md) §決策二）。
兩筆對不到文章，因為舊站連的根本不是文章：

| 療程 | 舊站連到 |
|---|---|
| `sylfirm` | `?s=矽谷電波` —— **站內搜尋結果頁**（站內有 7 篇矽谷電波的文章，挑哪篇是編輯決定） |
| `hydrafacial` | `/category/other-treatment/hydrafacial/` —— **分類頁**（站內有 2 篇） |

### 搬完之後療程頁仍然是「內容建置中」，這是對的

舊站**完全沒有** `facts`／`durationText`／`sessionsText`／`aftercare`／
`contraindications`／`mechanism` —— 療程時間、恢復期、術後照護、禁忌症一項都沒有。
前台的判斷式是 `summary && facts?.length`（`pages/treatments/[category]/[slug].vue`），
所以 26 頁仍然顯示精簡版並且 `noindex`。**這是刻意的**：一個對外說「建置中」的療程頁
比沒有那一頁更糟，它會進 sitemap、會被 Google 索引、會被 AI 當成院方對該療程的正式說明。
