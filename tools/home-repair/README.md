# 首頁版位的災難復原

首頁的主視覺輪播（`hero`）與八大專科入口（`specialties`）不見了、或首頁整個 5xx 時用這一支。

它做的事：**在版本歷程裡找出最後一版「版位設定還是好的」快照，把那兩欄的 `settings`
搬回現在的工作表，然後重新發布。**

🔴 **它刻意不用 `POST .../versions/{no}/restore`。** 那支還原的是**整筆 Page**
（標題、欄位、SEO、關聯、`SortOrder`，以及每個版位引用了哪幾筆內容），等於把
「壞掉之後到現在」的每一個編輯一起退掉。2026-09-17 正式站實際比對到：
v2 → v4 之間有人重排過「精選療程」，整筆還原會把那次調整吃掉；首頁那筆 Page 的
`SortOrder` 也會被寫回舊值，破壞「排序值不重複」（拖曳排序的前提，決策 21）。
**壞掉的只有兩欄，就只搬那兩欄。**

```bash
# 只看不改（預設）
node tools/home-repair/repair.mjs --api http://127.0.0.1:7071/api/v1

# 真的動手
node tools/home-repair/repair.mjs --api http://127.0.0.1:7071/api/v1 --apply
```

## 🔴 對正式環境要自己帶 token

`POST /auth/login` 掛著 reCAPTCHA v3（CLAUDE.md 決策 15），**命令列拿不到 token**，
一律回 `BOT_CHECK_FAILED`。做法：

1. 用瀏覽器登入後台（`https://<站台>/admin/`）。
2. DevTools → Network → 隨便點一個 `/admin/…` 的請求 → Request Headers →
   複製 `Authorization: Bearer ` 後面那一長串。
3. 馬上跑（token 有效期很短）：

```bash
SKIN20_ADMIN_TOKEN='eyJ…' \
  node tools/home-repair/repair.mjs --api https://<函式 App>/api/v1 --apply
```

本機開發環境沒設 `BotCheck:SecretKey`，不帶 token 時會自動用帳密登入
（`SKIN20_ADMIN_USER` ／ `SKIN20_ADMIN_PASSWORD`，預設 `sa@system.local` ／ `Admin@123`）。

## 為什麼會需要這一支

2026-09-17 正式站實際發生過：

- 舊版後台的 `putSections` 是「hero 送 heroSettings、其餘一律送 null」，
  於是按一次**「儲存草稿」**就把 `hero.settings` 的陣列壓成
  `{"0":…,"1":…,eyebrow:…}`、把 `specialties.settings` 清成 `null`。
- 工作表其實早就壞了，**只是一直沒人重新發布**，前台讀的快照還是好的。
- 有人按了「發布」→ 壞掉的工作表被複製進快照 → 前台首頁
  `((intermediate value) ?? []).map is not a function`，**整頁 500**，其餘每一頁都正常。

程式面兩邊都修了：`putSections` 改成原樣往返（不會再被弄壞）、
`apps/web/app/data/home.ts` 加了形狀防護（壞了只少那一區，不再 5xx）。
**但已經壞掉的值救不回來** —— 那就是這一支的工作。

## ⚠️ 幾件要知道的事

- **`PUT /admin/home-section` 只改工作副本。** 前台讀的是已核准快照，所以一定要再發布
  一次 —— 工具已經包含這一步，不要只寫回就以為好了。
- **動手前先備份現況**：`GET /admin/home-section` 存成檔案。工具不會自己備份。
- **後台的「版本歷程」畫面 2026-09-16 移除了，端點刻意保留**，就是為了這種時候
  （見 `apps/admin/src/components/EditPage.vue` 檔尾）。這支工具是那些端點的門面。
- **所有版本都壞掉時救不回來。** 那時要改用 `tools/content-import`（`import.mjs` §13）
  依 `image-sources.json` 重新產出 hero 與 specialties 的設定 —— 圖片的 blob 路徑是
  「用途｜原始檔名」算出來的，可以重現。
- 收工前**實際打開前台首頁看一眼**。工具只驗到公開端點 `GET /home` 的形狀。

## 常設把關

`tools/admin-e2e/publish-flow.mjs` 的場景 D 有兩條相關的：

- 「沒被碰到的版位沒有跟著消失」—— 擋 `putSections` 再次把 settings 清掉
- 「版位設定形狀壞掉時，首頁要降級而不是 500」—— 擋前台的防護被拿掉
