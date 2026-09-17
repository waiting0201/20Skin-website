namespace Skin20.Api.Models.Dtos;

/// <summary>
/// `GET /site-settings/public` 的形狀（docs/10-api.md §3.1）。
/// 🔴 只回前台需要的鍵：AI FAQ 啟用開關、面板文案、轉真人出口網址。
/// 收件信箱、追蹤碼等內部設定<b>一律不外露</b>——見 <c>SiteSettingReadService</c> 的白名單。
/// </summary>
public sealed class PublicSiteSettingsDto
{
    // 🔴 **只放前台真的要的鍵，一個都不要多。** 這支是公開端點，加進來的東西
    //    就是對全世界公開。2026-09-15 補這兩個是因為前台改成執行期 SSR 之後，
    //    站名與描述不再由建置期匯出取得（那時是伺服器端讀資料庫，全部 16 個鍵
    //    都拿得到，其中包含 contact.recipientEmail 這種不能外露的）。
    //    ⚠️ 不要為了省事改成「回傳整張 SiteSettings」。
    public string SiteName { get; set; } = string.Empty;
    public string SiteDescription { get; set; } = string.Empty;

    public bool AiFaqEnabled { get; set; }
    public string AiFaqPanelTitle { get; set; } = string.Empty;
    public string AiFaqWelcomeText { get; set; } = string.Empty;
    public string AiFaqHandoffBookingUrl { get; set; } = string.Empty;
    public string AiFaqHandoffLineUrl { get; set; } = string.Empty;

    /// <summary>
    /// GA4／GTM 的**識別碼**（多組以逗號分隔），例如 <c>G-ABCD1234,GTM-XYZ9876</c>。
    ///
    /// <para>
    /// 🔴 <b>這一欄收的是 ID，不是程式碼片段。</b> 前台拿它套官方的 snippet 模板，
    /// 所以資料庫裡永遠不會有一段任意的 <c>&lt;script&gt;</c>。
    /// </para>
    ///
    /// <para>
    /// ⚠️ 原本的設計是「貼上完整程式碼片段」（後台的 placeholder 就是這樣寫的），
    /// 但那等於<b>任何能改設定的人都可以在全站每一頁對每一位訪客執行任意 JavaScript</b>，
    /// 而設定類不走審核也不留痕（docs/08 §I），後台又沒有 IP 白名單與雙因素
    /// （CLAUDE.md 決策 10）。改成只收 ID 之後那條路整個關掉。
    /// </para>
    ///
    /// <para>
    /// ⚠️ 代價：Meta Pixel 這類非 Google 的工具貼不進來。那要另開一個設定鍵
    /// （<c>site.ts</c> 的註解已定調「鍵是固定的，要多一個就是一支 migration」），
    /// 並且在那個鍵上明確記錄它等同給予全站 JS 執行權。<b>不要靠放寬這一欄解決。</b>
    /// </para>
    /// </summary>
    public string TrackingIds { get; set; } = string.Empty;
}

/// <summary>後台設定畫面的單一鍵值（docs/10-api.md §3.4）。</summary>
public sealed class SiteSettingAdminItemDto
{
    public string SettingKey { get; set; } = string.Empty;
    public string SettingValue { get; set; } = string.Empty;

    /// <summary><see cref="Models.Entities.SettingValueType"/> 的字串名稱，前端好讀不用查表。</summary>
    public string ValueType { get; set; } = string.Empty;

    public int? UpdatedByUserId { get; set; }
    public string? UpdatedByUserName { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public sealed class UpdateSiteSettingsRequest
{
    public List<SiteSettingUpdateItem>? Items { get; set; }
}

public sealed class SiteSettingUpdateItem
{
    public string? SettingKey { get; set; }
    public string? SettingValue { get; set; }
}
