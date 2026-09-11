using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Skin20.Api.Common;
using Skin20.Api.Data;
using Skin20.Api.Models.Dtos;
using Skin20.Api.Services.Dapper;

namespace Skin20.Api.Handlers;

/// <summary>
/// docs/10 §3.4：<c>faq.json</c>／<c>llms.txt</c>／<c>llms-full.txt</c> 的<b>預覽</b>。
///
/// <para>
/// ⚠️ <b>實際產物在建置期產生</b>（docs/07-deployment.md §4）——這裡只讀資料庫組字串回傳，
/// 不寫檔、不進 Blob、不觸發任何部署。前端要另外做「複製」或「另存」，不是這支端點的責任。
/// </para>
/// <para>
/// 🔴 語料來源是 <c>Faqs.AiAnswer</c>（60–100 字，語意自足），<b>不是 <c>WebAnswer</c></b>
/// （docs/04-ai-faq.md §2、docs/08 §C-6）。
/// </para>
/// <para>
/// ⚠️ 只讀已發布內容（<see cref="Visibility.PublicFilter"/>）——這裡是「建置期腳本實際會
/// 輸出什麼」的預覽，草稿混進來會讓編輯以為已經生效（docs/11 §6.4）。
/// </para>
/// <para>
/// ⚠️ 分層鐵律（docs/11 §2）：Handler 內<b>禁止直接寫 SQL</b> —— 讀走 Dapper ReadService；
/// 本單元完全沒有寫入路徑，所以不持有 <c>Skin20DbContext</c>。
/// </para>
/// </summary>
public sealed class ExportHandler(ISqlConnectionFactory sqlFactory)
{
    private readonly IExportReadService reads = new ExportReadService(sqlFactory);

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping, // 保留中文原樣，不轉成 \uXXXX
    };

    private static readonly IReadOnlyDictionary<byte, string> ContentTypeLabels = new Dictionary<byte, string>
    {
        [1] = "療程", [2] = "醫師", [3] = "肌膚困擾", [4] = "文章", [5] = "案例",
        [6] = "FAQ", [7] = "據點", [8] = "頁面", [9] = "分類與標籤",
    };

    /// <param name="kind">
    /// ⚠️ 路由是 <c>GET /admin/export/{kind}</c>（見 <c>Routing/AppRouter.Admin.cs</c>），
    /// 與 docs/10-api.md §3.4 文字描述的 <c>/admin/export/preview</c> 不同——本檔案配合
    /// 已經寫好的路由表，接受 <c>kind</c> 為 <c>faq.json</c>／<c>llms.txt</c>／<c>llms-full.txt</c>
    /// 三選一（不分大小寫）。這個文件與程式碼的落差已在交付報告中提出。
    /// </param>
    public async Task<IActionResult> PreviewAsync(string kind)
    {
        var normalizedKind = kind.Trim().ToLowerInvariant();

        var (content, itemCount) = normalizedKind switch
        {
            "faq.json" => await BuildFaqJsonAsync(),
            "llms-full.txt" => await BuildLlmsFullTxtAsync(),
            "llms.txt" => await BuildLlmsTxtAsync(),
            _ => throw AppException.BadRequest(
                ErrorCodes.ValidationFormat, "不支援的匯出類型，僅接受 faq.json／llms.txt／llms-full.txt。"),
        };

        var dto = new ExportPreviewDto
        {
            Kind = normalizedKind,
            ItemCount = itemCount,
            GeneratedAt = Clock.UtcNow,
            Content = content,
        };

        return new OkObjectResult(ApiResponse.Ok(dto, "預覽產生成功（正式產物於建置期產生，本結果僅供預覽）。"));
    }

    private async Task<(string Content, int ItemCount)> BuildFaqJsonAsync()
    {
        var faqs = await reads.GetPublishedFaqsAsync();

        var payload = new
        {
            generatedAt = Clock.UtcNow,
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

        return (JsonSerializer.Serialize(payload, JsonOptions), faqs.Count);
    }

    private async Task<(string Content, int ItemCount)> BuildLlmsFullTxtAsync()
    {
        var faqs = await reads.GetPublishedFaqsAsync();
        var sb = new StringBuilder();

        sb.Append("# 20SKIN 美醫集團 — 常見問題語料（llms-full.txt 預覽）\n");
        sb.Append($"# 產生時間：{Clock.UtcNow:yyyy-MM-dd HH:mm} UTC，共 {faqs.Count} 則\n\n");

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

        return (sb.ToString(), faqs.Count);
    }

    /// <summary>
    /// ⚠️ <b>假設與範圍</b>：docs/03-seo-geo.md §4 ④ 把 <c>llms.txt</c> 定義為<b>全站</b>的
    /// 「核心資訊與重要頁面索引」，不是只有 FAQ；docs/04-ai-faq.md §3 反而只明確提到
    /// <c>faq.json</c> 與 <c>llms-full.txt</c> 兩個 FAQ 專屬產物。兩份文件對 <c>llms.txt</c>
    /// 的範圍沒有交集的權威定義，這裡採用與 sitemap 分檔完全相同的資料來源
    /// （<c>ContentType ＋ IncludeInSitemap ＋ 可見性 ＋ UrlPath IS NOT NULL</c>，docs/08 §H 末段），
    /// 依型別分組、每型別預覽前 20 筆。這是我對文件空白處做的合理假設，不是資料庫欄位的發明，
    /// 但正式規格仍待與 SEO／前端文件擁有者確認。
    /// </summary>
    private async Task<(string Content, int ItemCount)> BuildLlmsTxtAsync()
    {
        const int previewLimitPerType = 20;

        var entries = await reads.GetSitemapIndexAsync();
        var sb = new StringBuilder();

        sb.Append("# 20SKIN 美醫集團（llms.txt 預覽）\n");
        sb.Append("> 新中式美學醫美集團，提供皮膚科與醫學美容療程、醫師團隊與門診據點資訊。\n\n");

        var groups = entries
            .GroupBy(e => e.ContentType)
            .OrderBy(g => g.Key);

        foreach (var group in groups)
        {
            var label = ContentTypeLabels.TryGetValue(group.Key, out var name) ? name : $"型別 {group.Key}";
            sb.Append($"## {label}\n\n");

            foreach (var entry in group.Take(previewLimitPerType))
                sb.Append($"- [{entry.Title}]({entry.UrlPath})\n");

            var remaining = group.Count() - previewLimitPerType;
            if (remaining > 0)
                sb.Append($"- …其餘 {remaining} 筆（預覽上限 {previewLimitPerType} 筆，正式產物於建置期完整產生）\n");

            sb.Append('\n');
        }

        return (sb.ToString(), entries.Count);
    }
}
