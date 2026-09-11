using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Skin20.Api.Models.Entities;

namespace Skin20.Api.Data.Configurations;

// ── C-4. Articles（docs/08-database.md §C-4）──────────────────────────────

public sealed class ArticleConfiguration : IEntityTypeConfiguration<Article>
{
    public void Configure(EntityTypeBuilder<Article> b)
    {
        b.ToTable("Articles", t => t.HasCheckConstraint(
            "CK_Articles_SourceSite", "[SourceSite] BETWEEN 1 AND 2"));

        b.Property(x => x.AuthorName).HasMaxLength(100);
        b.Property(x => x.SourceSite).HasColumnType("tinyint");
        // BodyBlocks：JSON 區塊陣列，nvarchar(max)。

        b.HasOne(x => x.Category).WithMany()
            .HasForeignKey(x => x.CategoryTermId)
            .HasConstraintName("FK_Articles_Terms_Category")
            .OnDelete(DeleteBehavior.Restrict);

        b.HasOne(x => x.AuthorDoctor).WithMany()
            .HasForeignKey(x => x.AuthorDoctorId)
            .HasConstraintName("FK_Articles_Doctors_Author")
            .OnDelete(DeleteBehavior.Restrict);

        b.HasOne(x => x.ReviewerDoctor).WithMany()
            .HasForeignKey(x => x.ReviewerDoctorId)
            .HasConstraintName("FK_Articles_Doctors_Reviewer")
            .OnDelete(DeleteBehavior.Restrict);

        b.OwnsImage(x => x.Cover, "Cover");

        // 文章列表頁的分類篩選（06-page-inventory §1）
        b.HasIndex(x => new { x.CategoryTermId, x.DisplayDate }).HasDatabaseName("IX_Articles_Category_DisplayDate");

        // 「本文由 ○○ 醫師審閱」與醫師個人頁「著作／文章列表」的反查
        b.HasIndex(x => x.AuthorDoctorId)
            .HasDatabaseName("IX_Articles_AuthorDoctorId")
            .HasFilter("[AuthorDoctorId] IS NOT NULL");

        // 遷移後篩出 20skinblog.com 的 101 篇（docs/01 決策三、docs/08 §C-4）
        b.HasIndex(x => x.SourceSite).HasDatabaseName("IX_Articles_SourceSite");
    }
}
