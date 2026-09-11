namespace Skin20.Api.Models.Dtos;

// ── docs/10-api.md §3.4：審核佇列 ──────────────────────────────────────────

/// <summary>審核佇列一列（docs/08 §B-3：<c>ContentReviews WHERE Status=1</c>，依 <c>SubmittedAt</c>）。</summary>
public sealed record ReviewQueueItemDto(
    int Id,
    int ContentItemId,
    string Unit,
    string Title,
    string? UrlPath,
    int VersionId,
    int VersionNo,
    int SubmittedByUserId,
    string? SubmittedByName,
    DateTime SubmittedAt,
    string[] RiskFlags);

/// <summary><c>POST /admin/review/{id}/reject</c> 的請求body。<see cref="DecisionNote"/> 必填（docs/08 §B-3）。</summary>
public sealed class RejectRequest
{
    public string DecisionNote { get; set; } = string.Empty;
}
