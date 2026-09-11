using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Skin20.Api.Common;
using Skin20.Api.Data;
using Skin20.Api.Models.Dtos;
using Skin20.Api.Models.Entities;
using Skin20.Api.Services;
using Skin20.Api.Services.Dapper;

namespace Skin20.Api.Handlers;

/// <summary>
/// docs/10 §3.4：媒體庫。
/// ⚠️ 檔案**不經過 API 的 request body** —— 瀏覽器直傳 Blob（docs/09 §9）。
/// ⚠️ 直傳模式下伺服器端**驗不了 magic bytes**，補救在 <see cref="RegisterAsync"/> 讀回檔頭驗證，
/// 不通過就把 blob 刪掉（docs/11 §9）。
///
/// <para>
/// ⚠️ 分層鐵律（docs/11 §2）：Handler 內<b>禁止直接寫 SQL</b> —— 讀走 Dapper ReadService、
/// 寫走 <c>Skin20DbContext</c>；<b>禁止重複檢查權限碼</b> —— 授權集中在 <c>AppRouter</c>，
/// 唯一例外是資料列擁有者判定（§5.4）。
/// </para>
/// </summary>
public sealed class MediaHandler(
    Skin20DbContext db, IBlobStorageService blobStorage, ISqlConnectionFactory sqlFactory, IConfiguration configuration)
{
    private readonly MediaReadService reads = new(sqlFactory);

    /// <summary>
    /// 公開圖片容器：只放圖片，內容等同對外發佈（docs/11 §9 第 3 條）。
    /// 名稱來自 <c>local.settings.example.json</c> 已建立的設定鍵，本組沿用不重新命名。
    /// </summary>
    private readonly string publicContainer = configuration["BLOB_PUBLIC_CONTAINER"] ?? "media";

    /// <summary>非圖片或需私有存取的檔案（如內部 PDF），走讀取 SAS。</summary>
    private readonly string privateContainer = configuration["BLOB_PRIVATE_CONTAINER"] ?? "media-private";

    /// <summary>公開圖片容器允許的副檔名。私有容器另外接受 <c>.pdf</c>（見下方）。</summary>
    private static readonly HashSet<string> AllowedImageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

    /// <summary>⚠️ 理想上應是 <c>Common/Constants.cs</c> 的設定值，本組不可碰該檔（見交付報告）。</summary>
    private const long MaxImageBytes = 10 * 1024 * 1024;

    private const long MaxFileBytes = 20 * 1024 * 1024;

    private bool IsKnownContainer(string? containerName)
        => containerName == publicContainer || containerName == privateContainer;

    public async Task<IActionResult> RequestSasAsync(HttpRequest req)
    {
        var dto = await req.ReadFromJsonAsync<MediaSasRequestDto>(req.HttpContext.RequestAborted)
            ?? throw AppException.BadRequest(ErrorCodes.ValidationRequired, "缺少上傳請求內容。");

        if (string.IsNullOrWhiteSpace(dto.FileName))
            throw AppException.BadRequest(ErrorCodes.ValidationRequired, "缺少檔名。");

        var extension = Path.GetExtension(dto.FileName).ToLowerInvariant();
        if (extension == ".jpeg") extension = ".jpg"; // 對齊 MediaSniffer 判定出的副檔名

        string containerName;
        if (extension == ".pdf")
        {
            // 其他型別另開容器（docs/11 §9 第 3 條）——PDF 一律不進公開圖片容器。
            containerName = privateContainer;
        }
        else if (AllowedImageExtensions.Contains(extension))
        {
            containerName = dto.IsPrivate ? privateContainer : publicContainer;
        }
        else
        {
            throw AppException.BadRequest(ErrorCodes.UploadType, "不支援的檔案類型。");
        }

        var (blobPath, uploadUrl, expiresAt) = await blobStorage.CreateUploadSasAsync(
            containerName, extension, req.HttpContext.RequestAborted);

        return new OkObjectResult(ApiResponse.Ok(
            new MediaSasResponseDto(containerName, blobPath, uploadUrl, expiresAt)));
    }

    public async Task<IActionResult> ListAsync(HttpRequest req)
    {
        var ct = req.HttpContext.RequestAborted;
        var page = Paging.Page(req.Query["page"]);
        var pageSize = Paging.PageSize(req.Query["pageSize"]);

        bool? isPrivate = req.Query["isPrivate"].ToString() switch
        {
            "true" => true,
            "false" => false,
            _ => null,
        };

        var (items, totalCount) = await reads.ListAsync(page, pageSize, isPrivate, ct);

        return new OkObjectResult(ApiResponse.Ok(Paging.Build(items, totalCount, page, pageSize)));
    }

    public async Task<IActionResult> RegisterAsync(HttpRequest req)
    {
        var ct = req.HttpContext.RequestAborted;

        var dto = await req.ReadFromJsonAsync<MediaRegisterRequestDto>(ct)
            ?? throw AppException.BadRequest(ErrorCodes.ValidationRequired, "缺少回報內容。");

        if (!IsKnownContainer(dto.ContainerName))
            throw AppException.BadRequest(ErrorCodes.ValidationFormat, "未知的容器名稱。");

        if (string.IsNullOrWhiteSpace(dto.BlobPath) || string.IsNullOrWhiteSpace(dto.OriginalFileName))
            throw AppException.BadRequest(ErrorCodes.ValidationRequired, "缺少 blobPath 或原始檔名。");

        // ⚠️ 直傳模式下伺服器端驗不了上傳「過程」——驗證全部後移到這裡：
        // 下載整份內容、判定真實型別、量測大小、算雜湊（docs/11 §9）。
        var inspection = await blobStorage.InspectAsync(dto.ContainerName, dto.BlobPath, ct);
        var detection = MediaSniffer.Detect(inspection.Head);

        if (detection is null)
        {
            await blobStorage.DeleteAsync(dto.ContainerName, dto.BlobPath, ct);
            throw AppException.BadRequest(ErrorCodes.UploadType, "無法辨識檔案格式，不是允許的檔案類型。");
        }

        // 公開圖片容器只放圖片，撞到非圖片內容代表宣稱型別與真實型別不符，直接拒絕。
        if (!detection.IsImage && dto.ContainerName == publicContainer)
        {
            await blobStorage.DeleteAsync(dto.ContainerName, dto.BlobPath, ct);
            throw AppException.BadRequest(ErrorCodes.UploadType, "公開圖片容器只能存放圖片。");
        }

        var maxBytes = detection.IsImage ? MaxImageBytes : MaxFileBytes;
        if (inspection.ByteSize > maxBytes)
        {
            await blobStorage.DeleteAsync(dto.ContainerName, dto.BlobPath, ct);
            throw AppException.BadRequest(ErrorCodes.UploadSize, $"檔案大小超過上限（{maxBytes / 1024 / 1024} MB）。");
        }

        // SHA-256 去重（docs/08 §E-1）：內容相同就重用既有媒體，不留兩份一樣的位元組。
        var existing = await reads.GetByHashAsync(inspection.Sha256Hex, ct);
        if (existing is not null)
        {
            await blobStorage.DeleteAsync(dto.ContainerName, dto.BlobPath, ct);
            return new OkObjectResult(ApiResponse.Ok(existing, "檔案內容與現有媒體相同，已重複使用既有檔案。"));
        }

        var finalBlobPath = $"{inspection.Sha256Hex}{detection.Extension}";
        var publicUrl = await blobStorage.PromoteAsync(
            dto.ContainerName, dto.BlobPath, finalBlobPath, detection.ContentType, ct);

        var dimensions = detection.IsImage
            ? MediaSniffer.TryReadDimensions(detection.ContentType, inspection.Head)
            : null;

        var asset = new MediaAsset
        {
            ContainerName = dto.ContainerName,
            BlobPath = finalBlobPath,
            PublicUrl = publicUrl,
            OriginalFileName = dto.OriginalFileName,
            ContentType = detection.ContentType,
            ByteSize = inspection.ByteSize,
            Width = dimensions?.Width,
            Height = dimensions?.Height,
            ContentHash = inspection.Sha256Hex,
            AltText = dto.AltText,
            Caption = dto.Caption,
            IsPrivate = dto.ContainerName == privateContainer,
            UploadedByUserId = RequestContext.UserId(req),
            CreatedAt = Clock.UtcNow,
        };

        db.MediaAssets.Add(asset);
        await db.SaveChangesAsync(ct);

        var result = await reads.GetByIdAsync(asset.Id, ct)
            ?? throw new InvalidOperationException("媒體剛寫入卻讀不到，這是資料一致性錯誤。");

        return new OkObjectResult(ApiResponse.Ok(result, "上傳成功。"));
    }

    public async Task<IActionResult> DeleteAsync(string id)
    {
        if (!int.TryParse(id, out var mediaId))
            throw AppException.BadRequest(ErrorCodes.ValidationFormat, "id 格式錯誤。");

        var ct = default(CancellationToken);

        var asset = await reads.GetByIdAsync(mediaId, ct) ?? throw AppException.NotFound("媒體");

        var usages = await reads.GetUsagesAsync(mediaId, ct);
        if (usages.Count > 0)
        {
            var sample = string.Join("、", usages.Take(10).Select(u => u.Title));
            var suffix = usages.Count > 10 ? " 等" : "";
            throw AppException.Conflict(
                ErrorCodes.ConflictState, $"仍有 {usages.Count} 筆內容引用此媒體：{sample}{suffix}。");
        }

        var entity = await db.MediaAssets.FindAsync([mediaId], ct) ?? throw AppException.NotFound("媒體");
        db.MediaAssets.Remove(entity);
        await db.SaveChangesAsync(ct);

        // 先確定資料庫那筆已經刪除，再刪實體檔案——順序反過來的話，DB 刪失敗會留下
        // 「紀錄還在、檔案已經沒了」的斷鏈，比孤兒檔案更糟。
        await blobStorage.DeleteAsync(asset.ContainerName, asset.BlobPath, ct);

        return new OkObjectResult(ApiResponse.Ok(message: "已刪除。"));
    }
}
