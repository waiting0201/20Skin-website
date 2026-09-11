using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Skin20.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "HomeSections",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    SectionKey = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Title = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Subtitle = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    IsEnabled = table.Column<bool>(type: "bit", nullable: false, defaultValue: true)
                        .Annotation("Relational:DefaultConstraintName", "DF_HomeSections_IsEnabled"),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                    Settings = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_HomeSections", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "LoginThrottles",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Dimension = table.Column<byte>(type: "tinyint", nullable: false),
                    ThrottleKey = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    FailedCount = table.Column<int>(type: "int", nullable: false),
                    FirstFailedAt = table.Column<DateTime>(type: "datetime2(0)", nullable: false),
                    LastFailedAt = table.Column<DateTime>(type: "datetime2(0)", nullable: false),
                    LockedUntil = table.Column<DateTime>(type: "datetime2(0)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LoginThrottles", x => x.Id);
                    table.CheckConstraint("CK_LoginThrottles_Dimension", "[Dimension] IN (1, 2)");
                });

            migrationBuilder.CreateTable(
                name: "Permissions",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Code = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    GroupName = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Permissions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "RiskTerms",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Term = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Category = table.Column<byte>(type: "tinyint", nullable: false),
                    Note = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false, defaultValue: true)
                        .Annotation("Relational:DefaultConstraintName", "DF_RiskTerms_IsActive")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RiskTerms", x => x.Id);
                    table.CheckConstraint("CK_RiskTerms_Category", "[Category] BETWEEN 1 AND 4");
                });

            migrationBuilder.CreateTable(
                name: "Roles",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Code = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    IsSystem = table.Column<bool>(type: "bit", nullable: false, defaultValue: false)
                        .Annotation("Relational:DefaultConstraintName", "DF_Roles_IsSystem")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Roles", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "RolePermissions",
                columns: table => new
                {
                    RoleId = table.Column<int>(type: "int", nullable: false),
                    PermissionId = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RolePermissions", x => new { x.RoleId, x.PermissionId });
                    table.ForeignKey(
                        name: "FK_RolePermissions_Permissions",
                        column: x => x.PermissionId,
                        principalTable: "Permissions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_RolePermissions_Roles",
                        column: x => x.RoleId,
                        principalTable: "Roles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Articles",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false),
                    CategoryTermId = table.Column<int>(type: "int", nullable: false),
                    AuthorDoctorId = table.Column<int>(type: "int", nullable: true),
                    AuthorName = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    ReviewerDoctorId = table.Column<int>(type: "int", nullable: true),
                    ReviewedOn = table.Column<DateOnly>(type: "date", nullable: true),
                    DisplayDate = table.Column<DateTime>(type: "datetime2(0)", nullable: false),
                    CoverMediaId = table.Column<int>(type: "int", nullable: true),
                    Summary = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    BodyBlocks = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ReadingMinutes = table.Column<int>(type: "int", nullable: true),
                    SourceSite = table.Column<byte>(type: "tinyint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Articles", x => x.Id);
                    table.CheckConstraint("CK_Articles_SourceSite", "[SourceSite] BETWEEN 1 AND 2");
                });

            migrationBuilder.CreateTable(
                name: "CaseImages",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    CaseId = table.Column<int>(type: "int", nullable: false),
                    MediaId = table.Column<int>(type: "int", nullable: false),
                    Phase = table.Column<byte>(type: "tinyint", nullable: false),
                    TakenOn = table.Column<DateOnly>(type: "date", nullable: true),
                    SortOrder = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CaseImages", x => x.Id);
                    table.CheckConstraint("CK_CaseImages_Phase", "[Phase] BETWEEN 1 AND 2");
                });

            migrationBuilder.CreateTable(
                name: "Cases",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false),
                    TreatmentId = table.Column<int>(type: "int", nullable: false),
                    SessionsText = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    Narrative = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    IndividualVarianceStatement = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    HasWrittenConsent = table.Column<bool>(type: "bit", nullable: false),
                    ConsentReference = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ShootingConditions = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Cases", x => x.Id);
                    table.CheckConstraint("CK_Cases_ConsentReference_NotEmpty", "LEN([ConsentReference]) > 0");
                    table.CheckConstraint("CK_Cases_IndividualVarianceStatement_NotEmpty", "LEN([IndividualVarianceStatement]) > 0");
                    table.CheckConstraint("CK_Cases_ShootingConditions_NotEmpty", "LEN([ShootingConditions]) > 0");
                });

            migrationBuilder.CreateTable(
                name: "ClinicBusinessHours",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ClinicId = table.Column<int>(type: "int", nullable: false),
                    DayOfWeek = table.Column<byte>(type: "tinyint", nullable: false),
                    StartTime = table.Column<TimeOnly>(type: "time(0)", nullable: false),
                    EndTime = table.Column<TimeOnly>(type: "time(0)", nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ClinicBusinessHours", x => x.Id);
                    table.CheckConstraint("CK_ClinicBusinessHours_DayOfWeek", "[DayOfWeek] BETWEEN 0 AND 6");
                    table.CheckConstraint("CK_ClinicBusinessHours_TimeRange", "[EndTime] > [StartTime]");
                });

            migrationBuilder.CreateTable(
                name: "ClinicPhotos",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ClinicId = table.Column<int>(type: "int", nullable: false),
                    MediaId = table.Column<int>(type: "int", nullable: false),
                    Caption = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    SortOrder = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ClinicPhotos", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Clinics",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false),
                    Address = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    Phone = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    LineUrl = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    Latitude = table.Column<decimal>(type: "decimal(9,6)", nullable: false),
                    Longitude = table.Column<decimal>(type: "decimal(9,6)", nullable: false),
                    MapUrl = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    TransportInfo = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Intro = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Clinics", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Concerns",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false),
                    Symptoms = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Causes = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    SelfCheckGuide = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    WhenToSeeDoctor = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CoverMediaId = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Concerns", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ContentItems",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ContentType = table.Column<byte>(type: "tinyint", nullable: false),
                    Slug = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: true, collation: "Latin1_General_100_BIN2"),
                    UrlPath = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true, collation: "Latin1_General_100_BIN2"),
                    Title = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Status = table.Column<byte>(type: "tinyint", nullable: false, defaultValue: (byte)1)
                        .Annotation("Relational:DefaultConstraintName", "DF_ContentItems_Status"),
                    PublishAt = table.Column<DateTime>(type: "datetime2(0)", nullable: true),
                    UnpublishAt = table.Column<DateTime>(type: "datetime2(0)", nullable: true),
                    PublishedVersionId = table.Column<int>(type: "int", nullable: true),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                    IncludeInSitemap = table.Column<bool>(type: "bit", nullable: false, defaultValue: true)
                        .Annotation("Relational:DefaultConstraintName", "DF_ContentItems_IncludeInSitemap"),
                    IsSystemLocked = table.Column<bool>(type: "bit", nullable: false, defaultValue: false)
                        .Annotation("Relational:DefaultConstraintName", "DF_ContentItems_IsSystemLocked"),
                    OwnerUserId = table.Column<int>(type: "int", nullable: true),
                    CreatedByUserId = table.Column<int>(type: "int", nullable: true),
                    UpdatedByUserId = table.Column<int>(type: "int", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2(0)", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2(0)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ContentItems", x => x.Id);
                    table.UniqueConstraint("UQ_ContentItems_Id_ContentType", x => new { x.Id, x.ContentType });
                    table.CheckConstraint("CK_ContentItems_ContentType", "[ContentType] BETWEEN 1 AND 9");
                    table.CheckConstraint("CK_ContentItems_PublishWindow", "[PublishAt] IS NULL OR [UnpublishAt] IS NULL OR [UnpublishAt] > [PublishAt]");
                    table.CheckConstraint("CK_ContentItems_Status", "[Status] BETWEEN 1 AND 4");
                });

            migrationBuilder.CreateTable(
                name: "ContentRelations",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    FromContentItemId = table.Column<int>(type: "int", nullable: false),
                    FromContentType = table.Column<byte>(type: "tinyint", nullable: false),
                    ToContentItemId = table.Column<int>(type: "int", nullable: false),
                    ToContentType = table.Column<byte>(type: "tinyint", nullable: false),
                    RelationType = table.Column<byte>(type: "tinyint", nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false, defaultValue: 0)
                        .Annotation("Relational:DefaultConstraintName", "DF_ContentRelations_SortOrder"),
                    Note = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ContentRelations", x => x.Id);
                    table.CheckConstraint("CK_ContentRelations_RelationType", "[RelationType] BETWEEN 1 AND 12");
                    table.CheckConstraint("CK_ContentRelations_ValidCombination", "(RelationType = 1  AND FromContentType = 1 AND ToContentType = 2) OR\n(RelationType = 2  AND FromContentType = 1 AND ToContentType = 3) OR\n(RelationType = 3  AND FromContentType = 1 AND ToContentType = 4) OR\n(RelationType = 4  AND FromContentType = 1 AND ToContentType = 6) OR\n(RelationType = 5  AND FromContentType = 3 AND ToContentType = 1) OR\n(RelationType = 6  AND FromContentType = 3 AND ToContentType = 6) OR\n(RelationType = 7  AND FromContentType = 3 AND ToContentType = 4) OR\n(RelationType = 8  AND FromContentType = 7 AND ToContentType = 2) OR\n(RelationType = 9  AND FromContentType = 7 AND ToContentType = 1) OR\n(RelationType = 10 AND FromContentType = 7 AND ToContentType = 6) OR\n(RelationType = 11 AND FromContentType = 4 AND ToContentType = 9) OR\n(RelationType = 12 AND FromContentType = 8 AND ToContentType IN (1,2,3,4,5,6,7,9))");
                    table.ForeignKey(
                        name: "FK_ContentRelations_ContentItems_From",
                        columns: x => new { x.FromContentItemId, x.FromContentType },
                        principalTable: "ContentItems",
                        principalColumns: new[] { "Id", "ContentType" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ContentRelations_ContentItems_To",
                        columns: x => new { x.ToContentItemId, x.ToContentType },
                        principalTable: "ContentItems",
                        principalColumns: new[] { "Id", "ContentType" });
                });

            migrationBuilder.CreateTable(
                name: "HomeSectionItems",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    HomeSectionId = table.Column<int>(type: "int", nullable: false),
                    ContentItemId = table.Column<int>(type: "int", nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_HomeSectionItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_HomeSectionItems_ContentItems",
                        column: x => x.ContentItemId,
                        principalTable: "ContentItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_HomeSectionItems_HomeSections",
                        column: x => x.HomeSectionId,
                        principalTable: "HomeSections",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "MenuItems",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    MenuKey = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    ParentId = table.Column<int>(type: "int", nullable: true),
                    Depth = table.Column<byte>(type: "tinyint", nullable: false),
                    Label = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    LinkKind = table.Column<byte>(type: "tinyint", nullable: false),
                    ContentItemId = table.Column<int>(type: "int", nullable: true),
                    Url = table.Column<string>(type: "nvarchar(400)", maxLength: 400, nullable: true),
                    IsExternal = table.Column<bool>(type: "bit", nullable: false, defaultValue: false)
                        .Annotation("Relational:DefaultConstraintName", "DF_MenuItems_IsExternal"),
                    RelAttr = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: true),
                    OpenInNewTab = table.Column<bool>(type: "bit", nullable: false, defaultValue: false)
                        .Annotation("Relational:DefaultConstraintName", "DF_MenuItems_OpenInNewTab"),
                    SortOrder = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MenuItems", x => x.Id);
                    table.CheckConstraint("CK_MenuItems_Depth", "[Depth] IN (1, 2)");
                    table.CheckConstraint("CK_MenuItems_LinkKind", "[LinkKind] BETWEEN 1 AND 3");
                    table.ForeignKey(
                        name: "FK_MenuItems_ContentItems",
                        column: x => x.ContentItemId,
                        principalTable: "ContentItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MenuItems_MenuItems_Parent",
                        column: x => x.ParentId,
                        principalTable: "MenuItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Redirects",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    FromPath = table.Column<string>(type: "nvarchar(400)", maxLength: 400, nullable: false, collation: "Latin1_General_100_BIN2"),
                    ToPath = table.Column<string>(type: "nvarchar(400)", maxLength: 400, nullable: false, collation: "Latin1_General_100_BIN2"),
                    ToContentItemId = table.Column<int>(type: "int", nullable: true),
                    StatusCode = table.Column<short>(type: "smallint", nullable: false, defaultValue: (short)301)
                        .Annotation("Relational:DefaultConstraintName", "DF_Redirects_StatusCode"),
                    IsActive = table.Column<bool>(type: "bit", nullable: false, defaultValue: true)
                        .Annotation("Relational:DefaultConstraintName", "DF_Redirects_IsActive"),
                    Source = table.Column<byte>(type: "tinyint", nullable: false),
                    IsVerified = table.Column<bool>(type: "bit", nullable: false, defaultValue: false)
                        .Annotation("Relational:DefaultConstraintName", "DF_Redirects_IsVerified"),
                    CreatedAt = table.Column<DateTime>(type: "datetime2(0)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Redirects", x => x.Id);
                    table.CheckConstraint("CK_Redirects_Source", "[Source] BETWEEN 1 AND 3");
                    table.CheckConstraint("CK_Redirects_StatusCode", "[StatusCode] IN (301, 302, 307, 308)");
                    table.ForeignKey(
                        name: "FK_Redirects_ContentItems",
                        column: x => x.ToContentItemId,
                        principalTable: "ContentItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "ContentReviews",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ContentItemId = table.Column<int>(type: "int", nullable: false),
                    VersionId = table.Column<int>(type: "int", nullable: false),
                    SubmittedByUserId = table.Column<int>(type: "int", nullable: false),
                    SubmittedAt = table.Column<DateTime>(type: "datetime2(0)", nullable: false),
                    Status = table.Column<byte>(type: "tinyint", nullable: false, defaultValue: (byte)1)
                        .Annotation("Relational:DefaultConstraintName", "DF_ContentReviews_Status"),
                    DecidedByUserId = table.Column<int>(type: "int", nullable: true),
                    DecidedAt = table.Column<DateTime>(type: "datetime2(0)", nullable: true),
                    DecisionNote = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    RiskFlags = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ContentReviews", x => x.Id);
                    table.CheckConstraint("CK_ContentReviews_RejectNeedsNote", "[Status] <> 3 OR ([DecisionNote] IS NOT NULL AND LEN([DecisionNote]) > 0)");
                    table.CheckConstraint("CK_ContentReviews_Status", "[Status] BETWEEN 1 AND 3");
                    table.ForeignKey(
                        name: "FK_ContentReviews_ContentItems",
                        column: x => x.ContentItemId,
                        principalTable: "ContentItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ContentVersions",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ContentItemId = table.Column<int>(type: "int", nullable: false),
                    VersionNo = table.Column<int>(type: "int", nullable: false),
                    Title = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Snapshot = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Note = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    CreatedByUserId = table.Column<int>(type: "int", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2(0)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ContentVersions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ContentVersions_ContentItems",
                        column: x => x.ContentItemId,
                        principalTable: "ContentItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "DoctorCredentials",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    DoctorId = table.Column<int>(type: "int", nullable: false),
                    Type = table.Column<byte>(type: "tinyint", nullable: false),
                    Text = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DoctorCredentials", x => x.Id);
                    table.CheckConstraint("CK_DoctorCredentials_Type", "[Type] BETWEEN 1 AND 3");
                });

            migrationBuilder.CreateTable(
                name: "Doctors",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false),
                    JobTitle = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    IsPhysician = table.Column<bool>(type: "bit", nullable: false),
                    Specialty = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    PhotoMediaId = table.Column<int>(type: "int", nullable: true),
                    Bio = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Publications = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Doctors", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Doctors_ContentItems_Id",
                        column: x => x.Id,
                        principalTable: "ContentItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "DoctorSchedules",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    DoctorId = table.Column<int>(type: "int", nullable: false),
                    ClinicId = table.Column<int>(type: "int", nullable: false),
                    DayOfWeek = table.Column<byte>(type: "tinyint", nullable: false),
                    StartTime = table.Column<TimeOnly>(type: "time(0)", nullable: false),
                    EndTime = table.Column<TimeOnly>(type: "time(0)", nullable: false),
                    Note = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DoctorSchedules", x => x.Id);
                    table.CheckConstraint("CK_DoctorSchedules_DayOfWeek", "[DayOfWeek] BETWEEN 0 AND 6");
                    table.CheckConstraint("CK_DoctorSchedules_TimeRange", "[EndTime] > [StartTime]");
                    table.ForeignKey(
                        name: "FK_DoctorSchedules_Clinics",
                        column: x => x.ClinicId,
                        principalTable: "Clinics",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_DoctorSchedules_Doctors",
                        column: x => x.DoctorId,
                        principalTable: "Doctors",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "DoctorTags",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    DoctorId = table.Column<int>(type: "int", nullable: false),
                    Tag = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DoctorTags", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DoctorTags_Doctors",
                        column: x => x.DoctorId,
                        principalTable: "Doctors",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Users",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UserName = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    DisplayName = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    PasswordHash = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    SecurityStamp = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    NotifyEmail = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false, defaultValue: true)
                        .Annotation("Relational:DefaultConstraintName", "DF_Users_IsActive"),
                    MustChangePassword = table.Column<bool>(type: "bit", nullable: false, defaultValue: false)
                        .Annotation("Relational:DefaultConstraintName", "DF_Users_MustChangePassword"),
                    DoctorId = table.Column<int>(type: "int", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2(0)", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2(0)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Users", x => x.Id);
                    table.CheckConstraint("CK_Users_UserName_NotEmpty", "LEN([UserName]) > 0");
                    table.ForeignKey(
                        name: "FK_Users_Doctors",
                        column: x => x.DoctorId,
                        principalTable: "Doctors",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "MediaAssets",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ContainerName = table.Column<string>(type: "nvarchar(63)", maxLength: 63, nullable: false),
                    BlobPath = table.Column<string>(type: "nvarchar(400)", maxLength: 400, nullable: false),
                    PublicUrl = table.Column<string>(type: "nvarchar(600)", maxLength: 600, nullable: false),
                    OriginalFileName = table.Column<string>(type: "nvarchar(260)", maxLength: 260, nullable: false),
                    ContentType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ByteSize = table.Column<long>(type: "bigint", nullable: false),
                    Width = table.Column<int>(type: "int", nullable: true),
                    Height = table.Column<int>(type: "int", nullable: true),
                    ContentHash = table.Column<string>(type: "nchar(64)", fixedLength: true, maxLength: 64, nullable: false),
                    AltText = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    Caption = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    IsPrivate = table.Column<bool>(type: "bit", nullable: false, defaultValue: false)
                        .Annotation("Relational:DefaultConstraintName", "DF_MediaAssets_IsPrivate"),
                    Variants = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    UploadedByUserId = table.Column<int>(type: "int", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2(0)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MediaAssets", x => x.Id);
                    table.CheckConstraint("CK_MediaAssets_ContentHash_Length", "LEN([ContentHash]) = 64");
                    table.ForeignKey(
                        name: "FK_MediaAssets_Users",
                        column: x => x.UploadedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "QuestionInbox",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    QuestionText = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    NormalizedText = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Source = table.Column<byte>(type: "tinyint", nullable: false),
                    HitCount = table.Column<int>(type: "int", nullable: false, defaultValue: 1)
                        .Annotation("Relational:DefaultConstraintName", "DF_QuestionInbox_HitCount"),
                    FirstSeenAt = table.Column<DateTime>(type: "datetime2(0)", nullable: false),
                    LastSeenAt = table.Column<DateTime>(type: "datetime2(0)", nullable: false),
                    Status = table.Column<byte>(type: "tinyint", nullable: false, defaultValue: (byte)1)
                        .Annotation("Relational:DefaultConstraintName", "DF_QuestionInbox_Status"),
                    LinkedFaqContentItemId = table.Column<int>(type: "int", nullable: true),
                    HandledByUserId = table.Column<int>(type: "int", nullable: true),
                    HandledAt = table.Column<DateTime>(type: "datetime2(0)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QuestionInbox", x => x.Id);
                    table.CheckConstraint("CK_QuestionInbox_Source", "[Source] BETWEEN 1 AND 4");
                    table.CheckConstraint("CK_QuestionInbox_Status", "[Status] BETWEEN 1 AND 3");
                    table.ForeignKey(
                        name: "FK_QuestionInbox_ContentItems",
                        column: x => x.LinkedFaqContentItemId,
                        principalTable: "ContentItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_QuestionInbox_Users",
                        column: x => x.HandledByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "RefreshTokens",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UserId = table.Column<int>(type: "int", nullable: false),
                    TokenHash = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "datetime2(0)", nullable: false),
                    RevokedAt = table.Column<DateTime>(type: "datetime2(0)", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2(0)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RefreshTokens", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RefreshTokens_Users",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SiteSettings",
                columns: table => new
                {
                    SettingKey = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    SettingValue = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ValueType = table.Column<byte>(type: "tinyint", nullable: false),
                    UpdatedByUserId = table.Column<int>(type: "int", nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2(0)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SiteSettings", x => x.SettingKey);
                    table.CheckConstraint("CK_SiteSettings_ValueType", "[ValueType] BETWEEN 1 AND 5");
                    table.ForeignKey(
                        name: "FK_SiteSettings_Users",
                        column: x => x.UpdatedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "UserRoles",
                columns: table => new
                {
                    UserId = table.Column<int>(type: "int", nullable: false),
                    RoleId = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserRoles", x => new { x.UserId, x.RoleId });
                    table.ForeignKey(
                        name: "FK_UserRoles_Roles",
                        column: x => x.RoleId,
                        principalTable: "Roles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_UserRoles_Users",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "MediaUsages",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    MediaId = table.Column<int>(type: "int", nullable: false),
                    ContentItemId = table.Column<int>(type: "int", nullable: false),
                    UsageKind = table.Column<byte>(type: "tinyint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MediaUsages", x => x.Id);
                    table.CheckConstraint("CK_MediaUsages_UsageKind", "[UsageKind] BETWEEN 1 AND 4");
                    table.ForeignKey(
                        name: "FK_MediaUsages_ContentItems",
                        column: x => x.ContentItemId,
                        principalTable: "ContentItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_MediaUsages_MediaAssets",
                        column: x => x.MediaId,
                        principalTable: "MediaAssets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Pages",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false),
                    PageKind = table.Column<byte>(type: "tinyint", nullable: false),
                    SystemKey = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: true),
                    Lead = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    BodyBlocks = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CoverMediaId = table.Column<int>(type: "int", nullable: true),
                    ListSortRule = table.Column<byte>(type: "tinyint", nullable: true),
                    PageSize = table.Column<int>(type: "int", nullable: true),
                    SuperAdminOnly = table.Column<bool>(type: "bit", nullable: false, defaultValue: false)
                        .Annotation("Relational:DefaultConstraintName", "DF_Pages_SuperAdminOnly")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Pages", x => x.Id);
                    table.CheckConstraint("CK_Pages_PageKind", "[PageKind] BETWEEN 1 AND 2");
                    table.ForeignKey(
                        name: "FK_Pages_ContentItems_Id",
                        column: x => x.Id,
                        principalTable: "ContentItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Pages_MediaAssets_Cover",
                        column: x => x.CoverMediaId,
                        principalTable: "MediaAssets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SeoMeta",
                columns: table => new
                {
                    ContentItemId = table.Column<int>(type: "int", nullable: false),
                    SeoTitle = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    MetaDescription = table.Column<string>(type: "nvarchar(400)", maxLength: 400, nullable: true),
                    OgImageMediaId = table.Column<int>(type: "int", nullable: true),
                    CanonicalOverride = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    NoIndex = table.Column<bool>(type: "bit", nullable: false, defaultValue: false)
                        .Annotation("Relational:DefaultConstraintName", "DF_SeoMeta_NoIndex"),
                    StructuredDataOverride = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    AiSummary = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    UpdatedByUserId = table.Column<int>(type: "int", nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2(0)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SeoMeta", x => x.ContentItemId);
                    table.CheckConstraint("CK_SeoMeta_AiSummaryLength", "[AiSummary] IS NULL OR LEN([AiSummary]) BETWEEN 20 AND 300");
                    table.ForeignKey(
                        name: "FK_SeoMeta_ContentItems",
                        column: x => x.ContentItemId,
                        principalTable: "ContentItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SeoMeta_MediaAssets",
                        column: x => x.OgImageMediaId,
                        principalTable: "MediaAssets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SeoMeta_Users",
                        column: x => x.UpdatedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Terms",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false),
                    TermType = table.Column<byte>(type: "tinyint", nullable: false),
                    Intro = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CoverMediaId = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Terms", x => x.Id);
                    table.CheckConstraint("CK_Terms_TermType", "[TermType] BETWEEN 1 AND 4");
                    table.ForeignKey(
                        name: "FK_Terms_ContentItems_Id",
                        column: x => x.Id,
                        principalTable: "ContentItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Terms_MediaAssets_Cover",
                        column: x => x.CoverMediaId,
                        principalTable: "MediaAssets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Faqs",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false),
                    CategoryTermId = table.Column<int>(type: "int", nullable: false),
                    WebAnswer = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    AiAnswer = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    LastReviewedOn = table.Column<DateOnly>(type: "date", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Faqs", x => x.Id);
                    table.CheckConstraint("CK_Faqs_AiAnswer_NotEmpty", "LEN([AiAnswer]) > 0");
                    table.CheckConstraint("CK_Faqs_WebAnswer_NotEmpty", "LEN([WebAnswer]) > 0");
                    table.ForeignKey(
                        name: "FK_Faqs_ContentItems_Id",
                        column: x => x.Id,
                        principalTable: "ContentItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Faqs_Terms_Category",
                        column: x => x.CategoryTermId,
                        principalTable: "Terms",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Treatments",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false),
                    CategoryTermId = table.Column<int>(type: "int", nullable: false),
                    NameEn = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    Subtitle = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    Indications = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Mechanism = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    DurationText = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    SessionsText = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    Aftercare = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Contraindications = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    DeviceInfo = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CoverMediaId = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Treatments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Treatments_ContentItems_Id",
                        column: x => x.Id,
                        principalTable: "ContentItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Treatments_MediaAssets_Cover",
                        column: x => x.CoverMediaId,
                        principalTable: "MediaAssets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Treatments_Terms_Category",
                        column: x => x.CategoryTermId,
                        principalTable: "Terms",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TreatmentImages",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TreatmentId = table.Column<int>(type: "int", nullable: false),
                    MediaId = table.Column<int>(type: "int", nullable: false),
                    Caption = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    SortOrder = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TreatmentImages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TreatmentImages_MediaAssets",
                        column: x => x.MediaId,
                        principalTable: "MediaAssets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TreatmentImages_Treatments",
                        column: x => x.TreatmentId,
                        principalTable: "Treatments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.InsertData(
                table: "ContentItems",
                columns: new[] { "Id", "ContentType", "CreatedAt", "CreatedByUserId", "IncludeInSitemap", "IsSystemLocked", "OwnerUserId", "PublishAt", "PublishedVersionId", "Slug", "SortOrder", "Status", "Title", "UnpublishAt", "UpdatedAt", "UpdatedByUserId", "UrlPath" },
                values: new object[,]
                {
                    { 1001, (byte)9, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, true, true, null, null, null, "laser", 1, (byte)3, "光療美顏", null, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, "/treatments/laser/" },
                    { 1002, (byte)9, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, true, true, null, null, null, "photoelectric", 2, (byte)3, "光電美容", null, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, "/treatments/photoelectric/" },
                    { 1003, (byte)9, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, true, true, null, null, null, "microneedle", 3, (byte)3, "微針美容", null, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, "/treatments/microneedle/" },
                    { 1004, (byte)9, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, true, true, null, null, null, "skincare", 4, (byte)3, "醫美保養", null, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, "/treatments/skincare/" },
                    { 1005, (byte)9, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, true, true, null, null, null, "medical-aesthetics", 1, (byte)3, "醫美新知", null, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, "/blog/medical-aesthetics/" },
                    { 1006, (byte)9, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, true, true, null, null, null, "dermatology", 2, (byte)3, "皮膚新知", null, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, "/blog/dermatology/" },
                    { 1007, (byte)9, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, true, true, null, null, null, "media", 3, (byte)3, "媒體報導", null, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, "/blog/media/" },
                    { 1008, (byte)9, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, true, true, null, null, null, "lectures", 4, (byte)3, "演講授課", null, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, "/blog/lectures/" },
                    { 1009, (byte)9, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, true, true, null, null, null, "treatment", 1, (byte)3, "療程相關", null, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, "/faq/treatment/" },
                    { 1010, (byte)9, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, true, true, null, null, null, "aftercare", 2, (byte)3, "術後照護", null, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, "/faq/aftercare/" },
                    { 1011, (byte)9, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, true, true, null, null, null, "visit", 3, (byte)3, "看診與預約", null, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, "/faq/visit/" },
                    { 1012, (byte)9, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, true, true, null, null, null, "fee", 4, (byte)3, "費用與付款", null, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, "/faq/fee/" },
                    { 1013, (byte)9, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, true, true, null, null, null, "clinic", 5, (byte)3, "院所資訊", null, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, "/faq/clinic/" },
                    { 1101, (byte)8, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, true, true, null, null, null, "home", 1, (byte)3, "首頁", null, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, "/" },
                    { 1102, (byte)8, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, true, true, null, null, null, "team", 2, (byte)3, "醫療團隊", null, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, "/team/" },
                    { 1103, (byte)8, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, true, true, null, null, null, "treatments", 3, (byte)3, "專業服務", null, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, "/treatments/" },
                    { 1104, (byte)8, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, true, true, null, null, null, "concerns", 4, (byte)3, "肌膚困擾", null, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, "/concerns/" },
                    { 1105, (byte)8, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, true, true, null, null, null, "blog", 5, (byte)3, "臻美分享", null, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, "/blog/" },
                    { 1106, (byte)8, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, true, true, null, null, null, "cases", 6, (byte)3, "案例分享", null, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, "/cases/" },
                    { 1107, (byte)8, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, true, true, null, null, null, "faq", 7, (byte)3, "常見問題", null, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, "/faq/" },
                    { 1108, (byte)8, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, true, true, null, null, null, "clinics", 8, (byte)3, "診所據點", null, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, "/clinics/" },
                    { 1109, (byte)8, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, true, true, null, null, null, "contact", 9, (byte)3, "聯絡我們", null, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, "/contact/" },
                    { 1110, (byte)8, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, false, true, null, null, null, "search", 10, (byte)3, "網站搜尋", null, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, "/search/" },
                    { 1111, (byte)8, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, false, true, null, null, null, "404", 11, (byte)3, "找不到頁面", null, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, "/404" }
                });

            migrationBuilder.InsertData(
                table: "ContentItems",
                columns: new[] { "Id", "ContentType", "CreatedAt", "CreatedByUserId", "IncludeInSitemap", "OwnerUserId", "PublishAt", "PublishedVersionId", "Slug", "SortOrder", "Status", "Title", "UnpublishAt", "UpdatedAt", "UpdatedByUserId", "UrlPath" },
                values: new object[,]
                {
                    { 1112, (byte)8, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, true, null, null, null, "about", 1, (byte)3, "品牌理念", null, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, "/about/" },
                    { 1113, (byte)8, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, true, null, null, null, "new-chinese-aesthetics", 2, (byte)3, "新中式美學", null, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, "/about/new-chinese-aesthetics/" },
                    { 1114, (byte)8, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, true, null, null, null, "makeup-style", 3, (byte)3, "彩妝式輕醫美", null, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, "/about/makeup-style/" },
                    { 1115, (byte)8, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, true, null, null, null, "privacy", 4, (byte)3, "隱私權政策", null, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, "/privacy/" },
                    { 1116, (byte)8, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, true, null, null, null, "terms", 5, (byte)3, "服務條款", null, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, "/terms/" },
                    { 1117, (byte)8, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, true, null, null, null, "medical-disclaimer", 6, (byte)3, "醫療免責聲明", null, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, "/medical-disclaimer/" }
                });

            migrationBuilder.InsertData(
                table: "HomeSections",
                columns: new[] { "Id", "IsEnabled", "SectionKey", "Settings", "SortOrder", "Subtitle", "Title" },
                values: new object[,]
                {
                    { 1, true, "hero", null, 1, null, "主視覺" },
                    { 2, true, "specialties", null, 2, null, "八大專科入口" },
                    { 3, true, "featured-treatments", null, 3, null, "精選療程" },
                    { 4, true, "latest-articles", null, 4, null, "最新文章" },
                    { 5, true, "doctors", null, 5, null, "醫師團隊" },
                    { 6, true, "clinics", null, 6, null, "據點資訊" },
                    { 7, true, "brand-story", null, 7, null, "品牌理念摘要" }
                });

            migrationBuilder.InsertData(
                table: "MenuItems",
                columns: new[] { "Id", "ContentItemId", "Depth", "Label", "LinkKind", "MenuKey", "ParentId", "RelAttr", "SortOrder", "Url" },
                values: new object[,]
                {
                    { 1, null, (byte)1, "品牌理念", (byte)2, "main", null, null, 1, "/about/" },
                    { 2, null, (byte)1, "肌膚困擾", (byte)2, "main", null, null, 2, "/concerns/" },
                    { 3, null, (byte)1, "專業服務", (byte)2, "main", null, null, 3, "/treatments/" },
                    { 4, null, (byte)1, "醫師團隊", (byte)2, "main", null, null, 4, "/team/" },
                    { 5, null, (byte)1, "臻美分享", (byte)2, "main", null, null, 5, "/blog/" },
                    { 6, null, (byte)1, "案例分享", (byte)2, "main", null, null, 6, "/cases/" },
                    { 7, null, (byte)1, "常見問題", (byte)2, "main", null, null, 7, "/faq/" },
                    { 8, null, (byte)1, "診所據點", (byte)2, "main", null, null, 8, "/clinics/" }
                });

            migrationBuilder.InsertData(
                table: "MenuItems",
                columns: new[] { "Id", "ContentItemId", "Depth", "IsExternal", "Label", "LinkKind", "MenuKey", "OpenInNewTab", "ParentId", "RelAttr", "SortOrder", "Url" },
                values: new object[,]
                {
                    { 9, null, (byte)1, true, "線上預約", (byte)3, "main", true, null, "noopener external", 9, "https://booking.20skin.tw/MainMs/Login" },
                    { 10, null, (byte)1, true, "線上購物", (byte)3, "main", true, null, "noopener external", 10, "https://www.20skinshop.com/" }
                });

            migrationBuilder.InsertData(
                table: "MenuItems",
                columns: new[] { "Id", "ContentItemId", "Depth", "Label", "LinkKind", "MenuKey", "ParentId", "RelAttr", "SortOrder", "Url" },
                values: new object[,]
                {
                    { 11, null, (byte)1, "隱私權政策", (byte)2, "footer", null, null, 1, "/privacy/" },
                    { 12, null, (byte)1, "服務條款", (byte)2, "footer", null, null, 2, "/terms/" },
                    { 13, null, (byte)1, "醫療免責聲明", (byte)2, "footer", null, null, 3, "/medical-disclaimer/" }
                });

            migrationBuilder.InsertData(
                table: "Permissions",
                columns: new[] { "Id", "Code", "GroupName", "Name" },
                values: new object[,]
                {
                    { 1, "content.treatment.edit", "內容", "編輯療程" },
                    { 2, "content.treatment.publish", "內容", "發布療程" },
                    { 3, "content.doctor.edit", "內容", "編輯醫師" },
                    { 4, "content.doctor.publish", "內容", "發布醫師" },
                    { 5, "content.concern.edit", "內容", "編輯肌膚困擾" },
                    { 6, "content.concern.publish", "內容", "發布肌膚困擾" },
                    { 7, "content.article.edit", "內容", "編輯文章" },
                    { 8, "content.article.publish", "內容", "發布文章" },
                    { 9, "content.case.edit", "內容", "編輯案例" },
                    { 10, "content.case.publish", "內容", "發布案例" },
                    { 11, "content.faq.edit", "內容", "編輯FAQ" },
                    { 12, "content.faq.publish", "內容", "發布FAQ" },
                    { 13, "content.clinic.edit", "內容", "編輯據點" },
                    { 14, "content.clinic.publish", "內容", "發布據點" },
                    { 15, "content.page.edit", "內容", "編輯頁面" },
                    { 16, "content.page.publish", "內容", "發布頁面" },
                    { 17, "content.term.edit", "內容", "編輯分類與標籤" },
                    { 18, "content.term.publish", "內容", "發布分類與標籤" },
                    { 19, "content.submit", "內容", "送審" },
                    { 20, "review.approve", "工作流", "審核核准" },
                    { 21, "review.reject", "工作流", "審核退回" },
                    { 22, "seo.edit", "SEO", "編輯 SEO 欄位" },
                    { 23, "taxonomy.tag.create", "分類與標籤", "新增標籤" },
                    { 24, "taxonomy.category.manage", "分類與標籤", "新增／刪除分類" },
                    { 25, "page.legal.edit", "頁面", "編輯法務頁" },
                    { 26, "home.arrange", "站台編排", "首頁版位編排" },
                    { 27, "menu.edit", "站台編排", "導覽選單與頁尾" },
                    { 28, "settings.edit", "站台編排", "全站設定" },
                    { 29, "account.manage", "系統", "帳號與角色管理" },
                    { 30, "redirect.manage", "SEO", "301 轉址管理" },
                    { 31, "media.manage", "資產", "媒體庫" }
                });

            migrationBuilder.InsertData(
                table: "RiskTerms",
                columns: new[] { "Id", "Category", "IsActive", "Note", "Term" },
                values: new object[,]
                {
                    { 1, (byte)1, true, null, "保證" },
                    { 2, (byte)1, true, null, "完全根治" },
                    { 3, (byte)1, true, null, "根治" },
                    { 4, (byte)1, true, null, "零風險" },
                    { 5, (byte)1, true, null, "永久有效" },
                    { 6, (byte)1, true, null, "永久" },
                    { 7, (byte)1, true, null, "百分之百" },
                    { 8, (byte)1, true, null, "無副作用" },
                    { 9, (byte)2, true, null, "最好" },
                    { 10, (byte)2, true, null, "最佳" },
                    { 11, (byte)2, true, null, "第一" },
                    { 12, (byte)2, true, null, "唯一" },
                    { 13, (byte)2, true, null, "最強" },
                    { 14, (byte)2, true, null, "最有效" },
                    { 15, (byte)3, true, null, "折扣" },
                    { 16, (byte)3, true, null, "贈品" },
                    { 17, (byte)3, true, null, "限時優惠" },
                    { 18, (byte)3, true, null, "免費" },
                    { 19, (byte)3, true, null, "買一送一" },
                    { 20, (byte)3, true, null, "分期付款" },
                    { 21, (byte)3, true, null, "特價" },
                    { 22, (byte)4, true, null, "見證" },
                    { 23, (byte)4, true, null, "推薦" },
                    { 24, (byte)4, true, null, "親身體驗" },
                    { 25, (byte)4, true, null, "使用心得" }
                });

            migrationBuilder.InsertData(
                table: "Roles",
                columns: new[] { "Id", "Code", "IsSystem", "Name" },
                values: new object[,]
                {
                    { 1, "SuperAdmin", true, "超級管理員" },
                    { 2, "Editor", true, "內容編輯" },
                    { 3, "Doctor", true, "醫師" },
                    { 4, "Marketing", true, "行銷" },
                    { 5, "Reviewer", true, "審核者" }
                });

            migrationBuilder.InsertData(
                table: "SiteSettings",
                columns: new[] { "SettingKey", "SettingValue", "UpdatedAt", "UpdatedByUserId", "ValueType" },
                values: new object[,]
                {
                    { "aifaq.enabled", "false", new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, (byte)3 },
                    { "aifaq.handoffBookingUrl", "https://booking.20skin.tw/MainMs/Login", new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, (byte)5 },
                    { "aifaq.handoffLineUrl", "", new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, (byte)5 },
                    { "aifaq.panelTitle", "AI 線上諮詢", new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, (byte)1 },
                    { "aifaq.welcomeText", "你好，我是 20SKIN 的線上諮詢助理。可以用自己的話問我療程、術後照護或看診流程的問題。", new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, (byte)1 },
                    { "contact.recipientEmail", "", new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, (byte)1 },
                    { "footer.copyright", "© 2026 20SKIN 美醫集團．All Rights Reserved.", new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, (byte)1 },
                    { "footer.social.json", "[]", new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, (byte)4 },
                    { "nap.json", "[]", new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, (byte)4 },
                    { "seo.robotsTxt", "User-agent: *\nAllow: /\nDisallow: /search/\n\nSitemap: https://20skin.tw/sitemap.xml", new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, (byte)1 },
                    { "site.defaultOgMediaId", "", new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, (byte)1 },
                    { "site.description", "20SKIN 美醫集團——四季診所與二林四季皮膚科，以新中式美學為理念的皮膚科專科醫療團隊。", new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, (byte)1 },
                    { "site.logoMediaId", "", new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, (byte)1 },
                    { "site.name", "20SKIN 美醫集團", new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, (byte)1 },
                    { "tracking.ga4", "", new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), null, (byte)1 }
                });

            migrationBuilder.InsertData(
                table: "Users",
                columns: new[] { "Id", "CreatedAt", "DisplayName", "DoctorId", "IsActive", "MustChangePassword", "NotifyEmail", "PasswordHash", "SecurityStamp", "UpdatedAt", "UserName" },
                values: new object[] { 1, new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), "系統管理員", null, true, true, null, "AQAAAAIAAzRQAAAAEHsfPJpF4o1gFKfPO5Ll2ECTJyv23mD5x4HV5WHpc2hQmBT5ViWSVxHETqeXoTArUA==", "SEED0000-0000-4000-8000-000000000001", new DateTime(2026, 9, 11, 0, 0, 0, 0, DateTimeKind.Utc), "sa@system.local" });

            migrationBuilder.InsertData(
                table: "Pages",
                columns: new[] { "Id", "BodyBlocks", "CoverMediaId", "Lead", "ListSortRule", "PageKind", "PageSize", "SystemKey" },
                values: new object[,]
                {
                    { 1101, null, null, null, null, (byte)2, null, "home" },
                    { 1102, null, null, null, null, (byte)2, null, "team-index" },
                    { 1103, null, null, null, null, (byte)2, null, "treatments-index" },
                    { 1104, null, null, null, null, (byte)2, null, "concerns-index" },
                    { 1105, null, null, null, null, (byte)2, null, "blog-index" },
                    { 1106, null, null, null, null, (byte)2, null, "cases-index" },
                    { 1107, null, null, null, null, (byte)2, null, "faq-index" },
                    { 1108, null, null, null, null, (byte)2, null, "clinics-index" },
                    { 1109, null, null, null, null, (byte)2, null, "contact" },
                    { 1110, null, null, null, null, (byte)2, null, "search" },
                    { 1111, null, null, null, null, (byte)2, null, "not-found" },
                    { 1112, null, null, null, null, (byte)1, null, null },
                    { 1113, null, null, null, null, (byte)1, null, null },
                    { 1114, null, null, null, null, (byte)1, null, null }
                });

            migrationBuilder.InsertData(
                table: "Pages",
                columns: new[] { "Id", "BodyBlocks", "CoverMediaId", "Lead", "ListSortRule", "PageKind", "PageSize", "SuperAdminOnly", "SystemKey" },
                values: new object[,]
                {
                    { 1115, null, null, null, null, (byte)1, null, true, null },
                    { 1116, null, null, null, null, (byte)1, null, true, null },
                    { 1117, null, null, null, null, (byte)1, null, true, null }
                });

            migrationBuilder.InsertData(
                table: "RolePermissions",
                columns: new[] { "PermissionId", "RoleId" },
                values: new object[,]
                {
                    { 1, 1 },
                    { 2, 1 },
                    { 3, 1 },
                    { 4, 1 },
                    { 5, 1 },
                    { 6, 1 },
                    { 7, 1 },
                    { 8, 1 },
                    { 9, 1 },
                    { 10, 1 },
                    { 11, 1 },
                    { 12, 1 },
                    { 13, 1 },
                    { 14, 1 },
                    { 15, 1 },
                    { 16, 1 },
                    { 17, 1 },
                    { 18, 1 },
                    { 19, 1 },
                    { 20, 1 },
                    { 21, 1 },
                    { 22, 1 },
                    { 23, 1 },
                    { 24, 1 },
                    { 25, 1 },
                    { 26, 1 },
                    { 27, 1 },
                    { 28, 1 },
                    { 29, 1 },
                    { 30, 1 },
                    { 31, 1 },
                    { 1, 2 },
                    { 3, 2 },
                    { 5, 2 },
                    { 7, 2 },
                    { 9, 2 },
                    { 11, 2 },
                    { 13, 2 },
                    { 15, 2 },
                    { 17, 2 },
                    { 19, 2 },
                    { 22, 2 },
                    { 23, 2 },
                    { 26, 2 },
                    { 31, 2 },
                    { 3, 3 },
                    { 7, 3 },
                    { 19, 3 },
                    { 20, 3 },
                    { 21, 3 },
                    { 31, 3 },
                    { 11, 4 },
                    { 22, 4 },
                    { 31, 4 },
                    { 2, 5 },
                    { 4, 5 },
                    { 6, 5 },
                    { 8, 5 },
                    { 10, 5 },
                    { 12, 5 },
                    { 14, 5 },
                    { 16, 5 },
                    { 18, 5 },
                    { 20, 5 },
                    { 21, 5 }
                });

            migrationBuilder.InsertData(
                table: "Terms",
                columns: new[] { "Id", "CoverMediaId", "Intro", "TermType" },
                values: new object[,]
                {
                    { 1001, null, null, (byte)1 },
                    { 1002, null, null, (byte)1 },
                    { 1003, null, null, (byte)1 },
                    { 1004, null, null, (byte)1 },
                    { 1005, null, null, (byte)2 },
                    { 1006, null, null, (byte)2 },
                    { 1007, null, null, (byte)2 },
                    { 1008, null, null, (byte)2 },
                    { 1009, null, null, (byte)3 },
                    { 1010, null, null, (byte)3 },
                    { 1011, null, null, (byte)3 },
                    { 1012, null, null, (byte)3 },
                    { 1013, null, null, (byte)3 }
                });

            migrationBuilder.InsertData(
                table: "UserRoles",
                columns: new[] { "RoleId", "UserId" },
                values: new object[] { 1, 1 });

            migrationBuilder.CreateIndex(
                name: "IX_Articles_AuthorDoctorId",
                table: "Articles",
                column: "AuthorDoctorId",
                filter: "[AuthorDoctorId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Articles_Category_DisplayDate",
                table: "Articles",
                columns: new[] { "CategoryTermId", "DisplayDate" });

            migrationBuilder.CreateIndex(
                name: "IX_Articles_SourceSite",
                table: "Articles",
                column: "SourceSite");

            migrationBuilder.CreateIndex(
                name: "IX_CaseImages_Case_Phase_Sort",
                table: "CaseImages",
                columns: new[] { "CaseId", "Phase", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_Cases_TreatmentId",
                table: "Cases",
                column: "TreatmentId");

            migrationBuilder.CreateIndex(
                name: "IX_ClinicBusinessHours_Clinic_Day_Sort",
                table: "ClinicBusinessHours",
                columns: new[] { "ClinicId", "DayOfWeek", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_ClinicPhotos_Clinic_Sort",
                table: "ClinicPhotos",
                columns: new[] { "ClinicId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_ContentItems_PublishAt",
                table: "ContentItems",
                column: "PublishAt",
                filter: "[PublishAt] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_ContentItems_Type_Status_Sort",
                table: "ContentItems",
                columns: new[] { "ContentType", "Status", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_ContentItems_UnpublishAt",
                table: "ContentItems",
                column: "UnpublishAt",
                filter: "[UnpublishAt] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "UQ_ContentItems_UrlPath",
                table: "ContentItems",
                column: "UrlPath",
                unique: true,
                filter: "[UrlPath] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_ContentRelations_To_Type",
                table: "ContentRelations",
                columns: new[] { "ToContentItemId", "RelationType" });

            migrationBuilder.CreateIndex(
                name: "UQ_ContentRelations_From_Type_To",
                table: "ContentRelations",
                columns: new[] { "FromContentItemId", "RelationType", "ToContentItemId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ContentReviews_Status_SubmittedAt",
                table: "ContentReviews",
                columns: new[] { "Status", "SubmittedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ContentReviews_SubmittedBy_Status",
                table: "ContentReviews",
                columns: new[] { "SubmittedByUserId", "Status" });

            migrationBuilder.CreateIndex(
                name: "UQ_ContentVersions_Item_VersionNo",
                table: "ContentVersions",
                columns: new[] { "ContentItemId", "VersionNo" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_DoctorCredentials_Doctor_Type_Sort",
                table: "DoctorCredentials",
                columns: new[] { "DoctorId", "Type", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_Doctors_IsPhysician",
                table: "Doctors",
                column: "IsPhysician");

            migrationBuilder.CreateIndex(
                name: "IX_DoctorSchedules_Clinic_Day",
                table: "DoctorSchedules",
                columns: new[] { "ClinicId", "DayOfWeek" });

            migrationBuilder.CreateIndex(
                name: "IX_DoctorSchedules_Doctor_Day",
                table: "DoctorSchedules",
                columns: new[] { "DoctorId", "DayOfWeek" });

            migrationBuilder.CreateIndex(
                name: "IX_DoctorTags_Doctor_Sort",
                table: "DoctorTags",
                columns: new[] { "DoctorId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_Faqs_CategoryTermId",
                table: "Faqs",
                column: "CategoryTermId");

            migrationBuilder.CreateIndex(
                name: "IX_HomeSectionItems_Section_Sort",
                table: "HomeSectionItems",
                columns: new[] { "HomeSectionId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "UQ_HomeSectionItems_Section_Content",
                table: "HomeSectionItems",
                columns: new[] { "HomeSectionId", "ContentItemId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "UQ_HomeSections_SectionKey",
                table: "HomeSections",
                column: "SectionKey",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "UQ_LoginThrottles_Dimension_Key",
                table: "LoginThrottles",
                columns: new[] { "Dimension", "ThrottleKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "UQ_MediaAssets_ContentHash",
                table: "MediaAssets",
                column: "ContentHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "UQ_MediaUsages_Media_Content_Kind",
                table: "MediaUsages",
                columns: new[] { "MediaId", "ContentItemId", "UsageKind" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MenuItems_MenuKey_Parent_Sort",
                table: "MenuItems",
                columns: new[] { "MenuKey", "ParentId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "UQ_Pages_SystemKey",
                table: "Pages",
                column: "SystemKey",
                unique: true,
                filter: "[SystemKey] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "UQ_Permissions_Code",
                table: "Permissions",
                column: "Code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_QuestionInbox_Status_HitCount",
                table: "QuestionInbox",
                columns: new[] { "Status", "HitCount" });

            migrationBuilder.CreateIndex(
                name: "UQ_QuestionInbox_NormalizedText",
                table: "QuestionInbox",
                column: "NormalizedText",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "UQ_Redirects_FromPath",
                table: "Redirects",
                column: "FromPath",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RefreshTokens_UserId",
                table: "RefreshTokens",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "UQ_RefreshTokens_TokenHash",
                table: "RefreshTokens",
                column: "TokenHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "UQ_RiskTerms_Term",
                table: "RiskTerms",
                column: "Term",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "UQ_Roles_Code",
                table: "Roles",
                column: "Code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Terms_TermType",
                table: "Terms",
                column: "TermType");

            migrationBuilder.CreateIndex(
                name: "IX_TreatmentImages_Treatment_Sort",
                table: "TreatmentImages",
                columns: new[] { "TreatmentId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_Treatments_CategoryTermId",
                table: "Treatments",
                column: "CategoryTermId");

            migrationBuilder.CreateIndex(
                name: "IX_Users_DoctorId",
                table: "Users",
                column: "DoctorId",
                filter: "[DoctorId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "UQ_Users_UserName",
                table: "Users",
                column: "UserName",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_Articles_ContentItems_Id",
                table: "Articles",
                column: "Id",
                principalTable: "ContentItems",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_Articles_Doctors_Author",
                table: "Articles",
                column: "AuthorDoctorId",
                principalTable: "Doctors",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Articles_Doctors_Reviewer",
                table: "Articles",
                column: "ReviewerDoctorId",
                principalTable: "Doctors",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Articles_MediaAssets_Cover",
                table: "Articles",
                column: "CoverMediaId",
                principalTable: "MediaAssets",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Articles_Terms_Category",
                table: "Articles",
                column: "CategoryTermId",
                principalTable: "Terms",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_CaseImages_Cases",
                table: "CaseImages",
                column: "CaseId",
                principalTable: "Cases",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_CaseImages_MediaAssets",
                table: "CaseImages",
                column: "MediaId",
                principalTable: "MediaAssets",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Cases_ContentItems_Id",
                table: "Cases",
                column: "Id",
                principalTable: "ContentItems",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_Cases_Treatments",
                table: "Cases",
                column: "TreatmentId",
                principalTable: "Treatments",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_ClinicBusinessHours_Clinics",
                table: "ClinicBusinessHours",
                column: "ClinicId",
                principalTable: "Clinics",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_ClinicPhotos_Clinics",
                table: "ClinicPhotos",
                column: "ClinicId",
                principalTable: "Clinics",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_ClinicPhotos_MediaAssets",
                table: "ClinicPhotos",
                column: "MediaId",
                principalTable: "MediaAssets",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Clinics_ContentItems_Id",
                table: "Clinics",
                column: "Id",
                principalTable: "ContentItems",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_Concerns_ContentItems_Id",
                table: "Concerns",
                column: "Id",
                principalTable: "ContentItems",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_Concerns_MediaAssets_Cover",
                table: "Concerns",
                column: "CoverMediaId",
                principalTable: "MediaAssets",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_ContentItems_ContentVersions_Published",
                table: "ContentItems",
                column: "PublishedVersionId",
                principalTable: "ContentVersions",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_ContentItems_Users_CreatedBy",
                table: "ContentItems",
                column: "CreatedByUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_ContentItems_Users_Owner",
                table: "ContentItems",
                column: "OwnerUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_ContentItems_Users_UpdatedBy",
                table: "ContentItems",
                column: "UpdatedByUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_ContentReviews_ContentVersions",
                table: "ContentReviews",
                column: "VersionId",
                principalTable: "ContentVersions",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_ContentReviews_Users_DecidedBy",
                table: "ContentReviews",
                column: "DecidedByUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_ContentReviews_Users_SubmittedBy",
                table: "ContentReviews",
                column: "SubmittedByUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_ContentVersions_Users",
                table: "ContentVersions",
                column: "CreatedByUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_DoctorCredentials_Doctors",
                table: "DoctorCredentials",
                column: "DoctorId",
                principalTable: "Doctors",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_Doctors_MediaAssets_Photo",
                table: "Doctors",
                column: "PhotoMediaId",
                principalTable: "MediaAssets",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ContentVersions_ContentItems",
                table: "ContentVersions");

            migrationBuilder.DropForeignKey(
                name: "FK_Doctors_ContentItems_Id",
                table: "Doctors");

            migrationBuilder.DropForeignKey(
                name: "FK_Users_Doctors",
                table: "Users");

            migrationBuilder.DropTable(
                name: "Articles");

            migrationBuilder.DropTable(
                name: "CaseImages");

            migrationBuilder.DropTable(
                name: "ClinicBusinessHours");

            migrationBuilder.DropTable(
                name: "ClinicPhotos");

            migrationBuilder.DropTable(
                name: "Concerns");

            migrationBuilder.DropTable(
                name: "ContentRelations");

            migrationBuilder.DropTable(
                name: "ContentReviews");

            migrationBuilder.DropTable(
                name: "DoctorCredentials");

            migrationBuilder.DropTable(
                name: "DoctorSchedules");

            migrationBuilder.DropTable(
                name: "DoctorTags");

            migrationBuilder.DropTable(
                name: "Faqs");

            migrationBuilder.DropTable(
                name: "HomeSectionItems");

            migrationBuilder.DropTable(
                name: "LoginThrottles");

            migrationBuilder.DropTable(
                name: "MediaUsages");

            migrationBuilder.DropTable(
                name: "MenuItems");

            migrationBuilder.DropTable(
                name: "Pages");

            migrationBuilder.DropTable(
                name: "QuestionInbox");

            migrationBuilder.DropTable(
                name: "Redirects");

            migrationBuilder.DropTable(
                name: "RefreshTokens");

            migrationBuilder.DropTable(
                name: "RiskTerms");

            migrationBuilder.DropTable(
                name: "RolePermissions");

            migrationBuilder.DropTable(
                name: "SeoMeta");

            migrationBuilder.DropTable(
                name: "SiteSettings");

            migrationBuilder.DropTable(
                name: "TreatmentImages");

            migrationBuilder.DropTable(
                name: "UserRoles");

            migrationBuilder.DropTable(
                name: "Cases");

            migrationBuilder.DropTable(
                name: "Clinics");

            migrationBuilder.DropTable(
                name: "HomeSections");

            migrationBuilder.DropTable(
                name: "Permissions");

            migrationBuilder.DropTable(
                name: "Roles");

            migrationBuilder.DropTable(
                name: "Treatments");

            migrationBuilder.DropTable(
                name: "Terms");

            migrationBuilder.DropTable(
                name: "ContentItems");

            migrationBuilder.DropTable(
                name: "ContentVersions");

            migrationBuilder.DropTable(
                name: "Doctors");

            migrationBuilder.DropTable(
                name: "MediaAssets");

            migrationBuilder.DropTable(
                name: "Users");
        }
    }
}
