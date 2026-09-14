using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Dapper;
using Microsoft.Data.SqlClient;
using Skin20.Api.Common;

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

// SEO 產物（sitemap／robots／語料）直接進 public/，由 nuxt generate 原樣帶進 .output/public。
// ⚠️ 它們是**產生物**，不進版控（apps/web/.gitignore）。
var publicDir = Environment.GetEnvironmentVariable("SKIN20_EXPORT_PUBLIC")
    ?? Path.Combine(Path.GetDirectoryName(outDir.TrimEnd('/', '\\')) ?? ".", "public");

// 網址一律絕對（sitemap 協定要求）。
var origin = (Environment.GetEnvironmentVariable("SKIN20_SITE_ORIGIN") ?? "https://20skin.tw").TrimEnd('/');

Directory.CreateDirectory(outDir);

await using var db = new SqlConnection(connectionString);

// 🔴 可見性判定**與 API 共用同一份原始碼**（docs/11 §6.4）——
//    `Visibility.PublicFilter` 由 ContentExport.csproj 以 <Compile Include> 連結進來。
//    ⚠️ 2026-09-12 之前這裡手寫了一份 `ci.Status = 3`，與那份不同：
//    工作副本回到草稿（編輯已上線的頁面時一定會發生）就會讓那一頁**從網站上消失**。
var sql = $"""
    SELECT ci.Id, ci.ContentType, ci.Slug, ci.UrlPath, ci.SortOrder, ci.IncludeInSitemap,
           ci.UpdatedAt, cv.Snapshot
    FROM ContentItems ci
    INNER JOIN ContentVersions cv ON cv.Id = ci.PublishedVersionId
    WHERE {Visibility.PublicFilter}
    ORDER BY ci.ContentType, ci.SortOrder, ci.Id;
    """;

var now = DateTime.UtcNow;
var rows = (await db.QueryAsync<ContentRow>(sql, new { Now = now })).ToList();

// 「這一筆前台看得到嗎」的 SELECT 運算式，同樣來自共用的 Visibility.PublicFilter。
// ⚠️ 用在關聯目標與首頁版位引用上 —— 那兩處原本寫 `Status = 3`，同一個分岔。
var visibleExpr = $"CAST(CASE WHEN {Visibility.PublicFilter} THEN 1 ELSE 0 END AS bit)";

// 關聯目標的基本資料。⚠️ 連未發布的也要撈 —— 這樣才分得出「指向草稿」與「指向不存在的內容」，
// 前者在遷移期間是正常的（26 項療程還是草稿），後者是資料錯誤。
var targets = (await db.QueryAsync<TargetRow>($"""
    SELECT ci.Id, ci.ContentType, ci.Slug, ci.UrlPath, ci.Title, {visibleExpr} AS IsVisible
    FROM ContentItems ci;
    """, new { Now = now })).ToDictionary(t => t.Id);

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
                // ⚠️ 「已發布」在這裡的意思是**前台看得到**，不是 Status=3。
                //    工作副本回到草稿的頁面仍然在線上（看的是已核准的那一版，docs/11 §6.4）。
                relation["toIsPublished"] = target.IsVisible;
            }
        }

        items.Add(snapshot);
        total++;
    }

    var name = unitNames[group.Key];

    // 🔴 **文章內文要拆出去，不能留在 articles.json 裡。**
    //    `app/data/_content.ts` 是 `import articlesJson from '~~/content/articles.json'` ——
    //    Vite 會把整份 JSON 內聯成一個**每一頁都要下載**的共用 chunk。
    //    種子資料只有 11 篇、內文全是 null 時看不出問題；搬進舊站的 1100 篇之後，
    //    光內文就 4.5 MB，等於首頁訪客要先下載全站文章的全文才看得到畫面。
    //    拆成一篇一檔之後，前台用 `import.meta.glob` 動態載入，只有那一頁會載到它。
    //    ⚠️ 其他單元不拆 —— 頁面（pages）也有 bodyBlocks，但只有 6 筆。
    if (name == "articles")
    {
        var bodyDir = Path.Combine(outDir, "article-bodies");
        // ⚠️ 每次重建都清空：文章刪掉或改 slug 之後，舊檔留著會被 glob 撈進去，
        //    產生一個沒有任何文章指向它的 chunk（不會壞，但會一直長大）。
        if (Directory.Exists(bodyDir)) Directory.Delete(bodyDir, recursive: true);
        Directory.CreateDirectory(bodyDir);

        var bodies = 0;
        foreach (var snapshot in items.OfType<JsonObject>())
        {
            if (snapshot["fields"] is not JsonObject fields) continue;
            var body = fields["bodyBlocks"];
            if (body is null || body.GetValueKind() == JsonValueKind.Null) continue;

            // 檔名用 slug —— 前台是以 slug 查內文的。slug 的字元集由 API 限死
            //    （^[a-z0-9]+(-[a-z0-9]+)*$），不會有路徑跳脫的問題。
            var slug = snapshot["slug"]?.GetValue<string>();
            if (string.IsNullOrEmpty(slug)) continue;

            // ⚠️ `bodyBlocks` 在快照裡是**一個 JSON 字串**（API 存的是 `GetRawText()`），
            //    不是物件。直接 ToJsonString() 會把它再編碼一次，寫出
            //    `"[{\"type\":…}]"` 這種雙層字串 —— 前台 import 進來會拿到 string 而不是陣列。
            var raw = body.GetValueKind() == JsonValueKind.String
                ? body.GetValue<string>()
                : body.ToJsonString(jsonOptions);
            await File.WriteAllTextAsync(Path.Combine(bodyDir, slug + ".json"),
                raw + "\n", new UTF8Encoding(false));
            fields["bodyBlocks"] = null;
            bodies++;
        }
        Console.WriteLine($"  {"內文",-12} {bodies,4} 篇 → {bodyDir}{Path.DirectorySeparatorChar}{{slug}}.json");
    }

    var path = Path.Combine(outDir, name + ".json");
    await File.WriteAllTextAsync(path, items.ToJsonString(jsonOptions) + "\n", new UTF8Encoding(false));
    Console.WriteLine($"  {name,-12} {group.Count(),4} 筆 → {path}");
}

// 首頁版位與導覽選單不走 ContentItems（docs/08 §G-2、§G-3），各自輸出一份。
//
// 🔴 **版位要讀「首頁那筆 Page 已核准的版本快照」，不是 HomeSections 即時表。**
//    docs/08 §G-2、docs/11 §8：版位編排的送審與版本歷程掛在 SystemKey='home' 的
//    ContentItem 上，快照時把版位序列化進 ContentVersions.Snapshot。
//    HomeSections 那兩張表是**工作副本**（還沒送審的草稿）——直接讀它等於
//    「編輯者拖一拖版位、還沒送審，下一次建置就上線了」，核准這道關卡完全被繞過。
//    ⚠️ 這與九個內容單元的規則是同一條（CLAUDE.md 決策 14）：匯出一律讀已核准的快照。
var homeSnapshotJson = await db.QuerySingleOrDefaultAsync<string>(
    """
    SELECT cv.Snapshot
    FROM ContentItems ci
    INNER JOIN Pages p ON p.Id = ci.Id
    INNER JOIN ContentVersions cv ON cv.Id = ci.PublishedVersionId
    WHERE p.SystemKey = 'home';
    """);

var homeSections = ReadHomeSectionsFromSnapshot(homeSnapshotJson);

// 版位「引用了哪幾筆內容」同樣來自快照；每一筆的顯示欄位（網址、標題、狀態）
// 則要用**現在**的值 —— 快照裡的標題是核准當下那一份，內容後來改了標題、
// 改了網址（會自動補 301）都必須跟著走，否則首頁會出現連到舊網址的卡片。
var referencedIds = homeSections.SelectMany(s => s.ItemIds).Distinct().ToArray();
var referencedById = referencedIds.Length == 0
    ? new Dictionary<int, HomeItemRow>()
    : (await db.QueryAsync<HomeItemRow>(
        $"""
        SELECT ci.Id, ci.ContentType, ci.Slug, ci.UrlPath, ci.Title, {visibleExpr} AS IsVisible
        FROM ContentItems ci
        WHERE ci.Id IN @Ids;
        """, new { Ids = referencedIds, Now = now })).ToDictionary(i => i.Id);

var homeArray = new JsonArray();
foreach (var section in homeSections)
{
    var items = new JsonArray();
    var sortOrder = 0;
    // ⚠️ 只輸出已發布的引用 —— 版位勾了一筆草稿時，前台不該渲染出一個連到 404 的卡片。
    foreach (var id in section.ItemIds)
    {
        if (!referencedById.TryGetValue(id, out var item) || !item.IsVisible) continue;
        items.Add(new JsonObject
        {
            ["contentItemId"] = item.Id,
            ["contentType"] = item.ContentType,
            ["slug"] = item.Slug,
            ["urlPath"] = item.UrlPath,
            ["title"] = item.Title,
            ["sortOrder"] = sortOrder++,
        });
    }

    homeArray.Add(new JsonObject
    {
        ["sectionKey"] = section.SectionKey,
        ["title"] = section.Title,
        ["subtitle"] = section.Subtitle,
        ["isEnabled"] = section.IsEnabled,
        ["sortOrder"] = section.SortOrder,
        // 版位設定是 JSON 字串，這裡解析成物件 —— 前端不必再 parse 一次。
        ["settings"] = string.IsNullOrWhiteSpace(section.Settings) ? null : JsonNode.Parse(section.Settings),
        ["items"] = items,
    });
}

await File.WriteAllTextAsync(Path.Combine(outDir, "home.json"),
    homeArray.ToJsonString(jsonOptions) + "\n", new UTF8Encoding(false));
Console.WriteLine($"  {"home",-12} {homeArray.Count,4} 個版位 → {Path.Combine(outDir, "home.json")}");

var menuRows = (await db.QueryAsync<MenuRow>(
    """
    SELECT Id, MenuKey, ParentId, Label, LinkKind, ContentItemId, Url, RelAttr, OpenInNewTab, SortOrder
    FROM MenuItems ORDER BY SortOrder, Id;
    """)).ToList();

JsonArray BuildMenu(string menuKey, int? parentId) =>
    new(menuRows
        .Where(m => m.MenuKey == menuKey && m.ParentId == parentId)
        .Select(m => (JsonNode)new JsonObject
        {
            ["label"] = m.Label,
            ["linkKind"] = m.LinkKind,
            // linkKind=1 指向內容時，網址由 ContentItems.UrlPath 決定 —— 不在選單裡另存一份。
            ["url"] = m.Url ?? targets.GetValueOrDefault(m.ContentItemId ?? 0)?.UrlPath,
            ["external"] = m.LinkKind == 3,
            ["relAttr"] = m.RelAttr,
            ["openInNewTab"] = m.OpenInNewTab,
            ["children"] = BuildMenu(menuKey, m.Id),
        })
        .ToArray());

var menuObject = new JsonObject { ["main"] = BuildMenu("main", null), ["footer"] = BuildMenu("footer", null) };
await File.WriteAllTextAsync(Path.Combine(outDir, "menu.json"),
    menuObject.ToJsonString(jsonOptions) + "\n", new UTF8Encoding(false));
Console.WriteLine($"  {"menu",-12} 主選單 {menuObject["main"]!.AsArray().Count} 項、頁尾 {menuObject["footer"]!.AsArray().Count} 欄");

// 全站設定是 key-value，不走 ContentItems。
var settings = await db.QueryAsync<(string SettingKey, string? SettingValue, byte ValueType)>(
    "SELECT SettingKey, SettingValue, ValueType FROM SiteSettings ORDER BY SettingKey;");
var settingsObject = new JsonObject();
foreach (var (key, value, _) in settings) settingsObject[key] = value;
await File.WriteAllTextAsync(Path.Combine(outDir, "site.json"),
    settingsObject.ToJsonString(jsonOptions) + "\n", new UTF8Encoding(false));
Console.WriteLine($"  {"site",-12} {settingsObject.Count,4} 項 → {Path.Combine(outDir, "site.json")}");

// ═══════════════════════════════════════════════════════════════════════
// SEO 產物：sitemap 分檔 ＋ 索引、robots.txt、三個語料檔
// ═══════════════════════════════════════════════════════════════════════
//
// docs/07 §4：「sitemap.xml／llms.txt 仍在建置期產生，產物直接進 .output/public。
// 走 API 產生反而更差」——所以它們在這裡產，不在 Function 裡產。
// 後台的 `GET /admin/export/{kind}` 是**同一支格式函式**的截短預覽（Common/ExportFormats.cs）。
//
// ⚠️ 寫進 `apps/web/public/`，由 nuxt generate 原樣帶進 `.output/public`。
//    它們是產生物，不進版控（apps/web/.gitignore）。

Directory.CreateDirectory(publicDir);

// ── robots.txt ─────────────────────────────────────────────────────────
//
// 🔴 內容來自 `SiteSettings.seo.robotsTxt`（docs/08 §H 末段），不是寫死的檔案。
//    後台「sitemap 設定」畫面可以編輯它 —— 寫死的話那個畫面等於沒有作用。
// ⚠️ 不要在這裡自動補 `Disallow: /admin/`：後台實際位於 /admin/，
//    寫進公開檔案等於標示位置（docs/03 §1）。擋索引由該 route 的 X-Robots-Tag 負責。
// 🔴 **產物必須是決定性的**：同一份資料重跑兩次，位元組要一模一樣。
//    時間戳一律用「內容的最後更新時間」，**不是 DateTime.UtcNow** ——
//    用 now 的話每次匯出都產生一份沒有意義的 diff，而這些檔案是進版控的
//    （與 content/*.json 同一個理由：它們是資料庫的投影，要看得出什麼時候真的變了）。
var contentLastModified = rows.Count > 0 ? rows.Max(r => r.UpdatedAt) : now;

var robotsTxt = settingsObject["seo.robotsTxt"]?.GetValue<string>();
if (string.IsNullOrWhiteSpace(robotsTxt))
{
    // 設定被清空時**不要**寫一個空的 robots.txt —— 空檔案與「沒有這個檔案」對爬蟲
    // 是兩件事，而且會把 Sitemap 指令一起弄不見。保留上一份，並明確告警。
    Console.WriteLine("  ⚠ SiteSettings 的 seo.robotsTxt 是空的，略過 robots.txt（保留既有檔案）");
}
else
{
    // 產生物要自己說自己是產生的 —— 否則下一個人會直接改這個檔，
    // 然後在下一次匯出時發現改動不見了，而且找不到原因。
    var robotsHeader = "# ⚠️ 這個檔案由 tools/content-export 產生，內容來自 SiteSettings 的 seo.robotsTxt。\n"
                     + "# 直接改這個檔不會生效 —— 請在後台的「sitemap 設定」畫面改。\n\n";
    await File.WriteAllTextAsync(Path.Combine(publicDir, "robots.txt"),
        robotsHeader + robotsTxt.TrimEnd() + "\n", new UTF8Encoding(false));
    Console.WriteLine($"  {"robots.txt",-12} → {Path.Combine(publicDir, "robots.txt")}");
}

// ── sitemap ────────────────────────────────────────────────────────────
//
// docs/08 §H：5 個分檔**不需要資料表** —— 收錄範圍由
// `ContentType ＋ IncludeInSitemap ＋ 可見性 ＋ UrlPath IS NOT NULL` 算出來。
// 分檔的那幾個旋鈕（是否納入、changefreq、priority）存在 `SiteSettings.seo.sitemapFiles`。
var sitemapEntries = rows
    .Where(r => r.IncludeInSitemap && !string.IsNullOrWhiteSpace(r.UrlPath))
    .Select(r => new ExportIndexEntry(r.ContentType, TitleOf(r), r.UrlPath!, r.UpdatedAt))
    .ToList();

// 哪個型別進哪一個分檔。⚠️ 與 apps/admin 的 `sourceUnits` 一致（那裡是給人看的說明，
//    這裡是真的在分檔）—— 對不上會變成「後台說收在 A 檔、實際在 B 檔」。
var sitemapBuckets = new (string Key, string FileName, byte[] Types)[]
{
    ("pages",      "sitemap-pages.xml",      [8, 7, 5, 6]),
    ("treatments", "sitemap-treatments.xml", [1]),
    ("concerns",   "sitemap-concerns.xml",   [3]),
    ("doctors",    "sitemap-doctors.xml",    [2]),
    ("blog",       "sitemap-blog.xml",       [4, 9]),
};

var sitemapConfig = ParseSitemapConfig(settingsObject["seo.sitemapFiles"]?.GetValue<string>());
var writtenFiles = new List<(string FileName, DateTime LastMod)>();

foreach (var (key, fileName, types) in sitemapBuckets)
{
    var cfg = sitemapConfig.TryGetValue(key, out var c) ? c : (Enabled: true, ChangeFreq: "monthly", Priority: 0.5m);
    if (!cfg.Enabled) continue;

    var bucket = sitemapEntries.Where(e => types.Contains(e.ContentType)).ToList();
    // ⚠️ 空分檔就不要輸出 —— 一個沒有 <url> 的 sitemap 是合法但無意義的，
    //    而且會讓 Search Console 報「沒有可編入索引的網址」。
    if (bucket.Count == 0) continue;

    await File.WriteAllTextAsync(Path.Combine(publicDir, fileName),
        ExportFormats.BuildSitemapFile(bucket, origin, cfg.ChangeFreq, cfg.Priority), new UTF8Encoding(false));
    writtenFiles.Add((fileName, bucket.Max(e => e.UpdatedAt)));
}

await File.WriteAllTextAsync(Path.Combine(publicDir, "sitemap.xml"),
    ExportFormats.BuildSitemapIndex(writtenFiles, origin), new UTF8Encoding(false));
Console.WriteLine($"  {"sitemap",-12} {sitemapEntries.Count,4} 個網址 → {writtenFiles.Count} 個分檔 ＋ sitemap.xml");

// ── 語料檔 ─────────────────────────────────────────────────────────────
//
// 🔴 語料來源是 `Faqs.AiAnswer`（60–100 字、語意自足），**不是 WebAnswer**（docs/04 §2）。
var faqRows = (await db.QueryAsync<ExportFaqRow>($"""
    SELECT ci.Title AS Question, f.AiAnswer, f.LastReviewedOn,
           catCi.Title AS CategoryTitle, catCi.Slug AS CategorySlug
    FROM ContentItems ci
    INNER JOIN Faqs f ON f.Id = ci.Id
    INNER JOIN ContentItems catCi ON catCi.Id = f.CategoryTermId
    WHERE {Visibility.PublicFilter}
    ORDER BY catCi.SortOrder, ci.SortOrder;
    """, new { Now = now })).ToList();

await File.WriteAllTextAsync(Path.Combine(publicDir, "faq.json"),
    ExportFormats.BuildFaqJson(faqRows, contentLastModified) + "\n", new UTF8Encoding(false));
await File.WriteAllTextAsync(Path.Combine(publicDir, "llms-full.txt"),
    ExportFormats.BuildLlmsFullTxt(faqRows, contentLastModified), new UTF8Encoding(false));
await File.WriteAllTextAsync(Path.Combine(publicDir, "llms.txt"),
    ExportFormats.BuildLlmsTxt(sitemapEntries), new UTF8Encoding(false));
Console.WriteLine($"  {"語料",-12} faq.json／llms-full.txt（{faqRows.Count} 則）＋ llms.txt");

Console.WriteLine($"\n匯出完成：{total} 筆內容（只含前台可見的）。");

/// <summary>
/// 從快照裡取標題。sitemap 與 llms.txt 都要標題，而 ContentRow 只有 Snapshot。
/// ⚠️ 用快照裡的標題而不是 ContentItems.Title —— 前台顯示的就是已核准那一版的標題，
/// 兩者在「編輯了標題但還沒核准」時會不一樣。
/// </summary>
static string TitleOf(ContentRow row)
{
    try
    {
        using var doc = JsonDocument.Parse(row.Snapshot);
        return doc.RootElement.TryGetProperty("title", out var t) && t.ValueKind == JsonValueKind.String
            ? t.GetString() ?? string.Empty
            : string.Empty;
    }
    catch (JsonException)
    {
        return string.Empty;
    }
}

/// <summary>
/// 解析 `SiteSettings.seo.sitemapFiles`（後台「sitemap 設定」畫面存的那個 JSON 陣列）。
/// ⚠️ 解析失敗或缺鍵時退回預設值，不要讓整個匯出掛掉 —— 那是一個可以在後台手改的欄位。
/// </summary>
static Dictionary<string, (bool Enabled, string ChangeFreq, decimal Priority)> ParseSitemapConfig(string? json)
{
    var result = new Dictionary<string, (bool, string, decimal)>(StringComparer.Ordinal);
    if (string.IsNullOrWhiteSpace(json)) return result;

    try
    {
        using var doc = JsonDocument.Parse(json);
        if (doc.RootElement.ValueKind != JsonValueKind.Array) return result;

        foreach (var item in doc.RootElement.EnumerateArray())
        {
            if (!item.TryGetProperty("key", out var keyEl) || keyEl.GetString() is not { } key) continue;
            result[key] = (
                !item.TryGetProperty("enabled", out var en) || en.ValueKind != JsonValueKind.False,
                item.TryGetProperty("defaultChangeFreq", out var cf) && cf.ValueKind == JsonValueKind.String
                    ? cf.GetString()! : "monthly",
                item.TryGetProperty("defaultPriority", out var pr) && pr.TryGetDecimal(out var p) ? p : 0.5m);
        }
    }
    catch (JsonException)
    {
        // 退回預設值。
    }

    return result;
}

/// <summary>
/// 從首頁那筆 Page 的已核准快照裡取出版位編排。
///
/// <para>
/// ⚠️ 快照沒有版位資料時回**空清單**，不是回退去讀 <c>HomeSections</c> 即時表。
/// 回退看起來比較「安全」（首頁不會變空），實際上是把未經核准的編排直接推上線 ——
/// 而且沒有任何徵兆。首頁版位空掉是看得見的問題，會有人去按發布；
/// 悄悄上線未核准的編排不會有人發現。
/// </para>
/// <para>
/// 快照形狀見 <c>functions/Models/Dtos/ContentDtos.cs</c> 末段的說明：
/// <c>homeSections</c> 只有在 <c>unit="page"</c> 且 <c>SystemKey="home"</c> 時才非 null。
/// </para>
/// </summary>
static IReadOnlyList<HomeSectionRow> ReadHomeSectionsFromSnapshot(string? snapshotJson)
{
    if (string.IsNullOrWhiteSpace(snapshotJson)) return [];

    using var doc = JsonDocument.Parse(snapshotJson);
    if (!doc.RootElement.TryGetProperty("homeSections", out var sections)
        || sections.ValueKind != JsonValueKind.Array)
    {
        return [];
    }

    var rows = new List<HomeSectionRow>();
    foreach (var section in sections.EnumerateArray())
    {
        var itemIds = new List<int>();
        if (section.TryGetProperty("items", out var items) && items.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in items.EnumerateArray())
            {
                if (item.TryGetProperty("contentItemId", out var id) && id.TryGetInt32(out var value))
                    itemIds.Add(value);
            }
        }

        rows.Add(new HomeSectionRow(
            section.GetProperty("sectionKey").GetString() ?? string.Empty,
            section.TryGetProperty("title", out var t) ? t.GetString() ?? string.Empty : string.Empty,
            section.TryGetProperty("subtitle", out var sub) && sub.ValueKind == JsonValueKind.String ? sub.GetString() : null,
            !section.TryGetProperty("isEnabled", out var en) || en.GetBoolean(),
            section.TryGetProperty("sortOrder", out var so) && so.TryGetInt32(out var sov) ? sov : 0,
            section.TryGetProperty("settings", out var st) && st.ValueKind == JsonValueKind.String ? st.GetString() : null,
            itemIds));
    }

    return [.. rows.OrderBy(r => r.SortOrder)];
}

internal sealed record ContentRow(int Id, byte ContentType, string? Slug, string? UrlPath,
    int SortOrder, bool IncludeInSitemap, DateTime UpdatedAt, string Snapshot);

internal sealed record TargetRow(int Id, byte ContentType, string? Slug, string? UrlPath, string Title, bool IsVisible);

internal sealed record HomeSectionRow(
    string SectionKey, string Title, string? Subtitle, bool IsEnabled, int SortOrder, string? Settings,
    IReadOnlyList<int> ItemIds);

internal sealed record HomeItemRow(int Id, byte ContentType, string? Slug, string? UrlPath, string Title, bool IsVisible);

internal sealed record MenuRow(int Id, string MenuKey, int? ParentId, string Label, byte LinkKind, int? ContentItemId, string? Url, string? RelAttr, bool OpenInNewTab, int SortOrder);
