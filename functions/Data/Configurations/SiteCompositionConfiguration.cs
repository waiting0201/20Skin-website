using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Skin20.Api.Models.Entities;

namespace Skin20.Api.Data.Configurations;

// ── G. 站台編排（docs/08-database.md §G）──────────────────────────────────

public sealed class SiteSettingConfiguration : IEntityTypeConfiguration<SiteSetting>
{
    public void Configure(EntityTypeBuilder<SiteSetting> b)
    {
        b.ToTable("SiteSettings", t => t.HasCheckConstraint(
            "CK_SiteSettings_ValueType", "[ValueType] BETWEEN 1 AND 5"));

        b.HasKey(x => x.SettingKey).HasName("PK_SiteSettings");
        b.Property(x => x.SettingKey).HasMaxLength(100);
        b.Property(x => x.SettingValue).IsRequired();   // nvarchar(max)
        b.Property(x => x.ValueType).HasColumnType("tinyint");

        b.HasOne(x => x.UpdatedByUser).WithMany()
            .HasForeignKey(x => x.UpdatedByUserId)
            .HasConstraintName("FK_SiteSettings_Users")
            .OnDelete(DeleteBehavior.Restrict);
    }
}

public sealed class HomeSectionConfiguration : IEntityTypeConfiguration<HomeSection>
{
    public void Configure(EntityTypeBuilder<HomeSection> b)
    {
        b.ToTable("HomeSections");
        b.HasKey(x => x.Id).HasName("PK_HomeSections");

        b.Property(x => x.SectionKey).HasMaxLength(40).IsRequired();
        b.Property(x => x.Title).HasMaxLength(200).IsRequired();
        b.Property(x => x.Subtitle).HasMaxLength(200);
        b.Property(x => x.IsEnabled).HasDefaultValue(true);
        // Settings：hero 主視覺／外部 CTA 等 JSON，nvarchar(max)。

        // 七個版位為種子資料、不可新增刪除，靠這條唯一索引防止重覆種子或誤植。
        b.HasIndex(x => x.SectionKey).IsUnique().HasDatabaseName("UQ_HomeSections_SectionKey");
    }
}

public sealed class HomeSectionItemConfiguration : IEntityTypeConfiguration<HomeSectionItem>
{
    public void Configure(EntityTypeBuilder<HomeSectionItem> b)
    {
        b.ToTable("HomeSectionItems");
        b.HasKey(x => x.Id).HasName("PK_HomeSectionItems");

        // 版位刪除只會是「不可新增刪除」種子例外操作，仍讓明細列隨版位清空。
        b.HasOne(x => x.HomeSection).WithMany(x => x.Items)
            .HasForeignKey(x => x.HomeSectionId)
            .HasConstraintName("FK_HomeSectionItems_HomeSections")
            .OnDelete(DeleteBehavior.Cascade);

        // 內容被硬刪除前，必須先從首頁版位移除——Restrict 逼應用層走這個順序，
        // 避免首頁悄悄少一格、編輯卻毫無所覺。
        b.HasOne(x => x.ContentItem).WithMany()
            .HasForeignKey(x => x.ContentItemId)
            .HasConstraintName("FK_HomeSectionItems_ContentItems")
            .OnDelete(DeleteBehavior.Restrict);

        // 同一版位不重覆挑選同一筆內容
        b.HasIndex(x => new { x.HomeSectionId, x.ContentItemId })
            .IsUnique()
            .HasDatabaseName("UQ_HomeSectionItems_Section_Content");

        // 首頁組版時依版位＋排序撈出項目
        b.HasIndex(x => new { x.HomeSectionId, x.SortOrder }).HasDatabaseName("IX_HomeSectionItems_Section_Sort");
    }
}

public sealed class MenuItemConfiguration : IEntityTypeConfiguration<MenuItem>
{
    public void Configure(EntityTypeBuilder<MenuItem> b)
    {
        b.ToTable("MenuItems", t =>
        {
            // 純靠 ParentId 無法在 SQL 表達深度上限，Depth 冗餘欄位讓約束可執行。
            t.HasCheckConstraint("CK_MenuItems_Depth", "[Depth] IN (1, 2)");
            t.HasCheckConstraint("CK_MenuItems_LinkKind", "[LinkKind] BETWEEN 1 AND 3");
        });

        b.HasKey(x => x.Id).HasName("PK_MenuItems");

        b.Property(x => x.MenuKey).HasMaxLength(20).IsRequired();
        b.Property(x => x.Label).HasMaxLength(100).IsRequired();
        b.Property(x => x.LinkKind).HasColumnType("tinyint");
        b.Property(x => x.Url).HasMaxLength(400);
        b.Property(x => x.RelAttr).HasMaxLength(60);
        b.Property(x => x.IsExternal).HasDefaultValue(false);
        b.Property(x => x.OpenInNewTab).HasDefaultValue(false);

        // 子選單刪父層前要先處理——避免整條選單路徑被靜默砍斷。
        b.HasOne(x => x.Parent).WithMany(x => x.Children)
            .HasForeignKey(x => x.ParentId)
            .HasConstraintName("FK_MenuItems_MenuItems_Parent")
            .OnDelete(DeleteBehavior.Restrict);

        // 站內內容被刪除前，選單必須先移除對它的連結（同 HomeSectionItems 的理由）。
        b.HasOne(x => x.ContentItem).WithMany()
            .HasForeignKey(x => x.ContentItemId)
            .HasConstraintName("FK_MenuItems_ContentItems")
            .OnDelete(DeleteBehavior.Restrict);

        // 選單畫面渲染：依選單（主選單／頁尾）＋父層＋排序
        b.HasIndex(x => new { x.MenuKey, x.ParentId, x.SortOrder }).HasDatabaseName("IX_MenuItems_MenuKey_Parent_Sort");
    }
}
