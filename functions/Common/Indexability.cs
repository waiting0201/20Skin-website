using System.Text.Json;
using System.Text.Json.Nodes;
using Skin20.Api.Models.Entities;

namespace Skin20.Api.Common;

/// <summary>
/// 「這一筆內容夠不夠實在，值得讓搜尋引擎收錄嗎」。
///
/// <para>
/// 🔴 <b>這段判斷全專案只能有一份。</b> 它同時決定兩件事：
/// 頁面要不要輸出 <c>noindex</c>，以及要不要收進 sitemap。
/// 兩邊各判一次的下場已經發生過 —— 2026-09-15 發現 sitemap 收了 <b>29 個 noindex 的網址</b>
/// （27 個「內容建置中」的療程頁 ＋ 兩個無條文的法務頁），
/// Search Console 會把這個組合直接報成錯誤，也白吃 1108 篇文章的爬取預算。
/// </para>
///
/// <para>
/// ⚠️ 當時的成因是「sitemap 在建置期依資料庫欄位產生、noindex 在算繪時依內容判斷」。
/// <b>把 sitemap 改成執行期並不會自動解決它</b> —— 那只消除了時間差，
/// 判斷仍然在兩個地方。真正的解法是這個檔案：判一次，兩邊都用。
/// </para>
///
/// <para>
/// ⚠️ 這是<b>內容的判斷</b>，不是版面的判斷 —— 「這一頁有沒有實質內容」跟它長什麼樣子無關，
/// 所以它屬於 API，而不是前台。前台只負責讀 <c>indexable</c> 這個欄位。
/// </para>
///
/// <para>
/// ⚠️ 這**不是** <c>IncludeInSitemap</c> 的替代品。那一欄是編輯的明確意願
/// （「這一頁我不想被收錄」），這裡是「內容還沒寫完所以不該被收錄」。
/// 兩個都要成立才收進 sitemap。
/// </para>
/// </summary>
public static class Indexability
{
    /// <summary>
    /// 依內容型別判斷。<paramref name="snapshot"/> 是已核准版本的快照。
    /// </summary>
    public static bool IsIndexable(byte contentType, JsonObject snapshot)
    {
        var fields = snapshot["fields"] as JsonObject;

        return (ContentType)contentType switch
        {
            // 療程：要有簡述**與**「事實一覽」才算寫完。
            // ⚠️ 與前台 `treatments/[category]/[slug].vue` 的 hasFullContent 同一條：
            //    `Boolean(treatment.summary && treatment.facts?.length)`。
            //    28 項裡目前只有 1 項通過 —— 其餘的療程時間／術後照護／禁忌症
            //    舊站一項都沒有，仍待醫師撰寫（CLAUDE.md 關鍵數字）。
            ContentType.Treatment =>
                !string.IsNullOrWhiteSpace(snapshot["summary"]?.GetValue<string>())
                && HasItems(fields?["facts"]),

            // 頁面：內文區塊裡有 `sections` 這個鍵、但它是空的 → 只有骨架。
            // ⚠️ 對應的是法務三頁（服務條款、隱私權、醫療免責聲明）——
            //    條文未提供時前台就只渲染骨架，那種薄內容頁不該吃索引預算。
            // ⚠️ 沒有 `sections` 這個鍵的頁面（品牌理念、長版故事）不受影響。
            ContentType.Page => !HasEmptySections(fields?["bodyBlocks"]),

            _ => true,
        };
    }

    /// <summary>區塊欄位在快照裡是**一個 JSON 字串**（API 存的是 GetRawText()），不是物件。</summary>
    private static JsonNode? ParseBlocks(JsonNode? value)
    {
        if (value is null || value.GetValueKind() == JsonValueKind.Null) return null;
        if (value.GetValueKind() != JsonValueKind.String) return value;

        try { return JsonNode.Parse(value.GetValue<string>()); }
        catch (JsonException) { return null; }
    }

    private static bool HasItems(JsonNode? value)
    {
        var parsed = ParseBlocks(value);
        return parsed is JsonArray array && array.Count > 0;
    }

    private static bool HasEmptySections(JsonNode? bodyBlocks)
    {
        var parsed = ParseBlocks(bodyBlocks);
        if (parsed is not JsonObject obj || !obj.TryGetPropertyValue("sections", out var sections)) return false;
        return sections is not JsonArray array || array.Count == 0;
    }
}
