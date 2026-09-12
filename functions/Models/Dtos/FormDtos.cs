namespace Skin20.Api.Models.Dtos;

/// <summary>
/// `POST /contact`（docs/10-api.md §3.1）。
/// 🔴 <b>只用來寄通知信，欄位不落庫</b>（docs/02 §2）。<c>Message</c> 例外——
/// 只有它的文字本身會被寫進 <c>QuestionInbox</c>（docs/08 §F，<c>Source=ContactForm</c>），
/// 姓名／電話／Email 絕不進 DB。
/// </summary>
public sealed class ContactRequest
{
    public string? Name { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }

    /// <summary>
    /// 想詢問的院區（表單上的下拉選單）。
    /// <para>⚠️ 與 <see cref="Topic"/> 一樣<b>只進通知信</b>，不落庫 —— 它們是聯絡意圖的一部分，
    /// 不是題庫語料。少了它們，院方收到的信會少掉「要找誰、問什麼類別」這兩個最關鍵的分流資訊。</para>
    /// </summary>
    public string? Site { get; set; }

    /// <summary>詢問主題（表單上的下拉選單）。同 <see cref="Site"/>，只進通知信。</summary>
    public string? Topic { get; set; }

    public string? Message { get; set; }

    /// <summary>是否勾選同意隱私權政策。同意時間只寫進通知信文字，不入庫（docs/10 §3.1）。</summary>
    public bool PrivacyConsent { get; set; }

    /// <summary>機器人驗證權杖。命名刻意不帶供應商名稱（docs/10 §5）。</summary>
    public string? BotCheckToken { get; set; }
}

/// <summary>
/// `POST /questions/miss`（docs/10-api.md §3.1、docs/08-database.md §F）。
/// 去重與寫入只保留問題文字本身，不接受任何可回連送出者的欄位。
/// </summary>
public sealed class MissedQuestionRequest
{
    public string? QuestionText { get; set; }

    /// <summary><c>"search"</c>（站內搜尋無結果）或 <c>"ai-faq"</c>（AI FAQ 未命中）。</summary>
    public string? Source { get; set; }

    public string? BotCheckToken { get; set; }
}
