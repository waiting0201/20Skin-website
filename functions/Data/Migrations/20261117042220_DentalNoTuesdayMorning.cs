using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Skin20.Api.Data.Migrations
{
    /// <summary>
    /// 允赫齒科（1106，<c>/dental/</c>）週二早上沒有門診（2026-11-17 院方更正）。
    /// <c>SeedDentalPageContent</c> 寫入的門診時段多了一段「週二 08:30–12:00」，這支把它拿掉。
    ///
    /// <para>
    /// 工作副本（<c>Pages.BodyBlocks</c>）與<b>已發布快照</b>一起改 —— 前台讀的是快照（決策 14），
    /// 而快照裡的 <c>fields.bodyBlocks</c> 是 JSON 字串，要先解開、改完再塞回去。
    /// </para>
    /// <para>
    /// 🔴 <b>只移除那一段</b>（星期二、08:30 開始），其餘時段原樣保留、排序值重新編成 0..n-1。
    /// 找不到那一段（例如院方已在後台改過）就什麼都不做，重跑安全。
    /// ⚠️ <c>SearchText</c> 是衍生資料，不在這裡修；下次在後台發布會重算，而少一段時間數字不影響搜尋。
    /// </para>
    /// </summary>
    public partial class DentalNoTuesdayMorning : Migration
    {
        /// <summary>產生「把變數 <paramref name="v"/> 這份 JSON 的 businessHours 拿掉週二早上」的 T-SQL。</summary>
        private static string Strip(string v) => $"""
            IF ISJSON({v}) = 1 AND EXISTS (
                SELECT 1 FROM OPENJSON({v}, '$.businessHours')
                WITH (dayOfWeek int '$.dayOfWeek', startTime nvarchar(10) '$.startTime')
                WHERE dayOfWeek = 2 AND startTime = '08:30')
            BEGIN
                SET {v} = JSON_MODIFY({v}, '$.businessHours', JSON_QUERY(ISNULL((
                    SELECT h.dayOfWeek, h.startTime, h.endTime,
                           CAST(ROW_NUMBER() OVER (ORDER BY h.sortOrder, h.idx) - 1 AS int) AS sortOrder
                    FROM (
                        SELECT CAST(o.[key] AS int) AS idx, x.dayOfWeek, x.startTime, x.endTime, x.sortOrder
                        FROM OPENJSON({v}, '$.businessHours') o
                        CROSS APPLY OPENJSON(o.value)
                        WITH (dayOfWeek int '$.dayOfWeek', startTime nvarchar(10) '$.startTime',
                              endTime nvarchar(10) '$.endTime', sortOrder int '$.sortOrder') x
                    ) h
                    WHERE NOT (h.dayOfWeek = 2 AND h.startTime = '08:30')
                    ORDER BY h.sortOrder, h.idx
                    FOR JSON PATH), '[]')));
                SET @changed = 1;
            END
            """;

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql($"""
                IF EXISTS (SELECT 1 FROM ContentItems WHERE Id = 1106 AND Slug = 'dental')
                BEGIN
                    DECLARE @changed bit = 0;
                    DECLARE @body nvarchar(max) = (SELECT BodyBlocks FROM Pages WHERE Id = 1106);
                    {Strip("@body")}
                    IF @changed = 1
                    BEGIN
                        UPDATE Pages SET BodyBlocks = @body WHERE Id = 1106;
                        UPDATE ContentItems SET UpdatedAt = SYSUTCDATETIME() WHERE Id = 1106;
                    END

                    SET @changed = 0;
                    DECLARE @versionId int, @snap nvarchar(max), @sb nvarchar(max);
                    SELECT @versionId = cv.Id, @snap = cv.Snapshot
                    FROM ContentVersions cv
                    JOIN ContentItems ci ON ci.PublishedVersionId = cv.Id
                    WHERE ci.Id = 1106 AND ISJSON(cv.Snapshot) = 1;

                    SET @sb = (SELECT bodyBlocks FROM OPENJSON(@snap, '$.fields')
                               WITH (bodyBlocks nvarchar(max) '$.bodyBlocks'));
                    {Strip("@sb")}
                    IF @changed = 1
                        UPDATE ContentVersions
                        SET Snapshot = JSON_MODIFY(@snap, '$.fields.bodyBlocks', @sb)
                        WHERE Id = @versionId;
                END
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // 刻意不還原：這是內容更正，不是結構。退版時把錯的時段加回去沒有意義。
        }
    }
}
