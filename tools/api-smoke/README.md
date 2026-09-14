# API 煙霧測試

兩支腳本，驗的是**後台與前台實際會打的那些呼叫，API 真的給得出對的東西嗎**。

| 腳本 | 驗什麼 | 安全性 |
|---|---|---|
| `read.mjs` | 唯讀：回傳的**形狀與鍵名**跟 `apps/admin/src/api/` 對得上 | 🟢 只讀。可對任何環境跑（`--no-contact` 可跳過那封會真的寄出的通知信） |
| `write.mjs` | 寫入：建立／更新／關聯／工作流／版本還原／轉址匯入 | 🔴 **會真的改資料。只能對用完即丟的資料庫跑** |

## 為什麼需要它

型別檢查與 build 都不會抓到這一類錯誤：

- 清單少回一個欄位 → 畫面上是一片空白欄，**沒有錯誤訊息**
- `<select>` 吐的字串沒轉成數字 → 更新回 200，但那個欄位**靜靜地沒有被寫進去**
- 關聯只查正向 → 「關聯療程」永遠是空的，看起來像「還沒有資料」
- 送審沿用舊版快照 → 核准後上線的是**改動前**的內容，畫面還顯示「已發布」

上面每一項都是 2026-09-12 後台接線時**靠這兩支腳本抓到的**，不是想像出來的情境。

## 用法

```bash
# 唯讀（對本機 func start 的預設 port）
node tools/api-smoke/read.mjs
node tools/api-smoke/read.mjs --api https://api.20skin.tw/api/v1 --no-contact

# 寫入：先開一顆用完即丟的資料庫
docker exec sqlserver /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P '<密碼>' -C \
  -Q "CREATE DATABASE Skin20_WriteTest COLLATE Chinese_Taiwan_Stroke_CI_AS;"
cd functions
dotnet ef database update --connection "Server=localhost,1433;Database=Skin20_WriteTest;User Id=sa;Password=<密碼>;Encrypt=True;TrustServerCertificate=True"
SQL_DATABASE=Skin20_WriteTest \
SQL_CONNECTION_STRING="Server=localhost,1433;Database=Skin20_WriteTest;User Id=sa;Password=<密碼>;Encrypt=True;TrustServerCertificate=True" \
  func start --port 7078
# 另一個終端機
node tools/api-smoke/write.mjs
```

帳密由 `SKIN20_SMOKE_USER`／`SKIN20_SMOKE_PASSWORD` 覆蓋。
⚠️ 登入識別是 `sa@system.local`，**不是 `sa`**，也不是 email 格式（docs/08 §A-1）。

## 注意

- ⚠️ **`dotnet ef` 會重建專案，而重建會把正在跑的 `func start` 弄掛**（它的檔案監看看到 `bin/` 被換掉）。先跑 migration，再啟動 host。
- ⚠️ `write.mjs` 可重複執行：開頭會清掉上一次留下的測試資料與轉址規則，登入也認得已經換過的密碼。第一次跑會多驗 4 項（首登強制改密碼流程），之後跳過。
- ⚠️ 登入失敗 5 次會鎖 15 分鐘（**只算帳號**，2026-09-14 起不看來源 IP）。密碼打錯時不要一直重試 —— 換一台機器跑也解不開，鎖的是那個帳號。
