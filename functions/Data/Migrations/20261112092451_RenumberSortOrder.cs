using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Skin20.Api.Data.Migrations
{
    /// <summary>
    /// 把每個內容型別的 <c>ContentItems.SortOrder</c> 再正規化一次成 0..n-1
    /// （與 <c>NormalizeSortOrder</c>（2026-09-17）同一支 SQL）。
    ///
    /// <para>
    /// 🔴 <b>為什麼又要一次</b>：2026-11-12 正式站查到「分類與標籤」有 4 筆撞號
    /// （三個療程分類被改成 1、2、4，一個 FAQ 分類新增時填 2），全部來自編輯頁那一格
    /// 可以自由輸入的「排序值」—— 後端在此之前照單全收。清單的拖曳排序是
    /// 「當頁那幾筆原本佔住的排序值重新分配」（決策 21），撞號的那幾筆拖了等於沒拖。
    /// </para>
    /// <para>
    /// ⚠️ <b>顯示順序完全不變。</b> 新值是 <c>ROW_NUMBER() OVER (ORDER BY SortOrder, Id)</c>，
    /// 也就是清單與前台現在就在用的決勝順序。撞號的四筆彼此是不同類型（療程分類／標籤／
    /// FAQ 分類），所以前台各類型內的先後本來就沒有受影響。
    /// </para>
    /// <para>
    /// ⚠️ 根因同一個 commit 修掉：<c>ContentHandler.MakeRoomForSortOrderAsync</c> ——
    /// 明確指定的排序值若已被佔用，後面的往後挪一格。少了那一步，這支跑完還會再撞。
    /// </para>
    /// <para>
    /// ⚠️ 不動 <c>ContentVersions</c> 的快照，也不動 <c>UpdatedAt</c>（理由同 <c>NormalizeSortOrder</c>）。
    /// 向後相容：先遷移後部署的那一段，舊程式讀到的只是換了號碼的同一個順序。
    /// </para>
    /// </summary>
    public partial class RenumberSortOrder : Migration
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
            // ⚠️ 不可逆，也不需要逆：舊值（含撞號）沒有保留的價值，而顯示順序在 Up 前後相同。
        }
    }
}
