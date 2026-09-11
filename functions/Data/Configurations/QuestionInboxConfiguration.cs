using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Skin20.Api.Models.Entities;

namespace Skin20.Api.Data.Configurations;

// ── F. FAQ 題庫成長（docs/08-database.md §F）──────────────────────────────
//
// ⚠️ 表名依 docs/08 §F 為 QuestionInbox（單數）；DbContext 的 DbSet 屬性叫
//    QuestionInboxItems，那只是 C# 端較順口的命名，不影響實體資料表名稱。

public sealed class QuestionInboxConfiguration : IEntityTypeConfiguration<QuestionInbox>
{
    public void Configure(EntityTypeBuilder<QuestionInbox> b)
    {
        b.ToTable("QuestionInbox", t =>
        {
            t.HasCheckConstraint("CK_QuestionInbox_Source", "[Source] BETWEEN 1 AND 4");
            t.HasCheckConstraint("CK_QuestionInbox_Status", "[Status] BETWEEN 1 AND 3");
        });

        b.HasKey(x => x.Id).HasName("PK_QuestionInbox");

        b.Property(x => x.QuestionText).HasMaxLength(500).IsRequired();
        b.Property(x => x.NormalizedText).HasMaxLength(500).IsRequired();
        b.Property(x => x.Source).HasColumnType("tinyint");
        b.Property(x => x.Status).HasColumnType("tinyint").HasDefaultValue(QuestionStatus.Pending);
        b.Property(x => x.HitCount).HasDefaultValue(1);

        // 去重鍵：同一句話只有一列，重複只累加 HitCount。
        b.HasIndex(x => x.NormalizedText).IsUnique().HasDatabaseName("UQ_QuestionInbox_NormalizedText");

        // 未命中題目清單畫面（docs/06 §5）的主查詢：待處理優先、依熱度排序
        b.HasIndex(x => new { x.Status, x.HitCount }).HasDatabaseName("IX_QuestionInbox_Status_HitCount");

        b.HasOne(x => x.LinkedFaqContentItem).WithMany()
            .HasForeignKey(x => x.LinkedFaqContentItemId)
            .HasConstraintName("FK_QuestionInbox_ContentItems")
            .OnDelete(DeleteBehavior.SetNull);

        b.HasOne(x => x.HandledByUser).WithMany()
            .HasForeignKey(x => x.HandledByUserId)
            .HasConstraintName("FK_QuestionInbox_Users")
            .OnDelete(DeleteBehavior.Restrict);
    }
}
