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
    string? CategoryTitle,
    /// <summary>只有 <c>term</c> 有值（其餘單元為 <c>null</c>）。算法與 <c>CountReferencesAsync</c> 一致。</summary>
    int? UsageCount,
    /// <summary>
    /// 逐單元的清單顯示欄位，JSON 物件字串（見 <c>ListExtras</c>）。沒有額外欄位的單元為 <c>null</c>。
    /// </summary>
    string? Extras);

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
        byte? termType = null,
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

        // 「分類與標籤」的型別篩選（2026-09-17）。
        // 🔴 **只有 term 這個單元有 TermType 欄位**——其餘八個單元的 u 別名指向
        //    Treatments／Articles…，寫進去會是「Invalid column name 'TermType'」，
        //    而那是執行期錯誤，編譯與 typecheck 都攔不到。
        // ⚠️ 為什麼需要它：term 一張表混了四種東西，實測 406 筆裡有 393 筆是文章標籤，
        //    而 ORDER BY SortOrder, Id 之下四個療程分類落在第 20–21 頁（共 21 頁）。
        //    沒有這個篩選等於「要維護療程分類只能靠關鍵字猜名字」。
        var termTypeFilter = unit == UnitCodes.Term
            ? "(@TermType IS NULL OR u.TermType = @TermType)"
            : "(1 = 1)";

        // 分類與標籤的「使用筆數」：後台清單要顯示它，刪除也靠它擋（docs/10 §3.3 —— 仍有引用回 409）。
        // ⚠️ 只有 term 才算。這是四個相關子查詢，對其餘八個單元（文章有約 800 筆）
        //    是白費的成本，而它們的畫面上根本沒有這一欄。
        // ⚠️ 算法必須與 CountReferencesAsync 一致 —— 清單顯示「0 筆」但刪除被擋下，
        //    使用者只會覺得後台壞了。改一邊就要改另一邊。
        // 後台清單每個單元各自要顯示的子表欄位（職稱、地址、看診日期…）。
        //
        // ⚠️ 這裡刻意<b>不是</b>「把整筆詳情撈出來」：清單一頁 20 列，撈詳情等於 20 份
        //    內文與圖片欄位。只取畫面上那幾欄，用 FOR JSON 收成一個 nvarchar，
        //    Handler 那頭再展開成 fields 字典。
        // ⚠️ 鍵名必須與 apps/admin/src/units/*.ts 的 listColumns 逐字相同 ——
        //    對不上不會有錯誤訊息，只會在清單上留下一片空白欄。
        // ⚠️ INCLUDE_NULL_VALUES 不可省：預設 FOR JSON 會把 null 的屬性整個拿掉，
        //    前端就分不出「沒有這一欄」與「這一欄是空的」。
        var (extraColumns, extraJoin) = ListExtras(unit);
        var extrasSelect = extraColumns is null
            ? "CAST(NULL AS nvarchar(max))"
            : $"(SELECT {extraColumns} FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES)";

        var usageCountSelect = unit == UnitCodes.Term
            ? """
              ((SELECT COUNT(*) FROM Treatments WHERE CategoryTermId = ci.Id) +
               (SELECT COUNT(*) FROM Articles   WHERE CategoryTermId = ci.Id) +
               (SELECT COUNT(*) FROM Faqs       WHERE CategoryTermId = ci.Id) +
               (SELECT COUNT(*) FROM ContentRelations WHERE ToContentItemId = ci.Id OR FromContentItemId = ci.Id))
              """
            : "CAST(NULL AS int)";

        var sql = $"""
            SELECT ci.Id, ci.Title, ci.Slug, ci.UrlPath, ci.Status, ci.PublishAt, ci.UnpublishAt,
                   ci.SortOrder, ci.IncludeInSitemap, ci.IsSystemLocked, ci.OwnerUserId, ci.UpdatedAt,
                   {categorySelect} AS CategoryTermId, {categoryTitleSelect} AS CategoryTitle,
                   {usageCountSelect} AS UsageCount, {extrasSelect} AS Extras
            FROM ContentItems ci
            INNER JOIN {meta.Table} u ON u.Id = ci.Id
            {categoryJoin}
            {extraJoin}
            WHERE ci.ContentType = @ContentType
              AND (@Status IS NULL OR ci.Status = @Status)
              AND {categoryFilter}
              AND {termTypeFilter}
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
              AND {termTypeFilter}
              AND (@OwnerUserId IS NULL OR ci.OwnerUserId = @OwnerUserId)
              AND (@Keyword IS NULL OR ci.Title LIKE @KeywordPattern ESCAPE '\');
            """;

        var args = new
        {
            ContentType = (byte)contentType,
            Status = status,
            CategoryTermId = categoryTermId,
            TermType = termType,
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

    /// <summary>
    /// 逐單元的清單顯示欄位。回傳 <c>(SELECT 片段, 額外 JOIN)</c>；<c>null</c> 代表這個單元
    /// 除了共同欄位以外沒有要多顯示的東西。
    ///
    /// <para>
    /// 🔴 <b>這些字串直接進 SQL，所以它們必須全部是這裡寫死的常數</b> —— 不可以接受任何
    /// 來自請求的值。<c>unit</c> 本身在進到這裡之前已經被 <c>UnitTables</c> 的白名單擋過一次。
    /// </para>
    /// <para>
    /// ⚠️ 分類名稱不在這裡 —— 它是<b>共同</b>欄位（<c>CategoryTitle</c>），三個有分類的單元共用。
    /// </para>
    /// </summary>
    private static (string? Columns, string Join) ListExtras(string unit) => unit switch
    {
        UnitCodes.Doctor => ("u.JobTitle AS jobTitle, u.IsPhysician AS isPhysician", ""),
        UnitCodes.Article => ("u.DisplayDate AS displayDate", ""),
        // 案例清單顯示的是療程「名稱」，不是 TreatmentId。名稱在 ContentItems（TPT 父表），
        // 所以 join 的是 ContentItems 而不是 Treatments。
        UnitCodes.Case => ("tci.Title AS treatmentTitle", "LEFT JOIN ContentItems tci ON tci.Id = u.TreatmentId"),
        UnitCodes.Faq => ("u.LastReviewedOn AS lastReviewedOn", ""),
        UnitCodes.Clinic => ("u.Address AS address, u.Phone AS phone", ""),
        UnitCodes.Page => ("u.PageKind AS pageKind, u.SystemKey AS systemKey", ""),
        UnitCodes.Term => ("u.TermType AS termType", ""),
        _ => (null, ""),
    };

    /// <summary>LIKE 萬用字元逸出（<c>%</c>／<c>_</c>／<c>[</c>），關鍵字才不會被使用者輸入的萬用字元誤導。</summary>
    private static string EscapeLike(string value)
        => value.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_").Replace("[", "\\[");
}
