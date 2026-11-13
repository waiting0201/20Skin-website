using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Skin20.Api.Data.Migrations
{
    /// <summary>
    /// 允赫齒科頁（1106，<c>/dental/</c>）的初始內容（2026-11-13，CLAUDE.md 決策 34）。
    ///
    /// <para>
    /// 🔴 <b>為什麼內容走 migration 而不是匯入腳本</b>：原本的做法是部署後跑
    /// <c>tools/legacy-import/import-dental.mjs</c>（已刪除）走真正的 API 寫入並發布。對本機可行，
    /// 對正式環境<b>登不進去</b> —— <c>POST /auth/login</c> 有 reCAPTCHA v3，腳本拿不到有效的 token
    /// （<c>BOT_CHECK_FAILED</c>，tools/api-smoke/README.md 早就記過同一件事）。那支腳本已刪除。
    /// </para>
    /// <para>
    /// 三處一起寫：工作副本（<c>Pages.BodyBlocks</c>、<c>ContentItems.Summary</c>）、
    /// <b>已發布快照</b>（前台讀的是它，決策 14）、站內搜尋用的 <c>SearchText</c>。
    /// 內容與本機經 API 發布出來的那一版逐字相同（快照裡 <c>fields.bodyBlocks</c> 是 JSON 字串）。
    /// </para>
    /// <para>
    /// 🔴 <b>只在內文還是空的時候寫入</b>（<c>BodyBlocks IS NULL</c>）：重跑安全，也不會蓋掉院方之後在後台改的內容。
    /// 本機開發庫已經由匯入腳本寫過，這支在本機是 no-op。
    /// </para>
    /// <para>
    /// ⚠️ 沒有寫 SEO 的搜尋結果摘要：頁面沒有自訂摘要時用頁首那句介紹，夠用；要改在後台的 SEO 區塊。
    /// ⚠️ 內容的出處與待院方確認的項目見決策 34（主治項目分組、頁首介紹、門診時段）。
    /// </para>
    /// </summary>
    public partial class SeedDentalPageContent : Migration
    {
        private const string Summary = "20SKIN 美醫集團在二林的牙科診所，健保掛號。從日常的檢查與治療，到矯正、植牙與牙齒美學。";

        /// <summary>
        /// 站內搜尋用的純文字。⚠️ 這是衍生資料：本機經 API 發布時由 <c>SearchTextBuilder</c> 算出來的那一份，原樣貼上。
        /// 院方之後在後台發布會重算，不必手動維護。
        /// </summary>
        private const string SearchText = """
            允赫齒科 20SKIN 美醫集團在二林的牙科診所，健保掛號。從日常的檢查與治療，到矯正、植牙與牙齒美學。 1 04-896-9966 526 彰化縣二林鎮儒林路二段 306 號 現場掛號（健保） https://line.me/ti/p/%40onz0054u https://www.facebook.com/dental20skin/ 允赫齒科．診間 健保掛號。實際的治療方式，由醫師看診後說明。 日常診療 一般牙科 牙周治療 兒童牙科 修復與植牙 假牙製作 微創植牙 齒列矯正 傳統矯正 隱形矯正 美學與雷射 前牙美學 牙齦美容 雷射牙科 1 18:00 20:30 0 2 08:30 12:00 1 3 14:30 16:30 2 5 18:00 20:30 3 6 08:30 12:00 4 開放現場掛號，門診名額有限，請儘早等候。 實際門診時間請以來電確認為主。 car 開車前往 中山高速公路（國道一號）南下，下「北斗／埤頭」交流道，往埤頭、二林方向左轉。 直行斗苑路，約 15 分鐘進入二林市區，會看到麥當勞。 過麥當勞後再往前約 1 分鐘，右手邊有一間 7-11，在這裡左轉大成路一段。 往前過健興街紅綠燈，右邊是全國電子。 下一個路口（壹咖啡）左轉儒林路二段。 允赫齒科在左手邊。 parking 停車 過診所後再往前 50 公尺，右手邊有免費專用停車場。 false
            """;

        /// <summary>鍵名與形狀見 apps/web/app/data/pages.ts 的 DentalDocument。</summary>
        private const string BodyBlocks = """
            {"phone":"04-896-9966","address":"526 彰化縣二林鎮儒林路二段 306 號","registration":"現場掛號（健保）","lineUrl":"https://line.me/ti/p/%40onz0054u","facebookUrl":"https://www.facebook.com/dental20skin/","heroImage":null,"heroCaption":"允赫齒科．診間","servicesNote":"健保掛號。實際的治療方式，由醫師看診後說明。","services":[{"kind":"日常診療","items":["一般牙科","牙周治療","兒童牙科"]},{"kind":"修復與植牙","items":["假牙製作","微創植牙"]},{"kind":"齒列矯正","items":["傳統矯正","隱形矯正"]},{"kind":"美學與雷射","items":["前牙美學","牙齦美容","雷射牙科"]}],"businessHours":[{"dayOfWeek":1,"startTime":"18:00","endTime":"20:30","sortOrder":0},{"dayOfWeek":2,"startTime":"08:30","endTime":"12:00","sortOrder":1},{"dayOfWeek":3,"startTime":"14:30","endTime":"16:30","sortOrder":2},{"dayOfWeek":5,"startTime":"18:00","endTime":"20:30","sortOrder":3},{"dayOfWeek":6,"startTime":"08:30","endTime":"12:00","sortOrder":4}],"hoursNotes":["開放現場掛號，門診名額有限，請儘早等候。","實際門診時間請以來電確認為主。"],"transportInfo":[{"icon":"car","title":"開車前往","points":["中山高速公路（國道一號）南下，下「北斗／埤頭」交流道，往埤頭、二林方向左轉。","直行斗苑路，約 15 分鐘進入二林市區，會看到麥當勞。","過麥當勞後再往前約 1 分鐘，右手邊有一間 7-11，在這裡左轉大成路一段。","往前過健興街紅綠燈，右邊是全國電子。","下一個路口（壹咖啡）左轉儒林路二段。","允赫齒科在左手邊。"]},{"icon":"parking","title":"停車","points":["過診所後再往前 50 公尺，右手邊有免費專用停車場。"]}],"photos":[]}
            """;

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // ⚠️ 內容裡沒有單引號（產生這支時檢查過）；仍然跳脫一次，之後有人改文案才不會壞掉。
            var body = BodyBlocks.Trim().Replace("'", "''");
            var summary = Summary.Replace("'", "''");
            var searchText = SearchText.Trim().Replace("'", "''");

            migrationBuilder.Sql($"""
                IF EXISTS (SELECT 1 FROM Pages WHERE Id = 1106 AND BodyBlocks IS NULL)
                   AND EXISTS (SELECT 1 FROM ContentItems WHERE Id = 1106 AND Slug = 'dental')
                BEGIN
                    DECLARE @body nvarchar(max) = N'{body}';
                    DECLARE @summary nvarchar(max) = N'{summary}';

                    UPDATE Pages SET BodyBlocks = @body WHERE Id = 1106;

                    UPDATE ContentItems
                    SET Summary = @summary,
                        SearchText = N'{searchText}',
                        UpdatedAt = SYSUTCDATETIME()
                    WHERE Id = 1106;

                    UPDATE cv SET Snapshot = JSON_MODIFY(JSON_MODIFY(cv.Snapshot,
                        '$.summary', @summary),
                        '$.fields.bodyBlocks', @body)
                    FROM ContentVersions cv
                    JOIN ContentItems ci ON ci.PublishedVersionId = cv.Id
                    WHERE ci.Id = 1106 AND ISJSON(cv.Snapshot) = 1;
                END
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // 刻意不還原：這是內容，不是結構。退版時把院方可能已經改過的內文清空，比留著糟。
        }
    }
}
