namespace Skin20.Api.Common;

/// <summary>
/// 前台可見性判定式（docs/11-backend-design.md §6.4、§7）。
///
/// <para>
/// 🔴 <b>這段條件只能有一份。</b> 建置期的內容匯出腳本（docs/09 §3）必須用同一段 ——
/// 寫兩份遲早會分岔，而分岔的症狀是<b>「列表看得到、點進去 404」</b>，
/// 而且只在上線後才發現。
/// </para>
///
/// <para>
/// ⚠️ <b>可見性不綁在編輯狀態上。</b> 判定的是「<b>有沒有一版已核准的內容</b>」
/// （<c>PublishedVersionId IS NOT NULL</c>），不是「工作副本現在是什麼狀態」。
/// </para>
/// <para>
/// 這個區分是必要的，不是潔癖：編輯一個已上線的療程頁時，工作副本會回到草稿、
/// 送審時會變成送審中 —— 如果可見性看 <c>Status = 3</c>，<b>那一頁就會在編輯期間
/// 從網站上消失（404）</b>，等重新核准才回來。醫療內容的審核閘是為了擋住「未經審核的
/// 新內容上線」，不是為了把已經審過的頁面下架。
/// </para>
/// <para>
/// 前台看到的一律是 <c>PublishedVersionId</c> 指的那一版快照，
/// 所以編輯中的草稿也不會外流。核准時才改寫 <c>PublishedVersionId</c>。
/// </para>
/// <para>
/// ⚠️ 唯一會讓頁面消失的是<b>明確下架</b>（<c>Status = 4</c>）與時間窗。
/// </para>
/// </summary>
public static class Visibility
{
    /// <summary>
    /// SQL 片段，前綴 <c>ci</c> 是 <c>ContentItems</c> 的別名。
    /// 參數：<c>@Now</c>（一律傳 <see cref="Clock.UtcNow"/>）。
    /// </summary>
    public const string PublicFilter = """
        ci.PublishedVersionId IS NOT NULL
        AND ci.Status <> 4
        AND (ci.PublishAt   IS NULL OR ci.PublishAt   <= @Now)
        AND (ci.UnpublishAt IS NULL OR ci.UnpublishAt >  @Now)
        """;

    /// <summary>
    /// 同一段條件的 C# 版本，給 EF Core 的寫入路徑與 Timer 用。
    /// ⚠️ 改動時<b>兩處要一起改</b>。
    /// </summary>
    public static bool IsPubliclyVisible(
        int? publishedVersionId,
        Models.Entities.ContentStatus status,
        DateTime? publishAt,
        DateTime? unpublishAt)
    {
        var now = Clock.UtcNow;
        return publishedVersionId is not null
            && status != Models.Entities.ContentStatus.Unpublished
            && (publishAt is null || publishAt <= now)
            && (unpublishAt is null || unpublishAt > now);
    }
}
