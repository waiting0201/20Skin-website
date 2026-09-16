namespace Skin20.Api.Models.Entities;

// ── B. 內容主幹：工作流、版本、SEO（5 張表）──────────────────────────
// docs/08-database.md §B。九個內容模型以 TPT 掛在 ContentItem 底下（§C）。

/// <summary>
/// 九個內容模型共用的主幹（docs/08 §0 決策一）。
///
/// <para>
/// 三段式工作流、版本歷程、排程發布／下架、SEO 區塊這四件事在九個模型上規則完全一致，
/// 所以集中在這裡，各模型只存專屬欄位並以 PK＝FK 對應（EF Core 的 TPT）。
/// </para>
/// <para>換來四件事：工作流只寫一次；<b>全站網址唯一性由一條 unique index 保證</b>；
/// 建置期一次撈出全站內容是一個查詢；排程發布的 Timer 掃一張表。</para>
/// </summary>
public class ContentItem
{
    public int Id { get; set; }
    public ContentType ContentType { get; set; }

    /// <summary>FAQ 用作頁內錨點；其餘為網址片段。定序為 <c>Latin1_General_100_BIN2</c>。</summary>
    public string? Slug { get; set; }

    /// <summary>
    /// 完整路徑，如 <c>/treatments/laser/picosure-pro/</c>。儲存時由應用程式計算寫入。
    /// <para>
    /// ⚠️ 這一欄的 filtered unique index 是<b>全站網址唯一性的唯一保證</b>。950 個 URL
    /// 分散在九個模型裡，沒有這條約束就得靠九支程式各自檢查。
    /// </para>
    /// <para>FAQ 不產生獨立網址 → 為 NULL。</para>
    /// </summary>
    public string? UrlPath { get; set; }

    /// <summary>FAQ 的「問題」也放這裡。</summary>
    public string Title { get; set; } = string.Empty;

    /// <summary>
    /// 一句話導言／摘要。列表卡片、Hero 副標、搜尋結果都讀它。
    /// <para>
    /// ⚠️ 放在主幹表是刻意的：醫師、困擾、案例、文章、療程的「導言」在前台是同一個東西，
    /// 各自加一欄會變成五個名字不同、行為相同的欄位（2026-09-11 搬 mockup 內容時定案）。
    /// </para>
    /// <para>⚠️ 與 <c>SeoMeta.AiSummary</c> 不同：那是 40–60 字的 GEO 直答段落，用途與字數規範都不一樣。</para>
    /// </summary>
    public string? Summary { get; set; }

    public ContentStatus Status { get; set; } = ContentStatus.Draft;

    /// <summary>
    /// 排程發布：<b>最早生效時間</b>，不是精確時間。
    /// <para>
    /// Timer 到點後還要跑一次全站重建才會出現在網站上（docs/07 §4），
    /// 後台文案必須據此撰寫，不要寫「將於 14:00 發布」。
    /// </para>
    /// <para>⚠️ 與 <c>Articles.DisplayDate</c> 是兩回事，見 <see cref="Article"/>。</para>
    /// </summary>
    public DateTime? PublishAt { get; set; }

    public DateTime? UnpublishAt { get; set; }

    /// <summary>前台輸出的是這一版。</summary>
    public int? PublishedVersionId { get; set; }

    /// <summary>
    /// 站內搜尋的比對用純文字，由**已核准版本的快照**壓成一行
    /// （<see cref="Common.SearchTextBuilder"/>）。
    /// <para>
    /// 🔴 <b>衍生資料，不是真相。</b> 只在發布時重算，直接改它沒有意義 ——
    /// 下一次發布就被蓋掉。
    /// </para>
    /// <para>
    /// ⚠️ 存在的理由是效能：原本直接對 <c>ContentVersions.Snapshot</c> 做 <c>LIKE</c>，
    /// 正式的 Azure SQL Basic（5 DTU）要 **23–24 秒**，而前台逾時是 8 秒。
    /// 理由與取捨全寫在 <see cref="Common.SearchTextBuilder"/>。
    /// </para>
    /// </summary>
    public string? SearchText { get; set; }

    public int SortOrder { get; set; }

    /// <summary>
    /// ⚠️ 與 <c>SeoMeta.NoIndex</c> 是兩件事：本欄管 sitemap 產出、那欄管 robots。
    /// 文章標籤兩者都要設，只設一邊會出現「sitemap 送出去但頁面 noindex」的自相矛盾訊號。
    /// </summary>
    public bool IncludeInSitemap { get; set; } = true;

    /// <summary>系統頁與系統分類：不可刪、不可改 slug。</summary>
    public bool IsSystemLocked { get; set; }

    /// <summary>醫師角色「自己的內容」判定（docs/10 §3.3）。</summary>
    public int? OwnerUserId { get; set; }

    public int? CreatedByUserId { get; set; }
    public int? UpdatedByUserId { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public SeoMeta? Seo { get; set; }
    public ICollection<ContentVersion> Versions { get; set; } = [];
}

/// <summary>
/// 版本歷程（docs/08 §B-2）。
/// <para>
/// ⚠️ <b>這是功能單元「版本歷程與還原」，不是操作日誌</b>（不做操作日誌，§I）。
/// 它只涵蓋九個內容模型，涵蓋不到 <see cref="SiteSetting"/>、<see cref="MenuItem"/>、
/// <see cref="RolePermission"/> 與帳號異動 —— 那些變更沒有留痕，是已知並被接受的取捨。
/// </para>
/// </summary>
public sealed class ContentVersion
{
    public int Id { get; set; }
    public int ContentItemId { get; set; }
    public int VersionNo { get; set; }
    public string Title { get; set; } = string.Empty;

    /// <summary>
    /// JSON 完整快照：主幹欄位 ＋ 該型別專屬欄位 ＋ SeoMeta ＋ 所有關聯 ＋ 首頁版位設定。
    /// <para>
    /// 用 JSON 而不是「每個欄位一張歷史表」：還原是整筆還原，不需要對單一歷史欄位下條件查詢；
    /// 比對差異時在應用層 diff 兩份 JSON 即可。
    /// </para>
    /// <para>
    /// ⚠️ 序列化格式要有一份<b>獨立於 EF 的規格</b> —— 遷移期的匯入腳本走 Dapper 直寫，
    /// 它產生的快照必須與 API 產生的讀得通。
    /// </para>
    /// </summary>
    public string Snapshot { get; set; } = string.Empty;

    public string? Note { get; set; }
    public int? CreatedByUserId { get; set; }
    public DateTime CreatedAt { get; set; }

    public ContentItem ContentItem { get; set; } = null!;
}

/// <summary>
/// 送審單（docs/08 §B-3）。審核佇列畫面的主查詢就是 <c>(Status, SubmittedAt)</c>。
/// </summary>
public sealed class ContentReview
{
    public int Id { get; set; }
    public int ContentItemId { get; set; }
    public int VersionId { get; set; }
    public int SubmittedByUserId { get; set; }
    public DateTime SubmittedAt { get; set; }
    public ReviewStatus Status { get; set; } = ReviewStatus.Pending;
    public int? DecidedByUserId { get; set; }
    public DateTime? DecidedAt { get; set; }

    /// <summary>⚠️ <see cref="ReviewStatus.Rejected"/> 時<b>必填</b>（「退回需填原因」）。</summary>
    public string? DecisionNote { get; set; }

    /// <summary>送審時掃出的高風險字詞命中結果（JSON），供審核者重點檢視。</summary>
    public string? RiskFlags { get; set; }

    public ContentItem ContentItem { get; set; } = null!;
    public ContentVersion Version { get; set; } = null!;
}

/// <summary>
/// SEO 區塊（docs/08 §B-4），1:1 掛在 <see cref="ContentItem"/> 上。
/// <para>
/// ⚠️ <b>不要用 owned type</b> —— owned type 會被塞進主表，而這張表獨立存在的
/// 第一個理由就是<b>權限切分</b>：行銷角色可寫這張表、不可寫本文。
/// </para>
/// </summary>
public sealed class SeoMeta
{
    /// <summary>PK ＝ FK（1:1）。</summary>
    public int ContentItemId { get; set; }

    /// <summary>留空則由內容自動組出。</summary>
    public string? SeoTitle { get; set; }

    public string? MetaDescription { get; set; }
    public UploadedImage? OgImage { get; set; }
    public string? CanonicalOverride { get; set; }

    /// <summary>⚠️ 文章標籤種子為 1。與 <c>ContentItems.IncludeInSitemap</c> 是兩件事。</summary>
    public bool NoIndex { get; set; }

    /// <summary>JSON-LD 覆寫，一般情況留空由系統產生。</summary>
    public string? StructuredDataOverride { get; set; }

    /// <summary>
    /// <b>40–60 字直答式段落</b>，docs/03-seo-geo.md §4 ② 的 GEO 落地欄位。
    /// <para>要渲染成頁面第一段可見文字，不是只放進 meta。</para>
    /// </summary>
    public string? AiSummary { get; set; }

    public int? UpdatedByUserId { get; set; }
    public DateTime UpdatedAt { get; set; }

    public ContentItem ContentItem { get; set; } = null!;
}

/// <summary>
/// 高風險字詞清單（docs/08 §B-5、docs/02 §5 兩層防護的第二層）。
/// <para>表小、讀取頻繁 → API 啟動時整份載入記憶體。</para>
/// <para>⚠️ 警示<b>不阻擋輸入也不阻擋送審</b>，它是提示不是閘門。</para>
/// <para>本表為架構設計，具體用語之合法性請以主管機關函釋及院方法務意見為準。</para>
/// </summary>
public sealed class RiskTerm
{
    public int Id { get; set; }
    public string Term { get; set; } = string.Empty;
    public RiskTermCategory Category { get; set; }
    public string? Note { get; set; }
    public bool IsActive { get; set; } = true;
}
