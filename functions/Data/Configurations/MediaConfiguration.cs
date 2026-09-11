using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Skin20.Api.Models.Entities;

namespace Skin20.Api.Data.Configurations;

// ── E. 媒體庫（docs/08-database.md §E）────────────────────────────────────

public sealed class MediaAssetConfiguration : IEntityTypeConfiguration<MediaAsset>
{
    public void Configure(EntityTypeBuilder<MediaAsset> b)
    {
        b.ToTable("MediaAssets", t => t.HasCheckConstraint(
            "CK_MediaAssets_ContentHash_Length", "LEN([ContentHash]) = 64"));

        b.HasKey(x => x.Id).HasName("PK_MediaAssets");

        b.Property(x => x.ContainerName).HasMaxLength(63).IsRequired();
        b.Property(x => x.BlobPath).HasMaxLength(400).IsRequired();
        b.Property(x => x.PublicUrl).HasMaxLength(600).IsRequired();
        b.Property(x => x.OriginalFileName).HasMaxLength(260).IsRequired();
        b.Property(x => x.ContentType).HasMaxLength(100).IsRequired();
        b.Property(x => x.ContentHash).HasMaxLength(64).IsFixedLength().IsRequired();
        b.Property(x => x.AltText).HasMaxLength(300);
        b.Property(x => x.Caption).HasMaxLength(300);
        b.Property(x => x.IsPrivate).HasDefaultValue(false);
        // Variants：衍生尺寸 JSON，nvarchar(max)。

        // SHA-256 去重的唯一保證
        b.HasIndex(x => x.ContentHash).IsUnique().HasDatabaseName("UQ_MediaAssets_ContentHash");

        b.HasOne(x => x.UploadedByUser).WithMany()
            .HasForeignKey(x => x.UploadedByUserId)
            .HasConstraintName("FK_MediaAssets_Users")
            .OnDelete(DeleteBehavior.Restrict);
    }
}

public sealed class MediaUsageConfiguration : IEntityTypeConfiguration<MediaUsage>
{
    public void Configure(EntityTypeBuilder<MediaUsage> b)
    {
        b.ToTable("MediaUsages", t => t.HasCheckConstraint(
            "CK_MediaUsages_UsageKind", "[UsageKind] BETWEEN 1 AND 4"));

        b.HasKey(x => x.Id).HasName("PK_MediaUsages");
        b.Property(x => x.UsageKind).HasColumnType("tinyint");

        // 刪媒體前的「誰在用」查詢；Restrict 讓資料庫在應用層漏檢查時仍能擋下誤刪。
        b.HasOne(x => x.Media).WithMany(x => x.Usages)
            .HasForeignKey(x => x.MediaId)
            .HasConstraintName("FK_MediaUsages_MediaAssets")
            .OnDelete(DeleteBehavior.Restrict);

        // 內容刪除時，它自己的引用登記列（封面／圖庫／OG 圖）一併清空。
        b.HasOne(x => x.ContentItem).WithMany()
            .HasForeignKey(x => x.ContentItemId)
            .HasConstraintName("FK_MediaUsages_ContentItems")
            .OnDelete(DeleteBehavior.Cascade);

        b.HasIndex(x => new { x.MediaId, x.ContentItemId, x.UsageKind })
            .IsUnique()
            .HasDatabaseName("UQ_MediaUsages_Media_Content_Kind");
    }
}
