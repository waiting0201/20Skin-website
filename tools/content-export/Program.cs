using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Dapper;
using Microsoft.Data.SqlClient;

// ── 建置期資料匯出（docs/09-frontend.md §3）────────────────────────────
//
// 用法：dotnet run --project tools/content-export -- <輸出目錄> [連線字串]
//       連線字串也可由 SKIN20_EXPORT_SQL 提供。
//
// 🔴 **讀的是「已核准的那一版快照」，不是 ContentItems 的即時欄位。**
//    docs/09 §3 把兩種錯法都寫清楚了：讀即時欄位＋可見性看 Status=3，編輯一個已上線的
//    療程頁會讓它 404；讀即時欄位＋不看 Status，未經審核的編輯直接上線。
//    正解是讀快照 ＋ 可見性看 PublishedVersionId —— 編輯期間前台照常顯示舊版。
//
// ⚠️ 這支程式**不做內容轉換**。它把快照原樣倒出來，只多做一件事：把關聯的
//    ContentItemId 解析成 slug／urlPath／標題，否則前端拿到一串數字沒有用。
//    「這些欄位在畫面上長什麼樣」屬於前端，寫在 apps/web/app/data/*.ts。
//    兩件事分開，出錯時才知道要看哪一支。

var outDir = args.Length > 0 ? args[0] : "apps/web/content";
var connectionString = (args.Length > 1 ? args[1] : null)
    ?? Environment.GetEnvironmentVariable("SKIN20_EXPORT_SQL")
    ?? throw new InvalidOperationException("缺少連線字串：請給第二個參數或設定 SKIN20_EXPORT_SQL。");

Directory.CreateDirectory(outDir);

await using var db = new SqlConnection(connectionString);

// 可見性判定與 API 共用同一條規則（docs/11 §6.4）：有已核准的版本才算在線上。
// PublishAt／UnpublishAt 的時間窗一併考慮 —— 排程下架的內容不該還出現在產物裡。
const string sql = """
    SELECT ci.Id, ci.ContentType, ci.Slug, ci.UrlPath, ci.SortOrder, ci.IncludeInSitemap,
           ci.UpdatedAt, cv.Snapshot
    FROM ContentItems ci
    INNER JOIN ContentVersions cv ON cv.Id = ci.PublishedVersionId
    WHERE ci.Status = 3
      AND (ci.PublishAt   IS NULL OR ci.PublishAt   <= SYSUTCDATETIME())
      AND (ci.UnpublishAt IS NULL OR ci.UnpublishAt >  SYSUTCDATETIME())
    ORDER BY ci.ContentType, ci.SortOrder, ci.Id;
    """;

var rows = (await db.QueryAsync<ContentRow>(sql)).ToList();

// 關聯目標的基本資料。⚠️ 連未發布的也要撈 —— 這樣才分得出「指向草稿」與「指向不存在的內容」，
// 前者在遷移期間是正常的（26 項療程還是草稿），後者是資料錯誤。
var targets = (await db.QueryAsync<TargetRow>("""
    SELECT Id, ContentType, Slug, UrlPath, Title, Status FROM ContentItems;
    """)).ToDictionary(t => t.Id);

var unitNames = new Dictionary<byte, string>
{
    [1] = "treatments", [2] = "doctors", [3] = "concerns", [4] = "articles", [5] = "cases",
    [6] = "faqs", [7] = "clinics", [8] = "pages", [9] = "terms",
};

var jsonOptions = new JsonSerializerOptions { WriteIndented = true };
var grouped = rows.GroupBy(r => r.ContentType);
var total = 0;

foreach (var group in grouped)
{
    var items = new JsonArray();

    foreach (var row in group)
    {
        var snapshot = JsonNode.Parse(row.Snapshot)?.AsObject()
            ?? throw new InvalidOperationException($"內容 {row.Id} 的快照不是合法 JSON。");

        // 快照存的是「當時」的狀態；這幾個欄位以主幹的現值為準，因為它們可能在
        // 發布之後被系統改動（例如換分類造成 UrlPath 重算並補了一筆 301）。
        snapshot["urlPath"] = row.UrlPath;
        snapshot["sortOrder"] = row.SortOrder;
        snapshot["includeInSitemap"] = row.IncludeInSitemap;
        snapshot["updatedAt"] = row.UpdatedAt.ToString("s");

        if (snapshot["relations"] is JsonArray relations)
        {
            foreach (var relation in relations.OfType<JsonObject>())
            {
                var toId = relation["toContentItemId"]?.GetValue<int>();
                if (toId is null || !targets.TryGetValue(toId.Value, out var target)) continue;

                relation["toSlug"] = target.Slug;
                relation["toUrlPath"] = target.UrlPath;
                relation["toTitle"] = target.Title;
                // 指向草稿的關聯照樣輸出，由前端決定要不要渲染成連結 ——
                // 遷移期間有 26 項療程還是草稿，靜默丟掉會讓困擾頁的建議療程整段消失。
                relation["toIsPublished"] = target.Status == 3;
            }
        }

        items.Add(snapshot);
        total++;
    }

    var name = unitNames[group.Key];
    var path = Path.Combine(outDir, name + ".json");
    await File.WriteAllTextAsync(path, items.ToJsonString(jsonOptions) + "\n", new UTF8Encoding(false));
    Console.WriteLine($"  {name,-12} {group.Count(),4} 筆 → {path}");
}

// 全站設定是 key-value，不走 ContentItems。
var settings = await db.QueryAsync<(string SettingKey, string? SettingValue, byte ValueType)>(
    "SELECT SettingKey, SettingValue, ValueType FROM SiteSettings ORDER BY SettingKey;");
var settingsObject = new JsonObject();
foreach (var (key, value, _) in settings) settingsObject[key] = value;
await File.WriteAllTextAsync(Path.Combine(outDir, "site.json"),
    settingsObject.ToJsonString(jsonOptions) + "\n", new UTF8Encoding(false));
Console.WriteLine($"  {"site",-12} {settingsObject.Count,4} 項 → {Path.Combine(outDir, "site.json")}");

Console.WriteLine($"\n匯出完成：{total} 筆內容（只含已發布且在上下架時間窗內的）。");

internal sealed record ContentRow(int Id, byte ContentType, string? Slug, string? UrlPath,
    int SortOrder, bool IncludeInSitemap, DateTime UpdatedAt, string Snapshot);

internal sealed record TargetRow(int Id, byte ContentType, string? Slug, string? UrlPath, string Title, byte Status);
