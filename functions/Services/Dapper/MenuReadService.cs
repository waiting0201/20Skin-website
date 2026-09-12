using Dapper;
using Skin20.Api.Data;
using Skin20.Api.Models.Dtos;
using Skin20.Api.Models.Entities;

namespace Skin20.Api.Services.Dapper;

/// <summary>
/// 導覽選單與頁尾的讀取路徑（docs/08 §G-3、docs/11 §6.3）。純讀取，不含任何寫入。
/// <para>由 <c>MenuHandler</c> 建構時直接 <c>new</c> 出來，不經 DI 容器註冊。</para>
/// </summary>
public sealed class MenuReadService(ISqlConnectionFactory factory)
{
    private const string MenuKeyMain = "main";
    private const string MenuKeyFooter = "footer";

    public async Task<MenuTreeDto> GetTreeAsync(CancellationToken ct)
    {
        using var connection = factory.Create();

        const string sql = """
            SELECT m.Id, m.MenuKey, m.ParentId, m.Depth, m.Label, m.LinkKind, m.ContentItemId, m.Url,
                   m.IsExternal, m.RelAttr, m.OpenInNewTab, m.SortOrder,
                   ci.ContentType, ci.Title AS ContentTitle
            FROM MenuItems m
            LEFT JOIN ContentItems ci ON ci.Id = m.ContentItemId
            ORDER BY m.MenuKey, m.ParentId, m.SortOrder
            """;

        var rows = (await connection.QueryAsync<Row>(new CommandDefinition(sql, cancellationToken: ct))).AsList();

        return new MenuTreeDto(
            BuildTree(rows, MenuKeyMain),
            BuildTree(rows, MenuKeyFooter));
    }

    private static List<MenuNodeDto> BuildTree(IReadOnlyList<Row> rows, string menuKey)
    {
        var scoped = rows.Where(r => r.MenuKey == menuKey).ToList();

        List<MenuNodeDto> BuildChildren(int? parentId) => scoped
            .Where(r => r.ParentId == parentId)
            .OrderBy(r => r.SortOrder)
            .Select(r => new MenuNodeDto(
                r.Id, r.Label, (MenuLinkKind)r.LinkKind, r.ContentItemId, r.Url, r.RelAttr, r.OpenInNewTab,
                BuildChildren(r.Id), r.ContentType, r.ContentTitle))
            .ToList();

        return BuildChildren(null);
    }

    /// <summary>批次檢查 <c>ContentItemId</c> 是否存在，供選單更新前驗證引用有效。</summary>
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

    private sealed record Row(
        int Id, string MenuKey, int? ParentId, byte Depth, string Label, byte LinkKind,
        int? ContentItemId, string? Url, bool IsExternal, string? RelAttr, bool OpenInNewTab, int SortOrder,
        byte? ContentType, string? ContentTitle);
}
