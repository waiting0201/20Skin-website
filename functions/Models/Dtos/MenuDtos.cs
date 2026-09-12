using Skin20.Api.Models.Entities;

namespace Skin20.Api.Models.Dtos;

/// <summary>
/// 選單節點，讀取與寫入共用同一個形狀（docs/08 §G-3）。
/// <para>
/// ⚠️ 樹狀結構靠 <see cref="Children"/> 巢狀表示，不靠 <c>ParentId</c> ——
/// 前端新增節點時還沒有資料庫 Id，用巢狀 JSON 才能表達「這個新節點是誰的子節點」。
/// </para>
/// <para><c>Id</c> 在讀取時一定有值；寫入時 <c>null</c> 代表新增。</para>
/// </summary>
public sealed record MenuNodeDto(
    int? Id,
    string Label,
    MenuLinkKind LinkKind,
    int? ContentItemId,
    string? Url,
    string? RelAttr,
    bool OpenInNewTab,
    List<MenuNodeDto> Children,
    /// <summary>
    /// <c>LinkKind=1</c> 時，被指到的那筆內容的型別與標題。
    /// <para>
    /// ⚠️ <b>唯讀，寫入時忽略</b> —— <c>MenuItems</c> 沒有這兩欄，它們是 join 出來的。
    /// 存在的理由是後台選單編輯器要顯示「站內內容：○○療程」，以及知道該去哪個單元
    /// 重新挑一筆；少了它就得為每個節點各打一次 API。
    /// </para>
    /// </summary>
    byte? ContentType = null,
    string? ContentTitle = null);

/// <summary>
/// <c>GET|PUT /admin/menu</c> 的形狀。<see cref="Main"/>／<see cref="Footer"/> 各自獨立，
/// <c>PUT</c> 時省略某一個代表不動該選單（docs/08 §G-3 的 <c>MenuKey</c>：<c>main</c>／<c>footer</c>）。
/// </summary>
public sealed record MenuTreeDto(List<MenuNodeDto>? Main, List<MenuNodeDto>? Footer);
