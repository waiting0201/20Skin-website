using Dapper;
using Skin20.Api.Common;
using Skin20.Api.Data;
using Skin20.Api.Models.Entities;

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

/// <summary>
/// 關聯目標的基本資料，用來補齊快照裡 <c>relations[]</c> 的顯示欄位。
/// <para>
/// ⚠️ <c>Title</c> 是 <c>ContentItems</c> 的即時值（工作副本），<c>SnapshotTitle</c> 是已發布快照裡的。
/// 選單用後者 —— 名稱留空的節點是靠它顯示的，用即時值等於「在後台改了名稱、還沒發布，
/// 全站每一頁的選單當場就換掉」（決策 14）。
/// </para>
/// <para>⚠️ 其餘呼叫端（關聯卡片、FAQ 分類）維持用 <c>Title</c>，那是既有行為，這次不一起改。</para>
/// </summary>
public sealed record RelationTargetRow(
    int Id, byte ContentType, string? Slug, string? UrlPath, string Title, bool IsVisible,
    string? SnapshotTitle = null);

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

    /// <summary>
    /// 分頁版，給文章與標籤這種筆數會長大的單元。
    /// <param name="authorDoctorId">只要這位醫師署名的文章（醫師個人頁用）。
    /// ⚠️ 一定要在 SQL 層篩 —— 撈回 1100 筆再用前端過濾，等於每次開醫師頁都傳 2.3 MB。</param>
    /// </summary>
    /// <param name="latestFirst">依發布日期新到舊排（文章列表與「最新文章」用）。
    /// ⚠️ 一定要在 SQL 層排 —— 撈回 1100 筆再前端排序，等於為了三篇文章傳 2.3 MB。</param>
    /// <param name="categoryTermId">只要這個分類的文章。</param>
    /// <param name="tagTermId">只要帶這個標籤的文章（走 ContentRelations）。</param>
    Task<(IReadOnlyList<PublicContentRow> Items, int TotalCount)> PageAsync(
        byte contentType, int page, int pageSize,
        int? authorDoctorId = null, bool latestFirst = false,
        int? categoryTermId = null, int? tagTermId = null, CancellationToken ct = default);

    /// <summary>
    /// 側欄「熱門標籤」：**依實際被引用的篇數**取前 N 個。
    /// <para>⚠️ 一定要在 SQL 層算 —— 前台原本是把全部文章讀進來自己統計，
    /// 那在建置期可以，執行期等於為了 12 個標籤傳 2.3 MB。</para>
    /// </summary>
    Task<IReadOnlyList<PopularTagRow>> GetPopularTagsAsync(int limit, CancellationToken ct = default);

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
    /// 站內搜尋。
    ///
    /// <para>
    /// 🔴 **比對在 SQL 做，攤平只對命中的那幾筆做。** 這是這支能存在的前提 ——
    /// 靜態索引時代之所以要預先把全站攤平成一份檔案，正是因為「攤平 1228 筆」很貴；
    /// 先用 <c>LIKE</c> 篩到 50 筆以內再攤，那個成本就消失了。
    /// </para>
    ///
    /// <para>
    /// 🔴 <b>快照裡的中文是 <c>\uXXXX</c> 逸出序列，所以關鍵字要比對兩種形式。</b>
    /// <c>ContentHandler</c> 用 <c>JsonSerializerDefaults.Web</c> 序列化快照，
    /// 它的預設編碼器會把所有非 ASCII 轉成逸出序列 —— 直接拿「痘疤」去 <c>LIKE</c>
    /// <b>一次都不會命中</b>。
    /// ⚠️ 2026-09-16 實測過這個錯誤版本：中文查詢的筆數**恰好等於標題命中數**
    /// （標題是獨立欄位、沒有逸出），內文比對完全失效 —— 而 ASCII 查詢一切正常，
    /// 所以光看「Picosure 搜得到」會以為功能是好的。
    /// ⚠️ <b>不要改序列化設定來「修」這件事</b>：那只影響之後寫入的快照，
    /// 既有的 1000 多筆仍是逸出的，結果會變成「舊內容搜不到、新內容搜得到」。
    /// </para>
    ///
    /// <para>
    /// ⚠️ <b>直接對快照 JSON 全文 <c>LIKE</c>，不另外建索引表。</b>
    /// 理論上會誤中 JSON 的鍵名，但鍵名全是 ASCII 而使用者搜的是中文詞。
    /// ⚠️ 英文查詢（如 <c>Picosure</c>）確實可能誤中鍵名，代價是多幾筆雜訊，可接受。
    /// </para>
    ///
    /// <para>
    /// 🔴 <b>不設筆數上限，這是刻意的。</b> 站內搜尋不做分頁（mockup 的 19-search 沒有分頁器），
    /// 而畫面上有「型別篩選 tab ＋ 各類筆數」—— 任何上限都會讓那些數字變成謊話。
    /// 排序是「標題命中優先、然後依型別」，所以截斷不是均勻掉幾筆，而是<b>整類整類地砍掉</b>：
    /// 2026-09-16 實測，上限 100 時「黃勇學」只涵蓋到舊索引 77 筆裡的 29 筆；
    /// 就算放寬到 300，「皮秒」竟然比「皮秒雷射」還少（268 &lt; 277）——
    /// 子字串查詢回得比超字串少，這種結果沒有任何人能理解，而它只是截斷的副作用。
    /// </para>
    /// <para>
    /// ⚠️ <b>真正的上限是語料本身</b>：可索引內容共約 1228 筆，所以最壞情況是全中。
    /// 2026-09-16 本機實測最壞情況（搜 "a"）1228 筆、回應 309 KB、約 0.2–1.2 秒；
    /// 相較之下舊做法是<b>每次進搜尋頁就下載 564 KB</b> 的全站索引檔。
    /// 換句話說「不設上限」連傳輸量都仍然比舊做法省。
    /// </para>
    /// <para>
    /// ⚠️ 代價是這條查詢對 <c>Snapshot</c>（NVARCHAR(MAX)）做兩個 <c>LIKE</c> 的全表掃描，
    /// 索引幫不上忙。內容量若成長到數千筆，升級路徑是 SQL Server 全文檢索
    /// （<c>CONTAINS</c>），不是把上限加回來。
    /// </para>
    /// </summary>
    Task<IReadOnlyList<SearchHitRow>> SearchAsync(string keyword, CancellationToken ct = default);

    /// <summary>
    /// 首頁那筆 Page **已核准版本**的快照 JSON（版位編排在裡面）。
    ///
    /// <para>
    /// 🔴 <b>絕對不要改成讀 <c>HomeSections</c> 即時表。</b> 那兩張表是<b>工作副本</b>——
    /// 版位編排的送審與版本歷程掛在 <c>SystemKey='home'</c> 的 ContentItem 上
    /// （docs/08 §G-2、docs/11 §8）。直接讀即時表等於「編輯者拖一拖版位、還沒送審，
    /// 下一個請求就上線了」，核准這道關卡完全被繞過。
    /// 這與九個內容單元的規則是同一條（CLAUDE.md 決策 14）。
    /// </para>
    /// </summary>
    Task<string?> GetHomeSnapshotAsync(CancellationToken ct = default);

    /// <summary>導覽選單與頁尾（docs/08 §G-3）。不走 ContentItems。</summary>
    Task<IReadOnlyList<PublicMenuRow>> GetMenuItemsAsync(CancellationToken ct = default);

    /// <summary>
    /// 「自動帶入單元」的選單子項目（<see cref="MenuAutoChildren"/>，2026-09-18）。
    /// <para>一次把四種來源全部取回來，呼叫端自己分組 —— 選單一頁最多也就四個自動群組，
    /// 分開查等於四次往返，而正式庫是 Azure SQL Basic／5 DTU。</para>
    /// <para>⚠️ 條件與其他公開讀取一致：<c>可見性 ＋ UrlPath IS NOT NULL</c> ——
    /// 沒有網址的項目放進選單就是死連結。順序一律該單元的 <c>SortOrder</c>。</para>
    /// </summary>
    Task<IReadOnlyList<MenuAutoChildRow>> GetMenuAutoChildrenAsync(CancellationToken ct = default);

    /// <summary>
    /// sitemap 要收的網址。條件與 docs/08 §H 末段一致：
    /// <c>可見性 ＋ IncludeInSitemap = 1 ＋ UrlPath IS NOT NULL</c>。
    /// <para>⚠️ FAQ 沒有獨立網址（<c>UrlPath</c> 為 NULL），標籤頁 <c>IncludeInSitemap = 0</c>。</para>
    /// </summary>
    Task<IReadOnlyList<SitemapUrlRow>> GetSitemapEntriesAsync(CancellationToken ct = default);
}

/// <summary>熱門標籤一列。<c>ArticleCount</c> 是實際引用篇數。</summary>
public sealed record PopularTagRow(string Slug, string Title, int ArticleCount);

/// <summary>搜尋命中的一列。<c>Snapshot</c> 給呼叫端攤平出摘要用。</summary>
public sealed record SearchHitRow(
    byte ContentType, string? Slug, string? UrlPath, string Title, string Snapshot, bool TitleHit);

/// <summary>選單一列。<c>Url</c> 為 NULL 時表示指向內容，網址由該內容的 UrlPath 決定。</summary>
public sealed record PublicMenuRow(
    int Id, string MenuKey, int? ParentId, string Label, byte LinkKind,
    int? ContentItemId, string? Url, string? RelAttr, bool OpenInNewTab, int SortOrder,
    byte AutoChildren);

/// <summary>「自動帶入單元」的一列。<c>Source</c> 是 <see cref="MenuAutoChildren"/>。</summary>
public sealed record MenuAutoChildRow(byte Source, string Title, string UrlPath, int SortOrder, int Id);

/// <summary>
/// sitemap 的一列。<c>LastModified</c> 給 <c>&lt;lastmod&gt;</c> 用。
/// <para>⚠️ <c>Snapshot</c> 帶著是為了取標題 —— <c>llms.txt</c> 需要它，而且要用
/// **已核准那一版**的標題，不是 <c>ContentItems.Title</c>：前台顯示的就是那一版，
/// 兩者在「改了標題但還沒核准」時會不一樣。</para>
/// </summary>
public sealed record SitemapUrlRow(byte ContentType, string UrlPath, DateTime LastModified, string Snapshot);

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

    /// <summary>已發布快照裡的標題，壞掉時退回即時值。用在只要標題、不需要整份快照的查詢。</summary>
    private const string SnapshotTitle =
        "COALESCE(NULLIF(JSON_VALUE(cv.Snapshot, '$.title'), ''), ci.Title) AS Title";

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
        byte contentType, int page, int pageSize,
        int? authorDoctorId = null, bool latestFirst = false,
        int? categoryTermId = null, int? tagTermId = null, CancellationToken ct = default)
    {
        using var connection = factory.Create();

        // ⚠️ DisplayDate 只有文章有。⚠️ 排序子句是拼進 SQL 的，所以只能是**常數字串**，
        //    不可以讓呼叫端傳欄位名進來 —— 那是 SQL injection 的入口。
        var orderBy = latestFirst && contentType == (byte)ContentType.Article
            ? "(SELECT a2.DisplayDate FROM Articles a2 WHERE a2.Id = ci.Id) DESC, ci.Id DESC"
            : "ci.SortOrder, ci.Id";

        var categoryFilter = categoryTermId is not null && contentType == (byte)ContentType.Article
            ? " AND EXISTS (SELECT 1 FROM Articles a3 WHERE a3.Id = ci.Id AND a3.CategoryTermId = @CategoryTermId)"
            : string.Empty;

        // 標籤是關聯（RelationType 11＝文章→標籤，docs/08 §D）。
        var tagFilter = tagTermId is not null && contentType == (byte)ContentType.Article
            ? " AND EXISTS (SELECT 1 FROM ContentRelations cr WHERE cr.FromContentItemId = ci.Id"
              + " AND cr.RelationType = 11 AND cr.ToContentItemId = @TagTermId)"
            : string.Empty;

        // ⚠️ 只有文章有 AuthorDoctorId。其他單元傳這個參數會 JOIN 不到表，
        //    所以每個條件本身都帶上型別判斷，而不是信任呼叫端。
        var authorFilter = authorDoctorId is not null && contentType == (byte)ContentType.Article
            ? " AND EXISTS (SELECT 1 FROM Articles a WHERE a.Id = ci.Id AND a.AuthorDoctorId = @AuthorDoctorId)"
            : string.Empty;

        var extra = authorFilter + categoryFilter + tagFilter;

        // ⚠️ 兩個查詢放同一次往返（QueryMultiple）。分兩次呼叫的話，中間若有內容被核准，
        //    總筆數與當頁資料會對不上 —— 症狀是最後一頁時多時少，極難重現。
        var sql = $"""
            SELECT COUNT(*) {FromPublished}
            WHERE {Visibility.PublicFilter} AND ci.ContentType = @ContentType{extra};

            SELECT {Columns}
            {FromPublished}
            WHERE {Visibility.PublicFilter} AND ci.ContentType = @ContentType{extra}
            ORDER BY {orderBy}
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
                AuthorDoctorId = authorDoctorId,
                CategoryTermId = categoryTermId,
                TagTermId = tagTermId,
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

    public async Task<IReadOnlyList<PopularTagRow>> GetPopularTagsAsync(
        int limit, CancellationToken ct = default)
    {
        using var connection = factory.Create();

        // ⚠️ 篇數相同時用標籤名排序 —— 讓結果是**決定性的**，
        //    否則同一份資料在不同請求會給出不同的前 12 名。
        var sql = $"""
            SELECT TOP (@Limit) tagCi.Slug, tagCi.Title, COUNT(*) AS ArticleCount
            FROM ContentRelations cr
            INNER JOIN ContentItems ci ON ci.Id = cr.FromContentItemId
            INNER JOIN ContentItems tagCi ON tagCi.Id = cr.ToContentItemId
            INNER JOIN ContentVersions cv ON cv.Id = ci.PublishedVersionId
            WHERE cr.RelationType = 11 AND {Visibility.PublicFilter}
            GROUP BY tagCi.Slug, tagCi.Title
            ORDER BY COUNT(*) DESC, tagCi.Title
            """;

        var items = await connection.QueryAsync<PopularTagRow>(new CommandDefinition(
            sql, new { Limit = limit, Now = Clock.UtcNow }, cancellationToken: ct));
        return items.AsList();
    }

    public async Task<IReadOnlyList<SearchHitRow>> SearchAsync(
        string keyword, CancellationToken ct = default)
    {
        using var connection = factory.Create();

        // ⚠️ `LIKE` 的萬用字元要逸出，否則使用者搜 `%` 會撈回全站。
        static string EscapeLike(string v) =>
            v.Replace("[", "[[]").Replace("%", "[%]").Replace("_", "[_]");

        var pattern = $"%{EscapeLike(keyword)}%";

        // 🔴 **比對的是 ContentItems.SearchText，不是 ContentVersions.Snapshot。**
        //    原本直接對快照做 LIKE，而快照是 `JsonSerializerDefaults.Web` 存的 ——
        //    中文一律變成 `\uXXXX`（一個字六個字元），所以還得同時比對「原樣」與
        //    「被轉義」兩種形式，每次查詢跑兩個 LIKE。
        //    2026-09-16 正式環境實測：那樣要 **23–24 秒**，而前台逾時是 8 秒 ——
        //    搜尋在正式環境等於完全不能用（本機 SQL Server 只要 1.2 秒，量不出來）。
        //    SearchText 存的是純文字，所以轉義問題消失，一個 LIKE 就夠。
        //    產生與長度取捨見 Common/SearchTextBuilder.cs。

        // ⚠️ 標題命中的排前面 —— 搜「皮秒雷射」時那個療程頁該在第一個，
        //    而不是某篇剛好提到它的文章。這條與靜態索引時代的排序規則相同。
        var sql = $"""
            SELECT
                   ci.ContentType, ci.Slug, ci.UrlPath, ci.Title, cv.Snapshot,
                   CAST(CASE WHEN ci.Title LIKE @Pattern THEN 1 ELSE 0 END AS bit) AS TitleHit
            {FromPublished}
            WHERE {Visibility.PublicFilter}
              AND (ci.Title LIKE @Pattern OR ci.SearchText LIKE @Pattern)
            ORDER BY CASE WHEN ci.Title LIKE @Pattern THEN 0 ELSE 1 END,
                     ci.ContentType, ci.SortOrder, ci.Id
            """;

        var items = await connection.QueryAsync<SearchHitRow>(new CommandDefinition(
            sql,
            new { Pattern = pattern, Now = Clock.UtcNow },
            cancellationToken: ct));
        return items.AsList();
    }

    public async Task<string?> GetHomeSnapshotAsync(CancellationToken ct = default)
    {
        using var connection = factory.Create();

        const string sql = """
            SELECT cv.Snapshot
            FROM ContentItems ci
            INNER JOIN Pages p ON p.Id = ci.Id
            INNER JOIN ContentVersions cv ON cv.Id = ci.PublishedVersionId
            WHERE p.SystemKey = 'home'
            """;

        return await connection.QuerySingleOrDefaultAsync<string>(
            new CommandDefinition(sql, cancellationToken: ct));
    }

    public async Task<IReadOnlyList<PublicMenuRow>> GetMenuItemsAsync(CancellationToken ct = default)
    {
        using var connection = factory.Create();

        const string sql = """
            SELECT Id, MenuKey, ParentId, Label, LinkKind, ContentItemId, Url, RelAttr, OpenInNewTab,
                   SortOrder, AutoChildren
            FROM MenuItems
            ORDER BY SortOrder, Id
            """;

        var items = await connection.QueryAsync<PublicMenuRow>(
            new CommandDefinition(sql, cancellationToken: ct));
        return items.AsList();
    }

    public async Task<IReadOnlyList<MenuAutoChildRow>> GetMenuAutoChildrenAsync(CancellationToken ct = default)
    {
        using var connection = factory.Create();

        // 🔴 **名稱取「已發布快照」的，不是 `ContentItems.Title`。** 後者是工作副本 ——
        //    用它等於「在後台改了名稱、還沒發布，選單當場就換掉了」，也就是
        //    決策 14 明列的災難之一（2026-09-16 在 ShapeAsync 真的踩過一次）。
        //    ⚠️ 快照真的沒有標題時才退回即時值，那是資料壞掉的保底，不是常態
        //    —— 與 `PublicContentHandler.ShapeAsync` 的規則逐字一致。
        // ⚠️ 分類與標籤是 TPT（`Terms` 另一張表），所以型別要 join 出來；
        //    困擾與據點自己就是一個 ContentType，不必 join。
        // 🔴 `Source` 一定要 CAST 成 tinyint —— SQL 裡的 1／2／3／4 是 int，而這裡收它的是
        //    `byte`，Dapper 會在**執行期**丟「找不到相符建構子」的 InvalidOperationException
        //    （整個 /menu 回 500，也就是全站的選單）。編譯期完全看不出來，實際踩到過。
        var sql = $"""
            SELECT CAST({(byte)MenuAutoChildren.Concern} AS tinyint) AS Source, {SnapshotTitle}, ci.UrlPath, ci.SortOrder, ci.Id
            {FromPublished}
            WHERE {Visibility.PublicFilter} AND ci.ContentType = @Concern AND ci.UrlPath IS NOT NULL

            UNION ALL
            SELECT CAST({(byte)MenuAutoChildren.Clinic} AS tinyint), {SnapshotTitle}, ci.UrlPath, ci.SortOrder, ci.Id
            {FromPublished}
            WHERE {Visibility.PublicFilter} AND ci.ContentType = @Clinic AND ci.UrlPath IS NOT NULL

            UNION ALL
            SELECT CAST(CASE t.TermType WHEN @TreatmentCategoryTerm THEN {(byte)MenuAutoChildren.TreatmentCategory}
                                        ELSE {(byte)MenuAutoChildren.ArticleCategory} END AS tinyint),
                   {SnapshotTitle}, ci.UrlPath, ci.SortOrder, ci.Id
            {FromPublished}
            INNER JOIN Terms t ON t.Id = ci.Id
            WHERE {Visibility.PublicFilter} AND ci.ContentType = @Term AND ci.UrlPath IS NOT NULL
              AND t.TermType IN (@TreatmentCategoryTerm, @ArticleCategoryTerm)

            ORDER BY Source, SortOrder, Id
            """;

        var rows = await connection.QueryAsync<MenuAutoChildRow>(new CommandDefinition(sql, new
        {
            Now = Clock.UtcNow,
            Concern = (byte)ContentType.Concern,
            Clinic = (byte)ContentType.Clinic,
            Term = (byte)ContentType.Term,
            TreatmentCategoryTerm = (byte)TermType.TreatmentCategory,
            ArticleCategoryTerm = (byte)TermType.ArticleCategory,
        }, cancellationToken: ct));

        return rows.AsList();
    }

    public async Task<IReadOnlyList<SitemapUrlRow>> GetSitemapEntriesAsync(CancellationToken ct = default)
    {
        using var connection = factory.Create();

        var sql = $"""
            SELECT ci.ContentType, ci.UrlPath, ci.UpdatedAt AS LastModified, cv.Snapshot
            {FromPublished}
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

        // ⚠️ LEFT JOIN：這支刻意也回「還沒發布」的目標（IsVisible 自己算），所以不能用 INNER。
        var sql = $"""
            SELECT ci.Id, ci.ContentType, ci.Slug, ci.UrlPath, ci.Title, {visibleExpr} AS IsVisible,
                   JSON_VALUE(cv.Snapshot, '$.title') AS SnapshotTitle
            FROM ContentItems ci
            LEFT JOIN ContentVersions cv ON cv.Id = ci.PublishedVersionId
            WHERE ci.Id IN @Ids
            """;

        var items = await connection.QueryAsync<RelationTargetRow>(new CommandDefinition(
            sql, new { Ids = ids, Now = Clock.UtcNow }, cancellationToken: ct));
        return items.AsList();
    }
}
