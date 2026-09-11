namespace Skin20.Api.Common;

/// <summary>
/// 全專案唯一的時間來源（docs/11-backend-design.md §12）。
///
/// <para>
/// <b>業務邏輯禁用 <c>DateTime.Now</c> / <c>DateTime.UtcNow</c></b>，例外只有
/// JWT 有效期與 cron 判定。
/// </para>
///
/// <list type="table">
///   <item>
///     <term><see cref="UtcNow"/></term>
///     <description>
///       <b>所有寫進 DB 與拿來比較 DB 時間欄的值</b>：<c>PublishAt</c>／<c>UnpublishAt</c>
///       判定、稽核欄位、可見性判定式的 <c>@Now</c>。
///     </description>
///   </item>
///   <item>
///     <term><see cref="Now"/> / <see cref="Today"/></term>
///     <description>台北時區，<b>只給顯示</b>，不得寫入 DB。</description>
///   </item>
/// </list>
///
/// <para>
/// ⚠️ 混用的話上下架時間窗會整整差 8 小時，而且不會有任何錯誤訊息 ——
/// 只會表現成「排程到了卻沒上線」或「還沒到就上線了」。
/// </para>
/// </summary>
public static class Clock
{
    private static readonly TimeZoneInfo Taipei = ResolveTaipei();

    /// <summary>持久化與比較 DB 時間欄一律用這個。</summary>
    public static DateTime UtcNow => DateTime.UtcNow;

    /// <summary>台北時間，<b>只給顯示</b>。</summary>
    public static DateTime Now => TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, Taipei);

    /// <summary>台北日期，<b>只給顯示與營業日判定</b>。</summary>
    public static DateOnly Today => DateOnly.FromDateTime(Now);

    private static TimeZoneInfo ResolveTaipei()
    {
        // Linux（Azure Functions 的執行環境）用 IANA 名稱，Windows 用自己那套。
        // 兩個都試，免得本機開發與正式環境行為不同。
        foreach (var id in new[] { "Asia/Taipei", "Taipei Standard Time" })
        {
            try { return TimeZoneInfo.FindSystemTimeZoneById(id); }
            catch (TimeZoneNotFoundException) { }
            catch (InvalidTimeZoneException) { }
        }

        // 台北沒有日光節約時間，固定 +08:00 是安全的退路。
        return TimeZoneInfo.CreateCustomTimeZone("Taipei", TimeSpan.FromHours(8), "Taipei", "Taipei");
    }
}
