using Dapper;
using Skin20.Api.Common;
using Skin20.Api.Data;
using Skin20.Api.Models.Entities;

namespace Skin20.Api.Services.Dapper;

/// <summary>索引新舊比對用的一列：只有兩個 int。</summary>
public sealed record AiIndexStampRow(int Id, int PublishedVersionId);

/// <summary>療程專屬 FAQ 的所屬療程：已發布的標題與網址。</summary>
public sealed record AiFaqOwnerRow(int FaqId, string Title, string UrlPath);

/// <summary>要切塊的一筆內容。</summary>
public sealed record AiIndexSnapshotRow(int Id, byte ContentType, string? UrlPath, int PublishedVersionId, string Snapshot);

/// <summary>
/// AI 語料索引的讀取路徑（CLAUDE.md 決策 28）。
///
/// <para>
/// 🔴 <b><see cref="GetStampsAsync"/> 刻意不撈 <c>Snapshot</c>。</b> Timer 每 5 分鐘就要跑一次，
/// 而它十次有九次的結論是「沒有事要做」—— 那一次的成本必須只是「一句兩個 int 的查詢」。
/// 撈快照是 1.5 秒與數 MB，在 Azure SQL Basic（5 DTU）上，那是前台每一個 SSR 請求
/// 都要共用的同一顆資料庫。
/// </para>
/// <para>
/// ⚠️ 可見性一律用 <see cref="Visibility.PublicFilter"/>（docs/11 §6.4：判定式只有一份）——
/// 自己手寫 <c>Status = 3</c> 的話，「編輯一篇已上線的文章」會讓它從語料裡消失。
/// </para>
/// </summary>
public interface IAiIndexReadService
{
    /// <summary>全部前台可見內容的 <c>(Id, PublishedVersionId)</c>，用來與 Blob 上的 manifest 比對。</summary>
    Task<IReadOnlyList<AiIndexStampRow>> GetStampsAsync(CancellationToken ct = default);

    /// <summary>指定幾筆的快照。⚠️ 呼叫端必須自己限制筆數（Timer 單輪上限）。</summary>
    Task<IReadOnlyList<AiIndexSnapshotRow>> GetSnapshotsAsync(
        IReadOnlyCollection<int> ids, CancellationToken ct = default);

    /// <summary>
    /// 分類的網址（<c>ContentItemId → UrlPath</c>）。
    /// <para>FAQ 沒有獨立網址（docs/08 §C-6），語料要指到它所屬的分類頁 —— 與 <c>SearchHandler</c> 同一條規則。</para>
    /// </summary>
    Task<IReadOnlyDictionary<int, string>> GetTermUrlsAsync(CancellationToken ct = default);

    /// <summary>
    /// 只被<b>一項</b>療程關聯的 FAQ → 那一項療程（<c>RelationType.TreatmentToFaq</c>）。
    /// <para>
    /// 🔴 療程頁的 FAQ 寫的是「本療程」「詳見上方禁忌症」，拿掉療程名稱就變成指稱不明的通用答案
    /// （2026-10-01 實測：「我懷孕可以打皮秒嗎？」回了「不建議進行本療程」；
    /// 「做幾次會變白？」把皮秒的「3–5 次」講成所有療程通用）。
    /// 被兩項以上療程共用的 FAQ 本來就是通用的，不套。
    /// </para>
    /// </summary>
    Task<IReadOnlyDictionary<int, AiFaqOwnerRow>> GetFaqOwnersAsync(
        IReadOnlyCollection<int> faqIds, CancellationToken ct = default);
}

/// <inheritdoc cref="IAiIndexReadService"/>
public sealed class AiIndexReadService(ISqlConnectionFactory factory) : IAiIndexReadService
{
    public async Task<IReadOnlyList<AiIndexStampRow>> GetStampsAsync(CancellationToken ct = default)
    {
        using var connection = factory.Create();

        var sql = $"""
            SELECT ci.Id, ci.PublishedVersionId
            FROM ContentItems ci
            WHERE {Visibility.PublicFilter}
            ORDER BY ci.Id
            """;

        var rows = await connection.QueryAsync<AiIndexStampRow>(
            new CommandDefinition(sql, new { Now = Clock.UtcNow }, cancellationToken: ct));
        return rows.AsList();
    }

    public async Task<IReadOnlyList<AiIndexSnapshotRow>> GetSnapshotsAsync(
        IReadOnlyCollection<int> ids, CancellationToken ct = default)
    {
        if (ids.Count == 0) return [];

        using var connection = factory.Create();

        var sql = $"""
            SELECT ci.Id, ci.ContentType, ci.UrlPath, ci.PublishedVersionId, cv.Snapshot
            FROM ContentItems ci
            INNER JOIN ContentVersions cv ON cv.Id = ci.PublishedVersionId
            WHERE {Visibility.PublicFilter} AND ci.Id IN @Ids
            ORDER BY ci.Id
            """;

        var rows = await connection.QueryAsync<AiIndexSnapshotRow>(
            new CommandDefinition(sql, new { Now = Clock.UtcNow, Ids = ids }, cancellationToken: ct));
        return rows.AsList();
    }

    public async Task<IReadOnlyDictionary<int, string>> GetTermUrlsAsync(CancellationToken ct = default)
    {
        using var connection = factory.Create();

        var sql = $"""
            SELECT ci.Id, ci.UrlPath
            FROM ContentItems ci
            WHERE {Visibility.PublicFilter} AND ci.ContentType = @TermType AND ci.UrlPath IS NOT NULL
            """;

        var rows = await connection.QueryAsync<(int Id, string UrlPath)>(
            new CommandDefinition(sql,
                new { Now = Clock.UtcNow, TermType = (byte)ContentType.Term }, cancellationToken: ct));

        return rows.ToDictionary(r => r.Id, r => r.UrlPath);
    }

    public async Task<IReadOnlyDictionary<int, AiFaqOwnerRow>> GetFaqOwnersAsync(
        IReadOnlyCollection<int> faqIds, CancellationToken ct = default)
    {
        if (faqIds.Count == 0) return new Dictionary<int, AiFaqOwnerRow>();

        using var connection = factory.Create();

        var rows = await connection.QueryAsync<AiFaqOwnerRow>(
            new CommandDefinition(AiIndexFormat.FaqOwnersSql,
                new
                {
                    Now = Clock.UtcNow,
                    Ids = faqIds,
                    RelationType = (byte)RelationType.TreatmentToFaq,
                    TreatmentType = (byte)ContentType.Treatment,
                },
                cancellationToken: ct));

        return rows.GroupBy(r => r.FaqId)
            .Where(g => g.Count() == 1)
            .ToDictionary(g => g.Key, g => g.Single());
    }
}
