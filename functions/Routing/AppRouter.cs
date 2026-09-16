using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Skin20.Api.Common;
using Skin20.Api.Handlers;
using Skin20.Api.Services;

namespace Skin20.Api.Routing;

/// <summary>
/// 集中式路由分派器（docs/11-backend-design.md §2、§5.3）。
///
/// <para>
/// 流程：<c>(method, route)</c> → 拆 segments → 驗 JWT → 檢查權限 → list pattern 分派到 Handler。
/// </para>
/// <para>
/// 路由表拆成兩個 partial：<see cref="RoutePublicAsync"/>（<c>AppRouter.Public.cs</c>，
/// 前台四支公開端點）與 <see cref="RouteAdminAsync"/>（<c>AppRouter.Admin.cs</c>，後台端點與權限對照）。
/// </para>
/// </summary>
public sealed partial class AppRouter(
    ILogger<AppRouter> logger,
    IJwtService jwt,
    // ── 公開端點（docs/10 §3.1、§3.2）──────────────────────────────
    HealthHandler health,
    AuthHandler auth,
    FormHandler forms,
    SettingHandler settings,
    PublicContentHandler publicContent,
    SeoHandler seo,
    SearchHandler search,
    // ── 後台（docs/10 §3.3、§3.4）──────────────────────────────────
    DashboardHandler dashboard,
    ContentHandler content,
    ReviewHandler review,
    UploadHandler upload,
    HomeSectionHandler homeSection,
    MenuHandler menu,
    RedirectHandler redirect,
    ExportHandler export,
    QuestionHandler question,
    AccountHandler account)
{
    /// <summary>
    /// <see cref="GetRequiredPermission"/> 的預設回傳值：<b>未登記於權限表的 <c>/admin/*</c> 一律拒絕。</b>
    ///
    /// <para>
    /// ⚠️ 這是刻意選的，不是保守而已：如果預設是「登入即可」，新增一支後台端點忘了補
    /// 權限表就會<b>靜默放行</b> —— 沒有錯誤、沒有警告，只有一個所有角色都打得開的端點。
    /// 改成預設拒絕，同樣的疏漏會在開發階段就變成 403。
    /// </para>
    /// </summary>
    private const string DenySentinel = "__DENY__";

    public async Task<IActionResult> RouteAsync(HttpRequest req, string route)
    {
        var method = req.Method.ToUpperInvariant();
        var segments = route.Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries);

        logger.LogDebug("Router: {Method} /{Route}", method, route);

        // CORS preflight。實際的 allow-list 在平台層（Function App 的 CORS 設定，
        // 由院方維護，docs/07 §1），程式內只放行 OPTIONS。
        if (method == "OPTIONS") return new OkResult();

        // HEAD 一律當 GET 走：CDN 與監控會用 HEAD 探測，不對應的話它們拿到的是 404。
        // ASP.NET Core 會自己把 body 丟掉，只回標頭。
        if (method == "HEAD") method = "GET";

        if (segments is ["admin", ..] || IsAdminAuthRoute(method, segments))
        {
            var principal = jwt.ValidateRequest(req)
                ?? throw AppException.Unauthorized("缺少或無效的後台憑證。");

            // 🔴 首登尚未改密碼：除了改密碼與登出以外，其餘一律擋下。
            //
            // 登入**照發 token**（否則使用者拿不到 token，也就永遠呼叫不了改密碼端點），
            // 所以擋在這裡而不是擋在登入。docs/10 §3.2。
            if (principal.FindFirst(TokenClaims.MustChangePassword)?.Value == "true"
                && segments is not (["auth", "change-password"] or ["auth", "logout"]))
            {
                throw new AppException(
                    ErrorCodes.AuthMustChangePassword, "首次登入請先變更密碼。", 403);
            }

            // /auth/change-password 不需權限碼 —— 首登強制改密碼時使用者還沒有任何權限。
            if (segments is ["admin", ..])
                RequirePermission(principal, GetRequiredPermission(method, segments));

            req.HttpContext.User = principal;
        }
        else if (!IsPublicRoute(method, segments))
        {
            // 前台全站匿名（沒有會員系統），所以白名單就是前台的**完整範圍**。
            // 沒登記的非 /admin/* 路由一律當成不存在 —— 新端點忘了補白名單時會在
            // 開發階段直接 404，不會靜悄悄地變成公開端點。
            return NotFound(method, route);
        }

        var publicResult = await RoutePublicAsync(req, method, segments);
        if (publicResult is not null) return publicResult;

        var adminResult = await RouteAdminAsync(req, method, segments);
        return adminResult ?? NotFound(method, route);
    }

    /// <summary>
    /// 檢查 <c>permissions</c> claim。<c>is_superadmin = true</c> 自動通過（docs/11 §5.3）。
    /// </summary>
    private static void RequirePermission(ClaimsPrincipal principal, string? permissionCode)
    {
        if (permissionCode is null) return;

        if (permissionCode == DenySentinel)
            throw AppException.Forbidden("此端點未登記於權限表。");

        if (principal.FindFirst(TokenClaims.IsSuperAdmin)?.Value == "true") return;

        if (!principal.FindAll(TokenClaims.Permissions).Any(c => c.Value == permissionCode))
            throw AppException.Forbidden($"缺少所需權限：{permissionCode}");
    }

    private static IActionResult NotFound(string method, string route)
        => new NotFoundObjectResult(ApiResponse.Fail(
            ErrorCodes.NotFound,
            "端點不存在。",
            $"Route '/api/v1/{route}' with method {method} does not exist."));
}
