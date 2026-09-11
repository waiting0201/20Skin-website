using Microsoft.Azure.Functions.Worker;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Skin20.Api.Common;
using Skin20.Api.Data;

namespace Skin20.Api.Functions;

/// <summary>
/// 版本歷程修剪（docs/11-backend-design.md §8、§11）。
/// <para>每筆內容保留最近 30 版。不修剪的話 <c>ContentVersions.Snapshot</c> 會無限成長 ——
/// 每一版都是一份完整 JSON 快照。</para>
/// </summary>
public sealed class VersionPruneFunction(
    Skin20DbContext db,
    ILogger<VersionPruneFunction> logger)
{
    private const int KeepVersions = 30;

    [Function("VersionPrune")]
    public async Task Run([TimerTrigger("%VersionPruneCron%")] TimerInfo timer, CancellationToken ct)
    {
        if (timer.IsPastDue) logger.LogWarning("版本修剪延遲執行");

        // 每筆內容各自保留最近 30 版 —— 用 VersionNo 排序而不是 CreatedAt，
        // 因為還原會產生新版本，時間順序與版本號可能不一致。
        var toDelete = await db.ContentVersions
            .GroupBy(v => v.ContentItemId)
            .Where(g => g.Count() > KeepVersions)
            .SelectMany(g => g.OrderByDescending(v => v.VersionNo).Skip(KeepVersions))
            .Select(v => v.Id)
            .ToListAsync(ct);

        if (toDelete.Count == 0)
        {
            logger.LogInformation("版本修剪：沒有需要清除的版本");
            return;
        }

        // ⚠️ ContentItems.PublishedVersionId 與 ContentReviews.VersionId 都指向這張表，
        //    且那兩條外鍵是 NoAction（循環參照，見 ContentItemConfiguration）。
        //    所以仍被引用的版本不能刪 —— 這裡先濾掉，避免撞 FK 違反。
        var referenced = await db.ContentItems
            .Where(c => c.PublishedVersionId != null && toDelete.Contains(c.PublishedVersionId.Value))
            .Select(c => c.PublishedVersionId!.Value)
            .Union(db.ContentReviews.Where(r => toDelete.Contains(r.VersionId)).Select(r => r.VersionId))
            .ToListAsync(ct);

        var deletable = toDelete.Except(referenced).ToList();
        if (deletable.Count == 0)
        {
            logger.LogInformation("版本修剪：{Count} 個候選版本仍被引用，全數保留", toDelete.Count);
            return;
        }

        var removed = await db.ContentVersions
            .Where(v => deletable.Contains(v.Id))
            .ExecuteDeleteAsync(ct);

        logger.LogInformation("版本修剪：刪除 {Removed} 版，保留仍被引用的 {Kept} 版",
            removed, toDelete.Count - deletable.Count);
    }
}

/// <summary>
/// 登入計數清理（docs/11 §11、docs/08 §A-3）。
///
/// <para>
/// 🔴 <b><c>LoginThrottles</c> 是計數器不是日誌。</b> 登入成功即刪除該筆、鎖定到期即歸零，
/// 不保留任何歷史 —— 符合「不做 log」的指定（docs/08 §I）。
/// </para>
/// <para>
/// 這支是安全網：清掉那些「失敗過幾次但從此沒再出現」的殘留列。沒有它，
/// 這張表會隨著公網掃描無限成長，而那些列既沒用也不該留。
/// </para>
/// </summary>
public sealed class ThrottleSweepFunction(
    Skin20DbContext db,
    ILogger<ThrottleSweepFunction> logger)
{
    /// <summary>超過這段時間沒再失敗過的計數列視為過期。</summary>
    private static readonly TimeSpan StaleAfter = TimeSpan.FromHours(24);

    [Function("ThrottleSweep")]
    public async Task Run([TimerTrigger("%ThrottleSweepCron%")] TimerInfo timer, CancellationToken ct)
    {
        if (timer.IsPastDue) logger.LogWarning("計數清理延遲執行");

        var cutoff = Clock.UtcNow - StaleAfter;

        var removed = await db.LoginThrottles
            .Where(t => t.LastFailedAt < cutoff && (t.LockedUntil == null || t.LockedUntil < Clock.UtcNow))
            .ExecuteDeleteAsync(ct);

        // ⚠️ 只記筆數，**不要記 ThrottleKey** —— 那是帳號名稱或 IP。
        logger.LogInformation("登入計數清理：刪除 {Removed} 筆過期計數", removed);
    }
}
