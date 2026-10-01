using System.Text.Json.Nodes;
using Skin20.Api.Common;

namespace Skin20.Api.Tests;

/// <summary>站內搜尋用的純文字衍生欄位（<c>ContentItems.SearchText</c>）。</summary>
public class SearchTextBuilderTests
{
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("不是 JSON {")]
    [InlineData("null")]
    public void 空的或壞掉的快照回空字串_不丟例外(string? snapshot)
        // 一筆壞資料不能把整個發布擋下來。
        => Assert.Equal("", SearchTextBuilder.Build(snapshot));

    [Fact]
    public void 標題_摘要_欄位內容依序串起來()
    {
        var text = SearchTextBuilder.Build("""{"title":"皮秒雷射","summary":"淡斑","fields":{"a":"第一段","b":["第二段","第三段"]}}""");
        Assert.Equal("皮秒雷射 淡斑 第一段 第二段 第三段", text);
    }

    [Fact]
    public void 中文不轉義_HTML_標記被拿掉_空白被收斂()
    {
        var text = SearchTextBuilder.Build("""{"title":"A","fields":{"x":"<p>光  子\n嫩膚</p>"}}""");
        Assert.Equal("A 光 子 嫩膚", text);
    }

    [Fact]
    public void 巢狀_JSON_字串會被再解析一次()
    {
        // 區塊欄位在快照裡是一個 JSON 字串。
        var text = SearchTextBuilder.Build("""{"title":"T","fields":{"blocks":"[{\"text\":\"藏在字串裡\"}]"}}""");
        Assert.Contains("藏在字串裡", text);
        Assert.DoesNotContain("\"text\"", text);
    }

    [Fact]
    public void 圖片節點只取說明文字_不取網址與_blobPath()
    {
        var text = SearchTextBuilder.Build("""
            {"title":"T","fields":{"cover":{"url":"https://x/y.jpg","blobPath":"media/2026/a.jpg","alt":"診所外觀"}}}
            """);
        Assert.Contains("診所外觀", text);
        Assert.DoesNotContain("blobPath", text);
        Assert.DoesNotContain("https://x", text);
        Assert.DoesNotContain("media/2026", text);
    }

    [Fact]
    public void 超過上限的內容被截斷在_MaxLength()
    {
        var body = new string('字', SearchTextBuilder.MaxLength * 2);
        var text = SearchTextBuilder.Build($$$"""{"title":"T","fields":{"x":"{{{body}}}"}}""");
        Assert.Equal(SearchTextBuilder.MaxLength, text.Length);
    }

    [Fact]
    public void 恰好等於上限不截斷()
    {
        // "T " 佔 2 個字元。
        var body = new string('字', SearchTextBuilder.MaxLength - 2);
        var text = SearchTextBuilder.Build($$$"""{"title":"T","fields":{"x":"{{{body}}}"}}""");
        Assert.Equal(SearchTextBuilder.MaxLength, text.Length);
        Assert.EndsWith("字", text);
    }

    [Fact]
    public void Flatten_遞迴深度有上限_不會無窮展開()
    {
        // 每一層都是「字串裡包下一層的 JSON」。
        JsonNode node = JsonValue.Create("終點")!;
        for (var i = 0; i < 20; i++) node = JsonValue.Create(new JsonObject { ["k"] = node }.ToJsonString())!;
        var ex = Record.Exception(() => SearchTextBuilder.Flatten(node));
        Assert.Null(ex);
    }

    [Fact]
    public void Flatten_數字與布林也會變成文字()
        => Assert.Equal("12 true", SearchTextBuilder.Flatten(new JsonArray(12, true)));
}
