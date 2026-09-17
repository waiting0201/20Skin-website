using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Skin20.Api.Common;
using Skin20.Api.Services;
using Skin20.Api.Data;
using Skin20.Api.Models.Dtos;
using Skin20.Api.Models.Entities;
using Skin20.Api.Services.Dapper;

namespace Skin20.Api.Handlers;

/// <summary>
/// docs/10 §3.4：帳號與角色權限（限超管）。
///
/// <para>
/// ⚠️ <c>UserName</c> 是登入識別<b>不是 email</b>，API 端不對它做 email 格式驗證，
/// 也不拿它當寄信位址（docs/08 §A-1）。<c>NotifyEmail</c> 才是選填通知信箱，同樣不做格式綁死。
/// </para>
/// <para>
/// ⚠️ <b>停用不刪除</b>——<see cref="DeactivateUserAsync"/> 只翻 <c>IsActive</c>，
/// 內容的 <c>CreatedByUserId</c> 還指著這個帳號。
/// </para>
/// <para>
/// 🔴 <b>沒有雙因素</b>（2026-09-11 院方決定）——本 Handler 完全不出現任何 2FA 相關端點或欄位。
/// </para>
/// <para>
/// ⚠️ 分層鐵律（docs/11 §2）：Handler 內<b>禁止直接寫 SQL</b> —— 讀走 Dapper ReadService、
/// 寫走 <c>Skin20DbContext</c>；<b>禁止重複檢查權限碼</b> —— 授權集中在 <c>AppRouter</c>，
/// 唯一例外是資料列擁有者判定（§5.4，本單元不適用）。
/// </para>
/// </summary>
public sealed class AccountHandler(Skin20DbContext db, ISqlConnectionFactory sqlFactory)
{
    // 與其他三個 Handler 同樣的取捨：不動 Program.cs，直接組裝這個無狀態的 ReadService。
    private readonly IAccountReadService reads = new AccountReadService(sqlFactory);
    private readonly PasswordHasher<User> passwordHasher = new();

    // docs/08 §A-1：UserName 允許 a-z0-9._-@，比對不分大小寫。⚠️ 這不是 email 格式驗證——
    // 字元集剛好包含 @ 只是因為種子帳號 sa@system.local 長這樣，不代表要求 email 語法。
    private static readonly Regex UserNamePattern = new("^[a-z0-9._@-]+$", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    // ⚠️ 2026-09-17 由 8 改為 6（Tim 指定）。前端的 `validation.ts` MIN_PASSWORD_LENGTH
    //    是同一個數字，**兩邊要一起改** —— 只改一邊的症狀是「畫面收得下、送出被 400 退回」，
    //    或反過來「畫面擋下一組 API 其實接受的密碼」。
    private const int MinPasswordLength = 6;

    public async Task<IActionResult> ListUsersAsync(HttpRequest req)
    {
        var page = Paging.Page(req.Query["page"]);
        var pageSize = Paging.PageSize(req.Query["pageSize"]);
        var keyword = req.Query["keyword"].FirstOrDefault();

        var (items, total) = await reads.ListUsersAsync(keyword, page, pageSize, req.HttpContext.RequestAborted);

        return new OkObjectResult(ApiResponse.Ok(Paging.Build(items, total, page, pageSize)));
    }

    public async Task<IActionResult> CreateUserAsync(HttpRequest req)
    {
        var body = await req.ReadFromJsonAsync<UserCreateRequest>()
            ?? throw AppException.BadRequest(ErrorCodes.ValidationRequired, "缺少請求內容。");

        var ct = req.HttpContext.RequestAborted;

        if (string.IsNullOrWhiteSpace(body.UserName) || string.IsNullOrWhiteSpace(body.DisplayName)
            || string.IsNullOrWhiteSpace(body.Password))
            throw AppException.BadRequest(ErrorCodes.ValidationRequired, "userName、displayName、password 為必填。");

        var userName = body.UserName!.Trim();
        if (!UserNamePattern.IsMatch(userName))
            throw AppException.BadRequest(ErrorCodes.ValidationFormat, "userName 僅允許英數字與 . _ - @，不做 email 格式驗證。");

        if (body.Password!.Length < MinPasswordLength)
            throw AppException.BadRequest(ErrorCodes.ValidationRange, $"密碼長度至少 {MinPasswordLength} 碼。");

        var roleIds = (body.RoleIds ?? []).Distinct().ToArray();
        if (roleIds.Length == 0)
            throw AppException.BadRequest(ErrorCodes.ValidationRequired, "roleIds 至少需指定一個角色。");

        await EnsureRoleIdsExistAsync(roleIds, ct);

        if (body.DoctorId is int doctorId && !await reads.DoctorExistsAsync(doctorId, ct))
            throw AppException.NotFound("醫師");

        if (await reads.UserNameExistsAsync(userName, ct))
            throw AppException.Conflict(ErrorCodes.ConflictDuplicate, $"帳號「{userName}」已經有人使用。");

        var now = Clock.UtcNow;
        var entity = new User
        {
            UserName = userName,
            DisplayName = body.DisplayName!.Trim(),
            NotifyEmail = string.IsNullOrWhiteSpace(body.NotifyEmail) ? null : body.NotifyEmail!.Trim(),
            DoctorId = body.DoctorId,
            IsActive = true,
            // 🔴 **不再強制首登改密碼**（Tim 指定 2026-09-17：「密碼設定好就好，管理者不用再另設」）。
            //    管理者填的這一組就是最終密碼。⚠️ 欄位保留、一律 false —— 拿掉欄位要一支
            //    migration，而它現在是惰性的（AppRouter 那道 403 閘已移除），留著沒有害處。
            MustChangePassword = false,
            SecurityStamp = Guid.NewGuid().ToString("N"),
            CreatedAt = now,
            UpdatedAt = now,
        };
        entity.PasswordHash = passwordHasher.HashPassword(entity, body.Password!);

        var strategy = db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            db.Users.Add(entity);
            await db.SaveChangesAsync(ct);

            db.UserRoles.AddRange(roleIds.Select(roleId => new UserRole { UserId = entity.Id, RoleId = roleId }));
            await db.SaveChangesAsync(ct);

            await tx.CommitAsync(ct);
        });

        return new OkObjectResult(ApiResponse.Ok(new { entity.Id }, "新增成功。"));
    }

    public async Task<IActionResult> UpdateUserAsync(HttpRequest req, string id)
    {
        if (!int.TryParse(id, out var userId))
            throw AppException.NotFound("帳號");

        var ct = req.HttpContext.RequestAborted;
        var entity = await db.Users.Include(u => u.UserRoles).FirstOrDefaultAsync(u => u.Id == userId, ct)
            ?? throw AppException.NotFound("帳號");

        var body = await req.ReadFromJsonAsync<UserUpdateRequest>()
            ?? throw AppException.BadRequest(ErrorCodes.ValidationRequired, "缺少請求內容。");

        if (string.IsNullOrWhiteSpace(body.DisplayName))
            throw AppException.BadRequest(ErrorCodes.ValidationRequired, "displayName 為必填。");

        int[]? roleIds = null;
        if (body.RoleIds is not null)
        {
            roleIds = body.RoleIds.Distinct().ToArray();
            if (roleIds.Length == 0)
                throw AppException.BadRequest(ErrorCodes.ValidationRequired, "roleIds 至少需指定一個角色。");
            await EnsureRoleIdsExistAsync(roleIds, ct);
        }

        if (body.DoctorId is int doctorId && !await reads.DoctorExistsAsync(doctorId, ct))
            throw AppException.NotFound("醫師");

        entity.DisplayName = body.DisplayName!.Trim();
        entity.NotifyEmail = string.IsNullOrWhiteSpace(body.NotifyEmail) ? null : body.NotifyEmail!.Trim();
        entity.DoctorId = body.DoctorId;
        entity.UpdatedAt = Clock.UtcNow;

        if (body.IsActive is bool isActive && isActive != entity.IsActive)
        {
            // 重新啟用／停用都可能改變既發權杖的有效性，統一在這裡更換 SecurityStamp。
            entity.IsActive = isActive;
            entity.SecurityStamp = Guid.NewGuid().ToString("N");
        }

        var strategy = db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);

            if (roleIds is not null)
            {
                db.UserRoles.RemoveRange(entity.UserRoles);
                db.UserRoles.AddRange(roleIds.Select(roleId => new UserRole { UserId = entity.Id, RoleId = roleId }));
            }

            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        });

        return new OkObjectResult(ApiResponse.Ok("更新成功。"));
    }

    public async Task<IActionResult> ResetPasswordAsync(HttpRequest req, string id)
    {
        if (!int.TryParse(id, out var userId))
            throw AppException.NotFound("帳號");

        var ct = req.HttpContext.RequestAborted;
        var entity = await db.Users.FindAsync([userId], ct)
            ?? throw AppException.NotFound("帳號");

        var body = await req.ReadFromJsonAsync<ResetPasswordRequest>()
            ?? throw AppException.BadRequest(ErrorCodes.ValidationRequired, "缺少請求內容。");

        if (string.IsNullOrWhiteSpace(body.NewPassword) || body.NewPassword!.Length < MinPasswordLength)
            throw AppException.BadRequest(ErrorCodes.ValidationRange, $"newPassword 為必填，長度至少 {MinPasswordLength} 碼。");

        entity.PasswordHash = passwordHasher.HashPassword(entity, body.NewPassword!);
        // ⚠️ 改密碼要同時更換 SecurityStamp，使既發權杖失效（docs/11 §5.1）。
        entity.SecurityStamp = Guid.NewGuid().ToString("N");
        // ⚠️ 不再打開「下次登入必須改」的旗標（同上：密碼設定好就好）。
        //    重設出來的這一組就是對方的密碼，由管理者直接告知本人。
        entity.MustChangePassword = false;
        entity.UpdatedAt = Clock.UtcNow;

        await db.SaveChangesAsync(ct);

        return new OkObjectResult(ApiResponse.Ok("密碼已重設。這一組就是該帳號的密碼，請直接告知本人。"));
    }

    /// <summary>
    /// 停用不刪除（docs/08 §A-1）—— 內容的 <c>CreatedByUserId</c> 還指著它。
    /// <para>
    /// ⚠️ <b>擋下「停用自己」</b>：超管把自己停用之後就進不來了，而帳號管理是
    /// 限超管的畫面 —— 這會需要直接改資料庫才救得回來。
    /// </para>
    /// </summary>
    public async Task<IActionResult> DeactivateUserAsync(HttpRequest req, string id)
    {
        if (!int.TryParse(id, out var userId))
            throw AppException.NotFound("帳號");

        if (userId == RequestContext.UserId(req))
            throw AppException.Conflict(ErrorCodes.ConflictState, "不能停用目前登入的帳號。");

        var entity = await db.Users.FindAsync(userId)
            ?? throw AppException.NotFound("帳號");

        entity.IsActive = false;
        entity.SecurityStamp = Guid.NewGuid().ToString("N"); // 立即讓既發權杖失效
        entity.UpdatedAt = Clock.UtcNow;

        await db.SaveChangesAsync();

        return new OkObjectResult(ApiResponse.Ok("停用成功。"));
    }

    public async Task<IActionResult> ListRolesAsync()
    {
        var roles = await reads.ListRolesAsync();
        var permissions = await reads.ListPermissionsAsync();

        return new OkObjectResult(ApiResponse.Ok(new RolePermissionMatrixDto
        {
            Roles = roles,
            AllPermissions = permissions,
        }));
    }

    /// <summary>
    /// 角色固定但權限可調（docs/08 §A-2）。
    /// 🔴 <b>鎖在門外防護</b>：若這次調整會讓 <c>account.manage</c> 從系統裡消失
    /// （這個角色移除後，全部角色都沒有這個權限碼），拒絕此次調整——否則沒有人能再回來管理權限。
    /// </summary>
    public async Task<IActionResult> UpdateRolePermissionsAsync(HttpRequest req, string id)
    {
        if (!int.TryParse(id, out var roleId))
            throw AppException.NotFound("角色");

        var ct = req.HttpContext.RequestAborted;
        var role = await db.Roles.Include(r => r.RolePermissions).FirstOrDefaultAsync(r => r.Id == roleId, ct)
            ?? throw AppException.NotFound("角色");

        var body = await req.ReadFromJsonAsync<UpdateRolePermissionsRequest>()
            ?? throw AppException.BadRequest(ErrorCodes.ValidationRequired, "缺少請求內容。");

        var requestedCodes = (body.PermissionCodes ?? []).Distinct().ToArray();
        var existingCodes = await reads.ExistingPermissionCodesAsync(requestedCodes, ct);
        var unknown = requestedCodes.Except(existingCodes, StringComparer.Ordinal).ToArray();
        if (unknown.Length > 0)
            throw AppException.BadRequest(ErrorCodes.ValidationFormat, $"未知的權限碼：{string.Join('、', unknown)}。");

        var willKeepAccountManage = requestedCodes.Contains(PermissionCodes.AccountManage, StringComparer.Ordinal);
        if (!willKeepAccountManage
            && await reads.AnyOtherRoleHasPermissionAsync(PermissionCodes.AccountManage, roleId, ct) is false)
        {
            throw AppException.Conflict(
                ErrorCodes.ConflictState,
                "這是唯一持有「帳號與角色管理」權限的角色，移除後將沒有人能再管理帳號與權限設定，已阻止此操作。");
        }

        // 用 Permissions.Code 查回 Id，才能寫 RolePermissions（複合鍵是 RoleId/PermissionId）。
        var allPermissions = await reads.ListPermissionsAsync(ct);
        var codeToId = allPermissions.ToDictionary(p => p.Code, p => p.Id, StringComparer.Ordinal);

        db.RolePermissions.RemoveRange(role.RolePermissions);
        db.RolePermissions.AddRange(requestedCodes.Select(code => new RolePermission { RoleId = roleId, PermissionId = codeToId[code] }));

        await db.SaveChangesAsync(ct);

        return new OkObjectResult(ApiResponse.Ok("角色權限已更新。"));
    }

    private async Task EnsureRoleIdsExistAsync(int[] roleIds, CancellationToken ct)
    {
        var found = await reads.ExistingRoleIdsAsync(roleIds, ct);
        var missing = roleIds.Except(found).ToArray();
        if (missing.Length > 0)
            throw AppException.BadRequest(ErrorCodes.ValidationFormat, $"角色不存在：{string.Join('、', missing)}。");
    }
}
