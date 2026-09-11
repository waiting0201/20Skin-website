using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Skin20.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddDoctorToConcernRelation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_ContentRelations_RelationType",
                table: "ContentRelations");

            migrationBuilder.DropCheckConstraint(
                name: "CK_ContentRelations_ValidCombination",
                table: "ContentRelations");

            migrationBuilder.AddCheckConstraint(
                name: "CK_ContentRelations_RelationType",
                table: "ContentRelations",
                sql: "[RelationType] BETWEEN 1 AND 13");

            migrationBuilder.AddCheckConstraint(
                name: "CK_ContentRelations_ValidCombination",
                table: "ContentRelations",
                sql: "(RelationType = 1  AND FromContentType = 1 AND ToContentType = 2) OR\n(RelationType = 2  AND FromContentType = 1 AND ToContentType = 3) OR\n(RelationType = 3  AND FromContentType = 1 AND ToContentType = 4) OR\n(RelationType = 4  AND FromContentType = 1 AND ToContentType = 6) OR\n(RelationType = 5  AND FromContentType = 3 AND ToContentType = 1) OR\n(RelationType = 6  AND FromContentType = 3 AND ToContentType = 6) OR\n(RelationType = 7  AND FromContentType = 3 AND ToContentType = 4) OR\n(RelationType = 8  AND FromContentType = 7 AND ToContentType = 2) OR\n(RelationType = 9  AND FromContentType = 7 AND ToContentType = 1) OR\n(RelationType = 10 AND FromContentType = 7 AND ToContentType = 6) OR\n(RelationType = 11 AND FromContentType = 4 AND ToContentType = 9) OR\n(RelationType = 12 AND FromContentType = 8 AND ToContentType IN (1,2,3,4,5,6,7,9)) OR\n(RelationType = 13 AND FromContentType = 2 AND ToContentType = 3)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_ContentRelations_RelationType",
                table: "ContentRelations");

            migrationBuilder.DropCheckConstraint(
                name: "CK_ContentRelations_ValidCombination",
                table: "ContentRelations");

            migrationBuilder.AddCheckConstraint(
                name: "CK_ContentRelations_RelationType",
                table: "ContentRelations",
                sql: "[RelationType] BETWEEN 1 AND 12");

            migrationBuilder.AddCheckConstraint(
                name: "CK_ContentRelations_ValidCombination",
                table: "ContentRelations",
                sql: "(RelationType = 1  AND FromContentType = 1 AND ToContentType = 2) OR\n(RelationType = 2  AND FromContentType = 1 AND ToContentType = 3) OR\n(RelationType = 3  AND FromContentType = 1 AND ToContentType = 4) OR\n(RelationType = 4  AND FromContentType = 1 AND ToContentType = 6) OR\n(RelationType = 5  AND FromContentType = 3 AND ToContentType = 1) OR\n(RelationType = 6  AND FromContentType = 3 AND ToContentType = 6) OR\n(RelationType = 7  AND FromContentType = 3 AND ToContentType = 4) OR\n(RelationType = 8  AND FromContentType = 7 AND ToContentType = 2) OR\n(RelationType = 9  AND FromContentType = 7 AND ToContentType = 1) OR\n(RelationType = 10 AND FromContentType = 7 AND ToContentType = 6) OR\n(RelationType = 11 AND FromContentType = 4 AND ToContentType = 9) OR\n(RelationType = 12 AND FromContentType = 8 AND ToContentType IN (1,2,3,4,5,6,7,9))");
        }
    }
}
