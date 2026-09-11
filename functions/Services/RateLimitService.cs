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
/// 🔴 <b>後台唯一的防線。</b> 帳號與來源 IP 雙維度計數，狀態存 <c>LoginThrottles</c>，
/// 不使用 <c>MemoryCache</c>（Flex Consumption 多執行個體，記憶體計數形同虛設）。
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

    private readonly string? _lockoutAlertEmail = configuration["Alerts:LoginLockoutEmail"];

    public async Task EnsureNotLockedAsync(string userName, string? ipAddress, CancellationToken ct = default)
    {
        var now = Clock.UtcNow;
        var accountKey = NormalizeAccountKey(userName);

        var account = await db.LoginThrottles.AsNoTracking().SingleOrDefaultAsync(
            x => x.Dimension == ThrottleDimension.Account && x.ThrottleKey == accountKey, ct);
        ThrowIfLocked(account, now);

        if (!string.IsNullOrWhiteSpace(ipAddress))
        {
            var ip = await db.LoginThrottles.AsNoTracking().SingleOrDefaultAsync(
                x => x.Dimension == ThrottleDimension.IpAddress && x.ThrottleKey == ipAddress, ct);
            ThrowIfLocked(ip, now);
        }
    }

    public async Task RecordFailureAsync(string userName, string? ipAddress, CancellationToken ct = default)
    {
        var now = Clock.UtcNow;
        var accountKey = NormalizeAccountKey(userName);

        bool justLockedAccount = false, justLockedIp = false;

        // 多表（此處是同一張表的多列）寫入包在交易裡（docs/11 §6.1）。
        var strategy = db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);

            justLockedAccount = await BumpAsync(ThrottleDimension.Account, accountKey, now, ct);
            if (!string.IsNullOrWhiteSpace(ipAddress))
                justLockedIp = await BumpAsync(ThrottleDimension.IpAddress, ipAddress, now, ct);

            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        });

        if (justLockedAccount || justLockedIp)
            await SendLockoutAlertAsync(userName, ipAddress, justLockedAccount, justLockedIp, ct);
    }

    public async Task ClearAsync(string userName, string? ipAddress, CancellationToken ct = default)
    {
        var accountKey = NormalizeAccountKey(userName);

        var rows = await db.LoginThrottles.Where(x =>
                (x.Dimension == ThrottleDimension.Account && x.ThrottleKey == accountKey) ||
                (ipAddress != null && x.Dimension == ThrottleDimension.IpAddress && x.ThrottleKey == ipAddress))
            .ToListAsync(ct);

        if (rows.Count == 0) return;
        db.LoginThrottles.RemoveRange(rows);
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
            else if (now - row.FirstFailedAt > _publicQuotaWindow)
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
                if (row.FailedCount > _publicQuotaMaxRequests)
                {
                    row.LockedUntil = now.Add(_publicQuotaWindow);
                    exceeded = true;
                }
            }

            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        });

        if (exceeded)
            throw AppException.RateLimited("請求過於頻繁，請稍後再試。");
    }

    private async Task<bool> BumpAsync(ThrottleDimension dimension, string key, DateTime now, CancellationToken ct)
    {
        var row = await db.LoginThrottles.SingleOrDefaultAsync(
            x => x.Dimension == dimension && x.ThrottleKey == key, ct);

        if (row is null)
        {
            row = new LoginThrottle
            {
                Dimension = dimension,
                ThrottleKey = key,
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

    private async Task SendLockoutAlertAsync(
        string userName, string? ipAddress, bool accountLocked, bool ipLocked, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(_lockoutAlertEmail))
        {
            // ⚠️ docs/10 §3.2／docs/08 §A-3 只要求「鎖定事件即時寄出告警信」，
            // 沒有指定收件人。這裡讀 App Setting（Alerts:LoginLockoutEmail），
            // 未設定時不阻擋鎖定流程本身，只記警告——見本次回報。
            logger.LogWarning("登入鎖定告警：Alerts:LoginLockoutEmail 未設定，無法寄出告警信。");
            return;
        }

        var reason = (accountLocked, ipLocked) switch
        {
            (true, true) => "帳號與來源 IP 同時觸發鎖定",
            (true, false) => "帳號觸發鎖定",
            _ => "來源 IP 觸發鎖定",
        };

        // ⚠️ 只記帳號與 IP，不記密碼、不記嘗試內容——這是安全告警不是操作日誌
        // （docs/08 §I：不做操作日誌／登入紀錄，LoginThrottles 只留當下計數）。
        var body = $"""
            後台登入次數限制觸發：{reason}
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
