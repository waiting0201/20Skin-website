using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Skin20.Api.Common;
using Skin20.Api.Models.Entities;
using Skin20.Api.Services.Dapper;

namespace Skin20.Api.Handlers;

/// <summary>
/// SEO 產物：<c>robots.txt</c>、sitemap 分檔與索引、<c>llms.txt</c>／<c>llms-full.txt</c>／<c>faq.json</c>。
///
/// <para>
/// 🔴 <b>2026-09-16 新增。</b> 這些檔案原本是建置期由 <c>tools/content-export</c> 寫進
/// <c>apps/web/public/</c>、由 <c>nuxt generate</c> 原樣帶進產物的。前台改成執行期 SSR
/// 之後沒有建置期了，同一批產物必須能在請求當下算出來。
/// </para>
///
/// <para>
/// 🔴 <b>格式一律走 <see cref="ExportFormats"/>，不要在前端重寫一份。</b>
/// 那支是 API 與匯出工具以 <c>&lt;Compile Include&gt;</c> 共用的**同一份原始碼**。
/// 在 Nuxt 再寫一次 XML 產生器就是第二份 —— 而這個專案已經因為
/// 「同一段邏輯有兩份」踩過一次（<c>Visibility.PublicFilter</c>，症狀是
/// 「列表看得到、點進去 404」，docs/11 §6.4）。
/// </para>
///
/// <para>
/// ⚠️ <b>這一組取代了 <c>postbuild.mjs</c> 的 sitemap 事後過濾。</b>
/// 那個過濾器存在的理由是「sitemap 在建置期產、要不要 noindex 在算繪時才決定，
/// 兩個系統不知道對方的存在」。改成執行期之後，sitemap 與頁面讀的是同一批資料、
/// 同一個時點 —— 一致性是天然成立的，不需要事後對帳。
/// ⚠️ 那個過濾器 2026-09-16 還把正式站的 sitemap 清空過一次（寫死的主機名與
/// CI 的 <c>SITE_URL</c> 對不上）。少一個會這樣壞的東西本身就是收穫。
/// </para>
/// </summary>
public sealed class SeoHandler(
    IPublicContentReadService content,
    IExportReadService export,
    ISiteSettingReadService settings,
    IHttpContextAccessor httpContextAccessor)
{
    /// <summary>
    /// 哪個型別進哪一個 sitemap 分檔（docs/08 §H）。
    /// <para>⚠️ 與 <c>apps/admin</c> 的 <c>sourceUnits</c> 一致 —— 那裡是給人看的說明，
    /// 這裡是真的在分檔。對不上會變成「後台說收在 A 檔、實際在 B 檔」。</para>
    /// </summary>
    private static readonly (string Key, string FileName, byte[] Types)[] Buckets =
    [
        ("pages", "sitemap-pages.xml", [8, 7, 5, 6]),
        ("treatments", "sitemap-treatments.xml", [1]),
        ("concerns", "sitemap-concerns.xml", [3]),
        ("doctors", "sitemap-doctors.xml", [2]),
        ("blog", "sitemap-blog.xml", [4, 9]),
    ];

    /// <summary>
    /// 產物裡要用的絕對網址前綴。
    ///
    /// <para>
    /// ⚠️ 由呼叫端（Nuxt 的 server route）帶進來，因為只有它知道這個請求是打到哪個網域的
    /// —— 正式站、測試站與 SWA 預覽環境是三個不同的主機名。
    /// </para>
    /// <para>
    /// ⚠️ <b>這不是可以被濫用的輸入。</b> 它只影響這一次回應的內容，不落庫、不影響別人；
    /// 有人拿別的網域來要一份 sitemap，得到的也只是一份指向他自己網域的 XML。
    /// 但仍然要擋掉不成形的值，避免產出壞掉的 XML。
    /// </para>
    /// </summary>
    private static string ResolveOrigin(HttpRequest req)
    {
        var raw = req.Query["origin"].ToString().TrimEnd('/');
        return Uri.TryCreate(raw, UriKind.Absolute, out var uri)
               && (uri.Scheme == Uri.UriSchemeHttps || uri.Scheme == Uri.UriSchemeHttp)
            ? raw
            : "https://20skin.tw";
    }

    /// <summary>
    /// <c>GET /seo/robots.txt</c>
    ///
    /// <para>
    /// 🔴 內容來自 <c>SiteSettings.seo.robotsTxt</c>（docs/08 §H 末段），不是寫死的檔案 ——
    /// 院方在後台改得動。
    /// </para>
    /// <para>
    /// ⚠️ <b>設定被清空時回 404，不要送出一個空的 robots.txt。</b>
    /// 空檔案與「沒有這個檔案」對爬蟲的意義不同：前者是「這個站沒有任何規則」，
    /// 後者才是「沒設定過」。這個區分在匯出工具那邊也是同一條（它選擇不覆寫既有檔案）。
    /// </para>
    /// </summary>
    public async Task<IActionResult> RobotsAsync(HttpRequest req)
    {
        var body = await settings.GetValueAsync("seo.robotsTxt");
        if (string.IsNullOrWhiteSpace(body)) return new NotFoundResult();

        return Text(req, body.TrimEnd() + "\n", "text/plain; charset=utf-8", 3600);
    }

    /// <summary><c>GET /seo/sitemap.xml</c>：索引檔，指向各分檔。</summary>
    public async Task<IActionResult> SitemapIndexAsync(HttpRequest req)
    {
        var origin = ResolveOrigin(req);
        var (entries, config) = await LoadSitemapAsync();

        // ⚠️ 只列出真的會有內容的分檔 —— 一個沒有 <url> 的 sitemap 是合法但無意義的，
        //    而且會讓 Search Console 報「沒有可編入索引的網址」。
        var files = new List<(string FileName, DateTime LastMod)>();
        foreach (var (key, fileName, types) in Buckets)
        {
            var cfg = config.GetValueOrDefault(key, (Enabled: true, ChangeFreq: "monthly", Priority: 0.5m));
            if (!cfg.Enabled) continue;

            var bucket = entries.Where(e => types.Contains(e.ContentType)).ToList();
            if (bucket.Count == 0) continue;
            files.Add((fileName, bucket.Max(e => e.UpdatedAt)));
        }

        return Text(req, ExportFormats.BuildSitemapIndex(files, origin), "application/xml; charset=utf-8", 3600);
    }

    /// <summary><c>GET /seo/sitemap/{key}.xml</c>：單一分檔。</summary>
    public async Task<IActionResult> SitemapFileAsync(HttpRequest req, string key)
    {
        var bucket = Buckets.FirstOrDefault(b => b.Key == key);
        if (bucket.Key is null) return new NotFoundResult();

        var (entries, config) = await LoadSitemapAsync();
        var cfg = config.GetValueOrDefault(key, (Enabled: true, ChangeFreq: "monthly", Priority: 0.5m));
        if (!cfg.Enabled) return new NotFoundResult();

        var rows = entries.Where(e => bucket.Types.Contains(e.ContentType)).ToList();
        if (rows.Count == 0) return new NotFoundResult();

        return Text(
            req,
            ExportFormats.BuildSitemapFile(rows, ResolveOrigin(req), cfg.ChangeFreq, cfg.Priority),
            "application/xml; charset=utf-8",
            3600);
    }

    /// <summary><c>GET /seo/llms.txt</c>：核心資訊與頁面索引（docs/03 §4 ④）。</summary>
    public async Task<IActionResult> LlmsAsync(HttpRequest req)
    {
        var (entries, _) = await LoadSitemapAsync();
        return Text(req, ExportFormats.BuildLlmsTxt(entries), "text/plain; charset=utf-8", 3600);
    }

    /// <summary>
    /// <c>GET /seo/llms-full.txt</c>：FAQ 全文語料。
    /// <para>🔴 語料來源是 <c>Faqs.AiAnswer</c>（60–100 字、語意自足），
    /// <b>不是 <c>WebAnswer</c></b>（docs/04 §2）—— 那是給人看的版本。</para>
    /// </summary>
    public async Task<IActionResult> LlmsFullAsync(HttpRequest req)
    {
        var faqs = await export.GetPublishedFaqsAsync();
        return Text(req, ExportFormats.BuildLlmsFullTxt(ToExportRows(faqs), await ContentLastModifiedAsync()),
            "text/plain; charset=utf-8", 3600);
    }

    /// <summary><c>GET /seo/faq.json</c>：FAQ 語料的結構化版本（docs/04 §3）。</summary>
    public async Task<IActionResult> FaqJsonAsync(HttpRequest req)
    {
        var faqs = await export.GetPublishedFaqsAsync();
        return Text(req, ExportFormats.BuildFaqJson(ToExportRows(faqs), await ContentLastModifiedAsync()) + "\n",
            "application/json; charset=utf-8", 3600);
    }

    /// <summary>
    /// 語料檔的 <c>generatedAt</c>：**內容最後更新的時間**，不是「現在」。
    ///
    /// <para>
    /// 🔴 這個區分不是細節。用 <c>Clock.UtcNow</c> 的話，每一次請求都會得到不同的值 ——
    /// 對消費端（AI 爬蟲）的意思是「這份語料剛剛又變了」，而實際上什麼都沒改。
    /// 語料被當成每分鐘都在變動的東西，它的可信度就沒了。
    /// 建置期的匯出工具傳的一直是 <c>contentLastModified</c>，改成執行期不能改掉這個語意。
    /// ⚠️ 順帶：值固定之後同一份內容的回應才是逐 byte 相同的，快取與 304 才有意義。
    /// </para>
    /// </summary>
    private async Task<DateTime> ContentLastModifiedAsync()
    {
        var rows = await content.GetSitemapEntriesAsync();
        return rows.Count == 0 ? Clock.UtcNow : rows.Max(r => r.LastModified);
    }

    // ════════════════════════════════════════════════════════════════════

    /// <summary>
    /// sitemap 的收錄範圍與分檔設定。
    /// <para>⚠️ 標題取自**已核准版本的快照**，不是 <c>ContentItems.Title</c> ——
    /// 前台顯示的就是那一版的標題，兩者在「改了標題但還沒核准」時會不一樣。</para>
    /// </summary>
    private async Task<(List<ExportIndexEntry> Entries,
        Dictionary<string, (bool Enabled, string ChangeFreq, decimal Priority)> Config)> LoadSitemapAsync()
    {
        var rows = await content.GetSitemapEntriesAsync();

        // 🔴 **內容太單薄的不收。** 與前台輸出 noindex 用的是同一段判斷
        //    （Common/Indexability.cs）—— 兩邊各判一次的下場就是 2026-09-15 發現的
        //    「sitemap 收了 29 個 noindex 網址」。
        //    ⚠️ 光把 sitemap 改成執行期**不會**解決那件事，那只消除了時間差；
        //    判斷共用才是解法。
        var entries = rows
            .Where(r => JsonNode.Parse(r.Snapshot) is JsonObject o
                        && Indexability.IsIndexable(r.ContentType, o))
            .Select(r => new ExportIndexEntry(r.ContentType, TitleOf(r.Snapshot), r.UrlPath, r.LastModified))
            .ToList();

        var config = ParseSitemapConfig(await settings.GetValueAsync("seo.sitemapFiles"));
        return (entries, config);
    }

    private static List<ExportFaqRow> ToExportRows(IReadOnlyList<PublishedFaqRow> rows) =>
        [.. rows.Select(r => new ExportFaqRow(
            r.Question, r.AiAnswer, r.LastReviewedOn, r.CategoryTitle, r.CategorySlug))];

    /// <summary>
    /// 從快照裡取標題。
    /// <para>⚠️ 用快照的標題而不是 <c>ContentItems.Title</c> —— 前台顯示的就是已核准
    /// 那一版的標題，兩者在「編輯了標題但還沒核准」時會不一樣（同 content-export 的 TitleOf）。</para>
    /// </summary>
    private static string TitleOf(string snapshot)
    {
        try
        {
            using var doc = JsonDocument.Parse(snapshot);
            return doc.RootElement.TryGetProperty("title", out var t) && t.ValueKind == JsonValueKind.String
                ? t.GetString() ?? string.Empty
                : string.Empty;
        }
        catch (JsonException)
        {
            return string.Empty;
        }
    }

    /// <summary>
    /// 分檔的旋鈕（是否納入、changefreq、priority）存在 <c>SiteSettings.seo.sitemapFiles</c>。
    /// <para>⚠️ 解析失敗一律退回預設值，不要讓一個打錯的 JSON 讓整份 sitemap 消失。</para>
    /// </summary>
    private static Dictionary<string, (bool Enabled, string ChangeFreq, decimal Priority)> ParseSitemapConfig(
        string? json)
    {
        var result = new Dictionary<string, (bool, string, decimal)>(StringComparer.Ordinal);
        if (string.IsNullOrWhiteSpace(json)) return result;

        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Array) return result;

            foreach (var item in doc.RootElement.EnumerateArray())
            {
                if (!item.TryGetProperty("key", out var keyEl) || keyEl.GetString() is not { } key) continue;
                result[key] = (
                    !item.TryGetProperty("enabled", out var en) || en.ValueKind != JsonValueKind.False,
                    item.TryGetProperty("defaultChangeFreq", out var cf) && cf.ValueKind == JsonValueKind.String
                        ? cf.GetString()! : "monthly",
                    item.TryGetProperty("defaultPriority", out var pr) && pr.TryGetDecimal(out var p) ? p : 0.5m);
            }
        }
        catch (JsonException)
        {
            // 退回預設值。
        }

        return result;
    }

    private IActionResult Text(HttpRequest req, string body, string contentType, int cacheSeconds)
    {
        CacheControl.Public(httpContextAccessor.HttpContext?.Response, cacheSeconds);
        return new ContentResult { Content = body, ContentType = contentType, StatusCode = 200 };
    }
}
