using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Skin20.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class RemoveMediaLibrary : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Articles_MediaAssets_Cover",
                table: "Articles");

            migrationBuilder.DropForeignKey(
                name: "FK_CaseImages_MediaAssets",
                table: "CaseImages");

            migrationBuilder.DropForeignKey(
                name: "FK_ClinicPhotos_MediaAssets",
                table: "ClinicPhotos");

            migrationBuilder.DropForeignKey(
                name: "FK_Concerns_MediaAssets_Cover",
                table: "Concerns");

            migrationBuilder.DropForeignKey(
                name: "FK_Doctors_MediaAssets_Photo",
                table: "Doctors");

            migrationBuilder.DropForeignKey(
                name: "FK_Pages_MediaAssets_Cover",
                table: "Pages");

            migrationBuilder.DropForeignKey(
                name: "FK_SeoMeta_MediaAssets",
                table: "SeoMeta");

            migrationBuilder.DropForeignKey(
                name: "FK_Terms_MediaAssets_Cover",
                table: "Terms");

            migrationBuilder.DropForeignKey(
                name: "FK_TreatmentImages_MediaAssets",
                table: "TreatmentImages");

            migrationBuilder.DropForeignKey(
                name: "FK_Treatments_MediaAssets_Cover",
                table: "Treatments");

            migrationBuilder.DropTable(
                name: "MediaUsages");

            migrationBuilder.DropTable(
                name: "MediaAssets");

            migrationBuilder.DeleteData(
                table: "SiteSettings",
                keyColumn: "SettingKey",
                keyValue: "site.defaultOgMediaId");

            migrationBuilder.DeleteData(
                table: "SiteSettings",
                keyColumn: "SettingKey",
                keyValue: "site.logoMediaId");

            migrationBuilder.DropColumn(
                name: "MediaId",
                table: "TreatmentImages");

            migrationBuilder.DropColumn(
                name: "MediaId",
                table: "ClinicPhotos");

            migrationBuilder.DropColumn(
                name: "MediaId",
                table: "CaseImages");

            // ⚠️ 不用 RenameColumn 把 CoverMediaId 就地當成 CoverWidth——EF 的預設產物是把這個 int 欄
            //    改名沿用，舊的媒體 Id 會原地變成一個假的圖片寬度。欄位意義完全不同，分開處理。
            migrationBuilder.DropColumn(
                name: "CoverMediaId",
                table: "Treatments");

            migrationBuilder.AddColumn<int>(
                name: "CoverWidth",
                table: "Treatments",
                type: "int",
                nullable: true);

            // ⚠️ 不用 RenameColumn 把 CoverMediaId 就地當成 CoverWidth——EF 的預設產物是把這個 int 欄
            //    改名沿用，舊的媒體 Id 會原地變成一個假的圖片寬度。欄位意義完全不同，分開處理。
            migrationBuilder.DropColumn(
                name: "CoverMediaId",
                table: "Terms");

            migrationBuilder.AddColumn<int>(
                name: "CoverWidth",
                table: "Terms",
                type: "int",
                nullable: true);

            // ⚠️ 不用 RenameColumn 把 OgImageMediaId 就地當成 OgImageWidth——EF 的預設產物是把這個 int 欄
            //    改名沿用，舊的媒體 Id 會原地變成一個假的圖片寬度。欄位意義完全不同，分開處理。
            migrationBuilder.DropColumn(
                name: "OgImageMediaId",
                table: "SeoMeta");

            migrationBuilder.AddColumn<int>(
                name: "OgImageWidth",
                table: "SeoMeta",
                type: "int",
                nullable: true);

            // ⚠️ 不用 RenameColumn 把 CoverMediaId 就地當成 CoverWidth——EF 的預設產物是把這個 int 欄
            //    改名沿用，舊的媒體 Id 會原地變成一個假的圖片寬度。欄位意義完全不同，分開處理。
            migrationBuilder.DropColumn(
                name: "CoverMediaId",
                table: "Pages");

            migrationBuilder.AddColumn<int>(
                name: "CoverWidth",
                table: "Pages",
                type: "int",
                nullable: true);

            // ⚠️ 不用 RenameColumn 把 PhotoMediaId 就地當成 PhotoWidth——EF 的預設產物是把這個 int 欄
            //    改名沿用，舊的媒體 Id 會原地變成一個假的圖片寬度。欄位意義完全不同，分開處理。
            migrationBuilder.DropColumn(
                name: "PhotoMediaId",
                table: "Doctors");

            migrationBuilder.AddColumn<int>(
                name: "PhotoWidth",
                table: "Doctors",
                type: "int",
                nullable: true);

            // ⚠️ 不用 RenameColumn 把 CoverMediaId 就地當成 CoverWidth——EF 的預設產物是把這個 int 欄
            //    改名沿用，舊的媒體 Id 會原地變成一個假的圖片寬度。欄位意義完全不同，分開處理。
            migrationBuilder.DropColumn(
                name: "CoverMediaId",
                table: "Concerns");

            migrationBuilder.AddColumn<int>(
                name: "CoverWidth",
                table: "Concerns",
                type: "int",
                nullable: true);

            // ⚠️ 不用 RenameColumn 把 CoverMediaId 就地當成 CoverWidth——EF 的預設產物是把這個 int 欄
            //    改名沿用，舊的媒體 Id 會原地變成一個假的圖片寬度。欄位意義完全不同，分開處理。
            migrationBuilder.DropColumn(
                name: "CoverMediaId",
                table: "Articles");

            migrationBuilder.AddColumn<int>(
                name: "CoverWidth",
                table: "Articles",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CoverAlt",
                table: "Treatments",
                type: "nvarchar(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CoverBlobPath",
                table: "Treatments",
                type: "nvarchar(400)",
                maxLength: 400,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "CoverHeight",
                table: "Treatments",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CoverUrl",
                table: "Treatments",
                type: "nvarchar(600)",
                maxLength: 600,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CoverVariants",
                table: "Treatments",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ImageAlt",
                table: "TreatmentImages",
                type: "nvarchar(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ImageBlobPath",
                table: "TreatmentImages",
                type: "nvarchar(400)",
                maxLength: 400,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "ImageHeight",
                table: "TreatmentImages",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ImageUrl",
                table: "TreatmentImages",
                type: "nvarchar(600)",
                maxLength: 600,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "ImageVariants",
                table: "TreatmentImages",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ImageWidth",
                table: "TreatmentImages",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CoverAlt",
                table: "Terms",
                type: "nvarchar(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CoverBlobPath",
                table: "Terms",
                type: "nvarchar(400)",
                maxLength: 400,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "CoverHeight",
                table: "Terms",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CoverUrl",
                table: "Terms",
                type: "nvarchar(600)",
                maxLength: 600,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CoverVariants",
                table: "Terms",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "OgImageAlt",
                table: "SeoMeta",
                type: "nvarchar(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "OgImageBlobPath",
                table: "SeoMeta",
                type: "nvarchar(400)",
                maxLength: 400,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "OgImageHeight",
                table: "SeoMeta",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "OgImageUrl",
                table: "SeoMeta",
                type: "nvarchar(600)",
                maxLength: 600,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "OgImageVariants",
                table: "SeoMeta",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CoverAlt",
                table: "Pages",
                type: "nvarchar(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CoverBlobPath",
                table: "Pages",
                type: "nvarchar(400)",
                maxLength: 400,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "CoverHeight",
                table: "Pages",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CoverUrl",
                table: "Pages",
                type: "nvarchar(600)",
                maxLength: 600,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CoverVariants",
                table: "Pages",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PhotoAlt",
                table: "Doctors",
                type: "nvarchar(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PhotoBlobPath",
                table: "Doctors",
                type: "nvarchar(400)",
                maxLength: 400,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PhotoHeight",
                table: "Doctors",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PhotoUrl",
                table: "Doctors",
                type: "nvarchar(600)",
                maxLength: 600,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PhotoVariants",
                table: "Doctors",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CoverAlt",
                table: "Concerns",
                type: "nvarchar(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CoverBlobPath",
                table: "Concerns",
                type: "nvarchar(400)",
                maxLength: 400,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "CoverHeight",
                table: "Concerns",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CoverUrl",
                table: "Concerns",
                type: "nvarchar(600)",
                maxLength: 600,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CoverVariants",
                table: "Concerns",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ImageAlt",
                table: "ClinicPhotos",
                type: "nvarchar(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ImageBlobPath",
                table: "ClinicPhotos",
                type: "nvarchar(400)",
                maxLength: 400,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "ImageHeight",
                table: "ClinicPhotos",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ImageUrl",
                table: "ClinicPhotos",
                type: "nvarchar(600)",
                maxLength: 600,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "ImageVariants",
                table: "ClinicPhotos",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ImageWidth",
                table: "ClinicPhotos",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ImageAlt",
                table: "CaseImages",
                type: "nvarchar(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ImageBlobPath",
                table: "CaseImages",
                type: "nvarchar(400)",
                maxLength: 400,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "ImageHeight",
                table: "CaseImages",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ImageUrl",
                table: "CaseImages",
                type: "nvarchar(600)",
                maxLength: 600,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "ImageVariants",
                table: "CaseImages",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ImageWidth",
                table: "CaseImages",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CoverAlt",
                table: "Articles",
                type: "nvarchar(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CoverBlobPath",
                table: "Articles",
                type: "nvarchar(400)",
                maxLength: 400,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "CoverHeight",
                table: "Articles",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CoverUrl",
                table: "Articles",
                type: "nvarchar(600)",
                maxLength: 600,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CoverVariants",
                table: "Articles",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.UpdateData(
                table: "Permissions",
                keyColumn: "Id",
                keyValue: 31,
                columns: new[] { "Code", "Name" },
                values: new object[] { "upload.file", "上傳圖片" });

            migrationBuilder.InsertData(
                table: "SiteSettings",
                columns: new[] { "SettingKey", "SettingValue", "UpdatedAt", "UpdatedByUserId", "ValueType" },
                values: new object[,]
                {
                    { "site.defaultOgImage", "", new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, (byte)4 },
                    { "site.logoImage", "", new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, (byte)4 }
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "SiteSettings",
                keyColumn: "SettingKey",
                keyValue: "site.defaultOgImage");

            migrationBuilder.DeleteData(
                table: "SiteSettings",
                keyColumn: "SettingKey",
                keyValue: "site.logoImage");

            migrationBuilder.DropColumn(
                name: "CoverAlt",
                table: "Treatments");

            migrationBuilder.DropColumn(
                name: "CoverBlobPath",
                table: "Treatments");

            migrationBuilder.DropColumn(
                name: "CoverHeight",
                table: "Treatments");

            migrationBuilder.DropColumn(
                name: "CoverUrl",
                table: "Treatments");

            migrationBuilder.DropColumn(
                name: "CoverVariants",
                table: "Treatments");

            migrationBuilder.DropColumn(
                name: "ImageAlt",
                table: "TreatmentImages");

            migrationBuilder.DropColumn(
                name: "ImageBlobPath",
                table: "TreatmentImages");

            migrationBuilder.DropColumn(
                name: "ImageHeight",
                table: "TreatmentImages");

            migrationBuilder.DropColumn(
                name: "ImageUrl",
                table: "TreatmentImages");

            migrationBuilder.DropColumn(
                name: "ImageVariants",
                table: "TreatmentImages");

            migrationBuilder.DropColumn(
                name: "ImageWidth",
                table: "TreatmentImages");

            migrationBuilder.DropColumn(
                name: "CoverAlt",
                table: "Terms");

            migrationBuilder.DropColumn(
                name: "CoverBlobPath",
                table: "Terms");

            migrationBuilder.DropColumn(
                name: "CoverHeight",
                table: "Terms");

            migrationBuilder.DropColumn(
                name: "CoverUrl",
                table: "Terms");

            migrationBuilder.DropColumn(
                name: "CoverVariants",
                table: "Terms");

            migrationBuilder.DropColumn(
                name: "OgImageAlt",
                table: "SeoMeta");

            migrationBuilder.DropColumn(
                name: "OgImageBlobPath",
                table: "SeoMeta");

            migrationBuilder.DropColumn(
                name: "OgImageHeight",
                table: "SeoMeta");

            migrationBuilder.DropColumn(
                name: "OgImageUrl",
                table: "SeoMeta");

            migrationBuilder.DropColumn(
                name: "OgImageVariants",
                table: "SeoMeta");

            migrationBuilder.DropColumn(
                name: "CoverAlt",
                table: "Pages");

            migrationBuilder.DropColumn(
                name: "CoverBlobPath",
                table: "Pages");

            migrationBuilder.DropColumn(
                name: "CoverHeight",
                table: "Pages");

            migrationBuilder.DropColumn(
                name: "CoverUrl",
                table: "Pages");

            migrationBuilder.DropColumn(
                name: "CoverVariants",
                table: "Pages");

            migrationBuilder.DropColumn(
                name: "PhotoAlt",
                table: "Doctors");

            migrationBuilder.DropColumn(
                name: "PhotoBlobPath",
                table: "Doctors");

            migrationBuilder.DropColumn(
                name: "PhotoHeight",
                table: "Doctors");

            migrationBuilder.DropColumn(
                name: "PhotoUrl",
                table: "Doctors");

            migrationBuilder.DropColumn(
                name: "PhotoVariants",
                table: "Doctors");

            migrationBuilder.DropColumn(
                name: "CoverAlt",
                table: "Concerns");

            migrationBuilder.DropColumn(
                name: "CoverBlobPath",
                table: "Concerns");

            migrationBuilder.DropColumn(
                name: "CoverHeight",
                table: "Concerns");

            migrationBuilder.DropColumn(
                name: "CoverUrl",
                table: "Concerns");

            migrationBuilder.DropColumn(
                name: "CoverVariants",
                table: "Concerns");

            migrationBuilder.DropColumn(
                name: "ImageAlt",
                table: "ClinicPhotos");

            migrationBuilder.DropColumn(
                name: "ImageBlobPath",
                table: "ClinicPhotos");

            migrationBuilder.DropColumn(
                name: "ImageHeight",
                table: "ClinicPhotos");

            migrationBuilder.DropColumn(
                name: "ImageUrl",
                table: "ClinicPhotos");

            migrationBuilder.DropColumn(
                name: "ImageVariants",
                table: "ClinicPhotos");

            migrationBuilder.DropColumn(
                name: "ImageWidth",
                table: "ClinicPhotos");

            migrationBuilder.DropColumn(
                name: "ImageAlt",
                table: "CaseImages");

            migrationBuilder.DropColumn(
                name: "ImageBlobPath",
                table: "CaseImages");

            migrationBuilder.DropColumn(
                name: "ImageHeight",
                table: "CaseImages");

            migrationBuilder.DropColumn(
                name: "ImageUrl",
                table: "CaseImages");

            migrationBuilder.DropColumn(
                name: "ImageVariants",
                table: "CaseImages");

            migrationBuilder.DropColumn(
                name: "ImageWidth",
                table: "CaseImages");

            migrationBuilder.DropColumn(
                name: "CoverAlt",
                table: "Articles");

            migrationBuilder.DropColumn(
                name: "CoverBlobPath",
                table: "Articles");

            migrationBuilder.DropColumn(
                name: "CoverHeight",
                table: "Articles");

            migrationBuilder.DropColumn(
                name: "CoverUrl",
                table: "Articles");

            migrationBuilder.DropColumn(
                name: "CoverVariants",
                table: "Articles");

            migrationBuilder.DropColumn(
                name: "CoverWidth",
                table: "Treatments");

            migrationBuilder.AddColumn<int>(
                name: "CoverMediaId",
                table: "Treatments",
                type: "int",
                nullable: true);

            migrationBuilder.DropColumn(
                name: "CoverWidth",
                table: "Terms");

            migrationBuilder.AddColumn<int>(
                name: "CoverMediaId",
                table: "Terms",
                type: "int",
                nullable: true);

            migrationBuilder.DropColumn(
                name: "OgImageWidth",
                table: "SeoMeta");

            migrationBuilder.AddColumn<int>(
                name: "OgImageMediaId",
                table: "SeoMeta",
                type: "int",
                nullable: true);

            migrationBuilder.DropColumn(
                name: "CoverWidth",
                table: "Pages");

            migrationBuilder.AddColumn<int>(
                name: "CoverMediaId",
                table: "Pages",
                type: "int",
                nullable: true);

            migrationBuilder.DropColumn(
                name: "PhotoWidth",
                table: "Doctors");

            migrationBuilder.AddColumn<int>(
                name: "PhotoMediaId",
                table: "Doctors",
                type: "int",
                nullable: true);

            migrationBuilder.DropColumn(
                name: "CoverWidth",
                table: "Concerns");

            migrationBuilder.AddColumn<int>(
                name: "CoverMediaId",
                table: "Concerns",
                type: "int",
                nullable: true);

            migrationBuilder.DropColumn(
                name: "CoverWidth",
                table: "Articles");

            migrationBuilder.AddColumn<int>(
                name: "CoverMediaId",
                table: "Articles",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MediaId",
                table: "TreatmentImages",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "MediaId",
                table: "ClinicPhotos",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "MediaId",
                table: "CaseImages",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "MediaAssets",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UploadedByUserId = table.Column<int>(type: "int", nullable: true),
                    AltText = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    BlobPath = table.Column<string>(type: "nvarchar(400)", maxLength: 400, nullable: false),
                    ByteSize = table.Column<long>(type: "bigint", nullable: false),
                    Caption = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    ContainerName = table.Column<string>(type: "nvarchar(63)", maxLength: 63, nullable: false),
                    ContentHash = table.Column<string>(type: "nchar(64)", fixedLength: true, maxLength: 64, nullable: false),
                    ContentType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2(0)", nullable: false),
                    Height = table.Column<int>(type: "int", nullable: true),
                    IsPrivate = table.Column<bool>(type: "bit", nullable: false, defaultValue: false)
                        .Annotation("Relational:DefaultConstraintName", "DF_MediaAssets_IsPrivate"),
                    OriginalFileName = table.Column<string>(type: "nvarchar(260)", maxLength: 260, nullable: false),
                    PublicUrl = table.Column<string>(type: "nvarchar(600)", maxLength: 600, nullable: false),
                    Variants = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Width = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MediaAssets", x => x.Id);
                    table.CheckConstraint("CK_MediaAssets_ContentHash_Length", "LEN([ContentHash]) = 64");
                    table.ForeignKey(
                        name: "FK_MediaAssets_Users",
                        column: x => x.UploadedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "MediaUsages",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ContentItemId = table.Column<int>(type: "int", nullable: false),
                    MediaId = table.Column<int>(type: "int", nullable: false),
                    UsageKind = table.Column<byte>(type: "tinyint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MediaUsages", x => x.Id);
                    table.CheckConstraint("CK_MediaUsages_UsageKind", "[UsageKind] BETWEEN 1 AND 4");
                    table.ForeignKey(
                        name: "FK_MediaUsages_ContentItems",
                        column: x => x.ContentItemId,
                        principalTable: "ContentItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_MediaUsages_MediaAssets",
                        column: x => x.MediaId,
                        principalTable: "MediaAssets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.UpdateData(
                table: "Pages",
                keyColumn: "Id",
                keyValue: 1101,
                column: "CoverMediaId",
                value: null);

            migrationBuilder.UpdateData(
                table: "Pages",
                keyColumn: "Id",
                keyValue: 1102,
                column: "CoverMediaId",
                value: null);

            migrationBuilder.UpdateData(
                table: "Pages",
                keyColumn: "Id",
                keyValue: 1103,
                column: "CoverMediaId",
                value: null);

            migrationBuilder.UpdateData(
                table: "Pages",
                keyColumn: "Id",
                keyValue: 1104,
                column: "CoverMediaId",
                value: null);

            migrationBuilder.UpdateData(
                table: "Pages",
                keyColumn: "Id",
                keyValue: 1105,
                column: "CoverMediaId",
                value: null);

            migrationBuilder.UpdateData(
                table: "Pages",
                keyColumn: "Id",
                keyValue: 1106,
                column: "CoverMediaId",
                value: null);

            migrationBuilder.UpdateData(
                table: "Pages",
                keyColumn: "Id",
                keyValue: 1107,
                column: "CoverMediaId",
                value: null);

            migrationBuilder.UpdateData(
                table: "Pages",
                keyColumn: "Id",
                keyValue: 1108,
                column: "CoverMediaId",
                value: null);

            migrationBuilder.UpdateData(
                table: "Pages",
                keyColumn: "Id",
                keyValue: 1109,
                column: "CoverMediaId",
                value: null);

            migrationBuilder.UpdateData(
                table: "Pages",
                keyColumn: "Id",
                keyValue: 1110,
                column: "CoverMediaId",
                value: null);

            migrationBuilder.UpdateData(
                table: "Pages",
                keyColumn: "Id",
                keyValue: 1111,
                column: "CoverMediaId",
                value: null);

            migrationBuilder.UpdateData(
                table: "Pages",
                keyColumn: "Id",
                keyValue: 1112,
                column: "CoverMediaId",
                value: null);

            migrationBuilder.UpdateData(
                table: "Pages",
                keyColumn: "Id",
                keyValue: 1113,
                column: "CoverMediaId",
                value: null);

            migrationBuilder.UpdateData(
                table: "Pages",
                keyColumn: "Id",
                keyValue: 1114,
                column: "CoverMediaId",
                value: null);

            migrationBuilder.UpdateData(
                table: "Pages",
                keyColumn: "Id",
                keyValue: 1115,
                column: "CoverMediaId",
                value: null);

            migrationBuilder.UpdateData(
                table: "Pages",
                keyColumn: "Id",
                keyValue: 1116,
                column: "CoverMediaId",
                value: null);

            migrationBuilder.UpdateData(
                table: "Pages",
                keyColumn: "Id",
                keyValue: 1117,
                column: "CoverMediaId",
                value: null);

            migrationBuilder.UpdateData(
                table: "Permissions",
                keyColumn: "Id",
                keyValue: 31,
                columns: new[] { "Code", "Name" },
                values: new object[] { "media.manage", "媒體庫" });

            migrationBuilder.InsertData(
                table: "SiteSettings",
                columns: new[] { "SettingKey", "SettingValue", "UpdatedAt", "UpdatedByUserId", "ValueType" },
                values: new object[,]
                {
                    { "site.defaultOgMediaId", "", new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, (byte)1 },
                    { "site.logoMediaId", "", new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, (byte)1 }
                });

            migrationBuilder.UpdateData(
                table: "Terms",
                keyColumn: "Id",
                keyValue: 1001,
                column: "CoverMediaId",
                value: null);

            migrationBuilder.UpdateData(
                table: "Terms",
                keyColumn: "Id",
                keyValue: 1002,
                column: "CoverMediaId",
                value: null);

            migrationBuilder.UpdateData(
                table: "Terms",
                keyColumn: "Id",
                keyValue: 1003,
                column: "CoverMediaId",
                value: null);

            migrationBuilder.UpdateData(
                table: "Terms",
                keyColumn: "Id",
                keyValue: 1004,
                column: "CoverMediaId",
                value: null);

            migrationBuilder.UpdateData(
                table: "Terms",
                keyColumn: "Id",
                keyValue: 1005,
                column: "CoverMediaId",
                value: null);

            migrationBuilder.UpdateData(
                table: "Terms",
                keyColumn: "Id",
                keyValue: 1006,
                column: "CoverMediaId",
                value: null);

            migrationBuilder.UpdateData(
                table: "Terms",
                keyColumn: "Id",
                keyValue: 1007,
                column: "CoverMediaId",
                value: null);

            migrationBuilder.UpdateData(
                table: "Terms",
                keyColumn: "Id",
                keyValue: 1008,
                column: "CoverMediaId",
                value: null);

            migrationBuilder.UpdateData(
                table: "Terms",
                keyColumn: "Id",
                keyValue: 1009,
                column: "CoverMediaId",
                value: null);

            migrationBuilder.UpdateData(
                table: "Terms",
                keyColumn: "Id",
                keyValue: 1010,
                column: "CoverMediaId",
                value: null);

            migrationBuilder.UpdateData(
                table: "Terms",
                keyColumn: "Id",
                keyValue: 1011,
                column: "CoverMediaId",
                value: null);

            migrationBuilder.UpdateData(
                table: "Terms",
                keyColumn: "Id",
                keyValue: 1012,
                column: "CoverMediaId",
                value: null);

            migrationBuilder.UpdateData(
                table: "Terms",
                keyColumn: "Id",
                keyValue: 1013,
                column: "CoverMediaId",
                value: null);

            migrationBuilder.CreateIndex(
                name: "UQ_MediaAssets_ContentHash",
                table: "MediaAssets",
                column: "ContentHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "UQ_MediaUsages_Media_Content_Kind",
                table: "MediaUsages",
                columns: new[] { "MediaId", "ContentItemId", "UsageKind" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_Articles_MediaAssets_Cover",
                table: "Articles",
                column: "CoverMediaId",
                principalTable: "MediaAssets",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_CaseImages_MediaAssets",
                table: "CaseImages",
                column: "MediaId",
                principalTable: "MediaAssets",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_ClinicPhotos_MediaAssets",
                table: "ClinicPhotos",
                column: "MediaId",
                principalTable: "MediaAssets",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Concerns_MediaAssets_Cover",
                table: "Concerns",
                column: "CoverMediaId",
                principalTable: "MediaAssets",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Doctors_MediaAssets_Photo",
                table: "Doctors",
                column: "PhotoMediaId",
                principalTable: "MediaAssets",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Pages_MediaAssets_Cover",
                table: "Pages",
                column: "CoverMediaId",
                principalTable: "MediaAssets",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_SeoMeta_MediaAssets",
                table: "SeoMeta",
                column: "OgImageMediaId",
                principalTable: "MediaAssets",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Terms_MediaAssets_Cover",
                table: "Terms",
                column: "CoverMediaId",
                principalTable: "MediaAssets",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_TreatmentImages_MediaAssets",
                table: "TreatmentImages",
                column: "MediaId",
                principalTable: "MediaAssets",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Treatments_MediaAssets_Cover",
                table: "Treatments",
                column: "CoverMediaId",
                principalTable: "MediaAssets",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }
    }
}
