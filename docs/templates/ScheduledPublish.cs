// → functions/Functions/ScheduledPublish.cs（獨立 Function App．NET 10 isolated worker）
//
// 排程發布與定時下架。獨立 Function App 支援 Timer trigger，
// 不需要繞 GitHub Actions cron。見 docs/07-deployment.md §4、docs/02-backend-cms.md §2。
//
// 🔴 本範本的狀態處理已被 docs/11-backend-design.md §7 取代，照抄前請先看那一節：
//    ① 下方用的 ContentStatus.Scheduled / Archived 在 docs/08 §B-1 的四態裡不存在
//       （1 草稿／2 送審中／3 已發布／4 已下架），「已排程」是 Status=3 AND PublishAt > now 推導出來的
//    ② 這支 Timer 不該翻狀態，只該「掃到期、觸發重建」——
//       翻狀態與觸發重建是兩個非原子步驟，重建先跑就會漏掉那筆，要等下一輪
//
// ⚠️ 生效時間仍非精確：到期內容被標記為已發布之後，還要等一次全站重建才會出現在網站上。
//    後台文案要寫「排程時間為最早生效時間」。延遲來源是重建耗時。
//
// EF Core 與 Dapper 的分工（見 docs/07-deployment.md §5）：
//   · 狀態轉換走 EF Core —— 有領域規則、要留版本歷程（操作日誌不做，見 docs/08-database.md §I）
//   · 純讀取的批次查詢走 Dapper
// 這支剛好兩者都用得到，可當作分工的範例。

using Dapper;
using Microsoft.Azure.Functions.Worker;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Skin20.Api.Data;

namespace Skin20.Api.Functions;

public sealed class ScheduledPublish(
    Skin20DbContext db,
    IHttpClientFactory httpClientFactory,
    ILogger<ScheduledPublish> logger)
{
    // 每 15 分鐘。RunOnStartup 一律不要開 —— 每次部署都會多跑一次。
    [Function("scheduledPublish")]
    public async Task Run([TimerTrigger("0 */15 * * * *")] TimerInfo timer)
    {
        if (timer.IsPastDue) logger.LogWarning("排程延遲執行");

        var now = DateTimeOffset.UtcNow;

        // 到期的排程發布與定時下架一次處理完。
        // 單一 UPDATE 交易，避免多個執行個體同時跑造成重複。
        var published = await db.Contents
            .Where(c => c.Status == ContentStatus.Scheduled && c.PublishAt <= now)
            .ExecuteUpdateAsync(s => s
                .SetProperty(c => c.Status, ContentStatus.Published)
                .SetProperty(c => c.PublishedAt, now));

        var unpublished = await db.Contents
            .Where(c => c.Status == ContentStatus.Published && c.UnpublishAt <= now)
            .ExecuteUpdateAsync(s => s
                .SetProperty(c => c.Status, ContentStatus.Archived));

        logger.LogInformation("排程發布 {Published} 筆、下架 {Unpublished} 筆", published, unpublished);

        // 沒有異動就不要重建 —— 否則每 15 分鐘跑一次全站 build
        if (published + unpublished == 0) return;

        await TriggerRebuildAsync();
    }

    // 觸發全站重建。SWA 沒有 ISR，內容變更一定要重跑 build。
    private async Task TriggerRebuildAsync()
    {
        var repo = Environment.GetEnvironmentVariable("GITHUB_REPO");
        var token = Environment.GetEnvironmentVariable("GITHUB_DISPATCH_TOKEN");

        var client = httpClientFactory.CreateClient();
        client.DefaultRequestHeaders.Add("User-Agent", "20skin-api");
        client.DefaultRequestHeaders.Add("Accept", "application/vnd.github+json");
        client.DefaultRequestHeaders.Authorization = new("Bearer", token);

        var res = await client.PostAsJsonAsync(
            $"https://api.github.com/repos/{repo}/dispatches",
            new { event_type = "content-published" });

        // 不要 throw —— 內容狀態已經改好了，重建失敗應該獨立告警，
        // 而不是讓整個排程在下一輪重跑一次狀態轉換。
        if (!res.IsSuccessStatusCode)
        {
            logger.LogError("repository_dispatch 失敗：{Status} {Body}",
                res.StatusCode, await res.Content.ReadAsStringAsync());
        }
    }
}
