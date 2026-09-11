namespace Skin20.Api.Models.Entities;

// ── F. FAQ 題庫成長（1 張表）─────────────────────────────────────────────
// docs/08-database.md §F。

/// <summary>
/// FAQ 題庫成長的工作清單（docs/08 §F）。
/// <para>
/// 🔴 <b>這是工作清單，不是搜尋日誌。</b> 同一句話只有一列，重複出現只累加
/// <see cref="HitCount"/>；處理完就結案。<b>不記錄誰在什麼時候搜的、不記 IP、不記 session。</b>
/// </para>
/// <para>
/// ⚠️ <see cref="QuestionSource.ContactForm"/> 有一條硬界線：聯絡表單只寄通知信、
/// 後台不留存收件紀錄（避免個資留存責任）。寫進本表的<b>只有問題文字本身</b>——
/// 不寫姓名、不寫電話、不寫 email，也不留任何能回連到送出者的欄位。
/// </para>
/// </summary>
public sealed class QuestionInbox
{
    public int Id { get; set; }

    /// <summary>原始提問。</summary>
    public string QuestionText { get; set; } = string.Empty;

    /// <summary>去空白、轉小寫、全形轉半形後的比對鍵。</summary>
    public string NormalizedText { get; set; } = string.Empty;

    public QuestionSource Source { get; set; }

    public int HitCount { get; set; }
    public DateTime FirstSeenAt { get; set; }
    public DateTime LastSeenAt { get; set; }

    public QuestionStatus Status { get; set; } = QuestionStatus.Pending;

    /// <summary>建題後回填。</summary>
    public int? LinkedFaqContentItemId { get; set; }

    public int? HandledByUserId { get; set; }
    public DateTime? HandledAt { get; set; }

    public ContentItem? LinkedFaqContentItem { get; set; }
    public User? HandledByUser { get; set; }
}
