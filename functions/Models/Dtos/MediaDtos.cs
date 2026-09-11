namespace Skin20.Api.Models.Dtos;

/// <summary>取得媒體上傳 SAS 的請求（<c>POST /admin/media/sas</c>）。</summary>
public sealed record MediaSasRequestDto(string FileName, string? DeclaredContentType, bool IsPrivate);

public sealed record MediaSasResponseDto(string ContainerName, string BlobPath, string UploadUrl, DateTimeOffset ExpiresAt);

/// <summary>瀏覽器直傳完成後的回報（<c>POST /admin/media</c>）。</summary>
public sealed record MediaRegisterRequestDto(
    string ContainerName,
    string BlobPath,
    string OriginalFileName,
    string? AltText,
    string? Caption);

public sealed record MediaListItemDto(
    int Id,
    string ContainerName,
    string BlobPath,
    string PublicUrl,
    string OriginalFileName,
    string ContentType,
    long ByteSize,
    int? Width,
    int? Height,
    string? AltText,
    string? Caption,
    bool IsPrivate,
    int UsageCount,
    DateTime CreatedAt);

/// <summary>刪除前的引用清單（docs/11 §9：「回 409 並說明在哪幾筆內容用到」）。</summary>
public sealed record MediaUsageRefDto(int ContentItemId, string Title, string? UrlPath, byte ContentType, byte UsageKind);
