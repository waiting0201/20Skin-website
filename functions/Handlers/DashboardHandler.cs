using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Skin20.Api.Common;
using Skin20.Api.Data;
using Skin20.Api.Models.Dtos;
using Skin20.Api.Services;
using Skin20.Api.Services.Dapper;

namespace Skin20.Api.Handlers;

/// <summary>
/// docs/10 §3.4：純聚合查詢，**無專屬資料表**（docs/08 §K）。含「我的退件」。
///
/// <para>
/// ⚠️ 分層鐵律（docs/11 §2）：Handler 內<b>禁止直接寫 SQL</b> —— 讀走 Dapper ReadService、
/// 寫走 <c>Skin20DbContext</c>；<b>禁止重複檢查權限碼</b> —— 授權集中在 <c>AppRouter</c>，
/// 唯一例外是資料列擁有者判定（§5.4）。
/// </para>
/// <para>
/// 本端點登入即可（Router 對 <c>GET /admin/dashboard</c> 不要求任何權限碼），純聚合查詢，
/// 不做任何寫入。
/// </para>
/// </summary>
public sealed class DashboardHandler(ISqlConnectionFactory sqlFactory)
{
    /// <summary>儀表板卡片與清單各取的筆數上限，避免聚合查詢跟著資料量一起變重。</summary>
    private const int RecentLimit = 10;

    private readonly DashboardReadService _dashboard = new(sqlFactory);
    private readonly ReviewReadService _review = new(sqlFactory);

    public async Task<IActionResult> GetAsync(HttpRequest req)
    {
        var ct = req.HttpContext.RequestAborted;
        var userId = RequestContext.UserId(req);

        var countRows = await _dashboard.CountsByUnitAsync(ct);
        var pendingReviewCount = await _dashboard.PendingReviewCountAsync(ct);
        var recentPending = await _review.RecentPendingAsync(RecentLimit, ct);
        var myRejected = await _dashboard.MyRejectedAsync(userId, RecentLimit, ct);

        var contentCounts = BuildUnitCounts(countRows);

        var dto = new DashboardDto(
            pendingReviewCount,
            myRejected.Count,
            contentCounts,
            recentPending.Select(r => new ReviewQueueItemDto(
                r.Id, r.ContentItemId, ReviewHandler.UnitFromContentType(r.ContentType), r.Title, r.UrlPath,
                r.VersionId, r.VersionNo, r.SubmittedByUserId, r.SubmittedByName, r.SubmittedAt,
                ReviewHandler.ParseRiskFlags(r.RiskFlags))).ToList(),
            myRejected.Select(r => new MyRejectedItemDto(
                r.ContentItemId, ReviewHandler.UnitFromContentType(r.ContentType), r.Title, r.UrlPath,
                r.DecisionNote, r.DecidedAt)).ToList());

        return new OkObjectResult(ApiResponse.Ok(dto));
    }

    /// <summary>九個單元 × 四態（docs/08 §B-1）的筆數矩陣，缺席的組合補 0，前端不必自行防呆。</summary>
    private static IReadOnlyDictionary<string, ContentUnitCountsDto> BuildUnitCounts(IReadOnlyList<UnitStatusCountRow> rows)
    {
        var buckets = UnitCodes.All.ToDictionary(u => u, _ => new int[4]);

        foreach (var row in rows)
        {
            var unit = ReviewHandler.UnitFromContentType(row.ContentType);
            if (!buckets.TryGetValue(unit, out var counts)) continue;

            var index = row.Status switch
            {
                1 => 0, // Draft
                2 => 1, // InReview
                3 => 2, // Published
                4 => 3, // Unpublished
                _ => -1,
            };
            if (index < 0) continue;
            counts[index] += row.Count;
        }

        return buckets.ToDictionary(
            kv => kv.Key,
            kv => new ContentUnitCountsDto(kv.Value[0], kv.Value[1], kv.Value[2], kv.Value[3]));
    }
}
