using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Skin20.Api.Common;

/// <summary>
/// AI 語料索引在 Blob 上的格式（CLAUDE.md 決策 28）。
///
/// <para>
/// 三個檔刻意分開放在容器 <c>system-state</c> 的 <c>ai-index/</c> 底下：
/// </para>
/// <list type="table">
///   <item><term>manifest.json</term><description>約 50 KB。Timer 每輪<b>只讀它</b>就能判斷有沒有事要做 ——
///     合在一起的話，每 5 分鐘要下載整包 7 MB 只為了比對一串 id。</description></item>
///   <item><term>chunks.json.gz</term><description>約 1 MB。片段的中繼資料與純文字，不含向量。</description></item>
///   <item><term>vectors.f32</term><description>約 7 MB。<b>裸 float32（little-endian）</b>，
///     <c>count × dim</c>，建置時已做 L2 正規化。</description></item>
/// </list>
///
/// <para>
/// 🔴 <b>向量不可以放進 JSON。</b> 2,300 塊 × 768 維 = 177 萬個浮點數，
/// JSON 解析會是索引載入最貴的一步；裸位元組是一次
/// <see cref="MemoryMarshal.Cast{TFrom,TTo}(Span{TFrom})"/>，等於零成本。
/// </para>
///
/// <para>
/// 🔴 <b>容器不可以用 <c>media</c></b> —— 那是 blob 層級公開讀，等於把全站語料開放下載。
/// </para>
///
/// <para>
/// ⚠️ 這個檔案的相依上限與 <see cref="AiChunker"/> 相同（<c>tools/ai-index-inspect</c> 連結它）。
/// </para>
/// </summary>
public static class AiIndexFormat
{
    /// <summary>非公開容器。⚠️ 部署前要確認 Function App 的 Managed Identity 對它有
    /// <c>Storage Blob Data Contributor</c> —— 少了這個權限 Timer 會靜靜失敗，只有 log 看得到。</summary>
    public const string ContainerName = "system-state";

    public const string ManifestBlobName = "ai-index/manifest.json";
    public const string ChunksBlobName = "ai-index/chunks.json.gz";
    public const string VectorsBlobName = "ai-index/vectors.f32";

    /// <summary>
    /// 療程專屬 FAQ → 所屬療程（<c>FaqId, Title, UrlPath</c>）。參數：<c>@Now</c>、<c>@Ids</c>、
    /// <c>@RelationType</c>（TreatmentToFaq）、<c>@TreatmentType</c>。
    /// 一筆 FAQ 可能回多列 —— 呼叫端只採用<b>恰好一列</b>的（被多項療程共用就是通用 FAQ）。
    /// <para>
    /// 🔴 API（<c>AiIndexReadService</c>）與 <c>tools/ai-index-inspect --dry-run</c> 共用這一份 ——
    /// 兩邊各寫一份，dry-run 檢查的就是一份 API 根本不會產生的語料。
    /// </para>
    /// <para>⚠️ 標題取已發布快照、網址取即時值（決策 14／30）。</para>
    /// </summary>
    public const string FaqOwnersSql = $"""
        SELECT cr.ToContentItemId AS FaqId,
               COALESCE(NULLIF(JSON_VALUE(cv.Snapshot, '$.title'), ''), ci.Title) AS Title,
               ci.UrlPath
        FROM ContentRelations cr
        INNER JOIN ContentItems ci ON ci.Id = cr.FromContentItemId
        INNER JOIN ContentVersions cv ON cv.Id = ci.PublishedVersionId
        WHERE cr.RelationType = @RelationType AND cr.ToContentItemId IN @Ids
          AND ci.ContentType = @TreatmentType AND ci.UrlPath IS NOT NULL
          AND {Visibility.PublicFilter}
        """;

    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    /// <summary>
    /// 索引的狀態摘要。<see cref="Items"/> 是排序後的 <c>[ContentItemId, PublishedVersionId, 切塊版本]</c>
    /// （第三欄是 2026-10-01 加的，舊 manifest 只有兩欄，視為版本 1 —— 見 <see cref="AiChunker.Version"/>）
    /// —— 它就是「索引到哪了」的唯一真相，所以**不需要在資料庫加任何欄位**
    /// （docs/08 §0 決策二：不預留未定案的欄位）。
    /// </summary>
    public sealed record Manifest(
        DateTime BuiltAt,
        string Model,
        int Dim,
        int Count,
        bool IncludeMainSiteArticles,
        List<int[]> Items)
    {
        public static Manifest Empty(string model, int dim, bool includeMainSite) =>
            new(DateTime.MinValue, model, dim, 0, includeMainSite, []);

        /// <summary>ContentItemId → (PublishedVersionId, 切塊版本)。</summary>
        public Dictionary<int, (int Pv, int Chunker)> AsMap() =>
            Items.Where(p => p.Length >= 2).ToDictionary(p => p[0], p => (p[1], p.Length >= 3 ? p[2] : 1));
    }

    /// <summary>
    /// 一塊的中繼資料。屬性名刻意短 —— 這份檔案每個執行個體冷啟動時都要下載。
    /// </summary>
    public sealed record Chunk(
        int Ci,
        int Pv,
        byte T,
        string U,
        string Ti,
        string H,
        double W,
        bool Q,
        string X);

    /// <summary>float[] → 裸位元組（little-endian；x64 與 ARM64 都是 LE，不另做轉換）。</summary>
    public static byte[] ToBytes(IReadOnlyList<float> values)
    {
        var buffer = new byte[values.Count * sizeof(float)];
        var floats = MemoryMarshal.Cast<byte, float>(buffer.AsSpan());
        for (var i = 0; i < values.Count; i++) floats[i] = values[i];
        return buffer;
    }

    /// <summary>裸位元組 → float[]。</summary>
    public static float[] FromBytes(ReadOnlySpan<byte> bytes) => MemoryMarshal.Cast<byte, float>(bytes).ToArray();

    /// <summary>
    /// L2 正規化（就地）。
    /// <para>🔴 <b>建置時做一次，查詢時就不必再算模長</b> —— 餘弦相似度直接退化成內積。</para>
    /// </summary>
    public static void Normalize(float[] vector)
    {
        double sum = 0;
        foreach (var v in vector) sum += (double)v * v;
        if (sum <= 0) return;

        var inverse = 1.0 / Math.Sqrt(sum);
        for (var i = 0; i < vector.Length; i++) vector[i] = (float)(vector[i] * inverse);
    }

    /// <summary>
    /// 內積。兩邊都已正規化時就是餘弦相似度。
    /// <para>⚠️ 用 in-box 的 <c>System.Numerics.Tensors</c> 之前先想清楚要不要多一個套件 ——
    /// 2,300 × 768 在這個規模下，單純的迴圈也只是毫秒級。</para>
    /// </summary>
    public static float Dot(ReadOnlySpan<float> a, ReadOnlySpan<float> b)
    {
        var length = Math.Min(a.Length, b.Length);
        float sum = 0;
        for (var i = 0; i < length; i++) sum += a[i] * b[i];
        return sum;
    }

    /// <summary>一次檢索的一個結果：第幾塊、原始餘弦分數、乘上權重之後的排序分數。</summary>
    public readonly record struct Ranked(int Index, float RawScore, double WeightedScore);

    /// <summary>
    /// 依加權分數取前 <paramref name="topK"/> 塊，同一筆內容最多 <paramref name="perItem"/> 塊。
    /// <para>
    /// 🔴 <b>API 的檢索與 <c>tools/ai-index-inspect --query</c> 共用這一份</b> ——
    /// 校準 <c>AiIndex__MinScore</c> 時看到的分數必須就是線上判斷用的分數，
    /// 兩邊各寫一份排序，校準出來的門檻就不保證適用。
    /// </para>
    /// </summary>
    public static List<Ranked> Rank(
        ReadOnlySpan<float> query, IReadOnlyList<Chunk> chunks, float[] vectors, int dim, int topK, int perItem)
    {
        var scored = new Ranked[chunks.Count];
        for (var i = 0; i < chunks.Count; i++)
        {
            var raw = Dot(query, vectors.AsSpan(i * dim, dim));
            scored[i] = new Ranked(i, raw, raw * chunks[i].W);
        }

        var perItemCount = new Dictionary<int, int>();
        var result = new List<Ranked>(topK);

        foreach (var hit in scored.OrderByDescending(h => h.WeightedScore))
        {
            var ci = chunks[hit.Index].Ci;
            var used = perItemCount.GetValueOrDefault(ci);
            if (used >= perItem) continue;

            perItemCount[ci] = used + 1;
            result.Add(hit);
            if (result.Count >= topK) break;
        }

        return result;
    }
}
