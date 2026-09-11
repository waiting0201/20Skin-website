using Dapper;
using Skin20.Api.Data;
using Skin20.Api.Models.Dtos;

namespace Skin20.Api.Services.Dapper;

/// <summary>
/// 首頁版位編排的讀取路徑（docs/08 §G-2、docs/11 §6.3）。純讀取，不含任何寫入。
/// <para>由 <c>HomeSectionHandler</c> 建構時直接 <c>new</c> 出來，不經 DI 容器註冊。</para>
/// </summary>
public sealed class HomeSectionReadService(ISqlConnectionFactory factory)
{
    public async Task<IReadOnlyList<HomeSectionDto>> GetAllAsync(CancellationToken ct)
    {
        using var connection = factory.Create();

        const string sectionSql = """
            SELECT Id, SectionKey, Title, Subtitle, IsEnabled, SortOrder, Settings
            FROM HomeSections
            ORDER BY SortOrder
            """;

        const string itemSql = """
            SELECT
                hi.Id, hi.HomeSectionId, hi.ContentItemId,
                ci.Title AS ContentTitle, ci.UrlPath AS ContentUrlPath, ci.ContentType,
                hi.SortOrder
            FROM HomeSectionItems hi
            INNER JOIN ContentItems ci ON ci.Id = hi.ContentItemId
            ORDER BY hi.HomeSectionId, hi.SortOrder
            """;

        var sections = (await connection.QueryAsync<SectionRow>(
            new CommandDefinition(sectionSql, cancellationToken: ct))).AsList();

        var items = (await connection.QueryAsync<ItemRow>(
            new CommandDefinition(itemSql, cancellationToken: ct))).AsList();

        var itemsBySection = items
            .GroupBy(i => i.HomeSectionId)
            .ToDictionary(g => g.Key, g => (IReadOnlyList<HomeSectionItemDto>)g
                .Select(i => new HomeSectionItemDto(
                    i.Id, i.ContentItemId, i.ContentTitle, i.ContentUrlPath, i.ContentType, i.SortOrder))
                .ToList());

        return sections
            .Select(s => new HomeSectionDto(
                s.Id, s.SectionKey, s.Title, s.Subtitle, s.IsEnabled, s.SortOrder, s.Settings,
                itemsBySection.TryGetValue(s.Id, out var sectionItems) ? sectionItems : []))
            .ToList();
    }

    /// <summary>批次檢查 <c>ContentItemId</c> 是否存在，供版位更新前驗證引用有效（docs/08 §G-2）。</summary>
    public async Task<HashSet<int>> FilterExistingContentItemIdsAsync(IEnumerable<int> ids, CancellationToken ct)
    {
        var distinctIds = ids.Distinct().ToArray();
        if (distinctIds.Length == 0) return [];

        using var connection = factory.Create();
        const string sql = "SELECT Id FROM ContentItems WHERE Id IN @Ids";

        var found = await connection.QueryAsync<int>(
            new CommandDefinition(sql, new { Ids = distinctIds }, cancellationToken: ct));

        return [.. found];
    }

    private sealed record SectionRow(
        int Id, string SectionKey, string Title, string? Subtitle, bool IsEnabled, int SortOrder, string? Settings);

    private sealed record ItemRow(
        int Id, int HomeSectionId, int ContentItemId, string ContentTitle, string? ContentUrlPath,
        byte ContentType, int SortOrder);
}
