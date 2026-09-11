# 11 — 後端施工標準

> 本文件規範**怎麼寫**；[10-api.md](10-api.md) 規範**寫什麼**。開工後，`functions/` 的所有程式碼以本文件為唯一施工標準。
>
> 資料表以 [08-database.md](08-database.md) 為準（37 張表）；平台限制與 CI/CD 以 [07-deployment.md](07-deployment.md) 為準；功能語意以 [02-backend-cms.md](02-backend-cms.md) 為準。

---

## 1. 執行環境

**Azure Functions v4 — Isolated Worker ＋ ASP.NET Core Integration**，.NET 10（[07](07-deployment.md) §5 定案）。

`Program.cs` 用 `ConfigureFunctionsWebApplication()`，**不是** `ConfigureFunctionsWorkerDefaults()`。這個選擇決定整套程式碼的形狀：

| | ASP.NET Core Integration（本專案） | Worker Defaults（**不用**） |
|---|---|---|
| Handler 參數／回傳 | `HttpRequest` → `IActionResult` | `HttpRequestData` → `HttpResponseData` |
| 讀 body | `req.ReadFromJsonAsync<T>()` | 自己 `StreamReader` |
| 例外處理 | `context.GetHttpContext()` 寫回應 | `HttpResponseData` |

⚠️ **網路上多數 isolated worker 範例是後者，抄之前先確認。** 混用會出現 `HttpRequestData` 無法轉型的編譯錯誤。

⚠️ **`api/`（SWA Managed Function）是另一個專案、另一套規則**，見 §14。本文件其餘各節**不適用於它**。

`host.json` 的 `routePrefix` 設為 `api/v1`，使 [10](10-api.md) §3 的路徑即為對外位址。

### 套件

| 套件 | 用途 | 注意 |
|---|---|---|
| `Microsoft.Azure.Functions.Worker` ＋ `.Extensions.Http.AspNetCore` | 執行模型 | 需 AspNetCore 版才有上表的整合 |
| `Microsoft.EntityFrameworkCore.SqlServer` | 寫入 ＋ Migration | §6 |
| `Dapper` | 讀取 | §6 |
| `Azure.Identity` ＋ `Azure.Storage.Blobs` | Managed Identity、SAS 簽發 | §9 |
| `Microsoft.ApplicationInsights.WorkerService` | 遙測 | **2.x。3.x 在 isolated worker 會 `TypeLoadException`** |
| BCrypt | 密碼雜湊 | §5.1 |

根目錄放 `global.json` 鎖 SDK feature band，避免不同機器產出的 Migration 有差異。

---

## 2. 目錄結構與分層鐵律

```
functions/
├── Program.cs  host.json  local.settings.example.json（local.settings.json 不進版控）
├── Functions/               # 只做 trigger binding
│   ├── RouterFunction.cs    # 唯一 HTTP entry point（catch-all）
│   ├── ScheduledPublish.cs  # Timer：排程發布／定時下架
│   ├── VersionPrune.cs      # Timer：版本歷程修剪
│   └── ThrottleSweep.cs     # Timer：登入計數清理
├── Routing/
│   ├── AppRouter.cs         # 分派 ＋ JWT ＋ 授權
│   ├── AppRouter.Public.cs  # 公開白名單（§5.3）
│   └── AppRouter.Admin.cs   # 後台路由表 ＋ 權限對照（預設拒絕）
├── Middleware/ExceptionMiddleware.cs
├── Handlers/                # 一單元一個 <Unit>Handler.cs
├── Services/                # 跨 Handler 的協調服務
│   └── Dapper/              # <Unit>ReadService.cs（純讀）
├── Models/{Entities,Dtos}/
├── Data/                    # Skin20DbContext / Configurations / Migrations ← schema 權威
└── Common/                  # ApiResponse / AppException / ErrorCodes / Constants / Clock / Visibility
```

### 各層職責

| 層 | 職責 |
|---|---|
| Function | 只做 trigger binding，立刻轉交。不放任何邏輯 |
| Router | segments 拆解 → JWT 驗證 → 權限檢查 → list pattern 分派 |
| Handler | HTTP 解析／參數驗證／業務協調／`ApiResponse` 包裝 |
| Service | 跨 Handler 共用的協調（JWT／Blob／Email／Rebuild／BotCheck／RateLimit） |
| ReadService | **純讀取** SQL ＋ DTO 投影 |
| Data | 寫入、交易、schema |
| Common | 純函式 helper、常數、統一時間源、可見性判定式 |

### 鐵律

1. **Handler 內禁止直接寫 SQL** —— 讀走 Dapper ReadService，寫走 `Skin20DbContext`
2. **ReadService 禁止寫入** —— 任何 INSERT/UPDATE/DELETE 一律 EF Core
3. **Service 禁止回傳 HTTP** —— 只有 Handler 呼叫 `ApiResponse.Ok(...)`／`Fail(...)`
4. **Handler 內禁止重複檢查權限碼** —— 授權集中在 `AppRouter`（§5.3）。唯一例外是資料列擁有者判定（§5.4）
5. **禁止引入**：Repository Pattern、In-Process Model、AutoMapper、自訂 IoC 容器
6. 一個單元一個 Handler、一個 ReadService、一個 Dtos 檔。**單元代號逐字對應** [10](10-api.md) §3.3 與權限碼，不做單複數轉換

> **為什麼是單一 `RouterFunction` catch-all 而不是每個資源一支 Function**：路由表與權限表集中在一處，才能與 [10](10-api.md) §4 的權限矩陣逐條對照。代價是自動 OpenAPI 產生器內省不出端點 —— 所以 `openapi.yaml` 手寫並進版控。

---

## 3. `Program.cs`

唯一的 composition root，所有註冊手寫，**不用組件掃描**（註冊清單本身就是模組清冊）。骨架見 [templates/Program.cs](templates/Program.cs)，另外必須做到：

```csharp
// 遙測：isolated worker 少了這兩行，所有 ILogger 輸出都不會進 App Insights
services.AddApplicationInsightsTelemetryWorkerService();
services.ConfigureFunctionsApplicationInsights();

// JSON camelCase：★ 兩處都要設，少一處就會半邊 PascalCase
services.Configure<JsonOptions>(o => { ... });        // IActionResult 序列化
services.ConfigureHttpJsonOptions(o => { ... });      // ReadFromJsonAsync 反序列化
```

### DI 生命週期

| 生命週期 | 適用 |
|---|---|
| `Singleton` | 只讀設定、無 per-request 狀態：`JwtService`、`BlobStorageService`、`EmailService`、`RiskTermCache`、`ISqlConnectionFactory` |
| `Scoped` | 依賴 `Skin20DbContext` 或連線的一切：**所有 Handler、所有 ReadService、`AppRouter`** |
| `Transient` | 不使用 |

⚠️ **把 Handler 誤設 Singleton 會捕獲已釋放的 `DbContext`**，而且錯誤只在高併發下浮現。碰 DB 的一律 `Scoped`，沒有例外。

⚠️ **絕不在 `Program.cs` 呼叫 `Database.Migrate()`**（§13）。這與多數 Functions 範例的寫法相反。

---

## 4. 回應與例外

### `ApiResponse<T>`

```csharp
public sealed class ApiResponse<T>
{
    public bool     Success   { get; init; }
    public string?  Code      { get; init; }   // 成功時 null；失敗時為 10 §2 的錯誤碼
    public T?       Data      { get; init; }
    public string   Message   { get; init; } = string.Empty;
    public string[] Errors    { get; init; } = [];
    public string   Timestamp { get; init; } = DateTimeOffset.UtcNow.ToString("o");
}
```

**所有端點一律回傳此信封，禁止回裸 data。**

### `AppException`

```csharp
public sealed class AppException(string code, string message, int statusCode = 400) : Exception(message)
{
    public static AppException NotFound(string resource)          => new(ErrorCodes.NotFound, $"{resource} 不存在。", 404);
    public static AppException Forbidden(string? detail = null)    => new(ErrorCodes.Forbidden, detail ?? "權限不足。", 403);
    public static AppException Conflict(string code, string detail) => new(code, detail, 409);
    // ...
}
```

**禁止 `throw new Exception(...)`** —— 沒有 code、沒有 status，只會變成 500。

### `ExceptionMiddleware`

`IFunctionsWorkerMiddleware`（worker 層，**不是** ASP.NET Core middleware），透過 `context.GetHttpContext()` 寫回應：

- `AppException` → `LogWarning` ＋ 對應 status 與 `Code`
- **SQL 547（FK 違反）→ 409 `CONFLICT_STATE`**，不要讓它變成 500。刪除仍被引用的分類是可預期的操作，訊息要看得懂（「仍有 N 筆內容引用」）
- **SQL 2601／2627（唯一鍵違反）→ 409 `CONFLICT_DUPLICATE`**。`UrlPath` 的 filtered unique index 是全站網址唯一性的最後防線（[08](08-database.md) §B-1），撞到時要回得出「這個網址已被某某頁使用」
- 其他 → `LogError` ＋ 500 `INTERNAL`，**對外只回通用訊息**
- 寫回應前檢查 `Response.HasStarted`

---

## 5. 認證與授權

### 5.1 身分與密碼

- **只有一套身分：後台管理員。** 前台全站匿名，沒有會員系統
- 登入識別是 `Users.UserName`，**不是 email**（[08](08-database.md) §A-1）。`NotifyEmail` 是選填的通知欄位，token 的 email claim 可能不存在 —— **身分一律看 `sub`**
- 密碼走 BCrypt；登入失敗訊息不區分「帳號不存在」與「密碼錯誤」
- **第一位超級管理員由種子建立**（`sa@system.local`，[08](08-database.md) §A-5），帶強制改密碼旗標

### 5.2 JWT

- 自寫 `JwtService`（HS256），**不接 `AddAuthentication().AddJwtBearer()`** —— isolated worker 的 pipeline 與 ASP.NET Core 不同，自己驗證比接管線可控
- `MapInboundClaims = false` 保持 claim 原名；驗證參數全開，`ClockSkew = 30s`；驗證失敗回 `null`，由呼叫端轉 401
- claims：`sub`、`roles`、`permissions`、`is_superadmin`
- **沒有雙因素**（2026-09-11 院方決定）：`POST /auth/login` 帳密驗證通過就直接發 token，沒有第二段。⚠️ 連帶後果是**次數限制成為唯一防線**，下一條因此不可打折
- **登入次數限制以帳號與來源 IP 雙維度計數**，狀態存 `LoginThrottles` 表。⚠️ **不要用 `MemoryCache`** —— Flex Consumption 是多執行個體，記憶體計數形同虛設。成功登入即清除計數，**不留歷史**（[08](08-database.md) §I）

### 5.3 授權集中在 Router：預設拒絕

```csharp
private static string? GetRequiredPermission(string method, string[] segments) =>
    (method, segments) switch
    {
        ("GET",            ["admin", "article", ..])          => PermissionCodes.ArticleView,
        ("POST",           ["admin", "article"])              => PermissionCodes.ArticleEdit,
        ("PUT",            ["admin", "article", _, "seo"])    => PermissionCodes.ArticleSeo,
        ("POST",           ["admin", "article", _, "submit"]) => PermissionCodes.ArticleSubmit,
        ("PATCH",          ["admin", "article", _, "publish" or "schedule"]) => PermissionCodes.ArticlePublish,
        ("DELETE",         ["admin", "article", _])           => PermissionCodes.ArticleDelete,
        // ... 各單元逐條
        _ => DenySentinel,      // ★ 未列出的 /admin/* 一律拒絕
    };
```

**預設拒絕，不是預設放行。** 新增後台端點若忘了補權限表，會直接 403 而不是靜默放行。同理，非 `/admin/*` 且不在 `IsPublicRoute` 白名單的路由一律回 404 —— 那張白名單就是公開端點的完整範圍（[10](10-api.md) §3.1，只有四支）。

⚠️ **順序不能反。** `PUT /admin/{unit}/{id}/seo` 必須排在 `PUT /admin/{unit}/{id}` 之前，否則行銷角色改 SEO 會被要求 `{unit}.edit` 而被擋。這類「子路徑先於父路徑」的模式在 list pattern 裡不會有編譯警告。

`is_superadmin = true` 自動通過。

### 5.4 唯一的例外：醫師只能改自己的內容

醫師角色「僅可編輯自己的個人頁與自己署名的文章」（[02](02-backend-cms.md) §4）是**資料列層級**的判定，權限碼表達不了。作法：

- Router 照常檢查 `doctor.edit`／`article.edit`
- Handler 在讀出實體後比對 `ContentItems.OwnerUserId == sub`，不符則 `AppException.Forbidden`
- **這個檢查寫成一個共用方法**（`RequireOwnership`），九個 Handler 不要各寫一份

⚠️ 這是鐵律 4 的唯一豁免。除此之外 Handler 裡不得再出現任何權限碼字串。

---

## 6. 資料存取：EF Core 寫 ＋ Dapper 讀

分工不是重複（[07](07-deployment.md) §5）：

| | 用途 |
|---|---|
| **EF Core** | 寫入與領域邏輯：三段式工作流、版本歷程、權限。有規則、有狀態轉換、要留軌跡。**也是 schema 的真實來源** |
| **Dapper** | 讀取密集：後台清單、建置期的 950 頁內容匯出、301 對照表。投影多、不需追蹤 |

### 6.1 寫入

- Entity 為單純 POCO，設定全寫在 `Data/Configurations/<Entity>Configuration.cs`
- **多表寫入必須包在交易裡。** 一筆內容的儲存至少動到 `ContentItems` ＋ TPT 子表 ＋ `SeoMeta` ＋ `ContentRelations` ＋ `ContentVersions` —— 五張表，缺一就是半筆資料
- 因為啟用了 `EnableRetryOnFailure`（範本已含），**交易必須包 execution strategy**，直接 `BeginTransactionAsync` 會被擋下：

```csharp
var strategy = db.Database.CreateExecutionStrategy();
await strategy.ExecuteAsync(async () =>
{
    await using var tx = await db.Database.BeginTransactionAsync();
    // ContentItems + TPT 子表 + SeoMeta + Relations + Version
    await db.SaveChangesAsync();
    await tx.CommitAsync();
});
```

### 6.2 TPT 的三個注意事項

九個內容模型是 **TPT（table-per-type）**，子表 `Id` 同時是 PK 與 FK（[08](08-database.md) §J-1）：

1. **EF Core 的 TPT 查詢會自動 join 所有子表。** 後台清單只要主幹欄位時**不要用 EF 查** —— 走 Dapper 指定 join 哪一張
2. **新增一筆內容是「先有 `ContentItems` 才有子表」**，同一個交易裡由 EF 自己處理，但**匯入腳本走 Dapper 直寫時要自己保證順序**
3. **`SeoMeta` 是 1:1 獨立表，不要用 owned type** —— owned type 會被塞進主表，SEO 的權限分表切分就沒了

### 6.3 讀取

```csharp
public sealed class ArticleReadService(ISqlConnectionFactory factory) : IArticleReadService
{
    private const string BaseSelect = """
        SELECT ci.Id, ci.Title, ci.UrlPath, ci.Status, ci.PublishAt, a.DisplayDate, ...
        FROM ContentItems ci
        INNER JOIN Articles a ON a.Id = ci.Id
        """;
}
```

規則：

- SQL 一律 `const string` raw string literal，**完全參數化**，禁止字串串接使用者輸入
- 分頁一律 `OFFSET/FETCH NEXT` ＋ 另跑 `COUNT(*)`
- 禁止 N+1：清單頁的關聯資料在同一支 SQL 用 JOIN 取回
- 連線物件放模組層級，**不要每次呼叫 new 一個**（Function App 每個執行個體各持一份連線池）

### 6.4 可見性判定式只有一份

```csharp
// Common/Visibility.cs
public const string PublicFilter = """
    ci.Status = 3
    AND (ci.PublishAt   IS NULL OR ci.PublishAt   <= @Now)
    AND (ci.UnpublishAt IS NULL OR ci.UnpublishAt >  @Now)
    """;
```

⚠️ **建置期的內容匯出腳本必須用同一段條件**（[09](09-frontend.md) §3）。寫兩份遲早分岔，症狀是「列表看得到、點進去 404」，而且只在上線後才發現。

### 6.5 collation

`Slug`／`UrlPath`／`Redirects.FromPath`／`ToPath` 為 `Latin1_General_100_BIN2`，其餘為資料庫預設的 `Chinese_Taiwan_Stroke_CI_AS`（[08](08-database.md) §0 決策三）。**要逐欄 `.UseCollation()`，不能只設資料庫預設。**

---

## 7. 工作流狀態機

這是本專案最核心的領域邏輯，也是最容易各寫各的地方。**狀態只有四個**（[08](08-database.md) §B-1），排程**不是第五個狀態**：

| Status | 意義 |
|---|---|
| 1 草稿 | 可自由編輯 |
| 2 送審中 | **本文鎖定**，只有審核者能動。仍可改 SEO 欄位 |
| 3 已發布 | 前台可見與否另由 `PublishAt`／`UnpublishAt` 決定（§6.4） |
| 4 已下架 | 主動下架，不等於刪除 |

```
草稿 ──submit──▶ 送審中 ──approve──▶ 已發布 ──unpublish──▶ 已下架
  ▲                  │                   │                    │
  └──── reject ──────┘                   └──── edit ──────────┘（回草稿，已發布版本不受影響）
```

### 三條規則

1. **核准即 Status = 3，不管 `PublishAt` 有沒有到。** 「已排程」是 `Status = 3 AND PublishAt > now` **推導**出來的顯示狀態，不是資料庫裡的第五個值。
   > **為什麼不讓 Timer 去翻狀態**：翻狀態與觸發重建是兩個非原子步驟。若重建先跑，那筆內容明明到點了卻不在產物裡，要等下一輪。判定式放在查詢裡就沒有這個時序問題 —— Timer 只負責「到點了，去觸發一次重建」。
   >
   > ⚠️ [templates/ScheduledPublish.cs](templates/ScheduledPublish.cs) 目前寫的是 Timer 翻狀態、且出現了 schema 沒有的 `Scheduled`／`Archived` 值。**該範本需依本節同步**，見 §16。
2. **已發布的內容被編輯時，前台看到的仍是 `PublishedVersionId` 指的那一版。** 編輯產生新的草稿版本，核准後才改寫 `PublishedVersionId`。沒有這條，編輯到一半的療程頁會在下一次重建時上線。
3. **退回必須填原因**（`ContentReviews.DecisionNote`，`Status = 3` 時必填），**且不寄信** —— 帳號沒有必填 email，退回通知改由儀表板待辦清單呈現（[08](08-database.md) §B-3）。

### 送審時掃高風險字詞

送審（`POST /admin/{unit}/{id}/submit`）時，以 `RiskTerms` 掃本文與各結構化欄位，命中結果寫入 `ContentReviews.RiskFlags`（JSON）供審核者重點檢視。

- `RiskTerms` 表小、讀取頻繁 → **啟動時整份載入記憶體**，寫入時失效重載
- **警示不阻擋送審**（[02](02-backend-cms.md) §5），它是提示不是閘門
- 前端也會即時警示（[09](09-frontend.md) §8），但**伺服器端這一次掃描不可省** —— 前端的那份只是體驗

---

## 8. 版本快照

`ContentVersions.Snapshot` 存 **JSON 完整快照**：主幹欄位 ＋ 該型別專屬欄位 ＋ `SeoMeta` ＋ 所有關聯 ＋ 首頁版位設定（[08](08-database.md) §B-2）。

- **序列化格式要有一份獨立於 EF 的規格。** 遷移期的匯入腳本走 Dapper 直寫，它產生的快照必須與 API 產生的讀得通（[08](08-database.md) §J-1）
- 還原是**整筆還原成草稿**，不直接上線（[10](10-api.md) §3.3）
- 差異比對在應用層 diff 兩份 JSON，不做欄位級歷史表
- **每筆保留最近 30 版**，超出由 Timer 清掉（§11）

⚠️ **`ContentVersions` 不是操作日誌。** 它只涵蓋九個內容模型，涵蓋不到 `SiteSettings`、`MenuItems`、`RolePermissions` 與帳號異動 —— 那些變更沒有留痕，這是已知並被接受的取捨（[08](08-database.md) §I）。**不要順手加一張 `AuditLogs`**。

---

## 9. 媒體：直傳的驗證缺口要補在回報這一步

上傳由瀏覽器直傳 Blob，**檔案不經過 Function**（[07](07-deployment.md) §3、[09](09-frontend.md) §9）。這帶來一個必須正視的後果：

⚠️ **伺服器端看不到檔案內容，因此驗不了 magic bytes。** 傳統「副檔名白名單 ＋ 檔頭驗證」在直傳模式下只剩前半段，而副檔名是使用者說了算。

三道補救，缺一不可：

1. **SAS 由伺服器決定 blob 名稱與副檔名**，不採用前端送來的檔名。write-only、限定單一 blob、數分鐘到期
2. **回報端點（`POST /admin/media`）讀回檔頭驗證**再寫 `MediaAssets`。不通過就把該 blob 刪掉 —— 這時檔案已經在 Blob 上了，光是拒絕寫記錄會留下無主檔案
3. **容器隔離**：公開圖片容器只放圖片，其他型別另開容器。公開容器的內容等同對外發佈

SAS 以 **Managed Identity 取 user delegation key** 簽發，系統內不存放儲存體金鑰。

**孤兒檔**：`MediaUsages` 記錄引用（[08](08-database.md) §E-2）。刪除媒體前檢查引用；內容刪除或換圖時，被拿掉引用的檔案要當場從 Blob 刪掉 —— 不刪的話那個檔案仍取得到，對按了「移除」的人來說就是沒移除。

⚠️ **引用掃描要涵蓋 `BodyBlocks` 內文裡的圖片**，不只是 `*MediaId` 欄位。漏了就會把正在用的內文插圖判成孤兒。

---

## 10. 觸發重建

**SWA 沒有 ISR，內容變更一定要重跑 build**（[07](07-deployment.md) §5）。作法是呼叫 GitHub API 的 `repository_dispatch`。

```
後台發布／核准／排程到點
  → RebuildService.RequestAsync()
  → 聚合窗口內（3–5 分鐘）只保留一次待觸發
  → POST /repos/{repo}/dispatches  { event_type: "content-published" }
```

四條規則：

1. **要聚合。** 連續發布 10 篇不該觸發 10 次 build（[07](07-deployment.md) §5）。窗口狀態存 DB 或 Blob，**不要用 `MemoryCache`**（多執行個體）
2. **不要因為重建失敗而 throw。** 內容狀態已經改好了，重建失敗應獨立告警，不要讓整個流程重跑一次狀態轉換
3. **沒有異動就不要觸發。** Timer 每 15 分鐘跑一次，沒有到期內容時直接 return，否則等於每 15 分鐘跑一次全站 build
4. **後台要看得到「發布中／已上線」**（[09](09-frontend.md) §10）

`GITHUB_DISPATCH_TOKEN` 是這個 App 唯一需要保管的外部憑證（SQL 與 Blob 都走 Managed Identity）。權限收斂到單一 repo 的 dispatch。

---

## 11. 排程（Timer trigger）

Azure SQL 沒有 Agent Job，排程一律走 Functions Timer（獨立 Function App 支援，Managed Functions 不支援）。cron 由 app setting 注入。

| Function | 工作 |
|---|---|
| `ScheduledPublish` | 掃到期的 `PublishAt`／`UnpublishAt`，**有異動就觸發重建**（不改狀態，見 §7） |
| `VersionPrune` | 每筆內容保留最近 30 版，其餘刪除（§8） |
| `ThrottleSweep` | 清掉 `LoginThrottles` 的過期計數列 |

三條共通規則：

- **`IsPastDue` 時不要 return** —— Flex Consumption 冷啟動會延遲觸發，遲到的那次照樣要做事
- **`RunOnStartup` 一律不要開** —— 每次部署都會多跑一次
- **要有冪等閘** —— 多執行個體可能同時跑

---

## 12. 橫切

### 時間

`Common/Clock.cs` 是唯一時間源，**業務邏輯禁用 `DateTime.Now`／`UtcNow`**（例外只有 JWT 有效期與 cron 判定）。

| | 用途 |
|---|---|
| `Clock.UtcNow` | **所有寫進 DB 與拿來比較 DB 時間欄的值**：`PublishAt`／`UnpublishAt` 判定、稽核欄位 |
| `Clock.Now`／`Today` | 台北時區，**只給顯示**，不得寫入 DB |

⚠️ 混用的話上下架時間窗會整整差 8 小時。持久化一律 UTC。

### 常數

`Common/Constants.cs` 分組：`PermissionCodes`（[10](10-api.md) §4）、`RoleNames`（五種）、`ContentTypes`（九種）、`ContentStatuses`（四種）、`PageKeys`（系統頁）、`ErrorCodes`（[10](10-api.md) §2）。**這些字串在程式中不得再出現字面值。**

### 設定與密鑰

- 本機：`local.settings.json`（**不進版控**）＋ `local.settings.example.json`（進版控，只有 key 與假值）
- 正式：Function App 的 Application Settings，**key 名稱完全相同**。雙底線慣例（`Jwt__Secret` ↔ `IConfiguration["Jwt:Secret"]`）
- **執行期沒有任何連線密碼或金鑰** —— SQL 與 Blob 都走 Managed Identity（`Authentication=Active Directory Default`，本機自動落到開發者的 `az login` 身分）
- 全架構剩下的明文密鑰只有兩個：`Jwt__Secret`／SMTP 憑證與 `GITHUB_DISPATCH_TOKEN`（在 Function App 設定裡），以及 **SWA 上給 `/api/fallback` 的 SQL 唯讀連線字串**（[07](07-deployment.md) §6）
- **不使用 Key Vault**（本期規模不需要）

### Logging

`ILogger<T>` ＋ Application Insights（**兩處 Functions 都要開**，否則出問題時沒有任何可查的東西）。**日誌不得寫入密碼、token、完整 email、表單內容** —— `/contact` 的送出內容尤其：那批資料刻意不落庫（[02](02-backend-cms.md) §2），寫進日誌等於繞過該決策。

---

## 13. 遷移的三條紅線

承 [07](07-deployment.md) §5 與 [08](08-database.md) §J-2，逐條都是不可退讓的：

1. **絕不在執行期呼叫 `Database.Migrate()`** —— 走 CI 的 `efbundle`。應用程式因此不需要 DDL 權限
2. **遷移必須向後相容** —— 沒有 staging，順序是「先遷移、後部署」，中間有一段**新 schema 配舊程式**。改欄位用擴張／收縮兩階段
3. **遷移身分與執行期身分是兩個不同的 SQL 使用者**（[08](08-database.md) §J-3 的三組身分）

配套：

- **CI 檢查 `dotnet ef migrations has-pending-model-changes`** —— 模型改了卻忘了 `migrations add` 是這個組合最常見的錯誤
- **送出前先看產物**：`dotnet ef migrations script --idempotent`，留存 90 天
- **已套用的 migration 不得重生**（會換掉 migration ID，正式庫當成 pending 再跑一次 `CREATE TABLE`）
- **不要依賴約束的名稱**做 drop（正式庫的實際名稱可能與 model 對不上）。EF 的 `DropColumn` 不要帶 `DefaultConstraintName`
- **不要在 migration 裡手寫動態 SQL**。唯一例外是一行靜態的資料回填；加欄位走「先 NULL → 回填 → 收成 NOT NULL」

---

## 14. `api/fallback` 的施工限制（另一套規則）

這支 function **不適用本文件其餘各節**。它的完整規格在 [templates/Fallback.cs](templates/Fallback.cs)，要點：

- **目標框架最高 net9.0**，且要與 `staticwebapp.config.json` 的 `apiRuntime` 一致。這是平台限制、已查證，**不要改成 net10.0**（會部署失敗）
- **只用 Dapper，不要載入 EF Core** —— 每個未命中的請求都吃一次冷啟動，載入 EF Core 直接拖慢遷移期的 301 回應
- **沒有 Managed Identity** —— 連線字串明文放 SWA 設定，權限應收斂到只能 `SELECT Redirects`（[08](08-database.md) §J-3）
- **未命中必須回 404，不要回 200**（軟性 404 會被 Google 當成重複內容）
- **命中與未命中都要快取**，否則爬蟲密集打不存在的舊網址時每次都查 DB

---

## 15. Coding Checklist

合併前逐條確認：

- [ ] `dotnet build` **0 errors / 0 warnings**
- [ ] 所有端點回傳 `ApiResponse<T>`，無裸 data
- [ ] 失敗回應帶 [10](10-api.md) §2 的 `code`；新錯誤碼已補進該表與 `ErrorCodes.cs`
- [ ] 清單端點有分頁且 `pageSize` 有上限（≤ 100）
- [ ] Handler 內無 SQL；ReadService 內無寫入；Service 內無 `IActionResult`
- [ ] Handler 內無權限碼（擁有者判定除外）；新 `/admin/*` 端點已補進 `GetRequiredPermission`，且子路徑排在父路徑之前
- [ ] 所有 SQL 完全參數化
- [ ] 無 `DateTime.Now`／`UtcNow`；寫入與比較 DB 時間欄一律 `Clock.UtcNow`
- [ ] 無字面值狀態碼／權限碼／`ContentType`／`PageKey`
- [ ] 前台可見性一律用 `Visibility.PublicFilter`，未另寫一份條件
- [ ] 多表寫入包在 `CreateExecutionStrategy()` ＋ transaction 內
- [ ] 工作流狀態轉換符合 §7；未引入 schema 沒有的狀態值
- [ ] 媒體回報端點有讀回檔頭驗證，失敗時刪除 blob
- [ ] 速率限制／聚合窗口的狀態存 DB 或 Blob，**未使用 `MemoryCache`**
- [ ] 公開寫入端點有機器人驗證 ＋ rate limit
- [ ] 日誌無密碼／token／個資／表單內容
- [ ] `dotnet ef migrations script` 已檢閱；`has-pending-model-changes` 通過
- [ ] `openapi.yaml` 與 [10-api.md](10-api.md) §3 同步

---

## 16. 待決與需同步

| 項目 | 說明 |
|---|---|
| **[templates/ScheduledPublish.cs](templates/ScheduledPublish.cs) 與 §7 不一致** | 範本寫 Timer 翻狀態，且用了 schema 沒有的 `Scheduled`／`Archived`。依 §7 應改為「只掃到期、只觸發重建」，狀態值改用 [08](08-database.md) §B-1 的四態 |
| **機器人驗證供應商** | [10](10-api.md) §5，開工前定案 |
| **`RefreshTokens` vs 短效 JWT ＋ `SecurityStamp`** | [08](08-database.md) §L 二選一，不要兩套都做 |
| **圖片衍生尺寸由誰產** | [07](07-deployment.md) §3 待決。若由 Function 端 sharp 轉檔，§9 的直傳流程要多一步「轉檔完成才寫 `Variants`」 |
| **`GET /site-settings/public` 是否必要** | [09](09-frontend.md) §13 |
| **測試範圍** | 至少涵蓋權限判定表、工作流狀態轉換與 `PublicFilter`。**沒有 staging，CI 的測試是僅有的攔截點之一**（[07](07-deployment.md) §5） |
