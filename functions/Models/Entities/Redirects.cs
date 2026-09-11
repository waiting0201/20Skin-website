namespace Skin20.Api.Models.Entities;

// ── H. SEO 產出與 301（1 張表）───────────────────────────────────────────
// docs/08-database.md §H。

/// <summary>
/// 301 轉址對照表（docs/08 §H）。
/// <para>
/// 🔴 <b>這張表是 <c>/api/fallback</c> 的唯一查詢對象，也是全 schema 唯一被公開流量
/// 高頻打到的表。</b> 三個由此推出的硬性要求：
/// <list type="number">
/// <item>查詢只用 <see cref="FromPath"/> 的 unique index 做單筆 seek，不做任何 join</item>
/// <item><see cref="ToPath"/> 必須是實體欄位，<b>不能 join <c>ContentItems</c> 算出來</b>——
/// <see cref="ToContentItemId"/> 只在後台維護時用（內容改 slug 時據以自動更新
/// <see cref="ToPath"/>，避免轉址鏈）</item>
/// <item><c>/api/fallback</c> 的唯讀連線字串所對應的 SQL 使用者，只能 <c>SELECT</c> 這一張表</item>
/// </list>
/// </para>
/// <para>
/// ⚠️ <see cref="FromPath"/> 要能表示 query string（如
/// <c>share.php?class=醫美新知&amp;year=2024</c>），長度要夠。
/// </para>
/// </summary>
public sealed class Redirect
{
    public int Id { get; set; }

    /// <summary>舊路徑的正規化形式。</summary>
    public string FromPath { get; set; } = string.Empty;

    /// <summary>目標路徑，實體欄位（見上方警告）。</summary>
    public string ToPath { get; set; } = string.Empty;

    /// <summary>目標為站內內容時填。</summary>
    public int? ToContentItemId { get; set; }

    public short StatusCode { get; set; } = 301;
    public bool IsActive { get; set; } = true;

    /// <summary>1 遷移工具產生／2 人工新增／3 系統自動（改 slug、換分類時）。</summary>
    public RedirectSource Source { get; set; }

    /// <summary>人工抽查 ≥ 20% 的勾稽欄位。</summary>
    public bool IsVerified { get; set; }

    public DateTime CreatedAt { get; set; }

    public ContentItem? ToContentItem { get; set; }
}
