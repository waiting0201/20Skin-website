// 孤兒檔對帳：Blob 容器裡有、但資料庫沒有任何欄位指得到的檔案。
//
// 為什麼需要這支（docs/08 §E、docs/11 §9）——孤兒檔有三個來源，都不是 bug：
//   ① **上傳了但沒存檔**：`/admin/upload/commit` 成功之後，編輯關掉視窗沒按儲存。
//      檔案已經在容器裡，而那個值從來沒有進過資料庫。
//   ② **清檔逾時或失敗**：換圖時刪舊檔有時間上限（存檔不該為了清檔而變慢），
//      逾時就放掉並記一行 warning。
//   ③ **換圖之後、重新發布之前**：舊圖仍被「已發布快照」需要，所以刻意不刪
//      （不然線上會破圖）。那筆內容若一直沒有再發布，舊圖就會一直留著。
//
// 🔴 **預設只報告，不刪任何東西。** 要刪必須明確加 `--delete`。
//
// 🔴🔴 **只能對「正式資料庫」跑，而且理由不是謹慎，是正確性。**
//    儲存體帳戶只有一個（`st20skinweb`），**所有環境共用它** ——
//    本機開發庫、測試庫都指向同一個容器。所以「一個檔案還有沒有人在用」這個問題，
//    只有正式資料庫答得準。
//    ⚠️ 2026-09-16 實測：
//      · 對空的測試庫跑 → 4613 / 4616 個檔案（100%）被報成孤兒
//      · 對本機開發庫跑 → 3439 / 4616 個（75%）被報成孤兒
//    兩次都不是資料有問題，是**問錯了資料庫**。下面的比例安全閥就是為此而設。
//
// 用法：
//   SKIN20_EXPORT_SQL='<唯讀連線字串>' \
//     dotnet run --project tools/blob-reconcile -- --account st20skinweb
//   （加 --delete 才會真的刪；加 --min-age-hours N 調整保護期）

using System.Globalization;
using System.Text.Json;
using Azure.Identity;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Dapper;
using Microsoft.Data.SqlClient;

var args_ = Environment.GetCommandLineArgs().Skip(1).ToArray();
string? Arg(string name)
{
    var i = Array.IndexOf(args_, name);
    return i >= 0 && i + 1 < args_.Length ? args_[i + 1] : null;
}
var doDelete = args_.Contains("--delete");
var account = Arg("--account") ?? "st20skinweb";
var container = Arg("--container") ?? "media";

// ⚠️ **保護期不可省。** 對帳跑的當下，可能正好有人上傳完、還沒按儲存 ——
//    那個檔案在資料庫裡「本來就還不該有引用」。把它當孤兒刪掉，編輯按下儲存時
//    就會存進一個指向 404 的網址，而且沒有任何錯誤訊息。
var minAgeHours = double.TryParse(Arg("--min-age-hours"), out var h) ? h : 24;

var connectionString = Environment.GetEnvironmentVariable("SKIN20_EXPORT_SQL");
if (string.IsNullOrWhiteSpace(connectionString))
{
    Console.Error.WriteLine("✗ 缺少 SKIN20_EXPORT_SQL（唯讀連線字串）。");
    return 2;
}

await using var db = new SqlConnection(connectionString);
await db.OpenAsync();

Console.WriteLine($"· 資料庫 {db.Database}　容器 {account}/{container}");
Console.WriteLine($"· 模式：{(doDelete ? "🔴 會真的刪檔" : "只報告（要刪請加 --delete）")}　保護期 {minAgeHours} 小時");

// ── 1. 資料庫裡「還被指得到」的所有 blobPath ────────────────────────────
//
// 🔴 **不要硬寫欄位清單。** docs 曾把這件事描述成「要掃十個內嵌圖片欄位」——
//    那種寫法在有人新增第十一個欄位的那天就會默默漏掉，而症狀是「對帳工具把還在用的
//    圖片報成孤兒」，照著刪就是線上破圖。這裡改成問 schema：凡是叫 `*BlobPath` 的欄位
//    全都算數，新增欄位自動涵蓋。
var referenced = new HashSet<string>(StringComparer.Ordinal);

var blobPathColumns = (await db.QueryAsync<(string Table, string Column)>("""
    SELECT TABLE_NAME, COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE COLUMN_NAME LIKE '%BlobPath%'
    """)).ToList();

foreach (var (table, column) in blobPathColumns)
{
    var values = await db.QueryAsync<string?>(
        $"SELECT [{column}] FROM [{table}] WHERE [{column}] IS NOT NULL AND [{column}] <> ''");
    foreach (var v in values) if (!string.IsNullOrWhiteSpace(v)) referenced.Add(v!);
}
Console.WriteLine($"· 欄位引用：{blobPathColumns.Count} 個 *BlobPath 欄位 → {referenced.Count} 個檔案");

// JSON 欄位（BodyBlocks、首頁版位設定、全站設定…）裡的圖片值。
// ⚠️ 同樣不硬寫表名：掃所有可能放 JSON 的長字串欄位，找 `blobPath` 這個鍵。
var beforeJson = referenced.Count;
var jsonColumns = (await db.QueryAsync<(string Table, string Column)>("""
    SELECT TABLE_NAME, COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE DATA_TYPE IN ('nvarchar','varchar') AND CHARACTER_MAXIMUM_LENGTH = -1
      AND NOT (TABLE_NAME = 'ContentVersions' AND COLUMN_NAME = 'Snapshot')
    """)).ToList();

foreach (var (table, column) in jsonColumns)
{
    var values = await db.QueryAsync<string?>(
        $"SELECT [{column}] FROM [{table}] WHERE [{column}] LIKE '%blobPath%'");
    foreach (var v in values) CollectFromJson(v, referenced);
}
Console.WriteLine($"· JSON 欄位引用：{jsonColumns.Count} 個長字串欄位 → 再加 {referenced.Count - beforeJson} 個");

// 🔴 **已發布版本的快照也算引用**，這一條缺不得。
//    前台服務的是已核准的版本快照，不是工作副本（CLAUDE.md 決策 14）——
//    編輯存一份草稿把圖換掉之後，舊圖只剩快照指得到它，而前台正在用它。
//    ⚠️ 只取「已發布的那一版」，不是所有版本：舊版本本來就允許指向已刪除的圖片
//    （docs/11 §9：版本還原救不回已刪除的圖片），全算進來等於永遠不能清。
var beforeSnap = referenced.Count;
var snapshots = await db.QueryAsync<string?>("""
    SELECT cv.Snapshot
    FROM ContentItems ci
    INNER JOIN ContentVersions cv ON cv.Id = ci.PublishedVersionId
    WHERE cv.Snapshot LIKE '%blobPath%'
    """);
foreach (var snap in snapshots) CollectFromJson(snap, referenced);
Console.WriteLine($"· 已發布快照引用：再加 {referenced.Count - beforeSnap} 個");
Console.WriteLine($"· 合計仍被引用：{referenced.Count} 個檔案");

// ── 2. 容器裡實際有的檔案 ──────────────────────────────────────────────
var client = new BlobContainerClient(
    new Uri($"https://{account}.blob.core.windows.net/{container}"), new DefaultAzureCredential());

var blobs = new List<BlobItem>();
await foreach (var b in client.GetBlobsAsync()) blobs.Add(b);
Console.WriteLine($"· 容器裡共 {blobs.Count} 個檔案");

// ── 3. 對帳 ────────────────────────────────────────────────────────────
var now = DateTimeOffset.UtcNow;
var orphans = new List<BlobItem>();
var tooNew = 0;

foreach (var b in blobs)
{
    if (referenced.Contains(b.Name)) continue;

    var age = now - (b.Properties.CreatedOn ?? b.Properties.LastModified ?? now);
    if (age.TotalHours < minAgeHours) { tooNew++; continue; }

    orphans.Add(b);
}

long Size(BlobItem b) => b.Properties.ContentLength ?? 0;

Console.WriteLine();
if (tooNew > 0)
    Console.WriteLine($"· 略過 {tooNew} 個還在保護期內的檔案（可能有人剛上傳、還沒按儲存）");

if (orphans.Count == 0)
{
    Console.WriteLine("✓ 沒有孤兒檔。");
    return 0;
}

var totalMb = orphans.Sum(Size) / 1024.0 / 1024.0;
var ratio = (double)orphans.Count / Math.Max(blobs.Count, 1);
Console.WriteLine($"孤兒檔 {orphans.Count} 個（佔容器的 {ratio:P0}），合計 {totalMb:F1} MB：\n");
foreach (var b in orphans.OrderBy(x => x.Name).Take(50))
{
    var when = (b.Properties.CreatedOn ?? b.Properties.LastModified)?.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture) ?? "?";
    Console.WriteLine($"  {b.Name}　{Size(b) / 1024.0:F0} KB　{when}");
}
if (orphans.Count > 50) Console.WriteLine($"  …等 {orphans.Count} 個");

if (!doDelete)
{
    Console.WriteLine("\n（只是報告。確認清單無誤後加 --delete 才會真的刪。）");
    return 0;
}

// 🔴 **安全閥：比例過高時拒絕刪除。**
//    這支工具是拿「一個資料庫」去對「一個容器」。指錯資料庫的代價是災難性的 ——
//    2026-09-16 實際示範過：對一顆空的測試庫跑，它把全站 4613 張圖（758 MB）
//    全部報成孤兒，因為那顆測試庫與正式內容**共用同一個儲存體**。
//    加上刪除旗標就是把整站圖片清光，而每一步看起來都「正確地執行了」。
//
//    ⚠️ 這與同一天那次 sitemap 事故是同一個教訓：**一個對帳器發現
//    「幾乎全部都對不上」時，它自己設定錯的機率遠高於資料真的全錯。**
//    正常情況下孤兒檔應該是零星幾個。
if (ratio > 0.2 && !args_.Contains("--force"))
{
    Console.Error.WriteLine(
        $"\n✗ 拒絕刪除：孤兒檔佔了容器的 {ratio:P0}（{orphans.Count} / {blobs.Count}）。\n"
        + "  正常情況下孤兒檔只有零星幾個。這個比例幾乎一定代表**連到了錯的資料庫** ——\n"
        + "  例如空的測試庫、或還沒匯入內容的環境，而它與正式內容共用同一個儲存體。\n"
        + "  先確認上面印出的資料庫名稱是對的。真的要刪請加 --force（請先看過完整清單）。\n");
    return 1;
}

Console.WriteLine($"\n🔴 開始刪除 {orphans.Count} 個檔案…");
var deleted = 0;
foreach (var b in orphans)
{
    try
    {
        await client.GetBlobClient(b.Name).DeleteIfExistsAsync();
        deleted++;
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"  ✗ {b.Name}：{ex.Message}");
    }
}
Console.WriteLine($"✓ 已刪除 {deleted} / {orphans.Count} 個。");
return 0;

// 從一段 JSON 裡收出所有 `blobPath` 的值。
// ⚠️ 用 JSON 解析而不是字串比對 —— 快照裡的中文是 `\uXXXX`，而檔名雖然是 ASCII，
//    但用解析器才不會把「剛好出現在別的字串裡的一段路徑」誤收。
static void CollectFromJson(string? json, HashSet<string> into)
{
    if (string.IsNullOrWhiteSpace(json)) return;
    try
    {
        using var doc = JsonDocument.Parse(json);
        Walk(doc.RootElement, into);
    }
    catch (JsonException) { /* 不是 JSON 就跳過 */ }
}

static void Walk(JsonElement el, HashSet<string> into)
{
    switch (el.ValueKind)
    {
        case JsonValueKind.Object:
            foreach (var p in el.EnumerateObject())
            {
                if (p.NameEquals("blobPath") && p.Value.ValueKind == JsonValueKind.String)
                {
                    var v = p.Value.GetString();
                    if (!string.IsNullOrWhiteSpace(v)) into.Add(v!);
                }
                // ⚠️ 區塊欄位在快照裡可能是「一個 JSON 字串」，要再解析一層。
                else if (p.Value.ValueKind == JsonValueKind.String)
                {
                    var s = p.Value.GetString();
                    if (s is not null && (s.StartsWith('[') || s.StartsWith('{'))) CollectFromJson(s, into);
                }
                else Walk(p.Value, into);
            }
            break;
        case JsonValueKind.Array:
            foreach (var item in el.EnumerateArray()) Walk(item, into);
            break;
    }
}
