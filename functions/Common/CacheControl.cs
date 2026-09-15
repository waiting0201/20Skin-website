using Microsoft.AspNetCore.Http;

namespace Skin20.Api.Common;

/// <summary>
/// 公開讀取端點的快取標頭。後台與寫入端點一律不可快取。
///
/// <para>
/// 🔴 <b>這裡的 TTL 只是保險層，不是失效機制。</b> 真正的失效是「發布時主動通知」——
/// 內容核准／下架／改網址時，<c>IRebuildService</c> 會打前台的失效端點，
/// 讓那幾筆的快取當場作廢，下一次請求就是新的。
/// 作法取自姊妹專案 VicRound（<c>apps/web/app/api/revalidate/route.ts</c>）。
/// </para>
///
/// <para>
/// ⚠️ <b>不要用「把 TTL 調短」來追求即時。</b> 那是拿全站的資料庫負載去換幾十秒，
/// 而且永遠不會真的即時。發布→失效那條路才是即時的來源；TTL 存在的意義只是
/// 「萬一失效通知沒送到，最久多久會自己回正」。
/// </para>
///
/// <para>
/// ⚠️ <b>SWA 的 CDN 沒有清除 API</b>（2026-09-15 查證），所以**不要**把賭注押在
/// <c>s-maxage</c> 上：邊緣快取一旦存下就只能等它到期。真正受失效通知控制的是
/// 前台 nitro 那一層的資料快取。
/// </para>
/// </summary>
public static class CacheControl
{
    /// <summary>公開內容。預設 5 分鐘，配合發布時的主動失效。</summary>
    public static void Public(HttpResponse? response, int seconds = 300)
    {
        if (response is null) return;
        response.Headers.CacheControl = $"public, max-age={seconds}, stale-while-revalidate=60";
    }

    /// <summary>後台、會員、任何帶身分的回應。</summary>
    public static void NoStore(HttpResponse? response)
    {
        if (response is null) return;
        response.Headers.CacheControl = "no-store";
    }
}
