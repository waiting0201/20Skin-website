using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Skin20.Api.Models.Entities;

namespace Skin20.Api.Data.Configurations;

// ── C-2. Doctors ＋ DoctorTags ＋ DoctorCredentials ＋ DoctorSchedules ────
// docs/08-database.md §C-2。

public sealed class DoctorConfiguration : IEntityTypeConfiguration<Doctor>
{
    public void Configure(EntityTypeBuilder<Doctor> b)
    {
        b.ToTable("Doctors");

        b.Property(x => x.JobTitle).HasMaxLength(100);
        b.Property(x => x.Specialty).HasMaxLength(300);

        // ⚠️ 刻意不給 HasDefaultValue：14 位是 13 醫師 ＋ 1 藝術總監，
        //    每一筆都必須由寫入端明確給值，不容許靜默落成某個預設。

        b.HasOne(x => x.PhotoMedia).WithMany()
            .HasForeignKey(x => x.PhotoMediaId)
            .HasConstraintName("FK_Doctors_MediaAssets_Photo")
            .OnDelete(DeleteBehavior.Restrict);

        // 團隊列表頁按「是否為醫師」篩選（首頁醫師版位、team-index）。
        b.HasIndex(x => x.IsPhysician).HasDatabaseName("IX_Doctors_IsPhysician");
    }
}

public sealed class DoctorTagConfiguration : IEntityTypeConfiguration<DoctorTag>
{
    public void Configure(EntityTypeBuilder<DoctorTag> b)
    {
        b.ToTable("DoctorTags");
        b.HasKey(x => x.Id).HasName("PK_DoctorTags");

        b.Property(x => x.Tag).HasMaxLength(40).IsRequired();

        b.HasOne(x => x.Doctor).WithMany(x => x.Tags)
            .HasForeignKey(x => x.DoctorId)
            .HasConstraintName("FK_DoctorTags_Doctors")
            .OnDelete(DeleteBehavior.Cascade);

        // 醫師個人頁的專長標籤顯示順序
        b.HasIndex(x => new { x.DoctorId, x.SortOrder }).HasDatabaseName("IX_DoctorTags_Doctor_Sort");
    }
}

public sealed class DoctorCredentialConfiguration : IEntityTypeConfiguration<DoctorCredential>
{
    public void Configure(EntityTypeBuilder<DoctorCredential> b)
    {
        b.ToTable("DoctorCredentials", t => t.HasCheckConstraint(
            "CK_DoctorCredentials_Type", "[Type] BETWEEN 1 AND 3"));

        b.HasKey(x => x.Id).HasName("PK_DoctorCredentials");

        b.Property(x => x.Type).HasColumnType("tinyint");
        b.Property(x => x.Text).HasMaxLength(300).IsRequired();

        b.HasOne(x => x.Doctor).WithMany(x => x.Credentials)
            .HasForeignKey(x => x.DoctorId)
            .HasConstraintName("FK_DoctorCredentials_Doctors")
            .OnDelete(DeleteBehavior.Cascade);

        // 醫師個人頁依類型（學歷／經歷／證照）分段顯示
        b.HasIndex(x => new { x.DoctorId, x.Type, x.SortOrder }).HasDatabaseName("IX_DoctorCredentials_Doctor_Type_Sort");
    }
}

public sealed class DoctorScheduleConfiguration : IEntityTypeConfiguration<DoctorSchedule>
{
    public void Configure(EntityTypeBuilder<DoctorSchedule> b)
    {
        b.ToTable("DoctorSchedules", t =>
        {
            t.HasCheckConstraint("CK_DoctorSchedules_DayOfWeek", "[DayOfWeek] BETWEEN 0 AND 6");
            t.HasCheckConstraint("CK_DoctorSchedules_TimeRange", "[EndTime] > [StartTime]");
        });

        b.HasKey(x => x.Id).HasName("PK_DoctorSchedules");
        b.Property(x => x.Note).HasMaxLength(200);

        // 醫師被刪除（含個人頁下架不算，這裡指硬刪除）連帶清空排班——排班是醫師的明細列。
        b.HasOne(x => x.Doctor).WithMany(x => x.Schedules)
            .HasForeignKey(x => x.DoctorId)
            .HasConstraintName("FK_DoctorSchedules_Doctors")
            .OnDelete(DeleteBehavior.Cascade);

        // 據點不因排班而連帶刪除，也不允許刪據點時靜默清空排班——逼應用層先處理。
        b.HasOne(x => x.Clinic).WithMany(x => x.DoctorSchedules)
            .HasForeignKey(x => x.ClinicId)
            .HasConstraintName("FK_DoctorSchedules_Clinics")
            .OnDelete(DeleteBehavior.Restrict);

        // 醫師個人頁「看診時段」與據點頁「駐診醫師時段」都用得到
        b.HasIndex(x => new { x.DoctorId, x.DayOfWeek }).HasDatabaseName("IX_DoctorSchedules_Doctor_Day");
        b.HasIndex(x => new { x.ClinicId, x.DayOfWeek }).HasDatabaseName("IX_DoctorSchedules_Clinic_Day");
    }
}
