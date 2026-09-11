using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Skin20.Api.Common;
using Skin20.Api.Data;
using Skin20.Api.Models.Dtos;
using Skin20.Api.Models.Entities;
using Skin20.Api.Services;
using Skin20.Api.Services.Dapper;

namespace Skin20.Api.Handlers;

/// <summary>
/// 九個內容單元共用（docs/10 §3.3）。它們的 CRUD 形狀完全一樣，差別只在欄位。
/// ⚠️ 工作流四態，**「已排程」不是第五種狀態**（docs/11 §7）。
/// ⚠️ 醫師只能動 `OwnerUserId` 是自己的內容 —— 這是「授權集中在 Router」的唯一例外（§5.4）。
///
/// <para>
/// ⚠️ 分層鐵律（docs/11 §2）：Handler 內<b>禁止直接寫 SQL</b> —— 讀走 Dapper ReadService、
/// 寫走 <c>Skin20DbContext</c>；<b>禁止重複檢查權限碼</b> —— 授權集中在 <c>AppRouter</c>，
/// 唯一例外是資料列擁有者判定（§5.4）。
/// </para>
///
/// <para>
/// 🔴 <b>已回報的設計取捨（見任務結束後的回報，未在 docs 明文定案，這裡做了必要的選擇）：</b>
/// </para>
/// <list type="number">
/// <item>
/// <b>型別專屬欄位不做 18 個強型別 DTO</b，改用 <c>Dictionary&lt;string, object?&gt;</c>
/// （輸出）／<see cref="JsonElement"/>（輸入）承載，由本檔逐一手寫 <c>Build*Fields</c>／
/// <c>Apply*Fields</c> 對照——仍是顯式手寫映射，不是 AutoMapper 或反射。
/// </item>
/// <item>
/// <b>「編輯已發布內容 → 回草稿」</b：docs/11 §7 規則 2 的狀態圖明確畫出
/// <c>已發布 ──edit──▶ 草稿</c> 這條邊，本檔逐字照此實作：<see cref="UpdateAsync"/> 與
/// <see cref="UpdateRelationsAsync"/> 若目標原本是「已發布」，儲存後改回「草稿」，
/// <c>PublishedVersionId</c> 保持不動，前台在下一次重建前仍看得到舊版；下一次重建则会
/// 因為 <c>Status≠3</c> 而讓該頁暫時從產物中消失，直到重新送審核准。這與 docs/09 §3
/// 「建置期直接查 <c>ContentItems</c> 目前欄位值」的事實一致——schema 沒有第二份「已發布快照」
/// 可供建置查詢，這是目前 schema 下最安全的作法。
/// </item>
/// <item>
/// <b>三個逐單元例外的實作方式</b（docs/10 §3.3）：法務三頁與分類／標籤的差異權限，
/// Router 的靜態路由表無法表達（取決於資料列或請求內容），故 <c>PermissionCodes.PageLegalEdit</c>／
/// <c>CategoryManage</c>／<c>TagCreate</c> 三個既有種子權限碼在本檔以
/// <see cref="RequireLegalPageGuard"/>／<see cref="RequireTermManagePermission"/> 直接讀取
/// claims 判定——這已超出 docs/11 §5.4 字面上「唯一例外」（僅指擁有者判定）的範圍，
/// 但若不做，這三個權限碼將完全無路徑可達（SeedData 已把它們授予角色，卻無處使用）。
/// </item>
/// </list>
/// </summary>
public sealed class ContentHandler(
    Skin20DbContext db,
    ISqlConnectionFactory sqlFactory,
    IRebuildService rebuild,
    IMemoryCache cache,
    IBlobStorageService blobStorage,
    IConfiguration configuration,
    ILogger<ContentHandler> logger)
{
    private readonly ContentReadService _read = new(sqlFactory);
    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);
    private static readonly Regex SlugPattern = new("^[a-z0-9]+(-[a-z0-9]+)*$", RegexOptions.Compiled);

    private const string RiskTermCacheKey = "ContentHandler.RiskTerms";

    // ════════════════════════════════════════════════════════════════════
    // 1. 清單／單筆
    // ════════════════════════════════════════════════════════════════════

    public async Task<IActionResult> ListAsync(HttpRequest req, string unit)
    {
        var contentType = ToContentType(unit);
        var ct = req.HttpContext.RequestAborted;

        var page = Paging.Page(req.Query["page"]);
        var pageSize = Paging.PageSize(req.Query["pageSize"]);
        byte? status = byte.TryParse(req.Query["status"], out var s) ? s : null;
        int? categoryTermId = int.TryParse(req.Query["categoryId"], out var c) ? c : null;
        int? ownerUserId = int.TryParse(req.Query["ownerUserId"], out var o) ? o : null;
        string? keyword = req.Query["keyword"];
        if (string.IsNullOrWhiteSpace(keyword)) keyword = null;

        var (rows, total) = await _read.ListAsync(unit, contentType, page, pageSize, status, categoryTermId, keyword, ownerUserId, ct);

        var items = rows.Select(r => new ContentListItemDto(
            r.Id, unit, r.Title, r.Slug, r.UrlPath, r.Status, StatusName((ContentStatus)r.Status),
            EffectiveStatus((ContentStatus)r.Status, r.PublishAt, r.UnpublishAt),
            r.PublishAt, r.UnpublishAt, r.SortOrder, r.IncludeInSitemap, r.IsSystemLocked, r.OwnerUserId,
            r.CategoryTermId, r.CategoryTitle, r.UpdatedAt)).ToList();

        return new OkObjectResult(ApiResponse.Ok(Paging.Build(items, total, page, pageSize)));
    }

    public async Task<IActionResult> GetAsync(string unit, string id)
    {
        var contentId = ParseId(id);
        var entity = await LoadAsync(unit, contentId, tracking: false, CancellationToken.None)
            ?? throw AppException.NotFound("內容");

        var dto = await BuildDetailDtoAsync(unit, entity, CancellationToken.None);
        return new OkObjectResult(ApiResponse.Ok(dto));
    }

    private async Task<ContentDetailDto> BuildDetailDtoAsync(string unit, ContentItem entity, CancellationToken ct)
    {
        var fields = BuildFieldsDict(unit, entity);
        var seoDto = entity.Seo is null ? null : ToSeoDto(entity.Seo);
        var relations = await db.ContentRelations.AsNoTracking()
            .Where(r => r.FromContentItemId == entity.Id)
            .OrderBy(r => r.RelationType).ThenBy(r => r.SortOrder)
            .ToListAsync(ct);
        var relationDtos = await ToRelationDtosAsync(relations, ct);

        return new ContentDetailDto(
            entity.Id, unit, (byte)entity.ContentType, entity.Slug, entity.UrlPath, entity.Title, entity.Summary,
            (byte)entity.Status, StatusName(entity.Status), EffectiveStatus(entity.Status, entity.PublishAt, entity.UnpublishAt),
            entity.PublishAt, entity.UnpublishAt, entity.PublishedVersionId, entity.SortOrder,
            entity.IncludeInSitemap, entity.IsSystemLocked, entity.OwnerUserId,
            entity.CreatedByUserId, entity.UpdatedByUserId, entity.CreatedAt, entity.UpdatedAt,
            fields, seoDto, relationDtos);
    }

    // ════════════════════════════════════════════════════════════════════
    // 2. 建立／更新本文
    // ════════════════════════════════════════════════════════════════════

    public async Task<IActionResult> CreateAsync(HttpRequest req, string unit)
    {
        var contentType = ToContentType(unit);
        var ct = req.HttpContext.RequestAborted;
        var body = await ReadJsonBodyAsync(req, ct);

        var title = JStr(body, "title");
        if (string.IsNullOrWhiteSpace(title))
            throw AppException.BadRequest(ErrorCodes.ValidationRequired, "title 為必填欄位。");
        if (title.Length > 200)
            throw AppException.BadRequest(ErrorCodes.ValidationRange, "title 長度不可超過 200 字。");

        var summary = ReadSummary(body);

        var slug = NormalizeAndValidateSlug(JStr(body, "slug"), required: true);

        var userId = RequestContext.UserId(req);
        var isDoctorNonAdmin = !RequestContext.IsSuperAdmin(req) && RequestContext.Roles(req).Contains(RoleCodes.Doctor);

        int? ownerUserId = JInt(body, "ownerUserId");
        if (isDoctorNonAdmin) ownerUserId = userId; // 醫師建立的內容一律歸自己，不容許指派給別人

        TermType? termTypeForCreate = null;
        if (unit == UnitCodes.Term)
        {
            var raw = JInt(body, "termType") ?? throw AppException.BadRequest(ErrorCodes.ValidationRequired, "termType 為必填欄位。");
            termTypeForCreate = (TermType)raw;
            RequireTermManagePermission(req, termTypeForCreate.Value);
        }
        if (unit == UnitCodes.Page)
        {
            var pageKind = (PageKind)(JInt(body, "pageKind") ?? (int)PageKind.Free);
            if (pageKind == PageKind.System)
                throw AppException.BadRequest(ErrorCodes.ValidationFormat, "系統頁不可透過此端點新增，系統頁由建置種子資料建立。");
        }

        var now = Clock.UtcNow;
        ContentItem entity = unit switch
        {
            UnitCodes.Treatment => new Treatment(),
            UnitCodes.Doctor => new Doctor(),
            UnitCodes.Concern => new Concern(),
            UnitCodes.Article => new Article(),
            UnitCodes.Case => new Case(),
            UnitCodes.Faq => new Faq(),
            UnitCodes.Clinic => new Clinic(),
            UnitCodes.Page => new Page { PageKind = PageKind.Free, SuperAdminOnly = false },
            UnitCodes.Term => new Term { TermType = termTypeForCreate!.Value },
            _ => throw AppException.BadRequest(ErrorCodes.ValidationFormat, $"未知的內容單元：{unit}"),
        };

        entity.ContentType = contentType;
        entity.Title = title;
        entity.Summary = summary;
        entity.Slug = slug;
        entity.Status = ContentStatus.Draft;
        entity.SortOrder = JInt(body, "sortOrder") ?? 0;

        var isArticleTagTerm = entity is Term { TermType: TermType.ArticleTag };
        // ⚠️ 文章標籤預設 IncludeInSitemap=0 ＋ SeoMeta.NoIndex=1（docs/08 §C-9）：
        //    30–60 個標籤頁內容單薄，全開會稀釋約 800 篇文章的索引預算。
        entity.IncludeInSitemap = JBool(body, "includeInSitemap") ?? !isArticleTagTerm;
        entity.IsSystemLocked = false;
        entity.OwnerUserId = ownerUserId;
        entity.CreatedByUserId = userId;
        entity.UpdatedByUserId = userId;
        entity.CreatedAt = now;
        entity.UpdatedAt = now;

        ApplyFields(entity, unit, body, isCreate: true);

        entity.UrlPath = await ComputeUrlPathAsync(unit, entity, ct);

        var seo = new SeoMeta { UpdatedByUserId = userId, UpdatedAt = now, NoIndex = isArticleTagTerm };
        entity.Seo = seo;

        var strategy = db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);

            AddEntity(unit, entity);
            await db.SaveChangesAsync(ct);

            await SaveVersionAsync(unit, entity, userId, "建立", ct);
            await db.SaveChangesAsync(ct);

            await tx.CommitAsync(ct);
        });

        return await GetAsync(unit, entity.Id.ToString(CultureInfo.InvariantCulture));
    }

    public async Task<IActionResult> UpdateAsync(HttpRequest req, string unit, string id)
    {
        var contentId = ParseId(id);
        var ct = req.HttpContext.RequestAborted;

        var entity = await LoadAsync(unit, contentId, tracking: true, ct) ?? throw AppException.NotFound("內容");

        RequireOwnership(req, entity);
        RequireLegalPageGuard(req, entity);

        if (entity.Status == ContentStatus.InReview)
            throw AppException.Conflict(ErrorCodes.ConflictState, "送審中的內容本文已鎖定，請等待審核結果。");

        // 換圖與移除圖片要把舊檔從 Blob 刪掉，所以在動欄位之前先記下原本引用了哪些檔案（docs/11 §9）。
        var blobsBefore = CollectBlobPaths(entity);

        var body = await ReadJsonBodyAsync(req, ct);

        var title = JStr(body, "title");
        if (title is not null)
        {
            if (title.Length > 200) throw AppException.BadRequest(ErrorCodes.ValidationRange, "title 長度不可超過 200 字。");
            entity.Title = title;
        }

        if (body.TryGetProperty("summary", out _)) entity.Summary = ReadSummary(body);

        var oldUrlPath = entity.UrlPath;
        var wasPublished = entity.Status == ContentStatus.Published;

        if (!entity.IsSystemLocked)
        {
            var newSlug = JStr(body, "slug");
            if (newSlug is not null)
            {
                // ⚠️ 分類（非標籤）的 Term 改 slug 會動到 URL 結構與 301 對照表，
                //    比照新增／刪除分類，限超級管理員（docs/10 §3.3、docs/02 §4）。
                if (unit == UnitCodes.Term)
                {
                    var term = (Term)entity;
                    if (term.TermType != TermType.ArticleTag && !string.Equals(newSlug, term.Slug, StringComparison.Ordinal))
                        RequireTermManagePermission(req, term.TermType);
                }
                entity.Slug = NormalizeAndValidateSlug(newSlug, required: true);
            }
        }

        if (JInt(body, "sortOrder") is int sortOrder) entity.SortOrder = sortOrder;
        if (JBool(body, "includeInSitemap") is bool includeInSitemap) entity.IncludeInSitemap = includeInSitemap;

        var isDoctorNonAdmin = !RequestContext.IsSuperAdmin(req) && RequestContext.Roles(req).Contains(RoleCodes.Doctor);
        if (!isDoctorNonAdmin && body.TryGetProperty("ownerUserId", out var ownerEl))
            entity.OwnerUserId = ownerEl.ValueKind == JsonValueKind.Null ? null : ownerEl.GetInt32();

        ApplyFields(entity, unit, body, isCreate: false);

        if (!entity.IsSystemLocked)
            entity.UrlPath = await ComputeUrlPathAsync(unit, entity, ct);

        if (!string.Equals(entity.UrlPath, oldUrlPath, StringComparison.Ordinal) && oldUrlPath is not null)
        {
            // ⚠️ 系統自動轉址（Source=SystemAuto）：換分類／改 slug 造成網址變動時，
            //    自動補一筆 301，避免舊網址變成孤兒（docs/08 §C-1、Redirects 型別註解）。
            db.Redirects.Add(new Redirect
            {
                FromPath = oldUrlPath,
                ToPath = entity.UrlPath ?? oldUrlPath,
                ToContentItemId = entity.Id,
                StatusCode = 301,
                Source = RedirectSource.SystemAuto,
                IsActive = true,
                IsVerified = false,
                CreatedAt = Clock.UtcNow,
            });
        }

        // 🔴 docs/11 §7 規則 2：已發布的內容被編輯，工作副本回到草稿，
        //    但 PublishedVersionId 不動 —— 前台仍看那一版，直到重新送審核准。
        //
        //    ⚠️ 這**不會**讓頁面從網站上消失：可見性判定的是「有沒有一版已核准的內容」
        //    （Common/Visibility.cs），不是工作副本的狀態。若可見性綁在 Status=3 上，
        //    編輯一個已上線的療程頁就會讓它 404 —— 審核閘是為了擋未審過的新內容上線，
        //    不是為了把已經審過的頁面下架。
        if (wasPublished) entity.Status = ContentStatus.Draft;

        var userId = RequestContext.UserId(req);
        entity.UpdatedByUserId = userId;
        entity.UpdatedAt = Clock.UtcNow;

        var strategy = db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            await db.SaveChangesAsync(ct);
            await SaveVersionAsync(unit, entity, userId, "編輯", ct);
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        });

        await DeleteUnreferencedBlobsAsync(blobsBefore, CollectBlobPaths(entity), ct);

        return await GetAsync(unit, id);
    }

    public async Task<IActionResult> UpdateSeoAsync(HttpRequest req, string unit, string id)
    {
        var contentId = ParseId(id);
        var ct = req.HttpContext.RequestAborted;
        var entity = await LoadAsync(unit, contentId, tracking: true, ct) ?? throw AppException.NotFound("內容");

        var blobsBefore = CollectBlobPaths(entity);

        var body = await ReadJsonAsync<SeoSaveRequest>(req, ct);

        if (body.AiSummary is { Length: > 0 } && (body.AiSummary.Length < 20 || body.AiSummary.Length > 300))
            throw AppException.BadRequest(ErrorCodes.ValidationRange, "AI 摘要長度須介於 20 至 300 字（docs/03 §4）。");
        if (body.SeoTitle is { Length: > 200 })
            throw AppException.BadRequest(ErrorCodes.ValidationRange, "SEO 標題長度不可超過 200 字。");
        if (body.MetaDescription is { Length: > 400 })
            throw AppException.BadRequest(ErrorCodes.ValidationRange, "Meta Description 長度不可超過 400 字。");

        var userId = RequestContext.UserId(req);
        var now = Clock.UtcNow;

        var wasDetached = entity.Seo is null;
        entity.Seo ??= new SeoMeta { ContentItemId = entity.Id };
        entity.Seo.SeoTitle = body.SeoTitle;
        entity.Seo.MetaDescription = body.MetaDescription;
        entity.Seo.OgImage = body.OgImage?.ToEntity();
        entity.Seo.CanonicalOverride = body.CanonicalOverride;
        entity.Seo.NoIndex = body.NoIndex;
        entity.Seo.StructuredDataOverride = body.StructuredDataOverride;
        entity.Seo.AiSummary = string.IsNullOrWhiteSpace(body.AiSummary) ? null : body.AiSummary;
        entity.Seo.UpdatedByUserId = userId;
        entity.Seo.UpdatedAt = now;

        var strategy = db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            if (wasDetached) db.SeoMetas.Add(entity.Seo);
            await db.SaveChangesAsync(ct);
            await SaveVersionAsync(unit, entity, userId, "更新 SEO", ct);
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        });

        await DeleteUnreferencedBlobsAsync(blobsBefore, CollectBlobPaths(entity), ct);

        if (entity.Status == ContentStatus.Published) await TryRebuildAsync();

        return await GetAsync(unit, id);
    }

    // ════════════════════════════════════════════════════════════════════
    // 3. 關聯
    // ════════════════════════════════════════════════════════════════════

    /// <summary>合法組合（docs/08 §D、<c>ContentRelationConfiguration</c> 的 CHECK 約束）。RelationType 12（頁面精選）不限單一目標型別，另外處理。</summary>
    private static readonly Dictionary<byte, ContentType> RelationFromType = new()
    {
        [1] = ContentType.Treatment, [2] = ContentType.Treatment, [3] = ContentType.Treatment, [4] = ContentType.Treatment,
        [5] = ContentType.Concern, [6] = ContentType.Concern, [7] = ContentType.Concern,
        [8] = ContentType.Clinic, [9] = ContentType.Clinic, [10] = ContentType.Clinic,
        [11] = ContentType.Article,
        [13] = ContentType.Doctor,
        [14] = ContentType.Concern,
    };

    public async Task<IActionResult> UpdateRelationsAsync(HttpRequest req, string unit, string id)
    {
        var contentId = ParseId(id);
        var ct = req.HttpContext.RequestAborted;
        var entity = await LoadAsync(unit, contentId, tracking: true, ct) ?? throw AppException.NotFound("內容");

        RequireOwnership(req, entity);
        RequireLegalPageGuard(req, entity);

        if (entity.Status == ContentStatus.InReview)
            throw AppException.Conflict(ErrorCodes.ConflictState, "送審中的內容已鎖定，請等待審核結果。");

        var items = await ReadJsonAsync<List<RelationSaveItem>>(req, ct);

        foreach (var item in items)
        {
            if (item.RelationType == 12)
            {
                if (entity.ContentType != ContentType.Page)
                    throw AppException.BadRequest(ErrorCodes.ValidationFormat, "relationType 12（精選項目）僅適用於頁面。");
            }
            else if (RelationFromType.TryGetValue(item.RelationType, out var expectedFrom))
            {
                if (expectedFrom != entity.ContentType)
                    throw AppException.BadRequest(ErrorCodes.ValidationFormat, $"relationType {item.RelationType} 不適用於此內容單元。");
            }
            else
            {
                throw AppException.BadRequest(ErrorCodes.ValidationFormat, $"未知的 relationType：{item.RelationType}。");
            }
        }

        var toIds = items.Select(i => i.ToContentItemId).Distinct().ToList();
        var targetTypes = await db.ContentItems.AsNoTracking()
            .Where(ci => toIds.Contains(ci.Id))
            .ToDictionaryAsync(ci => ci.Id, ci => ci.ContentType, ct);

        foreach (var item in items)
        {
            if (!targetTypes.ContainsKey(item.ToContentItemId))
                throw AppException.BadRequest(ErrorCodes.ValidationFormat, $"找不到目標內容 {item.ToContentItemId}。");
        }

        var wasPublished = entity.Status == ContentStatus.Published;
        var userId = RequestContext.UserId(req);

        var strategy = db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);

            var existing = await db.ContentRelations.Where(r => r.FromContentItemId == contentId).ToListAsync(ct);
            db.ContentRelations.RemoveRange(existing);
            await db.SaveChangesAsync(ct);

            foreach (var item in items)
            {
                db.ContentRelations.Add(new ContentRelation
                {
                    FromContentItemId = contentId,
                    FromContentType = entity.ContentType,
                    ToContentItemId = item.ToContentItemId,
                    ToContentType = targetTypes[item.ToContentItemId],
                    RelationType = (RelationType)item.RelationType,
                    SortOrder = item.SortOrder,
                    Note = item.Note,
                });
            }

            // 同上：工作副本回草稿，但 PublishedVersionId 不動，前台不受影響。
            if (wasPublished) entity.Status = ContentStatus.Draft;
            entity.UpdatedByUserId = userId;
            entity.UpdatedAt = Clock.UtcNow;
            await db.SaveChangesAsync(ct);

            await SaveVersionAsync(unit, entity, userId, "更新關聯", ct);
            await db.SaveChangesAsync(ct);

            await tx.CommitAsync(ct);
        });

        return await GetAsync(unit, id);
    }

    // ════════════════════════════════════════════════════════════════════
    // 4. 工作流
    // ════════════════════════════════════════════════════════════════════

    public async Task<IActionResult> SubmitAsync(HttpRequest req, string unit, string id)
    {
        var contentId = ParseId(id);
        var ct = req.HttpContext.RequestAborted;
        var entity = await LoadAsync(unit, contentId, tracking: true, ct) ?? throw AppException.NotFound("內容");

        RequireOwnership(req, entity);
        RequireLegalPageGuard(req, entity);

        if (entity.Status != ContentStatus.Draft)
            throw AppException.Conflict(ErrorCodes.ConflictState, "僅能對草稿狀態的內容送審。");

        var userId = RequestContext.UserId(req);
        var now = Clock.UtcNow;

        var strategy = db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);

            var version = await db.ContentVersions
                .Where(v => v.ContentItemId == contentId)
                .OrderByDescending(v => v.VersionNo)
                .FirstOrDefaultAsync(ct);
            if (version is null)
            {
                version = await SaveVersionAsync(unit, entity, userId, "送審", ct);
                await db.SaveChangesAsync(ct);
            }

            var fields = BuildFieldsDict(unit, entity);
            var riskFlags = await ScanRiskTermsAsync(entity.Title, fields, ct);

            db.ContentReviews.Add(new ContentReview
            {
                ContentItemId = contentId,
                VersionId = version.Id,
                SubmittedByUserId = userId,
                SubmittedAt = now,
                Status = ReviewStatus.Pending,
                RiskFlags = riskFlags,
            });

            entity.Status = ContentStatus.InReview;
            entity.UpdatedByUserId = userId;
            entity.UpdatedAt = now;

            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        });

        return await GetAsync(unit, id);
    }

    public async Task<IActionResult> ScheduleAsync(HttpRequest req, string unit, string id)
    {
        var contentId = ParseId(id);
        var ct = req.HttpContext.RequestAborted;
        var entity = await LoadAsync(unit, contentId, tracking: true, ct) ?? throw AppException.NotFound("內容");

        RequireOwnership(req, entity);

        var body = await ReadJsonAsync<ScheduleRequest>(req, ct);

        if (body.PublishAt is not null && body.UnpublishAt is not null && body.UnpublishAt <= body.PublishAt)
            throw AppException.BadRequest(ErrorCodes.ValidationRange, "下架時間必須晚於發布時間。");

        entity.PublishAt = body.PublishAt?.ToUniversalTime();
        entity.UnpublishAt = body.UnpublishAt?.ToUniversalTime();
        entity.UpdatedByUserId = RequestContext.UserId(req);
        entity.UpdatedAt = Clock.UtcNow;

        await db.SaveChangesAsync(ct);

        return await GetAsync(unit, id);
    }

    public async Task<IActionResult> PublishAsync(HttpRequest req, string unit, string id)
    {
        var contentId = ParseId(id);
        var ct = req.HttpContext.RequestAborted;
        var entity = await LoadAsync(unit, contentId, tracking: true, ct) ?? throw AppException.NotFound("內容");

        var body = await ReadJsonAsync<PublishRequest>(req, ct);
        var userId = RequestContext.UserId(req);
        var now = Clock.UtcNow;

        switch (body.Action.Trim().ToLowerInvariant())
        {
            case "publish":
            {
                var strategy = db.Database.CreateExecutionStrategy();
                await strategy.ExecuteAsync(async () =>
                {
                    await using var tx = await db.Database.BeginTransactionAsync(ct);
                    var version = await SaveVersionAsync(unit, entity, userId, "直接發布", ct);
                    await db.SaveChangesAsync(ct);

                    entity.Status = ContentStatus.Published;
                    entity.PublishedVersionId = version.Id;
                    entity.UpdatedByUserId = userId;
                    entity.UpdatedAt = now;
                    await db.SaveChangesAsync(ct);
                    await tx.CommitAsync(ct);
                });
                break;
            }
            case "unpublish":
            {
                if (entity.Status != ContentStatus.Published)
                    throw AppException.Conflict(ErrorCodes.ConflictState, "僅能對已發布的內容執行下架。");
                entity.Status = ContentStatus.Unpublished;
                entity.UpdatedByUserId = userId;
                entity.UpdatedAt = now;
                await db.SaveChangesAsync(ct);
                break;
            }
            default:
                throw AppException.BadRequest(ErrorCodes.ValidationFormat, "action 必須是 publish 或 unpublish。");
        }

        await TryRebuildAsync();
        return await GetAsync(unit, id);
    }

    public async Task<IActionResult> SortAsync(HttpRequest req, string unit)
    {
        var contentType = ToContentType(unit);
        var ct = req.HttpContext.RequestAborted;
        var items = await ReadJsonAsync<List<SortSaveItem>>(req, ct);
        if (items.Count == 0) return new OkObjectResult(ApiResponse.Ok<object?>(null));
        if (items.Count > Paging.MaxPageSize)
            throw AppException.BadRequest(ErrorCodes.ValidationRange, $"一次排序不可超過 {Paging.MaxPageSize} 筆。");

        var ids = items.Select(i => i.Id).ToList();
        var entities = await db.ContentItems
            .Where(ci => ci.ContentType == contentType && ids.Contains(ci.Id))
            .ToListAsync(ct);

        var isDoctorNonAdmin = !RequestContext.IsSuperAdmin(req) && RequestContext.Roles(req).Contains(RoleCodes.Doctor);
        if (isDoctorNonAdmin)
        {
            var me = RequestContext.UserId(req);
            if (entities.Any(e => e.OwnerUserId != me))
                throw AppException.Forbidden("僅能調整本人負責的內容排序。");
        }

        var userId = RequestContext.UserId(req);
        var now = Clock.UtcNow;
        var sortMap = items.ToDictionary(i => i.Id, i => i.SortOrder);
        var touchedPublished = false;

        foreach (var entity in entities)
        {
            entity.SortOrder = sortMap[entity.Id];
            entity.UpdatedByUserId = userId;
            entity.UpdatedAt = now;
            if (entity.Status == ContentStatus.Published) touchedPublished = true;
        }

        await db.SaveChangesAsync(ct);
        if (touchedPublished) await TryRebuildAsync();

        return new OkObjectResult(ApiResponse.Ok<object?>(null));
    }

    public async Task<IActionResult> DeleteAsync(HttpRequest req, string unit, string id)
    {
        var contentId = ParseId(id);
        var ct = req.HttpContext.RequestAborted;
        var entity = await LoadAsync(unit, contentId, tracking: true, ct) ?? throw AppException.NotFound("內容");

        if (entity.IsSystemLocked)
            throw AppException.Conflict(ErrorCodes.ConflictLocked, "系統頁與系統分類不可刪除。");

        RequireOwnership(req, entity);
        RequireLegalPageGuard(req, entity);

        if (entity.Status == ContentStatus.InReview)
            throw AppException.Conflict(ErrorCodes.ConflictState, "送審中的內容已鎖定，請等待審核結果。");

        if (unit == UnitCodes.Term)
        {
            RequireTermManagePermission(req, ((Term)entity).TermType);
            var usageCount = await _read.CountReferencesAsync(contentId, ct);
            if (usageCount > 0)
                throw AppException.Conflict(ErrorCodes.ConflictState, $"仍有 {usageCount} 筆內容引用此分類／標籤，無法刪除。");
        }

        var wasPublished = entity.Status == ContentStatus.Published;
        var blobsBefore = CollectBlobPaths(entity);

        var strategy = db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);

            // ⚠️ 指向它的關聯是 NoAction，必須由應用層在同一交易內先清掉（docs/08 §D）。
            var incoming = await db.ContentRelations.Where(r => r.ToContentItemId == contentId).ToListAsync(ct);
            db.ContentRelations.RemoveRange(incoming);
            await db.SaveChangesAsync(ct);

            RemoveEntity(unit, entity);
            await db.SaveChangesAsync(ct);

            await tx.CommitAsync(ct);
        });

        // 內容沒了，它的圖片就沒有任何欄位指得到——一個欄位獨佔一個 blob，可以直接刪。
        await DeleteUnreferencedBlobsAsync(blobsBefore, [], ct);

        if (wasPublished) await TryRebuildAsync();

        return new OkObjectResult(ApiResponse.Ok<object?>(null));
    }

    // ════════════════════════════════════════════════════════════════════
    // 5. 版本歷程
    // ════════════════════════════════════════════════════════════════════

    public async Task<IActionResult> ListVersionsAsync(string unit, string id)
    {
        var contentId = ParseId(id);
        // ⚠️ 這支端點的路由沒有帶查詢字串（見 Routing/AppRouter.Admin.cs），加上
        //    VersionPrune Timer 保證每筆內容最多 30 版（docs/11 §11），回傳平面陣列
        //    （docs/10 §2 分頁雙模式的「不帶分頁參數」那一種）已足夠，不需要另外分頁。
        var (items, _) = await _read.ListVersionsAsync(contentId, 1, Paging.MaxPageSize, CancellationToken.None);
        var dtos = items
            .Select(v => new VersionListItemDto(v.Id, v.VersionNo, v.Title, v.Note, v.CreatedByUserId, v.CreatedAt))
            .ToList();
        return new OkObjectResult(ApiResponse.Ok<IReadOnlyList<VersionListItemDto>>(dtos));
    }

    public async Task<IActionResult> GetVersionAsync(string unit, string id, string versionNo)
    {
        var contentId = ParseId(id);
        var no = ParseVersionNo(versionNo);

        var row = await _read.GetVersionAsync(contentId, no, CancellationToken.None) ?? throw AppException.NotFound("版本");
        var dto = new VersionDetailDto(row.Id, row.VersionNo, row.Title, row.Note, row.CreatedByUserId, row.CreatedAt, row.Snapshot);
        return new OkObjectResult(ApiResponse.Ok(dto));
    }

    public async Task<IActionResult> RestoreVersionAsync(HttpRequest req, string unit, string id, string versionNo)
    {
        var contentId = ParseId(id);
        var no = ParseVersionNo(versionNo);
        var ct = req.HttpContext.RequestAborted;

        var row = await _read.GetVersionAsync(contentId, no, ct) ?? throw AppException.NotFound("版本");
        var entity = await LoadAsync(unit, contentId, tracking: true, ct) ?? throw AppException.NotFound("內容");

        RequireOwnership(req, entity);
        RequireLegalPageGuard(req, entity);

        if (entity.Status == ContentStatus.InReview)
            throw AppException.Conflict(ErrorCodes.ConflictState, "送審中的內容已鎖定，請等待審核結果。");

        var userId = RequestContext.UserId(req);
        var blobsBefore = CollectBlobPaths(entity);

        using var doc = JsonDocument.Parse(row.Snapshot);
        var root = doc.RootElement;

        entity.Title = root.TryGetProperty("title", out var titleEl) && titleEl.ValueKind == JsonValueKind.String
            ? titleEl.GetString() ?? entity.Title
            : entity.Title;

        if (!entity.IsSystemLocked)
        {
            var slug = JStr(root, "slug");
            if (slug is not null) entity.Slug = slug;
        }

        if (root.TryGetProperty("summary", out _)) entity.Summary = JStr(root, "summary");
        entity.SortOrder = JInt(root, "sortOrder") ?? entity.SortOrder;
        entity.IncludeInSitemap = JBool(root, "includeInSitemap") ?? entity.IncludeInSitemap;

        if (root.TryGetProperty("fields", out var fieldsEl))
            ApplyFields(entity, unit, fieldsEl, isCreate: false);

        if (!entity.IsSystemLocked)
            entity.UrlPath = await ComputeUrlPathAsync(unit, entity, ct);

        entity.Status = ContentStatus.Draft; // 還原是整筆還原成草稿，不直接上線（docs/10 §3.3）
        entity.UpdatedByUserId = userId;
        entity.UpdatedAt = Clock.UtcNow;

        var strategy = db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);

            if (root.TryGetProperty("relations", out var relationsEl) && relationsEl.ValueKind == JsonValueKind.Array)
            {
                var existing = await db.ContentRelations.Where(r => r.FromContentItemId == contentId).ToListAsync(ct);
                db.ContentRelations.RemoveRange(existing);
                await db.SaveChangesAsync(ct);

                foreach (var r in relationsEl.EnumerateArray())
                {
                    db.ContentRelations.Add(new ContentRelation
                    {
                        FromContentItemId = contentId,
                        FromContentType = entity.ContentType,
                        ToContentItemId = r.GetProperty("toContentItemId").GetInt32(),
                        ToContentType = (ContentType)r.GetProperty("toContentType").GetByte(),
                        RelationType = (RelationType)r.GetProperty("relationType").GetByte(),
                        SortOrder = JInt(r, "sortOrder") ?? 0,
                        Note = JStr(r, "note"),
                    });
                }
            }

            await db.SaveChangesAsync(ct);
            await SaveVersionAsync(unit, entity, userId, $"還原自版本 {no}", ct);
            await db.SaveChangesAsync(ct);

            await tx.CommitAsync(ct);
        });

        // ⚠️ 還原之後，被換下來的那些圖片一樣沒有欄位指得到了，照樣刪。
        //    反過來說，快照裡指向的檔案若早就被換掉，還原不會把它變回來（docs/11 §9）。
        await DeleteUnreferencedBlobsAsync(blobsBefore, CollectBlobPaths(entity), ct);

        return await GetAsync(unit, id);
    }

    // ════════════════════════════════════════════════════════════════════
    // 6. 版本快照
    // ════════════════════════════════════════════════════════════════════

    /// <summary>
    /// 建立一筆新版本快照（docs/11 §8）。⚠️ 這是本專案唯一產生 <c>ContentVersions.Snapshot</c>
    /// 的地方——遷移期的 Dapper 匯入腳本需要另外照這裡的 JSON 形狀直寫，兩邊格式不可分岔。
    /// </summary>
    private async Task<ContentVersion> SaveVersionAsync(string unit, ContentItem entity, int userId, string? note, CancellationToken ct)
    {
        var maxVersionNo = await db.ContentVersions
            .Where(v => v.ContentItemId == entity.Id)
            .Select(v => (int?)v.VersionNo)
            .MaxAsync(ct) ?? 0;

        var fields = BuildFieldsDict(unit, entity);
        var seoDto = entity.Seo is null ? null : ToSeoDto(entity.Seo);
        var relations = await db.ContentRelations
            .Where(r => r.FromContentItemId == entity.Id)
            .OrderBy(r => r.RelationType).ThenBy(r => r.SortOrder)
            .ToListAsync(ct);
        var relationDtos = await ToRelationDtosAsync(relations, ct);

        object? homeSections = null;
        if (unit == UnitCodes.Page && entity is Page { SystemKey: PageKeys.Home })
        {
            homeSections = await db.HomeSections
                .Include(s => s.Items)
                .AsNoTracking()
                .OrderBy(s => s.SortOrder)
                .Select(s => new
                {
                    s.SectionKey,
                    s.Title,
                    s.Subtitle,
                    s.IsEnabled,
                    s.SortOrder,
                    s.Settings,
                    Items = s.Items.OrderBy(i => i.SortOrder).Select(i => new { i.ContentItemId, i.SortOrder }),
                })
                .ToListAsync(ct);
        }

        var snapshot = new
        {
            id = entity.Id,
            unit,
            contentType = (byte)entity.ContentType,
            slug = entity.Slug,
            urlPath = entity.UrlPath,
            title = entity.Title,
            summary = entity.Summary,
            sortOrder = entity.SortOrder,
            includeInSitemap = entity.IncludeInSitemap,
            ownerUserId = entity.OwnerUserId,
            fields,
            seo = seoDto,
            relations = relationDtos,
            homeSections,
        };

        var version = new ContentVersion
        {
            ContentItemId = entity.Id,
            VersionNo = maxVersionNo + 1,
            Title = entity.Title,
            Snapshot = JsonSerializer.Serialize(snapshot, JsonOpts),
            Note = note,
            CreatedByUserId = userId,
            CreatedAt = Clock.UtcNow,
        };
        db.ContentVersions.Add(version);
        return version;
    }

    // ════════════════════════════════════════════════════════════════════
    // 7. 高風險字詞掃描（docs/11 §7、docs/02 §5）
    // ════════════════════════════════════════════════════════════════════

    /// <summary>
    /// ⚠️ 快取策略退而求其次：docs/11 §7 要求「啟動時整份載入記憶體」，但本專案不碰
    /// <c>Program.cs</c>，無法註冊啟動時預先載入的 hosted service。改為「第一次用到時
    /// 載入並快取 30 分鐘」，效果相近（RiskTerms 目前無管理端點會寫入，本次工作範圍內
    /// 沒有需要失效重載的時機）。已在回報中說明。
    /// </summary>
    private async Task<IReadOnlyList<RiskTerm>> GetRiskTermsAsync(CancellationToken ct)
    {
        if (cache.TryGetValue(RiskTermCacheKey, out IReadOnlyList<RiskTerm>? cached) && cached is not null)
            return cached;

        var terms = await db.RiskTerms.AsNoTracking().Where(t => t.IsActive).ToListAsync(ct);
        IReadOnlyList<RiskTerm> result = terms;
        cache.Set(RiskTermCacheKey, result, TimeSpan.FromMinutes(30));
        return result;
    }

    /// <summary>⚠️ 警示不阻擋送審，它是提示不是閘門（docs/02 §5）——本方法只回報命中結果，呼叫端不得因此擋下送審。</summary>
    private async Task<string> ScanRiskTermsAsync(string title, Dictionary<string, object?> fields, CancellationToken ct)
    {
        var terms = await GetRiskTermsAsync(ct);
        if (terms.Count == 0) return "[]";

        var haystack = string.Join('\n', new[] { title }.Concat(fields.Values.OfType<string>()));
        var hits = terms
            .Where(t => haystack.Contains(t.Term, StringComparison.OrdinalIgnoreCase))
            .Select(t => new { term = t.Term, category = (byte)t.Category })
            .ToList();

        return JsonSerializer.Serialize(hits, JsonOpts);
    }

    // ════════════════════════════════════════════════════════════════════
    // 8. 觸發重建（docs/11 §10）
    // ════════════════════════════════════════════════════════════════════

    /// <summary>⚠️ 重建失敗不得讓內容操作失敗——內容狀態已經改好，重建失敗要獨立告警（docs/11 §10）。</summary>
    private async Task TryRebuildAsync()
    {
        try
        {
            await rebuild.RequestAsync();
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "觸發重建失敗，內容狀態已正常儲存，需另行檢查重建管線。");
        }
    }

    // ════════════════════════════════════════════════════════════════════
    // 9. 授權：擁有者判定與逐單元例外（docs/11 §5.4、docs/10 §3.3）
    // ════════════════════════════════════════════════════════════════════

    /// <summary>唯一的資料列層級判定（docs/11 §5.4）：醫師只能動 OwnerUserId 是自己的內容。</summary>
    private static void RequireOwnership(HttpRequest req, ContentItem item)
    {
        if (RequestContext.IsSuperAdmin(req)) return;
        if (!RequestContext.Roles(req).Contains(RoleCodes.Doctor)) return;
        if (item.OwnerUserId != RequestContext.UserId(req))
            throw AppException.Forbidden("僅能編輯本人負責的內容。");
    }

    /// <summary>法務三頁限超級管理員（docs/10 §3.3、docs/02 §4）。</summary>
    private static void RequireLegalPageGuard(HttpRequest req, ContentItem item)
    {
        if (item is Page { SuperAdminOnly: true } && !RequestContext.IsSuperAdmin(req))
            throw AppException.Forbidden("法務頁面僅限超級管理員編輯。");
    }

    private static bool HasPermission(HttpRequest req, string code)
        => RequestContext.IsSuperAdmin(req)
           || req.HttpContext.User.FindAll(TokenClaims.Permissions).Any(c => c.Value == code);

    /// <summary>新增／刪除分類限超級管理員；新增標籤屬 <c>taxonomy.tag.create</c>（docs/10 §3.3）。</summary>
    private static void RequireTermManagePermission(HttpRequest req, TermType type)
    {
        if (type == TermType.ArticleTag)
        {
            if (!HasPermission(req, PermissionCodes.TagCreate))
                throw AppException.Forbidden("新增標籤需要標籤管理權限。");
        }
        else if (!HasPermission(req, PermissionCodes.CategoryManage))
        {
            throw AppException.Forbidden("新增、刪除或變更分類網址僅限超級管理員。");
        }
    }

    // ════════════════════════════════════════════════════════════════════
    // 10. 讀取／載入
    // ════════════════════════════════════════════════════════════════════

    private static ContentType ToContentType(string unit) => unit switch
    {
        UnitCodes.Treatment => ContentType.Treatment,
        UnitCodes.Doctor => ContentType.Doctor,
        UnitCodes.Concern => ContentType.Concern,
        UnitCodes.Article => ContentType.Article,
        UnitCodes.Case => ContentType.Case,
        UnitCodes.Faq => ContentType.Faq,
        UnitCodes.Clinic => ContentType.Clinic,
        UnitCodes.Page => ContentType.Page,
        UnitCodes.Term => ContentType.Term,
        _ => throw AppException.BadRequest(ErrorCodes.ValidationFormat, $"未知的內容單元：{unit}"),
    };

    /// <summary>
    /// 依單元載入完整實體（含 SEO 與子明細列）。
    /// ⚠️ <c>tracking:false</c> 供顯示用（<see cref="GetAsync"/>）；<c>tracking:true</c> 供寫入路徑用。
    /// TPT 下無論從哪個具體 DbSet 查詢，實際 CLR 型別皆正確對應資料所在的子表（docs/11 §6.2）。
    /// </summary>
    private async Task<ContentItem?> LoadAsync(string unit, int id, bool tracking, CancellationToken ct)
    {
        switch (unit)
        {
            case UnitCodes.Treatment:
            {
                IQueryable<Treatment> q = db.Treatments.Include(x => x.Seo).Include(x => x.Images);
                if (!tracking) q = q.AsNoTracking();
                return await q.FirstOrDefaultAsync(x => x.Id == id, ct);
            }
            case UnitCodes.Doctor:
            {
                IQueryable<Doctor> q = db.Doctors.Include(x => x.Seo).Include(x => x.Tags).Include(x => x.Credentials).Include(x => x.Schedules);
                if (!tracking) q = q.AsNoTracking();
                return await q.FirstOrDefaultAsync(x => x.Id == id, ct);
            }
            case UnitCodes.Concern:
            {
                IQueryable<Concern> q = db.Concerns.Include(x => x.Seo);
                if (!tracking) q = q.AsNoTracking();
                return await q.FirstOrDefaultAsync(x => x.Id == id, ct);
            }
            case UnitCodes.Article:
            {
                IQueryable<Article> q = db.Articles.Include(x => x.Seo);
                if (!tracking) q = q.AsNoTracking();
                return await q.FirstOrDefaultAsync(x => x.Id == id, ct);
            }
            case UnitCodes.Case:
            {
                IQueryable<Case> q = db.Cases.Include(x => x.Seo).Include(x => x.Images);
                if (!tracking) q = q.AsNoTracking();
                return await q.FirstOrDefaultAsync(x => x.Id == id, ct);
            }
            case UnitCodes.Faq:
            {
                IQueryable<Faq> q = db.Faqs.Include(x => x.Seo);
                if (!tracking) q = q.AsNoTracking();
                return await q.FirstOrDefaultAsync(x => x.Id == id, ct);
            }
            case UnitCodes.Clinic:
            {
                IQueryable<Clinic> q = db.Clinics.Include(x => x.Seo).Include(x => x.BusinessHours).Include(x => x.Photos);
                if (!tracking) q = q.AsNoTracking();
                return await q.FirstOrDefaultAsync(x => x.Id == id, ct);
            }
            case UnitCodes.Page:
            {
                IQueryable<Page> q = db.Pages.Include(x => x.Seo);
                if (!tracking) q = q.AsNoTracking();
                return await q.FirstOrDefaultAsync(x => x.Id == id, ct);
            }
            case UnitCodes.Term:
            {
                IQueryable<Term> q = db.Terms.Include(x => x.Seo);
                if (!tracking) q = q.AsNoTracking();
                return await q.FirstOrDefaultAsync(x => x.Id == id, ct);
            }
            default:
                throw AppException.BadRequest(ErrorCodes.ValidationFormat, $"未知的內容單元：{unit}");
        }
    }

    private void AddEntity(string unit, ContentItem entity)
    {
        switch (unit)
        {
            case UnitCodes.Treatment: db.Treatments.Add((Treatment)entity); break;
            case UnitCodes.Doctor: db.Doctors.Add((Doctor)entity); break;
            case UnitCodes.Concern: db.Concerns.Add((Concern)entity); break;
            case UnitCodes.Article: db.Articles.Add((Article)entity); break;
            case UnitCodes.Case: db.Cases.Add((Case)entity); break;
            case UnitCodes.Faq: db.Faqs.Add((Faq)entity); break;
            case UnitCodes.Clinic: db.Clinics.Add((Clinic)entity); break;
            case UnitCodes.Page: db.Pages.Add((Page)entity); break;
            case UnitCodes.Term: db.Terms.Add((Term)entity); break;
        }
    }

    private void RemoveEntity(string unit, ContentItem entity)
    {
        switch (unit)
        {
            case UnitCodes.Treatment: db.Treatments.Remove((Treatment)entity); break;
            case UnitCodes.Doctor: db.Doctors.Remove((Doctor)entity); break;
            case UnitCodes.Concern: db.Concerns.Remove((Concern)entity); break;
            case UnitCodes.Article: db.Articles.Remove((Article)entity); break;
            case UnitCodes.Case: db.Cases.Remove((Case)entity); break;
            case UnitCodes.Faq: db.Faqs.Remove((Faq)entity); break;
            case UnitCodes.Clinic: db.Clinics.Remove((Clinic)entity); break;
            case UnitCodes.Page: db.Pages.Remove((Page)entity); break;
            case UnitCodes.Term: db.Terms.Remove((Term)entity); break;
        }
    }

    /// <summary>
    /// <c>UrlPath</c> 由應用程式計算寫入（docs/08 §B-1）。療程依賴 <c>CategoryTermId</c>；
    /// 分類與標籤依 <c>TermType</c> 決定路徑樣式（docs/02 §2）。
    /// ⚠️ 自由頁一律頂層路徑 <c>/{slug}/</c>——Page 模型沒有 ParentId，既有的巢狀路徑
    /// （如 <c>/about/new-chinese-aesthetics/</c>）只來自種子資料，此設計已在回報中說明。
    /// </summary>
    private async Task<string?> ComputeUrlPathAsync(string unit, ContentItem entity, CancellationToken ct)
    {
        switch (unit)
        {
            case UnitCodes.Treatment:
            {
                var categoryId = ((Treatment)entity).CategoryTermId;
                var categorySlug = await db.Terms.Where(t => t.Id == categoryId).Select(t => t.Slug).FirstOrDefaultAsync(ct)
                    ?? throw AppException.BadRequest(ErrorCodes.ValidationFormat, "找不到指定的療程分類。");
                return $"/treatments/{categorySlug}/{entity.Slug}/";
            }
            case UnitCodes.Doctor: return $"/team/{entity.Slug}/";
            case UnitCodes.Concern: return $"/concerns/{entity.Slug}/";
            case UnitCodes.Article: return $"/blog/{entity.Slug}/";
            case UnitCodes.Case: return $"/cases/{entity.Slug}/";
            case UnitCodes.Faq: return null; // 不產生獨立網址（docs/08 §C-6）
            case UnitCodes.Clinic: return $"/clinics/{entity.Slug}/";
            case UnitCodes.Page:
            {
                var page = (Page)entity;
                return page.PageKind == PageKind.System ? entity.UrlPath : $"/{entity.Slug}/";
            }
            case UnitCodes.Term:
            {
                var term = (Term)entity;
                return term.TermType switch
                {
                    TermType.TreatmentCategory => $"/treatments/{entity.Slug}/",
                    TermType.ArticleCategory => $"/blog/{entity.Slug}/",
                    TermType.FaqCategory => $"/faq/{entity.Slug}/",
                    TermType.ArticleTag => $"/blog/tag/{entity.Slug}/",
                    _ => throw AppException.BadRequest(ErrorCodes.ValidationFormat, "未知的分類類型。"),
                };
            }
            default:
                throw AppException.BadRequest(ErrorCodes.ValidationFormat, $"未知的內容單元：{unit}");
        }
    }

    private async Task<List<RelationItemDto>> ToRelationDtosAsync(List<ContentRelation> relations, CancellationToken ct)
    {
        if (relations.Count == 0) return [];
        var toIds = relations.Select(r => r.ToContentItemId).Distinct().ToList();
        var targets = await db.ContentItems.AsNoTracking()
            .Where(ci => toIds.Contains(ci.Id))
            .Select(ci => new { ci.Id, ci.Title, ci.UrlPath })
            .ToDictionaryAsync(x => x.Id, ct);

        return relations.Select(r =>
        {
            targets.TryGetValue(r.ToContentItemId, out var target);
            return new RelationItemDto(
                r.ToContentItemId, (byte)r.ToContentType, (byte)r.RelationType, r.SortOrder, r.Note,
                target?.Title, target?.UrlPath);
        }).ToList();
    }

    private static SeoMetaDto ToSeoDto(SeoMeta seo) => new(
        seo.SeoTitle, seo.MetaDescription, seo.OgImage?.ToDto(), seo.CanonicalOverride,
        seo.NoIndex, seo.StructuredDataOverride, seo.AiSummary, seo.UpdatedByUserId, seo.UpdatedAt);

    private static string StatusName(ContentStatus s) => s switch
    {
        ContentStatus.Draft => "草稿",
        ContentStatus.InReview => "送審中",
        ContentStatus.Published => "已發布",
        ContentStatus.Unpublished => "已下架",
        _ => s.ToString(),
    };

    /// <summary>
    /// 顯示用的推導狀態（docs/11 §7）：「已排程」「已過期」都不是資料庫欄位，
    /// 純粹由 <c>Status</c> ＋ <c>PublishAt</c>／<c>UnpublishAt</c> ＋現在時間推導。
    /// </summary>
    private static string EffectiveStatus(ContentStatus status, DateTime? publishAt, DateTime? unpublishAt)
    {
        if (status != ContentStatus.Published)
        {
            return status switch
            {
                ContentStatus.Draft => "draft",
                ContentStatus.InReview => "inReview",
                ContentStatus.Unpublished => "unpublished",
                _ => "draft",
            };
        }

        var now = Clock.UtcNow;
        if (publishAt is not null && publishAt > now) return "scheduled";
        if (unpublishAt is not null && unpublishAt <= now) return "expired";
        return "published";
    }

    /// <summary>
    /// 主幹的一句話導言（docs/08 §B-1）。⚠️ 不是 <c>SeoMeta.AiSummary</c> —— 那是 40–60 字的 GEO 直答段落。
    /// </summary>
    private static string? ReadSummary(JsonElement body)
    {
        var summary = JStr(body, "summary");
        if (summary is { Length: > 500 })
            throw AppException.BadRequest(ErrorCodes.ValidationRange, "summary 長度不可超過 500 字。");
        return summary;
    }

    private static int ParseId(string id)
        => int.TryParse(id, out var n) ? n : throw AppException.BadRequest(ErrorCodes.ValidationFormat, "識別碼格式錯誤。");

    private static int ParseVersionNo(string versionNo)
        => int.TryParse(versionNo, out var n) ? n : throw AppException.BadRequest(ErrorCodes.ValidationFormat, "版本號格式錯誤。");

    private static string? NormalizeAndValidateSlug(string? raw, bool required)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            if (required) throw AppException.BadRequest(ErrorCodes.ValidationRequired, "slug 為必填欄位。");
            return null;
        }

        var slug = raw.Trim().ToLowerInvariant();
        if (slug.Length > 160)
            throw AppException.BadRequest(ErrorCodes.ValidationRange, "slug 長度不可超過 160 字。");
        if (!SlugPattern.IsMatch(slug))
            throw AppException.BadRequest(ErrorCodes.ValidationFormat, "slug 只能包含小寫英數字與連字號，且不可開頭或結尾為連字號。");
        return slug;
    }

    // ════════════════════════════════════════════════════════════════════
    // 11. JSON body 讀取
    // ════════════════════════════════════════════════════════════════════

    private static async Task<JsonElement> ReadJsonBodyAsync(HttpRequest req, CancellationToken ct)
    {
        try
        {
            var body = await req.ReadFromJsonAsync<JsonElement>(ct);
            if (body.ValueKind != JsonValueKind.Object)
                throw AppException.BadRequest(ErrorCodes.ValidationRequired, "請求內容必須是 JSON 物件。");
            return body;
        }
        catch (JsonException)
        {
            throw AppException.BadRequest(ErrorCodes.ValidationFormat, "請求內容不是有效的 JSON。");
        }
    }

    private static async Task<T> ReadJsonAsync<T>(HttpRequest req, CancellationToken ct) where T : class
    {
        try
        {
            return await req.ReadFromJsonAsync<T>(ct)
                ?? throw AppException.BadRequest(ErrorCodes.ValidationRequired, "請求內容不可為空。");
        }
        catch (JsonException)
        {
            throw AppException.BadRequest(ErrorCodes.ValidationFormat, "請求內容不是有效的 JSON。");
        }
    }

    private static string? JStr(JsonElement e, string name)
        => e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String
            ? v.GetString() : null;

    private static int? JInt(JsonElement e, string name)
        => e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var i)
            ? i : null;

    private static bool? JBool(JsonElement e, string name)
        => e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) && v.ValueKind is JsonValueKind.True or JsonValueKind.False
            ? v.GetBoolean() : null;

    private static decimal? JDecimal(JsonElement e, string name)
        => e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetDecimal(out var d)
            ? d : null;

    private static DateTime? JDateTime(JsonElement e, string name)
    {
        if (e.ValueKind != JsonValueKind.Object || !e.TryGetProperty(name, out var v) || v.ValueKind != JsonValueKind.String) return null;
        return DateTime.TryParse(
            v.GetString(), CultureInfo.InvariantCulture,
            DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var dt)
            ? dt : null;
    }

    private static DateOnly? JDateOnly(JsonElement e, string name)
    {
        if (e.ValueKind != JsonValueKind.Object || !e.TryGetProperty(name, out var v) || v.ValueKind != JsonValueKind.String) return null;
        return DateOnly.TryParse(v.GetString(), CultureInfo.InvariantCulture, out var d) ? d : null;
    }

    // ════════════════════════════════════════════════════════════════════
    // 12. 九個單元的欄位對照表（docs/02 §1、docs/08 §C）
    // ════════════════════════════════════════════════════════════════════
    //
    // ⚠️ 每個單元一組 Build*Fields（輸出，供 GetAsync／版本快照）／Apply*Fields（輸入，
    // 供 Create／Update／RestoreVersion 共用）。PUT 語意為整份替換：明細列（圖庫／學經歷／
    // 看診時段／營業時段／照片）每次都以請求內容整批取代，前端編輯畫面每次都應送出完整內容。

    private static Dictionary<string, object?> BuildFieldsDict(string unit, ContentItem entity) => unit switch
    {
        UnitCodes.Treatment => BuildTreatmentFields((Treatment)entity),
        UnitCodes.Doctor => BuildDoctorFields((Doctor)entity),
        UnitCodes.Concern => BuildConcernFields((Concern)entity),
        UnitCodes.Article => BuildArticleFields((Article)entity),
        UnitCodes.Case => BuildCaseFields((Case)entity),
        UnitCodes.Faq => BuildFaqFields((Faq)entity),
        UnitCodes.Clinic => BuildClinicFields((Clinic)entity),
        UnitCodes.Page => BuildPageFields((Page)entity),
        UnitCodes.Term => BuildTermFields((Term)entity),
        _ => [],
    };

    private static void ApplyFields(ContentItem entity, string unit, JsonElement fields, bool isCreate)
    {
        switch (unit)
        {
            case UnitCodes.Treatment: ApplyTreatmentFields((Treatment)entity, fields, isCreate); break;
            case UnitCodes.Doctor: ApplyDoctorFields((Doctor)entity, fields, isCreate); break;
            case UnitCodes.Concern: ApplyConcernFields((Concern)entity, fields); break;
            case UnitCodes.Article: ApplyArticleFields((Article)entity, fields, isCreate); break;
            case UnitCodes.Case: ApplyCaseFields((Case)entity, fields, isCreate); break;
            case UnitCodes.Faq: ApplyFaqFields((Faq)entity, fields, isCreate); break;
            case UnitCodes.Clinic: ApplyClinicFields((Clinic)entity, fields, isCreate); break;
            case UnitCodes.Page: ApplyPageFields((Page)entity, fields); break;
            case UnitCodes.Term: ApplyTermFields((Term)entity, fields); break;
            default: throw AppException.BadRequest(ErrorCodes.ValidationFormat, $"未知的內容單元：{unit}");
        }
    }

    // ── Treatment（docs/08 §C-1）───────────────────────────────────────
    private static Dictionary<string, object?> BuildTreatmentFields(Treatment t) => new()
    {
        ["categoryTermId"] = t.CategoryTermId,
        ["nameEn"] = t.NameEn,
        ["subtitle"] = t.Subtitle,
        ["indications"] = t.Indications,
        ["mechanism"] = t.Mechanism,
        ["durationText"] = t.DurationText,
        ["sessionsText"] = t.SessionsText,
        ["aftercare"] = t.Aftercare,
        ["contraindications"] = t.Contraindications,
        ["deviceInfo"] = t.DeviceInfo,
        ["facts"] = t.Facts,
        ["steps"] = t.Steps,
        ["cover"] = ImageFields(t.Cover),
        ["images"] = t.Images.OrderBy(i => i.SortOrder).Select(i => new Dictionary<string, object?>
        {
            ["image"] = ImageFields(i.Image),
            ["caption"] = i.Caption,
            ["sortOrder"] = i.SortOrder,
        }).ToList(),
    };

    private static void ApplyTreatmentFields(Treatment t, JsonElement f, bool isCreate)
    {
        if (JInt(f, "categoryTermId") is int categoryTermId) t.CategoryTermId = categoryTermId;
        else if (isCreate) throw AppException.BadRequest(ErrorCodes.ValidationRequired, "categoryTermId 為必填欄位。");

        if (f.TryGetProperty("nameEn", out _)) t.NameEn = JStr(f, "nameEn");
        if (f.TryGetProperty("subtitle", out _)) t.Subtitle = JStr(f, "subtitle");
        if (f.TryGetProperty("indications", out _)) t.Indications = JStr(f, "indications");
        if (f.TryGetProperty("mechanism", out _)) t.Mechanism = JStr(f, "mechanism");
        if (f.TryGetProperty("durationText", out _)) t.DurationText = JStr(f, "durationText");
        if (f.TryGetProperty("sessionsText", out _)) t.SessionsText = JStr(f, "sessionsText");
        if (f.TryGetProperty("aftercare", out _)) t.Aftercare = JStr(f, "aftercare");
        if (f.TryGetProperty("contraindications", out _)) t.Contraindications = JStr(f, "contraindications");
        if (f.TryGetProperty("deviceInfo", out _)) t.DeviceInfo = JStr(f, "deviceInfo");
        if (f.TryGetProperty("facts", out _)) t.Facts = JStr(f, "facts");
        if (f.TryGetProperty("steps", out _)) t.Steps = JStr(f, "steps");
        if (f.TryGetProperty("cover", out _)) t.Cover = JImage(f, "cover");

        if (f.TryGetProperty("images", out var imagesEl) && imagesEl.ValueKind == JsonValueKind.Array)
        {
            t.Images.Clear();
            foreach (var img in imagesEl.EnumerateArray())
            {
                t.Images.Add(new TreatmentImage
                {
                    Image = RequireImage(img, "image"),
                    Caption = JStr(img, "caption"),
                    SortOrder = JInt(img, "sortOrder") ?? 0,
                });
            }
        }
    }

    // ── Doctor（docs/08 §C-2）──────────────────────────────────────────
    private static Dictionary<string, object?> BuildDoctorFields(Doctor d) => new()
    {
        ["jobTitle"] = d.JobTitle,
        ["isPhysician"] = d.IsPhysician,
        ["specialty"] = d.Specialty,
        ["photo"] = ImageFields(d.Photo),
        ["bio"] = d.Bio,
        ["publications"] = d.Publications,
        ["tags"] = d.Tags.OrderBy(x => x.Type).ThenBy(x => x.SortOrder).Select(x => new Dictionary<string, object?>
        {
            ["type"] = (byte)x.Type,
            ["tag"] = x.Tag,
            ["sortOrder"] = x.SortOrder,
        }).ToList(),
        ["credentials"] = d.Credentials.OrderBy(x => x.Type).ThenBy(x => x.SortOrder).Select(x => new Dictionary<string, object?>
        {
            ["type"] = (byte)x.Type,
            ["text"] = x.Text,
            ["sortOrder"] = x.SortOrder,
        }).ToList(),
        ["schedules"] = d.Schedules.OrderBy(x => x.DayOfWeek).Select(x => new Dictionary<string, object?>
        {
            ["clinicId"] = x.ClinicId,
            ["dayOfWeek"] = x.DayOfWeek,
            ["startTime"] = x.StartTime.ToString("HH:mm"),
            ["endTime"] = x.EndTime.ToString("HH:mm"),
            ["note"] = x.Note,
        }).ToList(),
    };

    private static void ApplyDoctorFields(Doctor d, JsonElement f, bool isCreate)
    {
        if (f.TryGetProperty("jobTitle", out _)) d.JobTitle = JStr(f, "jobTitle");

        if (JBool(f, "isPhysician") is bool isPhysician) d.IsPhysician = isPhysician;
        else if (isCreate) throw AppException.BadRequest(ErrorCodes.ValidationRequired, "isPhysician 為必填欄位（14 位團隊成員含 13 位醫師與 1 位藝術總監，不可省略）。");

        if (f.TryGetProperty("specialty", out _)) d.Specialty = JStr(f, "specialty");
        if (f.TryGetProperty("photo", out _)) d.Photo = JImage(f, "photo");
        if (f.TryGetProperty("bio", out _)) d.Bio = JStr(f, "bio");
        if (f.TryGetProperty("publications", out _)) d.Publications = JStr(f, "publications");

        if (f.TryGetProperty("tags", out var tagsEl) && tagsEl.ValueKind == JsonValueKind.Array)
        {
            d.Tags.Clear();
            foreach (var tag in tagsEl.EnumerateArray())
            {
                d.Tags.Add(new DoctorTag
                {
                    // ⚠️ 兩組標籤是個人頁的兩個區塊（docs/08 §C-2），沒帶就會混成同一串。
                    Type = (DoctorTagType)(JInt(tag, "type") ?? (int)DoctorTagType.Specialty),
                    Tag = tag.GetProperty("tag").GetString() ?? string.Empty,
                    SortOrder = JInt(tag, "sortOrder") ?? 0,
                });
            }
        }

        if (f.TryGetProperty("credentials", out var credsEl) && credsEl.ValueKind == JsonValueKind.Array)
        {
            d.Credentials.Clear();
            foreach (var c in credsEl.EnumerateArray())
            {
                d.Credentials.Add(new DoctorCredential
                {
                    Type = (CredentialType)c.GetProperty("type").GetByte(),
                    Text = c.GetProperty("text").GetString() ?? string.Empty,
                    SortOrder = JInt(c, "sortOrder") ?? 0,
                });
            }
        }

        if (f.TryGetProperty("schedules", out var schedEl) && schedEl.ValueKind == JsonValueKind.Array)
        {
            d.Schedules.Clear();
            foreach (var s in schedEl.EnumerateArray())
            {
                d.Schedules.Add(new DoctorSchedule
                {
                    ClinicId = s.GetProperty("clinicId").GetInt32(),
                    DayOfWeek = s.GetProperty("dayOfWeek").GetByte(),
                    StartTime = TimeOnly.Parse(s.GetProperty("startTime").GetString()!, CultureInfo.InvariantCulture),
                    EndTime = TimeOnly.Parse(s.GetProperty("endTime").GetString()!, CultureInfo.InvariantCulture),
                    Note = JStr(s, "note"),
                });
            }
        }
    }

    // ── Concern（docs/08 §C-3）─────────────────────────────────────────
    private static Dictionary<string, object?> BuildConcernFields(Concern c) => new()
    {
        ["symptoms"] = c.Symptoms,
        ["causes"] = c.Causes,
        ["selfCheckGuide"] = c.SelfCheckGuide,
        ["whenToSeeDoctor"] = c.WhenToSeeDoctor,
        ["recommendationIntro"] = c.RecommendationIntro,
        ["cover"] = ImageFields(c.Cover),
    };

    private static void ApplyConcernFields(Concern c, JsonElement f)
    {
        if (f.TryGetProperty("symptoms", out _)) c.Symptoms = JStr(f, "symptoms");
        if (f.TryGetProperty("causes", out _)) c.Causes = JStr(f, "causes");
        if (f.TryGetProperty("selfCheckGuide", out _)) c.SelfCheckGuide = JStr(f, "selfCheckGuide");
        if (f.TryGetProperty("whenToSeeDoctor", out _)) c.WhenToSeeDoctor = JStr(f, "whenToSeeDoctor");
        if (f.TryGetProperty("recommendationIntro", out _)) c.RecommendationIntro = JStr(f, "recommendationIntro");
        if (f.TryGetProperty("cover", out _)) c.Cover = JImage(f, "cover");
    }

    // ── Article（docs/08 §C-4）─────────────────────────────────────────
    private static Dictionary<string, object?> BuildArticleFields(Article a) => new()
    {
        ["categoryTermId"] = a.CategoryTermId,
        ["authorDoctorId"] = a.AuthorDoctorId,
        ["authorName"] = a.AuthorName,
        ["reviewerDoctorId"] = a.ReviewerDoctorId,
        ["reviewedOn"] = a.ReviewedOn?.ToString("yyyy-MM-dd"),
        ["displayDate"] = a.DisplayDate,
        ["cover"] = ImageFields(a.Cover),
        ["bodyBlocks"] = a.BodyBlocks,
        ["readingMinutes"] = a.ReadingMinutes,
        ["sourceSite"] = (byte)a.SourceSite,
    };

    private static void ApplyArticleFields(Article a, JsonElement f, bool isCreate)
    {
        if (JInt(f, "categoryTermId") is int categoryTermId) a.CategoryTermId = categoryTermId;
        else if (isCreate) throw AppException.BadRequest(ErrorCodes.ValidationRequired, "categoryTermId 為必填欄位。");

        if (f.TryGetProperty("authorDoctorId", out _)) a.AuthorDoctorId = JInt(f, "authorDoctorId");
        if (f.TryGetProperty("authorName", out _)) a.AuthorName = JStr(f, "authorName");
        if (f.TryGetProperty("reviewerDoctorId", out _)) a.ReviewerDoctorId = JInt(f, "reviewerDoctorId");
        if (f.TryGetProperty("reviewedOn", out _)) a.ReviewedOn = JDateOnly(f, "reviewedOn");

        if (JDateTime(f, "displayDate") is DateTime displayDate) a.DisplayDate = displayDate;
        else if (isCreate) a.DisplayDate = Clock.UtcNow; // 新建文章：對外顯示日期預設為現在（docs/08 §C-4）

        if (f.TryGetProperty("cover", out _)) a.Cover = JImage(f, "cover");

        if (f.TryGetProperty("bodyBlocks", out var bodyEl))
            a.BodyBlocks = bodyEl.ValueKind == JsonValueKind.Null ? null : bodyEl.GetRawText();

        if (f.TryGetProperty("readingMinutes", out _)) a.ReadingMinutes = JInt(f, "readingMinutes");

        if (JInt(f, "sourceSite") is int sourceSite) a.SourceSite = (ArticleSourceSite)sourceSite;
        else if (isCreate) a.SourceSite = ArticleSourceSite.MainSite; // 後台新建一律視為主站原生內容
    }

    // ── Case（docs/08 §C-5）────────────────────────────────────────────
    private static Dictionary<string, object?> BuildCaseFields(Case c) => new()
    {
        ["treatmentId"] = c.TreatmentId,
        ["sessionsText"] = c.SessionsText,
        ["narrative"] = c.Narrative,
        ["individualVarianceStatement"] = c.IndividualVarianceStatement,
        ["hasWrittenConsent"] = c.HasWrittenConsent,
        ["consentReference"] = c.ConsentReference,
        ["shootingConditions"] = c.ShootingConditions,
        ["images"] = c.Images.OrderBy(i => i.Phase).ThenBy(i => i.SortOrder).Select(i => new Dictionary<string, object?>
        {
            ["image"] = ImageFields(i.Image),
            ["phase"] = (byte)i.Phase,
            ["takenOn"] = i.TakenOn?.ToString("yyyy-MM-dd"),
            ["sortOrder"] = i.SortOrder,
        }).ToList(),
    };

    private static void ApplyCaseFields(Case c, JsonElement f, bool isCreate)
    {
        if (JInt(f, "treatmentId") is int treatmentId) c.TreatmentId = treatmentId;
        else if (isCreate) throw AppException.BadRequest(ErrorCodes.ValidationRequired, "treatmentId 為必填欄位。");

        if (f.TryGetProperty("sessionsText", out _)) c.SessionsText = JStr(f, "sessionsText");
        if (f.TryGetProperty("narrative", out _)) c.Narrative = JStr(f, "narrative");

        // 🔴 四個法規揭露欄位一律 NOT NULL 且不得為空字串（docs/08 §C-5）：建立時必填；
        //    更新時若省略則保留原值，避免表單漏帶欄位而靜默清空法遵資料。
        var statement = JStr(f, "individualVarianceStatement");
        if (statement is { Length: > 0 }) c.IndividualVarianceStatement = statement;
        else if (isCreate) throw AppException.BadRequest(ErrorCodes.ValidationRequired, "individualVarianceStatement 為必填欄位。");

        if (JBool(f, "hasWrittenConsent") is bool consent) c.HasWrittenConsent = consent;
        else if (isCreate) throw AppException.BadRequest(ErrorCodes.ValidationRequired, "hasWrittenConsent 為必填欄位。");

        var consentRef = JStr(f, "consentReference");
        if (consentRef is { Length: > 0 }) c.ConsentReference = consentRef;
        else if (isCreate) throw AppException.BadRequest(ErrorCodes.ValidationRequired, "consentReference 為必填欄位。");

        var shooting = JStr(f, "shootingConditions");
        if (shooting is { Length: > 0 }) c.ShootingConditions = shooting;
        else if (isCreate) throw AppException.BadRequest(ErrorCodes.ValidationRequired, "shootingConditions 為必填欄位。");

        if (f.TryGetProperty("images", out var imagesEl) && imagesEl.ValueKind == JsonValueKind.Array)
        {
            c.Images.Clear();
            foreach (var img in imagesEl.EnumerateArray())
            {
                c.Images.Add(new CaseImage
                {
                    Image = RequireImage(img, "image"),
                    Phase = (CasePhase)img.GetProperty("phase").GetByte(),
                    TakenOn = JDateOnly(img, "takenOn"),
                    SortOrder = JInt(img, "sortOrder") ?? 0,
                });
            }
        }
    }

    // ── Faq（docs/08 §C-6）─────────────────────────────────────────────
    private static Dictionary<string, object?> BuildFaqFields(Faq f) => new()
    {
        ["categoryTermId"] = f.CategoryTermId,
        ["webAnswer"] = f.WebAnswer,
        ["aiAnswer"] = f.AiAnswer,
        ["lastReviewedOn"] = f.LastReviewedOn.ToString("yyyy-MM-dd"),
        ["reviewedBy"] = f.ReviewedBy,
    };

    private static void ApplyFaqFields(Faq faq, JsonElement f, bool isCreate)
    {
        if (JInt(f, "categoryTermId") is int categoryTermId) faq.CategoryTermId = categoryTermId;
        else if (isCreate) throw AppException.BadRequest(ErrorCodes.ValidationRequired, "categoryTermId 為必填欄位。");

        var webAnswer = JStr(f, "webAnswer");
        if (webAnswer is { Length: > 0 }) faq.WebAnswer = webAnswer;
        else if (isCreate) throw AppException.BadRequest(ErrorCodes.ValidationRequired, "webAnswer 為必填欄位。");

        var aiAnswer = JStr(f, "aiAnswer");
        if (aiAnswer is { Length: > 0 })
        {
            if (aiAnswer.Length > 500) throw AppException.BadRequest(ErrorCodes.ValidationRange, "aiAnswer 長度不可超過 500 字。");
            faq.AiAnswer = aiAnswer;
        }
        else if (isCreate)
        {
            throw AppException.BadRequest(ErrorCodes.ValidationRequired, "aiAnswer 為必填欄位——它是 FAQPage JSON-LD 與 AI 語料匯出的唯一來源。");
        }

        if (JDateOnly(f, "lastReviewedOn") is DateOnly lastReviewedOn) faq.LastReviewedOn = lastReviewedOn;
        else if (isCreate) faq.LastReviewedOn = DateOnly.FromDateTime(Clock.UtcNow);

        if (f.TryGetProperty("reviewedBy", out _)) faq.ReviewedBy = JStr(f, "reviewedBy");
    }

    // ── Clinic（docs/08 §C-7）──────────────────────────────────────────
    private static Dictionary<string, object?> BuildClinicFields(Clinic c) => new()
    {
        ["address"] = c.Address,
        ["phone"] = c.Phone,
        ["lineUrl"] = c.LineUrl,
        ["latitude"] = c.Latitude,
        ["longitude"] = c.Longitude,
        ["mapUrl"] = c.MapUrl,
        ["transportInfo"] = c.TransportInfo,
        ["intro"] = c.Intro,
        ["businessHours"] = c.BusinessHours.OrderBy(h => h.DayOfWeek).ThenBy(h => h.SortOrder).Select(h => new Dictionary<string, object?>
        {
            ["dayOfWeek"] = h.DayOfWeek,
            ["startTime"] = h.StartTime.ToString("HH:mm"),
            ["endTime"] = h.EndTime.ToString("HH:mm"),
            ["sortOrder"] = h.SortOrder,
        }).ToList(),
        ["photos"] = c.Photos.OrderBy(p => p.SortOrder).Select(p => new Dictionary<string, object?>
        {
            ["image"] = ImageFields(p.Image),
            ["caption"] = p.Caption,
            ["sortOrder"] = p.SortOrder,
        }).ToList(),
    };

    private static void ApplyClinicFields(Clinic c, JsonElement f, bool isCreate)
    {
        var address = JStr(f, "address");
        if (address is { Length: > 0 }) c.Address = address;
        else if (isCreate) throw AppException.BadRequest(ErrorCodes.ValidationRequired, "address 為必填欄位。");

        var phone = JStr(f, "phone");
        if (phone is { Length: > 0 }) c.Phone = phone;
        else if (isCreate) throw AppException.BadRequest(ErrorCodes.ValidationRequired, "phone 為必填欄位。");

        if (f.TryGetProperty("lineUrl", out _)) c.LineUrl = JStr(f, "lineUrl");

        if (JDecimal(f, "latitude") is decimal lat) c.Latitude = lat;
        else if (isCreate) throw AppException.BadRequest(ErrorCodes.ValidationRequired, "latitude 為必填欄位。");

        if (JDecimal(f, "longitude") is decimal lng) c.Longitude = lng;
        else if (isCreate) throw AppException.BadRequest(ErrorCodes.ValidationRequired, "longitude 為必填欄位。");

        if (f.TryGetProperty("mapUrl", out _)) c.MapUrl = JStr(f, "mapUrl");
        if (f.TryGetProperty("transportInfo", out _)) c.TransportInfo = JStr(f, "transportInfo");
        if (f.TryGetProperty("intro", out _)) c.Intro = JStr(f, "intro");

        if (f.TryGetProperty("businessHours", out var hoursEl) && hoursEl.ValueKind == JsonValueKind.Array)
        {
            c.BusinessHours.Clear();
            foreach (var h in hoursEl.EnumerateArray())
            {
                c.BusinessHours.Add(new ClinicBusinessHour
                {
                    DayOfWeek = h.GetProperty("dayOfWeek").GetByte(),
                    StartTime = TimeOnly.Parse(h.GetProperty("startTime").GetString()!, CultureInfo.InvariantCulture),
                    EndTime = TimeOnly.Parse(h.GetProperty("endTime").GetString()!, CultureInfo.InvariantCulture),
                    SortOrder = JInt(h, "sortOrder") ?? 0,
                });
            }
        }

        if (f.TryGetProperty("photos", out var photosEl) && photosEl.ValueKind == JsonValueKind.Array)
        {
            c.Photos.Clear();
            foreach (var p in photosEl.EnumerateArray())
            {
                c.Photos.Add(new ClinicPhoto
                {
                    Image = RequireImage(p, "image"),
                    Caption = JStr(p, "caption"),
                    SortOrder = JInt(p, "sortOrder") ?? 0,
                });
            }
        }
    }

    // ── Page（docs/08 §C-8）────────────────────────────────────────────
    private static Dictionary<string, object?> BuildPageFields(Page p) => new()
    {
        ["pageKind"] = (byte)p.PageKind,
        ["systemKey"] = p.SystemKey,
        ["lead"] = p.Lead,
        ["bodyBlocks"] = p.BodyBlocks,
        ["cover"] = ImageFields(p.Cover),
        ["listSortRule"] = p.ListSortRule,
        ["pageSize"] = p.PageSize,
        ["superAdminOnly"] = p.SuperAdminOnly,
    };

    private static void ApplyPageFields(Page p, JsonElement f)
    {
        // ⚠️ pageKind／systemKey／superAdminOnly 不經此路徑改變：系統頁與法務頁的鎖定屬性
        //    由種子資料建立，CreateAsync 已強制新頁一律 PageKind.Free、SuperAdminOnly=false（docs/02 §1）。
        if (f.TryGetProperty("lead", out _)) p.Lead = JStr(f, "lead");
        if (f.TryGetProperty("bodyBlocks", out var bodyEl))
            p.BodyBlocks = bodyEl.ValueKind == JsonValueKind.Null ? null : bodyEl.GetRawText();
        if (f.TryGetProperty("cover", out _)) p.Cover = JImage(f, "cover");

        if (p.PageKind == PageKind.System)
        {
            if (f.TryGetProperty("listSortRule", out var sortRuleEl))
                p.ListSortRule = sortRuleEl.ValueKind == JsonValueKind.Null ? null : (byte)sortRuleEl.GetInt32();
            if (f.TryGetProperty("pageSize", out _)) p.PageSize = JInt(f, "pageSize");
        }
    }

    // ── Term（docs/08 §C-9）────────────────────────────────────────────
    private static Dictionary<string, object?> BuildTermFields(Term t) => new()
    {
        ["termType"] = (byte)t.TermType,
        ["intro"] = t.Intro,
        ["cover"] = ImageFields(t.Cover),
    };

    private static void ApplyTermFields(Term t, JsonElement f)
    {
        // ⚠️ termType 建立後不可修改：分類是 URL 結構的一部分（docs/08 §C-9），
        //    CreateAsync 已在建構實體前就決定並設好 TermType。
        if (f.TryGetProperty("intro", out _)) t.Intro = JStr(f, "intro");
        if (f.TryGetProperty("cover", out _)) t.Cover = JImage(f, "cover");
    }

    // ════════════════════════════════════════════════════════════════════
    // 8. 內嵌圖片欄位與舊檔清除（docs/08 §0 決策五、docs/11 §9）
    // ════════════════════════════════════════════════════════════════════

    /// <summary>公開圖片容器。上傳只收圖片，只進這一個容器（<see cref="UploadHandler"/>）。</summary>
    private string PublicContainer => configuration["BLOB_PUBLIC_CONTAINER"] ?? "media";

    /// <summary>把內嵌圖片輸出成欄位 JSON。<c>null</c> 代表這個欄位沒有圖。</summary>
    private static Dictionary<string, object?>? ImageFields(UploadedImage? i) => i is null ? null : new()
    {
        ["blobPath"] = i.BlobPath,
        ["url"] = i.Url,
        ["alt"] = i.Alt,
        ["width"] = i.Width,
        ["height"] = i.Height,
        ["variants"] = i.Variants,
    };

    /// <summary>
    /// 讀一個可為空的圖片欄位：<c>null</c>／不是物件都當成「這個欄位沒有圖」。
    /// ⚠️ 呼叫端必須先 <c>TryGetProperty</c> 確認欄位有送，否則沒送的欄位會被當成要清空。
    /// </summary>
    private static UploadedImage? JImage(JsonElement f, string name)
        => f.TryGetProperty(name, out var el) && el.ValueKind == JsonValueKind.Object
            ? ReadImage(el, name)
            : null;

    /// <summary>讀圖庫明細列上的圖片：那一列的存在理由就是這張圖，缺了就是壞資料。</summary>
    private static UploadedImage RequireImage(JsonElement row, string name)
        => row.TryGetProperty(name, out var el) && el.ValueKind == JsonValueKind.Object
            ? ReadImage(el, name)
            : throw AppException.BadRequest(ErrorCodes.ValidationRequired, $"圖庫明細缺少 {name}。");

    /// <summary>
    /// ⚠️ <c>url</c> 與 <c>blobPath</c> 都必填，且必須原封不動來自
    /// <c>POST /admin/upload/commit</c> 的回傳值——前端不自行拼字串。
    /// 少了 <c>blobPath</c>，這張圖被換掉時就找不到檔案可刪（docs/11 §9）。
    /// </summary>
    private static UploadedImage ReadImage(JsonElement el, string name)
    {
        var url = JStr(el, "url");
        var blobPath = JStr(el, "blobPath");

        if (string.IsNullOrWhiteSpace(url) || string.IsNullOrWhiteSpace(blobPath))
            throw AppException.BadRequest(ErrorCodes.ValidationRequired, $"{name} 缺少 url 或 blobPath。");

        return new UploadedImage
        {
            Url = url,
            BlobPath = blobPath,
            Alt = JStr(el, "alt"),
            Width = JInt(el, "width"),
            Height = JInt(el, "height"),
            Variants = JStr(el, "variants"),
        };
    }

    /// <summary>
    /// 這一筆內容目前引用到的所有 blob 路徑。
    /// <para>
    /// ⚠️ <b>必須涵蓋 <c>BodyBlocks</c> 內文裡的插圖</b>，不是只有具名的圖片欄位——
    /// 漏了就會把正在用的內文插圖判成孤兒刪掉（docs/11 §9）。內文是自由形狀的區塊 JSON，
    /// 所以用走訪的方式撈出所有 <c>blobPath</c>，不預設區塊長什麼樣。
    /// </para>
    /// </summary>
    private static List<string> CollectBlobPaths(ContentItem entity)
    {
        var paths = new List<string>();

        void Add(UploadedImage? image)
        {
            if (image is { BlobPath.Length: > 0 }) paths.Add(image.BlobPath);
        }

        Add(entity.Seo?.OgImage);

        switch (entity)
        {
            case Treatment t:
                Add(t.Cover);
                foreach (var i in t.Images) Add(i.Image);
                break;
            case Doctor d:
                Add(d.Photo);
                break;
            case Concern c:
                Add(c.Cover);
                break;
            case Article a:
                Add(a.Cover);
                CollectBlobPathsFromJson(a.BodyBlocks, paths);
                break;
            case Case cs:
                foreach (var i in cs.Images) Add(i.Image);
                break;
            case Clinic cl:
                foreach (var photo in cl.Photos) Add(photo.Image);
                break;
            case Page pg:
                Add(pg.Cover);
                CollectBlobPathsFromJson(pg.BodyBlocks, paths);
                break;
            case Term tm:
                Add(tm.Cover);
                break;
        }

        return paths;
    }

    private static void CollectBlobPathsFromJson(string? json, List<string> into)
    {
        if (string.IsNullOrWhiteSpace(json)) return;

        try
        {
            using var doc = JsonDocument.Parse(json);
            Walk(doc.RootElement);
        }
        catch (JsonException)
        {
            // 內文不是合法 JSON 就當它沒有圖。⚠️ 這裡寧可少刪也不要多刪——
            // 判斷失準的代價是留下孤兒檔，反過來則是把正在用的圖刪掉。
        }

        void Walk(JsonElement el)
        {
            switch (el.ValueKind)
            {
                case JsonValueKind.Object:
                    foreach (var prop in el.EnumerateObject())
                    {
                        if (prop.NameEquals("blobPath") && prop.Value.ValueKind == JsonValueKind.String)
                        {
                            var value = prop.Value.GetString();
                            if (!string.IsNullOrWhiteSpace(value)) into.Add(value);
                        }
                        else Walk(prop.Value);
                    }
                    break;
                case JsonValueKind.Array:
                    foreach (var item in el.EnumerateArray()) Walk(item);
                    break;
            }
        }
    }

    /// <summary>
    /// 存檔後把「換掉或移除、已經沒有欄位指向它」的檔案從 Blob 刪掉（docs/11 §9）。
    /// <para>
    /// 🔴 <b>順序不可顛倒：資料庫先存成功，才動實體檔案。</b> 反過來的話存檔失敗會留下
    /// 「紀錄還在、檔案已經沒了」的斷鏈，比孤兒檔案更糟。
    /// </para>
    /// <para>
    /// ⚠️ <b>刪不掉不要往外丟例外</b>：內容已經存好了，清檔失敗只該留下孤兒檔與一筆告警，
    /// 不該讓使用者看到一個失敗的存檔。
    /// </para>
    /// <para>
    /// ⚠️ 連帶後果：<b>版本還原救不回已經被刪掉的圖片</b>。還原只還原記錄，
    /// 舊版快照裡指向的檔案若當時已被換掉，那個 URL 就是 404（docs/11 §8、§9）。
    /// </para>
    /// </summary>
    private async Task DeleteUnreferencedBlobsAsync(
        IReadOnlyCollection<string> before, IReadOnlyCollection<string> after, CancellationToken ct)
    {
        var orphans = before.Except(after, StringComparer.Ordinal).Distinct(StringComparer.Ordinal).ToList();
        if (orphans.Count == 0) return;

        // ⚠️ 這段跑在存檔交易之後、回應之前，所以要有上限。實測過：儲存體連不上時
        // Azure SDK 的重試會讓一次 DeleteIfExists 卡數十秒，兩個檔案就把一個存檔請求
        // 拖成近一分鐘。清檔不是使用者等待的理由——逾時就放掉，留孤兒檔給對帳工具。
        using var cleanup = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cleanup.CancelAfter(CleanupBudget);

        foreach (var path in orphans)
        {
            try
            {
                await blobStorage.DeleteAsync(PublicContainer, path, cleanup.Token);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "換圖後刪除舊檔失敗，留下孤兒檔：{Container}/{BlobPath}", PublicContainer, path);
            }
        }
    }

    /// <summary>一次存檔用在清除舊檔上的時間上限，見 <see cref="DeleteUnreferencedBlobsAsync"/>。</summary>
    private static readonly TimeSpan CleanupBudget = TimeSpan.FromSeconds(15);
}
