using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Skin20.Api.Models.Entities;

namespace Skin20.Api.Data.Configurations;

// ── C-5. Cases ＋ CaseImages（docs/08-database.md §C-5）───────────────────

public sealed class CaseConfiguration : IEntityTypeConfiguration<Case>
{
    public void Configure(EntityTypeBuilder<Case> b)
    {
        b.ToTable("Cases", t =>
        {
            // 四個法規揭露欄位一律 NOT NULL 且不得為空字串——內容遷移是本機腳本直連 SQL，
            // 繞過 API 也就繞過所有前端與 API 層的驗證，這時候只有資料庫約束擋得住。
            t.HasCheckConstraint("CK_Cases_IndividualVarianceStatement_NotEmpty",
                "LEN([IndividualVarianceStatement]) > 0");
            t.HasCheckConstraint("CK_Cases_ConsentReference_NotEmpty", "LEN([ConsentReference]) > 0");
            t.HasCheckConstraint("CK_Cases_ShootingConditions_NotEmpty", "LEN([ShootingConditions]) > 0");
        });

        b.Property(x => x.SessionsText).HasMaxLength(100);
        // Narrative：真正的長文，nvarchar(max)。

        b.Property(x => x.IndividualVarianceStatement).HasMaxLength(500).IsRequired();
        b.Property(x => x.HasWrittenConsent).IsRequired();
        b.Property(x => x.ConsentReference).HasMaxLength(200).IsRequired();
        b.Property(x => x.ShootingConditions).HasMaxLength(500).IsRequired();

        // 案例必屬於一個療程；療程被刪除前必須先處理案例，Restrict。
        b.HasOne(x => x.Treatment).WithMany(x => x.Cases)
            .HasForeignKey(x => x.TreatmentId)
            .HasConstraintName("FK_Cases_Treatments")
            .OnDelete(DeleteBehavior.Restrict);

        // 療程頁「相關案例」列表
        b.HasIndex(x => x.TreatmentId).HasDatabaseName("IX_Cases_TreatmentId");
    }
}

public sealed class CaseImageConfiguration : IEntityTypeConfiguration<CaseImage>
{
    public void Configure(EntityTypeBuilder<CaseImage> b)
    {
        b.ToTable("CaseImages", t => t.HasCheckConstraint(
            "CK_CaseImages_Phase", "[Phase] BETWEEN 1 AND 2"));

        b.HasKey(x => x.Id).HasName("PK_CaseImages");
        b.Property(x => x.Phase).HasColumnType("tinyint");

        // 術前術後照是案例的明細列，刪案例連帶清空。
        b.HasOne(x => x.Case).WithMany(x => x.Images)
            .HasForeignKey(x => x.CaseId)
            .HasConstraintName("FK_CaseImages_Cases")
            .OnDelete(DeleteBehavior.Cascade);

        b.OwnsImage(x => x.Image, "Image", required: true);

        // 案例內頁依「術前／術後」分組顯示
        b.HasIndex(x => new { x.CaseId, x.Phase, x.SortOrder }).HasDatabaseName("IX_CaseImages_Case_Phase_Sort");
    }
}
