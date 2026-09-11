using System.Security.Cryptography;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Azure.Storage.Sas;
using Microsoft.Extensions.Logging;
using Skin20.Api.Common;

namespace Skin20.Api.Services;

/// <summary>
/// docs/09 §9、docs/11 §9。SAS 以 Managed Identity 的 user delegation key 簽發，不存儲存體金鑰。
///
/// <para>
/// ⚠️ 直傳模式下伺服器端驗不了上傳「過程」，所以驗證全部後移到<b>回報這一步</b>
/// （<see cref="InspectAsync"/>）：下載整份內容、算 magic bytes 與 SHA-256。
/// 驗證通過後用 <see cref="PromoteAsync"/> 把 SAS 簽發時的隨機檔名換成內容雜湊命名的正式路徑
/// （docs/08 §E-1），同時補上長效 <c>Cache-Control</c>（架構中沒有 CDN，靠這個機制長期快取）。
/// </para>
/// </summary>
public sealed class BlobStorageService(BlobServiceClient blobServiceClient, ILogger<BlobStorageService> logger)
    : IBlobStorageService
{
    /// <summary>
    /// SAS 有效期。⚠️ 短效是刻意的：延長這個值不會讓上傳體驗變好（瀏覽器拿到就立刻 PUT），
    /// 只會拉長「已簽出但還沒用掉」的 SAS 可被濫用的時間窗。
    /// </summary>
    private static readonly TimeSpan SasLifetime = TimeSpan.FromMinutes(5);

    /// <summary>正式上線後應搬進 <c>Common/Constants.cs</c>（本組不可碰該檔，見交付報告）。</summary>
    private const string TempPrefix = "incoming/";

    public async Task<(string BlobPath, string UploadUrl, DateTimeOffset ExpiresAt)> CreateUploadSasAsync(
        string containerName, string extension, CancellationToken ct = default)
    {
        // 🔴 blob 名稱由伺服器決定，不採用前端送來的檔名（docs/11 §9 第 1 條）。
        // 暫時放在 incoming/ 前綴下，等 RegisterAsync 驗證通過後才由 PromoteAsync
        // 搬到以內容雜湊命名的正式路徑——這個時候還不知道內容，只能先給一個隨機名稱。
        var blobPath = $"{TempPrefix}{Guid.NewGuid():N}{extension}";

        var containerClient = blobServiceClient.GetBlobContainerClient(containerName);
        var blobClient = containerClient.GetBlobClient(blobPath);

        var now = Clock.UtcNow;
        // 允許 5 分鐘時間飄移（伺服器與用戶端時鐘可能有小落差）。
        var keyStartsOn = new DateTimeOffset(now.AddMinutes(-5), TimeSpan.Zero);
        var expiresOn = new DateTimeOffset(now.Add(SasLifetime), TimeSpan.Zero);

        var userDelegationKey = await blobServiceClient
            .GetUserDelegationKeyAsync(keyStartsOn, expiresOn, ct)
            .ConfigureAwait(false);

        var sasBuilder = new BlobSasBuilder
        {
            BlobContainerName = containerName,
            BlobName = blobPath,
            Resource = "b", // 限定單一 blob，不是整個容器
            StartsOn = keyStartsOn,
            ExpiresOn = expiresOn,
            Protocol = SasProtocol.Https,
        };
        // write-only：只給建立與寫入權限，瀏覽器讀不回、也列不出容器內容。
        sasBuilder.SetPermissions(BlobSasPermissions.Write | BlobSasPermissions.Create);

        var sasQuery = sasBuilder.ToSasQueryParameters(userDelegationKey, blobServiceClient.AccountName);

        var uploadUrlBuilder = new UriBuilder(blobClient.Uri) { Query = sasQuery.ToString() };

        return (blobPath, uploadUrlBuilder.Uri.ToString(), expiresOn);
    }

    public async Task<BlobInspectionResult> InspectAsync(
        string containerName, string blobPath, CancellationToken ct = default)
    {
        var blobClient = blobServiceClient.GetBlobContainerClient(containerName).GetBlobClient(blobPath);

        BlobDownloadResult download;
        try
        {
            download = await blobClient.DownloadContentAsync(ct).ConfigureAwait(false);
        }
        catch (Azure.RequestFailedException ex) when (ex.Status == 404)
        {
            throw AppException.NotFound("上傳的檔案");
        }

        var content = download.Content.ToArray();
        // 64 KB 足夠涵蓋 magic bytes 判定，也足夠涵蓋絕大多數 JPEG 的 SOF 標記位置
        // （EXIF 縮圖異常肥大的極少數案例會讓尺寸判讀失敗，MediaSniffer 對此已設計成
        // 「讀不到就回 null」，不影響上傳流程本身）。
        const int headByteCount = 64 * 1024;
        var head = content.Length <= headByteCount ? content : content[..headByteCount];
        var hash = Convert.ToHexStringLower(SHA256.HashData(content));

        return new BlobInspectionResult(head, content.Length, hash);
    }

    public async Task<string> PromoteAsync(
        string containerName, string tempBlobPath, string finalBlobPath, string contentType,
        CancellationToken ct = default)
    {
        var container = blobServiceClient.GetBlobContainerClient(containerName);
        var source = container.GetBlobClient(tempBlobPath);
        var destination = container.GetBlobClient(finalBlobPath);

        // 內容雜湊相同代表位元組完全相同（去重命中，docs/08 §E-1）——目的地已經是這份內容，
        // 不需要再搬一次，只要把暫存檔清掉即可。
        if (!string.Equals(tempBlobPath, finalBlobPath, StringComparison.Ordinal))
        {
            // 同一個儲存體帳戶內的伺服器端複製，用同一組 Managed Identity 授權，不需要額外簽 SAS。
            var copyOperation = await destination.SyncCopyFromUriAsync(source.Uri, cancellationToken: ct)
                .ConfigureAwait(false);
            _ = copyOperation;

            await source.DeleteIfExistsAsync(cancellationToken: ct).ConfigureAwait(false);
        }

        // 內容雜湊命名的 blob 內容永遠不變（換內容就是換檔名），可以放心用 immutable 長效快取——
        // 架構中沒有 CDN，這是唯一的快取層（docs/07 §3）。
        await destination.SetHttpHeadersAsync(new BlobHttpHeaders
        {
            ContentType = contentType,
            CacheControl = "public, max-age=31536000, immutable",
        }, cancellationToken: ct).ConfigureAwait(false);

        return destination.Uri.ToString();
    }

    public async Task DeleteAsync(string containerName, string blobPath, CancellationToken ct = default)
    {
        try
        {
            await blobServiceClient.GetBlobContainerClient(containerName)
                .GetBlobClient(blobPath)
                .DeleteIfExistsAsync(cancellationToken: ct)
                .ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            // 刪除孤兒/驗證失敗的 blob 不是使用者請求成敗的關鍵路徑——刪不掉就記警告，
            // 留給 docs/08 §E-1 提到的對帳工具事後處理，不要讓這裡的失敗掩蓋原本的錯誤。
            logger.LogWarning(ex, "刪除 blob 失敗：{Container}/{BlobPath}", containerName, blobPath);
        }
    }
}
