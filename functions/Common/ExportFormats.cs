using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;

namespace Skin20.Api.Common;

/// <summary>已發布 FAQ 一列。語料來源是 <c>AiAnswer</c>（docs/04 §2），<b>不是 <c>WebAnswer</c></b>。</summary>
public sealed record ExportFaqRow(
    string Question, string AiAnswer, DateTime LastReviewedOn, string CategoryTitle, string? CategorySlug);

/// <summary>站台索引一列（<c>llms.txt</c> 與 sitemap 共用同一組資料來源，docs/08 §H 末段）。</summary>
public sealed record ExportIndexEntry(byte ContentType, string Title, string UrlPath, DateTime UpdatedAt);

/// <summary>
/// <c>faq.json</c>／<c>llms.txt</c>／<c>llms-full.txt</c> 的格式。
///
/// <para>
/// 🔴 <b>這是唯一一份產生器。</b> 正式產物在建置期由 <c>tools/content-export</c> 產生
/// （docs/07 §4），後台的 <c>GET /admin/export/{kind}</c> 是<b>同一支函式</b>的截短預覽 ——
/// 兩邊各寫一份的話，「預覽跟正式產物不一樣」不會有任何徵兆，而那正是這個畫面唯一的用途。
/// </para>
/// <para>
/// ⚠️ 這個檔案被 <c>tools/content-export/ContentExport.csproj</c> 以
/// <c>&lt;Compile Include&gt;</c> 連結，所以<b>不可以有相依</b> —— 不 using EF、
/// 不 using <c>Models.Entities</c>、不碰資料庫。輸入一律由呼叫端準備好。
/// </para>
/// <para>
/// 🔴 <b>時間一律用呼叫端傳進來的，不在這裡叫 <c>DateTime.UtcNow</c>。</b>
/// 建置期產物是<b>進版控</b>的（與 <c>content/*.json</c> 同一個理由：它們是資料庫的投影）。
/// 產生器若自己取時間，同一份資料每次產出的位元組都不一樣 ——
/// 每次匯出都是一份沒有意義的 diff，而真正有意義的變動就淹沒在裡面了。
/// 建置期傳的是「內容的最後更新時間」，後台預覽傳的是當下時間（那一份不落地）。
/// </para>
/// </summary>
public static class ExportFormats
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        // 保留中文原樣，不轉成 \uXXXX —— 這份檔案是給人與 AI 讀的。
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private static readonly IReadOnlyDictionary<byte, string> ContentTypeLabels = new Dictionary<byte, string>
    {
        [1] = "療程", [2] = "醫師", [3] = "肌膚困擾", [4] = "文章", [5] = "案例",
        [6] = "FAQ", [7] = "據點", [8] = "頁面", [9] = "分類與標籤",
    };

    public static string BuildFaqJson(IReadOnlyList<ExportFaqRow> faqs, DateTime generatedAt)
    {
        var payload = new
        {
            generatedAt,
            count = faqs.Count,
            items = faqs.Select(f => new
            {
                question = f.Question,
                answer = f.AiAnswer,
                category = f.CategoryTitle,
                categorySlug = f.CategorySlug,
                lastReviewedOn = f.LastReviewedOn.ToString("yyyy-MM-dd"),
            }),
        };

        return JsonSerializer.Serialize(payload, JsonOptions);
    }

    /// <param name="isPreview">
    /// true 時在標題標明「預覽」。⚠️ 這是<b>唯一</b>的差別 —— 內容本身完全相同，
    /// 所以後台看到的就是建置期會產出的東西。
    /// </param>
    public static string BuildLlmsFullTxt(IReadOnlyList<ExportFaqRow> faqs, DateTime generatedAt, bool isPreview = false)
    {
        var sb = new StringBuilder();

        sb.Append($"# 20SKIN 美醫集團 — 常見問題語料{(isPreview ? "（llms-full.txt 預覽）" : "")}\n");
        sb.Append($"# 產生時間：{generatedAt:yyyy-MM-dd HH:mm} UTC，共 {faqs.Count} 則\n\n");

        string? currentCategory = null;
        foreach (var faq in faqs)
        {
            if (faq.CategoryTitle != currentCategory)
            {
                currentCategory = faq.CategoryTitle;
                sb.Append($"## {currentCategory}\n\n");
            }

            sb.Append($"Q: {faq.Question}\n");
            sb.Append($"A: {faq.AiAnswer}\n");
            sb.Append($"（最後更新：{faq.LastReviewedOn:yyyy-MM}）\n\n");
        }

        return sb.ToString();
    }

    /// <summary>
    /// <c>llms.txt</c>：全站核心資訊 ＋ 重要頁面索引。
    ///
    /// <para>
    /// ⚠️ <b>範圍是一個假設，不是規格。</b> docs/03 §4 ④ 把它定義為<b>全站</b>的核心資訊與
    /// 頁面索引；docs/04 §3 只明確定義了 FAQ 專屬的 <c>faq.json</c> 與 <c>llms-full.txt</c>。
    /// 兩份文件對 <c>llms.txt</c> <b>沒有交集的權威定義</b>，這裡採用與 sitemap 分檔相同的
    /// 資料來源、依型別分組。正式規格仍待確認（STATUS.md §八）。
    /// </para>
    /// </summary>
    /// <param name="limitPerType">
    /// 每個型別最多列幾筆；<c>null</c>＝不限（建置期產物）。
    /// 後台預覽傳 20 —— 約 950 個網址的完整清單在一個唯讀文字框裡沒有人看得完。
    /// </param>
    public static string BuildLlmsTxt(IReadOnlyList<ExportIndexEntry> entries, int? limitPerType = null)
    {
        var sb = new StringBuilder();

        sb.Append($"# 20SKIN 美醫集團{(limitPerType is null ? "" : "（llms.txt 預覽）")}\n");
        sb.Append("> 新中式美學醫美集團，提供皮膚科與醫學美容療程、醫師團隊與門診據點資訊。\n\n");

        foreach (var group in entries.GroupBy(e => e.ContentType).OrderBy(g => g.Key))
        {
            var label = ContentTypeLabels.TryGetValue(group.Key, out var name) ? name : $"型別 {group.Key}";
            sb.Append($"## {label}\n\n");

            var rows = group.ToList();
            foreach (var entry in limitPerType is int limit ? rows.Take(limit) : rows)
                sb.Append($"- [{entry.Title}]({entry.UrlPath})\n");

            if (limitPerType is int cap && rows.Count > cap)
                sb.Append($"- …其餘 {rows.Count - cap} 筆（預覽上限 {cap} 筆，正式產物於建置期完整產生）\n");

            sb.Append('\n');
        }

        return sb.ToString();
    }

    /// <summary>
    /// 一個 sitemap 分檔。
    ///
    /// <para>
    /// ⚠️ <c>&lt;lastmod&gt;</c> 用內容的 <c>UpdatedAt</c>，<b>不是建置時間</b> ——
    /// 每次建置都把全站 lastmod 推到今天，等於告訴搜尋引擎「這 950 頁每天都在改」，
    /// 幾輪之後它就不再相信這個欄位了（docs/03 §1）。
    /// </para>
    /// <para>
    /// ⚠️ 網址一律輸出**絕對網址**（sitemap 協定要求），所以要傳 <paramref name="origin"/>。
    /// </para>
    /// </summary>
    public static string BuildSitemapFile(
        IReadOnlyList<ExportIndexEntry> entries, string origin, string changeFreq, decimal priority)
    {
        var sb = new StringBuilder();
        sb.Append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        sb.Append("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");

        foreach (var entry in entries)
        {
            sb.Append("  <url>\n");
            sb.Append($"    <loc>{XmlEscape(origin + entry.UrlPath)}</loc>\n");
            sb.Append($"    <lastmod>{entry.UpdatedAt:yyyy-MM-dd}</lastmod>\n");
            sb.Append($"    <changefreq>{XmlEscape(changeFreq)}</changefreq>\n");
            sb.Append($"    <priority>{priority.ToString("0.0", System.Globalization.CultureInfo.InvariantCulture)}</priority>\n");
            sb.Append("  </url>\n");
        }

        sb.Append("</urlset>\n");
        return sb.ToString();
    }

    /// <summary>sitemap 索引檔（`/sitemap.xml` 本身），指向各分檔。</summary>
    public static string BuildSitemapIndex(IReadOnlyList<(string FileName, DateTime LastMod)> files, string origin)
    {
        var sb = new StringBuilder();
        sb.Append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        sb.Append("<sitemapindex xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");

        foreach (var (fileName, lastMod) in files)
        {
            sb.Append("  <sitemap>\n");
            sb.Append($"    <loc>{XmlEscape($"{origin}/{fileName}")}</loc>\n");
            sb.Append($"    <lastmod>{lastMod:yyyy-MM-dd}</lastmod>\n");
            sb.Append("  </sitemap>\n");
        }

        sb.Append("</sitemapindex>\n");
        return sb.ToString();
    }

    private static string XmlEscape(string value) => value
        .Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;")
        .Replace("\"", "&quot;").Replace("'", "&apos;");
}
