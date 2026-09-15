using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Skin20.Api.Common;
using Skin20.Api.Data;
using Skin20.Api.Models.Dtos;
using Skin20.Api.Models.Entities;
using Skin20.Api.Services.Dapper;

namespace Skin20.Api.Handlers;

/// <summary>
/// docs/10 §3.4：301 轉址對照表 CRUD ＋ CSV 匯入匯出。
///
/// <para>
/// 🔴 <see cref="Redirect"/> 是全 schema 唯一被公開流量高頻打到的表（docs/08 §H）。
/// 這裡是後台維護介面，不是 <c>/api/fallback</c> 的查詢路徑（那是另一個專案，docs/11 §14）——
/// 但 <b>寫入</b>這張表的規則仍要遵守：<c>ToPath</c> 是實體欄位、<c>FromPath</c> 要能表示
/// query string、新增時要擋一層轉址迴圈。
/// </para>
/// <para>
/// ⚠️ <b>不可做成一頁全載</b>——清單走 <see cref="ListAsync"/> 的分頁；CSV 匯入匯出
/// （<see cref="ExportAsync"/>／<see cref="ImportAsync"/>）才是處理全部約 770 筆的管道，
/// 這是必要功能，770 條不可能手工維護（docs/10 §3.4）。
/// </para>
/// <para>
/// ⚠️ 分層鐵律（docs/11 §2）：Handler 內<b>禁止直接寫 SQL</b> —— 讀走 Dapper ReadService、
/// 寫走 <c>Skin20DbContext</c>；<b>禁止重複檢查權限碼</b> —— 授權集中在 <c>AppRouter</c>，
/// 唯一例外是資料列擁有者判定（§5.4，本單元不適用）。
/// </para>
/// </summary>
public sealed class RedirectHandler(Skin20DbContext db, ISqlConnectionFactory sqlFactory)
{
    // ⚠️ 沒有走 DI 容器註冊 IRedirectReadService——這是刻意的：Program.cs 是禁碰清單
    //    （見交付說明），而 ISqlConnectionFactory 本來就是 Singleton，直接在這裡組裝
    //    這個無狀態的 ReadService 不需要额外的容器註冊。若要改成介面注入，
    //    只差 Program.cs 補一行 AddScoped<IRedirectReadService, RedirectReadService>()。
    private readonly IRedirectReadService reads = new RedirectReadService(sqlFactory);

    /// <summary>
    /// <c>GET /redirects/resolve?path=…</c>：前台（SSR）解析一個舊網址。
    ///
    /// <para>
    /// 🔴 <b>2026-09-15 取代 <c>api/fallback</c>。</b> 前台改成執行期 SSR 之後，
    /// 那支 SWA Managed Function 與 Nuxt 的 SSR function 互斥（兩者都要佔
    /// <c>api_location</c>），所以 301 的查詢搬到這裡，由 Nuxt 的 server middleware 呼叫。
    /// </para>
    ///
    /// <para>
    /// ⚠️ <b>正規化留在這一端，不要搬進 Nuxt。</b> <see cref="NormalizePath"/> 同時是
    /// 寫入端（後台新增與 CSV 匯入）用的那一份 —— 讀寫共用同一段是這條規則能成立的前提。
    /// 搬進前端等於再造一份，而分岔的症狀是「後台看得到規則，但線上不轉址」，
    /// 只有上線後才會發現（docs/08 §H）。
    /// </para>
    ///
    /// <para>
    /// ⚠️ 未命中回 <b>404</b>，不是 200 帶空值 —— 呼叫端（Nuxt middleware）就是拿
    /// 「有沒有命中」決定要 301 還是繼續算繪，用狀態碼表達最不會被誤用。
    /// </para>
    /// </summary>
    public async Task<IActionResult> ResolveAsync(HttpRequest req)
    {
        var raw = req.Query["path"].ToString();
        if (string.IsNullOrWhiteSpace(raw))
            throw AppException.BadRequest(ErrorCodes.ValidationFormat, "缺少 path 參數。");

        // ⚠️ 兩個鍵都查：進來的網址可能是百分比編碼過的，也可能不是。
        //    Uri.UnescapeDataString 對沒有編碼的字串是無害的（原樣回傳）。
        var decodedKey = NormalizePath(Uri.UnescapeDataString(raw));
        var encodedKey = NormalizePath(raw);

        var hit = await reads.ResolveAsync(decodedKey, encodedKey)
            ?? throw AppException.NotFound($"轉址規則 {decodedKey}");

        CacheControl.Public(req.HttpContext.Response);
        return new OkObjectResult(ApiResponse.Ok(hit));
    }

    public async Task<IActionResult> ListAsync(HttpRequest req)
    {
        var page = Paging.Page(req.Query["page"]);
        var pageSize = Paging.PageSize(req.Query["pageSize"]);
        var keyword = req.Query["keyword"].FirstOrDefault();

        bool? isActive = bool.TryParse(req.Query["isActive"].FirstOrDefault(), out var parsedActive) ? parsedActive : null;
        byte? source = byte.TryParse(req.Query["source"].FirstOrDefault(), out var parsedSource) ? parsedSource : null;
        var sortBy = req.Query["sortBy"].FirstOrDefault();
        // 後台預設「新的在前」。只有明確帶 asc 才升冪。
        var sortDescending = !string.Equals(req.Query["sortDir"].FirstOrDefault(), "asc", StringComparison.OrdinalIgnoreCase);

        var (items, total) = await reads.ListAsync(
            keyword, isActive, source, sortBy, sortDescending, page, pageSize, req.HttpContext.RequestAborted);

        return new OkObjectResult(ApiResponse.Ok(Paging.Build(items, total, page, pageSize)));
    }

    /// <summary>
    /// <c>GET /admin/redirect/stats</c>：清單上方的統計卡。
    /// <para>⚠️ 獨立一支而不是塞進清單回應 —— 統計是全表的，清單是一頁的，
    /// 混在同一個回應裡遲早會有人拿分頁結果去加總。</para>
    /// </summary>
    public async Task<IActionResult> StatsAsync()
    {
        var stats = await reads.StatsAsync();
        return new OkObjectResult(ApiResponse.Ok(stats));
    }

    public async Task<IActionResult> CreateAsync(HttpRequest req)
    {
        var body = await req.ReadFromJsonAsync<RedirectCreateRequest>()
            ?? throw AppException.BadRequest(ErrorCodes.ValidationRequired, "缺少請求內容。");

        if (string.IsNullOrWhiteSpace(body.FromPath) || string.IsNullOrWhiteSpace(body.ToPath))
            throw AppException.BadRequest(ErrorCodes.ValidationRequired, "fromPath 與 toPath 為必填。");

        var ct = req.HttpContext.RequestAborted;
        var fromPath = NormalizePath(body.FromPath!);
        var toPath = body.ToPath!.Trim();

        if (body.ToContentItemId is int targetId && !await reads.ContentItemExistsAsync(targetId, ct))
            throw AppException.NotFound("目標內容");

        await EnsureNoRedirectLoopAsync(fromPath, toPath, excludeId: null, ct);

        if (await reads.FromPathExistsAsync(fromPath, excludeId: null, ct))
            throw AppException.Conflict(ErrorCodes.ConflictDuplicate, $"來源路徑「{fromPath}」已經有一筆轉址規則。");

        var entity = new Redirect
        {
            FromPath = fromPath,
            ToPath = toPath,
            ToContentItemId = body.ToContentItemId,
            StatusCode = body.StatusCode ?? 301,
            IsActive = body.IsActive ?? true,
            Source = (RedirectSource)(body.Source ?? (byte)RedirectSource.Manual),
            IsVerified = false,
            CreatedAt = Clock.UtcNow,
        };

        db.Redirects.Add(entity);
        await db.SaveChangesAsync(ct);

        return new OkObjectResult(ApiResponse.Ok(ToDto(entity), "新增成功。"));
    }

    public async Task<IActionResult> UpdateAsync(HttpRequest req, string id)
    {
        if (!int.TryParse(id, out var redirectId))
            throw AppException.NotFound("轉址規則");

        var ct = req.HttpContext.RequestAborted;
        var entity = await db.Redirects.FindAsync([redirectId], ct)
            ?? throw AppException.NotFound("轉址規則");

        var body = await req.ReadFromJsonAsync<RedirectUpdateRequest>()
            ?? throw AppException.BadRequest(ErrorCodes.ValidationRequired, "缺少請求內容。");

        var fromPath = string.IsNullOrWhiteSpace(body.FromPath) ? entity.FromPath : NormalizePath(body.FromPath!);
        var toPath = string.IsNullOrWhiteSpace(body.ToPath) ? entity.ToPath : body.ToPath!.Trim();

        if (body.ToContentItemId is int targetId && !await reads.ContentItemExistsAsync(targetId, ct))
            throw AppException.NotFound("目標內容");

        await EnsureNoRedirectLoopAsync(fromPath, toPath, excludeId: entity.Id, ct);

        if (!string.Equals(fromPath, entity.FromPath, StringComparison.Ordinal)
            && await reads.FromPathExistsAsync(fromPath, entity.Id, ct))
            throw AppException.Conflict(ErrorCodes.ConflictDuplicate, $"來源路徑「{fromPath}」已經有一筆轉址規則。");

        entity.FromPath = fromPath;
        entity.ToPath = toPath;
        entity.ToContentItemId = body.ToContentItemId;
        entity.StatusCode = body.StatusCode ?? entity.StatusCode;
        entity.IsActive = body.IsActive ?? entity.IsActive;
        if (body.Source is byte source) entity.Source = (RedirectSource)source;
        if (body.IsVerified is bool verified) entity.IsVerified = verified;

        await db.SaveChangesAsync(ct);

        return new OkObjectResult(ApiResponse.Ok(ToDto(entity), "更新成功。"));
    }

    public async Task<IActionResult> DeleteAsync(string id)
    {
        if (!int.TryParse(id, out var redirectId))
            throw AppException.NotFound("轉址規則");

        var entity = await db.Redirects.FindAsync(redirectId)
            ?? throw AppException.NotFound("轉址規則");

        db.Redirects.Remove(entity);
        await db.SaveChangesAsync();

        return new OkObjectResult(ApiResponse.Ok("刪除成功。"));
    }

    /// <summary>
    /// CSV 匯出。⚠️ 這不是裸檔案下載——docs/10 §2「所有端點一律回傳統一信封」沒有為檔案
    /// 下載開例外，所以 CSV 全文以字串放在 <c>data.csv</c>，交由後台前端組 Blob 觸發下載。
    /// </summary>
    public async Task<IActionResult> ExportAsync()
    {
        var items = await reads.ListAllAsync();
        var csv = BuildCsv(items);

        var result = new RedirectExportResult
        {
            Count = items.Count,
            FileName = $"redirects-{Clock.Now:yyyyMMdd-HHmm}.csv",
            Csv = csv,
        };

        return new OkObjectResult(ApiResponse.Ok(result, $"匯出 {items.Count} 筆。"));
    }

    /// <summary>
    /// CSV 匯入。約 770 條不可能手工維護（docs/10 §3.4）。
    /// 三種衝突各自檢查並在結果中列出，<b>單一列失敗不影響其他列</b>：
    /// 同一來源已存在、轉址迴圈、目標內容不存在。
    /// </summary>
    public async Task<IActionResult> ImportAsync(HttpRequest req)
    {
        var body = await req.ReadFromJsonAsync<RedirectImportRequest>()
            ?? throw AppException.BadRequest(ErrorCodes.ValidationRequired, "缺少請求內容。");

        if (string.IsNullOrWhiteSpace(body.Csv))
            throw AppException.BadRequest(ErrorCodes.ValidationRequired, "csv 為必填。");

        var ct = req.HttpContext.RequestAborted;
        var rows = ParseCsv(body.Csv!);

        if (rows.Count == 0)
            return new OkObjectResult(ApiResponse.Ok(new RedirectImportResult(), "沒有可匯入的資料列。"));

        // 770 列量體很小，一次把既有 FromPath 撈進記憶體比逐列查 DB 快很多，
        // 也讓「本次檔案內重複」與「跟資料庫既有的衝突」用同一份資料判斷。
        var existingFromPaths = await reads.GetExistingFromPathsAsync(ct);
        var batchFromPaths = new HashSet<string>(StringComparer.Ordinal);
        var errors = new List<RedirectImportRowError>();
        var toInsert = new List<Redirect>();

        // 🔴 覆蓋模式：來源已存在時改成更新那一筆，而不是當成錯誤跳過。
        //    ⚠️ 只更新 ToPath／StatusCode／IsActive —— **不動 Source 與 IsVerified**。
        //    重匯一份遷移工具產生的 CSV 不應該把「人工新增」的來源標記改掉，
        //    更不該把已經人工核對過的規則打回未核對。
        var overwrite = body.OverwriteExisting;
        var existingByFromPath = overwrite
            ? await db.Redirects.Where(r => existingFromPaths.Contains(r.FromPath)).ToDictionaryAsync(r => r.FromPath, ct)
            : [];
        var updatedCount = 0;

        for (var i = 0; i < rows.Count; i++)
        {
            var rowNumber = i + 2; // 第 1 列是標頭
            var row = rows[i];

            if (!TryGet(row, "frompath", out var rawFrom) || !TryGet(row, "topath", out var rawTo))
            {
                errors.Add(new RedirectImportRowError(rowNumber, rawFrom, "fromPath 與 toPath 為必填。"));
                continue;
            }

            var fromPath = NormalizePath(rawFrom);
            var toPath = rawTo.Trim();
            var normalizedTo = NormalizePath(toPath);

            if (string.Equals(fromPath, normalizedTo, StringComparison.Ordinal))
            {
                errors.Add(new RedirectImportRowError(rowNumber, fromPath, "來源與目標路徑相同，會形成自我迴圈。"));
                continue;
            }

            if (existingFromPaths.Contains(fromPath))
            {
                if (!overwrite || !existingByFromPath.TryGetValue(fromPath, out var existingRow))
                {
                    errors.Add(new RedirectImportRowError(rowNumber, fromPath, "同一來源已存在於資料庫中。"));
                    continue;
                }

                if (string.Equals(fromPath, normalizedTo, StringComparison.Ordinal))
                {
                    errors.Add(new RedirectImportRowError(rowNumber, fromPath, "來源與目標路徑相同，會形成自我迴圈。"));
                    continue;
                }

                existingRow.ToPath = toPath;
                if (TryGet(row, "statuscode", out var rawOverwriteStatus) && short.TryParse(rawOverwriteStatus, out var parsedOverwriteStatus))
                    existingRow.StatusCode = parsedOverwriteStatus;
                if (TryGet(row, "isactive", out var rawOverwriteActive))
                    existingRow.IsActive = ParseBool(rawOverwriteActive, defaultValue: true);
                updatedCount++;
                continue;
            }

            if (!batchFromPaths.Add(fromPath))
            {
                errors.Add(new RedirectImportRowError(rowNumber, fromPath, "本次匯入檔案內有重複的來源路徑。"));
                continue;
            }

            if (existingFromPaths.Contains(normalizedTo) || batchFromPaths.Contains(normalizedTo))
            {
                batchFromPaths.Remove(fromPath);
                errors.Add(new RedirectImportRowError(
                    rowNumber, fromPath, $"目標路徑「{toPath}」本身已是另一筆轉址的來源，會形成轉址鏈。"));
                continue;
            }

            int? toContentItemId = null;
            if (TryGet(row, "tocontentitemid", out var rawTargetId))
            {
                if (!int.TryParse(rawTargetId, out var parsedId))
                {
                    batchFromPaths.Remove(fromPath);
                    errors.Add(new RedirectImportRowError(rowNumber, fromPath, "toContentItemId 格式錯誤。"));
                    continue;
                }

                if (!await reads.ContentItemExistsAsync(parsedId, ct))
                {
                    batchFromPaths.Remove(fromPath);
                    errors.Add(new RedirectImportRowError(rowNumber, fromPath, $"目標內容不存在（Id={parsedId}）。"));
                    continue;
                }

                toContentItemId = parsedId;
            }

            var statusCode = TryGet(row, "statuscode", out var rawStatus) && short.TryParse(rawStatus, out var parsedStatus)
                ? parsedStatus
                : (short)301;
            var isActive = !TryGet(row, "isactive", out var rawActive) || ParseBool(rawActive, defaultValue: true);
            var source = TryGet(row, "source", out var rawSource) && byte.TryParse(rawSource, out var parsedSource)
                ? (RedirectSource)parsedSource
                : RedirectSource.MigrationTool;

            toInsert.Add(new Redirect
            {
                FromPath = fromPath,
                ToPath = toPath,
                ToContentItemId = toContentItemId,
                StatusCode = statusCode,
                IsActive = isActive,
                Source = source,
                IsVerified = false,
                CreatedAt = Clock.UtcNow,
            });
        }

        if (toInsert.Count > 0 || updatedCount > 0)
        {
            // docs/11 §6.1：多列寫入包 execution strategy＋交易；EnableRetryOnFailure 下
            // 直接 BeginTransactionAsync 會被擋下。
            var strategy = db.Database.CreateExecutionStrategy();
            await strategy.ExecuteAsync(async () =>
            {
                await using var tx = await db.Database.BeginTransactionAsync(ct);
                db.Redirects.AddRange(toInsert);
                await db.SaveChangesAsync(ct);
                await tx.CommitAsync(ct);
            });
        }

        var result = new RedirectImportResult
        {
            TotalRows = rows.Count,
            Imported = toInsert.Count,
            Updated = updatedCount,
            Skipped = errors.Count,
            Errors = errors,
        };

        return new OkObjectResult(ApiResponse.Ok(
            result, $"匯入完成：{toInsert.Count} 筆新增、{updatedCount} 筆更新、{errors.Count} 筆跳過。"));
    }

    // ── 轉址迴圈防護（docs/08 §H）───────────────────────────────────────

    /// <summary>
    /// 一層迴圈防護：新的 <paramref name="toPath"/> 不得等於自己的 <paramref name="fromPath"/>，
    /// 也不得已經是另一筆轉址的 <c>FromPath</c>（那樣會形成 A→B→C 的鏈）。
    /// ⚠️ 多層鏈的遞移閉包檢查是上線前驗收腳本的事，不在這裡做（docs/08 §H 末段）。
    /// </summary>
    private async Task EnsureNoRedirectLoopAsync(string fromPath, string toPath, int? excludeId, CancellationToken ct)
    {
        var normalizedTarget = NormalizePath(toPath);

        if (string.Equals(fromPath, normalizedTarget, StringComparison.Ordinal))
            throw AppException.Conflict(ErrorCodes.ConflictState, "來源與目標路徑相同，會形成自我迴圈。");

        if (await reads.IsUsedAsFromPathAsync(normalizedTarget, excludeId, ct))
            throw AppException.Conflict(
                ErrorCodes.ConflictState,
                $"目標路徑「{toPath}」本身已是另一筆轉址的來源，新增／修改這筆會形成轉址鏈，請先處理該筆轉址。");
    }

    /// <summary>
    /// 舊路徑的正規化（docs/08 §H）：path 轉小寫 ＋ query string 依鍵值字串排序後重組。
    /// <para>
    /// ⚠️ <b><c>/api/fallback</c> 比對前必須跑同一套正規化</b>，否則
    /// <c>share.php?class=醫美新知&amp;year=2024</c> 這類約 40 條的年份組合會在上線後對不上
    /// （docs/08 §H、docs/11 §14）。那支 function 是另一個獨立專案（net9.0、只用 Dapper），
    /// 這裡的實作即是它必須複製的規格：
    /// <list type="number">
    /// <item>確保以 <c>/</c> 開頭</item>
    /// <item>path 部分轉小寫（ASCII，不影響中文字元）</item>
    /// <item>query string 依 <c>key=value</c> 整串做序數排序後以 <c>&amp;</c> 重新組回</item>
    /// </list>
    /// </para>
    /// </summary>
    internal static string NormalizePath(string raw)
    {
        var trimmed = raw.Trim();
        if (!trimmed.StartsWith('/')) trimmed = "/" + trimmed;

        var queryIndex = trimmed.IndexOf('?');
        var path = (queryIndex >= 0 ? trimmed[..queryIndex] : trimmed).ToLowerInvariant();
        var query = queryIndex >= 0 ? trimmed[(queryIndex + 1)..] : "";

        if (query.Length == 0) return path;

        var pairs = query
            .Split('&', StringSplitOptions.RemoveEmptyEntries)
            .Select(p => p.Trim())
            .Where(p => p.Length > 0)
            .OrderBy(p => p, StringComparer.Ordinal)
            .ToArray();

        return pairs.Length == 0 ? path : $"{path}?{string.Join('&', pairs)}";
    }

    private static bool TryGet(IReadOnlyDictionary<string, string> row, string key, out string value)
    {
        if (row.TryGetValue(key, out var raw) && !string.IsNullOrWhiteSpace(raw))
        {
            value = raw.Trim();
            return true;
        }

        value = "";
        return false;
    }

    private static bool ParseBool(string raw, bool defaultValue)
    {
        var t = raw.Trim();
        if (t.Length == 0) return defaultValue;
        return t is "1" || t.Equals("true", StringComparison.OrdinalIgnoreCase) || t.Equals("yes", StringComparison.OrdinalIgnoreCase);
    }

    private static RedirectDto ToDto(Redirect r) => new()
    {
        Id = r.Id,
        FromPath = r.FromPath,
        ToPath = r.ToPath,
        ToContentItemId = r.ToContentItemId,
        StatusCode = r.StatusCode,
        IsActive = r.IsActive,
        Source = (byte)r.Source,
        IsVerified = r.IsVerified,
        CreatedAt = r.CreatedAt,
    };

    private static string BuildCsv(IReadOnlyList<RedirectDto> items)
    {
        var sb = new StringBuilder();
        sb.Append("FromPath,ToPath,ToContentItemId,StatusCode,IsActive,Source,IsVerified,CreatedAt\r\n");

        foreach (var item in items)
        {
            sb.Append(CsvField(item.FromPath)).Append(',')
                .Append(CsvField(item.ToPath)).Append(',')
                .Append(item.ToContentItemId?.ToString() ?? "").Append(',')
                .Append(item.StatusCode).Append(',')
                .Append(item.IsActive ? '1' : '0').Append(',')
                .Append(item.Source).Append(',')
                .Append(item.IsVerified ? '1' : '0').Append(',')
                .Append(item.CreatedAt.ToString("o"))
                .Append("\r\n");
        }

        return sb.ToString();
    }

    private static string CsvField(string value)
        => value.IndexOfAny([',', '"', '\n', '\r']) < 0 ? value : $"\"{value.Replace("\"", "\"\"")}\"";

    /// <summary>
    /// 最小可用的 CSV 解析（無外部套件——csproj 不在這次工作範圍內）。
    /// 支援雙引號包欄位、跳脫雙引號（<c>""</c>）、欄位內逗號／換行。
    /// </summary>
    private static List<Dictionary<string, string>> ParseCsv(string csv)
    {
        var rawRows = ParseCsvRows(csv);
        if (rawRows.Count == 0) return [];

        var header = rawRows[0].Select(h => h.Trim().ToLowerInvariant()).ToArray();
        var result = new List<Dictionary<string, string>>();

        for (var i = 1; i < rawRows.Count; i++)
        {
            var fields = rawRows[i];
            if (fields.Count == 1 && fields[0].Length == 0) continue; // 空白列

            var dict = new Dictionary<string, string>();
            for (var c = 0; c < header.Length && c < fields.Count; c++)
                dict[header[c]] = fields[c].Trim();

            result.Add(dict);
        }

        return result;
    }

    private static List<List<string>> ParseCsvRows(string csv)
    {
        var rows = new List<List<string>>();
        var field = new StringBuilder();
        var row = new List<string>();
        var inQuotes = false;
        var i = 0;

        while (i < csv.Length)
        {
            var c = csv[i];

            if (inQuotes)
            {
                if (c == '"')
                {
                    if (i + 1 < csv.Length && csv[i + 1] == '"') { field.Append('"'); i += 2; continue; }
                    inQuotes = false;
                    i++;
                    continue;
                }

                field.Append(c);
                i++;
                continue;
            }

            switch (c)
            {
                case '"':
                    inQuotes = true;
                    i++;
                    break;
                case ',':
                    row.Add(field.ToString());
                    field.Clear();
                    i++;
                    break;
                case '\r':
                    i++;
                    break;
                case '\n':
                    row.Add(field.ToString());
                    field.Clear();
                    rows.Add(row);
                    row = [];
                    i++;
                    break;
                default:
                    field.Append(c);
                    i++;
                    break;
            }
        }

        if (field.Length > 0 || row.Count > 0)
        {
            row.Add(field.ToString());
            rows.Add(row);
        }

        return rows;
    }
}
