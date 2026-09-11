using Dapper;
using Skin20.Api.Data;
using Skin20.Api.Models.Dtos;

namespace Skin20.Api.Services.Dapper;

/// <summary>
/// 媒體庫的讀取路徑（docs/11 §6.3）。純讀取，不含任何寫入。
/// <para>
/// ⚠️ 不透過 DI 容器注入到 Handler——本專案的 composition root（<c>Program.cs</c>）不可碰，
/// 且 <c>ISqlConnectionFactory</c> 已是 Singleton，由 <c>MediaHandler</c> 建構時直接
/// <c>new</c> 出本類別即可，不需要額外的 DI 註冊。
/// </para>
/// </summary>
public sealed class MediaReadService(ISqlConnectionFactory factory)
{
    private const string ListSelect = """
        SELECT
            m.Id, m.ContainerName, m.BlobPath, m.PublicUrl, m.OriginalFileName, m.ContentType,
            m.ByteSize, m.Width, m.Height, m.AltText, m.Caption, m.IsPrivate, m.CreatedAt,
            ISNULL(u.UsageCount, 0) AS UsageCount
        FROM MediaAssets m
        LEFT JOIN (
            SELECT MediaId, COUNT(*) AS UsageCount FROM MediaUsages GROUP BY MediaId
        ) u ON u.MediaId = m.Id
        """;

    public async Task<(IReadOnlyList<MediaListItemDto> Items, int TotalCount)> ListAsync(
        int page, int pageSize, bool? isPrivate, CancellationToken ct)
    {
        using var connection = factory.Create();

        const string where = "WHERE (@IsPrivate IS NULL OR m.IsPrivate = @IsPrivate)";

        var countSql = $"SELECT COUNT(*) FROM MediaAssets m {where}";
        var pageSql = $"""
            {ListSelect}
            {where}
            ORDER BY m.CreatedAt DESC
            OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
            """;

        var args = new { IsPrivate = isPrivate, Offset = (page - 1) * pageSize, PageSize = pageSize };

        var totalCount = await connection.ExecuteScalarAsync<int>(
            new CommandDefinition(countSql, args, cancellationToken: ct));

        var rows = await connection.QueryAsync<MediaListItemDto>(
            new CommandDefinition(pageSql, args, cancellationToken: ct));

        return (rows.AsList(), totalCount);
    }

    public async Task<MediaListItemDto?> GetByIdAsync(int id, CancellationToken ct)
    {
        using var connection = factory.Create();
        return await connection.QuerySingleOrDefaultAsync<MediaListItemDto>(
            new CommandDefinition($"{ListSelect} WHERE m.Id = @Id", new { Id = id }, cancellationToken: ct));
    }

    public async Task<MediaListItemDto?> GetByHashAsync(string contentHash, CancellationToken ct)
    {
        using var connection = factory.Create();
        const string sql = """
            SELECT m.Id FROM MediaAssets m WHERE m.ContentHash = @ContentHash
            """;
        var id = await connection.QuerySingleOrDefaultAsync<int?>(
            new CommandDefinition(sql, new { ContentHash = contentHash }, cancellationToken: ct));

        return id is null ? null : await GetByIdAsync(id.Value, ct);
    }

    /// <summary>刪除前的引用清單（docs/11 §9：「回 409 並說明在哪幾筆內容用到」）。</summary>
    public async Task<IReadOnlyList<MediaUsageRefDto>> GetUsagesAsync(int mediaId, CancellationToken ct)
    {
        using var connection = factory.Create();
        const string sql = """
            SELECT ci.Id AS ContentItemId, ci.Title, ci.UrlPath, ci.ContentType, mu.UsageKind
            FROM MediaUsages mu
            INNER JOIN ContentItems ci ON ci.Id = mu.ContentItemId
            WHERE mu.MediaId = @MediaId
            ORDER BY ci.Title
            """;

        var rows = await connection.QueryAsync<MediaUsageRefDto>(
            new CommandDefinition(sql, new { MediaId = mediaId }, cancellationToken: ct));

        return rows.AsList();
    }
}
