using Dapper;
using Skin20.Api.Common;
using Skin20.Api.Data;
using Skin20.Api.Models.Dtos;

namespace Skin20.Api.Services.Dapper;

/// <summary>
/// 登入與換發流程的使用者查詢（docs/08-database.md §A、docs/11-backend-design.md §6.3）。
/// ⚠️ 純讀取，不做任何寫入——寫入一律回到 <c>Skin20DbContext</c>（docs/11 §2 鐵律 1、2）。
/// </summary>
public interface IAuthReadService
{
    /// <summary>
    /// 依登入識別查詢。⚠️ <c>Users.UserName</c> 走資料庫預設定序，比對本身就不分大小寫
    /// （docs/08 §A-1），這裡不用另外處理大小寫。
    /// </summary>
    Task<AuthUserLookup?> FindByUserNameAsync(string userName, CancellationToken ct = default);

    /// <summary>換發（refresh）流程用：只有 <c>RefreshTokens.UserId</c>，沒有使用者名稱可查。</summary>
    Task<AuthUserLookup?> FindByIdAsync(int userId, CancellationToken ct = default);
}

/// <inheritdoc cref="IAuthReadService"/>
public sealed class AuthReadService(ISqlConnectionFactory factory) : IAuthReadService
{
    private const string ByUserNameSql = """
        SELECT Id, UserName, DisplayName, PasswordHash, IsActive, MustChangePassword, DoctorId
        FROM Users
        WHERE UserName = @Key
        """;

    private const string ByIdSql = """
        SELECT Id, UserName, DisplayName, PasswordHash, IsActive, MustChangePassword, DoctorId
        FROM Users
        WHERE Id = @Key
        """;

    // 角色與權限一次 JOIN 取回，避免 N+1（docs/11 §6.3）。同一個角色可能對到多個
    // 權限（或沒有任何權限，LEFT JOIN 讓角色本身仍會出現一列，PermissionCode 為 null）。
    private const string RolesAndPermissionsSql = """
        SELECT r.Code AS RoleCode, p.Code AS PermissionCode
        FROM UserRoles ur
        INNER JOIN Roles r ON r.Id = ur.RoleId
        LEFT JOIN RolePermissions rp ON rp.RoleId = r.Id
        LEFT JOIN Permissions p ON p.Id = rp.PermissionId
        WHERE ur.UserId = @UserId
        """;

    public Task<AuthUserLookup?> FindByUserNameAsync(string userName, CancellationToken ct = default)
        => FindAsync(ByUserNameSql, userName, ct);

    public Task<AuthUserLookup?> FindByIdAsync(int userId, CancellationToken ct = default)
        => FindAsync(ByIdSql, userId, ct);

    private async Task<AuthUserLookup?> FindAsync(string sql, object key, CancellationToken ct)
    {
        using var connection = factory.Create();

        var user = await connection.QuerySingleOrDefaultAsync<UserRow>(
            new CommandDefinition(sql, new { Key = key }, cancellationToken: ct));
        if (user is null) return null;

        var pairs = (await connection.QueryAsync<RolePermissionRow>(new CommandDefinition(
            RolesAndPermissionsSql, new { UserId = user.Id }, cancellationToken: ct))).AsList();

        var roles = pairs.Select(p => p.RoleCode).Distinct().ToArray();
        var permissions = pairs
            .Where(p => p.PermissionCode is not null)
            .Select(p => p.PermissionCode!)
            .Distinct()
            .ToArray();

        return new AuthUserLookup
        {
            UserId = user.Id,
            UserName = user.UserName,
            DisplayName = user.DisplayName,
            PasswordHash = user.PasswordHash,
            IsActive = user.IsActive,
            MustChangePassword = user.MustChangePassword,
            DoctorId = user.DoctorId,
            Roles = roles,
            Permissions = permissions,
            IsSuperAdmin = roles.Contains(RoleCodes.SuperAdmin),
        };
    }

    private sealed class UserRow
    {
        public int Id { get; set; }
        public string UserName { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public string PasswordHash { get; set; } = string.Empty;
        public bool IsActive { get; set; }
        public bool MustChangePassword { get; set; }
        public int? DoctorId { get; set; }
    }

    private sealed class RolePermissionRow
    {
        public string RoleCode { get; set; } = string.Empty;
        public string? PermissionCode { get; set; }
    }
}
