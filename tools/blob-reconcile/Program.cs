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
using Skin20.Api.Common;

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

// 指向本容器的絕對網址前綴，給 AddPath 判斷用。
var containerUrlPrefix = $"https://{account}.blob.core.windows.net/{container}/";

var connectionString = Environment.GetEnvironmentVariable("SKIN20_EXPORT_SQL");
if (string.IsNullOrWhiteSpace(connectionString))
{
    Console.Error.WriteLine("✗ 缺少 SKIN20_EXPORT_SQL（唯讀連線字串）。");
    return 2;
}

await using var db = new SqlConnection(connectionString);
await db.OpenAsync();

// ⚠️ 對帳是離線作業，不是使用者在等的請求 —— 逾時放寬。正式庫是 Azure SQL Basic（5 DTU），
// 掃全站快照本來就慢。
const int CommandTimeoutSeconds = 600;

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
    var values = await db.QueryAsync<string?>(new CommandDefinition(
        $"SELECT [{column}] FROM [{table}] WHERE [{column}] IS NOT NULL AND [{column}] <> ''",
        commandTimeout: CommandTimeoutSeconds));
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
    // 🔴 **兩個條件都要**：舊站匯入的內文圖只有 `src` 網址、**沒有 `blobPath` 鍵**。
    //    只比對 `blobPath` 的話，工作副本裡的內文圖一個都收不到 ——
    //    未發布的草稿若有新的內文圖，就會被誤判成孤兒（已發布的那些還有快照救，草稿沒有）。
    var values = await db.QueryAsync<string?>(new CommandDefinition(
        $"SELECT [{column}] FROM [{table}] "
        + $"WHERE [{column}] LIKE '%blobPath%' OR [{column}] LIKE '%{account}.blob.core.windows.net%'",
        commandTimeout: CommandTimeoutSeconds));
    foreach (var v in values) CollectFromJson(v, referenced);
}
Console.WriteLine($"· JSON 欄位引用：{jsonColumns.Count} 個長字串欄位 → 再加 {referenced.Count - beforeJson} 個");

// 🔴 **已發布版本的快照也算引用**，這一條缺不得。
//    前台服務的是已核准的版本快照，不是工作副本（CLAUDE.md 決策 14）——
//    編輯存一份草稿把圖換掉之後，舊圖只剩快照指得到它，而前台正在用它。
//    ⚠️ 只取「已發布的那一版」，不是所有版本：舊版本本來就允許指向已刪除的圖片
//    （docs/11 §9：版本還原救不回已刪除的圖片），全算進來等於永遠不能清。
var beforeSnap = referenced.Count;
// ⚠️ **不要在這裡加 `WHERE Snapshot LIKE '%blobPath%'`。** 看起來像優化（少傳幾列），
//    實際上是對 NVARCHAR(MAX) 做全表字串掃描 —— 正式庫是 Azure SQL Basic（5 DTU），
//    2026-09-16 實測那樣會**直接逾時**。整包讀回來在記憶體裡篩反而快得多
//    （全站快照約 16 MB，讀取本身只要一兩秒）。
//    這與站內搜尋那 23 秒是同一個病因，見 Common/SearchTextBuilder.cs。
var snapshots = await db.QueryAsync<string?>(new CommandDefinition("""
    SELECT cv.Snapshot
    FROM ContentItems ci
    INNER JOIN ContentVersions cv ON cv.Id = ci.PublishedVersionId
    """, commandTimeout: CommandTimeoutSeconds));
foreach (var snap in snapshots)
    if (snap is not null && snap.Contains("blobPath", StringComparison.Ordinal))
        CollectFromJson(snap, referenced);
Console.WriteLine($"· 已發布快照引用：再加 {referenced.Count - beforeSnap} 個");
Console.WriteLine($"· 合計仍被引用：{referenced.Count} 個檔案");

// ── 2. 容器裡實際有的檔案 ──────────────────────────────────────────────
var client = new BlobContainerClient(
    new Uri($"https://{account}.blob.core.windows.net/{container}"), new DefaultAzureCredential());

var blobs = new List<BlobItem>();
await foreach (var b in client.GetBlobsAsync()) blobs.Add(b);
Console.WriteLine($"· 容器裡共 {blobs.Count} 個檔案");

// ── 3. 對帳 ────────────────────────────────────────────────────────────
//
// 🔴 **衍生尺寸（ImageVariants，2026-10-02）不是獨立的一種檔案，是原檔的附屬。**
//    資料庫裡沒有任何欄位指著 `{stem}.w480.webp`，所以「有沒有被引用」只能問它的原檔：
//      · 原檔被引用（stem 對得上任何一個引用）→ 衍生檔不是孤兒
//      · 原檔是孤兒                           → 衍生檔跟著它一起刪（算在原檔頭上，不另計）
//      · 容器裡根本沒有原檔                   → 衍生檔自己是孤兒（照樣受保護期約束）
//    ⚠️ 少了這一段，全站每張圖都會有 4 個「沒人引用」的檔案，報告出來是 80% 的孤兒 —— 而且刪掉
//       就是全站的 srcset 破圖。比例安全閥（下面）會擋下，但那是最後一道，不是這一道。
var now = DateTimeOffset.UtcNow;
var tooNew = 0;

// 引用集合的 stem。⚠️ 只收「會有衍生檔」的引用（jpg／png／webp），gif 之類的 stem 不進來。
var referencedStems = new HashSet<string>(StringComparer.Ordinal);
foreach (var r in referenced)
    if (ImageVariants.PathHasVariants(r)) referencedStems.Add(ImageVariants.StemOf(r));

var originals = new List<BlobItem>();
var variants = new List<BlobItem>();
foreach (var b in blobs)
    (ImageVariants.IsVariantPath(b.Name) ? variants : originals).Add(b);

bool OldEnough(BlobItem b)
{
    var age = now - (b.Properties.CreatedOn ?? b.Properties.LastModified ?? now);
    return age.TotalHours >= minAgeHours;
}

var orphans = new List<BlobItem>();          // 要報告的孤兒「圖片」：孤兒原檔，加上沒有原檔的衍生檔
var orphanOriginalStems = new Dictionary<string, BlobItem>(StringComparer.Ordinal);
foreach (var b in originals)
{
    if (referenced.Contains(b.Name)) continue;
    if (!OldEnough(b)) { tooNew++; continue; }
    orphans.Add(b);
    if (ImageVariants.PathHasVariants(b.Name)) orphanOriginalStems[ImageVariants.StemOf(b.Name)] = b;
}

// 容器裡實際存在的原檔 stem（不分有沒有被引用、夠不夠老），用來分辨「原檔不見了」與「原檔還在只是太新」。
var existingOriginalStems = new HashSet<string>(
    originals.Where(o => ImageVariants.PathHasVariants(o.Name)).Select(o => ImageVariants.StemOf(o.Name)),
    StringComparer.Ordinal);

// 要連帶刪掉的衍生檔（跟著孤兒原檔）與它們的容量，只為了報告與實際刪除。
var attachedVariants = new List<BlobItem>();
var strayVariants = new List<BlobItem>();     // 容器裡沒有原檔的衍生檔（不論是否孤兒，用於比例分母）
var strayOrphans = 0;
foreach (var v in variants)
{
    ImageVariants.TryGetOriginalStem(v.Name, out var stem);
    if (referenced.Contains(v.Name) || referencedStems.Contains(stem)) continue;      // 原檔還在用

    if (orphanOriginalStems.ContainsKey(stem)) { attachedVariants.Add(v); continue; }  // 跟著孤兒原檔走

    if (existingOriginalStems.Contains(stem)) { tooNew++; continue; }                   // 原檔在、只是還在保護期

    strayVariants.Add(v);
    if (!OldEnough(v)) { tooNew++; continue; }
    orphans.Add(v);
    strayOrphans++;
}

long Size(BlobItem b) => b.Properties.ContentLength ?? 0;

Console.WriteLine();
if (tooNew > 0)
    Console.WriteLine($"· 略過 {tooNew} 個還在保護期內的檔案（可能有人剛上傳、還沒按儲存）");
Console.WriteLine($"· 容器裡 {originals.Count} 個原檔、{variants.Count} 個衍生尺寸檔（.wNNN.webp）");

if (orphans.Count == 0)
{
    Console.WriteLine("✓ 沒有孤兒檔。");
    return 0;
}

var totalMb = (orphans.Sum(Size) + attachedVariants.Sum(Size)) / 1024.0 / 1024.0;

// 🔴 比例的算法：**以「圖片」為單位，不是 blob 數。** 分子＝孤兒原檔 ＋ 沒有原檔的孤兒衍生檔；
//    分母＝原檔數 ＋ 沒有原檔的衍生檔數。有原檔的衍生檔既不進分子也不進分母 ——
//    否則補完衍生尺寸之後容器的檔案數變成 5 倍，同樣一個孤兒率的分母被稀釋、閥門鬆五倍；
//    而用原檔數當分母，2026-09-16 那組數字（4613／4616＝100%、3439／4616＝75%）仍然可以直接比。
var ratioDenominator = originals.Count + strayVariants.Count;
var ratio = (double)orphans.Count / Math.Max(ratioDenominator, 1);
Console.WriteLine(
    $"孤兒 {orphans.Count} 個（佔 {ratioDenominator} 張圖的 {ratio:P0}；"
    + $"其中孤兒原檔 {orphans.Count - strayOrphans}、無原檔的衍生檔 {strayOrphans}），"
    + $"連同跟著原檔走的 {attachedVariants.Count} 個衍生檔合計 {totalMb:F1} MB：\n");
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
        $"\n✗ 拒絕刪除：孤兒佔了 {ratioDenominator} 張圖的 {ratio:P0}（{orphans.Count} / {ratioDenominator}）。\n"
        + "  正常情況下孤兒檔只有零星幾個。這個比例幾乎一定代表**連到了錯的資料庫** ——\n"
        + "  例如空的測試庫、或還沒匯入內容的環境，而它與正式內容共用同一個儲存體。\n"
        + "  先確認上面印出的資料庫名稱是對的。真的要刪請加 --force（請先看過完整清單）。\n");
    return 1;
}

// 刪的清單：孤兒本身 ＋ 孤兒原檔的四個衍生檔。
// ⚠️ 衍生檔一律以「命名慣例」直接刪四個（DeleteIfExists，不存在就算了），不是只刪上面掃到的那幾個 ——
//    掃描當下可能剛好有衍生檔還沒寫齊或剛被補上。
var toDelete = new List<string>();
foreach (var b in orphans)
{
    toDelete.Add(b.Name);
    if (ImageVariants.PathHasVariants(b.Name)) toDelete.AddRange(ImageVariants.AllVariantPaths(b.Name));
}
toDelete = toDelete.Distinct(StringComparer.Ordinal).ToList();

Console.WriteLine($"\n🔴 開始刪除 {orphans.Count} 張圖（含衍生檔共 {toDelete.Count} 個 blob）…");
var deleted = 0;
foreach (var name in toDelete)
{
    try
    {
        if (await client.GetBlobClient(name).DeleteIfExistsAsync()) deleted++;
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"  ✗ {name}：{ex.Message}");
    }
}
Console.WriteLine($"✓ 已刪除 {deleted} 個 blob（{orphans.Count} 張圖）。");
return 0;

// 從一段 JSON 裡收出所有指向本容器的檔案。
//
// 🔴 **兩種形式都要認，這是這支工具最容易致命的地方。**
//    ① 後台上傳的圖片值：`{ "blobPath": "2026/09/….png", "url": "https://…" }`
//    ② **舊站匯入的內文圖：`{ "src": "https://st20skinweb.blob.core.windows.net/media/…" }`
//       —— 它沒有 `blobPath` 鍵。**
//
//    ⚠️ 2026-09-16 第一版只認 ①，於是把 **579 篇文章正在顯示的 3437 張內文圖**
//    全部報成孤兒（佔容器的 74%）。加上刪除旗標就是把那些文章的圖全砍掉。
//    擋下它的是比例安全閥 —— 那道閘不是防禦性編程，是**真的救過一次**。
//
// ⚠️ 用 JSON 解析而不是字串比對 —— 快照裡的中文是 `\uXXXX`，而檔名雖然是 ASCII，
//    但用解析器才不會把「剛好出現在別的字串裡的一段路徑」誤收。
void CollectFromJson(string? json, HashSet<string> into)
{
    if (string.IsNullOrWhiteSpace(json)) return;
    try
    {
        using var doc = JsonDocument.Parse(json);
        Walk(doc.RootElement, into);
    }
    catch (JsonException) { /* 不是 JSON 就跳過 */ }
}

// 把一個值正規化成「容器內的檔名」。
// ⚠️ 只收指向**本容器**的網址 —— 外部圖床或 /assets/ 的版面素材不算引用，
//    但也絕不能因為認不得就當成孤兒（它們本來就不在這個容器裡，不會出現在清單上）。
void AddPath(string? value, HashSet<string> into)
{
    if (string.IsNullOrWhiteSpace(value)) return;

    var v = value.Trim();
    var marker = containerUrlPrefix;
    var i = v.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
    if (i >= 0)
    {
        var name = v[(i + marker.Length)..].Split('?')[0];
        if (name.Length > 0) into.Add(Uri.UnescapeDataString(name));
        return;
    }

    // 相對形式（blobPath 欄位存的就是這個）
    if (!v.Contains("://", StringComparison.Ordinal) && !v.StartsWith('/')) into.Add(v);
}

void Walk(JsonElement el, HashSet<string> into)
{
    switch (el.ValueKind)
    {
        case JsonValueKind.Object:
            foreach (var p in el.EnumerateObject())
            {
                if (p.Value.ValueKind == JsonValueKind.String
                    && (p.NameEquals("blobPath") || p.NameEquals("src") || p.NameEquals("url")))
                {
                    AddPath(p.Value.GetString(), into);
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
