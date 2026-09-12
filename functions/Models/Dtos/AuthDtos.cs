namespace Skin20.Api.Models.Dtos;

/// <summary>docs/10-api.md §3.2。<c>userName</c>——**登入識別不是 email**（docs/08 §A-1）。</summary>
public sealed class LoginRequest
{
    public string? UserName { get; set; }
    public string? Password { get; set; }

    /// <summary>
    /// 機器人驗證權杖（docs/10 §5）。
    /// <para>
    /// ⚠️ <b>命名刻意不帶供應商名稱</b> —— 目前是 reCAPTCHA v3（2026-09-12 定案），
    /// 換成 Turnstile 時只有 <c>BotCheckService</c> 要改，這個欄位不動。
    /// </para>
    /// <para>
    /// 🔴 登入是<b>唯一</b>需要它的後台端點 —— 沒有雙因素、沒有 IP 白名單
    /// （CLAUDE.md 決策 10），次數限制是主防線、這一道是補強。
    /// ⚠️ 未設定金鑰或連不上 Google 時<b>放行</b>（見 <c>BotCheckService</c>）——
    /// 否則 Google 一有狀況，後台就整個登不進去。
    /// </para>
    /// </summary>
    public string? BotCheckToken { get; set; }
}

/// <summary>登入／換發成功的回應。</summary>
public sealed class TokenResponse
{
    public string AccessToken { get; set; } = string.Empty;
    public string RefreshToken { get; set; } = string.Empty;

    /// <summary>
    /// ⚠️ <b>後台需要它，不要因為「access token 裡已經有 sub」就拿掉。</b>
    /// 本專案的 access token 是自簽 JWT（<see cref="Services.JwtService"/>），前端若要拿到
    /// 使用者 Id 就只剩「自己 base64 解 payload」一途 —— 那等於讓前端依賴 token 的內部格式，
    /// 換簽章方式時會無聲壞掉。回應體直接給，前端不必解 token。
    /// </summary>
    public int UserId { get; set; }

    /// <summary>登入識別（docs/08 §A-1）。⚠️ 不是 email。</summary>
    public string UserName { get; set; } = string.Empty;

    /// <summary>
    /// 「醫師」角色綁定自己的個人頁用（docs/08 §A-1）。非醫師角色為 <c>null</c>。
    /// 後台用它做「醫師只能改自己的內容」的畫面層提示 —— ⚠️ 真正的把關在 API
    /// （docs/11 §5.4 的擁有者判定），前端這一份只是少讓使用者白跑一趟。
    /// </summary>
    public int? DoctorId { get; set; }

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
