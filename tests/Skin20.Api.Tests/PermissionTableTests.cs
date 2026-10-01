using Skin20.Api.Common;

namespace Skin20.Api.Tests;

/// <summary>
/// 權限碼表（docs/08 §A-2 的 28 列）。權威是種子資料，那份資料決定 migration 寫進資料庫的內容。
/// </summary>
public class PermissionTableTests
{
    [Fact]
    public void 權限碼共_28_列_且代碼不重複()
    {
        var perms = SeedPermissions.Permissions();
        Assert.Equal(28, perms.Count);
        Assert.Equal(28, perms.Values.Distinct(StringComparer.Ordinal).Count());
    }

    [Fact]
    public void 權限碼_Id_19到21是刻意的空號_不可重用()
    {
        // 🔴 CLAUDE.md 決策 20：RolePermissions 是後台畫面改得動的資料，renumber 會讓
        //    「原本指著 22（seo.edit）」的手動列靜默變成 page.legal.edit。
        var ids = SeedPermissions.Permissions().Keys.ToHashSet();
        foreach (var gap in new[] { 19, 20, 21 }) Assert.DoesNotContain(gap, ids);

        Assert.Equal(Enumerable.Range(1, 18).Concat(Enumerable.Range(22, 10)).ToHashSet(), ids);
    }

    [Fact]
    public void seo_edit_仍是_Id_22()
    {
        Assert.Equal("seo.edit", SeedPermissions.Permissions()[22]);
        Assert.Equal("page.legal.edit", SeedPermissions.Permissions()[25]);
    }

    [Theory]
    [InlineData("content.submit")]
    [InlineData("review.approve")]
    [InlineData("review.reject")]
    public void 已刪除的送審與審核權限碼不再出現(string removed)
    {
        Assert.DoesNotContain(removed, SeedPermissions.Permissions().Values);
        Assert.DoesNotContain(
            SeedPermissions.GrantsByRole().Values.SelectMany(x => x), c => c == removed);
    }

    [Fact]
    public void 九個內容單元各有_edit_與_publish()
    {
        var codes = SeedPermissions.Permissions().Values.ToHashSet();
        foreach (var unit in UnitCodes.All)
        {
            Assert.Contains(PermissionCodes.Edit(unit), codes);
            Assert.Contains(PermissionCodes.Publish(unit), codes);
        }
    }

    [Fact]
    public void 程式裡宣告的跨單元權限碼常數全部存在於種子()
    {
        var codes = SeedPermissions.Permissions().Values.ToHashSet();
        var constants = typeof(PermissionCodes).GetFields()
            .Where(f => f.IsLiteral && f.FieldType == typeof(string))
            .Select(f => (string)f.GetRawConstantValue()!)
            .ToList();

        Assert.NotEmpty(constants);
        foreach (var code in constants) Assert.Contains(code, codes);
    }

    [Fact]
    public void 種子裡每一個權限碼都有對應的程式端宣告()
    {
        // 反向：種子多了一個碼、程式沒有常數可用，代表這個碼會以字面值散在程式裡（docs/11 §12）。
        var declared = typeof(PermissionCodes).GetFields()
            .Where(f => f.IsLiteral && f.FieldType == typeof(string))
            .Select(f => (string)f.GetRawConstantValue()!)
            .Concat(UnitCodes.All.SelectMany(u => new[] { PermissionCodes.Edit(u), PermissionCodes.Publish(u) }))
            .ToHashSet();

        Assert.All(SeedPermissions.Permissions().Values, c => Assert.Contains(c, declared));
    }

    [Fact]
    public void 角色只剩四個_沒有審核者()
    {
        // 決策 20：5 → 4。
        Assert.Equivalent(
            new[] { "SuperAdmin", "Editor", "Doctor", "Marketing" },
            SeedPermissions.Roles().Values);
    }

    [Fact]
    public void 超級管理員擁有全部權限碼()
    {
        var all = SeedPermissions.Permissions().Values.ToHashSet();
        Assert.True(all.SetEquals(SeedPermissions.GrantsByRole()["SuperAdmin"]));
    }

    [Fact]
    public void 內容編輯拿到九個單元的_publish_決策20刻意放棄發布與編輯分離()
    {
        // 🔴 不移交的話，全院只剩超級管理員能讓任何內容上線。
        var editor = SeedPermissions.GrantsByRole()["Editor"];
        foreach (var unit in UnitCodes.All) Assert.Contains(PermissionCodes.Publish(unit), editor);
    }

    [Fact]
    public void 只有超級管理員有的權限碼_帳號_法務_分類管理()
    {
        // docs/02 §4：這三個動到 URL 結構、條款效力或帳號，不下放。
        var grants = SeedPermissions.GrantsByRole();
        foreach (var role in new[] { "Editor", "Doctor", "Marketing" })
        {
            Assert.DoesNotContain(PermissionCodes.AccountManage, grants[role]);
            Assert.DoesNotContain(PermissionCodes.PageLegalEdit, grants[role]);
            Assert.DoesNotContain(PermissionCodes.CategoryManage, grants[role]);
            Assert.DoesNotContain(PermissionCodes.SettingsEdit, grants[role]);
            Assert.DoesNotContain(PermissionCodes.RedirectManage, grants[role]);
        }
    }

    [Fact]
    public void 行銷與醫師沒有任何_publish()
    {
        var grants = SeedPermissions.GrantsByRole();
        foreach (var role in new[] { "Marketing", "Doctor" })
            Assert.DoesNotContain(grants[role], c => c.EndsWith(".publish", StringComparison.Ordinal));
    }

    [Fact]
    public void 行銷只有_SEO_FAQ_與上傳()
    {
        Assert.Equivalent(
            new[] { "seo.edit", "content.faq.edit", "upload.file" },
            SeedPermissions.GrantsByRole()["Marketing"]);
    }

    [Fact]
    public void 所有角色權限指向的權限碼都存在()
    {
        // GrantsByRole() 的字典查詢本身會在孤兒外鍵時丟 KeyNotFound；這裡明確斷言它不丟。
        var grants = SeedPermissions.GrantsByRole();
        Assert.All(grants.Values.SelectMany(x => x), c => Assert.Contains(c, SeedPermissions.Permissions().Values));
    }
}
