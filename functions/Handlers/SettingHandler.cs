using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Skin20.Api.Common;
using Skin20.Api.Data;
using Skin20.Api.Models.Dtos;
using Skin20.Api.Models.Entities;
using Skin20.Api.Services;
using Skin20.Api.Services.Dapper;

namespace Skin20.Api.Handlers;

/// <summary>
/// docs/10 §3.1／§3.4：全站設定。
/// ⚠️ `GetPublicAsync` **只回前台需要的鍵**（AI FAQ 開關、面板文案、轉真人出口）——
/// 收件信箱、追蹤碼等內部設定一律不外露。
///
/// <para>
/// ⚠️ 分層鐵律（docs/11 §2）：Handler 內<b>禁止直接寫 SQL</b> —— 讀走 Dapper ReadService、
/// 寫走 <c>Skin20DbContext</c>；<b>禁止重複檢查權限碼</b> —— 授權集中在 <c>AppRouter</c>，
/// 唯一例外是資料列擁有者判定（§5.4）。
/// </para>
/// </summary>
public sealed class SettingHandler(
    ISiteSettingReadService settingsRead,
    Skin20DbContext db,
    IHttpContextAccessor httpContextAccessor)
{
    public async Task<IActionResult> GetPublicAsync()
    {
        var snapshot = await settingsRead.GetPublicAsync();

        // docs/10 §2：公開端點只有這支需要快取，給短 s-maxage——AI FAQ 開關要能在
        // 數十秒內反映停用／啟用，不能快取太久，但也不該每次瀏覽器請求都打 DB。
        var response = httpContextAccessor.HttpContext?.Response;
        if (response is not null)
            response.Headers["Cache-Control"] = "public, s-maxage=60, max-age=30";

        return new OkObjectResult(ApiResponse.Ok(snapshot));
    }

    public async Task<IActionResult> GetAdminAsync()
    {
        var items = await settingsRead.GetAllAsync();
        return new OkObjectResult(ApiResponse.Ok(items));
    }

    public async Task<IActionResult> UpdateAsync(HttpRequest req)
    {
        var body = await ReadBodyAsync<UpdateSiteSettingsRequest>(req);

        if (body.Items is null || body.Items.Count == 0)
            throw AppException.BadRequest(ErrorCodes.ValidationRequired, "沒有要更新的設定。");

        foreach (var item in body.Items)
        {
            if (string.IsNullOrWhiteSpace(item.SettingKey))
                throw AppException.BadRequest(ErrorCodes.ValidationRequired, "settingKey 為必填。");
        }

        var keys = body.Items.Select(i => i.SettingKey!).Distinct().ToList();
        var rows = await db.SiteSettings
            .Where(s => keys.Contains(s.SettingKey))
            .ToDictionaryAsync(s => s.SettingKey);

        var userId = RequestContext.UserId(req);
        var now = Clock.UtcNow;

        foreach (var item in body.Items)
        {
            // ⚠️ 只能更新既有的鍵，不接受呼叫端憑空新增未知鍵——key-value 表的彈性
            // 是給 schema 演進用的（docs/08 §G-1），不是讓這支端點可以任意塞新鍵。
            if (!rows.TryGetValue(item.SettingKey!, out var row))
                throw AppException.NotFound($"設定鍵 {item.SettingKey}");

            var value = item.SettingValue ?? string.Empty;
            ValidateValueFormat(row.SettingKey, row.ValueType, value);

            row.SettingValue = value;
            row.UpdatedByUserId = userId;
            row.UpdatedAt = now;
        }

        await db.SaveChangesAsync();

        return new OkObjectResult(ApiResponse.Ok("設定已更新。"));
    }

    private static void ValidateValueFormat(string key, SettingValueType type, string value)
    {
        // ⚠️ 空字串一律視為「尚未設定」放行，不論宣告的型別是什麼——種子資料裡
        // 有好幾個鍵預設就是空字串（docs/08 §G-1 的 handoffLineUrl、tracking.ga4 等）。
        if (value.Length == 0) return;

        switch (type)
        {
            case SettingValueType.Boolean when !bool.TryParse(value, out _):
                throw AppException.BadRequest(ErrorCodes.ValidationFormat, $"{key} 必須是 true 或 false。");
            case SettingValueType.Number when !double.TryParse(value, out _):
                throw AppException.BadRequest(ErrorCodes.ValidationFormat, $"{key} 必須是數字。");
            case SettingValueType.Url when !Uri.TryCreate(value, UriKind.Absolute, out _):
                throw AppException.BadRequest(ErrorCodes.ValidationFormat, $"{key} 必須是合法網址。");
            case SettingValueType.Json:
                try
                {
                    JsonDocument.Parse(value).Dispose();
                }
                catch (JsonException)
                {
                    throw AppException.BadRequest(ErrorCodes.ValidationFormat, $"{key} 必須是合法 JSON。");
                }
                break;
        }
    }

    private static async Task<T> ReadBodyAsync<T>(HttpRequest req) where T : class
    {
        try
        {
            return await req.ReadFromJsonAsync<T>()
                ?? throw AppException.BadRequest(ErrorCodes.ValidationRequired, "缺少請求內容。");
        }
        catch (JsonException)
        {
            throw AppException.BadRequest(ErrorCodes.ValidationFormat, "請求內容格式錯誤，需為合法 JSON。");
        }
    }
}
