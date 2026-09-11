// → api/Fallback.cs（SWA Managed Function．NET isolated worker）
//
// 承接 navigationFallback：任何找不到實體檔案的請求都會被轉到這裡。
// 查 301 對照表 —— 命中回 301，未命中回 404。
//
// 這是約 770 條 301 的落地位置。staticwebapp.config.json 有 20 KB 上限，
// 只放得下約 200 條，且不比對 query string。見 docs/07-deployment.md §2。
//
// ⚠️ 這是 SWA 的 Managed Function，跟 functions/ 的應用程式 API 是兩個不同的東西：
//    · 目標框架受 SWA 限制，最高 net9.0（apiRuntime: dotnet-isolated:9.0），不是 .NET 10
//    · 沒有 Managed Identity —— 連線字串只能明文放 SWA application settings
//    · SWA /api 路由有 45 秒上限
//    這支 function 刻意只用 Dapper、不用 EF Core：它只有一個查詢，
//    載入 EF Core 會讓冷啟動變慢，而冷啟動直接影響遷移期的 301 回應速度。

using System.Data;
using Dapper;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;

namespace Skin20.Api;

public sealed class Fallback(ILogger<Fallback> logger, IMemoryCache cache)
{
    // 熱門規則快取，減少 SQL 往返。執行個體存活期間有效。
    private static readonly MemoryCacheEntryOptions CacheOptions = new()
    {
        AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(12),
        Size = 1,
    };

    [Function("fallback")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", "head", Route = "fallback")]
        HttpRequestData req)
    {
        // SWA 用這個標頭帶原始網址，且「含 query string」——
        // 這正是 staticwebapp.config.json 的 route 做不到的部分。
        var originalUrl = req.Headers.TryGetValues("x-ms-original-url", out var values)
            ? values.FirstOrDefault()
            : null;

        if (string.IsNullOrEmpty(originalUrl) || !Uri.TryCreate(originalUrl, UriKind.Absolute, out var uri))
        {
            logger.LogWarning("缺少或無法解析 x-ms-original-url：{Value}", originalUrl);
            return await NotFound(req);
        }

        // 對照表以「路徑＋query string」為索引鍵，大小寫不敏感。
        // 例：/share.php?class=醫美新知
        var key = (uri.AbsolutePath + uri.Query).ToLowerInvariant();

        var target = await LookupAsync(key);
        if (target is null)
        {
            // ⚠️ 未命中一定要回 404，不要回 200 —— 回 200 會變成軟性 404，
            //    Google 會把那些頁面當成重複內容。
            logger.LogInformation("301 未命中：{Key}", key);
            return await NotFound(req);
        }

        var res = req.CreateResponse(System.Net.HttpStatusCode.MovedPermanently);
        res.Headers.Add("Location", target);
        // 讓瀏覽器與 SWA 節點快取，減少重複打到這支 function（每次未預熱都要吃冷啟動）
        res.Headers.Add("Cache-Control", "public, max-age=86400");
        return res;
    }

    private async Task<string?> LookupAsync(string key)
    {
        if (cache.TryGetValue<string?>(key, out var cached)) return cached;

        // 連線字串是明文的 —— SWA Free 沒有 Managed Identity。
        // 帳號請給唯讀最小權限，見 docs/07-deployment.md §6。
        await using IDbConnection conn = new SqlConnection(
            Environment.GetEnvironmentVariable("SKIN20_SQL_CONNECTION"));

        var target = await conn.QuerySingleOrDefaultAsync<string?>(
            "SELECT TargetUrl FROM dbo.Redirects WHERE SourceKey = @key",
            new { key });

        // 未命中也要快取，否則爬蟲密集打不存在的舊網址時每次都會查 DB
        cache.Set(key, target, CacheOptions);
        return target;
    }

    private static async Task<HttpResponseData> NotFound(HttpRequestData req)
    {
        var res = req.CreateResponse(System.Net.HttpStatusCode.NotFound);
        res.Headers.Add("Content-Type", "text/html; charset=utf-8");
        // 404 頁由前端建置產出，這裡直接把內容讀回來送出
        var path = Path.Combine(AppContext.BaseDirectory, "404.html");
        await res.WriteStringAsync(File.Exists(path)
            ? await File.ReadAllTextAsync(path)
            : "<!doctype html><meta charset=\"utf-8\"><title>找不到頁面</title>");
        return res;
    }
}
