using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Skin20.Api.Common;
using Skin20.Api.Data;
using Skin20.Api.Models.Entities;

namespace Skin20.Api.Services;

/// <summary>
/// 登入次數限制（docs/11-backend-design.md §5.2、docs/08-database.md §A-3）。
///
/// <para>
/// 🔴 <b>後台唯一的硬防線。</b> <b>只以帳號計數</b>（來源 IP 維度 2026-09-14 院方決定拿掉），
/// 狀態存 <c>LoginThrottles</c>，不使用 <c>MemoryCache</c>
/// （Flex Consumption 多執行個體，記憶體計數形同虛設）。
/// </para>
/// <para>
/// ⚠️ <b>拿掉 IP 維度之後有一個缺口，不要以為防護沒變</b>：同一個 IP 輪流試多個帳號
/// （密碼噴灑）永遠碰不到任何一個帳號的門檻，這一種只剩 reCAPTCHA v3 擋（docs/10 §5.1），
/// 而 v3 是分數制、連不上 Google 時放行。
/// </para>
/// <para>
/// ⚠️ <b>這是計數器不是日誌</b>：成功登入即刪除、鎖定到期即歸零，不留歷史。
/// </para>
/// <para>
/// ⚠️ <see cref="EnsurePublicQuotaAsync"/>（<c>/contact</c>、<c>/questions/miss</c> 的頻率限制）
/// <b>沒有專屬資料表</b>——docs/08 §I「刻意不建的表」與 §F 都沒有為公開端點的一般頻率限制
/// 另外開表，而本組不允許新增 schema（<c>Data/**</c> 不可碰）。這裡的做法是<b>沿用
/// <see cref="LoginThrottle"/> 表</b>：把 bucket 名稱併進 <c>ThrottleKey</c>
/// （<c>"{bucket}:{ip}"</c>），一律用 <see cref="ThrottleDimension.IpAddress"/> 維度。
/// 這是在既有約束下的權宜設計，<b>已在回報中明列，待確認是否需要一張獨立的表</b>。
/// ⚠️ 登入不再用 IP 維度之後，<see cref="ThrottleDimension.IpAddress"/> <b>只剩這裡在用</b> ——
/// 要動那個列舉值之前先看這一段。
/// </para>
/// </summary>
public sealed class RateLimitService(
    Skin20DbContext db,
    IEmailService email,
    IConfiguration configuration,
    ILogger<RateLimitService> logger) : IRateLimitService
{
    // ── 設定值：都給了保守的預設值，可用 App Setting 覆蓋，docs 未給出明確門檻 ──
    private readonly int _maxFailedAttempts = ParseInt(configuration["RateLimit:Login:MaxFailedAttempts"], 5);
    private readonly TimeSpan _failureWindow =
        TimeSpan.FromMinutes(ParseInt(configuration["RateLimit:Login:FailureWindowMinutes"], 15));
    private readonly TimeSpan _lockoutDuration =
        TimeSpan.FromMinutes(ParseInt(configuration["RateLimit:Login:LockoutMinutes"], 15));

    private readonly int _publicQuotaMaxRequests =
        ParseInt(configuration["RateLimit:PublicQuota:MaxRequests"], 5);
    private readonly TimeSpan _publicQuotaWindow =
        TimeSpan.FromMinutes(ParseInt(configuration["RateLimit:PublicQuota:WindowMinutes"], 10));

    /// <summary>
    /// 某個 bucket 的配額：先找它自己的設定，沒有才落回全域。
    ///
    /// <para>
    /// 🔴 <b>加這一層是因為配額原本是全域的</b>（兩個 readonly 欄位，所有 bucket 共用）——
    /// 而聊天與表單的合理值差很多：一段對話 3–8 輪，表單那組「5 次／10 分」會在第一段
    /// 對話中途就把使用者鎖住。直接調全域的話，<c>/contact</c> 與 <c>/questions/miss</c>
    /// 會跟著一起放寬。
    /// </para>
    /// <para>
    /// 設定鍵：<c>RateLimit__PublicQuota__{bucket}__MaxRequests</c>／<c>__WindowMinutes</c>。
    /// ⚠️ bucket 名帶連字號（<c>ai-ask</c>）在 app setting 裡是合法的，不要為此改 bucket 名 ——
    /// 那會把 <c>LoginThrottles</c> 裡已經累積的計數丟掉。
    /// </para>
    /// </summary>
    private (int MaxRequests, TimeSpan Window) QuotaFor(string bucket)
    {
        var max = ParseInt(configuration[$"RateLimit:PublicQuota:{bucket}:MaxRequests"], _publicQuotaMaxRequests);
        var minutes = ParseInt(
            configuration[$"RateLimit:PublicQuota:{bucket}:WindowMinutes"], (int)_publicQuotaWindow.TotalMinutes);
        return (max, TimeSpan.FromMinutes(minutes));
    }

    private readonly string? _lockoutAlertEmail = configuration["Alerts:LoginLockoutEmail"];

    public async Task EnsureNotLockedAsync(string userName, CancellationToken ct = default)
    {
        var accountKey = NormalizeAccountKey(userName);

        var account = await db.LoginThrottles.AsNoTracking().SingleOrDefaultAsync(
            x => x.Dimension == ThrottleDimension.Account && x.ThrottleKey == accountKey, ct);
        ThrowIfLocked(account, Clock.UtcNow);
    }

    public async Task RecordFailureAsync(string userName, string? ipAddress, CancellationToken ct = default)
    {
        var accountKey = NormalizeAccountKey(userName);

        // 只寫一列（IP 維度已拿掉），所以不需要交易 —— SaveChanges 本身就是原子的。
        var justLocked = await BumpAsync(accountKey, Clock.UtcNow, ct);
        await db.SaveChangesAsync(ct);

        // ⚠️ ipAddress 到這裡只是告警信的內容，不影響鎖不鎖。
        if (justLocked)
            await SendLockoutAlertAsync(userName, ipAddress, ct);
    }

    public async Task ClearAsync(string userName, CancellationToken ct = default)
    {
        var accountKey = NormalizeAccountKey(userName);

        var row = await db.LoginThrottles.SingleOrDefaultAsync(
            x => x.Dimension == ThrottleDimension.Account && x.ThrottleKey == accountKey, ct);

        if (row is null) return;
        db.LoginThrottles.Remove(row);
        await db.SaveChangesAsync(ct);
    }

    public async Task EnsurePublicQuotaAsync(string bucket, string? ipAddress, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(ipAddress))
        {
            // 取不到來源 IP 時無從計數。寧可放行也不要因為平台/代理設定問題把整個公開
            // 表單擋死——這種情況應該從 Application Insights 的這則 warning 被發現並修代理設定。
            logger.LogWarning("公開端點頻率限制：{Bucket} 收到無法識別來源 IP 的請求，略過檢查。", bucket);
            return;
        }

        var key = $"{bucket}:{ipAddress}";
        var (maxRequests, window) = QuotaFor(bucket);
        var now = Clock.UtcNow;
        var exceeded = false;

        var strategy = db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);

            var row = await db.LoginThrottles.SingleOrDefaultAsync(
                x => x.Dimension == ThrottleDimension.IpAddress && x.ThrottleKey == key, ct);

            if (row is null)
            {
                row = new LoginThrottle
                {
                    Dimension = ThrottleDimension.IpAddress,
                    ThrottleKey = key,
                    FailedCount = 0,
                    FirstFailedAt = now,
                };
                db.LoginThrottles.Add(row);
            }
            else if (now - row.FirstFailedAt > window)
            {
                // 視窗過期，重新起算。
                row.FailedCount = 0;
                row.FirstFailedAt = now;
                row.LockedUntil = null;
            }

            if (row.LockedUntil is { } until && until > now)
            {
                exceeded = true;
            }
            else
            {
                row.FailedCount++;
                row.LastFailedAt = now;
                if (row.FailedCount > maxRequests)
                {
                    // ⚠️ 超限後鎖一整個視窗（不是「等下一次就好」）。對聊天偏兇，
                    //    但改它會連 /contact 一起改 —— 前台的文案要把「約幾分鐘後可再試」講清楚。
                    row.LockedUntil = now.Add(window);
                    exceeded = true;
                }
            }

            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        });

        if (exceeded)
            throw AppException.RateLimited("請求過於頻繁，請稍後再試。");
    }

    /// <summary>把該帳號的失敗次數加一，回傳「這一次是否剛好觸發鎖定」。</summary>
    private async Task<bool> BumpAsync(string accountKey, DateTime now, CancellationToken ct)
    {
        var row = await db.LoginThrottles.SingleOrDefaultAsync(
            x => x.Dimension == ThrottleDimension.Account && x.ThrottleKey == accountKey, ct);

        if (row is null)
        {
            row = new LoginThrottle
            {
                Dimension = ThrottleDimension.Account,
                ThrottleKey = accountKey,
                FailedCount = 0,
                FirstFailedAt = now,
            };
            db.LoginThrottles.Add(row);
        }

        // 已經鎖定中就不再往上加，避免每次失敗都把鎖定視窗往後延到無限期
        // （呼叫端理當已經被 EnsureNotLockedAsync 擋在登入之前，這裡是防禦性判斷）。
        if (row.LockedUntil is { } lockedUntil && lockedUntil > now) return false;

        // 距離上次失敗太久，視為新的一輪，不與久遠的舊失敗次數累加。
        if (row.FailedCount > 0 && now - row.LastFailedAt > _failureWindow)
        {
            row.FailedCount = 0;
            row.FirstFailedAt = now;
        }

        row.FailedCount++;
        row.LastFailedAt = now;

        if (row.FailedCount < _maxFailedAttempts) return false;

        row.LockedUntil = now.Add(_lockoutDuration);
        row.FailedCount = 0; // 鎖定期滿後從頭累積，不是無限期加總。
        return true;
    }

    private async Task SendLockoutAlertAsync(string userName, string? ipAddress, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(_lockoutAlertEmail))
        {
            // ⚠️ docs/10 §3.2／docs/08 §A-3 只要求「鎖定事件即時寄出告警信」，
            // 沒有指定收件人。這裡讀 App Setting（Alerts:LoginLockoutEmail），
            // 未設定時不阻擋鎖定流程本身，只記警告——見本次回報。
            logger.LogWarning("登入鎖定告警：Alerts:LoginLockoutEmail 未設定，無法寄出告警信。");
            return;
        }

        // ⚠️ 只記帳號與 IP，不記密碼、不記嘗試內容——這是安全告警不是操作日誌
        // （docs/08 §I：不做操作日誌／登入紀錄，LoginThrottles 只留當下計數）。
        //
        // ⚠️ 來源 IP 只是給收信的人看的線索，不代表那個 IP 被鎖 —— 計數只看帳號。
        var body = $"""
            後台登入次數限制觸發：帳號鎖定
            帳號：{userName}
            來源 IP：{ipAddress ?? "（無法識別）"}
            時間：{Clock.Now:yyyy-MM-dd HH:mm:ss}（台北時間）
            """;

        await email.SendAsync(_lockoutAlertEmail, "[20SKIN 後台] 登入次數限制觸發告警", body, ct);
    }

    private static void ThrowIfLocked(LoginThrottle? throttle, DateTime now)
    {
        if (throttle?.LockedUntil is { } until && until > now)
            throw AppException.RateLimited("登入嘗試次數過多，請稍後再試。");
    }

    /// <summary>比對不分大小寫（docs/08 §A-1：<c>UserName</c> 沿用資料庫預設定序）。</summary>
    private static string NormalizeAccountKey(string userName) => userName.Trim().ToLowerInvariant();

    private static int ParseInt(string? raw, int fallback) => int.TryParse(raw, out var v) ? v : fallback;
}
