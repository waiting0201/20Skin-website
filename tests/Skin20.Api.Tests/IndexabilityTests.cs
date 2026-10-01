using System.Text.Json.Nodes;
using Skin20.Api.Common;
using Skin20.Api.Models.Entities;

namespace Skin20.Api.Tests;

/// <summary>
/// <see cref="Indexability.IsIndexable"/>：noindex 與 sitemap 共用的唯一判斷（決策 14）。
/// </summary>
public class IndexabilityTests
{
    private static byte T(ContentType t) => (byte)t;
    private static JsonObject Obj(string json) => (JsonObject)JsonNode.Parse(json)!;

    // ── 療程：要有 summary 與 facts ──────────────────────────────────

    [Fact]
    public void 療程有簡述與事實一覽_可收錄()
        => Assert.True(Indexability.IsIndexable(T(ContentType.Treatment),
            Obj("""{"summary":"簡述","fields":{"facts":[{"label":"時間","value":"30 分鐘"}]}}""")));

    [Fact]
    public void 療程的區塊欄位是_JSON_字串_也要能判斷()
        // 區塊欄位在快照裡是「一個 JSON 字串」（API 存 GetRawText()），不是物件。
        => Assert.True(Indexability.IsIndexable(T(ContentType.Treatment),
            Obj("""{"summary":"簡述","fields":{"facts":"[{\"label\":\"時間\"}]"}}""")));

    [Theory]
    [InlineData("""{"summary":"簡述","fields":{"facts":[]}}""")]
    [InlineData("""{"summary":"簡述","fields":{"facts":"[]"}}""")]
    [InlineData("""{"summary":"簡述","fields":{}}""")]
    [InlineData("""{"summary":"簡述"}""")]
    [InlineData("""{"summary":"簡述","fields":{"facts":null}}""")]
    [InlineData("""{"summary":"簡述","fields":{"facts":"不是 JSON {"}}""")]
    [InlineData("""{"summary":"簡述","fields":{"facts":"{\"a\":1}"}}""")]       // 物件不是陣列
    [InlineData("""{"summary":"","fields":{"facts":[{"label":"x"}]}}""")]
    [InlineData("""{"summary":"   ","fields":{"facts":[{"label":"x"}]}}""")]
    [InlineData("""{"fields":{"facts":[{"label":"x"}]}}""")]
    public void 療程缺簡述或缺事實一覽_不收錄(string snapshot)
        => Assert.False(Indexability.IsIndexable(T(ContentType.Treatment), Obj(snapshot)));

    // ── 頁面：sections 存在但為空 → 只有骨架 ─────────────────────────

    [Theory]
    [InlineData("""{"fields":{"bodyBlocks":{"sections":[]}}}""")]
    [InlineData("""{"fields":{"bodyBlocks":"{\"sections\":[]}"}}""")]
    [InlineData("""{"fields":{"bodyBlocks":{"sections":null}}}""")]            // 有這個鍵但不是陣列
    public void 法務頁_sections_為空_不收錄(string snapshot)
        => Assert.False(Indexability.IsIndexable(T(ContentType.Page), Obj(snapshot)));

    [Theory]
    [InlineData("""{"fields":{"bodyBlocks":{"sections":[{"h":"第一條"}]}}}""")]
    [InlineData("""{"fields":{"bodyBlocks":{"pillars":[1,2,3]}}}""")]          // 品牌理念：沒有 sections 這個鍵，不受影響
    [InlineData("""{"fields":{"bodyBlocks":[{"type":"paragraph"}]}}""")]       // 陣列形態
    [InlineData("""{"fields":{}}""")]
    [InlineData("""{}""")]
    [InlineData("""{"fields":{"bodyBlocks":"壞掉的 JSON {"}}""")]             // 解析失敗不應丟例外也不誤殺
    public void 頁面有條文或不是法務形狀_可收錄(string snapshot)
        => Assert.True(Indexability.IsIndexable(T(ContentType.Page), Obj(snapshot)));

    // ── 其他型別預設可收錄 ───────────────────────────────────────────

    [Theory]
    [InlineData(ContentType.Doctor)]
    [InlineData(ContentType.Concern)]
    [InlineData(ContentType.Article)]
    [InlineData(ContentType.Case)]
    [InlineData(ContentType.Faq)]
    [InlineData(ContentType.Clinic)]
    [InlineData(ContentType.Term)]
    public void 其他內容型別預設可收錄(ContentType type)
        => Assert.True(Indexability.IsIndexable(T(type), Obj("""{"title":"x"}""")));

    // ── SEO 的 noIndex：編輯的明確意願優先 ───────────────────────────

    [Theory]
    [InlineData(ContentType.Article)]
    [InlineData(ContentType.Doctor)]
    [InlineData(ContentType.Treatment)]
    [InlineData(ContentType.Page)]
    public void SEO_noIndex_勾起來_一律不收錄_不管內容多完整(ContentType type)
    {
        var snapshot = Obj("""
            {"summary":"簡述","seo":{"noIndex":true},
             "fields":{"facts":[{"label":"x"}],"bodyBlocks":{"sections":[{"h":"x"}]}}}
            """);
        Assert.False(Indexability.IsIndexable(T(type), snapshot));
    }

    [Theory]
    [InlineData("""{"seo":{"noIndex":false}}""")]
    [InlineData("""{"seo":{}}""")]
    [InlineData("""{"seo":null}""")]
    [InlineData("""{"seo":{"noIndex":"true"}}""")]   // 字串 "true" 不是 JSON true —— 目前行為：不當作 noindex
    [InlineData("""{"seo":{"noIndex":1}}""")]
    public void SEO_noIndex_沒有明確為_true_不影響判斷(string snapshot)
        => Assert.True(Indexability.IsIndexable(T(ContentType.Article), Obj(snapshot)));

    [Fact]
    public void 未知的內容型別值_回預設可收錄_不丟例外()
        => Assert.True(Indexability.IsIndexable(99, Obj("""{}""")));
}
