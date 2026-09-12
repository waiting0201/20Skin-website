using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Skin20.Api.Data.Migrations
{
    /// <summary>
    /// robots.txt 的種子值加上兩行警語（不封鎖 AI 爬蟲、不要寫 Disallow: /admin/）。
    ///
    /// <para>
    /// 這兩行必須是**值的一部分**，不是程式碼註解 —— 它們要出現在後台的編輯框裡，
    /// 給實際會改這個欄位的人看。robots.txt 自 2026-09-12 起由建置期從這個設定產生
    /// （docs/08 §H），原本靜態檔上的那幾行註解沒有別的地方可以活下來。
    /// </para>
    /// <para>
    /// 🔴 <b>每一個字串常值都要 <c>N</c> 前綴。</b> 少了它，SQL Server 會先把常值當成
    /// varchar（走資料庫定序的編碼頁）再轉成 nvarchar —— 中文多半活得下來，
    /// 但 <c>⚠️</c> 這類 BMP 外的字元會變成 <c>??</c>。
    /// 而且<b>不會有錯誤</b>：遷移照跑成功，只是字沒了。2026-09-12 實際踩到。
    /// </para>
    /// <para>
    /// 🔴 <b>只在值仍是原始種子時才更新。</b> EF 產出的 <c>UpdateData</c> 是無條件覆蓋 ——
    /// 院方若已經在後台改過 robots.txt，那次改動會被這支遷移靜靜地蓋掉。
    /// 遷移可以補預設值，但不可以覆寫使用者的資料。
    /// </para>
    /// </summary>
    public partial class SeedRobotsTxtGuardrails : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                UPDATE SiteSettings
                SET    SettingValue = N'# ⚠️ 不封鎖 AI 爬蟲（GPTBot／ClaudeBot／PerplexityBot…）——
#    讀得到內容是 GEO 策略的先決條件（docs/03-seo-geo.md §1）。
# ⚠️ 不要寫 Disallow: /admin/ —— 後台就在 /admin/，寫進公開檔案等於標示位置。
#    擋索引由該路由的 X-Robots-Tag 負責，不是靠這裡。

User-agent: *
Allow: /
Disallow: /search/

Sitemap: https://20skin.tw/sitemap.xml'
                WHERE  SettingKey   = N'seo.robotsTxt'
                  AND  SettingValue = N'User-agent: *
Allow: /
Disallow: /search/

Sitemap: https://20skin.tw/sitemap.xml';
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                UPDATE SiteSettings
                SET    SettingValue = N'User-agent: *
Allow: /
Disallow: /search/

Sitemap: https://20skin.tw/sitemap.xml'
                WHERE  SettingKey   = N'seo.robotsTxt'
                  AND  SettingValue = N'# ⚠️ 不封鎖 AI 爬蟲（GPTBot／ClaudeBot／PerplexityBot…）——
#    讀得到內容是 GEO 策略的先決條件（docs/03-seo-geo.md §1）。
# ⚠️ 不要寫 Disallow: /admin/ —— 後台就在 /admin/，寫進公開檔案等於標示位置。
#    擋索引由該路由的 X-Robots-Tag 負責，不是靠這裡。

User-agent: *
Allow: /
Disallow: /search/

Sitemap: https://20skin.tw/sitemap.xml';
            ");
        }
    }
}
