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
/// 不寫檔、不進 Blob、不觸發任何部署。
/// </para>
/// <para>
/// 🔴 <b>格式不在這裡，在 <see cref="ExportFormats"/>。</b> 那份原始碼同時被
/// <c>tools/content-export</c> 以 <c>&lt;Compile Include&gt;</c> 連結 ——
/// 所以這個畫面看到的，就是建置期真的會產出的東西。
/// 兩邊各寫一份的話，「預覽跟正式產物不一樣」不會有任何徵兆，
/// 而那正是這個畫面唯一的用途。
/// </para>
/// <para>
/// 🔴 語料來源是 <c>Faqs.AiAnswer</c>（60–100 字，語意自足），<b>不是 <c>WebAnswer</c></b>
/// （docs/04-ai-faq.md §2、docs/08 §C-6）。
/// </para>
/// <para>
/// ⚠️ 只讀已發布內容（<see cref="Visibility.PublicFilter"/>）——草稿混進來會讓編輯以為已經生效（docs/11 §6.4）。
/// </para>
/// <para>
/// ⚠️ 分層鐵律（docs/11 §2）：Handler 內<b>禁止直接寫 SQL</b> —— 讀走 Dapper ReadService；
/// 本單元完全沒有寫入路徑，所以不持有 <c>Skin20DbContext</c>。
/// </para>
/// </summary>
public sealed class ExportHandler(ISqlConnectionFactory sqlFactory)
{
    private readonly IExportReadService reads = new ExportReadService(sqlFactory);

    /// <summary>
    /// 預覽時每個型別最多列幾筆（只影響 <c>llms.txt</c>）。
    /// 約 950 個網址的完整清單在一個唯讀文字框裡沒有人看得完；建置期產物不設限。
    /// </summary>
    private const int PreviewLimitPerType = 20;

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
        var faqs = await LoadFaqsAsync();
        return (ExportFormats.BuildFaqJson(faqs, Clock.UtcNow), faqs.Count);
    }

    private async Task<(string Content, int ItemCount)> BuildLlmsFullTxtAsync()
    {
        var faqs = await LoadFaqsAsync();
        return (ExportFormats.BuildLlmsFullTxt(faqs, Clock.UtcNow, isPreview: true), faqs.Count);
    }

    private async Task<(string Content, int ItemCount)> BuildLlmsTxtAsync()
    {
        var entries = await LoadIndexAsync();
        return (ExportFormats.BuildLlmsTxt(entries, PreviewLimitPerType), entries.Count);
    }

    private async Task<IReadOnlyList<ExportFaqRow>> LoadFaqsAsync()
    {
        var rows = await reads.GetPublishedFaqsAsync();
        return [.. rows.Select(f => new ExportFaqRow(f.Question, f.AiAnswer, f.LastReviewedOn, f.CategoryTitle, f.CategorySlug))];
    }

    private async Task<IReadOnlyList<ExportIndexEntry>> LoadIndexAsync()
    {
        var rows = await reads.GetSitemapIndexAsync();
        // ⚠️ 預覽不需要 lastmod（llms.txt 沒有這一欄），但共用型別要有值 —— 給一個明確的佔位時間，
        //    不要用 UtcNow：那會讓同一份資料每次預覽的內容都不一樣。
        return [.. rows.Select(e => new ExportIndexEntry(e.ContentType, e.Title, e.UrlPath, default))];
    }
}
