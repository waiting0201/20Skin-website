using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Skin20.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddSitemapFilesSetting : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                table: "SiteSettings",
                columns: new[] { "SettingKey", "SettingValue", "UpdatedAt", "UpdatedByUserId", "ValueType" },
                values: new object[] { "seo.sitemapFiles", "[{\"key\":\"pages\",\"label\":\"固定頁面\",\"fileName\":\"sitemap-pages.xml\",\"sourceUnits\":[\"page\",\"clinic\",\"case\",\"faq\"],\"enabled\":true,\"defaultChangeFreq\":\"monthly\",\"defaultPriority\":0.5},{\"key\":\"treatments\",\"label\":\"療程\",\"fileName\":\"sitemap-treatments.xml\",\"sourceUnits\":[\"treatment\",\"term\"],\"enabled\":true,\"defaultChangeFreq\":\"weekly\",\"defaultPriority\":0.8},{\"key\":\"concerns\",\"label\":\"困擾\",\"fileName\":\"sitemap-concerns.xml\",\"sourceUnits\":[\"concern\"],\"enabled\":true,\"defaultChangeFreq\":\"weekly\",\"defaultPriority\":0.7},{\"key\":\"doctors\",\"label\":\"醫師\",\"fileName\":\"sitemap-doctors.xml\",\"sourceUnits\":[\"doctor\"],\"enabled\":true,\"defaultChangeFreq\":\"monthly\",\"defaultPriority\":0.6},{\"key\":\"blog\",\"label\":\"文章\",\"fileName\":\"sitemap-blog.xml\",\"sourceUnits\":[\"article\",\"term\"],\"enabled\":true,\"defaultChangeFreq\":\"weekly\",\"defaultPriority\":0.6}]", new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, (byte)4 });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "SiteSettings",
                keyColumn: "SettingKey",
                keyValue: "seo.sitemapFiles");
        }
    }
}
