using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Skin20.Api.Common;
using Skin20.Api.Models.Entities;
using Skin20.Api.Services.Dapper;

namespace Skin20.Api.Handlers;

/// <summary>
/// 前台（SSR）的內容讀取端點。
///
/// <para>
/// 🔴 <b>2026-09-15 新增。</b> 前台改成執行期算繪之前，這些資料是建置期由
/// <c>tools/content-export</c> 直接讀資料庫烤成 <c>apps/web/content/*.json</c> 的；
/// 改成即時算繪之後，同一批資料必須能在請求當下拿得到。
/// </para>
///
/// <para>
/// ⚠️ <b>回傳的是版本快照本身，不另外定義一組公開 DTO。</b> 這是刻意的：
/// <c>tools/content-export</c> 產出的形狀就是前台 <c>app/data/_content.ts</c> 的契約
/// （<c>ContentRecord</c>），2397 行的形狀轉接層是對著它寫的。再定義一份 DTO 等於
/// 把同一個形狀維護兩次，而且兩邊分岔時不會有任何錯誤訊息。
/// ⚠️ 這**不是**在外洩內部格式 —— 那份快照今天就已經整包內聯進靜態產物、
/// 隨每一頁送到瀏覽器，公開端點沒有多暴露任何東西。
/// </para>
///
/// <para>
/// ⚠️ 分層鐵律（docs/11 §2）：Handler 內禁止直接寫 SQL，讀走 Dapper ReadService；
/// 授權集中在 <c>AppRouter</c>，這裡不重複檢查。
/// </para>
/// </summary>
public sealed class PublicContentHandler(
    IPublicContentReadService content,
    IHttpContextAccessor httpContextAccessor)
{
    /// <summary>文章列表的預設每頁筆數。與前台的分頁一致（每頁 12 篇）。</summary>
    private const int DefaultPageSize = 12;
    private const int MaxPageSize = 100;

    /// <summary>
    /// 列表回應要剝掉內文的單元。
    ///
    /// <para>
    /// 🔴 文章有 1100 篇、內文合計 8.4 MB —— 列表帶上 <c>bodyBlocks</c> 等於每次翻頁
    /// 都把整個語料庫傳一次。建置期的匯出工具早就在做同一件事
    /// （<c>tools/content-export/Program.cs</c> 把內文拆成 article-bodies/{slug}.json）。
    /// </para>
    ///
    /// <para>
    /// 🔴 <b>只有文章，不要順手把頁面也剝掉。</b> 頁面同樣有 <c>bodyBlocks</c>，
    /// 但只有 6 筆、而且前台的 <c>/about/</c>、法務三頁是**直接吃列表**的 ——
    /// 一起剝掉的話那幾頁會變成「有標題、沒有內文」，而且不會有任何錯誤。
    /// ⚠️ 2026-09-15 真的寫錯過一次，靠「API 回應 vs 匯出產物逐筆比對」抓到，
    /// 6 筆頁面的內文整個消失。<b>加新單元時先想清楚它的內文誰在吃。</b>
    /// </para>
    /// </summary>
    private static readonly HashSet<ContentType> StripBodyInList = [ContentType.Article];

    private static readonly Dictionary<string, ContentType> UnitTypes = new()
    {
        [UnitCodes.Treatment] = ContentType.Treatment,
        [UnitCodes.Doctor] = ContentType.Doctor,
        [UnitCodes.Concern] = ContentType.Concern,
        [UnitCodes.Article] = ContentType.Article,
        [UnitCodes.Case] = ContentType.Case,
        [UnitCodes.Faq] = ContentType.Faq,
        [UnitCodes.Clinic] = ContentType.Clinic,
        [UnitCodes.Page] = ContentType.Page,
        [UnitCodes.Term] = ContentType.Term,
    };

    /// <summary>
    /// <c>GET /{unit}</c>：某個單元的全部可見內容（不含內文）。
    /// <para>⚠️ 文章一律分頁 —— 1100 筆一次送出沒有任何呼叫端需要。</para>
    /// </summary>
    public async Task<IActionResult> ListAsync(HttpRequest req, string unit)
    {
        var type = ResolveUnit(unit);

        if (type == ContentType.Article)
        {
            var (page, pageSize) = ReadPaging(req);
            var (items, total) = await content.PageAsync((byte)type, page, pageSize);
            var shaped = await ShapeAsync(items, stripHeavy: true);

            CacheControl.Public(httpContextAccessor.HttpContext?.Response);
            return new OkObjectResult(ApiResponse.Ok(new
            {
                items = shaped,
                page,
                pageSize,
                totalCount = total,
            }));
        }

        var rows = await content.ListAsync((byte)type);
        var list = await ShapeAsync(rows, stripHeavy: true);

        CacheControl.Public(httpContextAccessor.HttpContext?.Response);
        return new OkObjectResult(ApiResponse.Ok(list));
    }

    /// <summary>
    /// <c>GET /content?path=/blog/xxx/</c>：依網址取單筆（含內文）。
    /// <para>前台的路由就是網址，所以內頁用這一支最直接，不必先知道它屬於哪個單元。</para>
    /// </summary>
    public async Task<IActionResult> GetByPathAsync(HttpRequest req)
    {
        var path = req.Query["path"].ToString();
        if (string.IsNullOrWhiteSpace(path))
            throw AppException.BadRequest(ErrorCodes.ValidationFormat, "缺少 path 參數。");

        // ⚠️ 正規化成「前後都有斜線」——資料庫的 UrlPath 一律是那個形狀，
        //    少一個尾斜線就查不到，而且回的是 404、看起來像內容不存在。
        if (!path.StartsWith('/')) path = '/' + path;
        if (!path.EndsWith('/')) path += '/';

        var row = await content.GetByPathAsync(path)
            ?? throw AppException.NotFound($"內容 {path}");

        var shaped = await ShapeAsync([row], stripHeavy: false);

        CacheControl.Public(httpContextAccessor.HttpContext?.Response);
        return new OkObjectResult(ApiResponse.Ok(shaped[0]));
    }

    /// <summary>
    /// <c>GET /sitemap</c>：sitemap 的**資料**，XML 由前台產生。
    ///
    /// <para>
    /// 🔴 <b>條件與「這一頁前台看不看得到」是同一個判定式。</b> 靜態時代 sitemap 是
    /// 建置期產的檔案，而「要不要 noindex」是前台算繪時才決定的 —— 兩個系統不知道
    /// 對方的存在，結果 sitemap 收了 29 個 noindex 的網址（2026-09-15 發現，
    /// Search Console 會直接報錯，也白吃爬取預算）。
    /// 改成即時算繪之後這件事自然消失：sitemap 與頁面讀的是同一批資料、同一個時點。
    /// </para>
    ///
    /// <para>
    /// ⚠️ 仍然要排除 <c>UrlPath IS NULL</c>（FAQ 沒有獨立網址）與
    /// <c>IncludeInSitemap = 0</c>（標籤頁 noindex 不收），條件與 docs/08 §H 末段一致。
    /// </para>
    /// </summary>
    public async Task<IActionResult> SitemapAsync(HttpRequest req)
    {
        var entries = await content.GetSitemapEntriesAsync();

        // sitemap 比一般內容可以放久一點：它變動的頻率是「有沒有新內容發布」。
        CacheControl.Public(httpContextAccessor.HttpContext?.Response, 900);
        return new OkObjectResult(ApiResponse.Ok(entries));
    }

    // ════════════════════════════════════════════════════════════════════
    // 組形狀
    // ════════════════════════════════════════════════════════════════════

    /// <summary>
    /// 把資料列組成前台要的 <c>ContentRecord</c>。
    /// <para>
    /// ⚠️ 欄位的覆寫順序與 <c>tools/content-export/Program.cs</c> 一致：
    /// 快照裡也有 slug／title 這些欄位，但**以 <c>ContentItems</c> 上的現值為準** ——
    /// 改了網址卻沒重新發布時，快照裡是舊網址，照快照走會產生連不到的連結。
    /// </para>
    /// </summary>
    private async Task<List<JsonObject>> ShapeAsync(
        IReadOnlyList<PublicContentRow> rows, bool stripHeavy)
    {
        var result = new List<JsonObject>(rows.Count);
        var relationTargetIds = new HashSet<int>();

        foreach (var row in rows)
        {
            if (JsonNode.Parse(row.Snapshot) is not JsonObject snapshot) continue;

            snapshot["id"] = row.Id;
            snapshot["contentType"] = row.ContentType;
            snapshot["slug"] = row.Slug;
            snapshot["urlPath"] = row.UrlPath;
            snapshot["title"] = row.Title;
            snapshot["sortOrder"] = row.SortOrder;
            snapshot["includeInSitemap"] = row.IncludeInSitemap;
            snapshot["updatedAt"] = row.UpdatedAt.ToString("s");

            if (stripHeavy
                && StripBodyInList.Contains((ContentType)row.ContentType)
                && snapshot["fields"] is JsonObject fields
                && fields.ContainsKey("bodyBlocks"))
            {
                fields["bodyBlocks"] = null;
            }

            if (snapshot["relations"] is JsonArray relations)
                foreach (var relation in relations.OfType<JsonObject>())
                    if (relation["toContentItemId"]?.GetValue<int>() is int toId)
                        relationTargetIds.Add(toId);

            result.Add(snapshot);
        }

        if (relationTargetIds.Count == 0) return result;

        // 關聯目標的顯示欄位。⚠️ 連未發布的也撈 —— 分得出「指向草稿」與「指向不存在」，
        //    前者照樣輸出、由前端決定要不要渲染成連結（遷移期間 27 項療程還是草稿，
        //    靜默丟掉會讓困擾頁的建議療程整段消失）。
        var targets = (await content.GetRelationTargetsAsync(relationTargetIds))
            .ToDictionary(t => t.Id);

        foreach (var snapshot in result)
        {
            if (snapshot["relations"] is not JsonArray relations) continue;
            foreach (var relation in relations.OfType<JsonObject>())
            {
                var toId = relation["toContentItemId"]?.GetValue<int>();
                if (toId is null || !targets.TryGetValue(toId.Value, out var target)) continue;

                relation["toSlug"] = target.Slug;
                relation["toUrlPath"] = target.UrlPath;
                relation["toTitle"] = target.Title;
                // ⚠️「已發布」的意思是**前台看得到**，不是 Status=3。工作副本回到草稿的
                //    頁面仍然在線上（看的是已核准的那一版，docs/11 §6.4）。
                relation["toIsPublished"] = target.IsVisible;
            }
        }

        return result;
    }

    private static ContentType ResolveUnit(string unit) =>
        UnitTypes.TryGetValue(unit, out var type)
            ? type
            : throw AppException.NotFound($"內容單元 {unit}");

    private static (int Page, int PageSize) ReadPaging(HttpRequest req)
    {
        var page = int.TryParse(req.Query["page"], out var p) && p > 0 ? p : 1;
        var size = int.TryParse(req.Query["pageSize"], out var s) && s > 0 ? s : DefaultPageSize;
        // ⚠️ 上限要夾住 —— 少了它，`?pageSize=99999` 就是一個任何人都打得到的
        //    「把整個資料庫拉出來」開關。
        return (page, Math.Min(size, MaxPageSize));
    }
}
