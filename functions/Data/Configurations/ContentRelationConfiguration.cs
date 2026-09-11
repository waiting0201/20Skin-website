using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Skin20.Api.Models.Entities;

namespace Skin20.Api.Data.Configurations;

// ── D. 內容關聯（docs/08-database.md §D）──────────────────────────────────

public sealed class ContentRelationConfiguration : IEntityTypeConfiguration<ContentRelation>
{
    public void Configure(EntityTypeBuilder<ContentRelation> b)
    {
        b.ToTable("ContentRelations", t =>
        {
            t.HasCheckConstraint("CK_ContentRelations_RelationType", "[RelationType] BETWEEN 1 AND 13");

            // 13 種合法組合，逐一對應 docs/08 §D 的關聯型別清單。
            // ⚠️ PageToFeatured（12）的目標型別 docs 未鎖定單一類型（「精選項目」語意上
            //    可以是療程／醫師／困擾／文章／案例／FAQ／據點／分類標籤中的任一種），
            //    這裡放寬為除了 Page 本身以外皆可——已回報，若之後鎖定單一型別要收窄。
            t.HasCheckConstraint("CK_ContentRelations_ValidCombination", """
                (RelationType = 1  AND FromContentType = 1 AND ToContentType = 2) OR
                (RelationType = 2  AND FromContentType = 1 AND ToContentType = 3) OR
                (RelationType = 3  AND FromContentType = 1 AND ToContentType = 4) OR
                (RelationType = 4  AND FromContentType = 1 AND ToContentType = 6) OR
                (RelationType = 5  AND FromContentType = 3 AND ToContentType = 1) OR
                (RelationType = 6  AND FromContentType = 3 AND ToContentType = 6) OR
                (RelationType = 7  AND FromContentType = 3 AND ToContentType = 4) OR
                (RelationType = 8  AND FromContentType = 7 AND ToContentType = 2) OR
                (RelationType = 9  AND FromContentType = 7 AND ToContentType = 1) OR
                (RelationType = 10 AND FromContentType = 7 AND ToContentType = 6) OR
                (RelationType = 11 AND FromContentType = 4 AND ToContentType = 9) OR
                (RelationType = 12 AND FromContentType = 8 AND ToContentType IN (1,2,3,4,5,6,7,9)) OR
                (RelationType = 13 AND FromContentType = 2 AND ToContentType = 3)
                """);
        });

        b.HasKey(x => x.Id).HasName("PK_ContentRelations");

        b.Property(x => x.FromContentType).HasColumnType("tinyint");
        b.Property(x => x.ToContentType).HasColumnType("tinyint");
        b.Property(x => x.RelationType).HasColumnType("tinyint");
        b.Property(x => x.SortOrder).HasDefaultValue(0);
        b.Property(x => x.Note).HasMaxLength(300);

        // 複合 FK：把型別正確性交還給資料庫（docs/08 §D）。兩條 FK 都指向 ContentItems，
        // 多重串聯路徑——From 側 Cascade（刪內容清掉它自己發出的關聯），
        // To 側必須 NoAction，否則 SQL Server 拒絕建立；指向它的關聯要由應用層在同一交易內清掉。
        b.HasOne<ContentItem>().WithMany()
            .HasForeignKey(x => new { x.FromContentItemId, x.FromContentType })
            .HasPrincipalKey(ci => new { ci.Id, ci.ContentType })
            .HasConstraintName("FK_ContentRelations_ContentItems_From")
            .OnDelete(DeleteBehavior.Cascade);

        b.HasOne<ContentItem>().WithMany()
            .HasForeignKey(x => new { x.ToContentItemId, x.ToContentType })
            .HasPrincipalKey(ci => new { ci.Id, ci.ContentType })
            .HasConstraintName("FK_ContentRelations_ContentItems_To")
            .OnDelete(DeleteBehavior.NoAction);

        // 正向：某療程的「相關醫師／文章／FAQ」等，依 RelationType 分組後照排序輸出
        b.HasIndex(x => new { x.FromContentItemId, x.RelationType, x.ToContentItemId })
            .IsUnique()
            .HasDatabaseName("UQ_ContentRelations_From_Type_To");

        // 反向：「這則 FAQ 出現在哪些療程頁」這類反查
        b.HasIndex(x => new { x.ToContentItemId, x.RelationType })
            .HasDatabaseName("IX_ContentRelations_To_Type");
    }
}
