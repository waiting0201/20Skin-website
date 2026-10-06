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

    /// <summary>
    /// 一次檢索的一個結果：第幾塊、原始餘弦分數、加上標題關鍵字加分後的命中分數、
    /// 再乘上權重之後的排序分數。
    /// <para>⚠️ <b>「有沒有命中」看 <see cref="MatchScore"/></b>，不是 <see cref="RawScore"/> ——
    /// 後者只留給 log 與校準對照（看得出加分前後差多少）。</para>
    /// </summary>
    public readonly record struct Ranked(int Index, float RawScore, double MatchScore, double WeightedScore)
    {
        public bool Lexical => MatchScore > RawScore;
    }

    /// <summary>
    /// 標題關鍵字命中的加分。
    ///
    /// <para>
    /// 🔴 <b>為什麼需要它</b>（2026-10-02 正式站實測）：只打產品名「青萃光」，正確的文章
    /// <c>/blog/dermav/</c> 排第一、分數卻是 0.649，差 0.001 沒過門檻 0.65，於是回「找不到」。
    /// 語意向量比的是「意思像不像」，三個字的專有名詞幾乎沒有語意可比 ——
    /// 同一篇文章，問「DermaV 青萃光」是 0.791。使用者最常打的偏偏就是產品名。
    /// </para>
    /// <para>⚠️ 加分只動「命中與排序」，不改模型拿到的內容；改了這個值要重跑
    /// <c>tools/ai-index-inspect --query</c> 的驗收題組。</para>
    /// </summary>
    public const double LexicalBonus = 0.05;

    /// <summary>
    /// 關鍵字最短長度（正規化後的字元數）。
    /// <para>⚠️ 兩個字的「雷射」「皮秒」「痘疤」太泛用，比到的標題動輒上百筆。</para>
    /// <para>例外是<b>整句只有兩個字的實詞</b>，見 <see cref="ShortKeyword"/>。</para>
    /// </summary>
    private const int LexicalMinChars = 3;

    /// <summary>
    /// 一個字串最多出現在幾筆內容的標題裡，才算數。
    /// <para>
    /// ⚠️ <b>不可以靠這個數字分辨「專有名詞」與「虛詞」</b>：2026-10-02 實計 1185 個標題，
    /// 「矽谷電波」出現在 16 筆、「是什麼」只有 13 筆 —— 熱門療程名反而比虛詞常見。
    /// 虛詞由 <see cref="FunctionChars"/> 擋；這個上限只擋「皮秒雷射」（64 筆）這種
    /// 加了等於沒加、只會把排序攪亂的泛用詞。
    /// </para>
    /// </summary>
    private const int LexicalMaxItems = 30;

    /// <summary>
    /// 問句裡的虛詞用字。<b>整個片段都由這些字組成</b>的（「是什麼」「怎麼辦」「可以嗎」）不算關鍵字。
    /// <para>
    /// 🔴 少了這一步，「矽谷電波是什麼？」會替所有「○○是什麼」的文章加分。
    /// 只要片段裡有一個實詞就保留（「會痛嗎」的「痛」、「做雷射」的「雷射」）——
    /// 那種片段比到的標題本來就與問題相關。
    /// </para>
    /// </summary>
    private const string FunctionChars =
        "的了是在有和與及或嗎呢吧啊呀哪什麼甚怎樣為何如可以能會要想請問該需不沒很最多少幾個一這那些"
        + "我你妳您他她們它做到得過還就都也再又跟對從把被讓給說看呀喔嗯其實真";

    /// <summary>
    /// 依加權分數取前 <paramref name="topK"/> 塊，同一筆內容最多 <paramref name="perItem"/> 塊。
    /// <para>
    /// 🔴 <b>API 的檢索與 <c>tools/ai-index-inspect --query</c> 共用這一份</b> ——
    /// 校準 <c>AiIndex__MinScore</c> 時看到的分數必須就是線上判斷用的分數，
    /// 兩邊各寫一份排序，校準出來的門檻就不保證適用。
    /// </para>
    /// <para><paramref name="question"/> 是使用者原始問句，只用來做標題關鍵字比對（<see cref="LexicalBonus"/>）。</para>
    /// </summary>
    public static List<Ranked> Rank(
        ReadOnlySpan<float> query, string question, IReadOnlyList<Chunk> chunks, float[] vectors, int dim,
        int topK, int perItem)
    {
        var lexicalItems = LexicalMatches(question, chunks);

        var scored = new Ranked[chunks.Count];
        for (var i = 0; i < chunks.Count; i++)
        {
            var raw = Dot(query, vectors.AsSpan(i * dim, dim));
            var match = lexicalItems.Contains(chunks[i].Ci) ? raw + LexicalBonus : raw;
            scored[i] = new Ranked(i, raw, match, match * chunks[i].W);
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

    /// <summary>
    /// 問句與哪幾筆內容的<b>標題</b>共用一個關鍵字串（≥ <see cref="LexicalMinChars"/> 字、
    /// 不全是虛詞、出現在 ≤ <see cref="LexicalMaxItems"/> 筆內容的標題裡）。
    ///
    /// <para>
    /// 做法是拿問句的 3 字與 4 字片段去比標題，不做斷詞 —— 中文沒有空白，斷詞要另一套字典；
    /// 跨詞的片段（「光是什」）不會出現在任何標題裡，自然不算。
    /// </para>
    /// <para>
    /// ⚠️ 只比標題（<see cref="Chunk.Ti"/>），不比內文與段落標題：內文裡什麼詞都有，
    /// 比內文等於每一篇都加分。療程專屬 FAQ 的標題已換成療程名稱（<c>AiChunker</c>），一併受惠。
    /// </para>
    /// <para>⚠️ 每次查詢都重算（約一千個標題 × 數十個片段），不做快取 —— 毫秒級，而快取得跟著索引重載失效。</para>
    /// </summary>
    private static HashSet<int> LexicalMatches(string question, IReadOnlyList<Chunk> chunks)
    {
        var matched = new HashSet<int>();
        var q = NormalizeForMatch(question);

        var grams = new HashSet<string>();
        for (var n = LexicalMinChars; n <= LexicalMinChars + 1; n++)
            for (var i = 0; i + n <= q.Length; i++)
                grams.Add(q.Substring(i, n));
        var shortKeyword = ShortKeyword(q);
        if (grams.Count == 0 && shortKeyword is null) return matched;

        var titles = new Dictionary<int, string>();
        foreach (var c in chunks) titles.TryAdd(c.Ci, NormalizeForMatch(c.Ti));

        foreach (var gram in grams)
        {
            if (gram.All(ch => FunctionChars.Contains(ch))) continue;

            var hits = new List<int>();
            foreach (var (ci, title) in titles)
            {
                if (!title.Contains(gram, StringComparison.Ordinal)) continue;
                hits.Add(ci);
                if (hits.Count > LexicalMaxItems) break;
            }

            if (hits.Count is > 0 and <= LexicalMaxItems) matched.UnionWith(hits);
        }

        if (shortKeyword is not null)
        {
            // 標題或內文含這個詞的內容（以內容筆數計上限，不是塊數）。
            var hits = new HashSet<int>();
            foreach (var (ci, title) in titles)
                if (title.Contains(shortKeyword, StringComparison.Ordinal)) hits.Add(ci);
            foreach (var c in chunks)
            {
                if (hits.Count > LexicalMaxItems) break;
                if (!hits.Contains(c.Ci) && NormalizeForMatch(c.X).Contains(shortKeyword, StringComparison.Ordinal))
                    hits.Add(c.Ci);
            }

            if (hits.Count is > 0 and <= LexicalMaxItems) matched.UnionWith(hits);
        }

        return matched;
    }

    /// <summary>
    /// 問句去掉頭尾的虛詞之後只剩兩個字（「饅化」「饅化是什麼」「什麼是饅化」）時，那兩個字就是關鍵字。
    ///
    /// <para>
    /// 🔴 <b>為什麼需要它</b>（2026-10-06 回報）：「預防饅化」查得到、「饅化」查不到。
    /// 前者切得出 3、4 字片段比中「預防饅化」系列的 7 個標題；後者只有兩個字，一個片段都沒有，
    /// 而「饅化」是自創詞，語意向量也幾乎沒有東西可比 —— 與「青萃光」同一個問題，只是更短。
    /// </para>
    /// <para>
    /// ⚠️ <b>不可以放寬成「所有 2 字片段」</b>：長句會切出一堆跨詞或泛用的片段。
    /// 驗收題 #11「你們有賣防曬乳嗎」會切出「防曬」（8 筆標題），把一題該答不出來的推過門檻。
    /// 只剩兩個字代表使用者打的<b>就是</b>這個詞，沒有猜的成分。
    /// </para>
    /// <para>
    /// 🔴 <b>這一個詞連內文一起比</b>，不只比標題（與 3、4 字片段不同）：「饅化」的正解是 FAQ
    /// 「什麼是『預饅防化』？」—— 標題是文字遊戲，「饅化」只出現在內文的「饅化現象」；
    /// 而標題含「預防饅化」的 7 篇是主站舊文，不可引用，加了分也不算命中。
    /// 2026-10-06 正式索引實測：只打「饅化」最高 0.610，差 0.04 沒過門檻 0.65。
    /// 「內文什麼詞都有」的顧慮由 <see cref="LexicalMaxItems"/> 擋（「肉毒」「雷射」在內文裡遠超過 30 筆）。
    /// </para>
    /// <para>⚠️ 只修剪頭尾，不挖掉中間的虛詞 —— 「我該擦什麼藥」挖完會變成「擦藥」，那不是使用者打的詞。
    /// <see cref="LexicalMaxItems"/> 照樣適用，所以只打「雷射」「皮秒」不會加分。</para>
    /// </summary>
    private static string? ShortKeyword(string normalizedQuestion)
    {
        var core = normalizedQuestion.AsSpan();
        while (core.Length > 0 && FunctionChars.Contains(core[0])) core = core[1..];
        while (core.Length > 0 && FunctionChars.Contains(core[^1])) core = core[..^1];
        return core.Length == LexicalMinChars - 1 ? core.ToString() : null;
    }

    /// <summary>全形轉半形、轉小寫、只留文字與數字（標點與空白會讓「DermaV 青萃光」與「DermaV青萃光」比不到）。</summary>
    private static string NormalizeForMatch(string text)
    {
        var sb = new System.Text.StringBuilder(text.Length);
        foreach (var ch in text.Normalize(System.Text.NormalizationForm.FormKC))
        {
            if (char.IsLetterOrDigit(ch)) sb.Append(char.ToLowerInvariant(ch));
        }
        return sb.ToString();
    }
}
