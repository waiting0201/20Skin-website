using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Skin20.Api.Data.Migrations
{
    /// <summary>
    /// 讓選單跟著內容單元走，不再是第二份資料（CLAUDE.md 決策 29）。
    ///
    /// <para>
    /// 🔴 <b>要解的問題：</b>選單的 48 個節點原本全部是手打的名稱與路徑（<c>LinkKind=2</c>），
    /// 也就是每個療程分類、困擾、據點在資料庫裡都有兩份。正式站已經因此分岔：
    /// 同一個 <c>skincare</c> 分類，「分類與標籤」叫「膚質改善」、選單叫「醫美保養」；
    /// 兩邊的排序也各是一份，所以 header 的子選單順序與療程總覽頁不一樣。
    /// </para>
    ///
    /// <para>這支做三件事，全部是資料層面的「接線」，不刪任何一列：</para>
    /// <list type="number">
    /// <item>手打路徑若剛好等於某一筆內容的 <c>UrlPath</c>，改成指向那筆內容（網址從此跟著內容走）。</item>
    /// <item>名稱與該內容的標題一字不差時清空 —— 空名稱＝「跟著內容的標題」。
    /// 不一樣的（頁尾「關於 20SKIN」指向標題為「品牌理念」的頁面）保留為覆寫。</item>
    /// <item>四段子選單（困擾／療程分類／文章分類／據點）改成自動帶入該單元。</item>
    /// </list>
    ///
    /// <para>
    /// 🔴 <b>刻意不刪自存的子項目列。</b> 兩個理由：
    /// ① CI 是「先遷移、後部署」，中間有一段新 schema 配舊程式（決策 8）——
    /// 舊程式不認得 <c>AutoChildren</c>，子項目列要是被刪掉，那一小段時間前台的子選單會整個消失；
    /// ② 院方把某一段切回「自己維護」時，原本那幾列還在。
    /// 新程式會忽略它們（<c>PublicContentHandler.MenuAsync</c>），所以不會重複顯示。
    /// </para>
    ///
    /// <para>
    /// ⚠️ 只對「現在就有子項目」的節點設自動帶入 —— 否則某個原本沒有子選單的節點
    /// （例如頁尾只放一條連結的據點）會突然長出一整排。
    /// </para>
    ///
    /// <para>
    /// ⚠️ 已知的可見變化：頁尾「肌膚困擾」那一欄原本是院方挑的 4 項，自動帶入之後是全部 8 項。
    /// 這是這個決策的直接結果（一份資料），不是漏改。
    /// </para>
    /// </summary>
    public partial class MenuFollowsContentUnits : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<byte>(
                name: "AutoChildren",
                table: "MenuItems",
                type: "tinyint",
                nullable: false,
                defaultValue: (byte)0)
                .Annotation("Relational:DefaultConstraintName", "DF_MenuItems_AutoChildren");

            migrationBuilder.AddCheckConstraint(
                name: "CK_MenuItems_AutoChildren",
                table: "MenuItems",
                sql: "[AutoChildren] BETWEEN 0 AND 4");

            // ① 手打路徑 → 指向內容。
            // ⚠️ 只在「這個網址剛好對到唯一一筆內容」時才轉 —— 對到兩筆的話沒有辦法
            //    知道院方指的是哪一筆，寧可維持手打路徑（行為不變）。
            // 🔴 **兩個欄位的定序不一樣，比對一定要明寫 COLLATE**：`ContentItems.UrlPath`
            //    是 Latin1_General_100_BIN2（網址做位元組比對，docs/08 §0 決策三），
            //    `MenuItems.Url` 用資料庫預設的 Chinese_Taiwan_Stroke_CI_AS。
            //    少了它 SQL Server 直接拒絕執行（Msg 468，實際踩到），不是安靜地比錯。
            migrationBuilder.Sql("""
                UPDATE m
                SET    m.LinkKind      = 1,
                       m.ContentItemId = ci.Id,
                       m.Url           = NULL,
                       m.Label         = CASE WHEN m.Label = ci.Title THEN N'' ELSE m.Label END
                FROM   MenuItems m
                INNER JOIN ContentItems ci ON ci.UrlPath = m.Url COLLATE Latin1_General_100_BIN2
                WHERE  m.LinkKind = 2
                  AND  (SELECT COUNT(*) FROM ContentItems c2
                        WHERE c2.UrlPath = m.Url COLLATE Latin1_General_100_BIN2) = 1;
                """);

            // ② 四段子選單改成自動帶入對應單元。以「這個節點指向哪一頁」判斷，不靠名稱。
            foreach (var (urlPath, source) in new[]
            {
                ("/concerns/", 1),   // MenuAutoChildren.Concern
                ("/treatments/", 2), // MenuAutoChildren.TreatmentCategory
                ("/blog/", 3),       // MenuAutoChildren.ArticleCategory
                ("/clinics/", 4),    // MenuAutoChildren.Clinic
            })
            {
                migrationBuilder.Sql($"""
                    UPDATE m
                    SET    m.AutoChildren = {source}
                    FROM   MenuItems m
                    INNER JOIN ContentItems ci ON ci.Id = m.ContentItemId
                    WHERE  m.ParentId IS NULL
                      AND  ci.UrlPath = '{urlPath}'
                      AND  EXISTS (SELECT 1 FROM MenuItems c WHERE c.ParentId = m.Id);
                    """);
            }
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // ① 的反向：把指向內容的節點還原成手打路徑與名稱。
            // ⚠️ 名稱用 COALESCE：空的代表原本就是「跟著內容」，還原時填回內容當下的標題。
            migrationBuilder.Sql("""
                UPDATE m
                SET    m.LinkKind      = 2,
                       m.Url           = ci.UrlPath,
                       m.ContentItemId = NULL,
                       m.Label         = COALESCE(NULLIF(m.Label, N''), ci.Title)
                FROM   MenuItems m
                INNER JOIN ContentItems ci ON ci.Id = m.ContentItemId
                WHERE  m.LinkKind = 1 AND ci.UrlPath IS NOT NULL;
                """);

            migrationBuilder.DropCheckConstraint(
                name: "CK_MenuItems_AutoChildren",
                table: "MenuItems");

            migrationBuilder.DropColumn(
                name: "AutoChildren",
                table: "MenuItems")
                .Annotation("Relational:DefaultConstraintName", "DF_MenuItems_AutoChildren");
        }
    }
}
