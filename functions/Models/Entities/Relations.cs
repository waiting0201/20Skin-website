namespace Skin20.Api.Models.Entities;

// ── D. 內容關聯（1 張表）─────────────────────────────────────────────────
// docs/08-database.md §D。

/// <summary>
/// 內容關聯（docs/08 §D）：一張表取代 12 張 join table。
/// <para>
/// <see cref="FromContentType"/>／<see cref="ToContentType"/> 是冗餘欄位，
/// 存在的唯一理由是<b>把型別正確性交還給資料庫</b>——搭配 <c>ContentItems</c> 上的替代索引鍵
/// <c>UQ_ContentItems_Id_ContentType</c>，以複合外鍵指過去，再用 CHECK 列舉合法組合，
/// 冗餘欄位就不可能與 <c>ContentItems.ContentType</c> 不一致。
/// </para>
/// <para>
/// ⚠️ <see cref="RelationType.TreatmentToConcern"/> 與 <see cref="RelationType.ConcernToTreatment"/>
/// 刻意分開，不要合併：兩者的排序屬於各自的頁面。
/// </para>
/// <para>⚠️ 雙向關聯一律單向存。反向顯示靠 <c>(ToContentItemId, RelationType)</c> 索引查。</para>
/// </summary>
public sealed class ContentRelation
{
    public int Id { get; set; }

    public int FromContentItemId { get; set; }
    public ContentType FromContentType { get; set; }

    public int ToContentItemId { get; set; }
    public ContentType ToContentType { get; set; }

    public RelationType RelationType { get; set; }

    public int SortOrder { get; set; }

    /// <summary>目前唯一用途：困擾頁「建議療程」的推薦理由（<see cref="RelationType.ConcernToTreatment"/>）。</summary>
    public string? Note { get; set; }
}
