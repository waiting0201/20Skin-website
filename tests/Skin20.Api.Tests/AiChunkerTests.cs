using Skin20.Api.Common;
using Skin20.Api.Models.Entities;
using static Skin20.Api.Common.AiChunker;

namespace Skin20.Api.Tests;

/// <summary>
/// AI 語料切塊（決策 28）。🔴 切壞了不會有任何錯誤訊息，症狀是「AI 答非所問」，
/// 所以這些測試鎖的都是「語意上錯了也看不出來」的規則。
/// </summary>
public class AiChunkerTests
{
    private static AiChunkSource Src(ContentType type, string json, string? url = "/x/")
        => new(1, 10, (byte)type, url, json);

    private static IReadOnlyList<AiChunk> Chunk(ContentType type, string json, string? url = "/x/")
        => AiChunker.Build(Src(type, json, url));

    // ── 不進索引 ─────────────────────────────────────────────────────

    [Fact]
    public void 沒有網址_不進索引()
        => Assert.Empty(Chunk(ContentType.Article, """{"title":"T","summary":"有內容"}""", url: null));

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void 網址空白_不進索引(string url)
        => Assert.Empty(Chunk(ContentType.Article, """{"title":"T","summary":"有內容"}""", url));

    [Theory]
    [InlineData("不是 JSON {")]
    [InlineData("[1,2]")]       // 不是物件
    [InlineData("null")]
    public void 快照壞掉或不是物件_回空陣列_不丟例外(string json)
        => Assert.Empty(Chunk(ContentType.Article, json));

    [Fact]
    public void 沿用_Indexability_的判斷_骨架療程不進索引()
    {
        // 決策 14：「值不值得被索引」全專案只有一份。
        Assert.Empty(Chunk(ContentType.Treatment,
            """{"title":"皮秒","summary":"簡述","fields":{"facts":[]}}"""));
    }

    [Fact]
    public void SEO_noIndex_的內容不進索引()
        => Assert.Empty(Chunk(ContentType.Article, """{"title":"T","summary":"有內容","seo":{"noIndex":true}}"""));

    [Theory]
    [InlineData("search")]
    [InlineData("not-found")]
    public void 搜尋頁與_404_不進語料(string systemKey)
        => Assert.Empty(Chunk(ContentType.Page,
            $$$"""{"title":"T","summary":"有內容","fields":{"systemKey":"{{{systemKey}}}"}}"""));

    [Fact]
    public void 標籤型的分類不進語料_內容單薄只會稀釋()
        => Assert.Empty(Chunk(ContentType.Term,
            """{"title":"標籤","fields":{"termType":4,"intro":"一句話"}}"""));

    [Fact]
    public void 非標籤的分類會進語料()
        => Assert.NotEmpty(Chunk(ContentType.Term,
            """{"title":"保養","fields":{"termType":1,"intro":"保養分類介紹"}}"""));

    [Fact]
    public void 沒有任何可切的文字_回空陣列()
        => Assert.Empty(Chunk(ContentType.Article, """{"title":"T","summary":"","fields":{}}"""));

    // ── 主站舊文：降權且不可引用 ─────────────────────────────────────

    [Fact]
    public void 主站舊文_降權為_0_75_且不可引用()
    {
        var chunks = Chunk(ContentType.Article,
            """{"title":"T","summary":"社群貼文","fields":{"sourceSite":1}}""");
        var c = Assert.Single(chunks);
        Assert.Equal(0.75, c.Weight);
        Assert.False(c.Citable);
    }

    [Theory]
    [InlineData(2)]      // blog 站
    [InlineData(null)]
    public void 非主站舊文的文章_權重_1_且可引用(int? sourceSite)
    {
        var fieldsJson = sourceSite is null ? "{}" : $$$"""{"sourceSite":{{{sourceSite}}}}""";
        var c = Assert.Single(Chunk(ContentType.Article, $$$"""{"title":"T","summary":"衛教","fields":{{{fieldsJson}}}}"""));
        Assert.Equal(1.0, c.Weight);
        Assert.True(c.Citable);
    }

    [Fact]
    public void sourceSite_為_1_但不是文章_不降權()
    {
        // 降權只針對「文章」。
        var c = Assert.Single(Chunk(ContentType.Concern,
            """{"title":"T","summary":"簡述","fields":{"sourceSite":1}}"""));
        Assert.True(c.Citable);
        Assert.Equal(1.0, c.Weight);
    }

    // ── 文章內文：每個 heading 開新段 ────────────────────────────────

    [Fact]
    public void 文章的_heading_成為塊的標題_圖片只取說明文字()
    {
        var long1 = new string('甲', 400);
        var long2 = new string('乙', 400);
        var json = $$$"""
            {"title":"T","fields":{"bodyBlocks":[
              {"type":"heading","text":"什麼是皮秒？"},
              {"type":"paragraph","text":"{{{long1}}}"},
              {"type":"figure","caption":"示意圖","image":{"src":"https://x/a.jpg"}},
              {"type":"heading","text":"術後怎麼照護？"},
              {"type":"paragraph","text":"{{{long2}}}"}
            ]}}
            """;
        var chunks = Chunk(ContentType.Article, json);

        Assert.Equal(["什麼是皮秒？", "術後怎麼照護？"], chunks.Select(c => c.Heading));
        Assert.Contains("示意圖", chunks[0].Text);
        Assert.DoesNotContain(chunks, c => c.Text.Contains("https://x/a.jpg", StringComparison.Ordinal));
    }

    [Fact]
    public void 麵包屑只進嵌入輸入_不併進內文()
    {
        var c = Assert.Single(Chunk(ContentType.Article, """{"title":"皮秒","summary":"內文"}"""));
        Assert.Equal("內文", c.Text);
        Assert.Equal("【文章】皮秒", c.Breadcrumb);
        Assert.Equal("【文章】皮秒\n內文", c.EmbeddingInput);
    }

    [Fact]
    public void 有標題的塊_麵包屑帶標題()
    {
        var c = new AiChunk(1, 1, (byte)ContentType.Article, "/x/", "T", "H", 1, true, "內文");
        Assert.Equal("【文章】T — H", c.Breadcrumb);
    }

    // ── 打包：硬上限與合併 ───────────────────────────────────────────

    [Fact]
    public void 超長段落依句切開_每塊不超過硬上限_且相鄰塊重疊一句()
    {
        var sentence = new string('句', 98) + "。";               // 99 字
        var text = string.Concat(Enumerable.Repeat(sentence, 30)); // 2970 字
        var chunks = Chunk(ContentType.Article, $$$"""{"title":"T","summary":"{{{text}}}"}""");

        Assert.True(chunks.Count > 1);
        Assert.All(chunks, c => Assert.True(c.Text.Length <= 900, $"塊長 {c.Text.Length} 超過硬上限"));
        Assert.All(chunks, c => Assert.EndsWith("。", c.Text));      // 在句號切，沒有劈半
        // 重疊一句：後一塊的開頭是前一塊的最後一句。
        Assert.StartsWith(sentence, chunks[1].Text);
    }

    [Fact]
    public void 沒有標點的超長文字_退回硬切_仍不超過硬上限()
    {
        var chunks = Chunk(ContentType.Article, $$$"""{"title":"T","summary":"{{{new string('字', 2500)}}}"}""");
        Assert.All(chunks, c => Assert.True(c.Text.Length <= 900));
        Assert.Equal(2500, chunks.Sum(c => c.Text.Length));
    }

    [Fact]
    public void 太短的相鄰段落會被合併_併進來的標題寫進內文()
    {
        var json = """
            {"title":"T","fields":{"bodyBlocks":[
              {"type":"heading","text":"A"},{"type":"paragraph","text":"第一段"},
              {"type":"heading","text":"B"},{"type":"paragraph","text":"第二段"}
            ]}}
            """;
        var c = Assert.Single(Chunk(ContentType.Article, json));
        Assert.Equal("A", c.Heading);
        Assert.Contains("第一段", c.Text);
        Assert.Contains("B：第二段", c.Text);
    }

    // ── FAQ ──────────────────────────────────────────────────────────

    [Fact]
    public void FAQ_AI_摘要版加成_且不與網頁版合併()
    {
        var chunks = Chunk(ContentType.Faq, """
            {"title":"皮秒會痛嗎？","fields":{"aiAnswer":"輕微刺痛。","webAnswer":"網頁版較長的答案。"}}
            """);
        Assert.Equal(2, chunks.Count);
        Assert.Equal(1.15, chunks[0].Weight);
        Assert.Equal("輕微刺痛。", chunks[0].Text);
        Assert.Equal(1.0, chunks[1].Weight);
        Assert.All(chunks, c => Assert.Equal("皮秒會痛嗎？", c.Heading));
    }

    [Fact]
    public void FAQ_兩版答案相同_只留一塊()
    {
        var chunks = Chunk(ContentType.Faq,
            """{"title":"Q？","fields":{"aiAnswer":"同一句","webAnswer":"同一句"}}""");
        Assert.Single(chunks);
    }

    [Fact]
    public void 療程專屬_FAQ_標題換成療程名稱_問題留在小標()
    {
        var chunks = AiChunker.Build(new AiChunkSource(1, 10, (byte)ContentType.Faq, "/treatments/pico/",
            """{"title":"懷孕可以做嗎？","fields":{"webAnswer":"不建議進行本療程。"}}""", "蜂巢皮秒"));
        var chunk = Assert.Single(chunks);
        Assert.Equal("蜂巢皮秒", chunk.Title);
        Assert.Equal("懷孕可以做嗎？", chunk.Heading);
        Assert.StartsWith("【常見問題】蜂巢皮秒 — 懷孕可以做嗎？", chunk.EmbeddingInput);
    }

    [Fact]
    public void 所屬療程只套在_FAQ_上()
    {
        var chunks = AiChunker.Build(new AiChunkSource(1, 10, (byte)ContentType.Concern, "/x/",
            """{"title":"痘痘","summary":"摘要"}""", "蜂巢皮秒"));
        Assert.All(chunks, c => Assert.Equal("痘痘", c.Title));
    }

    // ── 據點營業時間 ─────────────────────────────────────────────────

    [Fact]
    public void 營業時間合成中文_週日是_0_排在最後()
    {
        var json = """
            {"title":"二林","fields":{"businessHours":[
              {"dayOfWeek":0,"startTime":"09:00:00","endTime":"12:00:00"},
              {"dayOfWeek":1,"startTime":"09:00:00","endTime":"12:00:00"},
              {"dayOfWeek":1,"startTime":"14:00:00","endTime":"21:00:00"}
            ]}}
            """;
        var text = string.Join("\n", Chunk(ContentType.Clinic, json).Select(c => c.Text));

        Assert.Contains("週一 09:00–12:00、14:00–21:00", text);
        Assert.Contains("週日 09:00–12:00", text);
        Assert.True(text.IndexOf("週一", StringComparison.Ordinal) < text.IndexOf("週日", StringComparison.Ordinal));
    }

    [Fact]
    public void 營業時間與地址獨立成塊_加成_開頭寫院區所在地()
    {
        var json = """
            {"title":"四季診所","summary":"以醫學美容為主。","fields":{
              "address":"台中市南屯區公益路二段120號","phone":"04-23103389",
              "businessHours":[{"dayOfWeek":1,"startTime":"09:00:00","endTime":"13:00:00"}],
              "intro":"設有獨立諮詢空間。"}}
            """;
        var chunks = Chunk(ContentType.Clinic, json);
        var facts = Assert.Single(chunks, c => c.Heading == "營業時間與地址");

        Assert.Equal(1.15, facts.Weight);
        Assert.StartsWith("四季診所（台中市南屯區）門診營業時間：週一 09:00–13:00。", facts.Text);
        Assert.Contains("地址：台中市南屯區公益路二段120號。電話：04-23103389。", facts.Text);
        // 簡介與摘要不可以併進來稀釋它
        Assert.DoesNotContain("獨立諮詢空間", facts.Text);
        Assert.DoesNotContain("醫學美容", facts.Text);
    }

    [Fact]
    public void 沒有時段的日子寫成休診_週一起排()
    {
        var days = string.Join(",", new[] { 1, 2, 3, 4, 5 }.Select(d =>
            $$"""{"dayOfWeek":{{d}},"startTime":"09:00:00","endTime":"12:00:00"}"""));
        var json = $$$"""{"title":"X","fields":{"address":"彰化縣二林鎮儒林路","businessHours":[{{{days}}}]}}""";
        var facts = Chunk(ContentType.Clinic, json).Single(c => c.Heading == "營業時間與地址");

        Assert.Contains("X（彰化縣二林鎮）", facts.Text);
        Assert.Contains("週六、週日休診。", facts.Text);
    }

    // ── 醫師：藝術總監不是醫師 ───────────────────────────────────────

    [Fact]
    public void 醫師的空白欄位不輸出()
    {
        var text = Chunk(ContentType.Doctor, """{"title":"X","fields":{"isPhysician":true,"jobTitle":"主治醫師","specialty":""}}""")
            .Single(c => c.Heading == "職稱與專長").Text;
        Assert.Equal("身分：醫師。職稱：主治醫師。", text);
    }

    [Theory]
    [InlineData("true", "身分：醫師")]
    [InlineData("false", "身分：團隊成員")]
    public void 醫師單元依_isPhysician_決定稱謂(string isPhysician, string expected)
    {
        var json = $$$"""{"title":"X","fields":{"isPhysician":{{{isPhysician}}},"jobTitle":"院長","specialty":"皮膚"}}""";
        var text = string.Join("\n", Chunk(ContentType.Doctor, json).Select(c => c.Text));
        Assert.Contains(expected, text);
    }
}
