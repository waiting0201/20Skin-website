using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Skin20.Api.Models.Entities;

namespace Skin20.Api.Data.Configurations;

// ── C-7. Clinics ＋ ClinicBusinessHours ＋ ClinicPhotos ───────────────────
// docs/08-database.md §C-7。

public sealed class ClinicConfiguration : IEntityTypeConfiguration<Clinic>
{
    public void Configure(EntityTypeBuilder<Clinic> b)
    {
        b.ToTable("Clinics");

        b.Property(x => x.Address).HasMaxLength(300).IsRequired();
        b.Property(x => x.Phone).HasMaxLength(30).IsRequired();
        b.Property(x => x.LineUrl).HasMaxLength(300);
        b.Property(x => x.Latitude).HasColumnType("decimal(9,6)").IsRequired();
        b.Property(x => x.Longitude).HasColumnType("decimal(9,6)").IsRequired();
        b.Property(x => x.MapUrl).HasMaxLength(500);
        // TransportInfo／Intro：真正的長文，nvarchar(max)。
    }
}

public sealed class ClinicBusinessHourConfiguration : IEntityTypeConfiguration<ClinicBusinessHour>
{
    public void Configure(EntityTypeBuilder<ClinicBusinessHour> b)
    {
        b.ToTable("ClinicBusinessHours", t =>
        {
            t.HasCheckConstraint("CK_ClinicBusinessHours_DayOfWeek", "[DayOfWeek] BETWEEN 0 AND 6");
            t.HasCheckConstraint("CK_ClinicBusinessHours_TimeRange", "[EndTime] > [StartTime]");
        });

        b.HasKey(x => x.Id).HasName("PK_ClinicBusinessHours");

        // 一天可以有多列（午休斷點），刪據點連帶清空營業時段。
        b.HasOne(x => x.Clinic).WithMany(x => x.BusinessHours)
            .HasForeignKey(x => x.ClinicId)
            .HasConstraintName("FK_ClinicBusinessHours_Clinics")
            .OnDelete(DeleteBehavior.Cascade);

        // 據點頁輸出 openingHoursSpecification 與「本週看診時間」的主查詢
        b.HasIndex(x => new { x.ClinicId, x.DayOfWeek, x.SortOrder }).HasDatabaseName("IX_ClinicBusinessHours_Clinic_Day_Sort");
    }
}

public sealed class ClinicPhotoConfiguration : IEntityTypeConfiguration<ClinicPhoto>
{
    public void Configure(EntityTypeBuilder<ClinicPhoto> b)
    {
        b.ToTable("ClinicPhotos");
        b.HasKey(x => x.Id).HasName("PK_ClinicPhotos");

        b.Property(x => x.Caption).HasMaxLength(300);

        b.HasOne(x => x.Clinic).WithMany(x => x.Photos)
            .HasForeignKey(x => x.ClinicId)
            .HasConstraintName("FK_ClinicPhotos_Clinics")
            .OnDelete(DeleteBehavior.Cascade);

        b.OwnsImage(x => x.Image, "Image", required: true);

        b.HasIndex(x => new { x.ClinicId, x.SortOrder }).HasDatabaseName("IX_ClinicPhotos_Clinic_Sort");
    }
}
