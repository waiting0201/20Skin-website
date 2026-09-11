namespace Skin20.Api.Models.Dtos;

/// <summary>
/// 首頁版位（docs/08 §G-2）的讀取形狀。
/// 🔴 <see cref="Items"/> 只帶既有內容的展示欄位（<c>Title</c>／<c>UrlPath</c>），
/// <b>沒有任何自由文案欄位</b>——schema 裡本來就沒有，這裡也不該無中生有。
/// </summary>
public sealed record HomeSectionDto(
    int Id,
    string SectionKey,
    string Title,
    string? Subtitle,
    bool IsEnabled,
    int SortOrder,
    string? Settings,
    IReadOnlyList<HomeSectionItemDto> Items);

public sealed record HomeSectionItemDto(
    int Id,
    int ContentItemId,
    string ContentTitle,
    string? ContentUrlPath,
    byte ContentType,
    int SortOrder);

/// <summary>
/// <c>PUT /admin/home-section</c> 的請求。只列出要更新的版位即可，
/// <b>未列出的 <see cref="SectionKey"/> 一律拒絕</b>——七個版位是種子資料，不可新增刪除。
/// </summary>
public sealed record HomeSectionUpdateDto(
    string SectionKey,
    bool IsEnabled,
    int SortOrder,
    string? Settings,
    List<HomeSectionItemUpdateDto> Items);

public sealed record HomeSectionItemUpdateDto(int ContentItemId, int SortOrder);

public sealed record HomeSectionUpdateRequestDto(List<HomeSectionUpdateDto> Sections);
