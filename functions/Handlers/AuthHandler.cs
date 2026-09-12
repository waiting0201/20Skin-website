using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Skin20.Api.Common;
using Skin20.Api.Data;
using Skin20.Api.Models.Dtos;
using Skin20.Api.Models.Entities;
using Skin20.Api.Services;
using Skin20.Api.Services.Dapper;

namespace Skin20.Api.Handlers;

/// <summary>
/// docs/10 §3.2：後台認證。🔴 **單段驗證，沒有雙因素**（2026-09-11 院方決定）——
/// 登入次數限制是主防線，帳號與來源 IP 雙維度計數，不可打折。
///
/// <para>
/// 2026-09-12 補上機器人驗證（reCAPTCHA v3）作為第二道。⚠️ 它<b>不能取代</b>次數限制：
/// v3 是分數制、連不上 Google 時會放行（否則後台會整個登不進去），
/// 真正擋得住撞庫的仍然是次數限制。
/// </para>
///
/// <para>
/// ⚠️ 分層鐵律（docs/11 §2）：Handler 內<b>禁止直接寫 SQL</b> —— 讀走 Dapper ReadService、
/// 寫走 <c>Skin20DbContext</c>；<b>禁止重複檢查權限碼</b> —— 授權集中在 <c>AppRouter</c>，
/// 唯一例外是資料列擁有者判定（§5.4）。
/// </para>
/// </summary>
public sealed class AuthHandler(
    IAuthReadService authRead,
    Skin20DbContext db,
    IJwtService jwt,
    IRateLimitService rateLimit,
    IBotCheckService botCheck,
    IConfiguration configuration,
    ILogger<AuthHandler> logger)
{
    /// <summary>
    /// docs/08 §A-5 配套 3：密碼強度規則尚未定案（docs/02 §4「密碼強度與輪替規則需一併訂定」）。
    /// 這裡先給一個保守的最低長度，不是最終政策——政策定案後要回來改這裡。
    /// </summary>
    private const int MinPasswordLength = 8;

    // PasswordHasher<TUser> 的 TUser 參數在 v3 雜湊演算法裡完全沒被用到（只是型別佔位），
    // 但 API 要求傳一個非 null 實例——這裡建一個空殼即可，不對應任何真正的使用者。
    private static readonly User HasherPlaceholder = new();
    private static readonly IPasswordHasher<User> Hasher = new PasswordHasher<User>();

    private TimeSpan RefreshTokenLifetime => TimeSpan.FromDays(
        int.TryParse(configuration["Jwt:RefreshTokenDays"], out var d) ? Math.Max(1, d) : 30);

    public async Task<IActionResult> LoginAsync(HttpRequest req)
    {
        var body = await ReadBodyAsync<LoginRequest>(req);

        if (string.IsNullOrWhiteSpace(body.UserName) || string.IsNullOrWhiteSpace(body.Password))
            throw AppException.BadRequest(ErrorCodes.ValidationRequired, "帳號與密碼為必填。");

        var userName = body.UserName.Trim();
        var ip = RequestContext.IpAddress(req);

        // 🔴 後台唯一防線：帳號與來源 IP 雙維度計數（docs/10 §3.2）。
        await rateLimit.EnsureNotLockedAsync(userName, ip);

        // 機器人驗證（docs/10 §5，2026-09-12 定案採 reCAPTCHA v3）。
        //
        // ⚠️ **排在次數限制之後**：次數限制是一次本機 DB 查詢，機器人驗證是一次外部
        //    HTTP 呼叫。已經被鎖的帳號不該再讓 Google 跑一趟。
        // ⚠️ **排在驗密碼之前**：驗過密碼才擋，等於讓機器人拿到「這組帳密對不對」的資訊。
        // ⚠️ 它是**補強**不是主防線 —— 連不上 Google 時 BotCheckService 會放行，
        //    那時擋在前面的仍然是次數限制。
        await botCheck.EnsureHumanAsync(body.BotCheckToken, "login");

        var user = await authRead.FindByUserNameAsync(userName);

        // ⚠️ 失敗訊息不區分「帳號不存在」與「密碼錯誤」（docs/10 §2）。
        if (user is null)
        {
            await rateLimit.RecordFailureAsync(userName, ip);
            throw InvalidCredentials();
        }

        var verify = Hasher.VerifyHashedPassword(HasherPlaceholder, user.PasswordHash, body.Password);
        if (verify == PasswordVerificationResult.Failed)
        {
            await rateLimit.RecordFailureAsync(userName, ip);
            throw InvalidCredentials();
        }

        // ⚠️ 帳號停用與否只在密碼已經驗證正確之後才揭露——先擋密碼再擋停用，
        // 避免「帳號已停用」這個較明確的錯誤訊息被拿去做帳號列舉。
        if (!user.IsActive)
        {
            await rateLimit.RecordFailureAsync(userName, ip);
            throw new AppException(ErrorCodes.AuthAccountInactive, "帳號已停用。", 403);
        }

        // 登入成功：清掉計數器（docs/08 §A-3：這是計數器不是日誌，不留歷史）。
        await rateLimit.ClearAsync(userName, ip);

        if (verify == PasswordVerificationResult.SuccessRehashNeeded)
        {
            // 機會性升級雜湊參數，不影響本次登入是否成功——失敗只記警告，下次登入再試一次。
            try
            {
                await RehashPasswordAsync(user.UserId, body.Password);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "登入時機會性重新雜湊密碼失敗，使用者 Id {UserId}", user.UserId);
            }
        }

        // ⚠️ `MustChangePassword` **不能在這裡擋下登入**。
        //
        // docs/10 §3.2：`POST /auth/change-password` 需有效 token（但不需權限碼，因為
        // 首登時使用者還沒有任何權限）—— 若登入不發 token，使用者就**永遠改不了密碼**，
        // 種子帳號等於鎖死。實測過：回 403 之後沒有任何路徑拿得到 token。
        //
        // 正確作法是照發 token 並帶旗標，由前端導向改密碼畫面；其餘端點在旗標未清除前
        // 回 AUTH_MUST_CHANGE_PASSWORD。
        var response = await IssueTokenPairAsync(user);
        return new OkObjectResult(ApiResponse.Ok(response));
    }

    public async Task<IActionResult> RefreshAsync(HttpRequest req)
    {
        var body = await ReadBodyAsync<RefreshRequest>(req);
        if (string.IsNullOrWhiteSpace(body.RefreshToken))
            throw AppException.BadRequest(ErrorCodes.ValidationRequired, "缺少 refresh token。");

        var hash = jwt.HashRefreshToken(body.RefreshToken);
        var now = Clock.UtcNow;

        var token = await db.RefreshTokens.SingleOrDefaultAsync(t => t.TokenHash == hash);
        if (token is null)
            throw AppException.Unauthorized("憑證無效，請重新登入。");

        if (token.RevokedAt is not null)
        {
            // 🔴 rotation：偵測到已撤銷的 token 被重用 → 撤銷該使用者全部 token
            // （docs/11 §5.2）。這通常代表 refresh token 外洩或被重放。
            await RevokeAllForUserAsync(token.UserId, now);
            throw AppException.Unauthorized("憑證已被撤銷，請重新登入。");
        }

        if (token.ExpiresAt <= now)
            throw AppException.Unauthorized("憑證已過期，請重新登入。");

        var user = await authRead.FindByIdAsync(token.UserId)
            ?? throw AppException.Unauthorized("使用者不存在，請重新登入。");

        if (!user.IsActive)
            throw new AppException(ErrorCodes.AuthAccountInactive, "帳號已停用。", 403);

        // rotation：撤銷舊的、發新的一對。⚠️ 這裡只標記變更，實際 SaveChanges 發生在
        // IssueTokenPairAsync 內——兩者共用同一個 db 執行個體，會在同一次 SaveChangesAsync
        // 裡一起送出，天生就是同一筆交易。不要把這行改成立刻呼叫 SaveChangesAsync，
        // 否則「撤銷舊 token」與「發新 token」會變成兩個不同交易，中間有一段空窗。
        token.RevokedAt = now;

        var response = await IssueTokenPairAsync(user);
        return new OkObjectResult(ApiResponse.Ok(response));
    }

    public async Task<IActionResult> LogoutAsync(HttpRequest req)
    {
        // 缺 token 或格式不對就視為已登出：冪等處理，不需要報錯——
        // 避免對外洩漏「這個 token 存不存在」的資訊。
        LogoutRequest? body;
        try
        {
            body = await req.ReadFromJsonAsync<LogoutRequest>();
        }
        catch (JsonException)
        {
            body = null;
        }

        if (body is not null && !string.IsNullOrWhiteSpace(body.RefreshToken))
        {
            var hash = jwt.HashRefreshToken(body.RefreshToken);
            var token = await db.RefreshTokens.SingleOrDefaultAsync(t => t.TokenHash == hash);

            if (token is not null && token.RevokedAt is null)
            {
                // 只能撤銷自己的憑證，不能拿別人的 token hash 亂猜著撤銷。
                var callerId = RequestContext.UserId(req);
                if (token.UserId != callerId)
                    throw AppException.Forbidden("無法撤銷其他使用者的憑證。");

                token.RevokedAt = Clock.UtcNow;
                await db.SaveChangesAsync();
            }
        }

        return new OkObjectResult(ApiResponse.Ok("已登出。"));
    }

    public async Task<IActionResult> ChangePasswordAsync(HttpRequest req)
    {
        var body = await ReadBodyAsync<ChangePasswordRequest>(req);

        if (string.IsNullOrWhiteSpace(body.CurrentPassword) || string.IsNullOrWhiteSpace(body.NewPassword))
            throw AppException.BadRequest(ErrorCodes.ValidationRequired, "目前密碼與新密碼皆為必填。");

        if (body.NewPassword.Length < MinPasswordLength)
            throw AppException.BadRequest(
                ErrorCodes.ValidationRange, $"新密碼長度至少 {MinPasswordLength} 碼（暫行規則，待正式密碼政策定案）。");

        var userId = RequestContext.UserId(req);

        var user = await db.Users.SingleOrDefaultAsync(u => u.Id == userId)
            ?? throw AppException.Unauthorized("使用者不存在。");

        var verify = Hasher.VerifyHashedPassword(user, user.PasswordHash, body.CurrentPassword);
        if (verify == PasswordVerificationResult.Failed)
            throw new AppException(ErrorCodes.AuthInvalidCredentials, "目前密碼不正確。", 401);

        var now = Clock.UtcNow;
        var newHash = Hasher.HashPassword(user, body.NewPassword);

        // 密碼欄位（User 實體）與撤銷 refresh token（另一張表）是兩個獨立的寫入操作，
        // 必須包在同一筆交易裡——不能只改了密碼卻沒撤銷舊憑證，也不能反過來
        // （docs/11 §6.1：多表寫入必須包在交易裡 + execution strategy）。
        var strategy = db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync();

            user.PasswordHash = newHash;
            user.SecurityStamp = Guid.NewGuid().ToString("D");
            user.MustChangePassword = false;
            user.UpdatedAt = now;

            // 改密碼視為敏感事件：撤銷全部既發 refresh token，強制其他裝置重新登入
            // （呼叫端自己這次的 session 也一併撤銷——改密碼後一律要求前端重新走一次登入，
            // 不在這裡發新的一對）。
            await db.RefreshTokens
                .Where(t => t.UserId == userId && t.RevokedAt == null)
                .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, now));

            await db.SaveChangesAsync();
            await tx.CommitAsync();
        });

        return new OkObjectResult(ApiResponse.Ok("密碼已更新，請重新登入。"));
    }

    private async Task<TokenResponse> IssueTokenPairAsync(AuthUserLookup user)
    {
        var accessToken = jwt.IssueAccessToken(
            user.UserId, user.UserName, user.Roles, user.Permissions, user.IsSuperAdmin, user.MustChangePassword);
        var (refreshToken, refreshHash) = jwt.IssueRefreshToken();
        var now = Clock.UtcNow;

        db.RefreshTokens.Add(new RefreshToken
        {
            UserId = user.UserId,
            TokenHash = refreshHash,
            ExpiresAt = now.Add(RefreshTokenLifetime),
            CreatedAt = now,
        });
        await db.SaveChangesAsync();

        return new TokenResponse
        {
            AccessToken = accessToken,
            RefreshToken = refreshToken,
            UserId = user.UserId,
            UserName = user.UserName,
            DoctorId = user.DoctorId,
            DisplayName = user.DisplayName,
            Roles = user.Roles,
            Permissions = user.Permissions,
            IsSuperAdmin = user.IsSuperAdmin,
            // ⚠️ 這個旗標必須回給前端 —— 登入會成功、token 也照發，但除了改密碼以外
            //    每一支端點都會被 AppRouter 擋成 403。前端要據此導向改密碼畫面，
            //    否則使用者會看到一個「登入成功但什麼都打不開」的後台。
            MustChangePassword = user.MustChangePassword,
        };
    }

    private async Task RevokeAllForUserAsync(int userId, DateTime now)
        => await db.RefreshTokens
            .Where(t => t.UserId == userId && t.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, now));

    private async Task RehashPasswordAsync(int userId, string plainTextPassword)
    {
        // PasswordHasher 判斷目前的雜湊參數（迭代次數等）過舊時會回傳 SuccessRehashNeeded——
        // 用 ExecuteUpdateAsync 直接改欄位，不需要先把整個 User 實體讀出來追蹤。
        var rehashed = Hasher.HashPassword(HasherPlaceholder, plainTextPassword);
        await db.Users.Where(u => u.Id == userId)
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.PasswordHash, rehashed));
    }

    private static AppException InvalidCredentials()
        => new(ErrorCodes.AuthInvalidCredentials, "帳號或密碼錯誤。", 401);

    private static async Task<T> ReadBodyAsync<T>(HttpRequest req) where T : class
    {
        try
        {
            return await req.ReadFromJsonAsync<T>()
                ?? throw AppException.BadRequest(ErrorCodes.ValidationRequired, "缺少請求內容。");
        }
        catch (JsonException)
        {
            throw AppException.BadRequest(ErrorCodes.ValidationFormat, "請求內容格式錯誤，需為合法 JSON。");
        }
    }
}
