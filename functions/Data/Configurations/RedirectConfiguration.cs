using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Skin20.Api.Models.Entities;

namespace Skin20.Api.Data.Configurations;

// ── H. SEO 產出與 301（docs/08-database.md §H）────────────────────────────

public sealed class RedirectConfiguration : IEntityTypeConfiguration<Redirect>
{
    public void Configure(EntityTypeBuilder<Redirect> b)
    {
        b.ToTable("Redirects", t =>
        {
            t.HasCheckConstraint("CK_Redirects_Source", "[Source] BETWEEN 1 AND 3");
            t.HasCheckConstraint("CK_Redirects_StatusCode", "[StatusCode] IN (301, 302, 307, 308)");
        });

        b.HasKey(x => x.Id).HasName("PK_Redirects");

        // 網址類欄位：位元組比對，不做語言排序（docs/08 §0 決策三）。
        // ⚠️ 要能表示 query string（如 share.php?class=醫美新知&year=2024），長度給足。
        b.Property(x => x.FromPath).HasMaxLength(400).IsRequired().UseUrlCollation();
        b.Property(x => x.ToPath).HasMaxLength(400).IsRequired().UseUrlCollation();

        b.Property(x => x.StatusCode).HasDefaultValue((short)301);
        b.Property(x => x.IsActive).HasDefaultValue(true);
        b.Property(x => x.Source).HasColumnType("tinyint");
        b.Property(x => x.IsVerified).HasDefaultValue(false);

        // 🔴 全 schema 唯一被公開流量高頻打到的表：查詢只用這條 unique index 做單筆 seek，
        //    不做任何 join（docs/08 §H、docs/11 §14）。刻意不再加其他索引。
        b.HasIndex(x => x.FromPath).IsUnique().HasDatabaseName("UQ_Redirects_FromPath");

        // 內容改 slug 時據以自動更新 ToPath；內容被刪除不影響這筆轉址規則本身存在。
        b.HasOne(x => x.ToContentItem).WithMany()
            .HasForeignKey(x => x.ToContentItemId)
            .HasConstraintName("FK_Redirects_ContentItems")
            .OnDelete(DeleteBehavior.SetNull);
    }
}
