using Skin20.Api.Common;

namespace Skin20.Api.Tests;

/// <summary>
/// AppRouter 的路由 → 權限碼對照（docs/10 §3.3、docs/11 §5.3）。
/// 🔴 這是後台唯一的授權邊界（前端 permissions.ts 只管按鈕出不出現，決策 16）。
/// </summary>
public class AppRouterPermissionTests
{
    private static string Deny => RouterAccess.DenySentinel;

    // ── 預設拒絕 ─────────────────────────────────────────────────────

    [Theory]
    [InlineData("GET", "admin", "nonexistent")]
    [InlineData("GET", "admin", "nonexistent", "1")]
    [InlineData("POST", "admin", "nonexistent")]
    [InlineData("DELETE", "admin")]
    [InlineData("GET", "admin")]
    [InlineData("GET", "admin", "dashboard", "extra")]
    [InlineData("POST", "admin", "dashboard")]
    [InlineData("PUT", "admin", "ai-index")]
    // 已刪除的端點：送審與審核佇列（決策 20）。⚠️ 不能因為 {unit} 的萬用匹配而被放行。
    [InlineData("POST", "admin", "treatment", "1", "submit")]
    [InlineData("GET", "admin", "review")]
    [InlineData("POST", "admin", "review", "1", "approve")]
    [InlineData("POST", "admin", "review", "1", "reject")]
    // 單元代號不是九個之一
    [InlineData("PUT", "admin", "treatments", "1")]
    [InlineData("PUT", "admin", "Treatment", "1")]
    public void 未登記的_admin_路由一律拒絕(string method, params string[] segments)
        => Assert.Equal(Deny, RouterAccess.RequiredPermission(method, segments));

    [Fact]
    public void 預設拒絕的哨兵值不會與任何真實權限碼相撞()
    {
        Assert.DoesNotContain(Deny, SeedPermissions.Permissions().Values);
    }

    // ── 子路徑先於父路徑 ─────────────────────────────────────────────

    [Fact]
    public void 改_SEO_要的是_seo_edit_不是_content_edit()
    {
        // 行銷角色改 SEO 的前提。順序寫反不會有編譯警告，只會讓行銷被擋下。
        Assert.Equal(PermissionCodes.SeoEdit, RouterAccess.RequiredPermission("PUT", "admin", "treatment", "1", "seo"));
        Assert.Equal(PermissionCodes.Edit("treatment"), RouterAccess.RequiredPermission("PUT", "admin", "treatment", "1"));
    }

    [Fact]
    public void 發布與排程要_publish_不是_edit()
    {
        Assert.Equal(PermissionCodes.Publish("article"), RouterAccess.RequiredPermission("PATCH", "admin", "article", "1", "publish"));
        Assert.Equal(PermissionCodes.Publish("article"), RouterAccess.RequiredPermission("PATCH", "admin", "article", "1", "schedule"));
    }

    [Fact]
    public void 權限碼逐字跟著單元代號走_不做單複數轉換()
    {
        foreach (var unit in UnitCodes.All)
        {
            Assert.Equal($"content.{unit}.edit", RouterAccess.RequiredPermission("POST", "admin", unit));
            Assert.Equal($"content.{unit}.edit", RouterAccess.RequiredPermission("PUT", "admin", unit, "1"));
            Assert.Equal($"content.{unit}.edit", RouterAccess.RequiredPermission("DELETE", "admin", unit, "1"));
            Assert.Equal($"content.{unit}.edit", RouterAccess.RequiredPermission("PUT", "admin", unit, "sort"));
            Assert.Equal($"content.{unit}.edit", RouterAccess.RequiredPermission("PUT", "admin", unit, "1", "relations"));
            Assert.Equal($"content.{unit}.edit", RouterAccess.RequiredPermission("GET", "admin", unit, "1", "versions"));
            Assert.Equal($"content.{unit}.edit", RouterAccess.RequiredPermission("POST", "admin", unit, "1", "versions", "3", "restore"));
            Assert.Equal($"content.{unit}.publish", RouterAccess.RequiredPermission("PATCH", "admin", unit, "1", "publish"));
        }
    }

    [Fact]
    public void 內容單元的讀取不要求權限碼_登入即可()
    {
        // docs/08 §A-2 沒有 view 權限碼；行銷靠 seo.edit 進來看得到全部。
        foreach (var unit in UnitCodes.All)
        {
            Assert.Null(RouterAccess.RequiredPermission("GET", "admin", unit));
            Assert.Null(RouterAccess.RequiredPermission("GET", "admin", unit, "1"));
        }
    }

    // ── 站台與系統 ───────────────────────────────────────────────────

    [Theory]
    [InlineData("GET", "home.arrange", "admin", "home-section")]
    [InlineData("PUT", "home.arrange", "admin", "home-section")]
    [InlineData("GET", "menu.edit", "admin", "menu")]
    [InlineData("PUT", "menu.edit", "admin", "menu")]
    [InlineData("GET", "settings.edit", "admin", "setting")]
    [InlineData("PUT", "settings.edit", "admin", "setting")]
    [InlineData("GET", "settings.edit", "admin", "ai-index")]
    [InlineData("GET", "settings.edit", "admin", "export", "faq")]
    [InlineData("POST", "upload.file", "admin", "upload", "sas")]
    [InlineData("POST", "upload.file", "admin", "upload", "commit")]
    [InlineData("GET", "redirect.manage", "admin", "redirect")]
    [InlineData("POST", "redirect.manage", "admin", "redirect")]
    [InlineData("PUT", "redirect.manage", "admin", "redirect", "1")]
    [InlineData("DELETE", "redirect.manage", "admin", "redirect", "1")]
    [InlineData("GET", "redirect.manage", "admin", "redirect", "export")]
    [InlineData("POST", "redirect.manage", "admin", "redirect", "import")]
    [InlineData("GET", "redirect.manage", "admin", "redirect", "stats")]
    [InlineData("GET", "account.manage", "admin", "user")]
    [InlineData("POST", "account.manage", "admin", "user")]
    [InlineData("PUT", "account.manage", "admin", "user", "1")]
    [InlineData("DELETE", "account.manage", "admin", "user", "1")]
    [InlineData("PUT", "account.manage", "admin", "user", "1", "password")]
    [InlineData("GET", "account.manage", "admin", "role")]
    [InlineData("PUT", "account.manage", "admin", "role", "1", "permissions")]
    [InlineData("GET", "content.faq.edit", "admin", "question")]
    [InlineData("PATCH", "content.faq.edit", "admin", "question", "1")]
    [InlineData("DELETE", "content.faq.edit", "admin", "question", "1")]
    public void 站台與系統端點要求對應的權限碼(string method, string expected, params string[] segments)
        => Assert.Equal(expected, RouterAccess.RequiredPermission(method, segments));

    [Fact]
    public void 儀表板與高風險字詞只要登入()
    {
        Assert.Null(RouterAccess.RequiredPermission("GET", "admin", "dashboard"));
        Assert.Null(RouterAccess.RequiredPermission("GET", "admin", "risk-term"));
    }

    [Fact]
    public void 帳號管理沒有任何一條路徑只要登入()
    {
        // 「帳號與角色管理」的權限碼只有超管有；任何一個 user／role 路由落到 null 都等於把帳號管理開給所有人。
        foreach (var (method, segs) in new (string, string[])[]
                 {
                     ("GET", ["admin", "user"]), ("POST", ["admin", "user"]), ("PUT", ["admin", "user", "1"]),
                     ("DELETE", ["admin", "user", "1"]), ("PUT", ["admin", "user", "1", "password"]),
                     ("GET", ["admin", "role"]), ("PUT", ["admin", "role", "1", "permissions"]),
                 })
            Assert.Equal(PermissionCodes.AccountManage, RouterAccess.RequiredPermission(method, segs));
    }

    // ── 與原始碼的實際分派交叉驗證 ────────────────────────────────────

    [Fact]
    public void 解析到的分派列數與原始碼裡的_Wrap_呼叫數一致_否則下面的測試會空轉()
    {
        // 解析器失效（例如改了分派列的寫法）時，「全部通過」會是假的 ——
        // 用另一種算法（數 `=> Wrap(` 出現幾次）交叉驗證解析到的列數。
        Assert.Equal(CountWraps("AppRouter.Admin.cs", "RouteAdminAsync"), RouterAccess.AdminDispatch().Count);
        Assert.Equal(CountWraps("AppRouter.Public.cs", "RoutePublicAsync"), RouterAccess.PublicDispatch().Count);
        Assert.NotEmpty(RouterAccess.AdminDispatch());
        Assert.NotEmpty(RouterAccess.PublicDispatch());
    }

    private static int CountWraps(string file, string method)
    {
        var lines = File.ReadAllLines(Path.Combine(RouterAccess.RepoRoot(), "functions", "Routing", file));
        var start = Array.FindIndex(lines, l => l.Contains($" {method}(", StringComparison.Ordinal));
        return lines.Skip(start).Count(l => l.Contains("=> Wrap(", StringComparison.Ordinal));
    }

    [Fact]
    public void 每一條實際分派的後台路由都有登記權限_沒有掉進預設拒絕()
    {
        // 新增 /admin/* 端點卻忘了補 GetRequiredPermission 時，端點會「存在但永遠 403」——
        // 這個測試把那種疏漏擋在 CI，而不是等到有人從畫面上點到。
        var denied = RouterAccess.AdminDispatch()
            .Where(r => r.Segments is ["admin", ..])
            .Where(r => RouterAccess.RequiredPermission(r.Method, r.Segments) == Deny)
            .Select(r => $"{r.Method} /{string.Join('/', r.Segments)}  ({r.Source})")
            .ToList();

        Assert.True(denied.Count == 0, "以下路由已分派但沒有登記權限（會永遠 403）：\n" + string.Join('\n', denied));
    }

    [Fact]
    public void 每一條要求權限碼的路由_該碼都存在於種子()
    {
        var known = SeedPermissions.Permissions().Values.ToHashSet();
        var unknown = RouterAccess.AdminDispatch()
            .Select(r => (Route: r, Code: RouterAccess.RequiredPermission(r.Method, r.Segments)))
            .Where(x => x.Code is not null && x.Code != Deny && !known.Contains(x.Code))
            .Select(x => $"{x.Route.Method} /{string.Join('/', x.Route.Segments)} → {x.Code}")
            .ToList();

        Assert.True(unknown.Count == 0, "路由要求的權限碼不在種子裡（沒有任何人拿得到）：\n" + string.Join('\n', unknown));
    }

    [Fact]
    public void 沒有任何路由要求已刪除的權限碼()
    {
        var codes = RouterAccess.AdminDispatch()
            .Select(r => RouterAccess.RequiredPermission(r.Method, r.Segments))
            .Where(c => c is not null)
            .ToList();

        Assert.DoesNotContain(codes, c => c == "content.submit" || c!.StartsWith("review.", StringComparison.Ordinal));
    }

    [Fact]
    public void 每一條實際分派的前台路由都在白名單內_否則會靜默_404()
    {
        var missing = RouterAccess.PublicDispatch()
            .Where(r => !RouterAccess.IsPublicRoute(r.Method, r.Segments)
                        && !RouterAccess.IsAdminAuthRoute(r.Method, r.Segments))
            .Select(r => $"{r.Method} /{string.Join('/', r.Segments)}  ({r.Source})")
            .ToList();

        Assert.True(missing.Count == 0, "已分派卻不在 IsPublicRoute／IsAdminAuthRoute 的路由（會回 404）：\n" + string.Join('\n', missing));
    }

    // ── 公開白名單 ───────────────────────────────────────────────────

    [Theory]
    [InlineData("GET", "health")]
    [InlineData("POST", "auth", "login")]
    [InlineData("POST", "auth", "refresh")]
    [InlineData("POST", "contact")]
    [InlineData("POST", "ai", "ask")]
    [InlineData("GET", "home")]
    [InlineData("GET", "treatment")]
    [InlineData("GET", "seo", "sitemap.xml")]
    public void 前台公開端點在白名單內(string method, params string[] segments)
        => Assert.True(RouterAccess.IsPublicRoute(method, segments));

    [Theory]
    [InlineData("POST", "treatment")]            // 單元清單只開 GET
    [InlineData("DELETE", "treatment")]
    [InlineData("GET", "admin", "user")]         // /admin/* 絕不可被當成公開
    [InlineData("GET", "admin", "dashboard")]
    [InlineData("GET", "auth", "login")]         // 登入只開 POST
    [InlineData("GET", "ai", "ask")]
    [InlineData("POST", "seo", "sitemap.xml")]
    [InlineData("GET", "something-new")]         // 沒登記的一律不是公開
    [InlineData("GET", "treatment", "1", "versions")]
    public void 其餘路由不在公開白名單(string method, params string[] segments)
        => Assert.False(RouterAccess.IsPublicRoute(method, segments));

    [Fact]
    public void 改密碼與登出需要憑證_但不需要權限碼()
    {
        Assert.True(RouterAccess.IsAdminAuthRoute("POST", ["auth", "change-password"]));
        Assert.True(RouterAccess.IsAdminAuthRoute("POST", ["auth", "logout"]));
        Assert.False(RouterAccess.IsAdminAuthRoute("POST", ["auth", "login"]));
        Assert.False(RouterAccess.IsAdminAuthRoute("POST", ["auth", "refresh"]));
        // 它們不是公開端點：RouteAsync 先判 IsAdminAuthRoute，所以一定會驗 JWT。
        Assert.False(RouterAccess.IsPublicRoute("POST", ["auth", "change-password"]));
        Assert.False(RouterAccess.IsPublicRoute("POST", ["auth", "logout"]));
    }
}
