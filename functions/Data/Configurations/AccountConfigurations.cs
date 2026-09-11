using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Skin20.Api.Models.Entities;

namespace Skin20.Api.Data.Configurations;

// ── A. 帳號與權限（docs/08-database.md §A）──────────────────────────────
//
// 這一檔同時是其餘 30 張表的**範式**，四條規則逐條照做：
//   1. 所有約束具名（PK_／FK_／UQ_／CK_／IX_），docs/08 §J-1
//   2. 索引寧缺勿濫 —— FK 的自動索引已在 DbContext 關掉，要哪條就明寫哪條
//   3. 字串一律給長度；nvarchar(max) 只給真正的長文
//   4. 列舉存 tinyint，並以 CHECK 約束限制值域

public sealed class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> b)
    {
        b.ToTable("Users", t => t.HasCheckConstraint(
            "CK_Users_UserName_NotEmpty", "LEN([UserName]) > 0"));

        b.HasKey(x => x.Id).HasName("PK_Users");

        b.Property(x => x.UserName).HasMaxLength(64).IsRequired();
        b.Property(x => x.DisplayName).HasMaxLength(64).IsRequired();
        b.Property(x => x.PasswordHash).HasMaxLength(256).IsRequired();
        b.Property(x => x.SecurityStamp).HasMaxLength(64).IsRequired();
        b.Property(x => x.NotifyEmail).HasMaxLength(256);
        b.Property(x => x.IsActive).HasDefaultValue(true);
        b.Property(x => x.MustChangePassword).HasDefaultValue(false);

        // ⚠️ 登入識別，比對不分大小寫（沿用資料庫預設定序，不套 BIN2）。
        b.HasIndex(x => x.UserName).IsUnique().HasDatabaseName("UQ_Users_UserName");

        // 醫師角色綁自己的個人頁。停用醫師不該連帶刪帳號 → Restrict。
        b.HasOne(x => x.Doctor)
            .WithMany()
            .HasForeignKey(x => x.DoctorId)
            .HasConstraintName("FK_Users_Doctors")
            .OnDelete(DeleteBehavior.Restrict);

        b.HasIndex(x => x.DoctorId)
            .HasDatabaseName("IX_Users_DoctorId")
            .HasFilter("[DoctorId] IS NOT NULL");
    }
}

public sealed class RoleConfiguration : IEntityTypeConfiguration<Role>
{
    public void Configure(EntityTypeBuilder<Role> b)
    {
        b.ToTable("Roles");
        b.HasKey(x => x.Id).HasName("PK_Roles");
        b.Property(x => x.Code).HasMaxLength(30).IsRequired();
        b.Property(x => x.Name).HasMaxLength(50).IsRequired();
        b.Property(x => x.IsSystem).HasDefaultValue(false);
        b.HasIndex(x => x.Code).IsUnique().HasDatabaseName("UQ_Roles_Code");
    }
}

public sealed class UserRoleConfiguration : IEntityTypeConfiguration<UserRole>
{
    public void Configure(EntityTypeBuilder<UserRole> b)
    {
        b.ToTable("UserRoles");
        b.HasKey(x => new { x.UserId, x.RoleId }).HasName("PK_UserRoles");

        b.HasOne(x => x.User).WithMany(x => x.UserRoles)
            .HasForeignKey(x => x.UserId)
            .HasConstraintName("FK_UserRoles_Users")
            .OnDelete(DeleteBehavior.Cascade);

        // 角色是系統種子、不可刪，所以這一側 Restrict。
        b.HasOne(x => x.Role).WithMany()
            .HasForeignKey(x => x.RoleId)
            .HasConstraintName("FK_UserRoles_Roles")
            .OnDelete(DeleteBehavior.Restrict);
    }
}

public sealed class PermissionConfiguration : IEntityTypeConfiguration<Permission>
{
    public void Configure(EntityTypeBuilder<Permission> b)
    {
        b.ToTable("Permissions");
        b.HasKey(x => x.Id).HasName("PK_Permissions");
        b.Property(x => x.Code).HasMaxLength(60).IsRequired();
        b.Property(x => x.Name).HasMaxLength(80).IsRequired();
        b.Property(x => x.GroupName).HasMaxLength(40).IsRequired();
        b.HasIndex(x => x.Code).IsUnique().HasDatabaseName("UQ_Permissions_Code");
    }
}

public sealed class RolePermissionConfiguration : IEntityTypeConfiguration<RolePermission>
{
    public void Configure(EntityTypeBuilder<RolePermission> b)
    {
        b.ToTable("RolePermissions");
        b.HasKey(x => new { x.RoleId, x.PermissionId }).HasName("PK_RolePermissions");

        b.HasOne(x => x.Role).WithMany(x => x.RolePermissions)
            .HasForeignKey(x => x.RoleId)
            .HasConstraintName("FK_RolePermissions_Roles")
            .OnDelete(DeleteBehavior.Cascade);

        b.HasOne(x => x.Permission).WithMany(x => x.RolePermissions)
            .HasForeignKey(x => x.PermissionId)
            .HasConstraintName("FK_RolePermissions_Permissions")
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class LoginThrottleConfiguration : IEntityTypeConfiguration<LoginThrottle>
{
    public void Configure(EntityTypeBuilder<LoginThrottle> b)
    {
        b.ToTable("LoginThrottles", t => t.HasCheckConstraint(
            "CK_LoginThrottles_Dimension", "[Dimension] IN (1, 2)"));

        b.HasKey(x => x.Id).HasName("PK_LoginThrottles");
        b.Property(x => x.Dimension).HasColumnType("tinyint");
        b.Property(x => x.ThrottleKey).HasMaxLength(128).IsRequired();

        // 查詢一律以 (維度, 鍵) 單筆 seek —— 登入路徑上最不能慢的一次查詢。
        b.HasIndex(x => new { x.Dimension, x.ThrottleKey })
            .IsUnique()
            .HasDatabaseName("UQ_LoginThrottles_Dimension_Key");
    }
}

public sealed class RefreshTokenConfiguration : IEntityTypeConfiguration<RefreshToken>
{
    public void Configure(EntityTypeBuilder<RefreshToken> b)
    {
        b.ToTable("RefreshTokens");
        b.HasKey(x => x.Id).HasName("PK_RefreshTokens");

        // 存 hash 不存明文。SHA-256 的十六進位字串固定 64 字元。
        b.Property(x => x.TokenHash).HasMaxLength(128).IsRequired();

        b.HasOne(x => x.User).WithMany()
            .HasForeignKey(x => x.UserId)
            .HasConstraintName("FK_RefreshTokens_Users")
            .OnDelete(DeleteBehavior.Cascade);

        b.HasIndex(x => x.TokenHash).IsUnique().HasDatabaseName("UQ_RefreshTokens_TokenHash");

        // 「停用帳號要能即時失效」＝ 依 UserId 撤銷全部，所以這條索引是必要的。
        b.HasIndex(x => x.UserId).HasDatabaseName("IX_RefreshTokens_UserId");
    }
}
