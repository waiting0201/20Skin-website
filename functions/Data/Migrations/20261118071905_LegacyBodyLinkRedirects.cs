using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Skin20.Api.Data.Migrations
{
    /// <summary>
    /// 舊文章內文連結的 301（2026-11-18，決策 36）。
    ///
    /// <para>
    /// 內文開始渲染行內連結之後，<c>verify:links</c> 抓到 6 條指不到的站內連結。都是舊 blog／舊主站的網址，
    /// 而對照表裡沒有它們：
    /// </para>
    /// <list type="bullet">
    /// <item><c>/blog/oligio_vs_thermage/</c> —— 舊 blog 自己就轉到 <c>oligio_vs_thermage-2</c>，新站的 slug 是 <c>oligio-vs-thermage-2</c>。</item>
    /// <item><c>/blog/targetcool/</c>、<c>/blog/baby-laser-lazy-bag/</c>、<c>/blog/acne-scar-laser-treatment/</c> ——
    ///   這三篇在舊 blog 還在、匯入時也抓了，但新站已經沒有（連同五篇外泌體相關文章，正式站與本機都不存在）。
    ///   轉到同主題的頁面：TargetCool 療程頁、「鳳凰光不是除斑雷射？」、「痘疤治療選哪個好？」。</item>
    /// <item><c>/blog/台中凹疤-修復推薦！…/</c> —— 舊 blog 的中文 slug，匯入的 391 篇裡沒有這一篇，轉到同一篇痘疤總覽。</item>
    /// <item><c>/service_info01-1.php</c> —— 2019 年版舊主站的「PicoSure 蜂巢皮秒雷射」頁（Wayback Machine 確認），
    ///   轉到皮秒療程頁（與 <c>product01-d01.php</c> 同一個目標）。</item>
    /// </list>
    /// <para>
    /// ⚠️ 用 migration 而不是後台：正式資料只有後台畫面與 migration 兩條路（決策 34），而這幾條是工程端查出來的。
    /// ⚠️ <c>FromPath</c> 存的是**解碼後**、小寫的路徑（與 <c>RedirectHandler.NormalizePath</c> 一致，中文 slug 也是）。
    /// ⚠️ 目標頁不存在（例如被下架）就不建，以免建出一條轉到 404 的規則；<c>FromPath</c> 已有規則也不動。
    /// </para>
    /// </summary>
    public partial class LegacyBodyLinkRedirects : Migration
    {
        private const string Rows = """
            (N'/blog/oligio_vs_thermage/', N'/blog/oligio-vs-thermage-2/'),
            (N'/blog/targetcool/', N'/treatments/skincare/targetcool/'),
            (N'/blog/baby-laser-lazy-bag/', N'/blog/clearbrilliant-not-spot-removal-laser/'),
            (N'/blog/acne-scar-laser-treatment/', N'/blog/acne-scar-treatments/'),
            (N'/blog/台中凹疤-修復推薦！皮膚科醫師解析凹洞-凹疤-痘/', N'/blog/acne-scar-treatments/'),
            (N'/service_info01-1.php', N'/treatments/photoelectric/picosure-pro/')
            """;

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Source 3 ＝ 手動（同 CasesBecomeDental）。ToContentItemId 指著目標內容，網址日後改了規則跟著走。
            migrationBuilder.Sql($"""
                INSERT INTO Redirects (FromPath, ToPath, ToContentItemId, StatusCode, IsActive, Source, IsVerified, CreatedAt)
                SELECT src.FromPath, src.ToPath, ci.Id, 301, 1, 3, 1, SYSUTCDATETIME()
                FROM (VALUES {Rows}) AS src(FromPath, ToPath)
                JOIN ContentItems ci
                  ON ci.UrlPath = CAST(src.ToPath AS nvarchar(400)) COLLATE Latin1_General_100_BIN2
                 AND ci.Status = 3
                WHERE NOT EXISTS (
                    SELECT 1 FROM Redirects r
                    WHERE r.FromPath = CAST(src.FromPath AS nvarchar(400)) COLLATE Latin1_General_100_BIN2);
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql($"""
                DELETE r FROM Redirects r
                JOIN (VALUES {Rows}) AS src(FromPath, ToPath)
                  ON r.FromPath = CAST(src.FromPath AS nvarchar(400)) COLLATE Latin1_General_100_BIN2
                 AND r.ToPath = CAST(src.ToPath AS nvarchar(400)) COLLATE Latin1_General_100_BIN2
                WHERE r.Source = 3;
                """);
        }
    }
}
