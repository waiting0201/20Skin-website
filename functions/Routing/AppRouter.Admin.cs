using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Skin20.Api.Common;

namespace Skin20.Api.Routing;

/// <summary>
/// 後台路由表與權限對照（docs/10-api.md §3.3、§3.4）。
///
/// <para>
/// 🔴 <b>預設拒絕。</b> <see cref="GetRequiredPermission"/> 的 <c>_ =&gt; DenySentinel</c>
/// 那一行是這整套授權的關鍵 —— 新增 <c>/admin/*</c> 端點若忘了補權限表，
/// 會直接 403 而不是靜默放行。
/// </para>
/// </summary>
public sealed partial class AppRouter
{
    /// <summary>
    /// 路由 → 所需權限碼。<c>null</c>＝登入即可、<see cref="DenySentinel"/>＝拒絕。
    ///
    /// <para>
    /// ⚠️ <b>子路徑必須排在父路徑之前。</b> <c>PUT /admin/{unit}/{id}/seo</c> 要排在
    /// <c>PUT /admin/{unit}/{id}</c> 前面，否則行銷角色改 SEO 會被要求
    /// <c>content.*.edit</c> 而被擋下。這類順序錯誤<b>不會有編譯警告</b>。
    /// </para>
    /// </summary>
    private static string? GetRequiredPermission(string method, string[] segments) =>
        (method, segments) switch
        {
            // ── 儀表板：登入即可（純聚合查詢，看得到的內容仍受各查詢的權限限制）──
            ("GET", ["admin", "dashboard"]) => null,

            // ── 九個內容單元（docs/10 §3.3）──────────────────────────
            // ⚠️ 子路徑在前
            ("PUT", ["admin", var u, _, "seo"]) when UnitCodes.IsValid(u)
                => PermissionCodes.SeoEdit,
            ("PUT", ["admin", var u, _, "relations"]) when UnitCodes.IsValid(u)
                => PermissionCodes.Edit(u),
            ("POST", ["admin", var u, _, "submit"]) when UnitCodes.IsValid(u)
                => PermissionCodes.ContentSubmit,
            ("PATCH", ["admin", var u, _, "publish" or "schedule"]) when UnitCodes.IsValid(u)
                => PermissionCodes.Publish(u),
            ("GET", ["admin", var u, _, "versions", ..]) when UnitCodes.IsValid(u)
                => PermissionCodes.Edit(u),
            ("POST", ["admin", var u, _, "versions", _, "restore"]) when UnitCodes.IsValid(u)
                => PermissionCodes.Edit(u),
            ("PUT", ["admin", var u, "sort"]) when UnitCodes.IsValid(u)
                => PermissionCodes.Edit(u),

            ("GET", ["admin", var u, ..]) when UnitCodes.IsValid(u)
                // 讀取沒有獨立的 view 權限碼（docs/08 §A-2 的 31 列裡沒有），
                // 能編輯就看得到；行銷與審核者靠 seo.edit／publish 進來。
                => null,
            ("POST", ["admin", var u]) when UnitCodes.IsValid(u)
                => PermissionCodes.Edit(u),
            ("PUT", ["admin", var u, _]) when UnitCodes.IsValid(u)
                => PermissionCodes.Edit(u),
            ("DELETE", ["admin", var u, _]) when UnitCodes.IsValid(u)
                => PermissionCodes.Edit(u),

            // ── 工作流（docs/10 §3.4）────────────────────────────────
            ("GET", ["admin", "review"]) => PermissionCodes.ReviewApprove,
            ("POST", ["admin", "review", _, "approve"]) => PermissionCodes.ReviewApprove,
            ("POST", ["admin", "review", _, "reject"]) => PermissionCodes.ReviewReject,

            // ── 上傳（不是媒體庫：沒有清單、沒有刪除）──────────────────
            ("POST", ["admin", "upload", "sas" or "commit"]) => PermissionCodes.UploadFile,

            // ── 站台編排 ─────────────────────────────────────────────
            ("GET" or "PUT", ["admin", "home-section"]) => PermissionCodes.HomeArrange,
            ("GET" or "PUT", ["admin", "menu"]) => PermissionCodes.MenuEdit,
            ("GET" or "PUT", ["admin", "setting"]) => PermissionCodes.SettingsEdit,

            // ── SEO 與 301 ───────────────────────────────────────────
            ("GET" or "POST", ["admin", "redirect", "export" or "import" or "stats"])
                => PermissionCodes.RedirectManage,
            ("GET" or "POST", ["admin", "redirect"]) => PermissionCodes.RedirectManage,
            ("PUT" or "DELETE", ["admin", "redirect", _]) => PermissionCodes.RedirectManage,
            ("GET", ["admin", "export", ..]) => PermissionCodes.SettingsEdit,

            // ── FAQ 題庫成長 ─────────────────────────────────────────
            ("GET", ["admin", "question"]) => PermissionCodes.Edit(UnitCodes.Faq),
            ("PATCH" or "DELETE", ["admin", "question", _]) => PermissionCodes.Edit(UnitCodes.Faq),

            // ── 帳號與角色（限超管，權限碼本身只有超管有）────────────
            ("GET" or "POST", ["admin", "user"]) => PermissionCodes.AccountManage,
            ("PUT" or "DELETE", ["admin", "user", _]) => PermissionCodes.AccountManage,
            ("PUT", ["admin", "user", _, "password"]) => PermissionCodes.AccountManage,
            ("GET", ["admin", "role"]) => PermissionCodes.AccountManage,
            ("PUT", ["admin", "role", _, "permissions"]) => PermissionCodes.AccountManage,

            // ── 手動重建 ─────────────────────────────────────────────
            // ⚠️ 讀狀態與觸發是兩種權限：內容編輯要看得到「發布中」，但不該能自己觸發建置。
            ("GET", ["admin", "rebuild"]) => null,
            ("POST", ["admin", "rebuild"]) => PermissionCodes.SettingsEdit,

            // ── 高風險字詞（編輯器的即時提示來源，不是閘門，docs/02 §5）──
            ("GET", ["admin", "risk-term"]) => null,

            // 🔴 未列出的 /admin/* 一律拒絕
            _ => DenySentinel,
        };

    /// <summary>回 <c>null</c> 表示沒有對應的處理器 —— 由 <see cref="RouteAsync"/> 轉成 404。</summary>
    private Task<IActionResult?> RouteAdminAsync(HttpRequest req, string method, string[] segments)
        => (method, segments) switch
        {
            ("GET", ["admin", "dashboard"]) => Wrap(dashboard.GetAsync(req)),

            // 九個內容單元共用同一組處理器 —— 它們的 CRUD 形狀完全一樣，
            // 差別只在欄位（docs/02 §1）。要改 CRUD 行為請改這裡，不要在單一單元裡另外處理。
            ("GET", ["admin", var u]) when UnitCodes.IsValid(u) => Wrap(content.ListAsync(req, u)),
            ("GET", ["admin", var u, var id]) when UnitCodes.IsValid(u) => Wrap(content.GetAsync(u, id)),
            ("POST", ["admin", var u]) when UnitCodes.IsValid(u) => Wrap(content.CreateAsync(req, u)),
            ("PUT", ["admin", var u, "sort"]) when UnitCodes.IsValid(u) => Wrap(content.SortAsync(req, u)),
            ("PUT", ["admin", var u, var id, "seo"]) when UnitCodes.IsValid(u) => Wrap(content.UpdateSeoAsync(req, u, id)),
            ("PUT", ["admin", var u, var id, "relations"]) when UnitCodes.IsValid(u) => Wrap(content.UpdateRelationsAsync(req, u, id)),
            ("PUT", ["admin", var u, var id]) when UnitCodes.IsValid(u) => Wrap(content.UpdateAsync(req, u, id)),
            ("POST", ["admin", var u, var id, "submit"]) when UnitCodes.IsValid(u) => Wrap(content.SubmitAsync(req, u, id)),
            ("PATCH", ["admin", var u, var id, "schedule"]) when UnitCodes.IsValid(u) => Wrap(content.ScheduleAsync(req, u, id)),
            ("PATCH", ["admin", var u, var id, "publish"]) when UnitCodes.IsValid(u) => Wrap(content.PublishAsync(req, u, id)),
            ("DELETE", ["admin", var u, var id]) when UnitCodes.IsValid(u) => Wrap(content.DeleteAsync(req, u, id)),
            ("GET", ["admin", var u, var id, "versions"]) when UnitCodes.IsValid(u) => Wrap(content.ListVersionsAsync(u, id)),
            ("GET", ["admin", var u, var id, "versions", var no]) when UnitCodes.IsValid(u) => Wrap(content.GetVersionAsync(u, id, no)),
            ("POST", ["admin", var u, var id, "versions", var no, "restore"]) when UnitCodes.IsValid(u) => Wrap(content.RestoreVersionAsync(req, u, id, no)),

            ("GET", ["admin", "review"]) => Wrap(review.ListPendingAsync(req)),
            ("POST", ["admin", "review", var id, "approve"]) => Wrap(review.ApproveAsync(req, id)),
            ("POST", ["admin", "review", var id, "reject"]) => Wrap(review.RejectAsync(req, id)),

            ("POST", ["admin", "upload", "sas"]) => Wrap(upload.RequestSasAsync(req)),
            ("POST", ["admin", "upload", "commit"]) => Wrap(upload.CommitAsync(req)),

            ("GET", ["admin", "home-section"]) => Wrap(homeSection.GetAsync()),
            ("PUT", ["admin", "home-section"]) => Wrap(homeSection.UpdateAsync(req)),
            ("GET", ["admin", "menu"]) => Wrap(menu.GetAsync()),
            ("PUT", ["admin", "menu"]) => Wrap(menu.UpdateAsync(req)),
            ("GET", ["admin", "setting"]) => Wrap(settings.GetAdminAsync()),
            ("PUT", ["admin", "setting"]) => Wrap(settings.UpdateAsync(req)),

            ("GET", ["admin", "redirect"]) => Wrap(redirect.ListAsync(req)),
            ("POST", ["admin", "redirect"]) => Wrap(redirect.CreateAsync(req)),
            ("PUT", ["admin", "redirect", var id]) => Wrap(redirect.UpdateAsync(req, id)),
            ("DELETE", ["admin", "redirect", var id]) => Wrap(redirect.DeleteAsync(id)),
            ("GET", ["admin", "redirect", "export"]) => Wrap(redirect.ExportAsync()),
            ("GET", ["admin", "redirect", "stats"]) => Wrap(redirect.StatsAsync()),
            ("POST", ["admin", "redirect", "import"]) => Wrap(redirect.ImportAsync(req)),
            ("GET", ["admin", "export", var kind]) => Wrap(export.PreviewAsync(kind)),

            ("GET", ["admin", "question"]) => Wrap(question.ListAsync(req)),
            ("PATCH", ["admin", "question", var id]) => Wrap(question.UpdateAsync(req, id)),
            ("DELETE", ["admin", "question", var id]) => Wrap(question.DeleteAsync(id)),

            ("GET", ["admin", "user"]) => Wrap(account.ListUsersAsync(req)),
            ("POST", ["admin", "user"]) => Wrap(account.CreateUserAsync(req)),
            ("PUT", ["admin", "user", var id, "password"]) => Wrap(account.ResetPasswordAsync(req, id)),
            ("PUT", ["admin", "user", var id]) => Wrap(account.UpdateUserAsync(req, id)),
            // ⚠️ 要帶 req —— 沒有它 Handler 不知道目前登入者是誰，
            //    「不可停用自己」這道防護就做不出來。
            ("DELETE", ["admin", "user", var id]) => Wrap(account.DeactivateUserAsync(req, id)),
            ("GET", ["admin", "role"]) => Wrap(account.ListRolesAsync()),
            ("PUT", ["admin", "role", var id, "permissions"]) => Wrap(account.UpdateRolePermissionsAsync(req, id)),

            ("GET", ["admin", "rebuild"]) => Wrap(rebuild.GetStatusAsync()),
            ("POST", ["admin", "rebuild"]) => Wrap(rebuild.TriggerAsync()),

            ("GET", ["admin", "risk-term"]) => Wrap(content.ListRiskTermsAsync()),

            _ => Task.FromResult<IActionResult?>(null),
        };
}
