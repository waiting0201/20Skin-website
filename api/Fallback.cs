using System.Net;
using Dapper;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;

namespace Skin20.Fallback;

/// <summary>
/// 約 770 條 301 的落地位置（docs/07-deployment.md §2、docs/08-database.md §H）。
///
/// <para>
/// 任何找不到實體檔案的請求都會被 <c>navigationFallback</c> 轉到這裡。查 301 對照表——
/// 命中回該筆設定的轉址狀態碼，未命中回 404。
/// </para>
/// <para>
/// 🔴 <b>未命中一定要回 404，不可以回 200。</b> 回 200 就是軟性 404，
/// Google 會把那些頁面當成重複內容，等於整批 301 白做。
/// </para>
/// <para>
/// ⚠️ <b>這支是全 schema 唯一被公開流量高頻打到的查詢</b>（docs/08 §H）：
/// 只用 <c>UQ_Redirects_FromPath</c> 做單筆 seek，不做任何 join，
/// <c>ToPath</c> 直接讀實體欄位而不是算出來的。
/// </para>
/// </summary>
public sealed class Fallback(ILogger<Fallback> logger, IMemoryCache cache)
{
    /// <summary>命中與未命中都要快取（見 <see cref="LookupAsync"/>）。容量上限在 Program.cs。</summary>
    private static readonly MemoryCacheEntryOptions CacheOptions = new()
    {
        AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(12),
        Size = 1,
    };

    /// <summary>對照表的一列。只取轉址真正需要的兩個欄位。</summary>
    private sealed record RedirectRow(string ToPath, short StatusCode);

    [Function("fallback")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", "head", Route = "fallback")]
        HttpRequestData req)
    {
        // SWA 用這個標頭帶原始網址，且**含 query string**——
        // 這正是 staticwebapp.config.json 的 route 做不到的部分（它不比對 query string）。
        var originalUrl = req.Headers.TryGetValues("x-ms-original-url", out var values)
            ? values.FirstOrDefault()
            : null;

        if (string.IsNullOrEmpty(originalUrl) || !Uri.TryCreate(originalUrl, UriKind.Absolute, out var uri))
        {
            logger.LogWarning("缺少或無法解析 x-ms-original-url：{Value}", originalUrl);
            return await NotFound(req);
        }

        var row = await LookupAsync(uri);
        if (row is null) return await NotFound(req);

        var res = req.CreateResponse((HttpStatusCode)row.StatusCode);
        res.Headers.Add("Location", row.ToPath);
        // 讓瀏覽器與 SWA 節點快取，減少重複打到這支 function——
        // Managed Functions 沒有預熱，每次未命中快取都要吃一次冷啟動。
        res.Headers.Add("Cache-Control", "public, max-age=86400");
        return res;
    }

    /// <summary>
    /// 查對照表。快取以正規化後的鍵為準，<b>命中與未命中都存</b>——
    /// 遷移期爬蟲會密集打不存在的舊網址，不快取未命中等於每一次都查一趟 DB。
    /// </summary>
    private async Task<RedirectRow?> LookupAsync(Uri uri)
    {
        // ⚠️ 兩種形式都要查，這不是防禦性過頭。
        //    後台寫進 FromPath 的是 CSV 匯入的**原樣文字**（docs/08 §H 的例子就是
        //    /share.php?class=醫美新知，中文未編碼）；但瀏覽器送出的
        //    x-ms-original-url 一定是 percent-encoded 的。約 40 條中文 query 的
        //    年份組合就卡在這個差異上，只查一種必然對不上其中一邊。
        //    兩個鍵都走同一條 unique index，多一次 seek 的成本可以忽略。
        var decodedKey = Normalize(
            uri.GetComponents(UriComponents.Path, UriFormat.Unescaped),
            uri.GetComponents(UriComponents.Query, UriFormat.Unescaped));

        var encodedKey = Normalize(
            uri.GetComponents(UriComponents.Path, UriFormat.UriEscaped),
            uri.GetComponents(UriComponents.Query, UriFormat.UriEscaped));

        var cacheKey = decodedKey + " " + encodedKey;
        if (cache.TryGetValue<RedirectRow?>(cacheKey, out var cached)) return cached;

        RedirectRow? row;
        try
        {
            // 連線字串是明文的——SWA 的 Managed Functions 沒有 Managed Identity。
            // 對應的 SQL 使用者 fallback_readonly 只能 SELECT 這一張表（docs/07 §6）。
            await using var conn = new SqlConnection(
                Environment.GetEnvironmentVariable("SKIN20_SQL_CONNECTION"));

            // 單筆 seek，不 join。IsActive 讓後台能停用一筆規則而不必刪除。
            // 兩個鍵相同時 IN 不會多做事；ORDER BY 讓兩者都命中時有穩定結果。
            const string sql = """
                SELECT TOP (1) ToPath, StatusCode
                FROM dbo.Redirects
                WHERE FromPath IN (@Decoded, @Encoded) AND IsActive = 1
                ORDER BY CASE WHEN FromPath = @Decoded THEN 0 ELSE 1 END
                """;

            row = await conn.QuerySingleOrDefaultAsync<RedirectRow>(
                sql, new { Decoded = decodedKey, Encoded = encodedKey });
        }
        catch (SqlException ex)
        {
            // 🔴 DB 掛掉時**不要快取**這個結果，也不要把它當成「未命中」記起來——
            //    否則一次短暫的連線失敗會讓那批網址在 12 小時內都回 404。
            logger.LogError(ex, "查詢 301 對照表失敗：{Key}", decodedKey);
            return null;
        }

        if (row is null)
            logger.LogInformation("301 未命中：{Key}", decodedKey);

        cache.Set(cacheKey, row, CacheOptions);
        return row;
    }

    /// <summary>
    /// 🔴 <b>這段必須與 <c>functions/Handlers/RedirectHandler.NormalizePath</c> 逐字一致。</b>
    /// 那邊是寫入端（後台新增與 CSV 匯入），這邊是讀取端；兩邊分岔的症狀是
    /// 「後台看得到規則，但線上不轉址」，而且只有上線後才會發現（docs/08 §H）。
    ///
    /// <list type="number">
    /// <item>確保以 <c>/</c> 開頭</item>
    /// <item>path 部分轉小寫（ASCII，不影響中文字元）</item>
    /// <item>query string 依 <c>key=value</c> 整串做序數排序後以 <c>&amp;</c> 重新組回</item>
    /// </list>
    /// </summary>
    internal static string Normalize(string rawPath, string rawQuery)
    {
        var path = rawPath.Trim();
        if (!path.StartsWith('/')) path = "/" + path;
        path = path.ToLowerInvariant();

        // GetComponents(Query) 不含開頭的 '?'，但傳入值若帶了也要能吃。
        var query = rawQuery.TrimStart('?');
        if (query.Length == 0) return path;

        var pairs = query
            .Split('&', StringSplitOptions.RemoveEmptyEntries)
            .Select(p => p.Trim())
            .Where(p => p.Length > 0)
            .OrderBy(p => p, StringComparer.Ordinal)
            .ToArray();

        return pairs.Length == 0 ? path : $"{path}?{string.Join('&', pairs)}";
    }

    /// <summary>前台建置產出的 404 版面，第一次用到才讀檔，之後常駐（見 <see cref="NotFound"/>）。</summary>
    private static string? _notFoundHtml;

    /// <summary>
    /// 未命中。
    ///
    /// <para>
    /// ⚠️ <b>SWA 的 <c>responseOverrides.404</c> 對 function 回的 404 不生效</b>（2026-09-11 實測：
    /// 部署後打未命中的舊網址，拿到的是本檔案的內嵌字串而不是 <c>/404.html</c>）。
    /// 而 <c>navigationFallback</c> 會把<b>所有</b>找不到實體檔案的請求都送進這支 function ——
    /// 也就是說全站每一個 404 的版面都由這裡決定，不只是遷移期的舊網址。
    /// 所以 404 版面必須由這支 function 自己送出。
    /// </para>
    /// <para>
    /// <c>404.html</c> 由 <c>tools/deploy-swa.sh</c> 在部署時從前台建置產物複製進來
    /// （它是 <c>nuxt generate</c> 的產出，不是這個專案的原始碼，<b>不要手抄一份到這裡</b>）。
    /// 檔案不在時退回內嵌的最小版面，這樣 API 先部署、前台還沒部署的中間狀態也不會壞掉。
    /// </para>
    /// <para>
    /// 版面裡的 <c>/assets/...</c> 是絕對路徑且與前台同源，由 function 送出照樣載得到。
    /// </para>
    /// </summary>
    private static async Task<HttpResponseData> NotFound(HttpRequestData req)
    {
        // 讀檔只做一次。爬蟲在遷移期會密集打不存在的舊網址，
        // 每次都碰一下磁碟是沒必要的成本。
        if (_notFoundHtml is null)
        {
            var path = Path.Combine(AppContext.BaseDirectory, "404.html");
            _notFoundHtml = File.Exists(path)
                ? await File.ReadAllTextAsync(path)
                : "<!doctype html><meta charset=\"utf-8\"><title>找不到頁面｜20SKIN</title>";
        }

        var res = req.CreateResponse(HttpStatusCode.NotFound);
        res.Headers.Add("Content-Type", "text/html; charset=utf-8");
        await res.WriteStringAsync(_notFoundHtml);
        return res;
    }
}
