namespace Skin20.Api.Models.Dtos;

// ── docs/10-api.md §3.4：儀表板聚合查詢，無專屬資料表 ─────────────────────

/// <summary>單一單元的四態筆數。</summary>
/// <remarks>
/// ⚠️ <c>InReview</c> 保留：送審 2026-09-17 停用，但既有資料仍可能停在那個狀態，
/// 少了這一格總筆數就對不起來。
/// </remarks>
public sealed record ContentUnitCountsDto(int Draft, int InReview, int Published, int Unpublished);

/// <summary>
/// <c>GET /admin/dashboard</c> 的聚合結果（docs/10 §3.4）。
/// <para>
/// 🔴 <b>2026-09-17：「待審核」「我的退件」「近期送審」三段全部移除</b>
/// （Tim 指定：審核者與審核佇列都不做了，CLAUDE.md 決策 20）。後台儀表板上那兩張
/// 卡片與審核佇列畫面已一併刪除，留著只會回恆為 0 的數字。
/// </para>
/// </summary>
public sealed record DashboardDto(
    IReadOnlyDictionary<string, ContentUnitCountsDto> ContentCountsByUnit);
