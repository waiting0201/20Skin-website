namespace Skin20.Api.Models.Dtos;

/// <summary>
/// 帳號（docs/08-database.md §A-1、docs/10-api.md §3.4）。
/// ⚠️ 沒有 <c>Email</c> 欄位——<c>UserName</c> 是登入識別、<c>NotifyEmail</c> 只是選填通知信箱，
/// 兩者都不做 email 格式驗證。
/// </summary>
public sealed class UserListItemDto
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
    public IReadOnlyList<string> RoleCodes { get; set; } = [];
}

public sealed class UserCreateRequest
{
    /// <summary>登入識別。允許 <c>a-z0-9._-@</c>，比對不分大小寫（docs/08 §A-1）。⚠️ 不是 email，不做 email 格式驗證。</summary>
    public string? UserName { get; set; }

    public string? DisplayName { get; set; }

    /// <summary>建置期起始密碼。建立後 <c>MustChangePassword</c> 一律為 true。</summary>
    public string? Password { get; set; }

    /// <summary>選填，僅供通知。非登入識別、不唯一、可留空。</summary>
    public string? NotifyEmail { get; set; }

    /// <summary>「醫師」角色綁定自己的個人頁用。</summary>
    public int? DoctorId { get; set; }

    /// <summary>至少一個角色。</summary>
    public int[]? RoleIds { get; set; }
}

public sealed class UserUpdateRequest
{
    /// <summary>⚠️ 不含 <c>UserName</c>——登入識別建立後不可變更。</summary>
    public string? DisplayName { get; set; }

    public string? NotifyEmail { get; set; }
    public int? DoctorId { get; set; }
    public int[]? RoleIds { get; set; }

    /// <summary>停用不刪除；本欄位也用於重新啟用（<see cref="AccountHandler.DeactivateUserAsync"/> 只能單向停用）。</summary>
    public bool? IsActive { get; set; }
}

public sealed class ResetPasswordRequest
{
    public string? NewPassword { get; set; }
}

public sealed class RoleDto
{
    public int Id { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public bool IsSystem { get; set; }
    public IReadOnlyList<string> PermissionCodes { get; set; } = [];
}

public sealed class PermissionDto
{
    public int Id { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string GroupName { get; set; } = string.Empty;
}

/// <summary>角色權限設定畫面一次要的兩份資料：角色（含已授權碼）＋ 完整權限目錄。</summary>
public sealed class RolePermissionMatrixDto
{
    public IReadOnlyList<RoleDto> Roles { get; set; } = [];
    public IReadOnlyList<PermissionDto> AllPermissions { get; set; } = [];
}

public sealed class UpdateRolePermissionsRequest
{
    public string[]? PermissionCodes { get; set; }
}
