using Skin20.Api.Handlers;

namespace Skin20.Api.Tests;

/// <summary>
/// 「這一筆內容還在用哪些圖」的掃描（docs/11 §9）。🔴 掃漏了不會有任何錯誤訊息，
/// 症狀是**線上那一版還在渲染的圖被刪掉** —— 而儲存體只有一個，本機測試刪到的就是正式站的檔案
/// （2026-11-12 實際發生）。
/// </summary>
public class BlobReferenceTests
{
    private static List<string> Scan(string json)
    {
        var paths = new List<string>();
        ContentHandler.CollectBlobPathsFromJson(json, paths);
        return paths;
    }

    [Fact]
    public void 巢狀物件裡的圖_掃得到()
        => Assert.Equal(["a.jpg"], Scan("""{"fields":{"cover":{"blobPath":"a.jpg","url":"https://x/a.jpg"}}}"""));

    [Fact]
    public void 快照裡以JSON字串存放的區塊欄位_也要掃得到()
    {
        // 版本快照的 fields.bodyBlocks／mechanismBlocks／mechanism 是 JSON **字串**，不是巢狀物件。
        const string snapshot = """
            {"title":"T","fields":{
              "cover":{"blobPath":"cover.jpg"},
              "mechanismBlocks":"[{\"type\":\"figure\",\"image\":{\"src\":\"https://x/m.jpg\",\"blobPath\":\"m.jpg\"}}]",
              "mechanism":"{\"heading\":\"H\",\"image\":{\"blobPath\":\"old.jpg\",\"url\":\"https://x/old.jpg\"}}"}}
            """;
        Assert.Equal(["cover.jpg", "m.jpg", "old.jpg"], Scan(snapshot).Order());
    }

    [Theory]
    [InlineData("""{"summary":"{這不是 JSON，只是大括號開頭的句子"}""")]
    [InlineData("""{"summary":"[備註] 一般文字"}""")]
    public void 長得像JSON的一般文字_不丟例外也不誤收(string json)
        => Assert.Empty(Scan(json));
}
