namespace Skin20.Api.Models.Dtos;

// ── 上傳（docs/10 §3.4）──────────────────────────────────────────────────
// ⚠️ 不做媒體庫（2026-09-11 定案）：沒有清單、沒有瀏覽、沒有刪除端點。
//    上傳的終點是「某一個內容欄位」，所以回報端點回傳的東西，就是那個欄位要存的東西。

/// <summary>取得上傳 SAS 的請求（<c>POST /admin/upload/sas</c>）。</summary>
/// <param name="FileName">只用來判定副檔名。⚠️ blob 名稱由伺服器決定，不採用這個檔名（docs/11 §9 第 1 條）。</param>
public sealed record UploadSasRequestDto(string FileName);

public sealed record UploadSasResponseDto(string BlobPath, string UploadUrl, DateTimeOffset ExpiresAt);

/// <summary>瀏覽器直傳完成後的回報（<c>POST /admin/upload/commit</c>）。</summary>
public sealed record UploadCommitRequestDto(string BlobPath, string OriginalFileName, string? Alt);

/// <summary>
/// 回報成功後的圖片值。
/// <para>
/// ⚠️ <b>這個形狀就是內容欄位裡存下來的形狀</b>（<see cref="Skin20.Api.Models.Entities.UploadedImage"/>，
/// docs/08 §0 決策五）。前端把它整包放進欄位，隨內容一起送 <c>PUT /admin/{unit}/{id}</c>。
/// 沒有 Id，因為它不是一筆獨立的資料。
/// </para>
/// </summary>
public sealed record UploadedImageDto(
    string BlobPath,
    string Url,
    string? Alt,
    int? Width,
    int? Height,
    string? Variants);

public static class UploadedImageDtoExtensions
{
    public static UploadedImageDto ToDto(this Entities.UploadedImage i)
        => new(i.BlobPath, i.Url, i.Alt, i.Width, i.Height, i.Variants);

    /// <summary>
    /// ⚠️ <c>url</c> 與 <c>blobPath</c> 必須原封不動來自 <c>POST /admin/upload/commit</c>——
    /// 少了 <c>blobPath</c>，這張圖被換掉時就找不到檔案可刪（docs/11 §9）。
    /// </summary>
    public static Entities.UploadedImage ToEntity(this UploadedImageDto d)
    {
        if (string.IsNullOrWhiteSpace(d.Url) || string.IsNullOrWhiteSpace(d.BlobPath))
            throw Common.AppException.BadRequest(Common.ErrorCodes.ValidationRequired, "圖片欄位缺少 url 或 blobPath。");

        return new Entities.UploadedImage
        {
            BlobPath = d.BlobPath,
            Url = d.Url,
            Alt = d.Alt,
            Width = d.Width,
            Height = d.Height,
            Variants = d.Variants,
        };
    }
}
