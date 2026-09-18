using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Skin20.Api.Common;
using Skin20.Api.Data;
using Skin20.Api.Models.Entities;

namespace Skin20.Api.Services;

/// <summary>
/// 把一句「站上答不出來的問題」寫進 <c>QuestionInbox</c>（docs/08 §F、docs/04 §3 題庫成長閉環）。
///
/// <para>
/// 🔴 <b>只收問題文字本身。</b> 不記 IP、不記 session、不記姓名電話 email、不記是誰問的 ——
/// 那張表是<b>題庫成長的工作清單，不是搜尋日誌</b>。呼叫端必須自己保證傳進來的字串
/// 不含可回連送出者的資訊（<c>/contact</c> 只傳 message 那一格就是這個理由）。
/// </para>
///
/// <para>
/// ⚠️ 這一段原本是 <c>FormHandler</c> 的兩支私有方法。AI 問答的未命中回寫需要同一段邏輯
/// （正規化鍵、撞 UQ 時退回累加 <c>HitCount</c>），<b>抄第二份的話兩邊的正規化規則會分岔</b>，
/// 症狀是同一句話在收件匣裡出現兩列、各自累計次數，而「哪一句被問最多」正是這張表唯一的用途。
/// </para>
/// </summary>
public interface IQuestionInboxWriter
{
    Task RecordAsync(string rawText, QuestionSource source, CancellationToken ct = default);
}

/// <inheritdoc cref="IQuestionInboxWriter"/>
public sealed class QuestionInboxWriter(Skin20DbContext db) : IQuestionInboxWriter
{
    /// <summary>對齊 <c>QuestionInbox.QuestionText</c> 的欄位長度（docs/08 §F：nvarchar(500)）。</summary>
    public const int MaxQuestionTextLength = 500;

    private static readonly Regex WhitespaceRun = new(@"\s+", RegexOptions.Compiled);

    public async Task RecordAsync(string rawText, QuestionSource source, CancellationToken ct = default)
    {
        var trimmed = rawText.Length > MaxQuestionTextLength ? rawText[..MaxQuestionTextLength] : rawText;
        var normalized = Normalize(trimmed);
        if (normalized.Length == 0) return;

        var now = Clock.UtcNow;

        var existing = await db.QuestionInboxItems.SingleOrDefaultAsync(q => q.NormalizedText == normalized, ct);
        if (existing is not null)
        {
            existing.HitCount++;
            existing.LastSeenAt = now;
            await db.SaveChangesAsync(ct);
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
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (IsUniqueViolation(ex))
        {
            // 兩個人同時問了完全一樣的問題會撞到 UQ_QuestionInbox_NormalizedText。
            // 這不是錯誤，是預期中的併發 —— 退回做一次「找到就加值」，
            // 不讓公開端點的使用者看到一句技術性的 409。
            db.Entry(row).State = EntityState.Detached;

            var raced = await db.QuestionInboxItems.SingleAsync(q => q.NormalizedText == normalized, ct);
            raced.HitCount++;
            raced.LastSeenAt = now;
            await db.SaveChangesAsync(ct);
        }
    }

    /// <summary>去空白、轉小寫、全形轉半形（docs/08 §F：<c>NormalizedText</c> 的比對鍵規則）。</summary>
    private static string Normalize(string raw)
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

    private static bool IsUniqueViolation(DbUpdateException ex)
        => ex.InnerException is SqlException { Number: 2601 or 2627 };
}
