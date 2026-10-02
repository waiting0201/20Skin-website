using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Skin20.Api.Common;
using Skin20.Api.Handlers;
using Skin20.Api.Models.Entities;

namespace Skin20.Api.Tests;

/// <summary>
/// 法務頁的授權關卡（<see cref="ContentHandler.RequireLegalPageGuard"/>）。
/// 🔴 判定的是 <c>page.legal.edit</c> 權限碼，超級管理員靠 <c>is_superadmin</c> 旗標一律通過。
/// </summary>
public class LegalPageGuardTests
{
    private static HttpRequest Req(bool superAdmin = false, params string[] permissions)
    {
        var claims = new List<Claim> { new(TokenClaims.IsSuperAdmin, superAdmin ? "true" : "false") };
        claims.AddRange(permissions.Select(p => new Claim(TokenClaims.Permissions, p)));
        var ctx = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(claims, "test")) };
        return ctx.Request;
    }

    private static readonly Page Legal = new() { SuperAdminOnly = true };
    private static readonly Page Free = new() { SuperAdminOnly = false };

    [Fact]
    public void 超級管理員_通過() => ContentHandler.RequireLegalPageGuard(Req(superAdmin: true), Legal);

    [Fact]
    public void 有權限碼的角色_通過()
        => ContentHandler.RequireLegalPageGuard(Req(false, PermissionCodes.PageLegalEdit), Legal);

    [Fact]
    public void 沒有權限碼_即使有頁面編輯與發布權也被擋()
    {
        var ex = Assert.Throws<AppException>(() => ContentHandler.RequireLegalPageGuard(
            Req(false, "content.page.edit", "content.page.publish", "seo.edit"), Legal));
        Assert.Equal(403, ex.StatusCode);
    }

    [Fact]
    public void 一般頁面_不受影響()
        => ContentHandler.RequireLegalPageGuard(Req(false, "content.page.edit"), Free);

    [Fact]
    public void 非頁面的內容_不受影響()
        => ContentHandler.RequireLegalPageGuard(Req(false), new Faq());
}
