using Microsoft.AspNetCore.Http;

namespace Skin20.Api.Common;

/// <summary>
/// 公開讀取端點的快取標頭。後台與寫入端點一律不可快取。
///
/// <para>
/// 🔴 <b>沒有任何失效機制</b>（CLAUDE.md 決策 14：不做快取，2026-09-16）。
/// 原本這裡寫的「發布時由 <c>IRebuildService</c> 主動通知失效」那支服務已隨 SSR 改版刪除，
/// 前台的 nitro 也沒有資料快取 —— 所以這個 TTL 就是「發布之後最久多久看得到」的上限，
/// 對象是會照標頭快取的那一方（瀏覽器端換頁時直接打 API 的 <c>$fetch</c>）。
/// SSR 算繪時由伺服器打 API，不經過瀏覽器快取，不受這個 TTL 影響。
/// </para>
///
/// <para>
/// ⚠️ <b>SWA 的 CDN 沒有清除 API</b>（2026-09-15 查證），所以<b>不要</b>加 <c>s-maxage</c>
/// 去押邊緣快取：一旦存下就只能等它到期。真要加快取，位置見決策 14。
/// </para>
/// </summary>
public static class CacheControl
{
    /// <summary>公開內容。預設 5 分鐘（沒有主動失效，見上方）。</summary>
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
