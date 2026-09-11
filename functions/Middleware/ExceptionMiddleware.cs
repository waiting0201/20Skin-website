using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Middleware;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging;
using Skin20.Api.Common;

namespace Skin20.Api.Middleware;

/// <summary>
/// 統一例外處理（docs/11-backend-design.md §4）。
///
/// <para>
/// ⚠️ 這是 <b><see cref="IFunctionsWorkerMiddleware"/>（worker 層）</b>，不是 ASP.NET Core
/// 的 middleware —— isolated worker 的管線與 ASP.NET Core 不同，要透過
/// <c>context.GetHttpContext()</c> 才拿得到 <see cref="HttpResponse"/>。
/// </para>
/// </summary>
public sealed class ExceptionMiddleware(ILogger<ExceptionMiddleware> logger) : IFunctionsWorkerMiddleware
{
    // SQL Server 的錯誤碼。這三個是「可預期的操作撞到約束」，不是程式壞了 ——
    // 讓它們變成 500 會讓後台看到一句「系統發生錯誤」，而使用者其實只是刪了
    // 一個還有內容在用的分類。
    private const int SqlForeignKeyViolation = 547;
    private const int SqlUniqueIndexViolation = 2601;
    private const int SqlUniqueConstraintViolation = 2627;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task Invoke(FunctionContext context, FunctionExecutionDelegate next)
    {
        try
        {
            await next(context);
        }
        catch (AppException ex)
        {
            logger.LogWarning("業務例外 {Code}：{Message}", ex.Code, ex.Message);
            await WriteAsync(context, ex.StatusCode, ApiResponse.Fail(ex.Code, ex.Message));
        }
        catch (SqlException ex) when (ex.Number is SqlUniqueIndexViolation or SqlUniqueConstraintViolation)
        {
            // UrlPath 的 filtered unique index 是全站網址唯一性的最後防線（docs/08 §B-1）。
            // 撞到時要回得出「這個網址已被使用」，不是一句系統錯誤。
            logger.LogWarning(ex, "唯一鍵違反");
            await WriteAsync(context, 409, ApiResponse.Fail(
                ErrorCodes.ConflictDuplicate, "這個值已經有人用了（可能是網址、slug 或帳號重複）。"));
        }
        catch (SqlException ex) when (ex.Number == SqlForeignKeyViolation)
        {
            logger.LogWarning(ex, "外鍵違反");
            await WriteAsync(context, 409, ApiResponse.Fail(
                ErrorCodes.ConflictState, "這筆資料還被其他內容引用，不能刪除。"));
        }
        catch (Exception ex)
        {
            // ⚠️ 對外只回通用訊息。堆疊只進 Application Insights。
            logger.LogError(ex, "未預期例外");
            await WriteAsync(context, 500, ApiResponse.Fail(
                ErrorCodes.Internal, "系統發生未預期的錯誤，請稍後再試。"));
        }
    }

    private static async Task WriteAsync<T>(FunctionContext context, int statusCode, ApiResponse<T> body)
    {
        var http = context.GetHttpContext();
        if (http is null) return;

        // 已經開始輸出就不要再動 —— 否則會撞上「回應已送出」的例外，把原本的錯誤蓋掉。
        if (http.Response.HasStarted) return;

        // ⚠️ 不要呼叫 Response.Clear() —— 它會把已經設好的標頭一起清掉，包含 CORS。
        http.Response.StatusCode = statusCode;
        http.Response.ContentType = "application/json; charset=utf-8";

        // ⚠️ 錯誤回應**也要**帶 CORS 標頭。只在成功路徑設 CORS 是很常見的疏漏 ——
        //    4xx／5xx 少了標頭，瀏覽器端只會看到一個沒有任何資訊的 network error，
        //    後台除錯會非常痛苦（docs/10 §2）。實際的 allow-list 在平台層設定，
        //    這裡只確保錯誤路徑不會把已設好的標頭清掉。
        await http.Response.WriteAsync(JsonSerializer.Serialize(body, Json));
    }
}
