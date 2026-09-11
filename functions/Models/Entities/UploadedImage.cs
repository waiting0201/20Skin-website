namespace Skin20.Api.Models.Entities;

/// <summary>
/// 內嵌在內容欄位裡的一張圖片（docs/08 §0 決策五）。
/// <para>
/// <b>這不是一張表。</b> 2026-09-11 定案不做媒體庫之後，圖片沒有自己的實體與生命週期——
/// 它是所屬欄位的一部分，跟著擁有它的那一列走，以 EF Core 的 owned type 直接落在同一張表上
/// （<c>Cover</c> → <c>CoverUrl</c>／<c>CoverBlobPath</c>／…）。
/// </para>
/// <para>
/// ⚠️ <b>一個欄位獨佔一個 blob，不跨內容共用。</b> 上傳時 blob 名稱是隨機唯一值而非內容雜湊——
/// 兩個欄位選了同一張圖就是兩份位元組。這是刻意的取捨：沒有 <c>MediaUsages</c> 之後
/// 「還有誰在用這個檔案」無從查起，去重會讓「換圖就刪舊檔」變成可能刪掉別人正在用的檔案。
/// 多出來的儲存量遠比斷圖便宜（docs/11 §9）。
/// </para>
/// </summary>
public sealed class UploadedImage
{
    /// <summary>公開容器內的 blob 路徑。換圖與刪內容時要靠它把舊檔案從 Blob 刪掉。</summary>
    public string BlobPath { get; set; } = string.Empty;

    /// <summary>對外網址。架構中沒有 CDN，圖片由 Blob 直接服務，靠長效 <c>Cache-Control</c>。</summary>
    public string Url { get; set; } = string.Empty;

    /// <summary>⚠️ 舊站 alt 普遍缺漏，遷移時要補（docs/02 §7 步驟 6）。</summary>
    public string? Alt { get; set; }

    public int? Width { get; set; }
    public int? Height { get; set; }

    /// <summary>
    /// 衍生尺寸（WebP／AVIF、<c>srcset</c>）的 JSON。
    /// ⚠️ 用 JSON 是刻意的：衍生尺寸誰來產尚未定案（docs/07 §3），兩種做法確定後都不必再做一次 migration。
    /// </summary>
    public string? Variants { get; set; }
}
