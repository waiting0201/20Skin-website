namespace Skin20.Api.Models.Dtos;

/// <summary>
/// 未命中題目（docs/08-database.md §F、docs/10-api.md §3.4）。
/// 🔴 這是題庫成長的工作清單，不是搜尋日誌——本 DTO 刻意不含 IP／session 等欄位。
/// </summary>
public sealed class QuestionListItemDto
{
    public int Id { get; set; }
    public string QuestionText { get; set; } = string.Empty;
    public byte Source { get; set; }
    public int HitCount { get; set; }
    public DateTime FirstSeenAt { get; set; }
    public DateTime LastSeenAt { get; set; }
    public byte Status { get; set; }
    public int? LinkedFaqContentItemId { get; set; }
    public string? LinkedFaqTitle { get; set; }
    public int? HandledByUserId { get; set; }
    public string? HandledByUserName { get; set; }
    public DateTime? HandledAt { get; set; }
}

/// <summary>
/// 標記處理結果。<c>status = 2</c>（已建題）時 <see cref="LinkedFaqContentItemId"/> 必填。
/// </summary>
public sealed class QuestionUpdateRequest
{
    /// <summary>1 待處理／2 已建題／3 忽略。</summary>
    public byte? Status { get; set; }

    public int? LinkedFaqContentItemId { get; set; }
}
