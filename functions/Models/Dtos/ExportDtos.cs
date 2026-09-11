namespace Skin20.Api.Models.Dtos;

/// <summary>
/// <c>GET /admin/export/{kind}</c> 的預覽結果（docs/10-api.md §3.4）。
/// ⚠️ <b>只是預覽</b>——實際產物在建置期由前端建置腳本產生（docs/07-deployment.md §4）。
/// </summary>
public sealed class ExportPreviewDto
{
    public string Kind { get; set; } = string.Empty;
    public int ItemCount { get; set; }
    public DateTime GeneratedAt { get; set; }

    /// <summary>預覽內容全文（JSON 或純文字，依 <see cref="Kind"/> 而定）。</summary>
    public string Content { get; set; } = string.Empty;
}
