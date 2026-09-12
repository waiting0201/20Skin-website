using System.Net.Mail;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Skin20.Api.Common;
using Skin20.Api.Data;
using Skin20.Api.Models.Dtos;
using Skin20.Api.Models.Entities;
using Skin20.Api.Services;
using Skin20.Api.Services.Dapper;

namespace Skin20.Api.Handlers;

/// <summary>
/// docs/10 §3.1：兩支公開寫入端點。
/// ⚠️ `POST /contact` **只寄通知信、不落庫**（docs/02 §2，個資留存責任）——
/// 連日誌都不可以寫表單內容。
/// ⚠️ `POST /questions/miss` 只寫問題文字本身，**不寫姓名、電話、email**（docs/08 §F）。
///
/// <para>
/// 🔴 <b>容易漏掉的一點</b>（docs/08 §F 明講「這是實作時最容易破功的地方」）：
/// <c>/contact</c> 的訊息內容<b>也要</b>寫進 <c>QuestionInbox</c>（<c>Source=ContactForm</c>），
/// 但只取問題文字本身，姓名／電話／Email 絕不進 DB。
/// </para>
/// <para>
/// ⚠️ 分層鐵律（docs/11 §2）：Handler 內<b>禁止直接寫 SQL</b> —— 讀走 Dapper ReadService、
/// 寫走 <c>Skin20DbContext</c>；<b>禁止重複檢查權限碼</b> —— 授權集中在 <c>AppRouter</c>，
/// 唯一例外是資料列擁有者判定（§5.4）。
/// </para>
/// </summary>
public sealed class FormHandler(
    Skin20DbContext db,
    ISiteSettingReadService settingsRead,
    IEmailService email,
    IBotCheckService botCheck,
    IRateLimitService rateLimit,
    ILogger<FormHandler> logger)
{
    /// <summary>對齊 <c>QuestionInbox.QuestionText</c> 的欄位長度（docs/08 §F：nvarchar(500)）。</summary>
    private const int MaxQuestionTextLength = 500;

    private static readonly Regex WhitespaceRun = new(@"\s+", RegexOptions.Compiled);

    public async Task<IActionResult> SubmitContactAsync(HttpRequest req)
    {
        var body = await ReadBodyAsync<ContactRequest>(req);

        var name = body.Name?.Trim() ?? string.Empty;
        var message = body.Message?.Trim() ?? string.Empty;
        var phone = body.Phone?.Trim();
        var emailAddress = body.Email?.Trim();

        if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(message))
            throw AppException.BadRequest(ErrorCodes.ValidationRequired, "姓名與內容為必填。");

        if (string.IsNullOrWhiteSpace(phone) && string.IsNullOrWhiteSpace(emailAddress))
            throw AppException.BadRequest(ErrorCodes.ValidationRequired, "電話與 Email 至少擇一填寫。");

        if (!string.IsNullOrWhiteSpace(emailAddress) && !IsValidEmail(emailAddress))
            throw AppException.BadRequest(ErrorCodes.ValidationFormat, "Email 格式不正確。");

        if (!body.PrivacyConsent)
            throw AppException.BadRequest(ErrorCodes.ValidationRequired, "請先同意隱私權政策。");

        var ip = RequestContext.IpAddress(req);

        // 對公網開放的寫入端點：機器人驗證 + 頻率限制，兩者都不可省（docs/10 §3.1）。
        await botCheck.EnsureHumanAsync(body.BotCheckToken, "contact");
        await rateLimit.EnsurePublicQuotaAsync("contact", ip);

        await SendContactNotificationAsync(name, phone, emailAddress, body.Site?.Trim(), body.Topic?.Trim(), message);

        // 🔴 只取問題文字本身寫入題庫成長清單，姓名／電話／Email 絕不進 DB（docs/08 §F）。
        await RecordQuestionInboxAsync(message, QuestionSource.ContactForm);

        // 回應不帶任何內部 Id（docs/10 §3.1）——本來就沒有落庫，這裡再次確保回應形狀乾淨。
        return new OkObjectResult(ApiResponse.Ok("已送出，我們會盡快與您聯繫。"));
    }

    public async Task<IActionResult> RecordMissedQuestionAsync(HttpRequest req)
    {
        var body = await ReadBodyAsync<MissedQuestionRequest>(req);

        var questionText = body.QuestionText?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(questionText))
            throw AppException.BadRequest(ErrorCodes.ValidationRequired, "問題內容為必填。");

        if (questionText.Length > MaxQuestionTextLength)
            throw AppException.BadRequest(ErrorCodes.ValidationRange, $"問題內容長度不可超過 {MaxQuestionTextLength} 字。");

        var source = ParseSource(body.Source);
        var ip = RequestContext.IpAddress(req);

        await botCheck.EnsureHumanAsync(body.BotCheckToken, "questions-miss");
        await rateLimit.EnsurePublicQuotaAsync("questions-miss", ip);

        await RecordQuestionInboxAsync(questionText, source);

        return new OkObjectResult(ApiResponse.Ok("已記錄。"));
    }

    private async Task SendContactNotificationAsync(
        string name, string? phone, string? emailAddress, string? site, string? topic, string message)
    {
        var recipient = await settingsRead.GetValueAsync("contact.recipientEmail");
        if (string.IsNullOrWhiteSpace(recipient))
        {
            // 收件信箱是後台設定（SiteSettings: contact.recipientEmail），尚未設定時
            // 不能悄悄丟棄使用者的表單，但這批資料本來就不落庫——只能記警告讓維運補設定。
            logger.LogWarning("聯絡表單收件信箱尚未設定（SiteSettings: contact.recipientEmail），本次表單僅記錄題庫、未寄出通知信。");
            return;
        }

        var receivedAt = Clock.Now; // 只用於通知信文字顯示，不入庫（docs/11 §12：顯示用台北時間）
        var subject = $"[20SKIN 官網聯絡表單] {name}";
        var content = $"""
            收到一筆聯絡表單：

            姓名：{name}
            電話：{phone}
            Email：{emailAddress}
            詢問院區：{site}
            詢問主題：{topic}
            內容：
            {message}

            已勾選同意隱私權政策，送出時間：{receivedAt:yyyy-MM-dd HH:mm}（台北時間）

            本信為系統自動通知，內容不會留存於後台資料庫（docs/02 §2）。
            """;

        // EmailService 內部已處理寄信失敗（吞例外只記 log），這裡不需要再包 try/catch。
        await email.SendAsync(recipient, subject, content);
    }

    /// <summary>
    /// 寫入 <c>QuestionInbox</c>（docs/08 §F）。🔴 只收問題文字本身——呼叫端必須自行
    /// 保證傳進來的字串不含姓名、電話、email 等可回連送出者的資訊。
    /// </summary>
    private async Task RecordQuestionInboxAsync(string rawText, QuestionSource source)
    {
        var trimmed = rawText.Length > MaxQuestionTextLength ? rawText[..MaxQuestionTextLength] : rawText;
        var normalized = NormalizeQuestionText(trimmed);
        if (normalized.Length == 0) return;

        var now = Clock.UtcNow;

        var existing = await db.QuestionInboxItems.SingleOrDefaultAsync(q => q.NormalizedText == normalized);
        if (existing is not null)
        {
            existing.HitCount++;
            existing.LastSeenAt = now;
            await db.SaveChangesAsync();
            return;
        }

        var row = new QuestionInbox
        {
            QuestionText = trimmed,
            NormalizedText = normalized,
            Source = source,
            HitCount = 1,
            FirstSeenAt = now,
            LastSeenAt = now,
            Status = QuestionStatus.Pending,
        };
        db.QuestionInboxItems.Add(row);

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (IsUniqueViolation(ex))
        {
            // 高流量情境下兩個人同時問了完全一樣的問題會撞到 UQ_QuestionInbox_NormalizedText。
            // 這不是錯誤，是預期中的併發——退回做一次「找到就加值」，不讓公開端點的使用者
            // 看到一句技術性的 409（docs/08 §F：同一句話只有一列，重複只累加 HitCount）。
            db.Entry(row).State = EntityState.Detached;

            var raced = await db.QuestionInboxItems.SingleAsync(q => q.NormalizedText == normalized);
            raced.HitCount++;
            raced.LastSeenAt = now;
            await db.SaveChangesAsync();
        }
    }

    /// <summary>去空白、轉小寫、全形轉半形（docs/08 §F：<c>NormalizedText</c> 的比對鍵規則）。</summary>
    private static string NormalizeQuestionText(string raw)
    {
        var sb = new StringBuilder(raw.Length);
        foreach (var ch in raw)
        {
            if (ch == '　') { sb.Append(' '); continue; }
            if (ch is >= '！' and <= '～') { sb.Append((char)(ch - 0xFEE0)); continue; }
            sb.Append(ch);
        }

        var collapsed = WhitespaceRun.Replace(sb.ToString().Trim(), " ");
        return collapsed.ToLowerInvariant();
    }

    private static QuestionSource ParseSource(string? raw) => raw switch
    {
        "search" => QuestionSource.SiteSearchNoResult,
        "ai-faq" => QuestionSource.AiFaqMiss,
        _ => throw AppException.BadRequest(ErrorCodes.ValidationFormat, "source 必須是 search 或 ai-faq。"),
    };

    private static bool IsValidEmail(string value)
    {
        try
        {
            _ = new MailAddress(value);
            return true;
        }
        catch (FormatException)
        {
            return false;
        }
    }

    private static bool IsUniqueViolation(DbUpdateException ex)
        => ex.InnerException is SqlException { Number: 2601 or 2627 };

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
