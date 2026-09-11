using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Skin20.Api.Data;

/// <summary>
/// 給 <c>dotnet ef</c> 用的設計期工廠（docs/11-backend-design.md §6.1）。
///
/// <para>
/// 沒有它，<c>dotnet ef migrations add</c> 會去啟動整個 Functions host —— 而那需要
/// 連線字串、Managed Identity 與 Storage 帳戶名稱等執行期設定，在開發機上產 migration
/// 不該需要這些東西。
/// </para>
/// <para>
/// ⚠️ 這裡的連線字串<b>只用來讓 EF 知道目標是 SQL Server</b>，產生 migration 時
/// 不會真的連線。要對真實資料庫執行一律走 CI 的 <c>efbundle</c>（§13 第一條紅線）。
/// 需要對本機容器跑的時候，用環境變數 <c>SKIN20_DESIGN_TIME_SQL</c> 覆寫。
/// </para>
/// </summary>
public sealed class Skin20DbContextFactory : IDesignTimeDbContextFactory<Skin20DbContext>
{
    public Skin20DbContext CreateDbContext(string[] args)
    {
        var connectionString =
            Environment.GetEnvironmentVariable("SKIN20_DESIGN_TIME_SQL")
            ?? "Server=(localdb)\\mssqllocaldb;Database=Skin20_DesignTime;Trusted_Connection=True;";

        var options = new DbContextOptionsBuilder<Skin20DbContext>()
            .UseSqlServer(connectionString)
            .Options;

        return new Skin20DbContext(options);
    }
}
