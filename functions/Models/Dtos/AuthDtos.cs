namespace Skin20.Api.Models.Dtos;

/// <summary>docs/10-api.md §3.2。<c>userName</c>——**登入識別不是 email**（docs/08 §A-1）。</summary>
public sealed class LoginRequest
{
    public string? UserName { get; set; }
    public string? Password { get; set; }
}

/// <summary>登入／換發成功的回應。</summary>
public sealed class TokenResponse
{
    public string AccessToken { get; set; } = string.Empty;
    public string RefreshToken { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public IReadOnlyList<string> Roles { get; set; } = [];
    public IReadOnlyList<string> Permissions { get; set; } = [];
    public bool IsSuperAdmin { get; set; }
    /// <summary>
    /// 首登尚未改密碼。⚠️ 為 <c>true</c> 時 token 仍然有效，但除了改密碼與登出以外
    /// 每一支端點都會回 403 <c>AUTH_MUST_CHANGE_PASSWORD</c> —— 前端要據此導向改密碼畫面。
    /// </summary>
    public bool MustChangePassword { get; set; }
}

public sealed class RefreshRequest
{
    public string? RefreshToken { get; set; }
}

public sealed class LogoutRequest
{
    public string? RefreshToken { get; set; }
}

public sealed class ChangePasswordRequest
{
    public string? CurrentPassword { get; set; }
    public string? NewPassword { get; set; }
}

/// <summary>
/// 登入與換發流程需要的使用者查詢結果（docs/08-database.md §A-1、§A-2）。
/// ⚠️ 純讀取用途，不含 <c>SecurityStamp</c>——改密碼那類會寫回 <c>Users</c> 的流程
/// 直接用 <c>Skin20DbContext</c> 讀寫實體，不經過這個唯讀 DTO。
/// </summary>
public sealed class AuthUserLookup
{
    public int UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public bool MustChangePassword { get; set; }
    public int? DoctorId { get; set; }
    public IReadOnlyList<string> Roles { get; set; } = [];
    public IReadOnlyList<string> Permissions { get; set; } = [];
    public bool IsSuperAdmin { get; set; }
}
