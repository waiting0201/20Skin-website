using Dapper;
using Skin20.Api.Common;
using Skin20.Api.Data;
using Skin20.Api.Models.Entities;

namespace Skin20.Api.Services.Dapper;

/// <summary>後台清單一列的原始查詢結果（docs/11-backend-design.md §6.3）。</summary>
public sealed record ContentListRow(
    int Id,
    string Title,
    string? Slug,
    string? UrlPath,
    byte Status,
    DateTime? PublishAt,
    DateTime? UnpublishAt,
    int SortOrder,
    bool IncludeInSitemap,
    bool IsSystemLocked,
    int? OwnerUserId,
    DateTime UpdatedAt,
    int? CategoryTermId,
    string? CategoryTitle);

/// <summary>版本清單一列。</summary>
public sealed record VersionListRow(int Id, int VersionNo, string Title, string? Note, int? CreatedByUserId, DateTime CreatedAt);

/// <summary>單一版本（含 Snapshot 全文）。</summary>
public sealed record VersionSnapshotRow(int Id, int VersionNo, string Title, string? Note, int? CreatedByUserId, DateTime CreatedAt, string Snapshot);

/// <summary>
/// 九個內容單元共用的後台清單／版本查詢（docs/11-backend-design.md §6.3、§11 分層鐵律）。
///
/// <para>
/// ⚠️ <b>不透過 DI 註冊</b>——本專案的 Handler 一律用建構子注入既有的 <see cref="ISqlConnectionFactory"/>
/// 自行 <c>new</c> 這個類別（見 <c>Handlers/ContentHandler.cs</c>）。新增 DI 註冊需要動
/// <c>Program.cs</c>，不在這次工作範圍內；而這個類別本身無狀態、建構成本可忽略，
/// 不透過 DI 容器管理生命週期並不影響正確性。
/// </para>
/// <para>
/// ⚠️ <see cref="UnitTables"/> 的表名／欄名是<b>寫死在程式碼裡的白名單常數</b>，不是使用者輸入
/// ——以字串插值組出 <c>FROM {table}</c> 這類片段並不違反「完全參數化」的規則，真正的使用者輸入
/// （<c>keyword</c>／<c>status</c>／<c>categoryTermId</c>／分頁）一律走 Dapper 參數。
/// </para>
/// </summary>
public sealed class ContentReadService(ISqlConnectionFactory factory)
{
    /// <summary>單元代號 → (TPT 子表名稱, 分類欄位名稱或 null)。docs/08 §C 逐一對應。</summary>
    private static readonly Dictionary<string, (string Table, string? CategoryColumn)> UnitTables = new()
    {
        [UnitCodes.Treatment] = ("Treatments", "CategoryTermId"),
        [UnitCodes.Doctor] = ("Doctors", null),
        [UnitCodes.Concern] = ("Concerns", null),
        [UnitCodes.Article] = ("Articles", "CategoryTermId"),
        [UnitCodes.Case] = ("Cases", null),
        [UnitCodes.Faq] = ("Faqs", "CategoryTermId"),
        [UnitCodes.Clinic] = ("Clinics", null),
        [UnitCodes.Page] = ("Pages", null),
        [UnitCodes.Term] = ("Terms", null),
    };

    /// <summary>
    /// 後台清單（<c>GET /admin/{unit}</c>）。分頁一律 <c>OFFSET/FETCH</c> ＋ 另跑 <c>COUNT(*)</c>，
    /// 關鍵字在 SQL 層以 <c>LIKE</c> 過濾（docs/10 §2）。
    /// </summary>
    public async Task<(IReadOnlyList<ContentListRow> Items, int TotalCount)> ListAsync(
        string unit, ContentType contentType, int page, int pageSize,
        byte? status, int? categoryTermId, string? keyword, int? ownerUserId,
        CancellationToken ct = default)
    {
        if (!UnitTables.TryGetValue(unit, out var meta))
            throw AppException.BadRequest(ErrorCodes.ValidationFormat, $"未知的內容單元：{unit}");

        var hasCategory = meta.CategoryColumn is not null;
        var categorySelect = hasCategory ? $"u.[{meta.CategoryColumn}]" : "CAST(NULL AS int)";
        // ⚠️ 分類的標題在 **ContentItems**，不是在 Terms —— Terms 是 TPT 子表，
        //    共通欄位（Title／Slug／UrlPath／Status）一律不在子表重複。
        //    join Terms 再讀 term.Title 會是「Invalid column name 'Title'」。
        //    TPT 下 Terms.Id 就是 ContentItems.Id，所以直接 join 父表。
        var categoryJoin = hasCategory ? "LEFT JOIN ContentItems term ON term.Id = u.[" + meta.CategoryColumn + "]" : "";
        // ⚠️ 沒有分類欄位的單元（term／page）不會有 term 這個別名 ——
        //    SELECT 裡若仍寫 term.Title 會是「multi-part identifier could not be bound」。
        var categoryTitleSelect = hasCategory ? "term.Title" : "CAST(NULL AS nvarchar(200))";
        var categoryFilter = hasCategory
            ? $"(@CategoryTermId IS NULL OR u.[{meta.CategoryColumn}] = @CategoryTermId)"
            : "(1 = 1)";

        var sql = $"""
            SELECT ci.Id, ci.Title, ci.Slug, ci.UrlPath, ci.Status, ci.PublishAt, ci.UnpublishAt,
                   ci.SortOrder, ci.IncludeInSitemap, ci.IsSystemLocked, ci.OwnerUserId, ci.UpdatedAt,
                   {categorySelect} AS CategoryTermId, {categoryTitleSelect} AS CategoryTitle
            FROM ContentItems ci
            INNER JOIN {meta.Table} u ON u.Id = ci.Id
            {categoryJoin}
            WHERE ci.ContentType = @ContentType
              AND (@Status IS NULL OR ci.Status = @Status)
              AND {categoryFilter}
              AND (@OwnerUserId IS NULL OR ci.OwnerUserId = @OwnerUserId)
              AND (@Keyword IS NULL OR ci.Title LIKE @KeywordPattern ESCAPE '\')
            ORDER BY ci.SortOrder, ci.Id
            OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;

            SELECT COUNT(*)
            FROM ContentItems ci
            INNER JOIN {meta.Table} u ON u.Id = ci.Id
            WHERE ci.ContentType = @ContentType
              AND (@Status IS NULL OR ci.Status = @Status)
              AND {categoryFilter}
              AND (@OwnerUserId IS NULL OR ci.OwnerUserId = @OwnerUserId)
              AND (@Keyword IS NULL OR ci.Title LIKE @KeywordPattern ESCAPE '\');
            """;

        var args = new
        {
            ContentType = (byte)contentType,
            Status = status,
            CategoryTermId = categoryTermId,
            OwnerUserId = ownerUserId,
            Keyword = keyword,
            KeywordPattern = keyword is null ? null : $"%{EscapeLike(keyword)}%",
            Offset = (page - 1) * pageSize,
            PageSize = pageSize,
        };

        using var conn = factory.Create();
        var command = new CommandDefinition(sql, args, cancellationToken: ct);
        using var multi = await conn.QueryMultipleAsync(command);
        var items = (await multi.ReadAsync<ContentListRow>()).ToList();
        var total = await multi.ReadSingleAsync<int>();
        return (items, total);
    }

    /// <summary><c>GET /admin/{unit}/{id}/versions</c>：分頁的版本清單，依 VersionNo 遞減。</summary>
    public async Task<(IReadOnlyList<VersionListRow> Items, int TotalCount)> ListVersionsAsync(
        int contentItemId, int page, int pageSize, CancellationToken ct = default)
    {
        const string sql = """
            SELECT Id, VersionNo, Title, Note, CreatedByUserId, CreatedAt
            FROM ContentVersions
            WHERE ContentItemId = @ContentItemId
            ORDER BY VersionNo DESC
            OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;

            SELECT COUNT(*) FROM ContentVersions WHERE ContentItemId = @ContentItemId;
            """;

        using var conn = factory.Create();
        var command = new CommandDefinition(
            sql,
            new { ContentItemId = contentItemId, Offset = (page - 1) * pageSize, PageSize = pageSize },
            cancellationToken: ct);
        using var multi = await conn.QueryMultipleAsync(command);
        var items = (await multi.ReadAsync<VersionListRow>()).ToList();
        var total = await multi.ReadSingleAsync<int>();
        return (items, total);
    }

    /// <summary><c>GET /admin/{unit}/{id}/versions/{no}</c>：單一版本（含完整 Snapshot JSON）。</summary>
    public async Task<VersionSnapshotRow?> GetVersionAsync(int contentItemId, int versionNo, CancellationToken ct = default)
    {
        const string sql = """
            SELECT Id, VersionNo, Title, Note, CreatedByUserId, CreatedAt, Snapshot
            FROM ContentVersions
            WHERE ContentItemId = @ContentItemId AND VersionNo = @VersionNo;
            """;

        using var conn = factory.Create();
        var command = new CommandDefinition(
            sql, new { ContentItemId = contentItemId, VersionNo = versionNo }, cancellationToken: ct);
        return await conn.QuerySingleOrDefaultAsync<VersionSnapshotRow>(command);
    }

    /// <summary>單筆內容目前的引用計數（docs/10 §3.3：term 刪除前回報 usageCount）。</summary>
    public async Task<int> CountReferencesAsync(int contentItemId, CancellationToken ct = default)
    {
        const string sql = """
            SELECT
                (SELECT COUNT(*) FROM Treatments WHERE CategoryTermId = @Id) +
                (SELECT COUNT(*) FROM Articles   WHERE CategoryTermId = @Id) +
                (SELECT COUNT(*) FROM Faqs       WHERE CategoryTermId = @Id) +
                (SELECT COUNT(*) FROM ContentRelations WHERE ToContentItemId = @Id OR FromContentItemId = @Id);
            """;

        using var conn = factory.Create();
        var command = new CommandDefinition(sql, new { Id = contentItemId }, cancellationToken: ct);
        return await conn.QuerySingleAsync<int>(command);
    }

    /// <summary>LIKE 萬用字元逸出（<c>%</c>／<c>_</c>／<c>[</c>），關鍵字才不會被使用者輸入的萬用字元誤導。</summary>
    private static string EscapeLike(string value)
        => value.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_").Replace("[", "\\[");
}
