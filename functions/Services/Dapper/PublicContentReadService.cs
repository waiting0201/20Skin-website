using Dapper;
using Skin20.Api.Common;
using Skin20.Api.Data;

namespace Skin20.Api.Services.Dapper;

/// <summary>前台可見的一筆內容。<c>Snapshot</c> 是**已核准那一版**的 JSON 全文。</summary>
public sealed record PublicContentRow(
    int Id,
    byte ContentType,
    string? Slug,
    string? UrlPath,
    string Title,
    int SortOrder,
    bool IncludeInSitemap,
    DateTime UpdatedAt,
    string Snapshot);

/// <summary>關聯目標的基本資料，用來補齊快照裡 <c>relations[]</c> 的顯示欄位。</summary>
public sealed record RelationTargetRow(
    int Id, byte ContentType, string? Slug, string? UrlPath, string Title, bool IsVisible);

/// <summary>
/// 前台（SSR）的內容讀取路徑。
///
/// <para>
/// 🔴 <b>2026-09-15 新增：前台改成執行期 SSR 之後才需要這一層。</b>
/// 在那之前前台的內容是建置期由 <c>tools/content-export</c> 以 Dapper 直接讀資料庫、
/// 烤成 <c>apps/web/content/*.json</c>；改成即時算繪之後，同一批資料必須能在
/// <b>請求當下</b>拿得到，於是有了這組公開端點。
/// </para>
///
/// <para>
/// 🔴 <b>讀的是「已核准的版本快照」，不是 <c>ContentItems</c> 的即時欄位。</b>
/// 兩種錯法都是災難：讀即時欄位＝未經審核的編輯直接上線；用 <c>Status = 3</c> 當可見性＝
/// 編輯一個已上線的頁面時那一頁會從網站上消失。可見性一律用
/// <see cref="Visibility.PublicFilter"/>，<b>那段條件全專案只有一份</b>
/// （docs/11 §6.4；它 2026-09-12 真的分岔過，症狀是「列表看得到、點進去 404」）。
/// </para>
///
/// <para>
/// ⚠️ <b>列表不要帶內文。</b> 文章有 1100 篇、內文合計 8.4 MB，
/// 列表把 <c>bodyBlocks</c> 一起送出等於每次翻頁都傳整個語料庫。
/// 剝除由 Handler 負責（它才看得懂快照 JSON），這一層只管把列與快照撈回來。
/// </para>
/// </summary>
public interface IPublicContentReadService
{
    /// <summary>某個單元的全部可見內容。⚠️ 只給小單元用（療程 28、醫師 14、困擾 8…）；
    /// 文章 1100 筆一定要走 <see cref="PageAsync"/>。</summary>
    Task<IReadOnlyList<PublicContentRow>> ListAsync(byte contentType, CancellationToken ct = default);

    /// <summary>分頁版，給文章與標籤這種筆數會長大的單元。</summary>
    Task<(IReadOnlyList<PublicContentRow> Items, int TotalCount)> PageAsync(
        byte contentType, int page, int pageSize, CancellationToken ct = default);

    /// <summary>
    /// 依網址取單筆。前台的路由就是網址，所以這是內頁最直接的查法。
    /// <para>⚠️ <c>UrlPath</c> 上有 filtered unique index（docs/08 §B-1），全站唯一。</para>
    /// </summary>
    Task<PublicContentRow?> GetByPathAsync(string urlPath, CancellationToken ct = default);

    /// <summary>
    /// 關聯目標的基本資料。<b>連未發布的也要撈</b> —— 這樣才分得出「指向草稿」與
    /// 「指向不存在的內容」，前者照樣輸出、由前端決定要不要渲染成連結
    /// （遷移期間有 27 項療程還是草稿，靜默丟掉會讓困擾頁的建議療程整段消失）。
    /// </summary>
    Task<IReadOnlyList<RelationTargetRow>> GetRelationTargetsAsync(
        IReadOnlyCollection<int> ids, CancellationToken ct = default);

    /// <summary>
    /// 依 id 批次取，**含內文**。
    ///
    /// <para>
    /// 🔴 存在的理由是「關聯目標的顯示欄位不只標題」：療程卡片要顯示關聯文章的
    /// 封面圖與日期，而那些欄位不在 <c>relations[]</c> 裡（那裡只有 slug／title／urlPath）。
    /// 文章有 1100 筆，不可能為了 11 筆關聯把整批載回來。
    /// </para>
    ///
    /// <para>
    /// ⚠️ 上限由呼叫端夾住（<c>MaxBatchIds</c>）—— 少了它，<c>?ids=</c> 就是一個
    /// 任何人都打得到的「把整個資料庫拉出來」開關。
    /// </para>
    /// </summary>
    Task<IReadOnlyList<PublicContentRow>> GetByIdsAsync(
        IReadOnlyCollection<int> ids, CancellationToken ct = default);

    /// <summary>
    /// sitemap 要收的網址。條件與 docs/08 §H 末段一致：
    /// <c>可見性 ＋ IncludeInSitemap = 1 ＋ UrlPath IS NOT NULL</c>。
    /// <para>⚠️ FAQ 沒有獨立網址（<c>UrlPath</c> 為 NULL），標籤頁 <c>IncludeInSitemap = 0</c>。</para>
    /// </summary>
    Task<IReadOnlyList<SitemapUrlRow>> GetSitemapEntriesAsync(CancellationToken ct = default);
}

/// <summary>sitemap 的一列。<c>LastModified</c> 給 <c>&lt;lastmod&gt;</c> 用。</summary>
public sealed record SitemapUrlRow(byte ContentType, string UrlPath, DateTime LastModified);

/// <inheritdoc cref="IPublicContentReadService"/>
public sealed class PublicContentReadService(ISqlConnectionFactory factory) : IPublicContentReadService
{
    // 每一筆要回傳的共通欄位。⚠️ 與 tools/content-export 的 SELECT 保持一致 ——
    //    兩邊餵的是**同一個前端形狀**（app/data/_content.ts 的 ContentRecord），
    //    少一欄前台就少一個欄位，而且不會有任何錯誤訊息。
    private const string Columns = """
        ci.Id, ci.ContentType, ci.Slug, ci.UrlPath, ci.Title,
        ci.SortOrder, ci.IncludeInSitemap, ci.UpdatedAt, cv.Snapshot
        """;

    private const string FromPublished = """
        FROM ContentItems ci
        INNER JOIN ContentVersions cv ON cv.Id = ci.PublishedVersionId
        """;

    public async Task<IReadOnlyList<PublicContentRow>> ListAsync(
        byte contentType, CancellationToken ct = default)
    {
        using var connection = factory.Create();

        var sql = $"""
            SELECT {Columns}
            {FromPublished}
            WHERE {Visibility.PublicFilter} AND ci.ContentType = @ContentType
            ORDER BY ci.SortOrder, ci.Id
            """;

        var items = await connection.QueryAsync<PublicContentRow>(new CommandDefinition(
            sql, new { ContentType = contentType, Now = Clock.UtcNow }, cancellationToken: ct));
        return items.AsList();
    }

    public async Task<(IReadOnlyList<PublicContentRow> Items, int TotalCount)> PageAsync(
        byte contentType, int page, int pageSize, CancellationToken ct = default)
    {
        using var connection = factory.Create();

        // ⚠️ 兩個查詢放同一次往返（QueryMultiple）。分兩次呼叫的話，中間若有內容被核准，
        //    總筆數與當頁資料會對不上 —— 症狀是最後一頁時多時少，極難重現。
        var sql = $"""
            SELECT COUNT(*) {FromPublished}
            WHERE {Visibility.PublicFilter} AND ci.ContentType = @ContentType;

            SELECT {Columns}
            {FromPublished}
            WHERE {Visibility.PublicFilter} AND ci.ContentType = @ContentType
            ORDER BY ci.SortOrder, ci.Id
            OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY;
            """;

        using var multi = await connection.QueryMultipleAsync(new CommandDefinition(
            sql,
            new
            {
                ContentType = contentType,
                Now = Clock.UtcNow,
                Skip = (page - 1) * pageSize,
                Take = pageSize,
            },
            cancellationToken: ct));

        var total = await multi.ReadSingleAsync<int>();
        var items = (await multi.ReadAsync<PublicContentRow>()).AsList();
        return (items, total);
    }

    public async Task<PublicContentRow?> GetByPathAsync(string urlPath, CancellationToken ct = default)
    {
        using var connection = factory.Create();

        var sql = $"""
            SELECT {Columns}
            {FromPublished}
            WHERE {Visibility.PublicFilter} AND ci.UrlPath = @UrlPath
            """;

        return await connection.QuerySingleOrDefaultAsync<PublicContentRow>(new CommandDefinition(
            sql, new { UrlPath = urlPath, Now = Clock.UtcNow }, cancellationToken: ct));
    }

    public async Task<IReadOnlyList<PublicContentRow>> GetByIdsAsync(
        IReadOnlyCollection<int> ids, CancellationToken ct = default)
    {
        if (ids.Count == 0) return [];

        using var connection = factory.Create();

        var sql = $"""
            SELECT {Columns}
            {FromPublished}
            WHERE {Visibility.PublicFilter} AND ci.Id IN @Ids
            ORDER BY ci.SortOrder, ci.Id
            """;

        var items = await connection.QueryAsync<PublicContentRow>(new CommandDefinition(
            sql, new { Ids = ids, Now = Clock.UtcNow }, cancellationToken: ct));
        return items.AsList();
    }

    public async Task<IReadOnlyList<SitemapUrlRow>> GetSitemapEntriesAsync(CancellationToken ct = default)
    {
        using var connection = factory.Create();

        var sql = $"""
            SELECT ci.ContentType, ci.UrlPath, ci.UpdatedAt AS LastModified
            FROM ContentItems ci
            WHERE {Visibility.PublicFilter}
              AND ci.IncludeInSitemap = 1
              AND ci.UrlPath IS NOT NULL
            ORDER BY ci.ContentType, ci.SortOrder, ci.Id
            """;

        var items = await connection.QueryAsync<SitemapUrlRow>(new CommandDefinition(
            sql, new { Now = Clock.UtcNow }, cancellationToken: ct));
        return items.AsList();
    }

    public async Task<IReadOnlyList<RelationTargetRow>> GetRelationTargetsAsync(
        IReadOnlyCollection<int> ids, CancellationToken ct = default)
    {
        if (ids.Count == 0) return [];

        using var connection = factory.Create();

        // 「這一筆前台看得到嗎」用的是同一段 PublicFilter，只是包成一個 bit 欄位。
        var visibleExpr = $"CAST(CASE WHEN {Visibility.PublicFilter} THEN 1 ELSE 0 END AS bit)";

        var sql = $"""
            SELECT ci.Id, ci.ContentType, ci.Slug, ci.UrlPath, ci.Title, {visibleExpr} AS IsVisible
            FROM ContentItems ci
            WHERE ci.Id IN @Ids
            """;

        var items = await connection.QueryAsync<RelationTargetRow>(new CommandDefinition(
            sql, new { Ids = ids, Now = Clock.UtcNow }, cancellationToken: ct));
        return items.AsList();
    }
}
