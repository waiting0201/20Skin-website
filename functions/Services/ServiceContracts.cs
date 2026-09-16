using Microsoft.AspNetCore.Http;

namespace Skin20.Api.Services;

/// <summary>
/// 登入次數限制（docs/11-backend-design.md §5.2、docs/08 §A-3）。
///
/// <para>
/// 🔴 <b>這是後台唯一的硬防線。</b> IP 白名單不做（2026-08-13）、雙因素不做（2026-09-11），
/// 而後台路徑 <c>/admin/</c> 是客戶指定、與舊站相同、公開可猜。
/// </para>
/// <para>
/// ⚠️ <b>只以帳號計數，沒有來源 IP 維度</b>（2026-09-14 院方決定拿掉）。連帶後果要知道：
/// 同一個 IP 輪流試多個帳號（密碼噴灑）這一種，次數限制<b>抓不到</b> ——
/// 擋它的只剩 reCAPTCHA v3，而 v3 是分數制、連不上 Google 時放行（docs/10 §5.1）。
/// </para>
/// <para>
/// ⚠️ <b>狀態存 DB（<c>LoginThrottles</c>），不要用 <c>MemoryCache</c></b> ——
/// Flex Consumption 是多執行個體，記憶體計數形同虛設。
/// </para>
/// <para>⚠️ 這是<b>計數器不是日誌</b>：成功登入即刪除、鎖定到期即歸零，不留歷史。</para>
/// </summary>
public interface IRateLimitService
{
    /// <summary>該帳號超限時丟 <c>AppException.RateLimited</c>。</summary>
    Task EnsureNotLockedAsync(string userName, CancellationToken ct = default);

    /// <summary>
    /// 記該帳號的一次失敗。達門檻即鎖定並<b>即時寄出告警信</b>（不留存紀錄）。
    /// <para>
    /// ⚠️ <paramref name="ipAddress"/> <b>不參與計數</b>（2026-09-14 起），
    /// 只寫進告警信讓收信的人看得到來源。
    /// </para>
    /// </summary>
    Task RecordFailureAsync(string userName, string? ipAddress, CancellationToken ct = default);

    /// <summary>登入成功：清掉該帳號的計數。</summary>
    Task ClearAsync(string userName, CancellationToken ct = default);

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
/// 機器人驗證。供應商為 <b>reCAPTCHA v3</b>（2026-09-12 定案，docs/10 §5）。
/// <para>
/// ⚠️ <b>介面刻意不帶供應商名稱</b> —— 換成 Turnstile 時只有 <c>BotCheckService</c>
/// 要改，呼叫端一行都不用動。請不要讓 <c>recaptcha</c> 這個字漏到 Handler 或 DTO 裡。
/// </para>
/// <para>
/// 🔴 v3 是<b>分數制</b>：它不會擋下任何人，只回 0.0–1.0。門檻、<c>action</c> 比對、
/// 以及「連不上時怎麼辦」全部是實作的責任 —— 三者的理由見 <c>BotCheckService</c> 的註解。
/// </para>
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
    /// 取不到時回 <c>null</c>，由呼叫端決定要不要因此放行（公開端點的頻率限制會略過該次檢查；
    /// 登入的次數限制不受影響 —— 它只看帳號，不看 IP）。
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
