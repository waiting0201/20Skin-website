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

        // 職稱是多行的（後台一行一個，前台逐行顯示），所以不是 100 而是 300 ——
        // ⚠️ 全鏈路沒有任何一層驗長度：ApplyDoctorFields 直接賦值，超過就是 SQL 例外、
        //    後台收到一個看不出原因的 500。單行 input 時代打不到 100，改成多行文字框之後會。
        b.Property(x => x.JobTitle).HasMaxLength(300);
        b.Property(x => x.Specialty).HasMaxLength(300);

        // ⚠️ 刻意不給 HasDefaultValue：14 位是 13 醫師 ＋ 1 藝術總監，
        //    每一筆都必須由寫入端明確給值，不容許靜默落成某個預設。

        b.OwnsImage(x => x.Photo, "Photo");

        // 團隊列表頁按「是否為醫師」篩選（首頁醫師版位、team-index）。
        b.HasIndex(x => x.IsPhysician).HasDatabaseName("IX_Doctors_IsPhysician");
    }
}

public sealed class DoctorTagConfiguration : IEntityTypeConfiguration<DoctorTag>
{
    public void Configure(EntityTypeBuilder<DoctorTag> b)
    {
        b.ToTable("DoctorTags", t => t.HasCheckConstraint(
            "CK_DoctorTags_Type", "[Type] BETWEEN 1 AND 2"));

        b.HasKey(x => x.Id).HasName("PK_DoctorTags");
        b.Property(x => x.Type).HasColumnType("tinyint");

        b.Property(x => x.Tag).HasMaxLength(40).IsRequired();

        b.HasOne(x => x.Doctor).WithMany(x => x.Tags)
            .HasForeignKey(x => x.DoctorId)
            .HasConstraintName("FK_DoctorTags_Doctors")
            .OnDelete(DeleteBehavior.Cascade);

        // 兩組標籤各自分段顯示（列表卡片的專長標籤／個人頁的擅長項目），所以 Type 進索引
        b.HasIndex(x => new { x.DoctorId, x.Type, x.SortOrder }).HasDatabaseName("IX_DoctorTags_Doctor_Type_Sort");
    }
}

public sealed class DoctorCredentialConfiguration : IEntityTypeConfiguration<DoctorCredential>
{
    public void Configure(EntityTypeBuilder<DoctorCredential> b)
    {
        b.ToTable("DoctorCredentials", t => t.HasCheckConstraint(
            "CK_DoctorCredentials_Type", "[Type] BETWEEN 1 AND 4"));

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
