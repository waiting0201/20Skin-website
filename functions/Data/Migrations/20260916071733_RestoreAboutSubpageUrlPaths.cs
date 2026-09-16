using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Skin20.Api.Data.Migrations
{
    /// <summary>
    /// 把 `/about/` 兩個子頁被壓平的 <c>UrlPath</c> 修回去（2026-09-16）。
    ///
    /// <para>
    /// 種子給的一直是對的（<c>/about/new-chinese-aesthetics/</c>、<c>/about/makeup-style/</c>，
    /// 見 InitialSchema 的 1113／1114）。壞掉是因為
    /// <c>ContentHandler.ComputeUrlPathAsync</c> 對非 System 的 Page 無條件回 <c>/{Slug}/</c>——
    /// <b>那一頁只要在後台被存過一次就會被壓平</b>，而前台那個網址根本不存在。
    /// </para>
    ///
    /// <para>
    /// 🔴 實際後果不是「網址不好看」：<b>sitemap 收了兩個 404 網址、站內搜尋會給出點進去是
    /// 404 的結果</b>。靜態時代 <c>postbuild.mjs</c> 有一層過濾把它們默默刪掉，等於幫這個
    /// 資料錯誤遮了一層；SSR 改版把 sitemap 移到執行期之後那層沒了，才露出來。
    /// </para>
    ///
    /// <para>
    /// ⚠️ <b>這支只修資料，兩件事缺一不可。</b> 不修程式的話那兩頁下次在後台存檔又會被壓平。
    /// 程式那半在同一個 commit：<c>ComputeUrlPathAsync</c> 改成保留既有 <c>UrlPath</c> 的
    /// 父層前綴、只重算最後一段（Tim 定案 2026-09-16，選項 a）。
    /// </para>
    ///
    /// <para>
    /// ⚠️ 用 <c>WHERE</c> 比對舊值而不是無條件覆蓋 —— 在已經正確的環境是 no-op、重跑安全，
    /// 也不會把之後在後台刻意改過的網址蓋掉。
    /// </para>
    /// </summary>
    public partial class RestoreAboutSubpageUrlPaths : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                UPDATE ContentItems SET UrlPath = '/about/new-chinese-aesthetics/'
                WHERE Id = 1113 AND UrlPath = '/new-chinese-aesthetics/';
                """);

            migrationBuilder.Sql("""
                UPDATE ContentItems SET UrlPath = '/about/makeup-style/'
                WHERE Id = 1114 AND UrlPath = '/makeup-style/';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // ⚠️ 刻意不還原成壓平的值 —— 那是個 bug，不是值得回去的狀態。
            //    真要退版，程式那半退掉之後下一次存檔自然會再壓平一次。
        }
    }
}
