using System.Text.Json;
using Skin20.Api.Common;

namespace Skin20.Api.Tests;

/// <summary>AI 索引的 manifest 格式。🔴 它存在 Blob 上，新程式一定會讀到舊程式寫的那一份。</summary>
public class AiIndexFormatTests
{
    [Fact]
    public void 舊版兩欄的_manifest_視為切塊版本_1()
    {
        var manifest = JsonSerializer.Deserialize<AiIndexFormat.Manifest>(
            """{"builtAt":"2026-10-01T00:00:00Z","model":"m","dim":768,"count":3,"includeMainSiteArticles":true,"items":[[1001,10231],[1002,10225,2]]}""",
            AiIndexFormat.Json)!;

        var map = manifest.AsMap();
        Assert.Equal((10231, 1), map[1001]);
        Assert.Equal((10225, 2), map[1002]);
    }

    [Fact]
    public void 切塊版本從_1_起跳_舊索引一定會被重切()
        => Assert.True(AiChunker.Version > 1);

    // ── 標題關鍵字加分（2026-10-02：只打「青萃光」差 0.001 沒過門檻）────────────

    private static AiIndexFormat.Chunk C(int ci, string title) => new(ci, 1, 7, $"/{ci}/", title, "", 1.0, true, "x");

    /// <summary>每一塊的向量都與查詢向量相同（餘弦 = 1 × scale），只讓關鍵字決定差異。</summary>
    private static List<AiIndexFormat.Ranked> RankAll(string question, params AiIndexFormat.Chunk[] chunks)
    {
        var query = new[] { 0.6f, 0.0f };
        var vectors = chunks.SelectMany(_ => query).ToArray();
        return AiIndexFormat.Rank(query, question, chunks, vectors, 2, topK: chunks.Length, perItem: 9);
    }

    private static AiIndexFormat.Ranked Of(List<AiIndexFormat.Ranked> ranked, IReadOnlyList<AiIndexFormat.Chunk> chunks, int ci)
        => ranked.Single(r => chunks[r.Index].Ci == ci);

    [Fact]
    public void 問句含標題的專有名詞_加分()
    {
        AiIndexFormat.Chunk[] chunks = [C(1, "青萃光DermaV 是什麼？"), C(2, "蜂巢皮秒雷射")];
        var ranked = RankAll("青萃光", chunks);

        Assert.True(Of(ranked, chunks, 1).Lexical);
        Assert.Equal(Of(ranked, chunks, 1).RawScore + AiIndexFormat.LexicalBonus, Of(ranked, chunks, 1).MatchScore, 5);
        Assert.False(Of(ranked, chunks, 2).Lexical);
    }

    [Fact]
    public void 全形與空白不影響比對()
    {
        AiIndexFormat.Chunk[] chunks = [C(1, "青萃光DermaV 是什麼？")];
        Assert.True(Of(RankAll("ｄｅｒｍａ ｖ", chunks), chunks, 1).Lexical);
    }

    [Fact]
    public void 全是虛詞的片段不加分()
    {
        // 「是什麼」出現在很多標題裡，但它不是關鍵字 —— 少了這條，所有「○○是什麼」的文章都會被加分。
        AiIndexFormat.Chunk[] chunks = [C(1, "皮秒是什麼？"), C(2, "電波是什麼？")];
        var ranked = RankAll("矽谷電波是什麼？", chunks);
        Assert.False(Of(ranked, chunks, 1).Lexical);
    }

    [Fact]
    public void 太多標題都有的字串不加分()
    {
        var chunks = Enumerable.Range(1, 31).Select(i => C(i, $"皮秒雷射第{i}篇")).ToArray();
        Assert.All(RankAll("皮秒雷射", chunks), r => Assert.False(r.Lexical));
    }
}
