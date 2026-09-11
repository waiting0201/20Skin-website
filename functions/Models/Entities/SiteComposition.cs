namespace Skin20.Api.Models.Entities;

// ── G. 站台編排（4 張表）─────────────────────────────────────────────────
// docs/08-database.md §G。

/// <summary>
/// 全站設定（docs/08 §G-1），key-value。
/// <para>
/// 這組設定會持續增加（AI FAQ 那四項就是後加的），固定欄位每加一項要一次 migration，
/// 而沒有 staging，每次遷移都必須向後相容——設定類不值得付這個代價。
/// </para>
/// <para>
/// ⚠️ AI FAQ 的啟用開關必須是資料，不能是建置期常數：前台是 Nuxt 純靜態，
/// 開關要由瀏覽器在執行期打 <c>api.20skin.tw</c> 的公開設定端點讀取，不能烘進預渲染的 HTML。
/// </para>
/// </summary>
public sealed class SiteSetting
{
    /// <summary>PK。</summary>
    public string SettingKey { get; set; } = string.Empty;

    public string SettingValue { get; set; } = string.Empty;
    public SettingValueType ValueType { get; set; }

    public int? UpdatedByUserId { get; set; }
    public DateTime UpdatedAt { get; set; }

    public User? UpdatedByUser { get; set; }
}

/// <summary>
/// 首頁版位（docs/08 §G-2）。
/// <para>
/// 七個版位為種子資料，可停用、可排序，<b>不可新增刪除</b>——否則首頁又會慢慢變回自由編輯頁：
/// <c>hero</c>／<c>specialties</c>／<c>featured-treatments</c>／<c>latest-articles</c>／
/// <c>doctors</c>／<c>clinics</c>／<c>brand-story</c>。
/// </para>
/// <para>
/// 唯一例外是 <c>hero</c> 的主視覺與外部導流 CTA（沒有對應的站內內容），放在
/// <see cref="Settings"/> 的 JSON 裡。
/// </para>
/// <para>版位編排的送審與版本歷程掛在 <c>SystemKey='home'</c> 那筆 <see cref="Page"/> 上（docs/08 §C-8）。</para>
/// </summary>
public sealed class HomeSection
{
    public int Id { get; set; }
    public string SectionKey { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string? Subtitle { get; set; }
    public bool IsEnabled { get; set; } = true;
    public int SortOrder { get; set; }

    /// <summary><c>hero</c> 的主視覺與外部導流 CTA 等沒有對應站內內容的設定，JSON。</summary>
    public string? Settings { get; set; }

    public ICollection<HomeSectionItem> Items { get; set; } = [];
}

/// <summary>
/// 首頁版位項目（docs/08 §G-2）。
/// <para>
/// 🔴 <b>這張表只有 <see cref="ContentItemId"/>，沒有任何 <c>Title</c> 或 <c>Text</c> 欄位，
/// 是刻意的。</b>「每個版位只能挑選已存在的內容，不能另打一份文案」——舊站 <c>index2.php</c>
/// 的病根就是首頁自成一份資料、與內頁長期不同步。<b>在 schema 裡不給文案欄位，
/// 這件事就不可能再發生。</b>
/// </para>
/// </summary>
public sealed class HomeSectionItem
{
    public int Id { get; set; }
    public int HomeSectionId { get; set; }
    public int ContentItemId { get; set; }
    public int SortOrder { get; set; }

    public HomeSection HomeSection { get; set; } = null!;
    public ContentItem ContentItem { get; set; } = null!;
}

/// <summary>
/// 導覽選單與頁尾（docs/08 §G-3）。
/// <para>
/// ⚠️ <c>booking.20skin.tw</c> 與 <c>20skinshop.com</c> 在整個 schema 的唯一落點就是本表的
/// 兩筆 <see cref="MenuLinkKind.ExternalUrl"/> ＋ <see cref="IsExternal"/> 記錄。
/// 它們<b>不進內容表、不進 sitemap、不進 301 對照表</b>（CLAUDE.md 決策 4）。
/// </para>
/// </summary>
public sealed class MenuItem
{
    public int Id { get; set; }

    /// <summary><c>main</c>／<c>footer</c>。</summary>
    public string MenuKey { get; set; } = string.Empty;

    public int? ParentId { get; set; }

    /// <summary>最多兩層，<c>CHECK (Depth IN (1, 2))</c>。純靠 <see cref="ParentId"/> 無法在 SQL 表達深度上限。</summary>
    public byte Depth { get; set; }

    public string Label { get; set; } = string.Empty;
    public MenuLinkKind LinkKind { get; set; }
    public int? ContentItemId { get; set; }
    public string? Url { get; set; }
    public bool IsExternal { get; set; }
    public string? RelAttr { get; set; }
    public bool OpenInNewTab { get; set; }
    public int SortOrder { get; set; }

    public MenuItem? Parent { get; set; }
    public ICollection<MenuItem> Children { get; set; } = [];
    public ContentItem? ContentItem { get; set; }
}
