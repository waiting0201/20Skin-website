using System.Reflection;
using System.Text.RegularExpressions;
using Skin20.Api.Routing;

namespace Skin20.Api.Tests;

/// <summary>
/// 取用 <see cref="AppRouter"/> 的 private static 判定函式。
///
/// <para>
/// ⚠️ 用反射而不是改成 internal：<c>InternalsVisibleTo</c> 看不到 private，
/// 而「為了測試改可見性」正是這個專案不要的 —— 授權判定的表面積越小越好。
/// 代價是函式改名時這裡會在<b>執行期</b>炸掉（<see cref="Method"/> 會直接丟出明確的訊息），
/// 不會靜默通過。
/// </para>
/// </summary>
internal static class RouterAccess
{
    private const BindingFlags Flags = BindingFlags.NonPublic | BindingFlags.Static;

    private static MethodInfo Method(string name)
        => typeof(AppRouter).GetMethod(name, Flags)
           ?? throw new InvalidOperationException(
               $"AppRouter.{name} 不存在或簽章變了 —— 請更新 tests/Skin20.Api.Tests/RouterAccess.cs。");

    /// <summary><c>null</c>＝登入即可；<see cref="DenySentinel"/>＝拒絕；其餘是權限碼。</summary>
    public static string? RequiredPermission(string method, params string[] segments)
        => (string?)Method("GetRequiredPermission").Invoke(null, [method, segments]);

    public static bool IsPublicRoute(string method, params string[] segments)
        => (bool)Method("IsPublicRoute").Invoke(null, [method, segments])!;

    public static bool IsAdminAuthRoute(string method, params string[] segments)
        => (bool)Method("IsAdminAuthRoute").Invoke(null, [method, segments])!;

    public static string DenySentinel
        => (string)(typeof(AppRouter).GetField("DenySentinel", Flags | BindingFlags.FlattenHierarchy)
               ?.GetRawConstantValue()
           ?? throw new InvalidOperationException("AppRouter.DenySentinel 不見了。"));

    // ── 從原始碼讀出「實際分派」的路由 ─────────────────────────────────
    //
    // 為什麼不手寫一份清單：手寫的清單與路由表是第二份真相，路由表新增端點時
    // 清單不會跟著長，測試就永遠綠。這裡直接讀 RouteAdminAsync／RoutePublicAsync
    // 的分派列，新增端點忘了補權限表或白名單 → 這邊會紅。

    public sealed record DispatchedRoute(string Method, string[] Segments, string Source);

    private static readonly Regex DispatchLine = new(
        """^\s*\(\s*"(?<m>[A-Z]+)"\s*,\s*\[(?<segs>[^\]]*)\]\s*\)""", RegexOptions.Compiled);

    public static IReadOnlyList<DispatchedRoute> AdminDispatch()
        => ReadDispatch("AppRouter.Admin.cs", "RouteAdminAsync");

    public static IReadOnlyList<DispatchedRoute> PublicDispatch()
        => ReadDispatch("AppRouter.Public.cs", "RoutePublicAsync");

    private static IReadOnlyList<DispatchedRoute> ReadDispatch(string file, string methodName)
    {
        var path = Path.Combine(RepoRoot(), "functions", "Routing", file);
        var lines = File.ReadAllLines(path);
        var start = Array.FindIndex(lines, l => l.Contains($" {methodName}(", StringComparison.Ordinal));
        Assert.True(start >= 0, $"{file} 找不到 {methodName}，請更新 RouterAccess。");

        var result = new List<DispatchedRoute>();
        for (var i = start; i < lines.Length; i++)
        {
            var m = DispatchLine.Match(lines[i]);
            if (!m.Success) continue;
            result.Add(new DispatchedRoute(
                m.Groups["m"].Value, Concretize(m.Groups["segs"].Value), $"{file}:{i + 1}"));
        }

        return result;
    }

    /// <summary>
    /// <c>"admin", var u, var id</c> → <c>["admin", "treatment", "1"]</c>。
    /// ⚠️ 變數名 <c>u</c> 一律是單元代號（路由都配 <c>UnitCodes.IsValid(u)</c>），其餘變數換成 "1"。
    /// </summary>
    private static string[] Concretize(string segs)
        => segs.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            .Select(s => s.StartsWith('"') ? s.Trim('"')
                : s is "var u" or "var unit" ? "treatment"
                : "1")
            .ToArray();

    public static string RepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "functions", "Skin20.Api.csproj")))
            dir = dir.Parent;
        return dir?.FullName ?? throw new InvalidOperationException("找不到 repo 根目錄。");
    }
}
