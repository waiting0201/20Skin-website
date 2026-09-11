using Dapper;
using Skin20.Api.Data;

namespace Skin20.Api.Services.Dapper;

/// <summary>單一 (單元, 狀態) 組合的筆數。</summary>
public sealed record UnitStatusCountRow(byte ContentType, byte Status, int Count);

/// <summary>「我的退件」一列。</summary>
public sealed record MyRejectedRow(int ContentItemId, byte ContentType, string Title, string? UrlPath, string? DecisionNote, DateTime? DecidedAt);

/// <summary>
/// 儀表板聚合查詢（docs/10-api.md §3.4）：<b>無專屬資料表</b>，全部從既有表聚合。
/// ⚠️ 不透過 DI 註冊，理由同 <see cref="ContentReadService"/>。
/// </summary>
public sealed class DashboardReadService(ISqlConnectionFactory factory)
{
    /// <summary>九個單元 × 四態的筆數矩陣，供後台首頁的內容總覽卡片。</summary>
    public async Task<IReadOnlyList<UnitStatusCountRow>> CountsByUnitAsync(CancellationToken ct = default)
    {
        const string sql = "SELECT ContentType, Status, COUNT(*) AS Count FROM ContentItems GROUP BY ContentType, Status;";
        using var conn = factory.Create();
        var rows = await conn.QueryAsync<UnitStatusCountRow>(new CommandDefinition(sql, cancellationToken: ct));
        return rows.ToList();
    }

    /// <summary>待審佇列總數（docs/10 §3.4 儀表板卡片）。</summary>
    public async Task<int> PendingReviewCountAsync(CancellationToken ct = default)
    {
        const string sql = "SELECT COUNT(*) FROM ContentReviews WHERE Status = 1;";
        using var conn = factory.Create();
        return await conn.QuerySingleAsync<int>(new CommandDefinition(sql, cancellationToken: ct));
    }

    /// <summary>「我的退件」＝ <c>ContentReviews WHERE Status=3 AND SubmittedByUserId=@me</c>（docs/08 §B-3）。</summary>
    public async Task<IReadOnlyList<MyRejectedRow>> MyRejectedAsync(int userId, int limit, CancellationToken ct = default)
    {
        const string sql = """
            SELECT TOP (@Limit) ci.Id AS ContentItemId, ci.ContentType, ci.Title, ci.UrlPath,
                   r.DecisionNote, r.DecidedAt
            FROM ContentReviews r
            INNER JOIN ContentItems ci ON ci.Id = r.ContentItemId
            WHERE r.Status = 3 AND r.SubmittedByUserId = @UserId
            ORDER BY r.DecidedAt DESC;
            """;
        using var conn = factory.Create();
        var command = new CommandDefinition(sql, new { UserId = userId, Limit = limit }, cancellationToken: ct);
        var rows = await conn.QueryAsync<MyRejectedRow>(command);
        return rows.ToList();
    }
}
