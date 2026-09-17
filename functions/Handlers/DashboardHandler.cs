using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Skin20.Api.Common;
using Skin20.Api.Data;
using Skin20.Api.Models.Dtos;
using Skin20.Api.Services;
using Skin20.Api.Services.Dapper;

namespace Skin20.Api.Handlers;

/// <summary>
/// docs/10 §3.4：純聚合查詢，**無專屬資料表**（docs/08 §K）。
///
/// <para>
/// ⚠️ 分層鐵律（docs/11 §2）：Handler 內<b>禁止直接寫 SQL</b> —— 讀走 Dapper ReadService、
/// 寫走 <c>Skin20DbContext</c>；<b>禁止重複檢查權限碼</b> —— 授權集中在 <c>AppRouter</c>，
/// 唯一例外是資料列擁有者判定（§5.4）。
/// </para>
/// <para>
/// 本端點登入即可（Router 對 <c>GET /admin/dashboard</c> 不要求任何權限碼），純聚合查詢，
/// 不做任何寫入。
/// </para>
/// <para>
/// 🔴 <b>2026-09-17：只剩「各單元狀態筆數」一段。</b>待審核數、近期送審、我的退件
/// 三段隨審核佇列一起移除（CLAUDE.md 決策 20）。
/// </para>
/// </summary>
public sealed class DashboardHandler(ISqlConnectionFactory sqlFactory)
{
    private readonly DashboardReadService _dashboard = new(sqlFactory);

    public async Task<IActionResult> GetAsync(HttpRequest req)
    {
        var ct = req.HttpContext.RequestAborted;

        var countRows = await _dashboard.CountsByUnitAsync(ct);
        var dto = new DashboardDto(BuildUnitCounts(countRows));

        return new OkObjectResult(ApiResponse.Ok(dto));
    }

    /// <summary>九個單元 × 四態（docs/08 §B-1）的筆數矩陣，缺席的組合補 0，前端不必自行防呆。</summary>
    private static IReadOnlyDictionary<string, ContentUnitCountsDto> BuildUnitCounts(IReadOnlyList<UnitStatusCountRow> rows)
    {
        var buckets = UnitCodes.All.ToDictionary(u => u, _ => new int[4]);

        foreach (var row in rows)
        {
            var unit = UnitCodes.FromContentType(row.ContentType);
            if (!buckets.TryGetValue(unit, out var counts)) continue;

            var index = row.Status switch
            {
                1 => 0, // Draft
                2 => 1, // InReview（舊資料才會有）
                3 => 2, // Published
                4 => 3, // Unpublished
                _ => -1,
            };
            if (index < 0) continue;
            counts[index] += row.Count;
        }

        return buckets.ToDictionary(
            kv => kv.Key,
            kv => new ContentUnitCountsDto(kv.Value[0], kv.Value[1], kv.Value[2], kv.Value[3]));
    }
}
