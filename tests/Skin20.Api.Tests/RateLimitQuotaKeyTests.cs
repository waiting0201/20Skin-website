using Microsoft.Extensions.Configuration;
using Skin20.Api.Services;

namespace Skin20.Api.Tests;

/// <summary>
/// 公開端點配額的設定鍵解析（<see cref="RateLimitService.ResolveQuotaValue"/>）。
/// 🔴 Linux 的 Function App 不允許 app setting 名稱含連字號，所以 <c>ai-ask</c> 的設定
/// 只能用 <c>ai_ask</c> 形式設進去；少了這個解析，正式站會一直落在全域值而沒有任何錯誤。
/// </summary>
public class RateLimitQuotaKeyTests
{
    private static IConfiguration Config(params (string Key, string Value)[] items)
        => new ConfigurationBuilder()
            .AddInMemoryCollection(items.ToDictionary(i => i.Key, i => (string?)i.Value))
            .Build();

    [Fact]
    public void 底線形式的鍵_對應連字號的_bucket()
    {
        var c = Config(("RateLimit:PublicQuota:ai_ask:MaxRequests", "20"));
        Assert.Equal(20, RateLimitService.ResolveQuotaValue(c, "ai-ask", "MaxRequests", 10));
    }

    [Fact]
    public void 環境變數的雙底線寫法_展開後也對得上()
    {
        // App Service 的 `RateLimit__PublicQuota__ai_ask__MaxRequests` 會被轉成冒號分隔。
        Environment.SetEnvironmentVariable("RateLimit__PublicQuota__ai_ask__WindowMinutes", "10");
        try
        {
            var c = new ConfigurationBuilder().AddEnvironmentVariables().Build();
            Assert.Equal(10, RateLimitService.ResolveQuotaValue(c, "ai-ask", "WindowMinutes", 60));
        }
        finally
        {
            Environment.SetEnvironmentVariable("RateLimit__PublicQuota__ai_ask__WindowMinutes", null);
        }
    }

    [Fact]
    public void 只有連字號形式的鍵_仍然有效_本機相容()
    {
        var c = Config(("RateLimit:PublicQuota:ai-ask:MaxRequests", "15"));
        Assert.Equal(15, RateLimitService.ResolveQuotaValue(c, "ai-ask", "MaxRequests", 10));
    }

    [Fact]
    public void 兩種都有_底線優先()
    {
        var c = Config(
            ("RateLimit:PublicQuota:ai_ask:MaxRequests", "20"),
            ("RateLimit:PublicQuota:ai-ask:MaxRequests", "15"));
        Assert.Equal(20, RateLimitService.ResolveQuotaValue(c, "ai-ask", "MaxRequests", 10));
    }

    [Fact]
    public void 都沒有_落回全域預設()
    {
        var c = Config(("RateLimit:PublicQuota:MaxRequests", "10"));
        Assert.Equal(7, RateLimitService.ResolveQuotaValue(c, "ai-ask", "MaxRequests", 7));
    }

    [Fact]
    public void 底線鍵的值不是整數_視同沒設_改看連字號鍵()
    {
        var c = Config(
            ("RateLimit:PublicQuota:ai_ask:MaxRequests", "很多"),
            ("RateLimit:PublicQuota:ai-ask:MaxRequests", "15"));
        Assert.Equal(15, RateLimitService.ResolveQuotaValue(c, "ai-ask", "MaxRequests", 10));
    }

    [Fact]
    public void 沒有連字號的_bucket_兩種形式相同()
    {
        var c = Config(("RateLimit:PublicQuota:contact:MaxRequests", "3"));
        Assert.Equal(3, RateLimitService.ResolveQuotaValue(c, "contact", "MaxRequests", 10));
    }

    [Fact]
    public void questions_miss_也走底線形式()
    {
        var c = Config(("RateLimit:PublicQuota:questions_miss:WindowMinutes", "30"));
        Assert.Equal(30, RateLimitService.ResolveQuotaValue(c, "questions-miss", "WindowMinutes", 10));
    }
}
