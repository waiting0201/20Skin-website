using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Skin20.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class RenameMakeupStylePageTitle : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.UpdateData(
                table: "ContentItems",
                keyColumn: "Id",
                keyValue: 1114,
                column: "Title",
                value: "新中式美學");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.UpdateData(
                table: "ContentItems",
                keyColumn: "Id",
                keyValue: 1114,
                column: "Title",
                value: "彩妝式輕醫美");
        }
    }
}
