namespace Skin20.Api.Models.Dtos;

// ── 九個內容單元共用的傳輸物件（docs/10-api.md §3.3）──────────────────────
//
// ⚠️ 設計取捨（已於回報中說明）：九個模型的型別專屬欄位差異很大，這裡刻意不寫
// 「九個模型 × 讀／寫」共 18 支強型別類別，改用 Dictionary<string, object?> 承載
// 型別專屬欄位（ContentDetailDto.Fields／ContentSaveRequest 直接讀 JsonElement）。
// 這不是引入 AutoMapper 或反射映射——每個欄位仍由 Handler 裡逐一手寫的 switch 讀寫，
// 只是省去 18 個幾乎只用一次的資料類別。詳見 ContentHandler 的欄位對照表。

/// <summary>後台清單一列（docs/10 §3.3 GET /admin/{unit}）。</summary>
public sealed record ContentListItemDto(
    int Id,
    string Unit,
    string Title,
    string? Slug,
    string? UrlPath,
    byte Status,
    string StatusName,
    string EffectiveStatus,
    DateTime? PublishAt,
    DateTime? UnpublishAt,
    int SortOrder,
    bool IncludeInSitemap,
    bool IsSystemLocked,
    int? OwnerUserId,
    int? CategoryTermId,
    string? CategoryTitle,
    DateTime UpdatedAt);

/// <summary>單筆內容詳情（docs/10 §3.3 GET /admin/{unit}/{id}）。</summary>
public sealed record ContentDetailDto(
    int Id,
    string Unit,
    byte ContentType,
    string? Slug,
    string? UrlPath,
    string Title,
    byte Status,
    string StatusName,
    string EffectiveStatus,
    DateTime? PublishAt,
    DateTime? UnpublishAt,
    int? PublishedVersionId,
    int SortOrder,
    bool IncludeInSitemap,
    bool IsSystemLocked,
    int? OwnerUserId,
    int? CreatedByUserId,
    int? UpdatedByUserId,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    Dictionary<string, object?> Fields,
    SeoMetaDto? Seo,
    IReadOnlyList<RelationItemDto> Relations);

/// <summary>SEO 區塊（docs/08 §B-4）。</summary>
public sealed record SeoMetaDto(
    string? SeoTitle,
    string? MetaDescription,
    UploadedImageDto? OgImage,
    string? CanonicalOverride,
    bool NoIndex,
    string? StructuredDataOverride,
    string? AiSummary,
    int? UpdatedByUserId,
    DateTime? UpdatedAt);

/// <summary><c>PUT /admin/{unit}/{id}/seo</c> 的請求body（docs/10 §3.3）。</summary>
public sealed class SeoSaveRequest
{
    public string? SeoTitle { get; set; }
    public string? MetaDescription { get; set; }
    public UploadedImageDto? OgImage { get; set; }
    public string? CanonicalOverride { get; set; }
    public bool NoIndex { get; set; }
    public string? StructuredDataOverride { get; set; }
    public string? AiSummary { get; set; }
}

/// <summary>一筆關聯，正向與反向查詢共用（docs/08 §D）。</summary>
public sealed record RelationItemDto(
    int ToContentItemId,
    byte ToContentType,
    byte RelationType,
    int SortOrder,
    string? Note,
    string? ToTitle,
    string? ToUrlPath);

/// <summary><c>PUT /admin/{unit}/{id}/relations</c> 的單筆請求項。</summary>
public sealed class RelationSaveItem
{
    public byte RelationType { get; set; }
    public int ToContentItemId { get; set; }
    public int SortOrder { get; set; }
    public string? Note { get; set; }
}

/// <summary><c>PUT /admin/{unit}/sort</c> 的單筆請求項。</summary>
public sealed class SortSaveItem
{
    public int Id { get; set; }
    public int SortOrder { get; set; }
}

/// <summary><c>PATCH /admin/{unit}/{id}/schedule</c> 的請求body（docs/10 §3.3）。</summary>
public sealed class ScheduleRequest
{
    public DateTime? PublishAt { get; set; }
    public DateTime? UnpublishAt { get; set; }
}

/// <summary>
/// <c>PATCH /admin/{unit}/{id}/publish</c> 的請求body。
/// <para><see cref="Action"/> 為 <c>publish</c> 或 <c>unpublish</c>（docs/10 §3.3 「直接發布／下架」）。</para>
/// </summary>
public sealed class PublishRequest
{
    public string Action { get; set; } = string.Empty;
}

/// <summary>版本清單一列（docs/10 §3.3 GET /admin/{unit}/{id}/versions）。</summary>
public sealed record VersionListItemDto(
    int Id, int VersionNo, string Title, string? Note, int? CreatedByUserId, DateTime CreatedAt);

/// <summary>單一版本詳情（docs/10 §3.3 GET .../versions/{no}）。<see cref="Snapshot"/> 為原始 JSON 字串，供前端自行 parse 做差異比對。</summary>
public sealed record VersionDetailDto(
    int Id, int VersionNo, string Title, string? Note, int? CreatedByUserId, DateTime CreatedAt, string Snapshot);

// ── ContentVersions.Snapshot 的 JSON 形狀（docs/11-backend-design.md §8）─────
//
// 🔴 這是獨立於 EF 的規格：遷移期的匯入腳本走 Dapper 直寫 ContentVersions.Snapshot，
// 產生的 JSON 必須符合下面這個形狀（camelCase 屬性名），API 的還原邏輯（見
// ContentHandler.RestoreVersionAsync）才讀得懂。刻意不做成強型別類別直接
// (De)serialize——寫入端（ContentHandler.SaveVersionAsync）用匿名物件產生，
// 讀取端只需要用到其中幾個欄位，用 JsonDocument 逐一取用即可，型別類別在兩邊
// 都用不到、只會多一份要同步維護的說明。
//
// {
//   "id": number,                        // ContentItems.Id
//   "unit": string,                      // 單元代號（docs/10 §3.3 的 9 個之一）
//   "contentType": number,               // ContentType（docs/08 §B-1）
//   "slug": string | null,
//   "urlPath": string | null,
//   "title": string,
//   "sortOrder": number,
//   "includeInSitemap": boolean,
//   "ownerUserId": number | null,
//   "fields": { ... },                   // 型別專屬欄位，鍵名與 ContentDetailDto.Fields 一致
//   "seo": SeoMetaDto | null,
//   "relations": RelationItemDto[],
//   "homeSections": object | null        // 只有 unit="page" 且 SystemKey="home" 時才非 null
// }
