using Dapper;
using Skin20.Api.Data;
using Skin20.Api.Models.Dtos;
using Skin20.Api.Models.Entities;

namespace Skin20.Api.Services.Dapper;

/// <summary>
/// FAQ 題庫成長清單的讀取路徑（docs/08-database.md §F）。
/// 🔴 <c>QuestionInbox</c> 是工作清單不是搜尋日誌——本檔案不查詢、不輸出 IP／session。
/// </summary>
public interface IQuestionReadService
{
    Task<(IReadOnlyList<QuestionListItemDto> Items, int TotalCount)> ListAsync(
        byte? status, string? keyword, int page, int pageSize, CancellationToken ct = default);

    /// <summary>建題時用來驗證 <c>LinkedFaqContentItemId</c> 真的指向一則 FAQ。</summary>
    Task<bool> IsFaqContentItemAsync(int contentItemId, CancellationToken ct = default);
}

/// <inheritdoc cref="IQuestionReadService"/>
public sealed class QuestionReadService(ISqlConnectionFactory factory) : IQuestionReadService
{
    public async Task<(IReadOnlyList<QuestionListItemDto> Items, int TotalCount)> ListAsync(
        byte? status, string? keyword, int page, int pageSize, CancellationToken ct = default)
    {
        using var connection = factory.Create();

        var conditions = new List<string>();
        var parameters = new DynamicParameters();
        if (status is not null) { conditions.Add("q.Status = @Status"); parameters.Add("Status", status); }
        if (!string.IsNullOrWhiteSpace(keyword))
        {
            conditions.Add("q.QuestionText LIKE @Keyword");
            parameters.Add("Keyword", $"%{keyword}%");
        }
        var where = conditions.Count > 0 ? $"WHERE {string.Join(" AND ", conditions)}" : "";

        var totalCount = await connection.ExecuteScalarAsync<int>(
            new CommandDefinition($"SELECT COUNT(*) FROM QuestionInbox q {where}", parameters, cancellationToken: ct));

        parameters.Add("Offset", (page - 1) * pageSize);
        parameters.Add("PageSize", pageSize);

        // 待處理優先、依熱度排序，對齊 IX_QuestionInbox_Status_HitCount（docs/08 §F）。
        // 關聯的 FAQ 標題／處理者姓名在同一支查詢用 LEFT JOIN 取回，避免 N+1（docs/11 §6.3）。
        var sql = $"""
            SELECT q.Id, q.QuestionText, q.Source, q.HitCount, q.FirstSeenAt, q.LastSeenAt, q.Status,
                   q.LinkedFaqContentItemId, faqCi.Title AS LinkedFaqTitle,
                   q.HandledByUserId, u.DisplayName AS HandledByUserName, q.HandledAt
            FROM QuestionInbox q
            LEFT JOIN ContentItems faqCi ON faqCi.Id = q.LinkedFaqContentItemId
            LEFT JOIN Users u ON u.Id = q.HandledByUserId
            {where}
            ORDER BY q.Status ASC, q.HitCount DESC, q.LastSeenAt DESC
            OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
            """;

        var items = await connection.QueryAsync<QuestionListItemDto>(
            new CommandDefinition(sql, parameters, cancellationToken: ct));

        return (items.AsList(), totalCount);
    }

    public async Task<bool> IsFaqContentItemAsync(int contentItemId, CancellationToken ct = default)
    {
        using var connection = factory.Create();
        const string sql = """
            SELECT CASE WHEN EXISTS (
                SELECT 1 FROM ContentItems WHERE Id = @Id AND ContentType = @FaqType
            ) THEN 1 ELSE 0 END
            """;
        return await connection.ExecuteScalarAsync<bool>(new CommandDefinition(
            sql, new { Id = contentItemId, FaqType = (byte)ContentType.Faq }, cancellationToken: ct));
    }
}
