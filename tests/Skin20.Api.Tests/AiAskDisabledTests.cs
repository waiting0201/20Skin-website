using Microsoft.AspNetCore.Http;
using Skin20.Api.Common;
using Skin20.Api.Handlers;
using Skin20.Api.Models.Dtos;
using Skin20.Api.Services.Dapper;

namespace Skin20.Api.Tests;

/// <summary>
/// <c>POST /ai/ask</c> 的總開關（<c>aifaq.enabled</c>）。
/// 🔴 關閉時要在<b>任何</b>其他依賴被碰到之前就回 503：其餘依賴全部傳 null，
/// 一旦順序被調換（先驗 reCAPTCHA、先扣配額、先呼叫 Gemini），這裡會變成 NullReferenceException。
/// </summary>
public class AiAskDisabledTests
{
    private sealed class FakeSettings(string? value) : ISiteSettingReadService
    {
        public Task<string?> GetValueAsync(string settingKey, CancellationToken ct = default)
            => Task.FromResult(settingKey == "aifaq.enabled" ? value : null);
        public Task<PublicSiteSettingsDto> GetPublicAsync(CancellationToken ct = default) => throw new NotSupportedException();
        public Task<IReadOnlyList<SiteSettingAdminItemDto>> GetAllAsync(CancellationToken ct = default) => throw new NotSupportedException();
    }

    private static AiHandler Handler(string? settingValue) => new(
        null!, null!, null!, null!, null!, null!, new FakeSettings(settingValue),
        null!, null!, null!, null!, null!);

    [Theory]
    [InlineData("false")]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("不是布林")]
    public async Task 開關關閉或讀不到_回_503_AI_UNAVAILABLE(string? value)
    {
        var req = new DefaultHttpContext().Request;
        var ex = await Assert.ThrowsAsync<AppException>(() => Handler(value).AskAsync(req));
        Assert.Equal(ErrorCodes.AiUnavailable, ex.Code);
        Assert.Equal(503, ex.StatusCode);
    }
}
