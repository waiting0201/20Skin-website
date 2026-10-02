using System.Diagnostics;
using Azure;
using Azure.Identity;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Azure.Storage.Blobs.Specialized;
using Skin20.Api.Common;

// ── 圖片衍生尺寸回填（2026-10-02）──────────────────────────────────────
//
// 為什麼需要這支：上傳流程（UploadHandler.CommitAsync）只會替「之後上傳的圖」產衍生尺寸。
// 容器裡既有的約 4600 張（含舊站匯入的內文圖）沒有，而前台的 srcset 會對**每一張**
// jpg／png／webp 去要 w480／w800／w1200／w1600 —— 缺的那些就是破圖。
//
// 用法（預設 dry-run，只讀不寫）：
//   dotnet run --project tools/image-variants                       # 報告
//   dotnet run --project tools/image-variants -- --apply            # 真的寫
//   dotnet run --project tools/image-variants -- --apply --concurrency 6
//
// 旗標：--account（或環境變數 STORAGE_ACCOUNT，預設 st20skinweb）／--container（預設 media）／
//       --concurrency N（預設 4）／--limit N（只處理前 N 張，試跑用）／--samples N（dry-run 的大小估算取樣數，預設 5）
//
// 🔴🔴 **絕不可對 st20skinprod 跑** —— 那是**預約系統**的儲存體（rg-20skin-prod），不是本專案的。
//    名字只差一個字（本專案是 st20skinweb）。下面直接拒絕，沒有 --force。
//    （2026-09-11 實際踩過：本機範本寫成了 st20skinprod，錯誤不會有任何訊息，上傳照成功。）

var argv = Environment.GetCommandLineArgs().Skip(1).ToArray();
string? Arg(string name)
{
    var i = Array.IndexOf(argv, name);
    return i >= 0 && i + 1 < argv.Length ? argv[i + 1] : null;
}
int IntArg(string name, int fallback) => int.TryParse(Arg(name), out var v) && v > 0 ? v : fallback;

var apply = argv.Contains("--apply");
var account = Arg("--account") ?? Environment.GetEnvironmentVariable("STORAGE_ACCOUNT") ?? "st20skinweb";
var containerName = Arg("--container") ?? "media";
// ⚠️ 每個並行工作最壞情況要吃「像素上限 × 4 byte × 2」的記憶體（解碼＋轉正各一份）。預設 4 保守。
var concurrency = IntArg("--concurrency", 4);
var limit = IntArg("--limit", int.MaxValue);
var sampleCount = IntArg("--samples", 5);

if (account.Trim().Equals("st20skinprod", StringComparison.OrdinalIgnoreCase))
{
    Console.Error.WriteLine(
        "✗ 拒絕執行：st20skinprod 是**線上預約系統**的儲存體帳戶，不是本專案的（本專案是 st20skinweb）。\n"
        + "  這支工具會寫入大量檔案；寫進預約系統的儲存體不會有任何錯誤訊息。");
    return 2;
}

Console.WriteLine($"· 容器 {account}/{containerName}　模式：{(apply ? "🔴 會寫入" : "dry-run（只讀；要寫請加 --apply）")}　並行 {concurrency}");

var client = new BlobContainerClient(
    new Uri($"https://{account}.blob.core.windows.net/{containerName}"), new DefaultAzureCredential());

// ── 1. 列出容器 ────────────────────────────────────────────────────────
var all = new Dictionary<string, BlobItem>(StringComparer.Ordinal);
try
{
    await foreach (var b in client.GetBlobsAsync()) all[b.Name] = b;
}
catch (Exception ex) when (ex is RequestFailedException or AuthenticationFailedException or CredentialUnavailableException)
{
    Console.Error.WriteLine($"✗ 無法列出容器：{ex.Message}\n  需要 az login 的身分具備 Storage Blob Data Reader（--apply 要 Contributor）。");
    return 2;
}
Console.WriteLine($"· 容器裡共 {all.Count} 個 blob");

// ── 2. 找出缺衍生檔的原檔 ──────────────────────────────────────────────
// ⚠️ incoming/ 是 SAS 簽發時的暫存區（尚未驗證、可能是任何東西），不是圖片，一律略過。
var originals = all.Values
    .Where(b => !b.Name.StartsWith("incoming/", StringComparison.Ordinal) && ImageVariants.PathHasVariants(b.Name))
    .ToList();

var work = new List<(BlobItem Original, List<int> MissingWidths)>();
var complete = 0;
foreach (var o in originals)
{
    var missing = ImageVariants.Widths.Where(w => !all.ContainsKey(ImageVariants.VariantPath(o.Name, w))).ToList();
    if (missing.Count == 0) complete++;
    else work.Add((o, missing));
}

var skipped = all.Count - originals.Count - all.Keys.Count(ImageVariants.IsVariantPath);
var needBytes = work.Sum(w => w.Original.Properties.ContentLength ?? 0);
Console.WriteLine($"· 原檔（jpg／png／webp）{originals.Count} 張；四個尺寸齊全 {complete} 張；**需要補 {work.Count} 張**");
Console.WriteLine($"· 其他（gif、incoming/ 等不處理的檔案）{skipped} 個");
Console.WriteLine($"· 需要下載的原檔合計 {needBytes / 1024.0 / 1024.0:F1} MB");

if (work.Count > 0)
{
    Console.WriteLine("· 範例：");
    foreach (var (o, m) in work.Take(5))
        Console.WriteLine($"    {o.Name}　缺 {string.Join("、", m.Select(w => $"w{w}"))}");
}

if (work.Count > limit)
{
    Console.WriteLine($"· --limit {limit}：只處理前 {limit} 張");
    work = work.Take(limit).ToList();
}

// ── 3a. dry-run：取樣估算輸出大小（只讀）──────────────────────────────
if (!apply)
{
    if (work.Count > 0 && sampleCount > 0)
    {
        // 均勻取樣而不是取前 N 個：容器前段與後段（舊站匯入 vs 後台上傳）的圖差異很大。
        var step = Math.Max(1, work.Count / sampleCount);
        var samples = work.Where((_, i) => i % step == 0).Take(sampleCount).ToList();
        long inBytes = 0, outBytes = 0;
        var swEstimate = Stopwatch.StartNew();
        foreach (var (o, _) in samples)
        {
            try
            {
                var bytes = (await client.GetBlobClient(o.Name).DownloadContentAsync()).Value.Content.ToArray();
                var variants = ImageVariants.Generate(bytes);
                inBytes += bytes.Length;
                // 與實際寫入一致：同一份位元組（原圖太窄時共用）只算一次。
                outBytes += variants.DistinctBy(v => v.ActualWidth).Sum(v => (long)v.Data.Length);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"  ⚠ 取樣失敗 {o.Name}：{ex.Message}");
            }
        }
        if (inBytes > 0)
        {
            var perOriginalOut = (double)outBytes / inBytes;
            Console.WriteLine($"· 取樣 {samples.Count} 張（{swEstimate.Elapsed.TotalSeconds:F1} 秒）：輸出約為原檔的 {perOriginalOut:P0}");
            Console.WriteLine($"· 估計新增儲存 ≈ {needBytes * perOriginalOut / 1024.0 / 1024.0:F0} MB（以取樣比例外推，僅供參考）");
        }
    }
    Console.WriteLine("\n（只是報告。要寫入請加 --apply。）");
    return 0;
}

// ── 3b. apply ─────────────────────────────────────────────────────────
// 🔴 冪等且可續跑：已經存在的衍生檔不動（IfNoneMatch="*"），所以中斷後重跑只會補剩下的；
//    兩個行程同時跑也不會互相覆寫（撞到 409／412 視為「別人先寫了」）。
Console.WriteLine($"\n🔴 開始處理 {work.Count} 張…");
var done = 0; var failed = new List<string>(); var written = 0L; var writtenBytes = 0L;
var sw = Stopwatch.StartNew();
using var gate = new SemaphoreSlim(concurrency);

await Task.WhenAll(work.Select(async item =>
{
    await gate.WaitAsync();
    try
    {
        var (o, missing) = item;
        var bytes = (await client.GetBlobClient(o.Name).DownloadContentAsync()).Value.Content.ToArray();
        // 解碼＋縮放是 CPU 工作，丟執行緒池。
        var variants = await Task.Run(() => ImageVariants.Generate(bytes));

        foreach (var v in variants.Where(v => missing.Contains(v.Width)))
        {
            try
            {
                await client.GetBlobClient(v.Path(o.Name)).UploadAsync(BinaryData.FromBytes(v.Data), new BlobUploadOptions
                {
                    HttpHeaders = new BlobHttpHeaders { ContentType = ImageVariants.ContentType, CacheControl = ImageVariants.CacheControl },
                    Conditions = new BlobRequestConditions { IfNoneMatch = ETag.All },
                });
                Interlocked.Increment(ref written);
                Interlocked.Add(ref writtenBytes, v.Data.Length);
            }
            catch (RequestFailedException ex) when (ex.Status is 409 or 412) { /* 別的行程先寫了 */ }
        }
    }
    catch (Exception ex)
    {
        // ⚠️ 單張失敗不中斷整批（一張壞圖不該擋住另外幾千張），但最後要列出來、並以非零結束 ——
        //    那張圖在前台會是破圖，必須有人處理（換圖，或確認它沒有被任何內容使用）。
        lock (failed) failed.Add($"{item.Original.Name}：{ex.Message}");
    }
    finally
    {
        gate.Release();
        var n = Interlocked.Increment(ref done);
        if (n % 50 == 0 || n == work.Count)
            Console.WriteLine($"  {n} / {work.Count}　（{sw.Elapsed.TotalSeconds:F0} 秒）");
    }
}));

Console.WriteLine($"\n✓ 寫入 {written} 個衍生檔（{writtenBytes / 1024.0 / 1024.0:F1} MB），耗時 {sw.Elapsed.TotalSeconds:F0} 秒。");
if (failed.Count > 0)
{
    Console.Error.WriteLine($"\n✗ {failed.Count} 張失敗（這些圖在前台的 srcset 會破圖）：");
    foreach (var f in failed.Take(50)) Console.Error.WriteLine($"  {f}");
    return 1;
}
Console.WriteLine("建議再跑一次 dry-run 確認「需要補」是 0。");
return 0;
