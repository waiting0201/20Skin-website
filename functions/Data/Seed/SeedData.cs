using Microsoft.EntityFrameworkCore;
using Skin20.Api.Models.Entities;

namespace Skin20.Api.Data.Seed;

/// <summary>
/// 種子資料（docs/08-database.md §J-4）。
///
/// <para>
/// ⚠️ <b>Id 一律硬編。</b> 跨環境一致，對日後的內容遷移對照與 hotfix SQL 都很重要 ——
/// 若讓資料庫發號，dev 與 prod 的分類 Id 會不同，任何「把某某分類換掉」的 SQL
/// 就得先查一次。
/// </para>
/// <para>
/// ⚠️ <b>順序有相依</b>（§J-4）：角色 → 權限 → 使用者 → <b>分類與系統頁</b> → 版位 → 選單 → 設定 → 字詞。
/// <b>分類與系統頁沒建好就匯內容，療程與文章沒有分類可掛</b>（docs/02 §7 步驟 4）。
/// HasData 由 EF 一次寫進同一支 migration，順序由外鍵決定，但這裡仍照 §J-4 排列，
/// 讓人看得出相依關係。
/// </para>
/// </summary>
public static class SeedData
{
    /// <summary>建置期預設密碼 <c>Admin@123</c> 的 PBKDF2-HMAC-SHA512 雜湊（Identity v3 格式）。</summary>
    /// <remarks>
    /// 🔴 <b>上線前必須更換。</b> 後台路徑 <c>/admin/</c> 是客戶指定、與舊站相同、公開可猜；
    /// 而且<b>沒有雙因素、沒有 IP 白名單</b>（2026-09-11／2026-08-13 院方決定），
    /// 帳密是唯一憑證。這不是建議事項，是必要條件（docs/02 §4、STATUS.md §八）。
    ///
    /// <para>
    /// ⚠️ 這是<b>預先算好</b>的固定值（docs/08 §A-5 配套 1）—— 不要改成在 migration
    /// 執行時即席計算。migration 必須可重現，同一份 migration 在不同環境跑出不同 hash
    /// 會很難查。
    /// </para>
    /// </remarks>
    private const string SeedPasswordHash =
        "AQAAAAIAAzRQAAAAEHsfPJpF4o1gFKfPO5Ll2ECTJyv23mD5x4HV5WHpc2hQmBT5ViWSVxHETqeXoTArUA==";

    /// <summary>種子資料的建立時間。固定值 —— 用 <c>DateTime.UtcNow</c> 會讓 migration 不可重現。</summary>
    private static readonly DateTime SeedAt = new(2026, 9, 11, 0, 0, 0, DateTimeKind.Utc);

    public static void Apply(ModelBuilder b)
    {
        SeedRoles(b);
        SeedPermissions(b);
        SeedRolePermissions(b);
        SeedUsers(b);
        SeedTerms(b);
        SeedPages(b);
        SeedHomeSections(b);
        SeedMenuItems(b);
        SeedSiteSettings(b);
        SeedRiskTerms(b);
    }

    // ── 1. 角色（5，IsSystem=1 不可刪）────────────────────────────────
    private const int RoleSuperAdmin = 1;
    private const int RoleEditor = 2;
    private const int RoleDoctor = 3;
    private const int RoleMarketing = 4;
    private const int RoleReviewer = 5;

    private static void SeedRoles(ModelBuilder b) => b.Entity<Role>().HasData(
        new Role { Id = RoleSuperAdmin, Code = "SuperAdmin", Name = "超級管理員", IsSystem = true },
        new Role { Id = RoleEditor, Code = "Editor", Name = "內容編輯", IsSystem = true },
        new Role { Id = RoleDoctor, Code = "Doctor", Name = "醫師", IsSystem = true },
        new Role { Id = RoleMarketing, Code = "Marketing", Name = "行銷", IsSystem = true },
        new Role { Id = RoleReviewer, Code = "Reviewer", Name = "審核者", IsSystem = true });

    // ── 2. 權限碼（docs/08 §A-2）──────────────────────────────────────
    //
    // 九個內容型別 × (edit, publish) ＝ 18，加上 13 個跨單元的權限 ＝ 31。
    // ⚠️ seo.edit 與 content.*.edit 必須是兩個獨立權限 —— 這是 SeoMeta 獨立成表的原因。

    private static readonly (string Unit, string Label)[] ContentUnits =
    [
        ("treatment", "療程"), ("doctor", "醫師"), ("concern", "肌膚困擾"),
        ("article", "文章"), ("case", "案例"), ("faq", "FAQ"),
        ("clinic", "據點"), ("page", "頁面"), ("term", "分類與標籤"),
    ];

    private static readonly (string Code, string Name, string Group)[] CrossUnitPermissions =
    [
        ("content.submit", "送審", "內容"),
        ("review.approve", "審核核准", "工作流"),
        ("review.reject", "審核退回", "工作流"),
        ("seo.edit", "編輯 SEO 欄位", "SEO"),
        ("taxonomy.tag.create", "新增標籤", "分類與標籤"),
        ("taxonomy.category.manage", "新增／刪除分類", "分類與標籤"),
        ("page.legal.edit", "編輯法務頁", "頁面"),
        ("home.arrange", "首頁版位編排", "站台編排"),
        ("menu.edit", "導覽選單與頁尾", "站台編排"),
        ("settings.edit", "全站設定", "站台編排"),
        ("account.manage", "帳號與角色管理", "系統"),
        ("redirect.manage", "301 轉址管理", "SEO"),
        ("upload.file", "上傳圖片", "資產"),
    ];

    /// <summary>權限碼 → Id。Id 硬編：內容類 1–18、跨單元 19–31。</summary>
    private static Dictionary<string, int> PermissionIds()
    {
        var map = new Dictionary<string, int>();
        var id = 1;
        foreach (var (unit, _) in ContentUnits)
        {
            map[$"content.{unit}.edit"] = id++;
            map[$"content.{unit}.publish"] = id++;
        }
        foreach (var (code, _, _) in CrossUnitPermissions) map[code] = id++;
        return map;
    }

    private static void SeedPermissions(ModelBuilder b)
    {
        var ids = PermissionIds();
        var rows = new List<Permission>();

        foreach (var (unit, label) in ContentUnits)
        {
            rows.Add(new Permission
            {
                Id = ids[$"content.{unit}.edit"],
                Code = $"content.{unit}.edit",
                Name = $"編輯{label}",
                GroupName = "內容",
            });
            rows.Add(new Permission
            {
                Id = ids[$"content.{unit}.publish"],
                Code = $"content.{unit}.publish",
                Name = $"發布{label}",
                GroupName = "內容",
            });
        }

        foreach (var (code, name, group) in CrossUnitPermissions)
        {
            rows.Add(new Permission { Id = ids[code], Code = code, Name = name, GroupName = group });
        }

        b.Entity<Permission>().HasData(rows);
    }

    /// <summary>
    /// 角色 × 權限（docs/02 §4 的權限歸屬表逐條對應）。
    /// <para>
    /// 🔴 <b>內容編輯沒有任何 <c>*.publish</c></b> —— 發布權與編輯權分離是三段式工作流的前提。
    /// </para>
    /// <para>
    /// ⚠️ 行銷只有 <c>seo.edit</c> 與 <c>content.faq.edit</c>，<b>沒有其他 edit</b>：
    /// SEO 調整頻繁但風險低，與療效敘述的修改風險完全不同。
    /// </para>
    /// <para>
    /// ⚠️ 醫師的 <c>content.doctor.edit</c>／<c>content.article.edit</c> <b>受資料列層級限制</b>
    /// （只能改 <c>OwnerUserId</c> 是自己的），這條權限碼表達不了，由應用層判定
    /// （docs/11 §5.4，鐵律 4 的唯一豁免）。
    /// </para>
    /// </summary>
    private static void SeedRolePermissions(ModelBuilder b)
    {
        var ids = PermissionIds();
        var rows = new List<RolePermission>();
        void Grant(int roleId, params string[] codes)
        {
            foreach (var c in codes) rows.Add(new RolePermission { RoleId = roleId, PermissionId = ids[c] });
        }

        // 超級管理員：全部
        Grant(RoleSuperAdmin, [.. ids.Keys]);

        // 內容編輯：九單元 edit ＋ 送審 ＋ SEO ＋ 新增標籤 ＋ 版位編排 ＋ 上傳。沒有 publish。
        Grant(RoleEditor, [.. ContentUnits.Select(u => $"content.{u.Unit}.edit")]);
        Grant(RoleEditor, "content.submit", "seo.edit", "taxonomy.tag.create", "home.arrange", "upload.file");

        // 醫師：只有自己的個人頁與自己署名的文章，加上指派的醫學審閱
        Grant(RoleDoctor, "content.doctor.edit", "content.article.edit",
            "content.submit", "review.approve", "review.reject", "upload.file");

        // 行銷：SEO ＋ FAQ，讀得到全部但改不了本文
        Grant(RoleMarketing, "seo.edit", "content.faq.edit", "upload.file");

        // 審核者：九單元 publish ＋ 審核決定
        Grant(RoleReviewer, [.. ContentUnits.Select(u => $"content.{u.Unit}.publish")]);
        Grant(RoleReviewer, "review.approve", "review.reject");

        b.Entity<RolePermission>().HasData(rows);
    }

    // ── 3. 種子帳號（docs/08 §A-5）────────────────────────────────────
    private static void SeedUsers(ModelBuilder b)
    {
        b.Entity<User>().HasData(new User
        {
            Id = 1,
            // ⚠️ 長得像 email，但它是使用者名稱。API 端不可對它做 email 格式驗證，
            //    也不可拿它當寄信位址（docs/08 §A-1）。
            UserName = "sa@system.local",
            DisplayName = "系統管理員",
            PasswordHash = SeedPasswordHash,
            SecurityStamp = "SEED0000-0000-4000-8000-000000000001",
            NotifyEmail = null,
            IsActive = true,
            MustChangePassword = true,
            DoctorId = null,
            CreatedAt = SeedAt,
            UpdatedAt = SeedAt,
        });

        b.Entity<UserRole>().HasData(new UserRole { UserId = 1, RoleId = RoleSuperAdmin });
    }

    // ── 4. 分類與標籤 13 筆（docs/08 §C-9）────────────────────────────
    //
    // ⚠️ 這 13 筆與下面 11 個系統頁必須在內容匯入之前建立，否則療程與文章沒有分類可掛。

    /// <summary>
    /// FAQ 五大分類。
    /// <para>
    /// 🔴 <b>這組取自 <c>mockup/16-faq.html</c>（客戶看過的版本），不是 docs/08 §C-9 的種子清單。</b>
    /// 兩份文件對不上（STATUS.md §八 待決）：08 那組是「品牌與診所／療程相關／肌膚困擾／
    /// 醫師與看診／費用與流程」，但它<b>沒有 slug</b>（療程分類與文章分類都有），而
    /// <c>/faq/{category}/</c> 需要 slug 才成立；而且它有「肌膚困擾」，與 <c>/concerns/</c>
    /// 整個區段重複 —— docs/01 決策一的核心就是把困擾獨立成一條軸線。
    /// </para>
    /// <para>
    /// ⚠️ 定案之後若採用另一組，<b>改這裡一處即可</b>，但那時已產生的 URL 需要補 301。
    /// </para>
    /// </summary>
    private static readonly (int Id, string Slug, string Name)[] FaqCategories =
    [
        (1009, "treatment", "療程相關"),
        (1010, "aftercare", "術後照護"),
        (1011, "visit", "看診與預約"),
        (1012, "fee", "費用與付款"),
        (1013, "clinic", "院所資訊"),
    ];

    private static void SeedTerms(ModelBuilder b)
    {
        var rows = new List<Term>();

        void AddTerm(int id, TermType type, string slug, string name, string urlPath, int sort)
        {
            rows.Add(new Term
            {
                Id = id,
                ContentType = ContentType.Term,
                TermType = type,
                Slug = slug,
                UrlPath = urlPath,
                Title = name,
                // 分類是結構的一部分，種子直接上架；標籤另有規則見下。
                Status = ContentStatus.Published,
                SortOrder = sort,
                IncludeInSitemap = true,
                // ⚠️ 新增／刪除分類限超級管理員，且會動到 URL 結構與 301 對照表。
                IsSystemLocked = true,
                CreatedAt = SeedAt,
                UpdatedAt = SeedAt,
            });
        }

        // 療程分類 4（slug 見 docs/01 §1）
        AddTerm(1001, TermType.TreatmentCategory, "laser", "光療美顏", "/treatments/laser/", 1);
        AddTerm(1002, TermType.TreatmentCategory, "photoelectric", "光電美容", "/treatments/photoelectric/", 2);
        AddTerm(1003, TermType.TreatmentCategory, "microneedle", "微針美容", "/treatments/microneedle/", 3);
        AddTerm(1004, TermType.TreatmentCategory, "skincare", "醫美保養", "/treatments/skincare/", 4);

        // 文章分類 4
        AddTerm(1005, TermType.ArticleCategory, "medical-aesthetics", "醫美新知", "/blog/medical-aesthetics/", 1);
        AddTerm(1006, TermType.ArticleCategory, "dermatology", "皮膚新知", "/blog/dermatology/", 2);
        AddTerm(1007, TermType.ArticleCategory, "media", "媒體報導", "/blog/media/", 3);
        AddTerm(1008, TermType.ArticleCategory, "lectures", "演講授課", "/blog/lectures/", 4);

        // FAQ 分類 5
        var sort = 1;
        foreach (var (id, slug, name) in FaqCategories)
        {
            AddTerm(id, TermType.FaqCategory, slug, name, $"/faq/{slug}/", sort++);
        }

        b.Entity<Term>().HasData(rows);

        // ⚠️ 文章標籤（TermType=4）沒有種子 —— 它們由編輯逐一新增。
        //    新增時的預設值是 IncludeInSitemap=0 ＋ SeoMeta.NoIndex=1（docs/08 §C-9）：
        //    30–60 個標籤頁內容單薄，全開會稀釋約 800 篇文章的索引預算。
        //    那個預設值屬於應用層的建立邏輯，不是 schema 預設值。
    }

    // ── 5. 頁面：11 個系統頁 ＋ 6 個自由頁（docs/08 §C-8）──────────────
    private static void SeedPages(ModelBuilder b)
    {
        var rows = new List<Page>();

        void AddPage(
            int id, PageKind kind, string? systemKey, string slug, string? urlPath,
            string title, int sort, bool includeInSitemap = true, bool superAdminOnly = false)
        {
            rows.Add(new Page
            {
                Id = id,
                ContentType = ContentType.Page,
                PageKind = kind,
                SystemKey = systemKey,
                Slug = slug,
                UrlPath = urlPath,
                Title = title,
                Status = ContentStatus.Published,
                SortOrder = sort,
                IncludeInSitemap = includeInSitemap,
                // 系統頁一律鎖定：不可刪、不可改 slug。前台路由、麵包屑與 sitemap 分檔
                // 都依賴這些路徑存在，允許刪除等於允許編輯把站砍出 404。
                IsSystemLocked = kind == PageKind.System,
                SuperAdminOnly = superAdminOnly,
                CreatedAt = SeedAt,
                UpdatedAt = SeedAt,
            });
        }

        // 系統頁 11
        // ⚠️ `home` 這一筆是刻意的（docs/08 §C-8）：後台的首頁歸「首頁版位編排」畫面，
        //    但資料層仍需要一筆 ContentItem，讓首頁複用工作流、版本歷程與 SEO 區塊。
        //    後台不因此多一個畫面 —— /admin/page 不列出 home。
        AddPage(1101, PageKind.System, "home", "home", "/", "首頁", 1);
        AddPage(1102, PageKind.System, "team-index", "team", "/team/", "醫療團隊", 2);
        AddPage(1103, PageKind.System, "treatments-index", "treatments", "/treatments/", "專業服務", 3);
        AddPage(1104, PageKind.System, "concerns-index", "concerns", "/concerns/", "肌膚困擾", 4);
        AddPage(1105, PageKind.System, "blog-index", "blog", "/blog/", "臻美分享", 5);
        AddPage(1106, PageKind.System, "cases-index", "cases", "/cases/", "案例分享", 6);
        AddPage(1107, PageKind.System, "faq-index", "faq", "/faq/", "常見問題", 7);
        AddPage(1108, PageKind.System, "clinics-index", "clinics", "/clinics/", "診所據點", 8);
        AddPage(1109, PageKind.System, "contact", "contact", "/contact/", "聯絡我們", 9);
        // ⚠️ 搜尋頁與 404 不進 sitemap（docs/03 §1：robots 封鎖 /search/）
        AddPage(1110, PageKind.System, "search", "search", "/search/", "網站搜尋", 10, includeInSitemap: false);
        AddPage(1111, PageKind.System, "not-found", "404", "/404", "找不到頁面", 11, includeInSitemap: false);

        // 自由頁 6
        AddPage(1112, PageKind.Free, null, "about", "/about/", "品牌理念", 1);
        AddPage(1113, PageKind.Free, null, "new-chinese-aesthetics", "/about/new-chinese-aesthetics/", "新中式美學", 2);
        AddPage(1114, PageKind.Free, null, "makeup-style", "/about/makeup-style/", "彩妝式輕醫美", 3);
        // 法務三頁限超級管理員：條款文字有法律效力，不宜由行銷調整
        AddPage(1115, PageKind.Free, null, "privacy", "/privacy/", "隱私權政策", 4, superAdminOnly: true);
        AddPage(1116, PageKind.Free, null, "terms", "/terms/", "服務條款", 5, superAdminOnly: true);
        AddPage(1117, PageKind.Free, null, "medical-disclaimer", "/medical-disclaimer/", "醫療免責聲明", 6, superAdminOnly: true);

        b.Entity<Page>().HasData(rows);
    }

    // ── 6. 首頁版位 7（docs/08 §G-2）──────────────────────────────────
    //
    // ⚠️ 可停用、可排序，**不可新增刪除** —— 否則首頁又會慢慢變回自由編輯頁。
    private static void SeedHomeSections(ModelBuilder b) => b.Entity<HomeSection>().HasData(
        new HomeSection { Id = 1, SectionKey = "hero", Title = "主視覺", IsEnabled = true, SortOrder = 1 },
        new HomeSection { Id = 2, SectionKey = "specialties", Title = "八大專科入口", IsEnabled = true, SortOrder = 2 },
        new HomeSection { Id = 3, SectionKey = "featured-treatments", Title = "精選療程", IsEnabled = true, SortOrder = 3 },
        new HomeSection { Id = 4, SectionKey = "latest-articles", Title = "最新文章", IsEnabled = true, SortOrder = 4 },
        new HomeSection { Id = 5, SectionKey = "doctors", Title = "醫師團隊", IsEnabled = true, SortOrder = 5 },
        new HomeSection { Id = 6, SectionKey = "clinics", Title = "據點資訊", IsEnabled = true, SortOrder = 6 },
        new HomeSection { Id = 7, SectionKey = "brand-story", Title = "品牌理念摘要", IsEnabled = true, SortOrder = 7 });

    // ── 7. 導覽選單（docs/08 §G-3）────────────────────────────────────
    private static void SeedMenuItems(ModelBuilder b)
    {
        var rows = new List<MenuItem>();
        var id = 1;

        void AddMain(string label, string path, int sort)
        {
            rows.Add(new MenuItem
            {
                Id = id++, MenuKey = "main", ParentId = null, Depth = 1, Label = label,
                LinkKind = MenuLinkKind.InternalPath, Url = path,
                IsExternal = false, OpenInNewTab = false, SortOrder = sort,
            });
        }

        AddMain("品牌理念", "/about/", 1);
        AddMain("肌膚困擾", "/concerns/", 2);
        AddMain("專業服務", "/treatments/", 3);
        AddMain("醫師團隊", "/team/", 4);
        AddMain("臻美分享", "/blog/", 5);
        AddMain("案例分享", "/cases/", 6);
        AddMain("常見問題", "/faq/", 7);
        AddMain("診所據點", "/clinics/", 8);

        // 🔴 booking.20skin.tw 與 20skinshop.com 在這裡，而且**只在這裡**。
        //    兩個外部網域在整個 schema 的唯一落點就是這兩筆。它們不進內容表、
        //    不進 sitemap、不進 301 對照表（CLAUDE.md 決策 4）。
        //    任何人想在別的表放這兩個網域，就是在把已排除的範圍偷渡回來。
        rows.Add(new MenuItem
        {
            Id = id++, MenuKey = "main", Depth = 1, Label = "線上預約",
            LinkKind = MenuLinkKind.ExternalUrl, Url = "https://booking.20skin.tw/MainMs/Login",
            IsExternal = true, RelAttr = "noopener external", OpenInNewTab = true, SortOrder = 9,
        });
        rows.Add(new MenuItem
        {
            Id = id++, MenuKey = "main", Depth = 1, Label = "線上購物",
            LinkKind = MenuLinkKind.ExternalUrl, Url = "https://www.20skinshop.com/",
            IsExternal = true, RelAttr = "noopener external", OpenInNewTab = true, SortOrder = 10,
        });

        // 頁尾的法務三頁
        var footerSort = 1;
        foreach (var (label, path) in new[]
                 {
                     ("隱私權政策", "/privacy/"), ("服務條款", "/terms/"), ("醫療免責聲明", "/medical-disclaimer/"),
                 })
        {
            rows.Add(new MenuItem
            {
                Id = id++, MenuKey = "footer", Depth = 1, Label = label,
                LinkKind = MenuLinkKind.InternalPath, Url = path,
                IsExternal = false, OpenInNewTab = false, SortOrder = footerSort++,
            });
        }

        b.Entity<MenuItem>().HasData(rows);
    }

    // ── 8. 全站設定（docs/08 §G-1）────────────────────────────────────
    private static void SeedSiteSettings(ModelBuilder b)
    {
        var rows = new List<SiteSetting>();
        void Add(string key, string value, SettingValueType type)
            => rows.Add(new SiteSetting { SettingKey = key, SettingValue = value, ValueType = type, UpdatedAt = SeedAt });

        Add("site.name", "20SKIN 美醫集團", SettingValueType.Text);
        Add("site.description",
            "20SKIN 美醫集團——四季診所與二林四季皮膚科，以新中式美學為理念的皮膚科專科醫療團隊。",
            SettingValueType.Text);
        // ⚠️ 存的是內嵌圖片的 JSON（url／blobPath／alt／…），不是媒體庫的 Id——
        //    不做媒體庫之後沒有可以指過去的表（docs/08 §0 決策五）。
        Add("site.logoImage", "", SettingValueType.Json);
        Add("site.defaultOgImage", "", SettingValueType.Json);

        // ⚠️ NAP 主資料：必須與據點頁、頁尾逐字一致（docs/03 §4 ③ —— AI 靠交叉比對
        //    建立實體信心，任何不一致都會降低確信度）。
        //    🔴 目前是佔位值，院方尚未提供真實地址與電話（STATUS.md §八）。
        Add("nap.json", "[]", SettingValueType.Json);

        Add("contact.recipientEmail", "", SettingValueType.Text);
        Add("tracking.ga4", "", SettingValueType.Text);
        Add("footer.copyright", "© 2026 20SKIN 美醫集團．All Rights Reserved.", SettingValueType.Text);
        Add("footer.social.json", "[]", SettingValueType.Json);

        // robots.txt 內容放設定，不寫死在建置腳本裡（docs/08 §H 末段）
        // ⚠️ 不要列 Disallow: /admin/ —— 後台實際位於 /admin/，寫進公開檔案等於標示位置。
        //    擋索引由該 route 的 X-Robots-Tag 負責（docs/03 §1）。
        Add("seo.robotsTxt",
            "User-agent: *\nAllow: /\nDisallow: /search/\n\nSitemap: https://20skin.tw/sitemap.xml",
            SettingValueType.Text);

        // 🔴 AI FAQ 的啟用開關**預設關閉**（docs/04 §4）：Phase 1 只交付介面，
        //    AI 未串接前不對外顯示 —— 一顆點下去沒反應的常駐按鈕比沒有按鈕更糟。
        //    ⚠️ 這個值必須是資料不是建置期常數，因為驗收標準要求「啟用與停用不需重新部署」。
        Add("aifaq.enabled", "false", SettingValueType.Boolean);
        Add("aifaq.panelTitle", "AI 線上諮詢", SettingValueType.Text);
        Add("aifaq.welcomeText",
            "你好，我是 20SKIN 的線上諮詢助理。可以用自己的話問我療程、術後照護或看診流程的問題。",
            SettingValueType.Text);
        Add("aifaq.handoffBookingUrl", "https://booking.20skin.tw/MainMs/Login", SettingValueType.Url);
        Add("aifaq.handoffLineUrl", "", SettingValueType.Url);

        b.Entity<SiteSetting>().HasData(rows);
    }

    // ── 9. 高風險字詞（docs/08 §B-5、docs/02 §5）──────────────────────
    //
    // ⚠️ 編輯器即時警示用。**警示不阻擋輸入也不阻擋送審**，命中結果隨送審單帶走。
    // 本表為架構設計，具體用語之合法性請以主管機關函釋及院方法務意見為準。
    private static void SeedRiskTerms(ModelBuilder b)
    {
        var rows = new List<RiskTerm>();
        var id = 1;
        void Add(RiskTermCategory category, params string[] terms)
        {
            foreach (var t in terms)
                rows.Add(new RiskTerm { Id = id++, Term = t, Category = category, IsActive = true });
        }

        Add(RiskTermCategory.EfficacyGuarantee, "保證", "完全根治", "根治", "零風險", "永久有效", "永久", "百分之百", "無副作用");
        Add(RiskTermCategory.Comparative, "最好", "最佳", "第一", "唯一", "最強", "最有效");
        Add(RiskTermCategory.ImproperSolicitation, "折扣", "贈品", "限時優惠", "免費", "買一送一", "分期付款", "特價");
        Add(RiskTermCategory.Testimonial, "見證", "推薦", "親身體驗", "使用心得");

        b.Entity<RiskTerm>().HasData(rows);
    }
}
