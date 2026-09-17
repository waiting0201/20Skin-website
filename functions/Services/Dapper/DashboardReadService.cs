using Dapper;
using Skin20.Api.Data;

namespace Skin20.Api.Services.Dapper;

/// <summary>單一 (單元, 狀態) 組合的筆數。</summary>
public sealed record UnitStatusCountRow(byte ContentType, byte Status, int Count);

/// <summary>
/// 儀表板聚合查詢（docs/10-api.md §3.4）：<b>無專屬資料表</b>，全部從既有表聚合。
/// ⚠️ 不透過 DI 註冊，理由同 <see cref="ContentReadService"/>。
/// </summary>
public sealed class DashboardReadService(ISqlConnectionFactory factory)
{
    /// <summary>九個單元 × 四態的筆數矩陣，供後台首頁的內容總覽卡片。</summary>
    public async Task<IReadOnlyList<UnitStatusCountRow>> CountsByUnitAsync(CancellationToken ct = default)
    {
        const string sql = "SELECT ContentType, Status, COUNT(*) AS Count FROM ContentItems GROUP BY ContentType, Status;";
        using var conn = factory.Create();
        var rows = await conn.QueryAsync<UnitStatusCountRow>(new CommandDefinition(sql, cancellationToken: ct));
        return rows.ToList();
    }

    // 🔴 `PendingReviewCountAsync` 與 `MyRejectedAsync` 2026-09-17 移除 ——
    //    送審整層不做了（CLAUDE.md 決策 20），`ContentReviews` 已經沒有人寫入，
    //    兩支查詢的結果只會是恆定的 0 與空清單。
}
