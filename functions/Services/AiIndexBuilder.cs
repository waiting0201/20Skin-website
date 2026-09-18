using System.IO.Compression;
using System.Text.Json;
using Azure;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Skin20.Api.Common;
using Skin20.Api.Models.Entities;
using Skin20.Api.Services.Dapper;

namespace Skin20.Api.Services;

/// <summary>一輪的結果，只用於 log。</summary>
public sealed record AiIndexRefreshResult(int Added, int Changed, int Removed, int Remaining, int TotalChunks);

/// <summary>
/// 依「Blob 上的 manifest」與「資料庫現況」的差集，增量重建 AI 語料索引（CLAUDE.md 決策 28）。
///
/// <para>
/// 🔴 <b>全量建置就是「manifest 為空的增量」</b>，所以沒有第二套接線，也沒有本機建置腳本。
/// 全站約 2,500 塊分 25 批嵌入約兩分鐘，放得進 Timer 的 5 分鐘預算。
/// </para>
///
/// <para>
/// 🔴 <b>索引到哪了，狀態存在 Blob 的 manifest 裡，不在資料庫。</b>
/// 這是「0 支 migration」的關鍵 —— docs/08 §0 決策二說得很清楚：
/// 「加一個用不到的欄位事小，為它做一次遷移事大」，而這個專案沒有 staging。
/// </para>
///
/// <para>
/// ⚠️ 每一輪的常態是「什麼都沒變」，所以那條路徑的成本必須極低：
/// 一次 50 KB 的 manifest 下載 ＋ 一句兩個 int 的 SQL。
/// </para>
/// </summary>
public sealed class AiIndexBuilder(
    IAiIndexReadService reads,
    IAiEmbeddingService embeddings,
    AiIndexService indexService,
    BlobServiceClient blobService,
    IConfiguration configuration,
    ILogger<AiIndexBuilder> logger)
{
    /// <summary>
    /// 單輪最多處理幾筆內容。
    /// <para>⚠️ 這是對 Gemini 的請求量與對 Azure SQL Basic（5 DTU）的讀取量的共同上界。
    /// 沒處理完不是錯誤，下一輪接著補（同 <c>SearchTextBackfill</c> 的語氣）。</para>
    /// </summary>
    private const int MaxItemsPerRun = 80;

    /// <summary>
    /// 主站舊文（<c>sourceSite == 1</c>，692 篇社群行銷貼文）收不收進語料。
    /// <para>
    /// Tim 2026-09-18 定案<b>收</b>（降權 ＋ 不可引用，見 <see cref="AiChunker"/>）。
    /// 做成設定是因為那是一次性的架構決定、不是院方的日常操作 ——
    /// 要翻預設只需要改一個 app setting 再讓 Timer 重建一次，不必改程式、不必動後台。
    /// </para>
    /// </summary>
    private bool IncludeMainSiteArticles =>
        configuration["AiIndex:IncludeMainSiteArticles"] is not ("false" or "False" or "0");

    public async Task<AiIndexRefreshResult> RefreshAsync(TimeSpan budget, CancellationToken ct = default)
    {
        var startedAt = DateTime.UtcNow;
        var container = blobService.GetBlobContainerClient(AiIndexFormat.ContainerName);
        await container.CreateIfNotExistsAsync(cancellationToken: ct);

        var (manifest, chunks, vectors, etag) = await LoadCurrentAsync(container, ct);

        // 模型或維度換了就整批重建 —— 兩批不同模型的向量混在一起，比對出來的分數沒有意義。
        if (manifest.Model != embeddings.ModelId || manifest.Dim != embeddings.Dimensions
            || manifest.IncludeMainSiteArticles != IncludeMainSiteArticles)
        {
            if (manifest.Count > 0)
            {
                logger.LogInformation("AI 語料索引設定改變（模型／維度／語料範圍），整批重建。");
            }
            manifest = AiIndexFormat.Manifest.Empty(embeddings.ModelId, embeddings.Dimensions, IncludeMainSiteArticles);
            chunks = [];
            vectors = [];
        }

        var indexed = manifest.AsMap();
        var stamps = await reads.GetStampsAsync(ct);
        var live = stamps.ToDictionary(s => s.Id, s => s.PublishedVersionId);

        var removed = indexed.Keys.Where(id => !live.ContainsKey(id)).ToHashSet();
        var added = live.Keys.Where(id => !indexed.ContainsKey(id)).ToList();
        var changed = live.Where(kv => indexed.TryGetValue(kv.Key, out var v) && v != kv.Value)
            .Select(kv => kv.Key).ToList();

        if (removed.Count == 0 && added.Count == 0 && changed.Count == 0)
        {
            return new AiIndexRefreshResult(0, 0, 0, 0, chunks.Count);
        }

        // 🔴 「消失」優先且不受單輪上限 —— 刪除不用呼叫 Gemini，幾乎免費，
        //    而「內容已下架、AI 還在引用那個現在會 404 的網址」是最糟的一種不同步。
        //    醫療內容下架通常有理由（寫錯了、法規要求）。
        var stale = new HashSet<int>(removed);

        var budgetLeft = () => DateTime.UtcNow - startedAt < budget;
        var todo = added.Concat(changed).Take(MaxItemsPerRun).ToList();
        var processed = new List<AiIndexFormat.Chunk>();
        var processedVectors = new List<float[]>();
        var done = 0;

        if (todo.Count > 0)
        {
            var termUrls = await reads.GetTermUrlsAsync(ct);
            var snapshots = await reads.GetSnapshotsAsync(todo, ct);

            var pending = new List<AiChunker.AiChunk>();
            foreach (var row in snapshots)
            {
                stale.Add(row.Id);
                done++;

                if (!IncludeMainSiteArticles && IsLegacyMainSiteArticle(row)) continue;

                pending.AddRange(AiChunker.Build(new AiChunker.AiChunkSource(
                    row.Id, row.PublishedVersionId, row.ContentType, ResolveUrl(row, termUrls), row.Snapshot)));
            }

            for (var i = 0; i < pending.Count && budgetLeft(); i += GeminiService.EmbedBatchSize)
            {
                var batch = pending.Skip(i).Take(GeminiService.EmbedBatchSize).ToList();
                var embedded = await embeddings.EmbedDocumentsAsync(
                    batch.Select(c => c.EmbeddingInput).ToList(), ct);

                for (var j = 0; j < batch.Count; j++)
                {
                    var c = batch[j];
                    processed.Add(new AiIndexFormat.Chunk(
                        c.ContentItemId, c.PublishedVersionId, c.ContentType,
                        c.Url, c.Title, c.Heading, c.Weight, c.Citable, c.Text));
                    processedVectors.Add(embedded[j]);
                }
            }

            // 預算用完時，沒嵌到的那些內容不能算已索引 —— 把它們排除在這一輪之外，
            // 下一輪會因為 manifest 裡仍然沒有它們而重新撿起來。
            var embeddedItems = processed.Select(c => c.Ci).ToHashSet();
            foreach (var id in todo.Where(id => !embeddedItems.Contains(id) && !indexed.ContainsKey(id)))
            {
                stale.Remove(id);
            }
        }

        // 合併：舊的扣掉這一輪動到的，再接上新算的。
        var keptChunks = new List<AiIndexFormat.Chunk>(chunks.Count);
        var keptVectors = new List<float>(vectors.Length);
        var dim = embeddings.Dimensions;

        for (var i = 0; i < chunks.Count; i++)
        {
            if (stale.Contains(chunks[i].Ci)) continue;
            keptChunks.Add(chunks[i]);
            keptVectors.AddRange(vectors.AsSpan(i * dim, dim).ToArray());
        }

        keptChunks.AddRange(processed);
        foreach (var vector in processedVectors) keptVectors.AddRange(vector);

        var keptItems = keptChunks.Select(c => (c.Ci, c.Pv)).Distinct()
            .Select(p => new[] { p.Ci, p.Pv })
            .OrderBy(p => p[0])
            .ToList();

        var next = new AiIndexFormat.Manifest(
            DateTime.UtcNow, embeddings.ModelId, dim, keptChunks.Count, IncludeMainSiteArticles, keptItems);

        await UploadAsync(container, next, keptChunks, keptVectors, etag, ct);
        indexService.Invalidate();

        var remaining = added.Count + changed.Count - done;
        return new AiIndexRefreshResult(added.Count, changed.Count, removed.Count, Math.Max(0, remaining), keptChunks.Count);
    }

    // ════════════════════════════════════════════════════════════════════

    private static bool IsLegacyMainSiteArticle(AiIndexSnapshotRow row)
    {
        if (row.ContentType != (byte)ContentType.Article) return false;

        try
        {
            var root = System.Text.Json.Nodes.JsonNode.Parse(row.Snapshot);
            return root?["fields"]?["sourceSite"]?.GetValue<int>() == 1;
        }
        catch (JsonException) { return false; }
    }

    /// <summary>FAQ 沒有獨立網址，指到所屬分類頁 —— 與 <c>SearchHandler</c> 同一條規則。</summary>
    private static string? ResolveUrl(AiIndexSnapshotRow row, IReadOnlyDictionary<int, string> termUrls)
    {
        if (!string.IsNullOrEmpty(row.UrlPath)) return row.UrlPath;
        if (row.ContentType != (byte)ContentType.Faq) return null;

        try
        {
            var categoryId = System.Text.Json.Nodes.JsonNode
                .Parse(row.Snapshot)?["fields"]?["categoryTermId"]?.GetValue<int>();
            return categoryId is null ? null : termUrls.GetValueOrDefault(categoryId.Value);
        }
        catch (JsonException) { return null; }
    }

    private async Task<(AiIndexFormat.Manifest Manifest, List<AiIndexFormat.Chunk> Chunks, float[] Vectors, ETag? ETag)>
        LoadCurrentAsync(BlobContainerClient container, CancellationToken ct)
    {
        var empty = AiIndexFormat.Manifest.Empty(embeddings.ModelId, embeddings.Dimensions, IncludeMainSiteArticles);
        var manifestBlob = container.GetBlobClient(AiIndexFormat.ManifestBlobName);

        if (!await manifestBlob.ExistsAsync(ct)) return (empty, [], [], null);

        try
        {
            var download = await manifestBlob.DownloadContentAsync(ct);
            var manifest = JsonSerializer.Deserialize<AiIndexFormat.Manifest>(
                download.Value.Content.ToArray(), AiIndexFormat.Json) ?? empty;

            var chunkStream = (await container.GetBlobClient(AiIndexFormat.ChunksBlobName)
                .DownloadContentAsync(ct)).Value.Content.ToStream();
            await using var unzip = new GZipStream(chunkStream, CompressionMode.Decompress);
            var chunks = await JsonSerializer.DeserializeAsync<List<AiIndexFormat.Chunk>>(
                unzip, AiIndexFormat.Json, ct) ?? [];

            var vectors = AiIndexFormat.FromBytes(
                (await container.GetBlobClient(AiIndexFormat.VectorsBlobName).DownloadContentAsync(ct))
                .Value.Content.ToArray());

            if (chunks.Count * manifest.Dim != vectors.Length)
            {
                logger.LogWarning("既有索引不一致，整批重建。");
                return (empty, [], [], download.Value.Details.ETag);
            }

            return (manifest, chunks, vectors, download.Value.Details.ETag);
        }
        catch (Exception ex) when (ex is RequestFailedException or JsonException)
        {
            logger.LogWarning(ex, "既有索引讀取失敗，整批重建。");
            return (empty, [], [], null);
        }
    }

    /// <summary>
    /// 寫回三個檔。
    /// <para>
    /// 🔴 <b>manifest 最後寫</b>：載入端以它的 <c>count × dim</c> 驗證另外兩個檔，
    /// 先寫 manifest 的話，讀到的就是「新的數量配舊的向量」。
    /// </para>
    /// <para>
    /// ⚠️ manifest 帶 <c>IfMatch</c>（第一次建立帶 <c>IfNoneMatch: *</c>）——
    /// Timer 在 Function App 內本來就是 singleton，但執行個體回收與手動觸發仍可能重疊，
    /// 而這只是幾行的保險。撞到就讓下一輪重來。
    /// </para>
    /// </summary>
    private async Task UploadAsync(
        BlobContainerClient container, AiIndexFormat.Manifest manifest,
        List<AiIndexFormat.Chunk> chunks, List<float> vectors, ETag? etag, CancellationToken ct)
    {
        using var chunkBuffer = new MemoryStream();
        await using (var gzip = new GZipStream(chunkBuffer, CompressionLevel.Optimal, leaveOpen: true))
        {
            await JsonSerializer.SerializeAsync(gzip, chunks, AiIndexFormat.Json, ct);
        }
        chunkBuffer.Position = 0;

        await container.GetBlobClient(AiIndexFormat.ChunksBlobName)
            .UploadAsync(chunkBuffer, overwrite: true, cancellationToken: ct);

        using var vectorBuffer = new MemoryStream(AiIndexFormat.ToBytes(vectors));
        await container.GetBlobClient(AiIndexFormat.VectorsBlobName)
            .UploadAsync(vectorBuffer, overwrite: true, cancellationToken: ct);

        using var manifestBuffer = new MemoryStream(JsonSerializer.SerializeToUtf8Bytes(manifest, AiIndexFormat.Json));
        var conditions = etag is { } tag
            ? new BlobRequestConditions { IfMatch = tag }
            : new BlobRequestConditions { IfNoneMatch = ETag.All };

        await container.GetBlobClient(AiIndexFormat.ManifestBlobName)
            .UploadAsync(manifestBuffer, new BlobUploadOptions { Conditions = conditions }, ct);
    }
}
