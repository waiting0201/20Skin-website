using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Skin20.Api.Common;

namespace Skin20.Api.Routing;

/// <summary>
/// 前台公開路由（docs/10-api.md §3.1）。
///
/// <para>
/// 🔴 <b>2026-09-15 起這裡多了內容讀取端點。</b> 在那之前只有四支 ——
/// 前台是建置期預渲染的靜態站，療程、文章、醫師這些資料不經由 API 提供，
/// 而是建置期由匯出腳本直接查 SQL 烤進 HTML。前台改成執行期 SSR 之後
/// （翻掉原決策 6），同一批資料必須能在請求當下拿得到。
/// </para>
/// <para>
/// ⚠️ <b>全站唯一的內容出口，而且每一個頁面請求都會打到它。</b>
/// 快取標頭由 <c>CacheControl.Public</c> 統一給，真正的失效是發布時主動通知
/// （見 <c>Common/CacheControl.cs</c>）。
/// </para>
/// <para>
/// ⚠️ 白名單是<b>列舉式</b>的：新增前台端點時必須補進 <see cref="IsPublicRoute"/>，
/// 否則會直接回 404。
/// </para>
/// </summary>
public sealed partial class AppRouter
{
    /// <summary>後台登入相關 —— 這些在 <c>/admin</c> 之外，但一樣要驗 token（改密碼除外）。</summary>
    private static bool IsAdminAuthRoute(string method, string[] segments) =>
        (method, segments) switch
        {
            ("POST", ["auth", "change-password"]) => true,
            ("POST", ["auth", "logout"]) => true,
            _ => false,
        };

    private static bool IsPublicRoute(string method, string[] segments) =>
        (method, segments) switch
        {
            ("GET", ["health"]) => true,

            // 登入與換發：本身就是取得憑證的動作，不能要求先有憑證。
            // ⚠️ 三者都受登入次數限制保護（docs/10 §3.2）——那是後台唯一的防線。
            ("POST", ["auth", "login"]) => true,
            ("POST", ["auth", "refresh"]) => true,

            // 前台的三個執行期例外（docs/09 §4）
            ("POST", ["contact"]) => true,
            ("POST", ["questions", "miss"]) => true,
            ("GET", ["site-settings", "public"]) => true,

            // 前台內容（SSR）。⚠️ `content` 這個字段刻意不與九個單元代號重疊，
            //    否則 `/{unit}` 與 `/content` 在同一層會互相吃掉。
            ("GET", ["content"]) => true,
            ("GET", [var unit]) when UnitCodes.IsValid(unit) => true,

            _ => false,
        };

    /// <summary>回 <c>null</c> 表示「不是這一區的路由」，交給 <c>RouteAdminAsync</c>。</summary>
    private Task<IActionResult?> RoutePublicAsync(HttpRequest req, string method, string[] segments)
        => (method, segments) switch
        {
            ("GET", ["health"]) => Wrap(health.GetAsync()),

            ("POST", ["auth", "login"]) => Wrap(auth.LoginAsync(req)),
            ("POST", ["auth", "refresh"]) => Wrap(auth.RefreshAsync(req)),
            ("POST", ["auth", "logout"]) => Wrap(auth.LogoutAsync(req)),
            ("POST", ["auth", "change-password"]) => Wrap(auth.ChangePasswordAsync(req)),

            ("POST", ["contact"]) => Wrap(forms.SubmitContactAsync(req)),
            ("POST", ["questions", "miss"]) => Wrap(forms.RecordMissedQuestionAsync(req)),
            ("GET", ["site-settings", "public"]) => Wrap(settings.GetPublicAsync()),

            ("GET", ["content"]) => Wrap(publicContent.GetByPathAsync(req)),
            ("GET", [var unit]) when UnitCodes.IsValid(unit) => Wrap(publicContent.ListAsync(req, unit)),

            _ => Task.FromResult<IActionResult?>(null),
        };

    private static async Task<IActionResult?> Wrap(Task<IActionResult> task) => await task;
}
