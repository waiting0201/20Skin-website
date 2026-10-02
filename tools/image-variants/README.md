# 圖片衍生尺寸回填（image-variants）

替公開 `media` 容器裡**既有**的圖片補上衍生尺寸。之後上傳的圖由 API 的
`POST /admin/upload/commit` 當場產生（`functions/Common/ImageVariants*.cs`），這支只處理「存量」。

## 約定（一切的前提）

原檔 `2026/09/{32hex}.jpg` 旁邊固定有四個 WebP：

```
2026/09/{32hex}.w480.webp   .w800.webp   .w1200.webp   .w1600.webp
```

- **不寫資料庫。** 前台只靠這個命名慣例組 `srcset`，對 blob 網域上副檔名是 jpg／jpeg／png／webp 的
  **每一張**圖都會去要四個尺寸 —— 所以**每一張都必須四個齊全**，缺一個就是那個寬度的破圖，
  而且沒有任何錯誤訊息。
- **不放大。** 原圖比目標窄時，那個檔名照樣寫，內容用原圖寬度編碼（一組永遠是齊的）。
- 保持比例、WebP 品質 78、EXIF 方向先轉正、`Cache-Control: public, max-age=31536000, immutable`。
- gif 不處理（前台也不會去要）。`incoming/`（上傳暫存區）一律略過。

## 🔴 必須在前台 srcset 上線之前跑完

順序：**① 部署 API（新上傳開始自動產生）→ ② 跑這支 `--apply` 補存量 → ③ 再跑一次 dry-run
確認「需要補」是 0 → ④ 才部署前台的 srcset。**
①、② 之間新上傳的圖不會漏（API 已會產），② 與 ④ 之間若有人上傳也沒問題（同樣由 API 產）。
顛倒順序＝前台上線的那一刻，所有舊圖的小尺寸都是 404。

## 用法

```bash
az login   # DefaultAzureCredential，沿用 az 的身分

# 1. dry-run（預設，只讀）：報告缺幾張、要下載多少、取樣估算新增儲存量
dotnet run --project tools/image-variants

# 2. 真的寫
dotnet run --project tools/image-variants -- --apply
dotnet run --project tools/image-variants -- --apply --concurrency 6
dotnet run --project tools/image-variants -- --apply --limit 20      # 試跑前 20 張
```

| 參數 | 預設 | 說明 |
|---|---|---|
| `--apply` | 關 | 寫入。沒有它就是 dry-run |
| `--account`／`STORAGE_ACCOUNT` | `st20skinweb` | 儲存體帳戶 |
| `--container` | `media` | 容器 |
| `--concurrency` | `4` | 並行張數。每個並行工作最壞要吃「64 百萬像素 × 4 byte × 2」的記憶體，別開太大 |
| `--limit` | 無 | 只處理前 N 張（試跑） |
| `--samples` | `5` | dry-run 取樣幾張來估算輸出大小（會下載這幾張，唯讀） |

**冪等、可續跑**：已存在的衍生檔不動（`If-None-Match: *`），只補缺的，中斷後重跑即可；
同時開兩個行程也不會互相覆寫。**單張失敗不中斷整批**，結束時列出失敗清單並以非零結束 ——
那些圖在前台會破圖（常見原因：檔案損毀或解不開），要換圖或確認沒有內容在用它。

## 🔴 不可對 `st20skinprod` 跑

`st20skinprod` 是**線上預約系統**（`rg-20skin-prod`）的儲存體，本專案是 **`st20skinweb`**，
名字只差一個字。這支工具會寫入大量檔案；寫進預約系統的儲存體**不會有任何錯誤訊息**。
工具遇到 `--account st20skinprod`（或同名環境變數）**直接拒絕，沒有 `--force`**。

## 需要的權限

| 動作 | 角色（容器 `media` 範圍即可） |
|---|---|
| dry-run | **Storage Blob Data Reader** |
| `--apply` | **Storage Blob Data Contributor** |

## 與其他工具的關係

- `functions/Common/ImageVariants.cs`（命名）與 `ImageVariants.Encode.cs`（縮圖）以
  `<Compile Include>` **共用**，不是抄一份 —— 回填的檔案與上傳時產的完全同規格。
- `tools/blob-reconcile`：衍生檔不是孤兒（原檔被引用時）；孤兒原檔刪除時連帶刪四個衍生檔。
  見該目錄 README。
