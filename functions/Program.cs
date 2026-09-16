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
using Microsoft.Azure.Functions.Worker;
using Skin20.Api.Data;
using Skin20.Api.Handlers;
using Skin20.Api.Middleware;
using Skin20.Api.Routing;
using Skin20.Api.Services;
using Skin20.Api.Services.Dapper;

var builder = FunctionsApplication.CreateBuilder(args);

// ⚠️ 用 ConfigureFunctionsWebApplication（ASP.NET Core Integration），
//    **不是** ConfigureFunctionsWorkerDefaults ——後者的 Handler 收到的是
//    HttpRequestData 而不是 HttpRequest，整套程式碼的形狀都不一樣（docs/11 §1）。
builder.ConfigureFunctionsWebApplication();

// 例外處理包住整個 Function 執行（docs/11 §4）
builder.UseMiddleware<ExceptionMiddleware>();

// ── 連線字串 ──────────────────────────────────────────────
// Authentication=Active Directory Default 會走 DefaultAzureCredential：
//   · 在 Azure 上 → Function App 的 Managed Identity
//   · 本機開發   → 開發者的 az login 身分
// 兩邊都不需要帳號密碼。資料庫端需先建立對應的 Entra 使用者，
// 見 docs/07-deployment.md §6。
// ⚠️ 本機開發的逃生門：docker 的 SQL Server 沒有 Entra，連不上 Active Directory Default。
//    設了 SQL_CONNECTION_STRING 就整條用它，否則走下面的 Managed Identity 版本。
//    **正式環境不要設這個變數** —— 設了就等於把無密鑰的設計繞掉。
var sqlConnectionString =
    Environment.GetEnvironmentVariable("SQL_CONNECTION_STRING") is { Length: > 0 } local
        ? local
        : $"Server=tcp:{Environment.GetEnvironmentVariable("SQL_SERVER")},1433;" +
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

// ── JSON：★ 兩處都要設，少一處就會半邊 PascalCase ──────────
// Configure<JsonOptions> 管 IActionResult 的序列化、ConfigureHttpJsonOptions 管
// ReadFromJsonAsync 的反序列化。docs/10 §2：請求與回應一律 camelCase。
builder.Services.Configure<Microsoft.AspNetCore.Mvc.JsonOptions>(o =>
{
    o.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
    o.JsonSerializerOptions.PropertyNameCaseInsensitive = true;
});
builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
    o.SerializerOptions.PropertyNameCaseInsensitive = true;
});

// ── 服務（docs/11 §3.1 的生命週期慣例）────────────────────
// Singleton：只讀設定、無 per-request 狀態
builder.Services.AddSingleton<IJwtService, JwtService>();
builder.Services.AddSingleton<IEmailService, EmailService>();
builder.Services.AddSingleton<IBlobStorageService, BlobStorageService>();
builder.Services.AddSingleton<IBotCheckService, BotCheckService>();

// Scoped：碰 Skin20DbContext 或連線的一切
builder.Services.AddScoped<IRateLimitService, RateLimitService>();

// ── Handler（docs/10 §3）──────────────────────────────────
// ⚠️ 全部 Scoped。把碰 DB 的東西設成 Singleton 會捕獲已釋放的 DbContext，
//    而且錯誤只在高併發下浮現（docs/11 §3.1）。沒有例外。
builder.Services.AddScoped<HealthHandler>();
builder.Services.AddScoped<AuthHandler>();
builder.Services.AddScoped<FormHandler>();
builder.Services.AddScoped<SettingHandler>();
builder.Services.AddScoped<PublicContentHandler>();
builder.Services.AddScoped<SeoHandler>();
builder.Services.AddScoped<DashboardHandler>();
builder.Services.AddScoped<ContentHandler>();
builder.Services.AddScoped<ReviewHandler>();
builder.Services.AddScoped<UploadHandler>();
builder.Services.AddScoped<HomeSectionHandler>();
builder.Services.AddScoped<MenuHandler>();
builder.Services.AddScoped<RedirectHandler>();
builder.Services.AddScoped<ExportHandler>();
builder.Services.AddScoped<QuestionHandler>();
builder.Services.AddScoped<AccountHandler>();

// ── Dapper ReadService（純讀，docs/11 §2）────────────────
// ⚠️ 全部 Scoped：它們持有 ISqlConnectionFactory，而連線本身不是執行緒安全的。
builder.Services.AddScoped<IAuthReadService, AuthReadService>();
builder.Services.AddScoped<ISiteSettingReadService, SiteSettingReadService>();
builder.Services.AddScoped<IAccountReadService, AccountReadService>();
builder.Services.AddScoped<IQuestionReadService, QuestionReadService>();
builder.Services.AddScoped<IRedirectReadService, RedirectReadService>();
builder.Services.AddScoped<IExportReadService, ExportReadService>();
builder.Services.AddScoped<IPublicContentReadService, PublicContentReadService>();

builder.Services.AddScoped<AppRouter>();
builder.Services.AddHttpContextAccessor();

// ⚠️ 不要用 MemoryCache 存速率限制或聚合窗口的狀態 —— Flex Consumption 是多執行個體，
//    記憶體計數形同虛設（docs/11-backend-design.md §5.2、§10）。
builder.Services.AddMemoryCache();

// ⚠️ 這裡**沒有** Database.Migrate()，而且不可以加。
//    遷移一律走 CI 的 efbundle（docs/11 §13 第一條紅線）：執行期身分只有 DML 權限，
//    連 DDL 都做不到；而且在執行期遷移就無法事先檢閱要跑的 SQL。
builder.Build().Run();
