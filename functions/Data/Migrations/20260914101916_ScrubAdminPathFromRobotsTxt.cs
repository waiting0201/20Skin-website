using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Skin20.Api.Data.Migrations
{
    /// <summary>
    /// 把「後台就在 /admin/」那兩行從 robots.txt 的值裡拿掉（2026-09-14 院方指示「後台不要被搜尋到」）。
    ///
    /// <para>
    /// 🔴 <b>那句警語本身是對的，放的位置是錯的。</b> 這個設定值會原樣變成
    /// <c>https://20skin.tw/robots.txt</c> —— 全世界都讀得到。在裡面寫「不要寫
    /// Disallow: /admin/，因為後台就在 /admin/」等於親手做了它要防的事：
    /// 主動把後台位置公告出去。<c>SeedRobotsTxtGuardrails</c>（2026-09-12）把它放進值裡，
    /// 是因為當時只想到「要讓改這個欄位的人看到」，漏掉了「值＝公開檔案」。
    /// </para>
    /// <para>
    /// 警語沒有消失，只是搬到只有後台使用者看得到的地方：SitemapSettings 畫面編輯框上方的
    /// 說明，以及 <c>checkRobotsTxt()</c> —— 真的寫下 <c>Disallow: /admin</c> 時會擋下存檔。
    /// </para>
    /// <para>
    /// ⚠️ 擋索引本來就不靠 robots.txt：<c>/admin/*</c> 由 <c>staticwebapp.config.json</c> 送
    /// <c>X-Robots-Tag: noindex, nofollow</c>，後台 HTML 另有 <c>meta robots</c>。
    /// </para>
    /// <para>
    /// 🔴 <b>每一個字串常值都要 <c>N</c> 前綴</b>（同 <c>SeedRobotsTxtGuardrails</c>）：少了它，
    /// <c>⚠️</c> 這類 BMP 外的字元會靜靜地變成 <c>??</c>，而遷移照跑成功。
    /// </para>
    /// <para>
    /// 🔴 <b>只在值仍是上一版種子時才更新</b> —— EF 產出的 <c>UpdateData</c> 是無條件覆蓋，
    /// 院方若已經在後台改過 robots.txt，那次改動會被靜靜蓋掉。這裡改用帶 WHERE 的 SQL。
    /// </para>
    /// </summary>
    public partial class ScrubAdminPathFromRobotsTxt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                UPDATE SiteSettings
                SET    SettingValue = N'# ⚠️ 不封鎖 AI 爬蟲（GPTBot／ClaudeBot／PerplexityBot…）——
#    讀得到內容是 GEO 策略的先決條件。

User-agent: *
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

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
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
                  AND  SettingValue = N'# ⚠️ 不封鎖 AI 爬蟲（GPTBot／ClaudeBot／PerplexityBot…）——
#    讀得到內容是 GEO 策略的先決條件。

User-agent: *
Allow: /
Disallow: /search/

Sitemap: https://20skin.tw/sitemap.xml';
            ");
        }
    }
}
