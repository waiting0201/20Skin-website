// 獨立 Function App（api.20skin.tw）的 composition root．NET 10 isolated worker
//
// 這個檔案的重點只有兩件事：
//   1. 用 Managed Identity 連 Azure SQL 與 Blob —— 整個 App 沒有任何連線密碼或金鑰
//   2. EF Core 與 Dapper 共用同一組連線設定，不要各自維護一份
// 見 docs/07-deployment.md §5、§6。

using Azure.Identity;
using Azure.Storage.Blobs;
using Microsoft.Azure.Functions.Worker.Builder;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Skin20.Api.Data;

var builder = FunctionsApplication.CreateBuilder(args);

builder.ConfigureFunctionsWebApplication();

// ── 連線字串 ──────────────────────────────────────────────
// Authentication=Active Directory Default 會走 DefaultAzureCredential：
//   · 在 Azure 上 → Function App 的 Managed Identity
//   · 本機開發   → 開發者的 az login 身分
// 兩邊都不需要帳號密碼。資料庫端需先建立對應的 Entra 使用者，
// 見 docs/07-deployment.md §6。
var sqlConnectionString =
    $"Server=tcp:{Environment.GetEnvironmentVariable("SQL_SERVER")},1433;" +
    $"Database={Environment.GetEnvironmentVariable("SQL_DATABASE")};" +
    "Authentication=Active Directory Default;Encrypt=True;TrustServerCertificate=False;";

// ── EF Core：寫入與領域邏輯 ────────────────────────────────
// 審核工作流、版本歷程這類「有規則、要留軌跡」的操作走這裡。
// （操作日誌不做 —— 2026-09-11 定案，見 docs/08-database.md §I）
builder.Services.AddDbContextPool<Skin20DbContext>(options =>
    options.UseSqlServer(sqlConnectionString, sql =>
    {
        // Consumption 類方案的執行個體會被回收，暫時性連線錯誤是常態
        sql.EnableRetryOnFailure(maxRetryCount: 5, TimeSpan.FromSeconds(10), null);
        sql.CommandTimeout(60);
    }));

// ── Dapper：讀取密集的查詢 ─────────────────────────────────
// 文章列表、後台清單、建置期的內容匯出這類「投影多、不需要追蹤」的查詢走這裡。
// 用 factory 是因為 Dapper 需要自己控制連線生命週期。
builder.Services.AddSingleton<ISqlConnectionFactory>(
    new SqlConnectionFactory(sqlConnectionString));

// ── Blob：媒體上傳用的 SAS ─────────────────────────────────
// 用 Managed Identity 取 user delegation key 來簽 SAS，不需要儲存體帳戶金鑰。
// 見 docs/07-deployment.md §3。
builder.Services.AddSingleton(new BlobServiceClient(
    new Uri($"https://{Environment.GetEnvironmentVariable("STORAGE_ACCOUNT")}.blob.core.windows.net"),
    new DefaultAzureCredential()));

builder.Services.AddHttpClient();

// ⚠️ 不要用 MemoryCache 存速率限制或聚合窗口的狀態 —— Flex Consumption 是多執行個體，
//    記憶體計數形同虛設（docs/11-backend-design.md §5.2、§10）。
builder.Services.AddMemoryCache();

// ⚠️ 這裡**沒有** Database.Migrate()，而且不可以加。
//    遷移一律走 CI 的 efbundle（docs/11 §13 第一條紅線）：執行期身分只有 DML 權限，
//    連 DDL 都做不到；而且在執行期遷移就無法事先檢閱要跑的 SQL。
builder.Build().Run();
