using Dapper;
using Skin20.Api.Data;
using Skin20.Api.Models.Dtos;

namespace Skin20.Api.Services.Dapper;

/// <summary>
/// 301 對照表的讀取路徑（docs/08-database.md §H、docs/11-backend-design.md §6）。
///
/// <para>
/// ⚠️ 這裡查的是<b>後台管理畫面</b>用的分頁清單與匯出，不是 <c>/api/fallback</c>
/// 那支查詢——後者是另一個專案（SWA Managed Function，docs/11 §14），
/// 只用 <c>FromPath</c> 的 unique index 做單筆 seek，與本檔案無關。
/// </para>
/// </summary>
public interface IRedirectReadService
{
    /// <param name="sortBy"><c>fromPath</c> 或 <c>createdAt</c>（其餘值一律退回 <c>createdAt</c>）。</param>
    /// <param name="sortDescending">後台預設新的在前。</param>
    Task<(IReadOnlyList<RedirectDto> Items, int TotalCount)> ListAsync(
        string? keyword, bool? isActive, byte? source, string? sortBy, bool sortDescending,
        int page, int pageSize, CancellationToken ct = default);

    /// <summary>
    /// 後台清單上方的統計卡。
    /// <para>⚠️ 一定要在 SQL 層算 —— 前端拿分頁結果加總只會算到當頁那 20 筆（docs/10 §2）。</para>
    /// </summary>
    Task<RedirectStatsDto> StatsAsync(CancellationToken ct = default);

    /// <summary>
    /// 匯出用：不分頁的完整清單。
    /// ⚠️ 這不是「清單一頁全載」——匯出本來就是把全部資料交給編輯者離線處理，
    /// 約 770 列的資料量對單一查詢而言微不足道（docs/08 §H）。
    /// </summary>
    Task<IReadOnlyList<RedirectDto>> ListAllAsync(CancellationToken ct = default);

    Task<bool> FromPathExistsAsync(string fromPath, int? excludeId = null, CancellationToken ct = default);

    /// <summary>迴圈防護：<paramref name="path"/> 是否已經是某一筆轉址的 <c>FromPath</c>。</summary>
    Task<bool> IsUsedAsFromPathAsync(string path, int? excludeId = null, CancellationToken ct = default);

    /// <summary>批次版本，供 CSV 匯入一次檢查全部候選 <c>FromPath</c>，避免逐列打 DB。</summary>
    Task<HashSet<string>> GetExistingFromPathsAsync(CancellationToken ct = default);

    Task<bool> ContentItemExistsAsync(int id, CancellationToken ct = default);
}

/// <inheritdoc cref="IRedirectReadService"/>
public sealed class RedirectReadService(ISqlConnectionFactory factory) : IRedirectReadService
{
    private const string SelectColumns = """
        SELECT r.Id, r.FromPath, r.ToPath, r.ToContentItemId, r.StatusCode,
               r.IsActive, r.Source, r.IsVerified, r.CreatedAt
        FROM Redirects r
        """;

    public async Task<(IReadOnlyList<RedirectDto> Items, int TotalCount)> ListAsync(
        string? keyword, bool? isActive, byte? source, string? sortBy, bool sortDescending,
        int page, int pageSize, CancellationToken ct = default)
    {
        using var connection = factory.Create();

        var conditions = new List<string>();
        var parameters = new DynamicParameters();
        if (!string.IsNullOrWhiteSpace(keyword))
        {
            conditions.Add("(r.FromPath LIKE @Keyword OR r.ToPath LIKE @Keyword)");
            parameters.Add("Keyword", $"%{keyword}%");
        }
        if (isActive is not null) { conditions.Add("r.IsActive = @IsActive"); parameters.Add("IsActive", isActive); }
        if (source is not null) { conditions.Add("r.Source = @Source"); parameters.Add("Source", source); }
        var where = conditions.Count > 0 ? $"WHERE {string.Join(" AND ", conditions)}" : "";

        // 🔴 排序欄位是**白名單映射**，不是把參數接進 SQL。這裡的字串會直接進查詢，
        //    接受任意輸入就是 SQL injection。
        var orderColumn = sortBy?.ToLowerInvariant() switch
        {
            "frompath" => "r.FromPath",
            _ => "r.Id",
        };
        var orderDirection = sortDescending ? "DESC" : "ASC";

        var countSql = $"SELECT COUNT(*) FROM Redirects r {where}";
        var totalCount = await connection.ExecuteScalarAsync<int>(
            new CommandDefinition(countSql, parameters, cancellationToken: ct));

        parameters.Add("Offset", (page - 1) * pageSize);
        parameters.Add("PageSize", pageSize);

        var pageSql = $"""
            {SelectColumns}
            {where}
            ORDER BY {orderColumn} {orderDirection}
            OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
            """;

        var items = await connection.QueryAsync<RedirectDto>(
            new CommandDefinition(pageSql, parameters, cancellationToken: ct));

        return (items.AsList(), totalCount);
    }

    public async Task<RedirectStatsDto> StatsAsync(CancellationToken ct = default)
    {
        using var connection = factory.Create();
        const string sql = """
            SELECT COUNT(*)                                        AS TotalCount,
                   SUM(CASE WHEN IsActive = 1   THEN 1 ELSE 0 END) AS ActiveCount,
                   SUM(CASE WHEN IsVerified = 1 THEN 1 ELSE 0 END) AS VerifiedCount,
                   SUM(CASE WHEN Source = 1     THEN 1 ELSE 0 END) AS MigrationCount,
                   SUM(CASE WHEN Source = 2     THEN 1 ELSE 0 END) AS ManualCount,
                   SUM(CASE WHEN Source = 3     THEN 1 ELSE 0 END) AS SystemCount
            FROM Redirects
            """;
        return await connection.QuerySingleAsync<RedirectStatsDto>(new CommandDefinition(sql, cancellationToken: ct));
    }

    public async Task<IReadOnlyList<RedirectDto>> ListAllAsync(CancellationToken ct = default)
    {
        using var connection = factory.Create();
        var sql = $"{SelectColumns} ORDER BY r.FromPath";
        var items = await connection.QueryAsync<RedirectDto>(
            new CommandDefinition(sql, cancellationToken: ct));
        return items.AsList();
    }

    public async Task<bool> FromPathExistsAsync(string fromPath, int? excludeId = null, CancellationToken ct = default)
    {
        using var connection = factory.Create();
        const string sql = """
            SELECT CASE WHEN EXISTS (
                SELECT 1 FROM Redirects
                WHERE FromPath = @FromPath AND (@ExcludeId IS NULL OR Id <> @ExcludeId)
            ) THEN 1 ELSE 0 END
            """;
        return await connection.ExecuteScalarAsync<bool>(
            new CommandDefinition(sql, new { FromPath = fromPath, ExcludeId = excludeId }, cancellationToken: ct));
    }

    public async Task<bool> IsUsedAsFromPathAsync(string path, int? excludeId = null, CancellationToken ct = default)
        => await FromPathExistsAsync(path, excludeId, ct);

    public async Task<HashSet<string>> GetExistingFromPathsAsync(CancellationToken ct = default)
    {
        using var connection = factory.Create();
        var paths = await connection.QueryAsync<string>(
            new CommandDefinition("SELECT FromPath FROM Redirects", cancellationToken: ct));
        return new HashSet<string>(paths, StringComparer.Ordinal);
    }

    public async Task<bool> ContentItemExistsAsync(int id, CancellationToken ct = default)
    {
        using var connection = factory.Create();
        const string sql = "SELECT CASE WHEN EXISTS (SELECT 1 FROM ContentItems WHERE Id = @Id) THEN 1 ELSE 0 END";
        return await connection.ExecuteScalarAsync<bool>(new CommandDefinition(sql, new { Id = id }, cancellationToken: ct));
    }
}
