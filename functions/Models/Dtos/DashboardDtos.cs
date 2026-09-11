namespace Skin20.Api.Models.Dtos;

// ── docs/10-api.md §3.4：儀表板聚合查詢，無專屬資料表 ─────────────────────

/// <summary>單一單元的四態筆數。</summary>
public sealed record ContentUnitCountsDto(int Draft, int InReview, int Published, int Unpublished);

/// <summary>「我的退件」一列（docs/08 §B-3：<c>ContentReviews WHERE Status=3 AND SubmittedByUserId=@me</c>）。</summary>
public sealed record MyRejectedItemDto(
    int ContentItemId, string Unit, string Title, string? UrlPath, string? DecisionNote, DateTime? DecidedAt);

/// <summary><c>GET /admin/dashboard</c> 的聚合結果（docs/10 §3.4）。</summary>
public sealed record DashboardDto(
    int PendingReviewCount,
    int MyRejectedCount,
    IReadOnlyDictionary<string, ContentUnitCountsDto> ContentCountsByUnit,
    IReadOnlyList<ReviewQueueItemDto> RecentPendingReviews,
    IReadOnlyList<MyRejectedItemDto> MyRejectedItems);
