namespace Skin20.Api.Models.Entities;

// ── E. 媒體庫（2 張表）───────────────────────────────────────────────────
// docs/08-database.md §E。

/// <summary>
/// 媒體資產（docs/08 §E-1）。
/// <para>
/// ⚠️ <see cref="Variants"/> 用 JSON 是刻意的：衍生尺寸誰來產（瀏覽器端上傳前轉檔 vs
/// Function App 以 sharp 轉檔）尚未定案（docs/07 §3），兩種做法確定後都不必再做一次 migration。
/// </para>
/// <para>
/// ⚠️ 這張表可能落後於 Blob 的實際內容——上傳是瀏覽器直傳，回報 API 寫入記錄這一步失敗
/// 就會留下孤兒 blob。這不是 schema 能解決的，需要一支對帳工具（見 docs/08 §E-1）。
/// </para>
/// </summary>
public sealed class MediaAsset
{
    public int Id { get; set; }

    /// <summary>公開容器／私有容器。</summary>
    public string ContainerName { get; set; } = string.Empty;

    /// <summary>檔名用內容雜湊——架構中沒有 CDN，圖片由 Blob 直接服務，靠長效 <c>Cache-Control</c>。</summary>
    public string BlobPath { get; set; } = string.Empty;

    /// <summary>資料庫只存 URL，一個檔案都不進 build 產物。</summary>
    public string PublicUrl { get; set; } = string.Empty;

    public string OriginalFileName { get; set; } = string.Empty;

    /// <summary>MIME type。</summary>
    public string ContentType { get; set; } = string.Empty;

    public long ByteSize { get; set; }
    public int? Width { get; set; }
    public int? Height { get; set; }

    /// <summary>SHA-256，去重。</summary>
    public string ContentHash { get; set; } = string.Empty;

    /// <summary>⚠️ 舊站 alt 普遍缺漏，遷移時要補（docs/02 §7 步驟 6）。</summary>
    public string? AltText { get; set; }

    public string? Caption { get; set; }

    /// <summary>私有檔案走讀取 SAS 的另一個容器。</summary>
    public bool IsPrivate { get; set; }

    /// <summary>衍生尺寸（WebP／AVIF、<c>srcset</c>）的 JSON，見上方警告。</summary>
    public string? Variants { get; set; }

    public int? UploadedByUserId { get; set; }
    public DateTime CreatedAt { get; set; }

    public User? UploadedByUser { get; set; }
    public ICollection<MediaUsage> Usages { get; set; } = [];
}

/// <summary>
/// 媒體引用登記（docs/08 §E-2）。
/// <para>
/// 刪除媒體前要知道誰在用。FK 欄位（<c>CoverMediaId</c> 等）用查詢就找得到，但
/// <b>內嵌在 <c>BodyBlocks</c> JSON 裡的圖片查不到</b>——這張表由儲存內容時解析
/// <c>BodyBlocks</c> 寫入，是唯一能回答「這張圖被哪幾篇文章引用」的地方。
/// </para>
/// </summary>
public sealed class MediaUsage
{
    public int Id { get; set; }
    public int MediaId { get; set; }
    public int ContentItemId { get; set; }
    public MediaUsageKind UsageKind { get; set; }

    public MediaAsset Media { get; set; } = null!;
    public ContentItem ContentItem { get; set; } = null!;
}
