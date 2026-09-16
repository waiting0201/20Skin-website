using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Skin20.Api.Models.Entities;

namespace Skin20.Api.Data.Configurations;

// ── B. 內容主幹（docs/08-database.md §B）────────────────────────────────

public sealed class ContentItemConfiguration : IEntityTypeConfiguration<ContentItem>
{
    public void Configure(EntityTypeBuilder<ContentItem> b)
    {
        b.ToTable("ContentItems", t =>
        {
            t.HasCheckConstraint("CK_ContentItems_ContentType", "[ContentType] BETWEEN 1 AND 9");
            t.HasCheckConstraint("CK_ContentItems_Status", "[Status] BETWEEN 1 AND 4");
            // 排程下架不可早於排程發布 —— 兩欄都有值時才檢查。
            t.HasCheckConstraint(
                "CK_ContentItems_PublishWindow",
                "[PublishAt] IS NULL OR [UnpublishAt] IS NULL OR [UnpublishAt] > [PublishAt]");
        });

        // ⚠️ **不要在這裡指定 PK 名稱。** TPT 下這個名字會被九個子表一起繼承，
        //    產出的 SQL 會有 10 張表的 PRIMARY KEY 都叫 PK_ContentItems ——
        //    SQL Server 的約束名稱必須整個 schema 唯一，migration 建到第二張子表
        //    就會是「There is already an object named 'PK_ContentItems'」。
        //    交給 EF 依表名產生（PK_ContentItems／PK_Treatments／PK_Doctors…），
        //    那些名字一樣是決定性的，符合 docs/08 §J-1「所有約束具名」的要求。
        b.HasKey(x => x.Id);

        // ⚠️ TPT：九個子表以 Id 同時作 PK 與 FK 掛上來（各子表的 Configuration 負責）。
        b.UseTptMappingStrategy();

        b.Property(x => x.ContentType).HasColumnType("tinyint");
        b.Property(x => x.Status).HasColumnType("tinyint").HasDefaultValue(ContentStatus.Draft);
        b.Property(x => x.Title).HasMaxLength(200).IsRequired();
        b.Property(x => x.Summary).HasMaxLength(500);

        // ⚠️ 長度上限是「搜得到多少」與「搜多久」的取捨，理由寫在 SearchTextBuilder。
        //    有界很重要：它讓全表掃描的資料量有上界（1228 筆 × 4000 字 ≈ 9.8 MB）。
        b.Property(x => x.SearchText).HasMaxLength(Common.SearchTextBuilder.MaxLength);
        b.Property(x => x.IncludeInSitemap).HasDefaultValue(true);
        b.Property(x => x.IsSystemLocked).HasDefaultValue(false);

        // 網址類欄位：位元組比對，不做語言排序（§0 決策三）
        b.Property(x => x.Slug).HasMaxLength(160).UseUrlCollation();
        b.Property(x => x.UrlPath).HasMaxLength(300).UseUrlCollation();

        // 🔴 全站網址唯一性的唯一保證。950 個 URL 分散在九個模型裡，
        //    沒有這條就得靠九支程式各自檢查。FAQ 的 UrlPath 是 NULL，所以要 filtered。
        b.HasIndex(x => x.UrlPath)
            .IsUnique()
            .HasDatabaseName("UQ_ContentItems_UrlPath")
            .HasFilter("[UrlPath] IS NOT NULL");

        // ContentRelations 的複合外鍵要指過來，所以需要這條替代索引鍵（§D）。
        // 有了它，冗餘的 FromContentType／ToContentType 就不可能與這裡不一致。
        b.HasAlternateKey(x => new { x.Id, x.ContentType }).HasName("UQ_ContentItems_Id_ContentType");

        // 後台清單的主查詢
        b.HasIndex(x => new { x.ContentType, x.Status, x.SortOrder })
            .HasDatabaseName("IX_ContentItems_Type_Status_Sort");

        // 排程 Timer 掃描用。絕大多數列為 NULL，所以 filtered。
        b.HasIndex(x => x.PublishAt)
            .HasDatabaseName("IX_ContentItems_PublishAt")
            .HasFilter("[PublishAt] IS NOT NULL");
        b.HasIndex(x => x.UnpublishAt)
            .HasDatabaseName("IX_ContentItems_UnpublishAt")
            .HasFilter("[UnpublishAt] IS NOT NULL");

        b.HasOne<User>().WithMany()
            .HasForeignKey(x => x.OwnerUserId)
            .HasConstraintName("FK_ContentItems_Users_Owner")
            .OnDelete(DeleteBehavior.Restrict);
        b.HasOne<User>().WithMany()
            .HasForeignKey(x => x.CreatedByUserId)
            .HasConstraintName("FK_ContentItems_Users_CreatedBy")
            .OnDelete(DeleteBehavior.Restrict);
        b.HasOne<User>().WithMany()
            .HasForeignKey(x => x.UpdatedByUserId)
            .HasConstraintName("FK_ContentItems_Users_UpdatedBy")
            .OnDelete(DeleteBehavior.Restrict);

        // ⚠️ PublishedVersionId 指向 ContentVersions，而 ContentVersions 又指回這裡 ——
        //    循環參照。這一側必須 NoAction，否則 SQL Server 會拒絕建立（多重串聯路徑）。
        b.HasOne<ContentVersion>().WithMany()
            .HasForeignKey(x => x.PublishedVersionId)
            .HasConstraintName("FK_ContentItems_ContentVersions_Published")
            .OnDelete(DeleteBehavior.NoAction);
    }
}

public sealed class ContentVersionConfiguration : IEntityTypeConfiguration<ContentVersion>
{
    public void Configure(EntityTypeBuilder<ContentVersion> b)
    {
        b.ToTable("ContentVersions");
        b.HasKey(x => x.Id).HasName("PK_ContentVersions");

        b.Property(x => x.Title).HasMaxLength(200).IsRequired();
        b.Property(x => x.Snapshot).IsRequired();       // nvarchar(max)：完整 JSON 快照
        b.Property(x => x.Note).HasMaxLength(300);

        b.HasOne(x => x.ContentItem).WithMany(x => x.Versions)
            .HasForeignKey(x => x.ContentItemId)
            .HasConstraintName("FK_ContentVersions_ContentItems")
            .OnDelete(DeleteBehavior.Cascade);

        b.HasOne<User>().WithMany()
            .HasForeignKey(x => x.CreatedByUserId)
            .HasConstraintName("FK_ContentVersions_Users")
            .OnDelete(DeleteBehavior.Restrict);

        b.HasIndex(x => new { x.ContentItemId, x.VersionNo })
            .IsUnique()
            .HasDatabaseName("UQ_ContentVersions_Item_VersionNo");
    }
}

public sealed class ContentReviewConfiguration : IEntityTypeConfiguration<ContentReview>
{
    public void Configure(EntityTypeBuilder<ContentReview> b)
    {
        b.ToTable("ContentReviews", t =>
        {
            t.HasCheckConstraint("CK_ContentReviews_Status", "[Status] BETWEEN 1 AND 3");
            // 「退回需填原因」寫進資料層，不只在前端驗證 —— 遷移腳本直連 SQL 會繞過 API。
            t.HasCheckConstraint(
                "CK_ContentReviews_RejectNeedsNote",
                "[Status] <> 3 OR ([DecisionNote] IS NOT NULL AND LEN([DecisionNote]) > 0)");
        });

        b.HasKey(x => x.Id).HasName("PK_ContentReviews");
        b.Property(x => x.Status).HasColumnType("tinyint").HasDefaultValue(ReviewStatus.Pending);
        b.Property(x => x.DecisionNote).HasMaxLength(1000);

        b.HasOne(x => x.ContentItem).WithMany()
            .HasForeignKey(x => x.ContentItemId)
            .HasConstraintName("FK_ContentReviews_ContentItems")
            .OnDelete(DeleteBehavior.Cascade);

        // 版本被 Cascade 刪掉時不要連帶多重路徑，這一側 NoAction。
        b.HasOne(x => x.Version).WithMany()
            .HasForeignKey(x => x.VersionId)
            .HasConstraintName("FK_ContentReviews_ContentVersions")
            .OnDelete(DeleteBehavior.NoAction);

        b.HasOne<User>().WithMany()
            .HasForeignKey(x => x.SubmittedByUserId)
            .HasConstraintName("FK_ContentReviews_Users_SubmittedBy")
            .OnDelete(DeleteBehavior.Restrict);
        b.HasOne<User>().WithMany()
            .HasForeignKey(x => x.DecidedByUserId)
            .HasConstraintName("FK_ContentReviews_Users_DecidedBy")
            .OnDelete(DeleteBehavior.Restrict);

        // 審核佇列畫面的主查詢
        b.HasIndex(x => new { x.Status, x.SubmittedAt })
            .HasDatabaseName("IX_ContentReviews_Status_SubmittedAt");

        // 儀表板的「我的退件」
        b.HasIndex(x => new { x.SubmittedByUserId, x.Status })
            .HasDatabaseName("IX_ContentReviews_SubmittedBy_Status");
    }
}

public sealed class SeoMetaConfiguration : IEntityTypeConfiguration<SeoMeta>
{
    public void Configure(EntityTypeBuilder<SeoMeta> b)
    {
        b.ToTable("SeoMeta", t => t.HasCheckConstraint(
            // docs/03 §4 ②：AI 摘要是 40–60 字的直答式段落。留空可以，寫了就要在範圍內。
            "CK_SeoMeta_AiSummaryLength",
            "[AiSummary] IS NULL OR LEN([AiSummary]) BETWEEN 20 AND 300"));

        // PK ＝ FK（1:1）。⚠️ 不用 owned type —— 那會被塞回主表，權限就切不開了。
        b.HasKey(x => x.ContentItemId).HasName("PK_SeoMeta");

        b.Property(x => x.SeoTitle).HasMaxLength(200);
        b.Property(x => x.MetaDescription).HasMaxLength(400);
        b.Property(x => x.CanonicalOverride).HasMaxLength(300);
        b.Property(x => x.AiSummary).HasMaxLength(300);
        b.Property(x => x.NoIndex).HasDefaultValue(false);

        b.HasOne(x => x.ContentItem).WithOne(x => x.Seo)
            .HasForeignKey<SeoMeta>(x => x.ContentItemId)
            .HasConstraintName("FK_SeoMeta_ContentItems")
            .OnDelete(DeleteBehavior.Cascade);

        b.OwnsImage(x => x.OgImage, "OgImage");

        b.HasOne<User>().WithMany()
            .HasForeignKey(x => x.UpdatedByUserId)
            .HasConstraintName("FK_SeoMeta_Users")
            .OnDelete(DeleteBehavior.Restrict);
    }
}

public sealed class RiskTermConfiguration : IEntityTypeConfiguration<RiskTerm>
{
    public void Configure(EntityTypeBuilder<RiskTerm> b)
    {
        b.ToTable("RiskTerms", t => t.HasCheckConstraint(
            "CK_RiskTerms_Category", "[Category] BETWEEN 1 AND 4"));

        b.HasKey(x => x.Id).HasName("PK_RiskTerms");
        b.Property(x => x.Term).HasMaxLength(64).IsRequired();
        b.Property(x => x.Category).HasColumnType("tinyint");
        b.Property(x => x.Note).HasMaxLength(300);
        b.Property(x => x.IsActive).HasDefaultValue(true);

        b.HasIndex(x => x.Term).IsUnique().HasDatabaseName("UQ_RiskTerms_Term");
    }
}
