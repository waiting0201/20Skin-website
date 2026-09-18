namespace Skin20.Api.Models.Dtos;

/// <summary>
/// <c>POST /ai/ask</c>（docs/10-api.md §3.1、docs/04-ai-faq.md §4）。
///
/// <para>
/// ⚠️ <b>不存對話。</b> 多輪的上下文由前台自己保存並每次回送 ——
/// docs/08 §I 明列不建 AI 對話紀錄表，那不是疏漏。
/// </para>
/// </summary>
public sealed class AiAskRequest
{
    public string? Question { get; set; }

    /// <summary>先前幾則對話。伺服器只取最後幾則，且明確標注「不得作為事實來源」。</summary>
    public List<AiHistoryTurn>? History { get; set; }

    /// <summary>機器人驗證權杖。命名刻意不帶供應商名稱（docs/10 §5）。</summary>
    public string? BotCheckToken { get; set; }
}

/// <summary>一則歷史訊息。<c>role</c> 為 <c>user</c> 或 <c>assistant</c>。</summary>
public sealed class AiHistoryTurn
{
    public string? Role { get; set; }
    public string? Text { get; set; }
}

/// <summary>
/// 回答。
/// <para>
/// 🔴 <c>answered: false</c>（答不出來）<b>也是 200</b> —— 那是一個成功的回答，
/// 不是錯誤。真正的錯誤只有 <c>AI_UNAVAILABLE</c>。
/// </para>
/// </summary>
public sealed record AiAskResponse(
    string Answer,
    bool Answered,
    IReadOnlyList<AiSource> Sources,
    AiHandoff Handoff,
    string Disclaimer);

/// <summary>
/// 引用的站內頁面。
/// <para>⚠️ 網址由伺服器對映，模型從頭到尾看不到任何 URL（見 <c>AiHandler</c>）。</para>
/// </summary>
public sealed record AiSource(string Title, string Url, string Kind);

/// <summary>
/// 轉真人的出口（docs/04 §4 第五條：不讓使用者卡在 AI 迴圈裡）。
/// <para>⚠️ 前台一律依 <see cref="Reason"/> 分支文案，<b>不要比對 message 字串</b>（docs/10 §2）。</para>
/// </summary>
public sealed record AiHandoff(bool Needed, string? Reason);
