using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Skin20.Api.Common;
using Skin20.Api.Models.Dtos;
using Skin20.Api.Services;

namespace Skin20.Api.Handlers;

/// <summary>
/// docs/10 §3.4：上傳。
/// <para>
/// ⚠️ <b>不是媒體庫</b>（2026-09-11 定案）——沒有清單、沒有刪除端點，也沒有 <c>MediaAssets</c> 表。
/// 上傳完成後回傳一組圖片值，由前端塞進內容欄位，隨內容一起存（docs/08 §0 決策五）。
/// 舊檔案的清除是<b>內容存檔時</b>的事，見 <see cref="ContentHandler"/>。
/// </para>
/// <para>
/// ⚠️ 檔案<b>不經過 API 的 request body</b>——瀏覽器直傳 Blob（docs/09 §9）。
/// 直傳模式下伺服器端驗不了 magic bytes，補救在 <see cref="CommitAsync"/> 讀回檔頭驗證，
/// 不通過就把 blob 刪掉（docs/11 §9）。
/// </para>
/// <para>
/// ⚠️ 分層鐵律（docs/11 §2）：Handler 內<b>禁止直接寫 SQL</b>；<b>禁止重複檢查權限碼</b>——
/// 授權集中在 <c>AppRouter</c>。本 Handler 完全不碰資料庫。
/// </para>
/// </summary>
public sealed class UploadHandler(IBlobStorageService blobStorage, IConfiguration configuration)
{
    /// <summary>
    /// 公開圖片容器：只放圖片，內容等同對外發佈（docs/11 §9 第 3 條）。
    /// 名稱來自 <c>local.settings.example.json</c> 已建立的設定鍵。
    /// </summary>
    private readonly string publicContainer = configuration["BLOB_PUBLIC_CONTAINER"] ?? "media";

    /// <summary>
    /// 允許的副檔名。
    /// ⚠️ <b>只收圖片</b>：拿掉媒體庫之後，非圖片檔案在後台沒有任何欄位可以承接
    /// （docs/02 §4）。日後要放 PDF 是「內文檔案區塊」這個獨立需求，不是這裡放寬一個副檔名。
    /// </summary>
    private static readonly HashSet<string> AllowedImageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

    private const long MaxImageBytes = 10 * 1024 * 1024;

    public async Task<IActionResult> RequestSasAsync(HttpRequest req)
    {
        var dto = await req.ReadFromJsonAsync<UploadSasRequestDto>(req.HttpContext.RequestAborted)
            ?? throw AppException.BadRequest(ErrorCodes.ValidationRequired, "缺少上傳請求內容。");

        if (string.IsNullOrWhiteSpace(dto.FileName))
            throw AppException.BadRequest(ErrorCodes.ValidationRequired, "缺少檔名。");

        var extension = Path.GetExtension(dto.FileName).ToLowerInvariant();
        if (extension == ".jpeg") extension = ".jpg"; // 對齊 MediaSniffer 判定出的副檔名

        if (!AllowedImageExtensions.Contains(extension))
            throw AppException.BadRequest(ErrorCodes.UploadType, "不支援的檔案類型，只能上傳圖片。");

        var (blobPath, uploadUrl, expiresAt) = await blobStorage.CreateUploadSasAsync(
            publicContainer, extension, req.HttpContext.RequestAborted);

        return new OkObjectResult(ApiResponse.Ok(new UploadSasResponseDto(blobPath, uploadUrl, expiresAt)));
    }

    public async Task<IActionResult> CommitAsync(HttpRequest req)
    {
        var ct = req.HttpContext.RequestAborted;

        var dto = await req.ReadFromJsonAsync<UploadCommitRequestDto>(ct)
            ?? throw AppException.BadRequest(ErrorCodes.ValidationRequired, "缺少回報內容。");

        if (string.IsNullOrWhiteSpace(dto.BlobPath) || string.IsNullOrWhiteSpace(dto.OriginalFileName))
            throw AppException.BadRequest(ErrorCodes.ValidationRequired, "缺少 blobPath 或原始檔名。");

        // ⚠️ 直傳模式下伺服器端驗不了上傳「過程」——驗證全部後移到這裡：
        // 下載整份內容、判定真實型別、量測大小（docs/11 §9）。
        var inspection = await blobStorage.InspectAsync(publicContainer, dto.BlobPath, ct);
        var detection = MediaSniffer.Detect(inspection.Head);

        if (detection is null || !detection.IsImage)
        {
            await blobStorage.DeleteAsync(publicContainer, dto.BlobPath, ct);
            throw AppException.BadRequest(ErrorCodes.UploadType, "檔案不是可辨識的圖片格式。");
        }

        if (inspection.ByteSize > MaxImageBytes)
        {
            await blobStorage.DeleteAsync(publicContainer, dto.BlobPath, ct);
            throw AppException.BadRequest(
                ErrorCodes.UploadSize, $"檔案大小超過上限（{MaxImageBytes / 1024 / 1024} MB）。");
        }

        // 🔴 不以內容雜湊命名、不做去重（docs/08 §0 決策五）。一個欄位獨佔一個 blob：
        //    沒有 MediaUsages 之後「還有誰在用這個檔案」無從查起，去重會讓內容存檔時的
        //    「刪掉換掉的舊檔」變成可能刪掉別人正在用的檔案。多存一份位元組比斷圖便宜。
        var now = Clock.UtcNow;
        var finalBlobPath = $"{now:yyyy}/{now:MM}/{Guid.NewGuid():N}{detection.Extension}";

        var publicUrl = await blobStorage.PromoteAsync(
            publicContainer, dto.BlobPath, finalBlobPath, detection.ContentType, ct);

        var dimensions = MediaSniffer.TryReadDimensions(detection.ContentType, inspection.Head);

        return new OkObjectResult(ApiResponse.Ok(
            new UploadedImageDto(finalBlobPath, publicUrl, dto.Alt, dimensions?.Width, dimensions?.Height, null),
            "上傳成功。"));
    }
}
