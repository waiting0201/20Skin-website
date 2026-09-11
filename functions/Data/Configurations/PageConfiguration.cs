using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Skin20.Api.Models.Entities;

namespace Skin20.Api.Data.Configurations;

// ── C-8. Pages（docs/08-database.md §C-8）─────────────────────────────────

public sealed class PageConfiguration : IEntityTypeConfiguration<Page>
{
    public void Configure(EntityTypeBuilder<Page> b)
    {
        b.ToTable("Pages", t => t.HasCheckConstraint(
            "CK_Pages_PageKind", "[PageKind] BETWEEN 1 AND 2"));

        b.Property(x => x.PageKind).HasColumnType("tinyint");
        b.Property(x => x.SystemKey).HasMaxLength(40);
        b.Property(x => x.SuperAdminOnly).HasDefaultValue(false);
        // Lead／BodyBlocks：nvarchar(max)。
        // ⚠️ ListSortRule 未在 docs/08 §C-8 定義合法值域（無對應列舉），因此這裡除了
        //    tinyint 的型別範圍外不加 CHECK——已回報，等值域確定後再補約束。

        b.OwnsImage(x => x.Cover, "Cover");

        // 系統頁識別碼查找（如 SystemKey='home'、'contact'）
        b.HasIndex(x => x.SystemKey)
            .IsUnique()
            .HasDatabaseName("UQ_Pages_SystemKey")
            .HasFilter("[SystemKey] IS NOT NULL");
    }
}
