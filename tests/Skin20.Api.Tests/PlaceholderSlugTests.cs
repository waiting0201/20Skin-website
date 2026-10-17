using Skin20.Api.Common;
using Skin20.Api.Handlers;
using Xunit;

namespace Skin20.Api.Tests;

/// <summary>
/// 會成為網址的單元不收後台新增對話框的暫用 slug（<c>untitled-…</c>）。
/// 2026-10-15 正式站上院方新增的 FAQ 分類沒改暫用值就存檔，
/// <c>/faq/untitled-1792027590012/</c> 就這樣上線、進了 sitemap —— 沒有任何錯誤訊息。
/// </summary>
public class PlaceholderSlugTests
{
    [Fact]
    public void Rejects_placeholder_when_slug_becomes_a_url()
    {
        var ex = Assert.Throws<AppException>(() =>
            ContentHandler.NormalizeAndValidateSlug("untitled-1792027590012", required: true, producesUrl: true));
        Assert.Equal(ErrorCodes.ValidationFormat, ex.Code);
    }

    [Fact]
    public void Rejects_placeholder_regardless_of_case_or_whitespace()
        => Assert.Throws<AppException>(() =>
            ContentHandler.NormalizeAndValidateSlug("  Untitled-123 ", required: true, producesUrl: true));

    [Fact]
    public void Allows_placeholder_for_faq_which_has_no_url()
        => Assert.Equal("untitled-1791285080289",
            ContentHandler.NormalizeAndValidateSlug("untitled-1791285080289", required: true, producesUrl: false));

    [Theory]
    [InlineData("disease")]
    [InlineData("untitled")]          // 只擋暫用值的前綴，不擋剛好叫這個名字的
    [InlineData("my-untitled-page")]
    public void Allows_real_slugs(string slug)
        => Assert.Equal(slug, ContentHandler.NormalizeAndValidateSlug(slug, required: true, producesUrl: true));
}
