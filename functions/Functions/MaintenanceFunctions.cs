using Microsoft.Azure.Functions.Worker;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Skin20.Api.Common;
using Skin20.Api.Data;
using Skin20.Api.Services;

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

/// <summary>
/// 補齊 <c>ContentItems.SearchText</c>（站內搜尋的比對用純文字）。
///
/// <para>
/// 🔴 <b>這不是一次性的搬遷腳本，是對帳器。</b> 它做的事是「任何已發布、但
/// <c>SearchText</c> 還是空的內容，用它已核准版本的快照補上」。
/// 因此：新加的那一欄會被自動填滿（2026-09-16 導入時 1228 筆）；
/// 而日後若有任何發布路徑漏了設定它，這支也會把它補回來。
/// </para>
///
/// <para>
/// ⚠️ <b>為什麼不寫成 migration 的 SQL</b>：那一欄的內容要把快照 JSON 攤平成純文字
/// （巢狀區塊、內嵌 JSON 字串、跳過圖片欄位），T-SQL 做這件事又長又脆，
/// 而同樣的邏輯 C# 這邊已經有一份（<see cref="SearchTextBuilder"/>）——
/// 為了回填再寫第二份實作，正是這個專案踩過好幾次的那種錯。
/// </para>
///
/// <para>
/// ⚠️ <b>分批，而且只補空的。</b> 正式環境是 Azure SQL Basic（5 DTU），
/// 一次更新 1228 筆會把資料庫吃滿，而那是前台每一個請求都要用的同一顆資料庫。
/// 補完之後這支每次執行都是一句 <c>COUNT</c>，幾乎不花成本。
/// </para>
/// </summary>
public sealed class SearchTextBackfillFunction(
    Skin20DbContext db,
    ILogger<SearchTextBackfillFunction> logger)
{
    /// <summary>一次讀寫幾筆。⚠️ 不要調大 —— 見類別說明的 5 DTU 那段。</summary>
    private const int BatchSize = 100;

    /// <summary>
    /// 單次執行的時間預算。
    /// <para>
    /// ⚠️ <b>一次執行內就把它補完</b>，不要靠排程跑十幾次 —— 補完之前站內搜尋是壞的
    /// （搜不到那些還沒補的內容），那個中間狀態越短越好。
    /// </para>
    /// <para>⚠️ 但要有上界，否則資料一多就會變成一支長時間霸佔資料庫的工作。</para>
    /// </summary>
    private static readonly TimeSpan Budget = TimeSpan.FromMinutes(5);

    [Function("SearchTextBackfill")]
    public async Task Run([TimerTrigger("%SearchTextBackfillCron%")] TimerInfo timer, CancellationToken ct)
    {
        var startedAt = DateTime.UtcNow;
        var done = 0;

        while (!ct.IsCancellationRequested && DateTime.UtcNow - startedAt < Budget)
        {
            var pending = await db.ContentItems
                .Where(ci => ci.PublishedVersionId != null && ci.SearchText == null)
                .OrderBy(ci => ci.Id)
                .Take(BatchSize)
                .Join(db.ContentVersions, ci => ci.PublishedVersionId, v => v.Id,
                      (ci, v) => new { Item = ci, v.Snapshot })
                .ToListAsync(ct);

            if (pending.Count == 0) break;

            foreach (var row in pending)
            {
                // ⚠️ 快照壞掉時 Build 回空字串 —— **寫入空字串而不是留 null**，
                //    否則這一筆每次都會再被撿出來，變成一支永遠跑不完的對帳器。
                row.Item.SearchText = SearchTextBuilder.Build(row.Snapshot);
            }

            await db.SaveChangesAsync(ct);
            db.ChangeTracker.Clear();   // 一萬筆時不要讓追蹤器無限長大
            done += pending.Count;
        }

        var remaining = await db.ContentItems
            .CountAsync(ci => ci.PublishedVersionId != null && ci.SearchText == null, ct);

        if (done == 0 && remaining == 0)
        {
            logger.LogInformation("SearchText 對帳：沒有待補的內容");
            return;
        }

        // ⚠️ remaining > 0 不是錯誤 —— 代表撞到時間預算，下一次排程會接著補。
        logger.LogInformation("SearchText 對帳：補了 {Done} 筆，還剩 {Remaining} 筆", done, remaining);
    }
}

/// <summary>
/// AI 語料索引的增量更新（CLAUDE.md 決策 28）。
///
/// <para>
/// 🔴 <b>為什麼是 Timer 而不是 HTTP 端點或本機腳本</b>：獨立 Function App 的 HTTP 硬上限是
/// <b>230 秒</b>（平台層的負載平衡器閒置逾時，不是可調參數，docs/07 §4），
/// 而全量嵌入約兩分鐘 —— 貼著上限跑的東西不該放在 HTTP 上。
/// 本機腳本則要維護第二套接線（切塊規則、金鑰、上傳），而「全量」本來就等於
/// 「manifest 為空的增量」，同一條路走兩次沒有意義。
/// </para>
///
/// <para>
/// ⚠️ <b>每一輪的常態是「什麼都沒變」</b>，那條路徑只花一次 50 KB 的 blob 下載
/// 與一句兩個 int 的 SQL —— 這正是可以把週期設到 5 分鐘的原因
/// （週期越短，「院方發布之後多久 AI 才讀得到」就越短）。
/// </para>
///
/// <para>
/// 🔴 cron 由 <c>%AiIndexRefreshCron%</c> 注入。<b>少設這個 app setting，
/// 整個 Function App 會索引不到任何 function</b> —— 不是這一支壞掉而已。
/// </para>
/// </summary>
public sealed class AiIndexRefreshFunction(
    AiIndexBuilder builder,
    ILogger<AiIndexRefreshFunction> logger)
{
    /// <summary>單次執行的時間預算。⚠️ 與 <c>SearchTextBackfill</c> 同一個形狀與理由。</summary>
    private static readonly TimeSpan Budget = TimeSpan.FromMinutes(5);

    [Function("AiIndexRefresh")]
    public async Task Run([TimerTrigger("%AiIndexRefreshCron%")] TimerInfo timer, CancellationToken ct)
    {
        var result = await builder.RefreshAsync(Budget, ct);

        if (result.Added == 0 && result.Changed == 0 && result.Removed == 0)
        {
            logger.LogDebug("AI 語料索引：沒有變動（{Total} 塊）", result.TotalChunks);
            return;
        }

        // ⚠️ remaining > 0 不是錯誤 —— 撞到單輪上限或時間預算，下一輪接著補。
        logger.LogInformation(
            "AI 語料索引：新增 {Added}、更新 {Changed}、移除 {Removed}，還剩 {Remaining} 筆，目前共 {Total} 塊",
            result.Added, result.Changed, result.Removed, result.Remaining, result.TotalChunks);
    }
}
