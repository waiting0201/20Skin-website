using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Skin20.Api.Common;
using Skin20.Api.Models.Entities;
using Skin20.Api.Services.Dapper;

namespace Skin20.Api.Handlers;

/// <summary>
/// 站內搜尋（模板 19）。
///
/// <para>
/// 🔴 <b>2026-09-16 新增，取代建置期的 `search-index.json`。</b>
/// 舊做法是建置期把全站攤平成一份 564 KB 的索引檔，前端在使用者搜尋時抓下來自己比對。
/// 那在靜態站上是對的；改成執行期 SSR 之後它變成 <b>bug</b> ——
/// 沒有建置期就沒有人重產索引，**新發布的內容永遠搜不到**。
/// </para>
///
/// <para>
/// ⚠️ <b>攤平只對命中的那幾筆做。</b> 這是這支能存在的關鍵：
/// 舊做法要預先攤平是因為「攤平 1228 筆」很貴；先在 SQL 篩到 50 筆以內再攤，那個成本就沒了。
/// </para>
///
/// <para>
/// ⚠️ <b>排序規則與舊索引相同</b>：標題命中的排前面 ——
/// 搜「皮秒雷射」時那個療程頁該在第一個，而不是某篇剛好提到它的文章。
/// </para>
/// </summary>
public sealed class SearchHandler(
    IPublicContentReadService content,
    IHttpContextAccessor httpContextAccessor)
{
    /// <summary>
    /// <c>GET /search?q=…</c>
    ///
    /// <para>⚠️ 關鍵字空白時回空陣列，不是回全站 —— 那會變成一個任何人都打得到的
    /// 「把資料庫拉出來」開關。</para>
    /// </summary>
    public async Task<IActionResult> SearchAsync(HttpRequest req)
    {
        var keyword = req.Query["q"].ToString().Trim();
        if (keyword.Length == 0)
        {
            CacheControl.NoStore(httpContextAccessor.HttpContext?.Response);
            return new OkObjectResult(ApiResponse.Ok(Array.Empty<object>()));
        }

        var hits = await content.SearchAsync(keyword);

        // FAQ 沒有獨立網址（docs/08 §C-6），結果要指到它所屬的分類頁。
        var faqCategoryIds = hits
            .Where(h => h.ContentType == (byte)ContentType.Faq)
            .Select(h => CategoryTermIdOf(h.Snapshot))
            .Where(id => id is not null)
            .Select(id => id!.Value)
            .Distinct()
            .ToArray();
        var categories = (await content.GetRelationTargetsAsync(faqCategoryIds))
            .ToDictionary(t => t.Id);

        var results = new List<object>(hits.Count);
        foreach (var hit in hits)
        {
            var type = (ContentType)hit.ContentType;

            // 搜尋頁與 404 自己不該出現在搜尋結果裡。
            if (type == ContentType.Page && SystemKeyOf(hit.Snapshot) is "search" or "not-found") continue;

            // 文章標籤不收 —— 標籤頁內容單薄，混進結果只會稀釋掉真正有內容的頁面
            // （與讓標籤頁 noIndex 是同一個理由，docs/08 §C-9）。
            if (type == ContentType.Term && TermTypeOf(hit.Snapshot) == 4) continue;

            var url = hit.UrlPath;
            if (string.IsNullOrEmpty(url) && type == ContentType.Faq)
            {
                var categoryId = CategoryTermIdOf(hit.Snapshot);
                url = categoryId is not null && categories.TryGetValue(categoryId.Value, out var cat)
                    ? cat.UrlPath
                    : null;
            }

            // ⚠️ 找不到可連結的網址就整筆跳過 —— 收一筆點不到的結果比少收一筆糟。
            if (string.IsNullOrEmpty(url)) continue;

            results.Add(new
            {
                t = ContentTypeLabels.Of(type),
                u = url,
                ti = hit.Title,
                ex = ExcerptOf(hit.Snapshot),
            });
        }

        // ⚠️ 搜尋結果**不要快取**：每個關鍵字一份，命中率極低，而且內容一發布就該搜得到。
        CacheControl.NoStore(httpContextAccessor.HttpContext?.Response);
        return new OkObjectResult(ApiResponse.Ok(results));
    }

    // ════════════════════════════════════════════════════════════════════

    /// <summary>
    /// 結果摘要：先用一句話導言，沒有的話從內文截一段（例如 FAQ 用網頁版答案）。
    /// </summary>
    private static string ExcerptOf(string snapshot)
    {
        if (JsonNode.Parse(snapshot) is not JsonObject root) return "";

        var summary = SearchTextBuilder.Collapse(root["summary"]?.GetValue<string>() ?? "");
        if (summary.Length > 0) return Truncate(summary);

        return Truncate(SearchTextBuilder.Collapse(SearchTextBuilder.Flatten(root["fields"])));
    }

    private static string Truncate(string text) => text.Length <= 120 ? text : text[..120];

    private static int? FieldInt(string snapshot, string name)
    {
        if (JsonNode.Parse(snapshot) is not JsonObject root
            || root["fields"] is not JsonObject fields
            || fields[name] is not JsonValue v) return null;
        return v.TryGetValue<int>(out var i) ? i : null;
    }

    private static int? CategoryTermIdOf(string snapshot) => FieldInt(snapshot, "categoryTermId");
    private static int? TermTypeOf(string snapshot) => FieldInt(snapshot, "termType");

    private static string? SystemKeyOf(string snapshot)
    {
        if (JsonNode.Parse(snapshot) is not JsonObject root
            || root["fields"] is not JsonObject fields) return null;
        return fields["systemKey"]?.GetValue<string>();
    }
}
