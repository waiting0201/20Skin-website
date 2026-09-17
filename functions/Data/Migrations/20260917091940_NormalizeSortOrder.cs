using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Skin20.Api.Data.Migrations
{
    /// <summary>
    /// 把每個內容型別的 <c>ContentItems.SortOrder</c> 正規化成 0..n-1（Tim 指定 2026-09-17：
    /// 分類與標籤、案例的清單要能拖曳排序）。
    ///
    /// <para>
    /// 🔴 <b>為什麼非做不可</b>：正式資料裡 <c>SortOrder</c> 幾乎整批是 <c>0</c>
    /// （醫師 14 筆、困擾 8 筆、分類標籤 406 筆都是 0），清單與前台都是
    /// <c>ORDER BY SortOrder, Id</c>，實際決勝的是 <c>Id</c>。值全都一樣的時候，
    /// 「在這一頁裡把 A 拖到 B 前面」**沒有任何值可以寫** —— 拖了等於沒拖。
    /// </para>
    /// <para>
    /// ⚠️ <b>顯示順序完全不變。</b> 新值就是 <c>ROW_NUMBER() OVER (ORDER BY SortOrder, Id)</c>，
    /// 也就是把現在「算出來的順序」固定成「寫下來的順序」。
    /// </para>
    /// <para>
    /// ⚠️ 連帶：<c>ContentHandler.CreateAsync</c> 已改成新增時取 <c>MAX(SortOrder) + 1</c>。
    /// 沒有那一步的話，正規化之後每一筆新內容（<c>SortOrder = 0</c>）都會插到最前面。
    /// </para>
    /// <para>
    /// ⚠️ <b>不動 <c>ContentVersions</c> 的快照。</b>前台的排序讀的是
    /// <c>ContentItems.SortOrder</c> 這個即時欄位（<c>PublicContentHandler.ShapeAsync</c> 的
    /// 「結構性欄位用即時值」規則），不是快照裡的值，所以不需要重新發布。
    /// </para>
    /// </summary>
    public partial class NormalizeSortOrder : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                WITH ordered AS (
                    SELECT Id,
                           ROW_NUMBER() OVER (PARTITION BY ContentType ORDER BY SortOrder, Id) - 1 AS NewSortOrder
                    FROM ContentItems
                )
                UPDATE ci
                SET ci.SortOrder = o.NewSortOrder
                FROM ContentItems ci
                INNER JOIN ordered o ON o.Id = ci.Id
                WHERE ci.SortOrder <> o.NewSortOrder;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // ⚠️ 不可逆：舊值（幾乎整批 0）沒有保留，也沒有保留的價值 ——
            //    還原成全 0 會讓「拖曳排序」這個功能當場失效，而顯示順序反而不會變
            //    （又退回靠 Id 決勝）。所以這裡刻意什麼都不做。
        }
    }
}
