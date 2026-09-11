using Microsoft.AspNetCore.Mvc;
using Skin20.Api.Common;

namespace Skin20.Api.Handlers;

/// <summary>
/// docs/10 §3.1：冒煙測試用。兩條 workflow 的部署後檢查都打它。
///
/// <para>
/// ⚠️ 分層鐵律（docs/11 §2）：Handler 內<b>禁止直接寫 SQL</b> —— 讀走 Dapper ReadService、
/// 寫走 <c>Skin20DbContext</c>；<b>禁止重複檢查權限碼</b> —— 授權集中在 <c>AppRouter</c>，
/// 唯一例外是資料列擁有者判定（§5.4）。
/// </para>
/// <para>
/// ⚠️ 刻意不做 DB 連線檢查：這支端點在部署後被打的頻率高（CI smoke test），
/// 且冷啟動／暫時性 DB 延遲不該讓部署管線誤判整個站點掛掉。DB 連線本身的健康度
/// 由 Application Insights 的相依追蹤觀察，不靠這支端點。
/// </para>
/// </summary>
public sealed class HealthHandler
{
    public Task<IActionResult> GetAsync()
        => Task.FromResult<IActionResult>(new OkObjectResult(
            ApiResponse.Ok(new { status = "healthy" })));
}
