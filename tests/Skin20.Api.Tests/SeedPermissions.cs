using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Skin20.Api.Data;

namespace Skin20.Api.Tests;

/// <summary>
/// 從 EF 模型讀出種子的權限、角色與角色權限（<c>Data/Seed/SeedData.cs</c> 是 private 的，
/// 而且權威就是「migration 實際會寫進資料庫的那一份」，所以直接問模型）。
/// <para>⚠️ 只建模型、不連線：連線字串是假的，任何一個 <c>await</c> 資料庫的動作都會失敗 —— 這是刻意的。</para>
/// </summary>
internal static class SeedPermissions
{
    private static readonly Lazy<IModel> Model = new(() =>
    {
        var options = new DbContextOptionsBuilder<Skin20DbContext>()
            .UseSqlServer("Server=tcp:invalid.invalid,1433;Database=none;")
            .Options;
        var ctx = new Skin20DbContext(options);
        return ctx.GetService<IDesignTimeModel>().Model;
    });

    private static List<IDictionary<string, object?>> Rows(string entityName)
        => Model.Value.GetEntityTypes()
            .Single(e => e.ClrType.Name == entityName)
            .GetSeedData()
            .ToList();

    /// <summary>Id → Code。</summary>
    public static IReadOnlyDictionary<int, string> Permissions()
        => Rows("Permission").ToDictionary(r => (int)r["Id"]!, r => (string)r["Code"]!);

    /// <summary>Id → Code。</summary>
    public static IReadOnlyDictionary<int, string> Roles()
        => Rows("Role").ToDictionary(r => (int)r["Id"]!, r => (string)r["Code"]!);

    /// <summary>角色代碼 → 該角色擁有的權限碼。</summary>
    public static IReadOnlyDictionary<string, HashSet<string>> GrantsByRole()
    {
        var perms = Permissions();
        var roles = Roles();
        return Rows("RolePermission")
            .GroupBy(r => roles[(int)r["RoleId"]!])
            .ToDictionary(g => g.Key, g => g.Select(r => perms[(int)r["PermissionId"]!]).ToHashSet());
    }
}
