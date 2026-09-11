# `frontend/` — 20SKIN 前台 ＋ 後台

Nuxt 3 純靜態（`nuxt generate`）。一份程式碼兩種產物：前台預渲染約 950 頁、後台 `/admin/**` 純 SPA。
架構決策見 [docs/09-frontend.md](../docs/09-frontend.md)，部署見 [docs/07-deployment.md](../docs/07-deployment.md)。

```bash
pnpm install
pnpm dev            # http://localhost:3000
pnpm build          # → .output/public（上傳的就是這一包）
pnpm verify:css     # 驗收閘，改完一定要跑
```

---

## 第一條規則：樣式照抄 `mockup/`，不做視覺重新詮釋

`mockup/`（方向 A）是客戶 2026-08-27 選定的設計，**它是樣式的唯一真實來源**。

| 做什麼 | 怎麼做 |
|---|---|
| 要改樣式 | **改 `mockup/assets/*.css`，再跑 `pnpm sync:assets`** |
| 不可以 | 在 `.vue` 裡寫 `<style>`、在 `app/` 開 `.css`、直接改 `public/assets/`（會被覆蓋） |
| 不可以 | 發明新的 class 名稱。要用的 class 必須已經出現在 mockup 的標記裡 |

`public/assets/` 是 `mockup/assets/` 的**逐 byte 複製**（不進版控，由 `sync:assets` 重建）。
`base.css` 全站掛載（`nuxt.config.ts`），各頁的 `assets/pages/NN-*.css` 由該頁自己宣告。

### `pnpm verify:css` 驗四件事

1. `public/assets` 的樣式與 `mockup` 逐 byte 相同
2. `app/`（不含 `admin/`）底下的 `.vue` 沒有 `<style>` 區塊
3. `app/`（不含 `admin/`）底下沒有自己的 `.css`
4. 前台用到的每一個寫死的 class，都在 mockup 的標記裡找得到
   —— 頁面只比對「自己那一頁 ＋ `index.html` 的共用外框」，所以**抄錯頁的區塊也會被抓到**

> ⚠️ 後台 **不受這四條管**（路由 `app/pages/admin/**`、共用元件 `app/admin/**`）。
> 後台沒有設計稿，是依功能切的（docs/09 §8）—— 但它會沿用 `base.css` 的設計 token（`--brand`／`--ink`／`--line`⋯），視覺才不會像兩個站。

---

## 怎麼把一頁 mockup 搬進來

參考範例：[`app/pages/404.vue`](app/pages/404.vue) ← `mockup/20-404.html`。照這個形狀寫：

1. `usePageHead({ title, description, pageCss, path, jsonLd })`
   —— `pageCss` 就是這一頁在 mockup 的樣式路徑，例如 `/assets/pages/16-faq.css`
2. `<template>` 的內容是 mockup 那一頁 `<main id="main">` 的**內部標記**，逐字照抄
   —— header／footer／浮動諮詢鈕已經在 `layouts/default.vue`，**不要再抄一次**
3. 把寫死的 `NN-xxx.html` 換成 [docs/01-sitemap.md](../docs/01-sitemap.md) §1 的正式網址
4. 重複的區塊改 `v-for`，資料抽到 `<script setup>` 或 `~/data/<domain>.ts`
5. 圖片路徑 `assets/img/x.jpg` → `/assets/img/x.jpg`（絕對路徑）
6. **不寫 `<style>`**

### 連結一律用原生 `<a>`，不要用 `<NuxtLink>`

mockup 的 `assets/app.js` 是客戶指定原樣保留的動效系統（CLAUDE.md 決策 11），
它在解析時一次性初始化 `[data-slider]` 等元素。**前端路由換頁不會重跑它**，
輪播與 tab 到第二頁就不會動。這是一個全部預渲染成實體 HTML 的內容站，
整頁換頁沒有實質代價，換來的是每一頁的行為與 mockup 逐字相同。

後台是 SPA、不載入 `app.js`，不受這條限制。

### 資料現在從哪來

正式站的內容在建置期由 SQL 匯出成 `content/*.json`（docs/09 §3），**現在還沒有資料庫**。
所以先把 mockup 頁面裡的內容抽成 `app/data/<domain>.ts`，形狀對齊
[docs/08-database.md](../docs/08-database.md) 的欄位命名。接上 CMS 時只換來源、不改元件。

⚠️ 內容用 mockup 的原文，**不要自己編**。客戶看 demo 時要看得懂那是自己的東西。

---

## 路由對照（mockup 檔名 → 正式網址）

網址權威為 [docs/01-sitemap.md](../docs/01-sitemap.md) §1，模板清單見 [docs/06](../docs/06-page-inventory.md) §1。

| mockup | 模板 | Nuxt 檔案 | 網址 |
|---|---|---|---|
| `index.html` | 1 首頁 | `pages/index.vue` | `/` |
| `09-about.html` | 2 品牌理念 | `pages/about/index.vue` | `/about/` |
| `10-story.html` | 3 長版故事 | `pages/about/[slug].vue` | `/about/new-chinese-aesthetics/`、`/about/makeup-style/` |
| `11-team-list.html` | 4 醫師列表 | `pages/team/index.vue` | `/team/` |
| `05-doctor-detail.html` | 5 醫師個人頁 | `pages/team/[slug].vue` | `/team/{slug}/` |
| `12-treatment-overview.html` | 6 療程總覽 | `pages/treatments/index.vue` | `/treatments/` |
| `03-treatment-category.html` | 7 療程分類 | `pages/treatments/[category]/index.vue` | `/treatments/{category}/` |
| `04-treatment-detail.html` | 8 療程細節 | `pages/treatments/[category]/[slug].vue` | `/treatments/{category}/{slug}/` |
| `13-concern-overview.html` | 9 困擾總覽 | `pages/concerns/index.vue` | `/concerns/` |
| `02-concern-detail.html` | 10 困擾細節 | `pages/concerns/[slug].vue` | `/concerns/{slug}/` |
| `06-blog-list.html` | 11 文章列表 | `pages/blog/index.vue`、`pages/blog/[category]/index.vue`、`pages/blog/tag/[tag].vue` | `/blog/`、`/blog/{category}/`、`/blog/tag/{tag}/` |
| `07-article-detail.html` | 12 文章內頁 | `pages/blog/[slug].vue` | `/blog/{slug}/` |
| `14-case-list.html` | 13 案例列表 | `pages/cases/index.vue` | `/cases/` |
| `15-case-detail.html` | 14 案例內頁 | `pages/cases/[slug].vue` | `/cases/{slug}/` |
| `16-faq.html` | 15 FAQ | `pages/faq/index.vue`、`pages/faq/[category].vue` | `/faq/`、`/faq/{category}/` |
| `17-clinic-list.html` | 16 據點列表 | `pages/clinics/index.vue` | `/clinics/` |
| `08-clinic-detail.html` | 17 據點細節 | `pages/clinics/[slug].vue` | `/clinics/{slug}/` |
| `18-contact.html` | 18 聯絡我們 | `pages/contact.vue` | `/contact/` |
| `19-search.html` | 19 搜尋結果 | `pages/search.vue` | `/search/` |
| `20-404.html` | 20 404 | `pages/404.vue` | `/404` |
| `21-legal.html` | 21 法務頁 | `pages/legal/[slug].vue` ＋ 三條路由 | `/privacy/`、`/terms/`、`/medical-disclaimer/` |

⚠️ **`/blog/[category]/` 與 `/blog/[slug]/` 會打架**（`/blog/media/` 既像分類也像文章 slug）。
分類只有四個且是固定值，所以 `pages/blog/[category]/index.vue` 要在 `definePageMeta` 用
`validate` 限定那四個 slug，不符的交給 `[slug].vue`。

---

## SEO 是每一頁的驗收項，不是最後補的

[docs/03-seo-geo.md](../docs/03-seo-geo.md) 的要求逐頁落在 `usePageHead()`：

- Title／Meta／canonical／OG —— `usePageHead` 已包好
- **JSON-LD** —— 一個模板一種 schema（療程頁 `MedicalProcedure`、醫師頁 `Physician`、
  困擾頁 `MedicalCondition`、文章頁 `Article`、FAQ `FAQPage`、據點 `MedicalClinic`），
  全站另加 `BreadcrumbList`（用 `breadcrumbJsonLd()`）
- **AI 摘要**（40–60 字直答式段落）要渲染成頁面第一段可見文字，不是只放 meta
- 圖片一律帶 `width`／`height`（CLS），首屏外 `loading="lazy"`

---

## 目錄

```
app/
├── app.vue                  # 掛 app.js；前台不用 NuxtLink 的原因寫在這裡
├── layouts/default.vue      # skip-link → header → main#main → footer → 諮詢面板
├── components/Site*.vue     # Header / Footer / Consult，標記照抄 mockup
├── composables/usePageHead.ts
├── data/                    # 暫時的內容來源，形狀對齊 docs/08 的欄位
├── pages/                   # 21 個模板
│   └── admin/               # 後台路由（ssr: false 的 SPA）
└── admin/                   # 後台共用元件／單元宣告／權限（不受照抄規則管）
public/
├── assets/                  # ← mockup/assets 的逐 byte 複製，不進版控
├── staticwebapp.config.json # ⚠️ 必須在 public/ 根，Nuxt 會原樣複製到 .output/public
└── robots.txt
scripts/
├── sync-mockup.mjs          # mockup/assets → public/assets
└── verify-css.mjs           # 驗收閘
```

## 驗收閘

```bash
pnpm verify          # verify:css ＋ verify:links，兩道都要過
```

| 閘 | 驗什麼 |
|---|---|
| `verify:css` | 樣式與 mockup 逐 byte 相同、前台沒有自建樣式、沒有發明的 class |
| `verify:links` | 掃 `.output/public` 的產出，站內連結沒有指不到的目標（需先 `pnpm build`） |

`nuxt.config.ts` 的 `prerender.failOnError` 是 **`true`**，不要改成 false ——
沒有 staging，build 是唯一的攔截點。設 false 的代價實測過：一頁渲染失敗之後
build 照樣顯示成功、那一頁靜靜地從產物裡消失，只有連結檢查才抓得到。

## 還沒做的事

- `content/*.json` 的建置期匯出（要等資料庫）；現在資料在 `app/data/*.ts`
- `sitemap.xml`／`llms.txt`／`faq.json` 的建置期產生
- 站內搜尋索引（`/search/` 只有版面與空狀態）
- 後台第二輪的 13 個畫面：審核佇列、媒體庫、未命中題目、sitemap／301／匯出、
  首頁版位、選單、全站設定、帳號、角色（側邊選單已列成灰階佔位）
- 後台的上傳、富文本、拖曳排序（現為貼網址／等寬文字框／上下移動按鈕）

## 已知的 mockup 標記瑕疵

`07-article-detail.html` 與 `15-case-detail.html` 的 `<figcaption>` 包在
`<figure>` 底下的 `<div>` 裡，依 HTML 規格它只能是 `<figure>` 的直接子元素，
Vue 編譯時會警告。**沒有修**：把它移出那層 div 會讓圖說從受限寬度變成滿版，
等於改版面。要修請先改 mockup。
