using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Skin20.Api.Data.Migrations
{
    /// <summary>
    /// 審核者角色與送審／審核三個權限碼移除（Tim 指定 2026-09-17，CLAUDE.md 決策 20），
    /// 並把九個單元的 <c>publish</c> 授予「內容編輯」。
    ///
    /// <para>
    /// 🔴 <b>下面三段手寫 SQL 不可以刪。</b> EF 的 scaffold 只認得「種子裡有的那幾列」，
    /// 而 <c>RolePermissions</c> 與 <c>UserRoles</c> 都是<b>後台畫面改得動的資料</b>
    /// （<c>PUT /admin/role/{id}/permissions</c>、帳號的角色指派）。手動加出來的列不在
    /// 種子裡，scaffold 完全不知道它們存在：
    /// </para>
    /// <list type="number">
    /// <item>有人被指派成「審核者」→ <c>DELETE FROM Roles WHERE Id = 5</c> 會撞上
    /// <c>UserRoles</c> 的外鍵，<b>整支 migration 失敗、部署卡住</b>。</item>
    /// <item>有人在畫面上勾過審核者的權限，或把 <c>review.*</c> 勾給別的角色 →
    /// 同樣撞外鍵。</item>
    /// </list>
    /// <para>
    /// ⚠️ 被指派成審核者的帳號<b>不會被刪除</b>，只是少了那個角色 —— 它可能因此變成
    /// 沒有任何角色的帳號（登得進去、什麼都不能做）。上線前請確認現場沒有這種帳號，
    /// 有的話改指派成「內容編輯」。
    /// </para>
    /// </summary>
    public partial class RemoveReviewWorkflow : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 🔴 **這裡刻意全部用手寫 SQL，不用 scaffold 出來的 DeleteData。**
            //
            //    `DeleteData` 產生的是 `DELETE …; SELECT @@ROWCOUNT;`，EF 會檢查影響列數，
            //    **刪到 0 列就拋 DbUpdateConcurrencyException、整支 migration 失敗**。
            //    而 RolePermissions 與 UserRoles 是後台畫面改得動的資料
            //    （`PUT /admin/role/{id}/permissions`、帳號的角色指派）——
            //    種子以外的列 scaffold 看不到，種子裡的列也可能已經被人取消勾選。
            //    兩種情況都會讓逐列的 DeleteData 炸掉，而症狀是「部署卡在遷移這一步」。
            //
            //    ⚠️ 用集合式的 DELETE 就沒有這個問題：刪 0 列也是成功。
            migrationBuilder.Sql("DELETE FROM UserRoles WHERE RoleId = 5;");
            migrationBuilder.Sql("DELETE FROM RolePermissions WHERE RoleId = 5;");
            migrationBuilder.Sql("DELETE FROM RolePermissions WHERE PermissionId IN (19, 20, 21);");

            // 內容編輯拿到九個單元的 publish。
            // ⚠️ 先刪再插：有人可能已經在後台畫面上勾過其中幾個，直接 INSERT 會撞主鍵。
            migrationBuilder.Sql("""
                DELETE FROM RolePermissions
                WHERE RoleId = 2 AND PermissionId IN (2, 4, 6, 8, 10, 12, 14, 16, 18);

                INSERT INTO RolePermissions (RoleId, PermissionId)
                VALUES (2, 2), (2, 4), (2, 6), (2, 8), (2, 10), (2, 12), (2, 14), (2, 16), (2, 18);
                """);

            // 這兩段刪的是純種子資料（Permissions 19–21、Roles 5），後台改不到它們，
            // 一定存在，所以用 scaffold 的寫法沒有風險。
            migrationBuilder.DeleteData(
                table: "Permissions",
                keyColumn: "Id",
                keyValue: 19);

            migrationBuilder.DeleteData(
                table: "Permissions",
                keyColumn: "Id",
                keyValue: 20);

            migrationBuilder.DeleteData(
                table: "Permissions",
                keyColumn: "Id",
                keyValue: 21);

            migrationBuilder.DeleteData(
                table: "Roles",
                keyColumn: "Id",
                keyValue: 5);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // ⚠️ Down 只還原**種子**的樣子。Up 那三段集合式 DELETE 若刪到了種子以外的列
            //    （有人在後台自己勾的），那些列救不回來 —— 這是不可逆的部分。
            migrationBuilder.Sql("DELETE FROM RolePermissions WHERE RoleId = 2 AND PermissionId IN (2, 4, 6, 8, 10, 12, 14, 16, 18);");

            migrationBuilder.InsertData(
                table: "Permissions",
                columns: new[] { "Id", "Code", "GroupName", "Name" },
                values: new object[,]
                {
                    { 19, "content.submit", "內容", "送審" },
                    { 20, "review.approve", "工作流", "審核核准" },
                    { 21, "review.reject", "工作流", "審核退回" }
                });

            migrationBuilder.InsertData(
                table: "Roles",
                columns: new[] { "Id", "Code", "IsSystem", "Name" },
                values: new object[] { 5, "Reviewer", true, "審核者" });

            migrationBuilder.InsertData(
                table: "RolePermissions",
                columns: new[] { "PermissionId", "RoleId" },
                values: new object[,]
                {
                    { 19, 1 },
                    { 20, 1 },
                    { 21, 1 },
                    { 19, 2 },
                    { 19, 3 },
                    { 20, 3 },
                    { 21, 3 },
                    { 2, 5 },
                    { 4, 5 },
                    { 6, 5 },
                    { 8, 5 },
                    { 10, 5 },
                    { 12, 5 },
                    { 14, 5 },
                    { 16, 5 },
                    { 18, 5 },
                    { 20, 5 },
                    { 21, 5 }
                });
        }
    }
}
