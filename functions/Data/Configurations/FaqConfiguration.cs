using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Skin20.Api.Models.Entities;

namespace Skin20.Api.Data.Configurations;

// ── C-6. Faqs（docs/08-database.md §C-6）──────────────────────────────────

public sealed class FaqConfiguration : IEntityTypeConfiguration<Faq>
{
    public void Configure(EntityTypeBuilder<Faq> b)
    {
        b.ToTable("Faqs", t =>
        {
            // AiAnswer 是 FAQPage JSON-LD／faq.json／llms-full.txt 的唯一來源，缺一則白寫。
            t.HasCheckConstraint("CK_Faqs_WebAnswer_NotEmpty", "LEN([WebAnswer]) > 0");
            t.HasCheckConstraint("CK_Faqs_AiAnswer_NotEmpty", "LEN([AiAnswer]) > 0");
        });

        b.Property(x => x.WebAnswer).IsRequired();          // nvarchar(max)
        b.Property(x => x.AiAnswer).HasMaxLength(500).IsRequired();

        // 審閱者署名（自由文字，不是外鍵——見 Faq.ReviewedBy 的說明）
        b.Property(x => x.ReviewedBy).HasMaxLength(100);

        b.HasOne(x => x.Category).WithMany()
            .HasForeignKey(x => x.CategoryTermId)
            .HasConstraintName("FK_Faqs_Terms_Category")
            .OnDelete(DeleteBehavior.Restrict);

        // FAQ 頁依分類分組顯示
        b.HasIndex(x => x.CategoryTermId).HasDatabaseName("IX_Faqs_CategoryTermId");
    }
}
