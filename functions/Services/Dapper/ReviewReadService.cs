using Dapper;
using Skin20.Api.Data;

namespace Skin20.Api.Services.Dapper;

/// <summary>審核佇列一列的原始查詢結果。</summary>
public sealed record ReviewQueueRow(
    int Id,
    int ContentItemId,
    byte ContentType,
    string Title,
    string? UrlPath,
    int VersionId,
    int VersionNo,
    int SubmittedByUserId,
    string? SubmittedByName,
    DateTime SubmittedAt,
    string? RiskFlags);

/// <summary>
/// 審核佇列查詢（docs/10-api.md §3.4、docs/08-database.md §B-3）。
/// ⚠️ 不透過 DI 註冊，由 <c>ReviewHandler</c> 以既有的 <see cref="ISqlConnectionFactory"/>
/// 自行 <c>new</c>（理由同 <c>ContentReadService</c>：新增 DI 註冊需要動 <c>Program.cs</c>）。
/// </summary>
public sealed class ReviewReadService(ISqlConnectionFactory factory)
{
    private const string BaseSelect = """
        SELECT r.Id, r.ContentItemId, ci.ContentType, ci.Title, ci.UrlPath,
               r.VersionId, v.VersionNo, r.SubmittedByUserId, u.DisplayName AS SubmittedByName,
               r.SubmittedAt, r.RiskFlags
        FROM ContentReviews r
        INNER JOIN ContentItems ci ON ci.Id = r.ContentItemId
        INNER JOIN ContentVersions v ON v.Id = r.VersionId
        LEFT JOIN Users u ON u.Id = r.SubmittedByUserId
        WHERE r.Status = 1
        """;

    /// <summary><c>GET /admin/review</c>：待審佇列，依 <c>SubmittedAt</c> 由舊到新。</summary>
    public async Task<(IReadOnlyList<ReviewQueueRow> Items, int TotalCount)> ListPendingAsync(
        int page, int pageSize, CancellationToken ct = default)
    {
        var sql = $"""
            {BaseSelect}
            ORDER BY r.SubmittedAt
            OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;

            SELECT COUNT(*) FROM ContentReviews WHERE Status = 1;
            """;

        using var conn = factory.Create();
        var command = new CommandDefinition(sql, new { Offset = (page - 1) * pageSize, PageSize = pageSize }, cancellationToken: ct);
        using var multi = await conn.QueryMultipleAsync(command);
        var items = (await multi.ReadAsync<ReviewQueueRow>()).ToList();
        var total = await multi.ReadSingleAsync<int>();
        return (items, total);
    }

    /// <summary>儀表板用：最近 N 筆待審項目（不分頁，僅供概覽）。</summary>
    public async Task<IReadOnlyList<ReviewQueueRow>> RecentPendingAsync(int limit, CancellationToken ct = default)
    {
        var sql = $"""
            SELECT TOP (@Limit) *
            FROM ({BaseSelect}) x
            ORDER BY x.SubmittedAt
            """;

        using var conn = factory.Create();
        var command = new CommandDefinition(sql, new { Limit = limit }, cancellationToken: ct);
        var rows = await conn.QueryAsync<ReviewQueueRow>(command);
        return rows.ToList();
    }
}
