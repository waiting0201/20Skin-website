# 後台端到端檢查

兩支腳本，用真的瀏覽器把後台走一遍。比照 [`tools/api-smoke`](../api-smoke/README.md) 的慣例分成唯讀與會寫入兩支。

| 腳本 | 驗什麼 | 安全性 |
|---|---|---|
| `check.mjs` | 畫面開不開得起來、21 個區塊 JSON 欄位有沒有渲染成表單、摺疊列讀不讀得懂、追蹤碼擋不擋得住、模式切換的選中狀態、拖曳把手在不在（**首頁版位那一頁是「不該在」**）、編輯頁回不回得去列表、首頁版位的兩欄版面與那三個被拿掉的控制項 | 🟢 **不寫任何資料** |
| `publish-flow.mjs` | 在後台改一筆 → 儲存 → 發布 → **前台真的跟著變** → 還原；另外真的拖一次清單排序再拖回來 | 🔴 **會真的改資料**（會還原，但中途失敗就停在改動後） |

## 為什麼需要它

`typecheck`、`build`、`verify:css` 與 `tools/content-roundtrip` 都只看得到**資料**，看不到**畫面**。
2026-09-17 第一次接上這支腳本，當場抓到三個所有閘門都放行的問題：

| | 問題 | 為什麼別的閘門抓不到 |
|---|---|---|
| ① | 摺疊列顯示 `lead`、`why-ages-faster`、`info` 這種原始代碼而不是內容 | 資料完全正確，錯的只有「顯示哪一個欄位」 |
| ② | `collapsible` 宣告了**沒有人讀** —— 28 個區塊的文章一次渲染 104 個輸入框 | 純粹是渲染量，不影響任何資料 |
| ③ | 本機 dev 的 `/assets/base.css` 與 logo 一律 404 | 正式站是對的（同源），只有 dev 打不到；而且畫面「看起來還好」 |

`publish-flow.mjs` 則是唯一驗得到**整條鏈**的方法：

```
表單 → content-fields 的序列化 → API 的寫入路徑 → 版本快照 → 前台的 parseBlocks
```

中間任何一段錯了，症狀都是**前台那一區靜默消失**，而 HTTP 仍然是 200、仍然收在 sitemap 裡。

## 安裝

```bash
cd tools/admin-e2e
npm install                    # ⚠️ 刻意不在 pnpm workspace 裡，不會污染前後台的相依樹
npx playwright install chromium
```

## 用法

三個服務都要起來（三個終端機）：

```bash
cd functions && func start --port 7071
cd apps/admin && VITE_API_BASE_URL=http://127.0.0.1:7071/api/v1 pnpm dev
cd apps/web   && NUXT_PUBLIC_API_BASE_URL=http://127.0.0.1:7071/api/v1 npx nuxt dev --port 3100
```

```bash
node tools/admin-e2e/check.mjs           # 🟢 唯讀
node tools/admin-e2e/publish-flow.mjs    # 🔴 會改資料
```

位址可覆蓋：`--admin`／`--api`／`--web`，或 `SKIN20_ADMIN_URL`／`SKIN20_API_BASE`／`SKIN20_WEB_URL`。
帳密走 `SKIN20_SMOKE_USER`／`SKIN20_SMOKE_PASSWORD`（預設 `sa@system.local` / `Admin@123`）。

> ⚠️ `tools/api-smoke/read.mjs` 的預設密碼是 **`Import@2026x`**，這裡是 **`Admin@123`**。
> 兩支不一樣 —— 2026-09-17 曾經因此誤判成「開發庫的密碼被改過」。

## 🔴 `publish-flow.mjs` 的風險

- **會改資料。** 它自己挑一筆已發布、有內容的文章與療程，備份 → 改動 → 驗證 → 還原 → 重新發布。
- **中途失敗會停在改動後的狀態。** 失敗時會印出備份目錄的位置，照著 JSON 手動還原。
- **還原的是欄位的值。** `ContentVersions` 會多出幾筆版本快照 —— 那是發布機制本身產生的，清不掉也不需要清。
- 🔴 **不要對正式環境跑。** 除了會改到線上內容以外，正式環境的登入有 reCAPTCHA v3，腳本拿不到有效的 `botCheckToken`（與 `api-smoke` 同一個限制）。

## 寫這兩支時踩過的坑

- ⚠️ **不要用 `waitUntil: 'networkidle'`。** Vite 的 HMR 是一條長連線，networkidle 永遠等不到，腳本會卡住不動。
- 🔴 **不要用 `page.goto()` 或 `reload()` 換頁。** 後台是 `createWebHistory` 的 SPA，而 access token **只放記憶體**（`apps/admin/src/auth.ts`：重新整理分頁就會登出）。整頁載入等於被踢回登入頁，而失敗訊息只會說「找不到某個選擇器」。換頁一律走 `_shared.mjs` 的 `navigate()`（`pushState` ＋ `popstate`）。
- ⚠️ **不要寫死內容的 id。** 各環境的 id 不一樣，兩支腳本都是先用 API 撈出「有內容可以驗」的那幾筆。
- ⚠️ 登入失敗 5 次會鎖 15 分鐘，**只算帳號**，換機器也解不開。
- 🔴 **拖曳一定要回 API 對整個單元的順序，不能只看畫面。** 2026-09-17 導入拖曳時，
  畫面上「被拖的那一列」看起來完全正確，實際上整個單元已經被洗牌 —— 因為送出的是
  當頁那 20 筆配 0..19，而資料庫裡的 `SortOrder` 幾乎整批是 0。要**重新載入**才看得出來。
- ⚠️ **合成滑鼠不會「拖到視窗邊緣自動捲動」**（真人瀏覽器會）。目標列在畫面外時，
  放開等於什麼都沒發生，而且沒有任何錯誤。`dragRow()` 會直接擋下這種情況並說明；
  選單頁的頂層區塊很高（相鄰兩塊差約 1600px），要先 `page.setViewportSize()` 拉高視窗。
- ⚠️ 那一列的 `draggable` 是**按住把手之後**才由 Vue 補上的，mousedown 完要等一拍再移動。
