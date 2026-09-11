using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Skin20.Api.Models.Entities;

namespace Skin20.Api.Data.Configurations;

// ── C-9. Terms（docs/08-database.md §C-9）─────────────────────────────────

public sealed class TermConfiguration : IEntityTypeConfiguration<Term>
{
    public void Configure(EntityTypeBuilder<Term> b)
    {
        b.ToTable("Terms", t => t.HasCheckConstraint(
            "CK_Terms_TermType", "[TermType] BETWEEN 1 AND 4"));

        b.Property(x => x.TermType).HasColumnType("tinyint");
        // Intro：nvarchar(max)。

        b.OwnsImage(x => x.Cover, "Cover");

        // 🔴 docs/08 §C-9 要求 UNIQUE (TermType, Slug)，未實作——見 Term 類別上的說明：
        //    TermType 在本表（TPT 子表），Slug 在 ContentItems（父表），
        //    EF Core／SQL Server 的 index 都要求同一張實體表，TPT 下無法直接表示。
        //    非唯一索引先頂著分類列表頁的查詢：
        b.HasIndex(x => x.TermType).HasDatabaseName("IX_Terms_TermType");
    }
}
