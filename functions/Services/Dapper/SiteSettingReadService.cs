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
        "aifaq.enabled",
        "aifaq.panelTitle",
        "aifaq.welcomeText",
        "aifaq.handoffBookingUrl",
        "aifaq.handoffLineUrl",
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
            AiFaqEnabled = map.TryGetValue("aifaq.enabled", out var enabled) && bool.TryParse(enabled, out var b) && b,
            AiFaqPanelTitle = map.GetValueOrDefault("aifaq.panelTitle", string.Empty),
            AiFaqWelcomeText = map.GetValueOrDefault("aifaq.welcomeText", string.Empty),
            AiFaqHandoffBookingUrl = map.GetValueOrDefault("aifaq.handoffBookingUrl", string.Empty),
            AiFaqHandoffLineUrl = map.GetValueOrDefault("aifaq.handoffLineUrl", string.Empty),
        };
    }

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
