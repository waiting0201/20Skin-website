namespace Skin20.Api.Models.Dtos;

/// <summary>
/// `GET /site-settings/public` 的形狀（docs/10-api.md §3.1）。
/// 🔴 只回前台需要的鍵：AI FAQ 啟用開關、面板文案、轉真人出口網址。
/// 收件信箱、追蹤碼等內部設定<b>一律不外露</b>——見 <c>SiteSettingReadService</c> 的白名單。
/// </summary>
public sealed class PublicSiteSettingsDto
{
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
