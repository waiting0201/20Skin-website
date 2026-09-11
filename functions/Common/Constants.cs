namespace Skin20.Api.Common;

/// <summary>
/// 權限碼（docs/10-api.md §4，權威為 <c>Data/Seed/SeedData.cs</c> 的 31 列）。
/// <para>⚠️ <b>這些字串在程式中不得再出現字面值</b>（docs/11 §12）。</para>
/// </summary>
public static class PermissionCodes
{
    // 九個內容單元 × edit / publish
    public static string Edit(string unit) => $"content.{unit}.edit";
    public static string Publish(string unit) => $"content.{unit}.publish";

    public const string ContentSubmit = "content.submit";
    public const string ReviewApprove = "review.approve";
    public const string ReviewReject = "review.reject";

    /// <summary>⚠️ 與 <c>content.*.edit</c> 是<b>兩個獨立權限</b> —— 行銷角色的核心。</summary>
    public const string SeoEdit = "seo.edit";

    public const string TagCreate = "taxonomy.tag.create";

    /// <summary>新增／刪除分類。⚠️ 限超級管理員 —— 動到 URL 結構與 301 對照表。</summary>
    public const string CategoryManage = "taxonomy.category.manage";

    /// <summary>法務三頁。⚠️ 限超級管理員 —— 條款文字有法律效力。</summary>
    public const string PageLegalEdit = "page.legal.edit";

    public const string HomeArrange = "home.arrange";
    public const string MenuEdit = "menu.edit";
    public const string SettingsEdit = "settings.edit";
    public const string AccountManage = "account.manage";
    public const string RedirectManage = "redirect.manage";
    public const string MediaManage = "media.manage";
}

/// <summary>角色代碼（種子，<c>IsSystem = 1</c> 不可刪）。</summary>
public static class RoleCodes
{
    public const string SuperAdmin = "SuperAdmin";
    public const string Editor = "Editor";
    public const string Doctor = "Doctor";
    public const string Marketing = "Marketing";
    public const string Reviewer = "Reviewer";
}

/// <summary>
/// 九個內容單元的代號（docs/10 §3.3）。
/// <para>
/// ⚠️ <b>逐字對應權限碼前綴，不做單複數轉換。</b> 路由 <c>/admin/treatment</c> 的
/// 權限碼就是 <c>content.treatment.edit</c> —— 中間不要有任何字串加工。
/// </para>
/// </summary>
public static class UnitCodes
{
    public const string Treatment = "treatment";
    public const string Doctor = "doctor";
    public const string Concern = "concern";
    public const string Article = "article";
    public const string Case = "case";
    public const string Faq = "faq";
    public const string Clinic = "clinic";
    public const string Page = "page";
    public const string Term = "term";

    public static readonly string[] All =
        [Treatment, Doctor, Concern, Article, Case, Faq, Clinic, Page, Term];

    public static bool IsValid(string? unit) => unit is not null && All.Contains(unit);
}

/// <summary>JWT 的 claim 名稱與 audience。</summary>
public static class TokenClaims
{
    public const string Subject = "sub";
    public const string Roles = "roles";
    public const string Permissions = "permissions";
    public const string IsSuperAdmin = "is_superadmin";

    /// <summary>
    /// 首登尚未改密碼。⚠️ 登入<b>仍會發 token</b>（否則使用者永遠改不了密碼），
    /// 由 <c>AppRouter</c> 擋下除了改密碼以外的所有端點。
    /// </summary>
    public const string MustChangePassword = "must_change_password";

    /// <summary>只有一套身分：後台管理員。前台全站匿名，沒有會員系統。</summary>
    public const string AdminAudience = "20skin-admin";
}

/// <summary>系統頁的識別碼（docs/08 §C-8 的 11 筆種子）。</summary>
public static class PageKeys
{
    public const string Home = "home";
    public const string TeamIndex = "team-index";
    public const string TreatmentsIndex = "treatments-index";
    public const string ConcernsIndex = "concerns-index";
    public const string BlogIndex = "blog-index";
    public const string CasesIndex = "cases-index";
    public const string FaqIndex = "faq-index";
    public const string ClinicsIndex = "clinics-index";
    public const string Contact = "contact";
    public const string Search = "search";
    public const string NotFound = "not-found";
}
