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
//   dotnet run --project tools/ai-index-inspect -- --dump    [--out /tmp/chunks.txt]
//
// 連線字串也可由 SKIN20_EXPORT_SQL 提供（與 tools/content-export 同一個唯讀身分）。
// --dump 讀 STORAGE_ACCOUNT 指定的儲存體帳戶（Managed Identity／az login 身分）。
//
// 🔴 **這支不會建索引，也不會花任何 API 費用。** 索引由 API 的 AiIndexRefresh Timer 建。

var mode = args.FirstOrDefault(a => a is "--dry-run" or "--dump") ?? "--dry-run";
var outPath = ArgValue("--out") ?? "/tmp/ai-chunks.txt";

// ⚠️ `--out <路徑>` 的那個路徑不是位置參數 —— 少了這一段，它會被當成連線字串，
//    而錯誤訊息是「初始化字串的格式與規格不符」，指不到真正的原因。
var positional = args
    .Where((a, i) => !a.StartsWith("--") && (i == 0 || args[i - 1] != "--out"))
    .ToArray();

var chunks = mode == "--dump" ? await DumpAsync() : await DryRunAsync();

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
async Task<List<AiChunker.AiChunk>> DumpAsync()
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

    var gz = (await container.GetBlobClient(AiIndexFormat.ChunksBlobName).DownloadContentAsync())
        .Value.Content.ToStream();
    await using var unzip = new GZipStream(gz, CompressionMode.Decompress);
    var stored = await JsonSerializer.DeserializeAsync<List<AiIndexFormat.Chunk>>(unzip, AiIndexFormat.Json) ?? [];

    return stored
        .Select(c => new AiChunker.AiChunk(c.Ci, c.Pv, c.T, c.U, c.Ti, c.H, c.W, c.Q, c.X))
        .ToList();
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

internal sealed record ContentRow(int Id, byte ContentType, string? UrlPath, int PublishedVersionId, string Snapshot);
