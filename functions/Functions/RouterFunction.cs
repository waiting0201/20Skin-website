using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Skin20.Api.Routing;

namespace Skin20.Api.Functions;

/// <summary>
/// 唯一的 HTTP entry point（docs/11-backend-design.md §2）。
///
/// <para>
/// <c>Route = "{*route}"</c> 捕捉所有 <c>/api/v1/*</c> 請求，交由 <see cref="AppRouter"/> 分派。
/// <b>這一層只做 trigger binding，不放任何邏輯。</b>
/// </para>
///
/// <para>
/// 為什麼是單一 catch-all 而不是每個資源一支 Function：路由表與權限表集中在一處，
/// 才能與 docs/10 §4 的權限矩陣逐條對照。代價是自動 OpenAPI 產生器內省不出端點
/// ——所以 <c>openapi.yaml</c> 手寫並進版控。
/// </para>
/// </summary>
public sealed class RouterFunction(AppRouter router)
{
    [Function("Router")]
    public Task<IActionResult> Run(
        [HttpTrigger(
            AuthorizationLevel.Anonymous,
            "get", "head", "post", "put", "patch", "delete", "options",
            Route = "{*route}")]
        HttpRequest req,
        string? route)
        => router.RouteAsync(req, route ?? string.Empty);
}
