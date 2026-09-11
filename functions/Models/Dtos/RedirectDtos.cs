namespace Skin20.Api.Models.Dtos;

/// <summary>
/// 301 轉址（docs/08-database.md §H、docs/10-api.md §3.4）。
/// </summary>
public sealed class RedirectDto
{
    public int Id { get; set; }
    public string FromPath { get; set; } = string.Empty;
    public string ToPath { get; set; } = string.Empty;
    public int? ToContentItemId { get; set; }
    public short StatusCode { get; set; }
    public bool IsActive { get; set; }
    public byte Source { get; set; }
    public bool IsVerified { get; set; }
    public DateTime CreatedAt { get; set; }
}

/// <summary>新增一筆轉址（單筆，非 CSV 匯入）。</summary>
public sealed class RedirectCreateRequest
{
    /// <summary>舊路徑，可含 query string（如 <c>share.php?class=醫美新知&amp;year=2024</c>）。伺服器端會正規化。</summary>
    public string? FromPath { get; set; }

    public string? ToPath { get; set; }
    public int? ToContentItemId { get; set; }
    public short? StatusCode { get; set; }
    public bool? IsActive { get; set; }

    /// <summary>1 遷移工具產生／2 人工新增／3 系統自動。未帶則預設 2（人工新增）。</summary>
    public byte? Source { get; set; }
}

/// <summary>更新一筆轉址。⚠️ 允許改 <c>FromPath</c>（更正舊資料的正規化錯誤），會重新跑迴圈防護。</summary>
public sealed class RedirectUpdateRequest
{
    public string? FromPath { get; set; }
    public string? ToPath { get; set; }
    public int? ToContentItemId { get; set; }
    public short? StatusCode { get; set; }
    public bool? IsActive { get; set; }
    public byte? Source { get; set; }
    public bool? IsVerified { get; set; }
}

/// <summary>CSV 匯入的請求體。⚠️ 本專案的 API 一律 JSON，所以 CSV 內容以字串欄位傳遞，不是 multipart 檔案上傳。</summary>
public sealed class RedirectImportRequest
{
    /// <summary>
    /// CSV 全文，UTF-8。第一列為標頭，欄位順序不拘，
    /// 辨識的欄名（不分大小寫）：<c>FromPath</c>／<c>ToPath</c>／<c>ToContentItemId</c>／
    /// <c>StatusCode</c>／<c>IsActive</c>／<c>Source</c>。只有 <c>FromPath</c>／<c>ToPath</c> 為必填。
    /// </summary>
    public string? Csv { get; set; }
}

/// <summary>單一列的匯入結果（成功列不逐一列出，只計數；失敗列附原因）。</summary>
public sealed record RedirectImportRowError(int RowNumber, string? FromPath, string Reason);

/// <summary>CSV 匯入結果摘要。</summary>
public sealed class RedirectImportResult
{
    public int TotalRows { get; set; }
    public int Imported { get; set; }
    public int Skipped { get; set; }
    public IReadOnlyList<RedirectImportRowError> Errors { get; set; } = [];
}

/// <summary>CSV 匯出結果：內容以純文字回傳（docs/10 §2 統一信封，不直接回裸檔案）。</summary>
public sealed class RedirectExportResult
{
    public int Count { get; set; }
    public string FileName { get; set; } = "redirects.csv";
    public string Csv { get; set; } = string.Empty;
}
