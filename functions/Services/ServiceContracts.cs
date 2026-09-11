using Microsoft.AspNetCore.Http;

namespace Skin20.Api.Services;

/// <summary>
/// 登入次數限制（docs/11-backend-design.md §5.2、docs/08 §A-3）。
///
/// <para>
/// 🔴 <b>這是後台唯一的防線。</b> IP 白名單不做（2026-08-13）、雙因素不做（2026-09-11），
/// 而後台路徑 <c>/admin/</c> 是客戶指定、與舊站相同、公開可猜。所以這裡不能打折：
/// <b>帳號與來源 IP 雙維度計數</b> —— 只鎖帳號擋不住撞庫，只鎖 IP 擋不住分散式嘗試。
/// </para>
/// <para>
/// ⚠️ <b>狀態存 DB（<c>LoginThrottles</c>），不要用 <c>MemoryCache</c></b> ——
/// Flex Consumption 是多執行個體，記憶體計數形同虛設。
/// </para>
/// <para>⚠️ 這是<b>計數器不是日誌</b>：成功登入即刪除、鎖定到期即歸零，不留歷史。</para>
/// </summary>
public interface IRateLimitService
{
    /// <summary>超限時丟 <c>AppException.RateLimited</c>。兩個維度任一超限都擋。</summary>
    Task EnsureNotLockedAsync(string userName, string? ipAddress, CancellationToken ct = default);

    /// <summary>記一次失敗。達門檻即鎖定並<b>即時寄出告警信</b>（不留存紀錄）。</summary>
    Task RecordFailureAsync(string userName, string? ipAddress, CancellationToken ct = default);

    /// <summary>登入成功：清掉該帳號與該 IP 的計數。</summary>
    Task ClearAsync(string userName, string? ipAddress, CancellationToken ct = default);

    /// <summary>公開寫入端點的頻率限制（<c>/contact</c>、<c>/questions/miss</c>）。</summary>
    Task EnsurePublicQuotaAsync(string bucket, string? ipAddress, CancellationToken ct = default);
}

/// <summary>
/// 通知信（docs/11 §12）。
/// <para>
/// ⚠️ <b>寄信失敗不得讓表單提交失敗</b> —— <c>/contact</c> 是「只寄信不落庫」，
/// 但使用者送出後看到錯誤卻不知道有沒有寄到，比慢一點更糟。失敗只記 log。
/// </para>
/// <para>
/// 🔴 <b>日誌不得寫入表單內容</b>：那批資料刻意不落庫（docs/02 §2 個資責任），
/// 寫進日誌等於繞過該決策。
/// </para>
/// </summary>
public interface IEmailService
{
    Task SendAsync(string to, string subject, string body, CancellationToken ct = default);
}

/// <summary>
/// 機器人驗證（docs/10 §5 待確認供應商）。
/// <para>
/// ⚠️ <b>介面刻意不帶供應商名稱</b> —— reCAPTCHA v3 與 Turnstile 都可能，
/// 換供應商時呼叫端不該因此改動。
/// </para>
/// <para>⚠️ 若採用 reCAPTCHA v3：它是<b>分數制</b>，另需比對 <c>action</c> 並套門檻。</para>
/// </summary>
public interface IBotCheckService
{
    /// <summary>未通過時丟 <c>AppException</c>（<c>BOT_CHECK_FAILED</c>）。</summary>
    Task EnsureHumanAsync(string? token, string action, CancellationToken ct = default);
}

/// <summary>
/// Blob 儲存（docs/09 §9、docs/11 §9）。
/// <para>
/// ⚠️ 檔案<b>不經過 API 的 request body</b>：後台向這裡取短效寫入 SAS，瀏覽器直傳。
/// SAS 以 <b>Managed Identity 取 user delegation key</b> 簽發，系統內不存放儲存體金鑰。
/// </para>
/// </summary>
public interface IBlobStorageService
{
    /// <summary>短效、write-only、限定單一 blob 名稱。檔名由<b>伺服器決定</b>，不採用前端送來的。</summary>
    Task<(string BlobPath, string UploadUrl, DateTimeOffset ExpiresAt)> CreateUploadSasAsync(
        string containerName, string extension, CancellationToken ct = default);

    /// <summary>
    /// 下載整份 blob 內容，回傳檔頭（供 magic bytes 判定）、位元組數與完整內容的 SHA-256。
    /// <para>
    /// ⚠️ 直傳模式下伺服器端看不到上傳過程，<b>這是唯一能驗證檔案真實型別、量測大小、
    /// 計算雜湊的時機</b>。副檔名與 Content-Type 是使用者說了算，不能當依據（docs/11 §9）。
    /// </para>
    /// <para>找不到指定 blob 時丟 <c>AppException</c>（<c>NOT_FOUND</c>）。</para>
    /// </summary>
    Task<BlobInspectionResult> InspectAsync(string containerName, string blobPath, CancellationToken ct = default);

    /// <summary>
    /// 驗證通過後，把暫存 blob（SAS 簽發時的隨機檔名）搬到以內容雜湊命名的正式路徑，
    /// 並設定長效 <c>Cache-Control</c>（docs/08 §E-1「檔名用內容雜湊」；docs/07 §3：
    /// 架構中沒有 CDN，靠雜湊檔名＋長效快取取代 CDN 的快取失效機制）。回傳最終公開 URL。
    /// </summary>
    Task<string> PromoteAsync(
        string containerName, string tempBlobPath, string finalBlobPath, string contentType,
        CancellationToken ct = default);

    /// <summary>驗證不通過時把已上傳的 blob 刪掉 —— 光是拒絕寫記錄會留下無主檔案。</summary>
    Task DeleteAsync(string containerName, string blobPath, CancellationToken ct = default);
}

/// <summary>
/// <see cref="IBlobStorageService.InspectAsync"/> 的結果。<see cref="Head"/> 只是前面一小段
/// 位元組供 magic bytes 判定，不是整份內容。
/// </summary>
public sealed record BlobInspectionResult(byte[] Head, long ByteSize, string Sha256Hex);

/// <summary>
/// 觸發全站重建（docs/11 §10）。
/// <para>
/// SWA 沒有 ISR，內容變更一定要重跑 build。作法是呼叫 GitHub 的 <c>repository_dispatch</c>。
/// </para>
/// <para>
/// ⚠️ <b>要聚合</b>：連續發布 10 篇不該觸發 10 次 build。窗口狀態存 DB 或 Blob，
/// <b>不要用 <c>MemoryCache</c></b>（多執行個體）。
/// </para>
/// <para>
/// ⚠️ <b>失敗不要 throw</b>：內容狀態已經改好了，重建失敗應獨立告警，
/// 不要讓整個流程重跑一次狀態轉換。
/// </para>
/// </summary>
public interface IRebuildService
{
    Task RequestAsync(CancellationToken ct = default);

    /// <summary>
    /// 把積欠的重建送出去。
    ///
    /// <para>
    /// <see cref="RequestAsync"/> 的聚合是<b>前緣觸發 ＋ 冷卻期</b>：第一次立刻觸發，
    /// 冷卻期內的後續請求只記一個「還有異動沒送出」的旗標。這已經達成
    /// 「連續發布 10 篇不觸發 10 次 build」，但留下一個尾巴 ——
    /// <b>冷卻期內的最後一次異動，如果之後沒有人再呼叫，就一直等著。</b>
    /// </para>
    /// <para>
    /// 這支由 <c>ScheduledPublishFunction</c> 每輪無條件呼叫，把那個尾巴收掉：
    /// 有旗標且冷卻期已過才觸發，否則什麼都不做。最壞情況的延遲是一個 Timer 週期。
    /// </para>
    /// <para>⚠️ 與 <see cref="RequestAsync"/> 一樣，失敗不 throw。</para>
    /// </summary>
    Task FlushPendingAsync(CancellationToken ct = default);
}

/// <summary>
/// 目前登入者。由 <c>AppRouter</c> 驗完 JWT 後寫進 <c>HttpContext.User</c>。
/// <para>
/// ⚠️ <b>身分一律看 <c>sub</c></b> —— <c>NotifyEmail</c> 是選填的，email claim 可能不存在
/// （docs/08 §A-1）。
/// </para>
/// </summary>
public static class RequestContext
{
    public static int UserId(HttpRequest req)
    {
        var raw = req.HttpContext.User.FindFirst(Common.TokenClaims.Subject)?.Value;
        return int.TryParse(raw, out var id)
            ? id
            : throw Common.AppException.Unauthorized("憑證缺少使用者識別。");
    }

    public static bool IsSuperAdmin(HttpRequest req)
        => req.HttpContext.User.FindFirst(Common.TokenClaims.IsSuperAdmin)?.Value == "true";

    public static IReadOnlyList<string> Roles(HttpRequest req)
        => [.. req.HttpContext.User.FindAll(Common.TokenClaims.Roles).Select(c => c.Value)];

    /// <summary>
    /// 來源 IP。⚠️ Function App 前面有負載平衡器，要看 <c>X-Forwarded-For</c> 的第一段；
    /// 取不到時回 <c>null</c>，由呼叫端決定要不要因此放行（登入限制的 IP 維度會退化成只剩帳號維度）。
    /// </summary>
    public static string? IpAddress(HttpRequest req)
    {
        var forwarded = req.Headers["X-Forwarded-For"].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(forwarded))
        {
            var first = forwarded.Split(',')[0].Trim();
            // Azure 會帶上連接埠（1.2.3.4:56789），只取位址。
            var colon = first.LastIndexOf(':');
            return colon > 0 && first.Count(c => c == ':') == 1 ? first[..colon] : first;
        }

        return req.HttpContext.Connection.RemoteIpAddress?.ToString();
    }
}
