namespace Skin20.Api.Common;

/// <summary>
/// 統一回應信封（docs/10-api.md §2、docs/11-backend-design.md §4）。
///
/// <para>
/// <b>所有端點一律回傳此信封，禁止回裸 data。</b>
/// <c>code</c> 給程式判斷、<c>message</c> 給人看、<c>errors</c> 放細節 ——
/// 前端一律以 <c>code</c> 分支，<b>不得比對 <c>message</c> 字串</b>。
/// </para>
/// </summary>
public sealed class ApiResponse<T>
{
    public bool Success { get; init; }

    /// <summary>成功時 null；失敗時為 <see cref="ErrorCodes"/> 的值。</summary>
    public string? Code { get; init; }

    public T? Data { get; init; }
    public string Message { get; init; } = string.Empty;
    public string[] Errors { get; init; } = [];
    public string Timestamp { get; init; } = Clock.UtcNow.ToString("o");
}

/// <inheritdoc cref="ApiResponse{T}"/>
public static class ApiResponse
{
    public static ApiResponse<T> Ok<T>(T data, string message = "Success")
        => new() { Success = true, Data = data, Message = message };

    public static ApiResponse<object?> Ok(string message = "Success")
        => new() { Success = true, Data = null, Message = message };

    public static ApiResponse<object?> Fail(string code, string message, params string[] errors)
        => new() { Success = false, Code = code, Data = null, Message = message, Errors = errors };
}

/// <summary>
/// 分頁回應（docs/10 §2）。
/// <para>
/// <b>雙模式</b>：帶 <c>page</c> 或 <c>pageSize</c> 時 <c>data</c> 是這個形狀；
/// 兩者皆無時 <c>data</c> 是平面陣列（供下拉選單）。省掉一組 <c>/lookup</c> 端點。
/// </para>
/// </summary>
public sealed record PagedResult<T>(
    IEnumerable<T> Items,
    int TotalCount,
    int Page,
    int PageSize,
    int TotalPages);

/// <summary>分頁參數的解析與夾限。</summary>
public static class Paging
{
    /// <summary>後台清單預設每頁筆數（docs/02 §5.1）。</summary>
    public const int DefaultPageSize = 20;

    /// <summary>
    /// ⚠️ <b>上限 100，不可拿掉。</b> 後台清單有約 800 篇文章，一個
    /// <c>pageSize=99999</c> 就能拖垮 API 與資料庫（docs/10 §2）。
    /// </summary>
    public const int MaxPageSize = 100;

    public static int Page(string? raw)
        => int.TryParse(raw, out var p) ? Math.Max(1, p) : 1;

    public static int PageSize(string? raw)
        => int.TryParse(raw, out var s) ? Math.Clamp(s, 1, MaxPageSize) : DefaultPageSize;

    public static PagedResult<T> Build<T>(IEnumerable<T> items, int totalCount, int page, int pageSize)
        => new(items, totalCount, page, pageSize,
            Math.Max(1, (int)Math.Ceiling((double)totalCount / pageSize)));
}
