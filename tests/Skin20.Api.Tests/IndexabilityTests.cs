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

    // ── 療程：任何一區有內容就收（2026-11-13 放寬，原本要 summary 與 facts 都有）──

    [Theory]
    [InlineData("""{"summary":"簡述","fields":{"facts":[{"label":"時間","value":"30 分鐘"}]}}""")]
    // 區塊欄位在快照裡是「一個 JSON 字串」（API 存 GetRawText()），不是物件。
    [InlineData("""{"summary":"簡述","fields":{"facts":"[{\"label\":\"時間\"}]"}}""")]
    // 沒有摘要也收 —— 正式站 28 筆就是這個形狀：只有適應症與儀器資訊。
    [InlineData("""{"summary":null,"fields":{"indications":"{\"heading\":null,\"items\":[{\"title\":\"x\"}]}"}}""")]
    [InlineData("""{"fields":{"deviceInfo":"[{\"label\":\"許可證\",\"value\":\"x\"}]"}}""")]
    [InlineData("""{"summary":"","fields":{"facts":[{"label":"x"}]}}""")]
    [InlineData("""{"fields":{"steps":[{"num":1}]}}""")]
    [InlineData("""{"fields":{"aftercare":[{"when":"當天"}]}}""")]
    [InlineData("""{"fields":{"mechanismBlocks":[{"type":"paragraph","text":"x"}]}}""")]
    [InlineData("""{"fields":{"mechanism":{"heading":"h","paragraphs":["p"]}}}""")]
    [InlineData("""{"fields":{"contraindications":{"items":["孕婦"],"note":null}}}""")]
    public void 療程任何一區有內容_可收錄(string snapshot)
        => Assert.True(Indexability.IsIndexable(T(ContentType.Treatment), Obj(snapshot)));

    [Theory]
    [InlineData("""{"summary":"簡述","fields":{"facts":[]}}""")]               // 只有摘要不算：頁面上仍是「內容建置中」
    [InlineData("""{"summary":"簡述","fields":{"facts":"[]"}}""")]
    [InlineData("""{"summary":"簡述","fields":{}}""")]
    [InlineData("""{"summary":"簡述"}""")]
    [InlineData("""{"summary":"簡述","fields":{"facts":null}}""")]
    [InlineData("""{"summary":"簡述","fields":{"facts":"不是 JSON {"}}""")]
    [InlineData("""{"summary":"簡述","fields":{"facts":"{\"a\":1}"}}""")]       // 物件不是陣列
    [InlineData("""{"fields":{"indications":"{\"heading\":\"h\",\"items\":[]}"}}""")]   // 只有標題、沒有項目
    [InlineData("""{"fields":{"mechanism":{"heading":"h","paragraphs":[]}}}""")]
    [InlineData("""{"fields":{"images":[{"caption":"x"}],"nameEn":"X"}}""")]    // 圖庫與名稱不算療程說明
    public void 療程每一區都是空的_不收錄(string snapshot)
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
