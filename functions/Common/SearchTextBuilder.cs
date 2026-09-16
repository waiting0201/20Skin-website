using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Skin20.Api.Common;

/// <summary>
/// 把一份**已核准的版本快照**壓成一行可比對的純文字，存進 <c>ContentItems.SearchText</c>。
///
/// <para>
/// 🔴 <b>為什麼需要這一欄（2026-09-16，正式環境實測逼出來的）</b>：
/// 站內搜尋原本直接對 <c>ContentVersions.Snapshot</c>（NVARCHAR(MAX)）做 <c>LIKE</c>。
/// 本機 SQL Server 跑 1.2 秒，**正式的 Azure SQL Basic（5 DTU）跑 23–24 秒** ——
/// 而前台的取值逾時是 8 秒，所以搜尋在正式環境等於完全不能用。
/// </para>
///
/// <para>
/// 慢的不是資料量本身（讀完全站 1163 列的快照只要 1.5 秒），是**比對**：
/// 快照是用 <c>JsonSerializerDefaults.Web</c> 存的，中文一律變成 <c>\uXXXX</c> ——
/// 一個字六個字元，掃描量先膨脹約六倍；而為了同時比對「原樣」與「被轉義」兩種形式，
/// 每次查詢還要跑**兩個** <c>LIKE</c>。兩者相乘就是那 24 秒。
/// </para>
///
/// <para>
/// 這一欄把兩件事一起解決：存的是<b>純文字</b>（中文就是中文，不轉義、沒有 JSON 結構、
/// 沒有 HTML 標記），所以掃描量大減，而且**只需要一個 <c>LIKE</c>**。
/// </para>
///
/// <para>
/// ⚠️ <b>它是衍生資料，不是真相。</b> 真相仍是已核准的版本快照 ——
/// 這一欄只在發布（<c>PublishedVersionId</c> 改變）時由快照重算。
/// 直接編輯它沒有意義，下一次發布就被蓋掉。
/// </para>
/// </summary>
public static class SearchTextBuilder
{
    /// <summary>
    /// 每一筆存多長。
    ///
    /// <para>
    /// ⚠️ <b>這是「搜得到多少」與「搜多久」的取捨，不是隨便挑的數字。</b>
    /// 超過這個長度的內文搜不到。對照組：舊的建置期索引只存 <b>600</b> 字，
    /// 所以 4000 字仍是它的 6.7 倍。
    /// </para>
    /// <para>
    /// ⚠️ 上限存在的理由是**掃描量有上界**：1228 筆 × 4000 字 ≈ 9.8 MB 是最壞情況。
    /// 文章平均內文約 7600 字（8.4 MB / 1100 篇），所以這個上限確實會截到長文的尾巴。
    /// 要放寬就是拿搜尋延遲去換，改之前請先對**正式環境**量過。
    /// </para>
    /// </summary>
    public const int MaxLength = 4000;

    /// <summary>
    /// 由快照 JSON 產生比對用文字：標題 ＋ 摘要 ＋ 攤平後的欄位內容。
    /// <para>⚠️ 快照解析失敗時回空字串，不要讓一筆壞資料把整個發布擋下來。</para>
    /// </summary>
    public static string Build(string? snapshotJson)
    {
        if (string.IsNullOrWhiteSpace(snapshotJson)) return "";

        JsonNode? root;
        try { root = JsonNode.Parse(snapshotJson); }
        catch (System.Text.Json.JsonException) { return ""; }
        if (root is null) return "";

        var title = root["title"]?.GetValue<string>() ?? "";
        var summary = root["summary"]?.GetValue<string>() ?? "";
        var body = Flatten(root["fields"]);

        var text = Collapse($"{title} {summary} {body}");
        return text.Length <= MaxLength ? text : text[..MaxLength];
    }

    /// <summary>
    /// 區塊 JSON 或純文字都可能，統一攤成一串文字。
    /// <para>⚠️ 跳過圖片欄位 —— blobPath 與網址進來只會變成一串沒有人會搜的亂碼。</para>
    /// </summary>
    public static string Flatten(JsonNode? value, int depth = 0)
    {
        if (depth > 6 || value is null) return "";

        switch (value)
        {
            case JsonValue v:
                // 區塊欄位在快照裡是**一個 JSON 字串**（API 存的是 GetRawText()），
                // 所以字串也可能是巢狀 JSON，要再試著解析一次。
                var text = v.GetValueKind() == System.Text.Json.JsonValueKind.String ? v.GetValue<string>() : v.ToString();
                if (depth < 6 && (text.StartsWith('[') || text.StartsWith('{')))
                {
                    try { return Flatten(JsonNode.Parse(text), depth + 1); }
                    catch (System.Text.Json.JsonException) { /* 就是一般字串 */ }
                }
                return text;

            case JsonArray array:
                return string.Join(' ', array.Select(x => Flatten(x, depth + 1)));

            case JsonObject obj:
                if (obj.ContainsKey("blobPath") && obj.ContainsKey("url"))
                    return obj["alt"]?.GetValue<string>() ?? "";
                return string.Join(' ', obj.Select(kv => Flatten(kv.Value, depth + 1)));

            default:
                return "";
        }
    }

    /// <summary>去掉 HTML 標記與多餘空白。</summary>
    public static string Collapse(string text) =>
        Regex.Replace(Regex.Replace(text, "<[^>]*>", " "), @"\s+", " ").Trim();
}
