using System.IO.Compression;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Azure.Identity;
using Azure.Storage.Blobs;
using Dapper;
using Microsoft.Data.SqlClient;
using Skin20.Api.Common;
using Skin20.Api.Models.Entities;

// ── AI 語料切塊的唯讀檢查工具（CLAUDE.md 決策 28）─────────────────────
//
// 用法：
//   dotnet run --project tools/ai-index-inspect -- --dry-run [--out /tmp/chunks.txt] [連線字串]
//   dotnet run --project tools/ai-index-inspect -- --dump    [--out /tmp/chunks.txt] [--save-to <目錄>]
//   dotnet run --project tools/ai-index-inspect -- --query   [--out /tmp/scores.txt] [--questions <檔案>]
//
// 連線字串也可由 SKIN20_EXPORT_SQL 提供（與 tools/content-export 同一個唯讀身分）。
// --dump 讀 STORAGE_ACCOUNT 指定的儲存體帳戶（Managed Identity／az login 身分）。
//
// 🔴 **這支不會建索引。** 索引由 API 的 AiIndexRefresh Timer 建。
//    --dry-run／--dump 不花任何 API 費用；--query 每題嵌入一次（GEMINI_API_KEY），一題不到一分錢。

var mode = args.FirstOrDefault(a => a is "--dry-run" or "--dump" or "--query") ?? "--dry-run";
var outPath = ArgValue("--out") ?? (mode == "--query" ? "/tmp/ai-scores.txt" : "/tmp/ai-chunks.txt");

// ⚠️ 帶值的旗標，它的值不是位置參數 —— 少了這一段，`--out` 的路徑會被當成連線字串，
//    而錯誤訊息是「初始化字串的格式與規格不符」，指不到真正的原因。
string[] valueFlags = ["--out", "--save-to", "--questions"];
var positional = args
    .Where((a, i) => !a.StartsWith("--") && (i == 0 || !valueFlags.Contains(args[i - 1])))
    .ToArray();

if (mode == "--query")
{
    await QueryAsync();
    return 0;
}

var chunks = mode == "--dump" ? (await DumpAsync()).Chunks : await DryRunAsync();

WriteReport(chunks, outPath);
return 0;

// ════════════════════════════════════════════════════════════════════════
// --dry-run：連唯讀 SQL、切塊，完全不碰 Gemini、不碰 Blob
// ════════════════════════════════════════════════════════════════════════
async Task<List<AiChunker.AiChunk>> DryRunAsync()
{
    var connectionString = positional.FirstOrDefault()
        ?? Environment.GetEnvironmentVariable("SKIN20_EXPORT_SQL")
        ?? throw new InvalidOperationException("缺少連線字串：請給一個位置參數或設定 SKIN20_EXPORT_SQL。");

    await using var db = new SqlConnection(connectionString);

    // 🔴 可見性判定與 API 共用同一份原始碼（<Compile Include> 連結 Visibility.cs）。
    var sql = $"""
        SELECT ci.Id, ci.ContentType, ci.UrlPath, ci.PublishedVersionId, cv.Snapshot
        FROM ContentItems ci
        INNER JOIN ContentVersions cv ON cv.Id = ci.PublishedVersionId
        WHERE {Visibility.PublicFilter}
        ORDER BY ci.ContentType, ci.SortOrder, ci.Id;
        """;

    var rows = (await db.QueryAsync<ContentRow>(sql, new { Now = DateTime.UtcNow })).ToList();
    Console.WriteLine($"已發布內容 {rows.Count} 筆");

    // FAQ 沒有獨立網址（docs/08 §C-6），要指到所屬分類頁 —— 與 SearchHandler 同一條規則。
    var categoryUrls = rows
        .Where(r => r.ContentType == (byte)ContentType.Term && !string.IsNullOrEmpty(r.UrlPath))
        .ToDictionary(r => r.Id, r => r.UrlPath!);

    var result = new List<AiChunker.AiChunk>();
    var skipped = new List<string>();

    foreach (var row in rows)
    {
        var url = ResolveUrl(row, categoryUrls);
        var built = AiChunker.Build(new AiChunker.AiChunkSource(
            row.Id, row.PublishedVersionId, row.ContentType, url, row.Snapshot));

        if (built.Count == 0)
        {
            skipped.Add($"  #{row.Id} [{ContentTypeLabels.Of(row.ContentType)}] {TitleOf(row.Snapshot)} "
                + (string.IsNullOrEmpty(url) ? "（沒有可連結的網址）" : "（不值得索引或切不出文字）"));
        }
        result.AddRange(built);
    }

    Console.WriteLine($"未進索引 {skipped.Count} 筆：");
    foreach (var line in skipped.Take(40)) Console.WriteLine(line);
    if (skipped.Count > 40) Console.WriteLine($"  …另外 {skipped.Count - 40} 筆");

    return result;
}

// ════════════════════════════════════════════════════════════════════════
// --dump：下載既有索引，回答「AI 到底看到了什麼」
// ════════════════════════════════════════════════════════════════════════
async Task<OnlineIndex> DumpAsync()
{
    var account = Environment.GetEnvironmentVariable("STORAGE_ACCOUNT")
        ?? throw new InvalidOperationException("缺少 STORAGE_ACCOUNT。");

    var container = new BlobServiceClient(
            new Uri($"https://{account}.blob.core.windows.net"), new DefaultAzureCredential())
        .GetBlobContainerClient(AiIndexFormat.ContainerName);

    var manifestBytes = (await container.GetBlobClient(AiIndexFormat.ManifestBlobName).DownloadContentAsync())
        .Value.Content.ToArray();
    var manifest = JsonSerializer.Deserialize<AiIndexFormat.Manifest>(manifestBytes, AiIndexFormat.Json)!;
    Console.WriteLine($"索引建於 {manifest.BuiltAt:u}／模型 {manifest.Model}／{manifest.Dim} 維／"
        + $"{manifest.Count} 塊／涵蓋內容 {manifest.Items.Count} 筆／"
        + $"主站舊文{(manifest.IncludeMainSiteArticles ? "納入" : "未納入")}");

    var chunkBytes = (await container.GetBlobClient(AiIndexFormat.ChunksBlobName).DownloadContentAsync())
        .Value.Content.ToArray();
    await using var unzip = new GZipStream(new MemoryStream(chunkBytes), CompressionMode.Decompress);
    var stored = await JsonSerializer.DeserializeAsync<List<AiIndexFormat.Chunk>>(unzip, AiIndexFormat.Json) ?? [];

    var vectorBytes = (await container.GetBlobClient(AiIndexFormat.VectorsBlobName).DownloadContentAsync())
        .Value.Content.ToArray();
    var vectors = AiIndexFormat.FromBytes(vectorBytes);

    // 🔴 三個檔不是原子性一起換的（AiIndexService.Validate 同一條理由）。
    //    對不上就是剛好碰到 Timer 換檔，重跑一次即可；拿不一致的索引去校準，分數全部是錯的。
    if (stored.Count * manifest.Dim != vectors.Length)
        throw new InvalidOperationException(
            $"索引不一致：{stored.Count} 塊 × {manifest.Dim} 維 ≠ {vectors.Length} 個浮點數。Timer 可能正在換檔，稍後重跑。");

    // --save-to：存成 API 的 AiIndex__LocalPath 吃得下的目錄，讓本機的 func 用「正式那一份索引」作答。
    if (ArgValue("--save-to") is { Length: > 0 } saveTo)
    {
        Directory.CreateDirectory(saveTo);
        await File.WriteAllBytesAsync(Path.Combine(saveTo, "manifest.json"), manifestBytes);
        await File.WriteAllBytesAsync(Path.Combine(saveTo, "chunks.json.gz"), chunkBytes);
        await File.WriteAllBytesAsync(Path.Combine(saveTo, "vectors.f32"), vectorBytes);
        Console.WriteLine($"索引已存到 {saveTo}（可設為 AiIndex__LocalPath）");
    }

    return new OnlineIndex(
        manifest,
        stored,
        vectors,
        stored.Select(c => new AiChunker.AiChunk(c.Ci, c.Pv, c.T, c.U, c.Ti, c.H, c.W, c.Q, c.X)).ToList());
}

// ════════════════════════════════════════════════════════════════════════
// --query：拿線上索引對一組問題做檢索，印出原始分數 —— 校準 AiIndex__MinScore 用
// ════════════════════════════════════════════════════════════════════════
//
// 🔴 排序與 API 共用 AiIndexFormat.Rank，所以這裡看到的分數就是線上判斷用的分數。
// ⚠️ 只做檢索、不呼叫生成模型：門檻是檢索的事，跟模型怎麼回答無關。
// ⚠️ 嵌入設定（模型、維度）一律取 manifest 的值 —— 查詢向量與索引不同模型，分數毫無意義。
//    taskType 取 AiIndex__UseTaskType（預設不送），要與正式環境一致。
async Task QueryAsync()
{
    var apiKey = Environment.GetEnvironmentVariable("GEMINI_API_KEY")
        ?? throw new InvalidOperationException("缺少 GEMINI_API_KEY。");
    var useTaskType = string.Equals(Environment.GetEnvironmentVariable("AiIndex__UseTaskType"), "true",
        StringComparison.OrdinalIgnoreCase);

    var questionsPath = ArgValue("--questions")
        ?? Path.Combine(AppContext.BaseDirectory, "acceptance-questions.txt");
    var questions = File.ReadAllLines(questionsPath)
        .Select(l => l.Trim())
        .Where(l => l.Length > 0 && !l.StartsWith('#'))
        .ToList();

    var online = await DumpAsync();
    var model = online.Manifest.Model;
    var dim = online.Manifest.Dim;

    using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
    http.DefaultRequestHeaders.Add("x-goog-api-key", apiKey);

    var sb = new StringBuilder();
    sb.AppendLine($"# AI 檢索分數（--query）　{DateTime.Now:yyyy-MM-dd HH:mm}");
    sb.AppendLine($"索引建於 {online.Manifest.BuiltAt:u}／{online.Stored.Count} 塊／涵蓋 {online.Manifest.Items.Count} 筆");
    sb.AppendLine("每題列 top-6（與 AiHandler 的 ContextChunks、MaxChunksPerItem 相同）。");
    sb.AppendLine("「最高可引用」＝命中判定看的那個數字：它 ≥ MinScore 才會進生成，否則直接未命中。");
    sb.AppendLine();

    var summary = new List<(string Q, float TopCitable)>();

    foreach (var question in questions)
    {
        var body = new JsonObject
        {
            ["model"] = $"models/{model}",
            ["content"] = new JsonObject { ["parts"] = new JsonArray(new JsonObject { ["text"] = question }) },
            ["outputDimensionality"] = dim,
        };
        if (useTaskType) body["taskType"] = "RETRIEVAL_QUERY";

        using var response = await http.PostAsync(
            $"https://generativelanguage.googleapis.com/v1beta/models/{model}:embedContent",
            new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json"));
        var text = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException($"嵌入失敗（{(int)response.StatusCode}）：{text[..Math.Min(400, text.Length)]}");

        var vector = JsonNode.Parse(text)!["embedding"]!["values"]!.AsArray()
            .Select(v => v!.GetValue<float>()).ToArray();
        AiIndexFormat.Normalize(vector);

        var ranked = AiIndexFormat.Rank(vector, online.Stored, online.Vectors, dim, topK: 6, perItem: 2);
        var topCitable = ranked.Where(r => online.Stored[r.Index].Q).Select(r => r.RawScore).DefaultIfEmpty(0).Max();
        summary.Add((question, topCitable));

        sb.AppendLine($"## {question}");
        sb.AppendLine($"最高可引用 {topCitable:F3}");
        foreach (var r in ranked)
        {
            var c = online.Stored[r.Index];
            sb.AppendLine($"  {r.RawScore:F3} (加權 {r.WeightedScore:F3}) {(c.Q ? "可引用" : "不可引用")}"
                + $" [{ContentTypeLabels.Of(c.T)}] {c.Ti} ｜ {c.U}");
        }
        sb.AppendLine();
    }

    sb.Insert(0, string.Join(Environment.NewLine,
        summary.Select(s => $"{s.TopCitable:F3}  {s.Q}").Prepend("## 摘要（最高可引用分數）")) + Environment.NewLine + Environment.NewLine);

    File.WriteAllText(outPath, sb.ToString());
    foreach (var s in summary) Console.WriteLine($"{s.TopCitable:F3}  {s.Q}");
    Console.WriteLine($"→ {outPath}");
}

// ════════════════════════════════════════════════════════════════════════

void WriteReport(List<AiChunker.AiChunk> all, string path)
{
    var sb = new StringBuilder();

    sb.AppendLine($"# AI 語料切塊檢查（{mode}）　{DateTime.Now:yyyy-MM-dd HH:mm}");
    sb.AppendLine();
    sb.AppendLine($"總塊數 {all.Count}　涵蓋內容 {all.Select(c => c.ContentItemId).Distinct().Count()} 筆"
        + $"　總字元 {all.Sum(c => c.Text.Length):N0}");
    sb.AppendLine();

    sb.AppendLine("## 各型別");
    sb.AppendLine("型別        塊數    內容筆數  平均字元  可引用");
    foreach (var group in all.GroupBy(c => c.ContentType).OrderBy(g => g.Key))
    {
        var label = ContentTypeLabels.Of(group.Key);
        sb.AppendLine($"{label,-10}  {group.Count(),5}  {group.Select(c => c.ContentItemId).Distinct().Count(),8}"
            + $"  {group.Average(c => c.Text.Length),8:F0}  {group.Count(c => c.Citable),5}");
    }
    sb.AppendLine();

    var lengths = all.Select(c => c.Text.Length).OrderBy(x => x).ToList();
    if (lengths.Count > 0)
    {
        sb.AppendLine("## 字元數分佈");
        sb.AppendLine($"最短 {lengths[0]}　中位數 {lengths[lengths.Count / 2]}　"
            + $"90% {lengths[(int)(lengths.Count * 0.9)]}　最長 {lengths[^1]}");
        sb.AppendLine($"短於 100 字的塊：{lengths.Count(l => l < 100)}（太短的塊檢索時只會是雜訊）");
        sb.AppendLine($"超過 900 字的塊：{lengths.Count(l => l > 900)}（應為 0，超過代表打包沒生效）");
        sb.AppendLine();
    }

    sb.AppendLine("## 不可引用的來源（主站舊文，降權且不列入回答的來源清單）");
    sb.AppendLine($"{all.Count(c => !c.Citable)} 塊 / {all.Count} 塊"
        + $"　＝ {(all.Count == 0 ? 0 : 100.0 * all.Count(c => !c.Citable) / all.Count):F1}%");
    sb.AppendLine();

    sb.AppendLine("## 全部片段");
    sb.AppendLine();
    foreach (var chunk in all)
    {
        sb.AppendLine($"───── #{chunk.ContentItemId} ｜ {chunk.Text.Length} 字 ｜ 權重 {chunk.Weight:F2}"
            + $" ｜ {(chunk.Citable ? "可引用" : "不可引用")} ｜ {chunk.Url}");
        sb.AppendLine(chunk.Breadcrumb);
        sb.AppendLine(chunk.Text);
        sb.AppendLine();
    }

    File.WriteAllText(path, sb.ToString());
    Console.WriteLine($"→ {path}（{all.Count} 塊）");
}

string? ArgValue(string name)
{
    var index = Array.IndexOf(args, name);
    return index >= 0 && index + 1 < args.Length ? args[index + 1] : null;
}

static string? ResolveUrl(ContentRow row, Dictionary<int, string> categoryUrls)
{
    if (!string.IsNullOrEmpty(row.UrlPath)) return row.UrlPath;
    if (row.ContentType != (byte)ContentType.Faq) return null;

    // FAQ → 所屬分類頁（/faq/{category}/）。對不到就不進索引：
    // 收一筆點不到的來源，比少收一筆糟。
    if (JsonNode.Parse(row.Snapshot) is not JsonObject root
        || root["fields"] is not JsonObject fields
        || fields["categoryTermId"] is not JsonValue v
        || !v.TryGetValue<int>(out var categoryId)) return null;

    return categoryUrls.GetValueOrDefault(categoryId);
}

static string TitleOf(string snapshot)
{
    try { return (JsonNode.Parse(snapshot) as JsonObject)?["title"]?.GetValue<string>() ?? ""; }
    catch (JsonException) { return ""; }
}

internal sealed record OnlineIndex(
    AiIndexFormat.Manifest Manifest,
    List<AiIndexFormat.Chunk> Stored,
    float[] Vectors,
    List<AiChunker.AiChunk> Chunks);

internal sealed record ContentRow(int Id, byte ContentType, string? UrlPath, int PublishedVersionId, string Snapshot);
