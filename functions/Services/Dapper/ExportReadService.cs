using Dapper;
using Skin20.Api.Common;
using Skin20.Api.Data;

namespace Skin20.Api.Services.Dapper;

/// <summary>已發布 FAQ 一列，語料來源是 <c>AiAnswer</c>（docs/04-ai-faq.md §2），不是 <c>WebAnswer</c>。</summary>
public sealed record PublishedFaqRow(
    string Question, string AiAnswer, DateOnly LastReviewedOn, string CategoryTitle, string? CategorySlug);

/// <summary>用於 <c>llms.txt</c> 預覽的頁面索引一列。</summary>
public sealed record SitemapEntryRow(byte ContentType, string Title, string UrlPath);

/// <summary>
/// FAQ／語料匯出預覽的讀取路徑（docs/10-api.md §3.4、docs/04-ai-faq.md §3）。
///
/// <para>
/// ⚠️ <b>只讀已發布內容</b>——用 <see cref="Visibility.PublicFilter"/>，因為這是「建置期腳本
/// 實際會輸出什麼」的預覽，草稿不該出現在這裡（docs/11 §6.4：可見性判定式只有一份）。
/// </para>
/// </summary>
public interface IExportReadService
{
    Task<IReadOnlyList<PublishedFaqRow>> GetPublishedFaqsAsync(CancellationToken ct = default);

    /// <summary>
    /// <c>llms.txt</c>（docs/03-seo-geo.md §4 ④：核心資訊與重要頁面索引）用的精簡站台地圖。
    /// 條件與 sitemap 分檔完全相同：<c>IncludeInSitemap ＋ 可見性 ＋ UrlPath IS NOT NULL</c>
    /// （docs/08 §H 末段）。
    /// </summary>
    Task<IReadOnlyList<SitemapEntryRow>> GetSitemapIndexAsync(CancellationToken ct = default);
}

/// <inheritdoc cref="IExportReadService"/>
public sealed class ExportReadService(ISqlConnectionFactory factory) : IExportReadService
{
    public async Task<IReadOnlyList<PublishedFaqRow>> GetPublishedFaqsAsync(CancellationToken ct = default)
    {
        using var connection = factory.Create();

        var sql = $"""
            SELECT ci.Title AS Question, f.AiAnswer, f.LastReviewedOn,
                   catCi.Title AS CategoryTitle, catCi.Slug AS CategorySlug
            FROM ContentItems ci
            INNER JOIN Faqs f ON f.Id = ci.Id
            INNER JOIN ContentItems catCi ON catCi.Id = f.CategoryTermId
            WHERE {Visibility.PublicFilter}
            ORDER BY catCi.SortOrder, ci.SortOrder
            """;

        var items = await connection.QueryAsync<PublishedFaqRow>(
            new CommandDefinition(sql, new { Now = Clock.UtcNow }, cancellationToken: ct));
        return items.AsList();
    }

    public async Task<IReadOnlyList<SitemapEntryRow>> GetSitemapIndexAsync(CancellationToken ct = default)
    {
        using var connection = factory.Create();

        var sql = $"""
            SELECT ci.ContentType, ci.Title, ci.UrlPath
            FROM ContentItems ci
            WHERE {Visibility.PublicFilter} AND ci.IncludeInSitemap = 1 AND ci.UrlPath IS NOT NULL
            ORDER BY ci.ContentType, ci.SortOrder
            """;

        var items = await connection.QueryAsync<SitemapEntryRow>(
            new CommandDefinition(sql, new { Now = Clock.UtcNow }, cancellationToken: ct));
        return items.AsList();
    }
}
