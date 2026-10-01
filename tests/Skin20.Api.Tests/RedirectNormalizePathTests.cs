using Skin20.Api.Handlers;

namespace Skin20.Api.Tests;

/// <summary>
/// 301 舊路徑的正規化（docs/08 §H）。🔴 後台存規則時與前台 catch-all 查詢時必須跑同一套，
/// 否則症狀是「後台看得到規則、線上不轉址」。
/// </summary>
public class RedirectNormalizePathTests
{
    [Theory]
    [InlineData("/Share.php", "/share.php")]
    [InlineData("share.php", "/share.php")]                      // 補開頭斜線
    [InlineData("  /About/  ", "/about/")]                       // 去頭尾空白，保留尾斜線
    [InlineData("/", "/")]
    [InlineData("", "/")]
    [InlineData("/醫美新知/ABC", "/醫美新知/abc")]               // 只動 ASCII，中文不變
    public void 路徑轉小寫並確保開頭斜線(string raw, string expected)
        => Assert.Equal(expected, RedirectHandler.NormalizePath(raw));

    [Fact]
    public void Query_依整串鍵值序數排序()
        => Assert.Equal("/share.php?class=x&year=2024",
            RedirectHandler.NormalizePath("/share.php?year=2024&class=x"));

    [Fact]
    public void 兩種參數順序正規化後相同()
        => Assert.Equal(
            RedirectHandler.NormalizePath("/Share.php?year=2024&class=%E9%86%AB"),
            RedirectHandler.NormalizePath("/share.php?class=%E9%86%AB&year=2024"));

    [Fact]
    public void Query_的值不轉小寫()
        // 只有 path 轉小寫；query 的鍵值大小寫有意義（class=ABC 與 class=abc 是不同規則）。
        => Assert.Equal("/a.php?id=AbC", RedirectHandler.NormalizePath("/A.php?id=AbC"));

    [Fact]
    public void Query_序數排序_大寫排在小寫前()
        => Assert.Equal("/a?B=1&a=1", RedirectHandler.NormalizePath("/a?a=1&B=1"));

    [Theory]
    [InlineData("/a?", "/a")]
    [InlineData("/a?&&", "/a")]
    [InlineData("/a?  &  ", "/a")]
    public void 空的_query_被丟掉(string raw, string expected)
        => Assert.Equal(expected, RedirectHandler.NormalizePath(raw));

    [Fact]
    public void 重複與多餘的_ampersand_被收斂()
        => Assert.Equal("/a?x=1&y=2", RedirectHandler.NormalizePath("/a?&y=2&&x=1&"));

    [Theory]
    [InlineData("/Share.php?year=2024&class=x")]
    [InlineData("a/B?z=1&a=2")]
    [InlineData("/")]
    public void 冪等_再正規化一次結果不變(string raw)
    {
        var once = RedirectHandler.NormalizePath(raw);
        Assert.Equal(once, RedirectHandler.NormalizePath(once));
    }
}
