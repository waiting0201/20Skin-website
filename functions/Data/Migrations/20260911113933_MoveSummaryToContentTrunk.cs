using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Skin20.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class MoveSummaryToContentTrunk : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 🔴 順序不可顛倒：先加新欄、回填、才能刪舊欄。
            //    EF 產出的預設順序是「先 DropColumn 後 AddColumn」，那會把既有文章的摘要直接丟掉。
            migrationBuilder.AddColumn<string>(
                name: "Summary",
                table: "ContentItems",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            // ⚠️ 一行靜態資料回填 —— docs/11 §13「不要在 migration 裡手寫動態 SQL」的唯一例外。
            //    目前 Articles 是空的，但這支遷移將來會跑在有 800 篇文章的庫上。
            migrationBuilder.Sql(@"
                UPDATE ci SET ci.[Summary] = a.[Summary]
                FROM [ContentItems] ci
                INNER JOIN [Articles] a ON a.[Id] = ci.[Id]
                WHERE a.[Summary] IS NOT NULL;");

            migrationBuilder.DropColumn(
                name: "Summary",
                table: "Articles");

            migrationBuilder.UpdateData(
                table: "ContentItems",
                keyColumn: "Id",
                keyValue: 1001,
                column: "Summary",
                value: null);

            migrationBuilder.UpdateData(
                table: "ContentItems",
                keyColumn: "Id",
                keyValue: 1002,
                column: "Summary",
                value: null);

            migrationBuilder.UpdateData(
                table: "ContentItems",
                keyColumn: "Id",
                keyValue: 1003,
                column: "Summary",
                value: null);

            migrationBuilder.UpdateData(
                table: "ContentItems",
                keyColumn: "Id",
                keyValue: 1004,
                column: "Summary",
                value: null);

            migrationBuilder.UpdateData(
                table: "ContentItems",
                keyColumn: "Id",
                keyValue: 1005,
                column: "Summary",
                value: null);

            migrationBuilder.UpdateData(
                table: "ContentItems",
                keyColumn: "Id",
                keyValue: 1006,
                column: "Summary",
                value: null);

            migrationBuilder.UpdateData(
                table: "ContentItems",
                keyColumn: "Id",
                keyValue: 1007,
                column: "Summary",
                value: null);

            migrationBuilder.UpdateData(
                table: "ContentItems",
                keyColumn: "Id",
                keyValue: 1008,
                column: "Summary",
                value: null);

            migrationBuilder.UpdateData(
                table: "ContentItems",
                keyColumn: "Id",
                keyValue: 1009,
                column: "Summary",
                value: null);

            migrationBuilder.UpdateData(
                table: "ContentItems",
                keyColumn: "Id",
                keyValue: 1010,
                column: "Summary",
                value: null);

            migrationBuilder.UpdateData(
                table: "ContentItems",
                keyColumn: "Id",
                keyValue: 1011,
                column: "Summary",
                value: null);

            migrationBuilder.UpdateData(
                table: "ContentItems",
                keyColumn: "Id",
                keyValue: 1012,
                column: "Summary",
                value: null);

            migrationBuilder.UpdateData(
                table: "ContentItems",
                keyColumn: "Id",
                keyValue: 1013,
                column: "Summary",
                value: null);

            migrationBuilder.UpdateData(
                table: "ContentItems",
                keyColumn: "Id",
                keyValue: 1101,
                column: "Summary",
                value: null);

            migrationBuilder.UpdateData(
                table: "ContentItems",
                keyColumn: "Id",
                keyValue: 1102,
                column: "Summary",
                value: null);

            migrationBuilder.UpdateData(
                table: "ContentItems",
                keyColumn: "Id",
                keyValue: 1103,
                column: "Summary",
                value: null);

            migrationBuilder.UpdateData(
                table: "ContentItems",
                keyColumn: "Id",
                keyValue: 1104,
                column: "Summary",
                value: null);

            migrationBuilder.UpdateData(
                table: "ContentItems",
                keyColumn: "Id",
                keyValue: 1105,
                column: "Summary",
                value: null);

            migrationBuilder.UpdateData(
                table: "ContentItems",
                keyColumn: "Id",
                keyValue: 1106,
                column: "Summary",
                value: null);

            migrationBuilder.UpdateData(
                table: "ContentItems",
                keyColumn: "Id",
                keyValue: 1107,
                column: "Summary",
                value: null);

            migrationBuilder.UpdateData(
                table: "ContentItems",
                keyColumn: "Id",
                keyValue: 1108,
                column: "Summary",
                value: null);

            migrationBuilder.UpdateData(
                table: "ContentItems",
                keyColumn: "Id",
                keyValue: 1109,
                column: "Summary",
                value: null);

            migrationBuilder.UpdateData(
                table: "ContentItems",
                keyColumn: "Id",
                keyValue: 1110,
                column: "Summary",
                value: null);

            migrationBuilder.UpdateData(
                table: "ContentItems",
                keyColumn: "Id",
                keyValue: 1111,
                column: "Summary",
                value: null);

            migrationBuilder.UpdateData(
                table: "ContentItems",
                keyColumn: "Id",
                keyValue: 1112,
                column: "Summary",
                value: null);

            migrationBuilder.UpdateData(
                table: "ContentItems",
                keyColumn: "Id",
                keyValue: 1113,
                column: "Summary",
                value: null);

            migrationBuilder.UpdateData(
                table: "ContentItems",
                keyColumn: "Id",
                keyValue: 1114,
                column: "Summary",
                value: null);

            migrationBuilder.UpdateData(
                table: "ContentItems",
                keyColumn: "Id",
                keyValue: 1115,
                column: "Summary",
                value: null);

            migrationBuilder.UpdateData(
                table: "ContentItems",
                keyColumn: "Id",
                keyValue: 1116,
                column: "Summary",
                value: null);

            migrationBuilder.UpdateData(
                table: "ContentItems",
                keyColumn: "Id",
                keyValue: 1117,
                column: "Summary",
                value: null);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Summary",
                table: "ContentItems");

            migrationBuilder.AddColumn<string>(
                name: "Summary",
                table: "Articles",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);
        }
    }
}
