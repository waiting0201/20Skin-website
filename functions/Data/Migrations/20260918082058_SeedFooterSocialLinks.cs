using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Skin20.Api.Data.Migrations
{
    /// <summary>
    /// 把前台原本寫死的兩筆 Facebook 連結搬進 <c>footer.social.json</c>。
    ///
    /// <para>
    /// 🔴 <b>為什麼需要這一支：</b>2026-09-18 之前，頁尾的社群連結在後台編得動、存得起來，
    /// 但公開端點不回傳它、前台也不讀它（<c>navigation.ts</c> 的 <c>SOCIAL_LINKS</c> 是字面值）。
    /// 現在前台改成讀這個鍵，而種子值是空陣列 —— 不補這一支，改版當下頁尾的社群圖示會<b>整排消失</b>。
    /// </para>
    ///
    /// <para>
    /// ⚠️ <b>只在還是空值時才寫</b>。院方若已經在後台編過這一欄，這支不可以把人家的設定蓋掉；
    /// 遷移必須向後相容（CLAUDE.md 決策 8），而「無條件覆寫使用者資料」不算相容。
    /// </para>
    ///
    /// <para>⚠️ <c>Down</c> 只清掉這支寫進去的那一份值，同樣以內容比對，不動院方後來改過的值。</para>
    /// </summary>
    public partial class SeedFooterSocialLinks : Migration
    {
        private const string SeedValue =
            """[{"label":"四季診所 Facebook","url":"https://www.facebook.com/20skin4g88/"},{"label":"20SKIN 美醫集團 Facebook","url":"https://www.facebook.com/20skin.tw"}]""";

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql($"""
                UPDATE SiteSettings
                SET SettingValue = N'{SeedValue.Replace("'", "''")}'
                WHERE SettingKey = 'footer.social.json'
                  AND (SettingValue IS NULL OR LTRIM(RTRIM(SettingValue)) IN ('', '[]'));
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql($"""
                UPDATE SiteSettings
                SET SettingValue = '[]'
                WHERE SettingKey = 'footer.social.json'
                  AND SettingValue = N'{SeedValue.Replace("'", "''")}';
                """);
        }
    }
}
