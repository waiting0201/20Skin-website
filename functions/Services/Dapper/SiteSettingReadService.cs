using System.Text.Json;
using Dapper;
using Skin20.Api.Data;
using Skin20.Api.Models.Dtos;
using Skin20.Api.Models.Entities;

namespace Skin20.Api.Services.Dapper;

/// <summary>
/// 全站設定的讀取路徑（docs/08-database.md §G-1）。
/// ⚠️ 純讀取，不做任何寫入——寫入一律回到 <c>Skin20DbContext</c>（docs/11 §2 鐵律 1、2）。
/// </summary>
public interface ISiteSettingReadService
{
    /// <summary>
    /// `GET /site-settings/public`。🔴 只回<see cref="PublicKeys"/>白名單內的鍵——
    /// 這是刻意選白名單而不是黑名單：日後 <c>SiteSettings</c> 加新鍵不會自動外露，
    /// 一定要有人明確把鍵名加進這份清單才會出現在公開端點（docs/10 §3.1）。
    /// </summary>
    Task<PublicSiteSettingsDto> GetPublicAsync(CancellationToken ct = default);

    /// <summary>`GET /admin/setting`。全部鍵值，含最後修改者姓名。</summary>
    Task<IReadOnlyList<SiteSettingAdminItemDto>> GetAllAsync(CancellationToken ct = default);

    /// <summary>單一鍵的原始值，供其他 Handler／Service 讀取內部設定（例如聯絡表單收件信箱）。</summary>
    Task<string?> GetValueAsync(string settingKey, CancellationToken ct = default);
}

/// <inheritdoc cref="ISiteSettingReadService"/>
public sealed class SiteSettingReadService(ISqlConnectionFactory factory) : ISiteSettingReadService
{
    /// <summary>docs/10 §3.1：AI FAQ 啟用開關、面板文案、轉真人出口網址。</summary>
    private static readonly string[] PublicKeys =
    [
        "site.name",
        "site.description",
        "aifaq.enabled",
        "aifaq.panelTitle",
        "aifaq.welcomeText",
        "aifaq.handoffBookingUrl",
        "aifaq.handoffLineUrl",
        // ⚠️ 2026-09-17 加。它本來就會出現在每一頁的 HTML 裡，公開沒有問題；
        //    但**加鍵到這張白名單是要逐個想過的**（見 PublicSiteSettingsDto 的註解）。
        "tracking.ga4",
        // ⚠️ 2026-09-18 加。兩者都是頁尾上人人看得見的東西，公開沒有問題。
        //    加它們的理由是它們本來就該生效卻沒有 —— 見 PublicSiteSettingsDto.SocialLinks。
        "footer.social.json",
        "footer.copyright",
    ];

    public async Task<PublicSiteSettingsDto> GetPublicAsync(CancellationToken ct = default)
    {
        using var connection = factory.Create();

        const string sql = "SELECT SettingKey, SettingValue FROM SiteSettings WHERE SettingKey IN @Keys";
        var rows = await connection.QueryAsync<KeyValueRow>(
            new CommandDefinition(sql, new { Keys = PublicKeys }, cancellationToken: ct));

        var map = rows.ToDictionary(r => r.SettingKey, r => r.SettingValue);

        return new PublicSiteSettingsDto
        {
            SiteName = map.GetValueOrDefault("site.name", string.Empty),
            SiteDescription = map.GetValueOrDefault("site.description", string.Empty),
            AiFaqEnabled = map.TryGetValue("aifaq.enabled", out var enabled) && bool.TryParse(enabled, out var b) && b,
            AiFaqPanelTitle = map.GetValueOrDefault("aifaq.panelTitle", string.Empty),
            AiFaqWelcomeText = map.GetValueOrDefault("aifaq.welcomeText", string.Empty),
            AiFaqHandoffBookingUrl = map.GetValueOrDefault("aifaq.handoffBookingUrl", string.Empty),
            AiFaqHandoffLineUrl = map.GetValueOrDefault("aifaq.handoffLineUrl", string.Empty),
            TrackingIds = map.GetValueOrDefault("tracking.ga4", string.Empty),
            SocialLinks = ParseSocialLinks(map.GetValueOrDefault("footer.social.json")),
            FooterCopyright = map.GetValueOrDefault("footer.copyright", string.Empty),
        };
    }

    /// <summary>
    /// <c>footer.social.json</c> → 清單。
    ///
    /// <para>
    /// 🔴 <b>解析失敗一律回空清單，絕不往上丟。</b> 這個鍵是後台自由編輯的 JSON，
    /// 而它出現在<b>每一頁</b>的頁尾 —— 讓它有機會丟例外，等於給後台一個把全站打成 500 的欄位。
    /// </para>
    ///
    /// <para>⚠️ 少了 <c>Url</c> 的項目直接略過：沒有網址的社群圖示按下去不會有任何反應。</para>
    /// </summary>
    private static List<PublicSocialLinkDto> ParseSocialLinks(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];

        try
        {
            var items = JsonSerializer.Deserialize<List<SocialLinkRow>>(json, SocialLinkJson);
            if (items is null) return [];

            return [.. items
                .Where(i => !string.IsNullOrWhiteSpace(i.Url))
                .Select(i => new PublicSocialLinkDto(i.Label?.Trim() ?? string.Empty, i.Url!.Trim()))];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static readonly JsonSerializerOptions SocialLinkJson = new() { PropertyNameCaseInsensitive = true };

    private sealed record SocialLinkRow(string? Label, string? Url);

    public async Task<IReadOnlyList<SiteSettingAdminItemDto>> GetAllAsync(CancellationToken ct = default)
    {
        using var connection = factory.Create();

        const string sql = """
            SELECT s.SettingKey, s.SettingValue, s.ValueType,
                   s.UpdatedByUserId, u.DisplayName AS UpdatedByUserName, s.UpdatedAt
            FROM SiteSettings s
            LEFT JOIN Users u ON u.Id = s.UpdatedByUserId
            ORDER BY s.SettingKey
            """;

        var rows = await connection.QueryAsync<AdminRow>(new CommandDefinition(sql, cancellationToken: ct));

        return [.. rows.Select(r => new SiteSettingAdminItemDto
        {
            SettingKey = r.SettingKey,
            SettingValue = r.SettingValue,
            ValueType = Enum.IsDefined(typeof(SettingValueType), r.ValueType)
                ? ((SettingValueType)r.ValueType).ToString()
                : r.ValueType.ToString(),
            UpdatedByUserId = r.UpdatedByUserId,
            UpdatedByUserName = r.UpdatedByUserName,
            UpdatedAt = r.UpdatedAt,
        })];
    }

    public async Task<string?> GetValueAsync(string settingKey, CancellationToken ct = default)
    {
        using var connection = factory.Create();
        const string sql = "SELECT SettingValue FROM SiteSettings WHERE SettingKey = @SettingKey";
        return await connection.QuerySingleOrDefaultAsync<string?>(
            new CommandDefinition(sql, new { SettingKey = settingKey }, cancellationToken: ct));
    }

    private sealed class KeyValueRow
    {
        public string SettingKey { get; set; } = string.Empty;
        public string SettingValue { get; set; } = string.Empty;
    }

    private sealed class AdminRow
    {
        public string SettingKey { get; set; } = string.Empty;
        public string SettingValue { get; set; } = string.Empty;
        public byte ValueType { get; set; }
        public int? UpdatedByUserId { get; set; }
        public string? UpdatedByUserName { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}
