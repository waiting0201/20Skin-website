namespace Skin20.Api.Common;

/// <summary>
/// 前台可見性判定式（docs/11-backend-design.md §6.4、§7）。
///
/// <para>
/// 🔴 <b>這段條件只能有一份。</b> 建置期的內容匯出腳本（docs/09 §3）必須用同一段 ——
/// 寫兩份遲早會分岔，而分岔的症狀是<b>「列表看得到、點進去 404」</b>，
/// 而且只在上線後才發現。
/// </para>
/// <para>
/// ⚠️ <b>它真的分岔過。</b> 2026-09-12 之前 <c>tools/content-export</c> 用的是自己手寫的
/// <c>ci.Status = 3</c>，與這裡的 <c>PublishedVersionId IS NOT NULL AND Status &lt;&gt; 4</c> 不同 ——
/// 意思是「編輯一個已上線的頁面（工作副本回到草稿）之後重新建置，那一頁會從網站上消失」，
/// 正是本段警告的那個症狀。現已改為 <c>&lt;Compile Include&gt;</c> 連結同一份原始碼，
/// <b>從機制上</b>不可能再分岔。
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

    // ⚠️ 這裡原本還有一個 `IsPubliclyVisible(...)` 的 C# 版本，註解寫著「改動時兩處要一起改」。
    //    2026-09-12 移除 —— 它**沒有任何呼叫端**，卻是同一條規則的第二份抄寫，
    //    正好違反這個類別自己的第一條規定（「這段條件只能有一份」）。
    //    真的需要 C# 版時請由這個常數推導，不要再手抄一份。
    //
    // ⚠️ 這個檔案**刻意沒有任何相依**（不 using Models.Entities）——
    //    `tools/content-export` 用 `<Compile Include>` 連結同一份原始碼，
    //    加相依會讓那邊編不過（見 ContentExport.csproj 的說明）。
}
