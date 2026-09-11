using Microsoft.AspNetCore.Mvc;
using Skin20.Api.Common;
using Skin20.Api.Services;

namespace Skin20.Api.Handlers;

/// <summary>
/// docs/11 §10：觸發全站重建（repository_dispatch）。
/// ⚠️ **要聚合** —— 連續發布 10 篇不該觸發 10 次 build。窗口狀態存 DB 或 Blob，
/// **不要用 MemoryCache**（多執行個體）。
/// ⚠️ 重建失敗**不要 throw** —— 內容狀態已經改好了，失敗應獨立告警。
///
/// <para>
/// ⚠️ 分層鐵律（docs/11 §2）：Handler 內<b>禁止直接寫 SQL</b> —— 讀走 Dapper ReadService、
/// 寫走 <c>Skin20DbContext</c>；<b>禁止重複檢查權限碼</b> —— 授權集中在 <c>AppRouter</c>，
/// 唯一例外是資料列擁有者判定（§5.4）。
/// </para>
/// </summary>
public sealed class RebuildHandler(IRebuildService rebuild)
{
    public async Task<IActionResult> TriggerAsync()
    {
        // RebuildService 內部自己做聚合判斷、自己吞掉失敗（docs/11 §10）——
        // 這裡不需要知道到底有沒有真的觸發，只回一句「已排入」即可。
        await rebuild.RequestAsync();

        return new OkObjectResult(ApiResponse.Ok(message: "已排入重建佇列，稍後會反映在正式網站上。"));
    }
}
