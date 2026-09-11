using Microsoft.Azure.Functions.Worker;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Skin20.Api.Common;
using Skin20.Api.Data;
using Skin20.Api.Models.Entities;
using Skin20.Api.Services;

namespace Skin20.Api.Functions;

/// <summary>
/// 排程發布／定時下架（docs/11-backend-design.md §11）。
///
/// <para>
/// 🔴 <b>這支不翻狀態，只觸發重建。</b>
/// </para>
/// <para>
/// 「已排程」不是第五種狀態 —— 核准即 <c>Status=3</c>，前台看不看得到由
/// <see cref="Visibility.PublicFilter"/> 的時間窗決定（docs/11 §7）。
/// 若改成由這支 Timer 去翻狀態，翻狀態與觸發重建就是<b>兩個非原子步驟</b>：
/// 重建先跑就會漏掉那筆，要等下一輪才會上線。判定式放在查詢裡就沒有這個時序問題。
/// </para>
/// <para>
/// 所以這支要做的只有一件事：<b>「有內容剛跨過時間窗的邊界了，去重建一次」</b>。
/// </para>
/// </summary>
public sealed class ScheduledPublishFunction(
    Skin20DbContext db,
    IRebuildService rebuild,
    ILogger<ScheduledPublishFunction> logger)
{
    /// <summary>
    /// cron 由 app setting 注入，預設每 15 分鐘。
    /// <para>
    /// ⚠️ <b><c>RunOnStartup</c> 一律不要開</b> —— 每次部署都會多跑一次，
    /// 而部署本身就已經重建過了。
    /// </para>
    /// </summary>
    [Function("ScheduledPublish")]
    public async Task Run([TimerTrigger("%PublishScheduleCron%")] TimerInfo timer, CancellationToken ct)
    {
        // ⚠️ IsPastDue 時**不要 return**。Flex Consumption 的冷啟動會延遲觸發，
        //    遲到的那次照樣要做事 —— 直接跳過等於把那一輪的排程內容丟掉。
        if (timer.IsPastDue) logger.LogWarning("排程延遲執行");

        var now = Clock.UtcNow;

        // 上一次執行到現在之間，有沒有內容跨過發布或下架的時間點。
        // 用「時間窗邊界」而不是「狀態」判斷，就不需要寫任何狀態回去。
        var since = now.AddMinutes(-30);

        var crossed = await db.ContentItems
            // 與 Visibility.PublicFilter 同一組語意：有一版已核准、且沒有被明確下架。
            // ⚠️ 不是 Status == Published —— 編輯中的頁面工作副本是草稿，但它仍在線上。
            .Where(c => c.PublishedVersionId != null && c.Status != ContentStatus.Unpublished)
            .Where(c =>
                (c.PublishAt != null && c.PublishAt > since && c.PublishAt <= now) ||
                (c.UnpublishAt != null && c.UnpublishAt > since && c.UnpublishAt <= now))
            .CountAsync(ct);

        if (crossed == 0)
        {
            // ⚠️ 沒有異動就不要觸發，否則等於每 15 分鐘跑一次全站 build。
            logger.LogInformation("排程檢查：沒有內容跨過時間窗");

            // 但仍要把「冷卻期內積欠、之後沒人再呼叫」的那次重建收掉 ——
            // 沒有旗標時這支不做任何事（見 IRebuildService.FlushPendingAsync）。
            await rebuild.FlushPendingAsync(ct);
            return;
        }

        logger.LogInformation("排程檢查：{Count} 筆內容跨過時間窗，觸發重建", crossed);
        await rebuild.RequestAsync(ct);
    }
}
