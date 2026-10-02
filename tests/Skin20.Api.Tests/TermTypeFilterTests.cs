using Skin20.Api.Handlers;
using Xunit;

namespace Skin20.Api.Tests;

/// <summary>
/// <c>GET /term?termType=</c> 的參數解析（2026-10-02）。
/// 前台靠它只載分類、不載 393 筆標籤 —— 解析錯了不會有錯誤訊息，
/// 症狀是 payload 又變回整包，或分類查不到而整區靜默消失。
/// </summary>
public class TermTypeFilterTests
{
    [Theory]
    [InlineData("1,2,3", new[] { 1, 2, 3 })]
    [InlineData(" 1 , 3 ", new[] { 1, 3 })]
    [InlineData("4", new[] { 4 })]
    [InlineData("1,1,2", new[] { 1, 2 })]
    [InlineData("1,abc,0,-2,999,3", new[] { 1, 3 })]
    public void Parses_valid_values_only(string raw, int[] expected)
        => Assert.Equal(expected.OrderBy(x => x), PublicContentHandler.ParseTermTypes(raw).OrderBy(x => x));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("abc,0")]
    public void Empty_means_no_filter(string? raw)
        => Assert.Empty(PublicContentHandler.ParseTermTypes(raw));
}
