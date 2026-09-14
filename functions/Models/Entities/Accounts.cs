namespace Skin20.Api.Models.Entities;

// ── A. 帳號與權限（7 張表）────────────────────────────────────────────
// docs/08-database.md §A。對應後台畫面：登入、帳號管理、角色權限設定。

/// <summary>
/// 後台使用者（docs/08 §A-1）。
/// <para>
/// ⚠️ <b><see cref="UserName"/> 是登入識別，不是 email。</b> 種子帳號
/// <c>sa@system.local</c> 長得像 email 但它是使用者名稱 —— API 端<b>不可</b>對它做
/// email 格式驗證，也<b>不可</b>拿它當寄信位址。這是「後台帳號不用 email」
/// 最容易被寫錯的地方。
/// </para>
/// <para>
/// 🔴 <b>沒有雙因素</b>（2026-09-11 院方決定）。帳密是唯一憑證，登入次數限制
/// （<see cref="LoginThrottle"/>）是唯一防線。種子密碼上線前必須更換。
/// </para>
/// </summary>
public sealed class User
{
    public int Id { get; set; }
    public string UserName { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;

    /// <summary>改密碼／停權時更換，使既發權杖失效。</summary>
    public string SecurityStamp { get; set; } = string.Empty;

    /// <summary>選填，僅供通知。非登入識別、不唯一、可留空。</summary>
    public string? NotifyEmail { get; set; }

    /// <summary>停用不刪除 —— 內容的 <c>CreatedByUserId</c> 還指著它。</summary>
    public bool IsActive { get; set; } = true;

    public bool MustChangePassword { get; set; }

    /// <summary>
    /// 「醫師」角色綁定自己的個人頁用（docs/08 §A-1）。
    /// <para>
    /// 授權判斷＝本欄對上 <c>ContentItems.OwnerUserId</c> 或 <c>Articles.AuthorDoctorId</c>。
    /// <b>沒有這一欄，醫師角色就只能靠人工比對姓名。</b>
    /// </para>
    /// </summary>
    public int? DoctorId { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public Doctor? Doctor { get; set; }
    public ICollection<UserRole> UserRoles { get; set; } = [];
}

/// <summary>
/// 五個角色為種子資料且 <c>IsSystem = 1</c>，不可刪除（docs/08 §A-2）：
/// SuperAdmin／Editor／Doctor／Marketing／Reviewer。
/// <para>角色固定但<b>權限可調</b> —— 否則「角色權限設定」那個後台畫面無事可做。</para>
/// </summary>
public sealed class Role
{
    public int Id { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public bool IsSystem { get; set; }

    public ICollection<RolePermission> RolePermissions { get; set; } = [];
}

/// <summary>複合 PK（docs/08 §A-2）。</summary>
public sealed class UserRole
{
    public int UserId { get; set; }
    public int RoleId { get; set; }
    public User User { get; set; } = null!;
    public Role Role { get; set; } = null!;
}

/// <summary>
/// 細粒度權限碼（docs/08 §A-2）。
/// <para>
/// ⚠️ <c>seo.edit</c> 與 <c>content.*.edit</c> <b>必須是兩個獨立權限</b> ——
/// 這是 <see cref="SeoMeta"/> 獨立成表的原因（§B-4）。權限檢查落在「表」的層級
/// 最不容易寫錯，落在「同一張表的某幾個欄位」則遲早有人漏掉。
/// </para>
/// </summary>
public sealed class Permission
{
    public int Id { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string GroupName { get; set; } = string.Empty;

    public ICollection<RolePermission> RolePermissions { get; set; } = [];
}

/// <summary>複合 PK（docs/08 §A-2）。</summary>
public sealed class RolePermission
{
    public int RoleId { get; set; }
    public int PermissionId { get; set; }
    public Role Role { get; set; } = null!;
    public Permission Permission { get; set; } = null!;
}

/// <summary>
/// 登入次數限制的計數器（docs/08 §A-3）。
/// <para>
/// 🔴 IP 白名單不做（2026-08-13）、雙因素不做（2026-09-11），所以這是<b>唯一的硬防線</b>。
/// <b>登入只以帳號計數</b>（來源 IP 維度 2026-09-14 院方決定拿掉）——
/// <c>ThrottleDimension.IpAddress</c> 現在只服務公開端點的頻率限制
/// （<c>RateLimitService.EnsurePublicQuotaAsync</c>），登入不再寫那個維度的列。
/// </para>
/// <para>
/// ⚠️ <b>這是計數器，不是日誌。</b> 登入成功即刪除該帳號那筆、鎖定到期即歸零，
/// 不保留任何歷史（符合「不做 log」的指定）。
/// </para>
/// </summary>
public sealed class LoginThrottle
{
    public int Id { get; set; }
    public ThrottleDimension Dimension { get; set; }

    /// <summary>登入是 <c>UserName</c>；公開端點的頻率限制是 <c>"{bucket}:{ip}"</c>。</summary>
    public string ThrottleKey { get; set; } = string.Empty;

    public int FailedCount { get; set; }
    public DateTime FirstFailedAt { get; set; }
    public DateTime LastFailedAt { get; set; }
    public DateTime? LockedUntil { get; set; }
}

/// <summary>
/// 存權杖的 hash，不存明文（docs/08 §A-4）。
/// <para>
/// 存在的理由只有一個：<b>停用帳號要能即時失效</b>。
/// </para>
/// <para>
/// ⚠️ <b>這張表與「短效 JWT ＋ SecurityStamp」二選一，不要兩套都做</b>
/// （docs/08 §L 待確認）。目前先建表；若最後選短效 JWT，這張表要以一支
/// 獨立 migration 移除，而不是留著不用。
/// </para>
/// </summary>
public sealed class RefreshToken
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public string TokenHash { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public DateTime? RevokedAt { get; set; }
    public DateTime CreatedAt { get; set; }

    public User User { get; set; } = null!;
}
