using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Skin20.Api.Data.Migrations
{
    /// <summary>
    /// 頁面 1114（<c>/about/makeup-style/</c>）的標題改回「彩妝式輕醫美」，
    /// 撤銷 <c>RenameMakeupStylePageTitle</c>（2026-09-14）。
    ///
    /// <para>
    /// 🔴 <b>為什麼撤銷：兩頁同名讓前台文案出現「新中式美學與新中式美學」。</b>
    /// <c>/about/new-chinese-aesthetics/</c> 本來就叫「新中式美學」，1114 改成同一個名字
    /// 之後，凡是並列兩頁的句子都變成同一個詞講兩次（首頁品牌理念兩格、404 的品牌理念
    /// 說明、<c>/about/</c> 的 meta description、AI FAQ 兩題）。2026-09-17 Tim 指定
    /// 改回舊名，<b>只有首頁 hero 維持「新中式美學」</b>。
    /// </para>
    /// <para>
    /// ✅ <b>這其實是把工作副本拉回與已發布快照一致。</b> 遷移 10 只改到
    /// <c>ContentItems.Title</c>（工作副本）；公開端點讀的是**已核准的版本快照**，
    /// 而那份從頭到尾都是「彩妝式輕醫美」—— 所以正式站上的名稱從來沒有真的變過。
    /// </para>
    /// <para>
    /// 🔴 <b>只在值仍是遷移 10 寫下的那個值時才更新</b>（同 <c>SeedRobotsTxtGuardrails</c>
    /// 與 <c>ScrubAdminPathFromRobotsTxt</c>）—— EF 產出的 <c>UpdateData</c> 是無條件覆蓋，
    /// 院方若已經在後台把這一頁改成別的名字，那次改動會被靜靜蓋掉。
    /// </para>
    /// <para>
    /// 🔴 <b>字串常值一律加 <c>N</c> 前綴</b>：少了它，非 ASCII 字元會靜靜變成 <c>?</c>，
    /// 而遷移照跑成功。
    /// </para>
    /// </summary>
    public partial class RevertMakeupStylePageTitle : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                UPDATE ContentItems
                SET    Title = N'彩妝式輕醫美'
                WHERE  Id    = 1114
                  AND  Title = N'新中式美學';
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                UPDATE ContentItems
                SET    Title = N'新中式美學'
                WHERE  Id    = 1114
                  AND  Title = N'彩妝式輕醫美';
            ");
        }
    }
}
