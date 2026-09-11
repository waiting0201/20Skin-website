# 01 — Sitemap 資訊架構

新站台採用**語意化靜態網址**（`/path/` 形式），全面淘汰 `.php` 副檔名與中文 query string。

架構設計的核心轉變：**從「我們有哪些療程」轉為「你有什麼困擾」。**

頁面數量請見 [06-page-inventory.md](06-page-inventory.md)。

---

## 1. 完整目錄樹

```
/                                    首頁
│
├─ /about/                           品牌理念            ← index2.php#about
│   ├─ /about/new-chinese-aesthetics/   新中式美學       ← news-art.php
│   └─ /about/makeup-style/             彩妝式輕醫美     ← make-up-style.php
│
├─ /team/                            醫療團隊總覽        ← doctor.php
│   └─ /team/{doctor-slug}/             醫師個人頁 ×14  【新增】
│
├─ /treatments/                      專業服務總覽       【新增・樞紐頁】
│   ├─ /treatments/laser/               光療美顏         ← product01.php
│   ├─ /treatments/microneedle/         微針美容         ← product02.php
│   ├─ /treatments/photoelectric/       光電美容         ← product03.php
│   ├─ /treatments/skincare/            醫美保養         ← product04.php
│   └─ /treatments/{分類}/{療程}/        療程細節頁 ×27 【全面 CMS 化】
│
├─ /concerns/                        肌膚困擾入口       【新增・SEO 主戰場】
│   ├─ /concerns/acne/                  痘痘・粉刺
│   ├─ /concerns/sensitive-skin/        敏感肌
│   ├─ /concerns/pigmentation/          斑點・色素沉澱
│   ├─ /concerns/anti-aging/            抗老・緊緻
│   ├─ /concerns/hair-loss/             生髮・落髮
│   ├─ /concerns/hair-removal/          除毛
│   ├─ /concerns/hyperhidrosis/         多汗・狐臭
│   └─ /concerns/dermatology/           一般皮膚疾病
│
├─ /blog/                            臻美分享  ← share.php + 20skinblog.com
│   ├─ /blog/medical-aesthetics/        醫美新知
│   ├─ /blog/dermatology/               皮膚新知
│   ├─ /blog/media/                     媒體報導
│   ├─ /blog/lectures/                  演講授課
│   ├─ /blog/{slug}/                    文章內頁（約 800 篇）
│   └─ /blog/tag/{tag}/                 標籤彙整頁
│
├─ /cases/                           案例分享  【新增・須符合醫療廣告規範】
│   └─ /cases/{slug}/
│
├─ /faq/                             常見問題  【新增・AI FAQ 主體】
│   └─ /faq/{category}/
│
├─ /clinics/                         診所據點  ← contact.php（修復 409）
│   ├─ /clinics/siji/                   四季診所
│   └─ /clinics/erlin/                  二林四季皮膚科
│
└─ /contact/                         聯絡我們

系統頁：/sitemap.xml　/robots.txt　/search/　/404
法務頁：/privacy/　/terms/　/medical-disclaimer/  【新增】
外部　：booking.20skin.tw ↗　20skinshop.com ↗  （排除於規劃）
```

### 療程 slug 對照

| 分類 | 療程 slug |
|---|---|
| `laser/` | `picosure-pro`、`capri-blue`、`helios-iii`、`er-yag` |
| `photoelectric/` | `emface`、`dermav`、`onda`、`emsella`、`btl-embody`、`thermage-flx`、`ulthera`、`sylfirm`、`potenza`、`lightsheer-duet`、`miradry`、`regenera-activa` |
| `microneedle/` | `sculptra`、`radiesse`、`belotero-revive`、`restylane`、`xeomin` |
| `skincare/` | `targetcool`、`hbot`、`hydrafacial`、`neostrata-peel`、`retinol-peel`、`neo-tec` |

> 現行分類歸屬有誤（DermaV、BTL Embody 陳列在光療美顏但檔名屬 product02），改版時需重新歸類。詳見 [06-page-inventory.md](06-page-inventory.md) §3。

---

## 2. 三個關鍵架構決策

### 決策一：新增 `/concerns/` 困擾導向入口

**這是整個架構最重要的改變。**

現有網站入口全是「療程導向」：使用者必須先知道「皮秒雷射」這個名詞才找得到你。但真實搜尋行為相反 —— 使用者搜的是「臉上痘疤怎麼消」「眼周細紋 要打什麼」「彰化 除毛 推薦」。

困擾頁承接的是**還不知道要做什麼療程的人**，也就是漏斗最上層、量體最大、競爭者最少著墨的一群。

動線：**困擾頁（我怎麼了）→ 療程頁（可以怎麼解決）→ 醫師頁（誰來幫我做）→ 預約**

首頁已列出的八大專科正好完整對應這八個困擾頁 —— 內容素材本來就有，只是沒有給它們獨立網址。

### 決策二：14 位醫師各自獨立成頁

醫療類內容的排名關鍵是 E-E-A-T，而 E-E-A-T 需要一個「人」來承載。醫師個人頁同時解決三件事：

1. 「黃勇學醫師」「施百潤 醫師」等人名搜尋流量目前完全流失
2. 文章與療程頁掛上具名作者／主治醫師後，整體內容可信度提升
3. AI 回答「彰化二林皮膚科推薦」時需要結構化的醫師資料可引用 —— 14 位堆在同一頁的清單，AI 幾乎無法正確歸因

### 決策三：`20skinblog.com` 全站整併進 `/blog/`

27 項療程中有 12 項直接外連 blog 站。主站每次內部連結都在把權重送往外部網域，而 blog 站累積的外部連結也無法回饋主站。

**本專案的範圍是「把 101 篇文章與圖片抓回來」，保留原 slug**（`20skinblog.com/emface/` → `20skin.tw/blog/emface/`）。

> ⚠️ **跨網域 301 不在本專案範圍內。** 沒有 301 的話會有三個後果，需院方知情並自行決定如何處理：
> 1. **blog 站累積的外部連結與排名不會傳遞到主站** —— 整併的主要效益（權重回流）拿不到。
> 2. **同一篇文章同時存在於兩個網域**，形成重複內容，兩邊互相稀釋。
> 3. 舊網址仍在 Google 索引中，使用者可能持續進到舊站。
>
> 三個處理方式，成本由低到高：**① 請 blog 主機商加一組 301 規則**（一次性設定，最完整）；**② 在舊 blog 頁面加 `<link rel="canonical">` 指向新網址**（次佳，至少解決重複內容）；**③ 直接停用 blog 站**（避免重複內容，但權重全數損失）。什麼都不做是最差的選項。
>
> 保留原 slug 的作法不變 —— 日後若補上 301，對照關係現成可用。

---

## 3. 內部連結矩陣

架構的價值在於連結關係，而不只是目錄樹。

| 起點 | 連向 | 規則 |
|---|---|---|
| **困擾頁** | 療程頁（多對多） | 「針對此困擾的建議療程」，依適合度排序，每項附一句話說明。**困擾頁的主要轉換出口。** |
| | 相關 FAQ | 頁面下半部嵌入該分類 5–8 則 FAQ |
| | 相關文章 | 「延伸閱讀」3–5 篇 |
| **療程頁** | 所屬分類＋總覽 | 麵包屑：首頁 › 專業服務 › 光療美顏 › 蜂巢皮秒雷射 |
| | 可執行的醫師 | 「本療程醫師團隊」卡片列 → `/team/{doctor}/` |
| | 適應的困擾（多對多） | 「此療程可改善」標籤列，反向連回 `/concerns/` |
| | 相關案例＋FAQ | 案例須符合醫療廣告規範 |
| **醫師頁** | 專長療程＋專長困擾 | 由專長 tag 自動帶出，形成醫師↔療程↔困擾三角網絡 |
| | 具名／審閱的文章 | 強化作者訊號，讓文章權重回流醫師頁 |
| | 看診據點 | → `/clinics/{clinic}/`，顯示該醫師時段 |
| **文章頁** | 文中提及的療程 | 後台「關聯療程」欄位掛勾，前台自動產生療程卡片。**避免手工插連結導致漏連與死連。** |
| | 作者醫師 | 署名連向醫師頁，顯示「本文由 ○○○ 醫師審閱」與日期 |
| **據點頁** | 駐診醫師＋可提供療程 | 地區搜尋主要落地頁，須完整承載 NAP 與營業時間 |

---

## 4. 301 轉址對照

改版上線當日必須同步生效。完整條數估算（本專案約 770 條）見 [06-page-inventory.md](06-page-inventory.md) §6。

| 舊網址 | 新網址 |
|---|---|
| `/index2.php` | `/` |
| `/doctor.php` | `/team/` |
| `/news-art.php` | `/about/new-chinese-aesthetics/` |
| `/make-up-style.php` | `/about/makeup-style/` |
| `/contact.php` | `/clinics/` |
| `/contact.php#20` | `/clinics/erlin/` |
| `/product01.php` | `/treatments/laser/` |
| `/product02.php` | `/treatments/microneedle/` |
| `/product03.php` | `/treatments/photoelectric/` |
| `/product04.php` | `/treatments/skincare/` |
| `/product01-d01.php` | `/treatments/laser/picosure-pro/` |
| `/product01-d02.php` | `/treatments/laser/er-yag/` |
| `/product02-d21.php` | `/treatments/photoelectric/dermav/` |
| `/product02-d22.php` | `/treatments/photoelectric/btl-embody/` |
| 其餘 `product**-d**.php` | 逐一對照，**禁止萬用字元** |
| `/share.php?class=醫美新知` | `/blog/medical-aesthetics/` |
| `/share.php?class=皮膚新知` | `/blog/dermatology/` |
| `/share.php?class=媒體報導` | `/blog/media/` |
| `/share.php?class=演講授課` | `/blog/lectures/` |
| `/share.php?class=X&year=YYYY` | 對應分類頁（年份改為篩選參數＋canonical） |
| ~~`20skinblog.com/{slug}/`~~ | ⛔ **不在本專案範圍**，需 blog 主機端自行設定。見上方決策三 |

### 執行三原則

1. **一對一，不偷懶。** 把所有舊療程頁一次導向 `/treatments/` 總覽頁，Google 會視為軟性 404，權重不會傳遞。
2. **舊網域至少保留 12 個月。** `20skin.tw` 舊主機的 301 須維持至少一年。（`20skinblog.com` 的處置屬院方決定，見決策三）
3. **上線後連續 8 週監控** Search Console 的「已檢索但未編入索引」與 404 報告。

> ⚠️ **舊 URL 清單目前不完整。** 疑似存在孤兒頁面（檔案還在但無列表連結）。開工前須取得主機檔案系統清單、Search Console URL 匯出、access log 三者取聯集。見 [06-page-inventory.md](06-page-inventory.md) §3。
