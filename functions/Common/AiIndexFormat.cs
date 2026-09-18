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

    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    /// <summary>
    /// 索引的狀態摘要。<see cref="Items"/> 是排序後的 <c>[ContentItemId, PublishedVersionId]</c>
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

        /// <summary>ContentItemId → PublishedVersionId。</summary>
        public Dictionary<int, int> AsMap() =>
            Items.Where(p => p.Length == 2).ToDictionary(p => p[0], p => p[1]);
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
}
