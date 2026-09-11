using Dapper;
using Skin20.Api.Data;
using Skin20.Api.Models.Dtos;

namespace Skin20.Api.Services.Dapper;

/// <summary>
/// 帳號與角色權限的讀取路徑（docs/08-database.md §A）。
/// </summary>
public interface IAccountReadService
{
    Task<(IReadOnlyList<UserListItemDto> Items, int TotalCount)> ListUsersAsync(
        string? keyword, int page, int pageSize, CancellationToken ct = default);

    Task<IReadOnlyList<RoleDto>> ListRolesAsync(CancellationToken ct = default);

    Task<IReadOnlyList<PermissionDto>> ListPermissionsAsync(CancellationToken ct = default);

    Task<bool> DoctorExistsAsync(int doctorContentItemId, CancellationToken ct = default);

    Task<IReadOnlyList<int>> ExistingRoleIdsAsync(IEnumerable<int> ids, CancellationToken ct = default);

    Task<IReadOnlyList<string>> ExistingPermissionCodesAsync(IEnumerable<string> codes, CancellationToken ct = default);

    Task<bool> UserNameExistsAsync(string userName, CancellationToken ct = default);

    /// <summary>
    /// 鎖在門外防護（docs/11-backend-design.md 提及的授權自鎖情境）：
    /// 除了 <paramref name="excludingRoleId"/> 之外，是否還有其他角色擁有這個權限碼。
    /// </summary>
    Task<bool> AnyOtherRoleHasPermissionAsync(string permissionCode, int excludingRoleId, CancellationToken ct = default);
}

/// <inheritdoc cref="IAccountReadService"/>
public sealed class AccountReadService(ISqlConnectionFactory factory) : IAccountReadService
{
    public async Task<(IReadOnlyList<UserListItemDto> Items, int TotalCount)> ListUsersAsync(
        string? keyword, int page, int pageSize, CancellationToken ct = default)
    {
        using var connection = factory.Create();

        var hasKeyword = !string.IsNullOrWhiteSpace(keyword);
        var where = hasKeyword ? "WHERE u.UserName LIKE @Keyword OR u.DisplayName LIKE @Keyword" : "";
        var parameters = new DynamicParameters();
        if (hasKeyword) parameters.Add("Keyword", $"%{keyword}%");

        var totalCount = await connection.ExecuteScalarAsync<int>(
            new CommandDefinition($"SELECT COUNT(*) FROM Users u {where}", parameters, cancellationToken: ct));

        parameters.Add("Offset", (page - 1) * pageSize);
        parameters.Add("PageSize", pageSize);

        // 先分頁再 LEFT JOIN 角色，避免多對多關聯在 join 之後把 OFFSET/FETCH 的筆數弄亂
        // （docs/11 §6.3：分頁一律 OFFSET/FETCH，關聯資料同一支 SQL 用 JOIN 取回，禁止 N+1）。
        var sql = $"""
            WITH Paged AS (
                SELECT u.Id, u.UserName, u.DisplayName, u.NotifyEmail, u.IsActive, u.MustChangePassword,
                       u.DoctorId, doctorCi.Title AS DoctorName, u.CreatedAt, u.UpdatedAt
                FROM Users u
                LEFT JOIN ContentItems doctorCi ON doctorCi.Id = u.DoctorId
                {where}
                ORDER BY u.Id
                OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
            )
            SELECT p.*, r.Code AS RoleCode
            FROM Paged p
            LEFT JOIN UserRoles ur ON ur.UserId = p.Id
            LEFT JOIN Roles r ON r.Id = ur.RoleId
            ORDER BY p.Id
            """;

        var rows = await connection.QueryAsync<UserRow>(new CommandDefinition(sql, parameters, cancellationToken: ct));

        var items = rows
            .GroupBy(r => r.Id)
            .Select(g =>
            {
                var first = g.First();
                return new UserListItemDto
                {
                    Id = first.Id,
                    UserName = first.UserName,
                    DisplayName = first.DisplayName,
                    NotifyEmail = first.NotifyEmail,
                    IsActive = first.IsActive,
                    MustChangePassword = first.MustChangePassword,
                    DoctorId = first.DoctorId,
                    DoctorName = first.DoctorName,
                    CreatedAt = first.CreatedAt,
                    UpdatedAt = first.UpdatedAt,
                    RoleCodes = [.. g.Where(x => x.RoleCode is not null).Select(x => x.RoleCode!).Distinct()],
                };
            })
            // GroupBy 不保證輸出順序沿用 SQL 排序，這裡用查詢裡已經確定的 Id 升冪重排一次。
            .OrderBy(x => x.Id)
            .ToList();

        return (items, totalCount);
    }

    public async Task<IReadOnlyList<RoleDto>> ListRolesAsync(CancellationToken ct = default)
    {
        using var connection = factory.Create();
        const string sql = """
            SELECT r.Id, r.Code, r.Name, r.IsSystem, p.Code AS PermissionCode
            FROM Roles r
            LEFT JOIN RolePermissions rp ON rp.RoleId = r.Id
            LEFT JOIN Permissions p ON p.Id = rp.PermissionId
            ORDER BY r.Id
            """;

        var rows = await connection.QueryAsync<RoleRow>(new CommandDefinition(sql, cancellationToken: ct));

        return [.. rows
            .GroupBy(r => r.Id)
            .OrderBy(g => g.Key)
            .Select(g =>
            {
                var first = g.First();
                return new RoleDto
                {
                    Id = first.Id,
                    Code = first.Code,
                    Name = first.Name,
                    IsSystem = first.IsSystem,
                    PermissionCodes = [.. g.Where(x => x.PermissionCode is not null).Select(x => x.PermissionCode!)],
                };
            })];
    }

    public async Task<IReadOnlyList<PermissionDto>> ListPermissionsAsync(CancellationToken ct = default)
    {
        using var connection = factory.Create();
        const string sql = "SELECT Id, Code, Name, GroupName FROM Permissions ORDER BY GroupName, Id";
        var items = await connection.QueryAsync<PermissionDto>(new CommandDefinition(sql, cancellationToken: ct));
        return items.AsList();
    }

    public async Task<bool> DoctorExistsAsync(int doctorContentItemId, CancellationToken ct = default)
    {
        using var connection = factory.Create();
        const string sql = "SELECT CASE WHEN EXISTS (SELECT 1 FROM Doctors WHERE Id = @Id) THEN 1 ELSE 0 END";
        return await connection.ExecuteScalarAsync<bool>(new CommandDefinition(sql, new { Id = doctorContentItemId }, cancellationToken: ct));
    }

    public async Task<IReadOnlyList<int>> ExistingRoleIdsAsync(IEnumerable<int> ids, CancellationToken ct = default)
    {
        var idList = ids.Distinct().ToArray();
        if (idList.Length == 0) return [];

        using var connection = factory.Create();
        const string sql = "SELECT Id FROM Roles WHERE Id IN @Ids";
        var found = await connection.QueryAsync<int>(new CommandDefinition(sql, new { Ids = idList }, cancellationToken: ct));
        return found.AsList();
    }

    public async Task<IReadOnlyList<string>> ExistingPermissionCodesAsync(IEnumerable<string> codes, CancellationToken ct = default)
    {
        var codeList = codes.Distinct().ToArray();
        if (codeList.Length == 0) return [];

        using var connection = factory.Create();
        const string sql = "SELECT Code FROM Permissions WHERE Code IN @Codes";
        var found = await connection.QueryAsync<string>(new CommandDefinition(sql, new { Codes = codeList }, cancellationToken: ct));
        return found.AsList();
    }

    public async Task<bool> UserNameExistsAsync(string userName, CancellationToken ct = default)
    {
        using var connection = factory.Create();
        const string sql = "SELECT CASE WHEN EXISTS (SELECT 1 FROM Users WHERE UserName = @UserName) THEN 1 ELSE 0 END";
        return await connection.ExecuteScalarAsync<bool>(new CommandDefinition(sql, new { UserName = userName }, cancellationToken: ct));
    }

    public async Task<bool> AnyOtherRoleHasPermissionAsync(string permissionCode, int excludingRoleId, CancellationToken ct = default)
    {
        using var connection = factory.Create();
        const string sql = """
            SELECT CASE WHEN EXISTS (
                SELECT 1
                FROM RolePermissions rp
                INNER JOIN Permissions p ON p.Id = rp.PermissionId
                WHERE p.Code = @PermissionCode AND rp.RoleId <> @ExcludingRoleId
            ) THEN 1 ELSE 0 END
            """;
        return await connection.ExecuteScalarAsync<bool>(new CommandDefinition(
            sql, new { PermissionCode = permissionCode, ExcludingRoleId = excludingRoleId }, cancellationToken: ct));
    }

    /// <summary>Dapper 的扁平列映射用，內部型別——外部一律看 <see cref="UserListItemDto"/>。</summary>
    private sealed class UserRow
    {
        public int Id { get; set; }
        public string UserName { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public string? NotifyEmail { get; set; }
        public bool IsActive { get; set; }
        public bool MustChangePassword { get; set; }
        public int? DoctorId { get; set; }
        public string? DoctorName { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        public string? RoleCode { get; set; }
    }

    private sealed class RoleRow
    {
        public int Id { get; set; }
        public string Code { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public bool IsSystem { get; set; }
        public string? PermissionCode { get; set; }
    }
}
