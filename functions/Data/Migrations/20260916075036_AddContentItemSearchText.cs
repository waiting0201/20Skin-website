using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Skin20.Api.Data.Migrations
{
    /// <summary>
    /// 加上 <c>ContentItems.SearchText</c>：站內搜尋的比對用純文字（2026-09-16）。
    ///
    /// <para>
    /// 🔴 <b>這是效能修正，不是新功能。</b> 搜尋原本直接對
    /// <c>ContentVersions.Snapshot</c>（NVARCHAR(MAX)）做 <c>LIKE</c> ——
    /// 正式的 Azure SQL Basic（5 DTU）實測 <b>23–24 秒</b>，而前台取值逾時是 8 秒，
    /// 所以搜尋在正式環境完全不能用。本機 SQL Server 只要 1.2 秒，量不出這件事。
    /// </para>
    ///
    /// <para>
    /// ⚠️ <b>這支只加欄位，不回填。</b> 回填由 <c>SearchTextBackfill</c> 這支 Timer 做 ——
    /// 欄位內容要把快照 JSON 攤平成純文字（巢狀區塊、內嵌 JSON 字串、跳過圖片欄位），
    /// T-SQL 做這件事又長又脆，而 C# 那邊已經有一份實作（<c>SearchTextBuilder</c>）。
    /// 為了回填再寫第二份，正是這個專案踩過好幾次的那種錯。
    /// </para>
    ///
    /// <para>
    /// ⚠️ 因此部署後有一段<b>搜尋結果不完整</b>的過渡期（補完為止）。
    /// 那支 Timer 預設每 10 分鐘跑一次、單次預算 5 分鐘，1228 筆通常一次就補完。
    /// </para>
    ///
    /// <para>
    /// ⚠️ 向後相容（CLAUDE.md 決策 8）：新欄位可為 NULL，舊程式完全不碰它。
    /// </para>
    /// </summary>
    public partial class AddContentItemSearchText : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // ⚠️ EF 原本還為每一列種子產生了 30 句 `UpdateData(..., value: null)`——
            //    `AddColumn` 之後那些欄位本來就是 NULL，那些敘述完全沒有作用，
            //    只會讓遷移多出兩百行雜訊。已刪除。
            migrationBuilder.AddColumn<string>(
                name: "SearchText",
                table: "ContentItems",
                type: "nvarchar(4000)",
                maxLength: 4000,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SearchText",
                table: "ContentItems");
        }
    }
}
