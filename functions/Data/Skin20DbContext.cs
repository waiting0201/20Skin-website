using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Metadata.Conventions;
using Skin20.Api.Data.Seed;
using Skin20.Api.Models.Entities;

namespace Skin20.Api.Data;

/// <summary>
/// schema 的真實來源（docs/07-deployment.md §5、docs/08-database.md §J）。
///
/// <para>
/// 37 張表，以功能單元劃分：A 帳號與權限 7／B 內容主幹 5／C 九個內容模型 16／
/// D 內容關聯 1／E 媒體庫 2／F FAQ 題庫成長 1／G 站台編排 4／H SEO 與 301 共 1。
/// </para>
///
/// <para>
/// ⚠️ <b>絕不在執行期呼叫 <c>Database.Migrate()</c></b>（docs/11 §13 第一條紅線）——
/// 遷移一律走 CI 的 <c>efbundle</c>。執行期身分只有 DML 權限，連 DDL 都做不到。
/// </para>
/// </summary>
public sealed class Skin20DbContext(DbContextOptions<Skin20DbContext> options) : DbContext(options)
{
    // ── A. 帳號與權限（7）────────────────────────────────────────────
    public DbSet<User> Users => Set<User>();
    public DbSet<Role> Roles => Set<Role>();
    public DbSet<UserRole> UserRoles => Set<UserRole>();
    public DbSet<Permission> Permissions => Set<Permission>();
    public DbSet<RolePermission> RolePermissions => Set<RolePermission>();
    public DbSet<LoginThrottle> LoginThrottles => Set<LoginThrottle>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();

    // ── B. 內容主幹（5）──────────────────────────────────────────────
    public DbSet<ContentItem> ContentItems => Set<ContentItem>();
    public DbSet<ContentVersion> ContentVersions => Set<ContentVersion>();
    public DbSet<ContentReview> ContentReviews => Set<ContentReview>();
    public DbSet<SeoMeta> SeoMetas => Set<SeoMeta>();
    public DbSet<RiskTerm> RiskTerms => Set<RiskTerm>();

    // ── C. 九個內容模型（16，TPT）────────────────────────────────────
    public DbSet<Treatment> Treatments => Set<Treatment>();
    public DbSet<TreatmentImage> TreatmentImages => Set<TreatmentImage>();
    public DbSet<Doctor> Doctors => Set<Doctor>();
    public DbSet<DoctorTag> DoctorTags => Set<DoctorTag>();
    public DbSet<DoctorCredential> DoctorCredentials => Set<DoctorCredential>();
    public DbSet<DoctorSchedule> DoctorSchedules => Set<DoctorSchedule>();
    public DbSet<Concern> Concerns => Set<Concern>();
    public DbSet<Article> Articles => Set<Article>();
    public DbSet<Case> Cases => Set<Case>();
    public DbSet<CaseImage> CaseImages => Set<CaseImage>();
    public DbSet<Faq> Faqs => Set<Faq>();
    public DbSet<Clinic> Clinics => Set<Clinic>();
    public DbSet<ClinicBusinessHour> ClinicBusinessHours => Set<ClinicBusinessHour>();
    public DbSet<ClinicPhoto> ClinicPhotos => Set<ClinicPhoto>();
    public DbSet<Page> Pages => Set<Page>();
    public DbSet<Term> Terms => Set<Term>();

    // ── D–H ──────────────────────────────────────────────────────────
    public DbSet<ContentRelation> ContentRelations => Set<ContentRelation>();
    public DbSet<MediaAsset> MediaAssets => Set<MediaAsset>();
    public DbSet<MediaUsage> MediaUsages => Set<MediaUsage>();
    public DbSet<QuestionInbox> QuestionInboxItems => Set<QuestionInbox>();
    public DbSet<SiteSetting> SiteSettings => Set<SiteSetting>();
    public DbSet<HomeSection> HomeSections => Set<HomeSection>();
    public DbSet<HomeSectionItem> HomeSectionItems => Set<HomeSectionItem>();
    public DbSet<MenuItem> MenuItems => Set<MenuItem>();
    public DbSet<Redirect> Redirects => Set<Redirect>();

    protected override void ConfigureConventions(ModelConfigurationBuilder builder)
    {
        // 時間欄一律 datetime2(0) 存 UTC（docs/08 §2.2、docs/11 §12）。
        builder.Properties<DateTime>().HaveColumnType("datetime2(0)");
        builder.Properties<DateOnly>().HaveColumnType("date");
        builder.Properties<TimeOnly>().HaveColumnType("time(0)");

        // ⚠️ EF 預設每條外鍵都自動建索引。本 schema 外鍵數十條，多餘索引是純負擔
        //    ——索引只留各 Configuration 裡明列的那些。
        //    （NTI 專案踩過：35 條 FK ＝ 35 個沒人用的索引）
        builder.Conventions.Remove(typeof(ForeignKeyIndexConvention));
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // ⚠️ 少了這行，DEFAULT 會拿到 SQL Server 隨機命名（DF__ContentIt__Sort__1B0907CE），
        //    每個環境都不同。之後「改預設值」的 migration 會在 dev 跑得過、在 prod 炸掉
        //    （docs/11 §13：不要依賴約束的名稱）。docs/08 §J-1 要求所有約束具名。
        modelBuilder.UseNamedDefaultConstraints();

        modelBuilder.ApplyConfigurationsFromAssembly(typeof(Skin20DbContext).Assembly);

        ForceWriteBooleansWithTrueDefault(modelBuilder);

        // 種子資料（docs/08 §J-4）。⚠️ 順序有相依：分類與系統頁沒建好就匯內容，
        //    療程與文章沒有分類可掛。
        SeedData.Apply(modelBuilder);
    }

    /// <summary>
    /// 預設值為 <c>true</c> 的 bool 欄位必須明確寫入，不能讓 EF 省略。
    ///
    /// <para>
    /// ⚠️ <c>HasDefaultValue(true)</c> 會讓 EF 在值等於 CLR 預設（<c>false</c>）時
    /// <b>把整欄從 INSERT 拿掉</b>、改用資料庫預設值——於是 <c>IsActive = false</c>
    /// 進 DB 變成 1，而且沒有任何錯誤訊息。
    /// </para>
    /// <para>
    /// 本 schema 受影響的是 <c>ContentItems.IncludeInSitemap</c>、<c>Redirects.IsActive</c>
    /// 這類「預設開啟」的旗標——「先建好、暫不納入 sitemap」會被靜默改成納入。
    /// 這裡統一掃全模型修掉，不依賴每個 Configuration 自己記得。
    /// </para>
    /// </summary>
    private static void ForceWriteBooleansWithTrueDefault(ModelBuilder modelBuilder)
    {
        foreach (var entity in modelBuilder.Model.GetEntityTypes())
        {
            foreach (var property in entity.GetProperties())
            {
                if (property.ClrType != typeof(bool)) continue;
                if (property.GetDefaultValue() is not true) continue;
                // IMutableProperty 沒有 SetValueGenerated 方法，只有可寫屬性。
                property.ValueGenerated = ValueGenerated.Never;
                property.SetAfterSaveBehavior(PropertySaveBehavior.Save);
            }
        }
    }
}
