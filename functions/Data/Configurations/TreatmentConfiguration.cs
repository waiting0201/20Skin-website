using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Skin20.Api.Models.Entities;

namespace Skin20.Api.Data.Configurations;

// ── C-1. Treatments ＋ TreatmentImages（docs/08-database.md §C-1）────────

public sealed class TreatmentConfiguration : IEntityTypeConfiguration<Treatment>
{
    public void Configure(EntityTypeBuilder<Treatment> b)
    {
        // TPT：子表只要 ToTable，PK＝FK 由 ContentItemConfiguration 的 UseTptMappingStrategy 處理。
        b.ToTable("Treatments");

        b.Property(x => x.NameEn).HasMaxLength(200);
        b.Property(x => x.Subtitle).HasMaxLength(200);
        b.Property(x => x.DurationText).HasMaxLength(100);
        b.Property(x => x.SessionsText).HasMaxLength(100);
        // Indications／Mechanism／Aftercare／Contraindications／DeviceInfo：真正的長文，nvarchar(max)。

        b.HasOne(x => x.Category).WithMany()
            .HasForeignKey(x => x.CategoryTermId)
            .HasConstraintName("FK_Treatments_Terms_Category")
            .OnDelete(DeleteBehavior.Restrict);

        // 換分類是後台常態操作（docs/02 §1），Restrict 逼應用程式在同一交易內先處理
        // 相依資料（含補寫 Redirects），不要讓刪分類意外砍光療程分類欄。
        b.HasIndex(x => x.CategoryTermId).HasDatabaseName("IX_Treatments_CategoryTermId");

        b.OwnsImage(x => x.Cover, "Cover");
    }
}

public sealed class TreatmentImageConfiguration : IEntityTypeConfiguration<TreatmentImage>
{
    public void Configure(EntityTypeBuilder<TreatmentImage> b)
    {
        b.ToTable("TreatmentImages");
        b.HasKey(x => x.Id).HasName("PK_TreatmentImages");

        b.Property(x => x.Caption).HasMaxLength(300);

        // 圖庫本來就是療程的明細列，刪療程連帶清空圖庫。
        b.HasOne(x => x.Treatment).WithMany(x => x.Images)
            .HasForeignKey(x => x.TreatmentId)
            .HasConstraintName("FK_TreatmentImages_Treatments")
            .OnDelete(DeleteBehavior.Cascade);

        // 圖片內嵌在明細列上：刪掉這一列就等於解除引用，沒有第三張表要對帳。
        b.OwnsImage(x => x.Image, "Image", required: true);

        // 療程頁圖庫的顯示順序
        b.HasIndex(x => new { x.TreatmentId, x.SortOrder }).HasDatabaseName("IX_TreatmentImages_Treatment_Sort");
    }
}
