namespace Skin20.Api.Common;

/// <summary>
/// 錯誤碼值域（docs/10-api.md §2）。
/// <para>
/// ⚠️ 新增錯誤碼時<b>同步更新 docs/10 §2 的表</b>，否則前端無從得知該分支哪個值。
/// 這些字串在程式中不得再出現字面值（docs/11 §12）。
/// </para>
/// </summary>
public static class ErrorCodes
{
    public const string ValidationRequired = "VALIDATION_REQUIRED";
    public const string ValidationFormat = "VALIDATION_FORMAT";
    public const string ValidationRange = "VALIDATION_RANGE";

    public const string AuthInvalidCredentials = "AUTH_INVALID_CREDENTIALS";
    public const string AuthTokenInvalid = "AUTH_TOKEN_INVALID";
    public const string AuthMustChangePassword = "AUTH_MUST_CHANGE_PASSWORD";
    public const string AuthAccountInactive = "AUTH_ACCOUNT_INACTIVE";

    public const string Forbidden = "FORBIDDEN";
    public const string NotFound = "NOT_FOUND";

    public const string ConflictDuplicate = "CONFLICT_DUPLICATE";
    public const string ConflictState = "CONFLICT_STATE";

    /// <summary><c>IsSystemLocked</c>：系統頁與系統分類不可刪、不可改 slug。</summary>
    public const string ConflictLocked = "CONFLICT_LOCKED";

    public const string UploadType = "UPLOAD_TYPE";
    public const string UploadSize = "UPLOAD_SIZE";

    public const string RateLimited = "RATE_LIMITED";
    public const string BotCheckFailed = "BOT_CHECK_FAILED";

    /// <summary>
    /// AI 問答暫時不能用：模型服務連不上、逾時、金鑰未設定，或語料索引還沒建立（503）。
    /// <para>
    /// 🔴 <b>「答不出來」不是這一個。</b> 檢索不到夠相關的內容是正常的問答結果，
    /// 回 200 配 <c>answered: false</c>（docs/10 §3.1）—— 用 4xx／5xx 表達會讓前台
    /// 顯示成錯誤紅字，而那不是錯誤。
    /// </para>
    /// </summary>
    public const string AiUnavailable = "AI_UNAVAILABLE";

    /// <summary>未預期例外。⚠️ <b>不得洩漏堆疊</b>，細節只進 Application Insights。</summary>
    public const string Internal = "INTERNAL";
}

/// <summary>
/// 帶錯誤碼與 HTTP 狀態的應用程式例外（docs/11 §4）。
/// <para>
/// <b>禁止 <c>throw new Exception(...)</c></b> —— 沒有 code、沒有 status，只會變成 500。
/// </para>
/// </summary>
public sealed class AppException(string code, string message, int statusCode = 400) : Exception(message)
{
    public string Code { get; } = code;
    public int StatusCode { get; } = statusCode;

    public static AppException NotFound(string resource)
        => new(ErrorCodes.NotFound, $"{resource}不存在。", 404);

    public static AppException Unauthorized(string? detail = null)
        => new(ErrorCodes.AuthTokenInvalid, detail ?? "未授權。", 401);

    public static AppException Forbidden(string? detail = null)
        => new(ErrorCodes.Forbidden, detail ?? "權限不足。", 403);

    public static AppException BadRequest(string code, string detail)
        => new(code, detail, 400);

    public static AppException Conflict(string code, string detail)
        => new(code, detail, 409);

    public static AppException RateLimited(string detail)
        => new(ErrorCodes.RateLimited, detail, 429);
}
