using System.Security.Claims;
using Microsoft.AspNetCore.Http;

namespace Skin20.Api.Services;

/// <summary>
/// JWT 自簽與驗證（docs/11-backend-design.md §5.2）。
///
/// <para>
/// <b>不接 <c>AddAuthentication().AddJwtBearer()</c></b> —— isolated worker 的 middleware
/// pipeline 與 ASP.NET Core 不同，自己驗證比接管線可控。
/// </para>
/// <para>
/// 🔴 <b>沒有雙因素</b>（2026-09-11 院方決定）：帳密驗證通過就直接發 token，沒有第二段。
/// 連帶後果是<b>登入次數限制成為唯一防線</b>。
/// </para>
/// </summary>
public interface IJwtService
{
    /// <summary>
    /// 從 <c>Authorization: Bearer</c> 取出並驗證。
    /// <para>
    /// ⚠️ 驗證失敗一律回 <c>null</c>，<b>不讓例外冒出</b> —— 由呼叫端轉 401。
    /// </para>
    /// <para>
    /// ⚠️ <b>不使用跨來源 cookie</b>：前台在 <c>20skin.tw</c>、API 在 <c>api.20skin.tw</c>，
    /// SWA 的 <c>x-ms-client-principal</c> 也到不了這裡（docs/07 §1）。
    /// </para>
    /// </summary>
    ClaimsPrincipal? ValidateRequest(HttpRequest req);

    /// <summary>簽發 access token。claims 見 <c>TokenClaims</c>。</summary>
    /// <param name="mustChangePassword">
    /// 首登尚未改密碼。⚠️ 這種 token <b>照發</b> —— 不發的話使用者拿不到 token，
    /// 也就永遠呼叫不了改密碼端點。擋下其餘端點是 <c>AppRouter</c> 的事。
    /// </param>
    string IssueAccessToken(int userId, string userName, IEnumerable<string> roles, IEnumerable<string> permissions, bool isSuperAdmin, bool mustChangePassword = false);

    /// <summary>
    /// 產生不透明的 refresh token 明文與其 hash。
    /// <para>
    /// docs/08 §L 的「<c>RefreshTokens</c> vs 短效 JWT ＋ <c>SecurityStamp</c>」已定案
    /// 採用前者（2026-09-11）：後台只剩一道防線，<b>「停用帳號要能即時失效」</b>
    /// 比省一張表重要，而短效 JWT 仍有一段空窗。
    /// </para>
    /// <para>⚠️ DB 只存 hash，不存明文。</para>
    /// </summary>
    (string Token, string Hash) IssueRefreshToken();

    /// <summary>比對 refresh token 明文與 DB 裡的 hash。</summary>
    string HashRefreshToken(string token);
}
