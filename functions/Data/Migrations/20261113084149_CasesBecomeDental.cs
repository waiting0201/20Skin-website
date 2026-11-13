using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Skin20.Api.Data.Migrations
{
    /// <summary>
    /// 「案例分享」由「允赫齒科」取代（Tim 定案 2026-11-13，CLAUDE.md 決策 34）。
    ///
    /// <para>四件事，一支做完：</para>
    /// <para>
    /// ① <b>1106 這一筆頁面</b>由系統頁 <c>cases-index</c>（<c>/cases/</c>）改成自由頁 <c>dental</c>
    /// （<c>/dental/</c>）。沿用同一筆而不是新增一筆：主選單那一項以 <c>ContentItemId</c> 指著它
    /// （決策 29），網址與 sitemap 因此自動跟著換。
    /// </para>
    /// <para>
    /// ② <b>已發布快照的標題一併改掉</b>。選單名稱與前台標題讀的是快照、不是 <c>ContentItems.Title</c>
    /// （決策 14、29）—— 只改工作副本的話，選單會一直寫「案例分享」到有人按下發布為止。
    /// 內文不在這裡補：由下一支 migration <c>SeedDentalPageContent</c> 寫入。
    /// </para>
    /// <para>
    /// ③ <b>所有案例下架</b>（<c>Status = 4</c>，資料一筆都不刪）。下架之後它們從 sitemap、站內搜尋、
    /// AI 語料與關聯卡片一起消失（<c>Visibility.PublicFilter</c>）；後台的「案例」入口同一個 commit 拿掉。
    /// </para>
    /// <para>
    /// ④ <b><c>/cases/</c> 與每一則案例的網址 301 到 <c>/dental/</c></b>。規則沒有萬用字元，所以逐筆建。
    /// 前台的 <c>pages/cases/</c> 同一個 commit 刪除，這些網址才會落到查轉址的 catch-all。
    /// </para>
    /// <para>
    /// ⚠️ CI 是先遷移後部署：遷移跑完、新前台還沒上去的那幾分鐘，選單那一項已經指向 <c>/dental/</c>，
    /// 而舊前台沒有這個路由（404）。視窗很短，但它是存在的。
    /// </para>
    /// </summary>
    public partial class CasesBecomeDental : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.UpdateData(
                table: "ContentItems",
                keyColumn: "Id",
                keyValue: 1106,
                columns: new[] { "IsSystemLocked", "Slug", "Title", "UrlPath" },
                values: new object[] { false, "dental", "允赫齒科", "/dental/" });

            migrationBuilder.UpdateData(
                table: "Pages",
                keyColumn: "Id",
                keyValue: 1106,
                columns: new[] { "PageKind", "SystemKey" },
                values: new object[] { (byte)1, null });

            // ② 已發布快照：標題、slug、型別。內文仍是 null，等匯入腳本發布新的一版。
            migrationBuilder.Sql("""
                UPDATE cv SET
                    Title = N'允赫齒科',
                    Snapshot = JSON_MODIFY(JSON_MODIFY(JSON_MODIFY(JSON_MODIFY(JSON_MODIFY(cv.Snapshot,
                        '$.title', N'允赫齒科'),
                        '$.slug', 'dental'),
                        '$.urlPath', '/dental/'),
                        '$.fields.pageKind', 1),
                        '$.fields.systemKey', NULL)
                FROM ContentVersions cv
                JOIN ContentItems ci ON ci.PublishedVersionId = cv.Id
                WHERE ci.Id = 1106 AND ISJSON(cv.Snapshot) = 1
                  AND JSON_VALUE(cv.Snapshot, '$.slug') = 'cases';
                """);

            // ④ 轉址要在 ③ 之前建：下架之後仍讀得到 UrlPath，但先建比較不依賴順序以外的假設。
            //    ⚠️ FromPath 有唯一索引，NOT EXISTS 讓這支可以重跑。
            migrationBuilder.Sql("""
                INSERT INTO Redirects (FromPath, ToPath, ToContentItemId, StatusCode, IsActive, Source, IsVerified, CreatedAt)
                SELECT src.FromPath, '/dental/', 1106, 301, 1, 3, 0, SYSUTCDATETIME()
                FROM (
                    SELECT CAST('/cases/' AS nvarchar(400)) COLLATE Latin1_General_100_BIN2 AS FromPath
                    UNION
                    SELECT CAST(ci.UrlPath AS nvarchar(400)) FROM ContentItems ci
                    WHERE ci.ContentType = 5 AND ci.UrlPath IS NOT NULL
                ) src
                WHERE NOT EXISTS (SELECT 1 FROM Redirects r WHERE r.FromPath = src.FromPath);
                """);

            // ③ 案例全部下架（ContentType 5 = Case，Status 4 = 下架）。
            migrationBuilder.Sql("UPDATE ContentItems SET Status = 4 WHERE ContentType = 5 AND Status <> 4;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // ⚠️ 案例的下架**不還原**：遷移前各筆原本是什麼狀態沒有記下來，一律改回「已發布」
            //    會把原本就沒上線的案例推上線。要復原請在後台逐筆發布。
            migrationBuilder.Sql("DELETE FROM Redirects WHERE ToContentItemId = 1106 AND Source = 3 AND FromPath LIKE '/cases/%';");

            migrationBuilder.Sql("""
                UPDATE cv SET
                    Title = N'案例分享',
                    Snapshot = JSON_MODIFY(JSON_MODIFY(JSON_MODIFY(JSON_MODIFY(JSON_MODIFY(cv.Snapshot,
                        '$.title', N'案例分享'),
                        '$.slug', 'cases'),
                        '$.urlPath', '/cases/'),
                        '$.fields.pageKind', 2),
                        '$.fields.systemKey', 'cases-index')
                FROM ContentVersions cv
                JOIN ContentItems ci ON ci.PublishedVersionId = cv.Id
                WHERE ci.Id = 1106 AND ISJSON(cv.Snapshot) = 1
                  AND JSON_VALUE(cv.Snapshot, '$.slug') = 'dental';
                """);

            migrationBuilder.UpdateData(
                table: "ContentItems",
                keyColumn: "Id",
                keyValue: 1106,
                columns: new[] { "IsSystemLocked", "Slug", "Title", "UrlPath" },
                values: new object[] { true, "cases", "案例分享", "/cases/" });

            migrationBuilder.UpdateData(
                table: "Pages",
                keyColumn: "Id",
                keyValue: 1106,
                columns: new[] { "PageKind", "SystemKey" },
                values: new object[] { (byte)2, "cases-index" });
        }
    }
}
