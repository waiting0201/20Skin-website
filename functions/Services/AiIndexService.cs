using System.IO.Compression;
using System.Text.Json;
using Azure;
using Azure.Storage.Blobs;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Skin20.Api.Common;

namespace Skin20.Api.Services;

/// <summary>命中的一塊與它的分數。</summary>
public sealed record AiIndexHit(AiIndexFormat.Chunk Chunk, float RawScore, double WeightedScore);

/// <summary>索引現況，給後台的唯讀狀態用。</summary>
public sealed record AiIndexStatus(DateTime BuiltAt, int ChunkCount, int IndexedItemCount, bool Ready);

/// <summary>
/// 把 Blob 上的語料索引載進記憶體，並做相似度比對（CLAUDE.md 決策 28）。
///
/// <para>
/// <b>Singleton</b>：它沒有 per-request 狀態，也不碰 <c>Skin20DbContext</c>（docs/11 §3.1 的分界）。
/// 首次使用時才載入 —— 與 <c>ContentHandler</c> 載入高風險字詞是同一個先例。
/// </para>
///
/// <para>
/// 🔴 <b>每 5 分鐘探一次 ETag，不是每次請求都下載。</b> 探測是一次 HEAD（數十毫秒），
/// ETag 沒變就什麼都不做。有了它，Timer 更新索引之後<b>不必重啟 Function App</b> 就會生效；
/// 沒有它，就得靠執行個體回收，而 Flex Consumption 的回收時機不是我們能控制的。
/// </para>
///
/// <para>
/// ⚠️ <b>載入失敗時保留舊的索引</b>（例如 chunks 與 vectors 更新到一半被讀到）——
/// 寧可回答得舊一點，也不要整個功能中斷五分鐘。
/// </para>
/// </summary>
public sealed class AiIndexService(
    BlobServiceClient blobService,
    IConfiguration configuration,
    ILogger<AiIndexService> logger)
{
    /// <summary>ETag 探測間隔。⚠️ 與 Timer 的週期相加就是「發布後多久 AI 才讀得到」的上界。</summary>
    private static readonly TimeSpan ProbeInterval = TimeSpan.FromMinutes(5);

    private readonly SemaphoreSlim gate = new(1, 1);
    private LoadedIndex? index;
    private DateTime lastProbeUtc = DateTime.MinValue;

    private sealed record LoadedIndex(
        AiIndexFormat.Manifest Manifest,
        IReadOnlyList<AiIndexFormat.Chunk> Chunks,
        float[] Vectors,
        int Dim,
        string ETag);

    /// <summary>
    /// 本機逃生門：設了就從本機目錄讀索引，不連 Blob。
    /// <para>理由與 <c>SQL_CONNECTION_STRING</c> 逐字相同 —— 否則本機要測 AI 就得先跑 Azurite。
    /// <b>正式環境不要設。</b></para>
    /// </summary>
    private string? LocalPath => configuration["AiIndex:LocalPath"];

    public async Task<AiIndexStatus> GetStatusAsync(CancellationToken ct = default)
    {
        var loaded = await EnsureLoadedAsync(ct);
        return loaded is null
            ? new AiIndexStatus(DateTime.MinValue, 0, 0, false)
            : new AiIndexStatus(loaded.Manifest.BuiltAt, loaded.Chunks.Count, loaded.Manifest.Items.Count, true);
    }

    /// <summary>
    /// 相似度檢索。<paramref name="query"/> 必須已正規化（<see cref="IAiEmbeddingService"/> 會做）。
    ///
    /// <para>
    /// 排序用<b>加權</b>分數（主站舊文降權），但「有沒有命中」要看<b>原始</b>分數 ——
    /// 呼叫端自己判斷，見 <c>AiHandler</c>。
    /// </para>
    /// <para>
    /// ⚠️ <b>同一筆內容最多留 <paramref name="perItem"/> 塊</b>：不限制的話，一篇長文就會
    /// 吃掉整個 top-K，回答會變成「把某一篇文章重講一次」。
    /// </para>
    /// </summary>
    public async Task<IReadOnlyList<AiIndexHit>> SearchAsync(
        float[] query, int topK, int perItem, CancellationToken ct = default)
    {
        var loaded = await EnsureLoadedAsync(ct);
        if (loaded is null || loaded.Chunks.Count == 0) throw Unavailable();

        var scored = new List<AiIndexHit>(loaded.Chunks.Count);
        for (var i = 0; i < loaded.Chunks.Count; i++)
        {
            var span = loaded.Vectors.AsSpan(i * loaded.Dim, loaded.Dim);
            var raw = AiIndexFormat.Dot(query, span);
            scored.Add(new AiIndexHit(loaded.Chunks[i], raw, raw * loaded.Chunks[i].W));
        }

        var perItemCount = new Dictionary<int, int>();
        var result = new List<AiIndexHit>(topK);

        foreach (var hit in scored.OrderByDescending(h => h.WeightedScore))
        {
            var used = perItemCount.GetValueOrDefault(hit.Chunk.Ci);
            if (used >= perItem) continue;

            perItemCount[hit.Chunk.Ci] = used + 1;
            result.Add(hit);
            if (result.Count >= topK) break;
        }

        return result;
    }

    /// <summary>Timer 寫完索引之後呼叫，讓這個執行個體立刻改讀新的（其他執行個體靠 ETag 探測）。</summary>
    public void Invalidate() => lastProbeUtc = DateTime.MinValue;

    // ════════════════════════════════════════════════════════════════════

    private async Task<LoadedIndex?> EnsureLoadedAsync(CancellationToken ct)
    {
        var current = index;
        if (current is not null && DateTime.UtcNow - lastProbeUtc < ProbeInterval) return current;

        await gate.WaitAsync(ct);
        try
        {
            current = index;
            if (current is not null && DateTime.UtcNow - lastProbeUtc < ProbeInterval) return current;

            var loaded = await LoadAsync(current, ct);
            lastProbeUtc = DateTime.UtcNow;
            if (loaded is not null) index = loaded;
            return index;
        }
        finally
        {
            gate.Release();
        }
    }

    private async Task<LoadedIndex?> LoadAsync(LoadedIndex? current, CancellationToken ct)
    {
        try
        {
            if (LocalPath is { Length: > 0 } localPath) return LoadLocal(localPath);

            var container = blobService.GetBlobContainerClient(AiIndexFormat.ContainerName);
            var manifestBlob = container.GetBlobClient(AiIndexFormat.ManifestBlobName);

            if (!await manifestBlob.ExistsAsync(ct))
            {
                if (current is null) logger.LogInformation("AI 語料索引尚未建立（等 AiIndexRefresh 跑第一輪）。");
                return null;
            }

            var properties = await manifestBlob.GetPropertiesAsync(cancellationToken: ct);
            var etag = properties.Value.ETag.ToString();
            if (current is not null && current.ETag == etag) return current;   // 沒變，不用下載

            var manifestBytes = (await manifestBlob.DownloadContentAsync(ct)).Value.Content.ToArray();
            var manifest = JsonSerializer.Deserialize<AiIndexFormat.Manifest>(manifestBytes, AiIndexFormat.Json)
                ?? throw new InvalidOperationException("manifest 無法解析");

            var chunkStream = (await container.GetBlobClient(AiIndexFormat.ChunksBlobName)
                .DownloadContentAsync(ct)).Value.Content.ToStream();
            var chunks = await ReadChunksAsync(chunkStream, ct);

            var vectorBytes = (await container.GetBlobClient(AiIndexFormat.VectorsBlobName)
                .DownloadContentAsync(ct)).Value.Content.ToArray();

            return Validate(manifest, chunks, AiIndexFormat.FromBytes(vectorBytes), etag, current);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // ⚠️ 保留舊索引。最可能的成因是「Timer 正在換檔，讀到兩個檔不同步的瞬間」，
            //    下一次探測就會好，沒有理由讓功能中斷。
            // ⚠️ 這裡刻意攔得寬：本機沒開 Azurite、Managed Identity 還沒授權到
            //    system-state 容器時，丟出來的是 Azure.Identity 的例外而不是 RequestFailedException，
            //    漏接會讓後台的「語料狀態」那一格整個 500。
            logger.LogWarning(ex, "AI 語料索引載入失敗，沿用上一份。");
            return current;
        }
    }

    private LoadedIndex LoadLocal(string localPath)
    {
        var manifest = JsonSerializer.Deserialize<AiIndexFormat.Manifest>(
            File.ReadAllBytes(Path.Combine(localPath, "manifest.json")), AiIndexFormat.Json)
            ?? throw new InvalidOperationException("manifest 無法解析");

        using var file = File.OpenRead(Path.Combine(localPath, "chunks.json.gz"));
        var chunks = ReadChunksAsync(file, CancellationToken.None).GetAwaiter().GetResult();
        var vectors = AiIndexFormat.FromBytes(File.ReadAllBytes(Path.Combine(localPath, "vectors.f32")));

        return Validate(manifest, chunks, vectors, $"local:{manifest.BuiltAt:O}", null);
    }

    private static async Task<List<AiIndexFormat.Chunk>> ReadChunksAsync(Stream stream, CancellationToken ct)
    {
        await using var unzip = new GZipStream(stream, CompressionMode.Decompress);
        return await JsonSerializer.DeserializeAsync<List<AiIndexFormat.Chunk>>(unzip, AiIndexFormat.Json, ct) ?? [];
    }

    /// <summary>
    /// 🔴 三個檔不是原子性一起換的，所以每次載入都要驗「塊數 × 維度 == 向量長度」。
    /// 對不上就是讀到了換檔的中間狀態 —— 沿用舊的，下一次探測會補上。
    /// </summary>
    private LoadedIndex Validate(
        AiIndexFormat.Manifest manifest, List<AiIndexFormat.Chunk> chunks, float[] vectors,
        string etag, LoadedIndex? current)
    {
        if (manifest.Dim <= 0 || chunks.Count * manifest.Dim != vectors.Length)
        {
            logger.LogWarning("AI 語料索引不一致（{Chunks} 塊 × {Dim} 維 ≠ {Floats} 個浮點數），沿用上一份。",
                chunks.Count, manifest.Dim, vectors.Length);

            return current ?? throw new InvalidOperationException("索引不一致且沒有可用的舊版本");
        }

        logger.LogInformation("AI 語料索引載入：{Chunks} 塊、{Dim} 維、建於 {BuiltAt:u}",
            chunks.Count, manifest.Dim, manifest.BuiltAt);

        return new LoadedIndex(manifest, chunks, vectors, manifest.Dim, etag);
    }

    private static AppException Unavailable() =>
        new(ErrorCodes.AiUnavailable, "線上諮詢暫時無法回覆，請稍後再試。", 503);
}
