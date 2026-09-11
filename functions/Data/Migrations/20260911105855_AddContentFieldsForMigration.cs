using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Skin20.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddContentFieldsForMigration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_DoctorTags_Doctor_Sort",
                table: "DoctorTags");

            migrationBuilder.DropCheckConstraint(
                name: "CK_DoctorCredentials_Type",
                table: "DoctorCredentials");

            migrationBuilder.AddColumn<string>(
                name: "Steps",
                table: "Treatments",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReviewedBy",
                table: "Faqs",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            // ⚠️ 一次性回填值刻意用 1（Specialty）而不是 EF 預設產生的 0 ——
            //    0 會讓既有列違反下方的 CK_DoctorTags_Type，整支遷移在有資料的庫上直接失敗。
            //    目前兩邊的 DoctorTags 都是空的，但遷移不該只在空表上成立（docs/11 §13）。
            //    這是 migration 內的一次性回填，**模型上刻意不給預設值** —— 比照 Doctors.IsPhysician，
            //    逼寫入端每次明確給值。
            migrationBuilder.AddColumn<byte>(
                name: "Type",
                table: "DoctorTags",
                type: "tinyint",
                nullable: false,
                defaultValue: (byte)1);

            migrationBuilder.CreateIndex(
                name: "IX_DoctorTags_Doctor_Type_Sort",
                table: "DoctorTags",
                columns: new[] { "DoctorId", "Type", "SortOrder" });

            migrationBuilder.AddCheckConstraint(
                name: "CK_DoctorTags_Type",
                table: "DoctorTags",
                sql: "[Type] BETWEEN 1 AND 2");

            migrationBuilder.AddCheckConstraint(
                name: "CK_DoctorCredentials_Type",
                table: "DoctorCredentials",
                sql: "[Type] BETWEEN 1 AND 4");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_DoctorTags_Doctor_Type_Sort",
                table: "DoctorTags");

            migrationBuilder.DropCheckConstraint(
                name: "CK_DoctorTags_Type",
                table: "DoctorTags");

            migrationBuilder.DropCheckConstraint(
                name: "CK_DoctorCredentials_Type",
                table: "DoctorCredentials");

            migrationBuilder.DropColumn(
                name: "Steps",
                table: "Treatments");

            migrationBuilder.DropColumn(
                name: "ReviewedBy",
                table: "Faqs");

            migrationBuilder.DropColumn(
                name: "Type",
                table: "DoctorTags");

            migrationBuilder.CreateIndex(
                name: "IX_DoctorTags_Doctor_Sort",
                table: "DoctorTags",
                columns: new[] { "DoctorId", "SortOrder" });

            migrationBuilder.AddCheckConstraint(
                name: "CK_DoctorCredentials_Type",
                table: "DoctorCredentials",
                sql: "[Type] BETWEEN 1 AND 3");
        }
    }
}
