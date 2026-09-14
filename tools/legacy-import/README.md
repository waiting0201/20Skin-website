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
