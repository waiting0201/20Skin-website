using Microsoft.Data.Sqlite;
using Skin20.Api.Common;

namespace Skin20.Api.Tests;

/// <summary>
/// <see cref="Visibility.PublicFilter"/>：前台可見性只看「有沒有一版已核准的內容」，不看工作副本的編輯狀態。
///
/// <para>
/// 用 SQLite 記憶體庫<b>真的執行</b>那段 SQL，而不是只比對字串 —— 條件只用到 <c>IS NULL</c> 與比較，
/// 兩邊語意一致；時間用同一格式的 ISO 字串，字串比較等於時間比較。
/// 這比字串斷言有意義：改寫條件（例如把 <c>&lt;&gt; 4</c> 改成 <c>= 3</c>）時，行為表會直接紅。
/// </para>
/// </summary>
public sealed class VisibilityTests : IDisposable
{
    private static readonly DateTime Now = new(2026, 10, 1, 12, 0, 0, DateTimeKind.Utc);
    private const int Draft = 1, InReview = 2, Published = 3, Unpublished = 4;

    private readonly SqliteConnection _db = new("Data Source=:memory:");

    public VisibilityTests()
    {
        _db.Open();
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "CREATE TABLE ContentItems (Id INTEGER, PublishedVersionId INTEGER NULL, Status INTEGER, PublishAt TEXT NULL, UnpublishAt TEXT NULL)";
        cmd.ExecuteNonQuery();
    }

    public void Dispose() => _db.Dispose();

    private static string Iso(DateTime? t) => t is null ? "" : t.Value.ToString("yyyy-MM-dd HH:mm:ss");

    private bool IsVisible(int? publishedVersionId, int status, DateTime? publishAt = null, DateTime? unpublishAt = null)
    {
        using (var insert = _db.CreateCommand())
        {
            insert.CommandText = "DELETE FROM ContentItems; INSERT INTO ContentItems VALUES (1, @v, @s, @pa, @ua)";
            insert.Parameters.AddWithValue("@v", publishedVersionId is null ? DBNull.Value : publishedVersionId);
            insert.Parameters.AddWithValue("@s", status);
            insert.Parameters.AddWithValue("@pa", publishAt is null ? DBNull.Value : Iso(publishAt));
            insert.Parameters.AddWithValue("@ua", unpublishAt is null ? DBNull.Value : Iso(unpublishAt));
            insert.ExecuteNonQuery();
        }

        using var query = _db.CreateCommand();
        query.CommandText = $"SELECT COUNT(*) FROM ContentItems ci WHERE {Visibility.PublicFilter}";
        query.Parameters.AddWithValue("@Now", Iso(Now));
        return Convert.ToInt32(query.ExecuteScalar()) == 1;
    }

    [Fact]
    public void 已核准且已發布_可見()
        => Assert.True(IsVisible(10, Published));

    [Fact]
    public void 從沒核准過_不可見_即使狀態是已發布()
        // 可見性綁的是 PublishedVersionId，不是 Status 欄。
        => Assert.False(IsVisible(null, Published));

    [Theory]
    [InlineData(Draft)]
    [InlineData(InReview)]
    public void 編輯已上線的頁面_工作副本回到草稿或審核中_頁面仍然可見(int workingCopyStatus)
    {
        // 🔴 這是整段註解在防的症狀：可見性若看 Status = 3，編輯期間那一頁就 404。
        //    2026-09-12 之前 tools/content-export 就是這樣分岔的。
        Assert.True(IsVisible(10, workingCopyStatus));
    }

    [Fact]
    public void 明確下架_不可見_即使有核准版本()
        => Assert.False(IsVisible(10, Unpublished));

    [Fact]
    public void 草稿且沒有核准版本_不可見()
        => Assert.False(IsVisible(null, Draft));

    [Fact]
    public void 排程發布_時間未到不可見_到了才可見()
    {
        Assert.False(IsVisible(10, Published, publishAt: Now.AddMinutes(1)));
        Assert.True(IsVisible(10, Published, publishAt: Now));              // 邊界：<= @Now
        Assert.True(IsVisible(10, Published, publishAt: Now.AddMinutes(-1)));
    }

    [Fact]
    public void 排程下架_時間到了就不可見()
    {
        Assert.True(IsVisible(10, Published, unpublishAt: Now.AddMinutes(1)));
        Assert.False(IsVisible(10, Published, unpublishAt: Now));           // 邊界：> @Now，等於 Now 已下架
        Assert.False(IsVisible(10, Published, unpublishAt: Now.AddMinutes(-1)));
    }

    [Fact]
    public void 時間窗內可見_窗外不可見()
    {
        Assert.True(IsVisible(10, Published, Now.AddDays(-1), Now.AddDays(1)));
        Assert.False(IsVisible(10, Published, Now.AddDays(1), Now.AddDays(2)));
        Assert.False(IsVisible(10, Published, Now.AddDays(-2), Now.AddDays(-1)));
    }

    [Fact]
    public void 條件不再以_Status_等於_3_判定()
    {
        // 字串層級的回歸護欄：舊版分岔就是手寫了 `ci.Status = 3`。
        Assert.DoesNotContain("Status = 3", Visibility.PublicFilter);
        Assert.Contains("PublishedVersionId IS NOT NULL", Visibility.PublicFilter);
    }
}
