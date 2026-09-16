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
