# 文件索引

20SKIN 美醫集團網站改版專案的工程端文件。客戶交付物在 [`../output/`](../output/)。

## 閱讀順序

| # | 文件 | 內容 |
|---|---|---|
| 00 | [site-audit](00-site-audit.md) | 現況診斷 — 舊站問題盤點與嚴重度分級 |
| 01 | [sitemap](01-sitemap.md) | 資訊架構 — 目錄樹、架構決策、內部連結矩陣、301 對照 |
| 02 | [backend-cms](02-backend-cms.md) | 後台 — 內容模型、權限、法遵設計、遷移計畫 |
| 03 | [seo-geo](03-seo-geo.md) | SEO 與 GEO — 技術項、schema、關鍵字架構、生成式引擎最佳化 |
| 04 | [ai-faq](04-ai-faq.md) | AI FAQ — 50 題題庫、雙版本答案、技術實作 |
| 05 | [roadmap](05-roadmap.md) | 導入時程 — 兩階段推進、成效指標、內部風險備註 |
| 06 | [page-inventory](06-page-inventory.md) | **頁面清點與工程量估算** — 模板數、URL 數、工時提醒 |
| 07 | [deployment](07-deployment.md) | **部署架構與 CI/CD** — Azure SWA（Free）＋ 獨立 Azure Functions（.NET 10．EF Core ＋ Dapper）＋ Blob ＋ SQL、平台硬限制、GitHub Actions、EF Core 遷移 |
| 08 | [database](08-database.md) | **資料庫規劃** — 以功能單元劃分的 38 張表、共用內容主幹、權限與帳號、301 對照表、EF Core 對應與種子順序 |
| 09 | [frontend](09-frontend.md) | **前端技術架構** — 一份 Nuxt 專案兩種產物、建置期資料流、純靜態站的三個執行期例外、21 個模板對應、後台 SPA |
| 10 | [api](10-api.md) | **API 契約** — 回應信封、錯誤碼、端點清單、權限碼與五種角色對應 |
| 11 | [backend-design](11-backend-design.md) | **後端施工標準** — 分層鐵律、集中式路由與預設拒絕、EF Core ＋ Dapper 分工、工作流狀態機、Coding Checklist |

## 原始資料

- [research/site-audit-raw.md](research/site-audit-raw.md) — 2026-07-29 抓取的原始數據與待補資料清單
- [templates/](templates/) — 部署範本（GitHub Actions workflow、`staticwebapp.config.json`），複製到網站程式碼 repo 用

## 快速數字

| 項目 | 數量 |
|---|---|
| 前台模板 | 21 |
| URL 實例 | 約 950 |
| 後台畫面 | 約 31 |
| 療程項目 | 27（12 項無站內內容） |
| 文章 | 約 800（主站 ~700＋blog 站 101） |
| 團隊成員 | 14（13 醫師 ＋ 1 藝術總監）|
| 301 規則 | 約 770（主站；blog 站 103 條不在範圍內。放不進 `staticwebapp.config.json` 的 20 KB 上限，改由 `/api/fallback` 查表，見 [07](07-deployment.md) §2） |

## 客戶版與內部版的差異

客戶版規劃書（`output/`）刻意省略了以下內部內容：

- 「緊急止血」階段（四個阻斷級問題）—— 不列入報價，建置時一併處理
- 風險與控管章節 —— 見 [05-roadmap.md](05-roadmap.md) 末段
- 結語
- 301 執行三原則 —— 見 [01-sitemap.md](01-sitemap.md) §4
- **醫療廣告法遵整節** —— 見 [02-backend-cms.md](02-backend-cms.md) §5

客戶版定位是「單純講網頁的事情」，不談法規。相關措辭一律改為中性的「內容確認／審核」說法。

修改客戶版時請留意不要把這些內容加回去。
