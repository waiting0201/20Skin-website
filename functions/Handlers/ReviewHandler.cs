using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Skin20.Api.Common;
using Skin20.Api.Data;
using Skin20.Api.Models.Dtos;
using Skin20.Api.Models.Entities;
using Skin20.Api.Services;
using Skin20.Api.Services.Dapper;

namespace Skin20.Api.Handlers;

/// <summary>
/// docs/10 §3.4：審核佇列。
/// ⚠️ **核准即 Status=3**，不管 PublishAt 有沒有到（docs/11 §7）。
/// ⚠️ **退回必填原因**，且**不寄信** —— 改由儀表板待辦清單呈現（docs/08 §B-3）。
///
/// <para>
/// ⚠️ 分層鐵律（docs/11 §2）：Handler 內<b>禁止直接寫 SQL</b> —— 讀走 Dapper ReadService、
/// 寫走 <c>Skin20DbContext</c>；<b>禁止重複檢查權限碼</b> —— 授權集中在 <c>AppRouter</c>，
/// 唯一例外是資料列擁有者判定（§5.4）。
/// </para>
///
/// <para>
/// ⚠️ 已回報：<c>ContentReviews</c> 沒有「指派的審核者」欄位，docs/02 §4 提到醫師
/// 「可對指派內容執行醫學審閱」，但 schema（docs/08 §B-3）未提供指派對象的欄位——
/// 本檔因此不做擁有者層級的審核限制，凡持有 <c>review.approve</c>／<c>review.reject</c>
/// 權限者可決定任何一筆待審單，權限判定完全交給 Router。
/// </para>
/// </summary>
public sealed class ReviewHandler(
    Skin20DbContext db,
    ISqlConnectionFactory sqlFactory)
{
    private readonly ReviewReadService _read = new(sqlFactory);

    public async Task<IActionResult> ListPendingAsync(HttpRequest req)
    {
        var page = Paging.Page(req.Query["page"]);
        var pageSize = Paging.PageSize(req.Query["pageSize"]);
        var ct = req.HttpContext.RequestAborted;

        var (rows, total) = await _read.ListPendingAsync(page, pageSize, ct);
        var items = rows.Select(ToDto).ToList();

        return new OkObjectResult(ApiResponse.Ok(Paging.Build(items, total, page, pageSize)));
    }

    public async Task<IActionResult> ApproveAsync(HttpRequest req, string id)
    {
        var reviewId = ParseId(id);
        var ct = req.HttpContext.RequestAborted;

        var review = await db.ContentReviews.FirstOrDefaultAsync(r => r.Id == reviewId, ct)
            ?? throw AppException.NotFound("送審單");
        if (review.Status != ReviewStatus.Pending)
            throw AppException.Conflict(ErrorCodes.ConflictState, "此送審單已被處理，無法重複核准。");

        var contentItem = await db.ContentItems.FirstOrDefaultAsync(ci => ci.Id == review.ContentItemId, ct)
            ?? throw AppException.NotFound("內容");

        var userId = RequestContext.UserId(req);
        var now = Clock.UtcNow;

        review.Status = ReviewStatus.Approved;
        review.DecidedByUserId = userId;
        review.DecidedAt = now;

        // 🔴 核准即 Status=3，不管 PublishAt 有沒有到；前台可見性另由查詢條件決定（docs/11 §7 規則 1）。
        contentItem.Status = ContentStatus.Published;
        contentItem.PublishedVersionId = review.VersionId;
        contentItem.UpdatedByUserId = userId;
        contentItem.UpdatedAt = now;

        await db.SaveChangesAsync(ct);


        return new OkObjectResult(ApiResponse.Ok<object?>(null));
    }

    public async Task<IActionResult> RejectAsync(HttpRequest req, string id)
    {
        var reviewId = ParseId(id);
        var ct = req.HttpContext.RequestAborted;

        var body = await ReadJsonAsync<RejectRequest>(req, ct);
        if (string.IsNullOrWhiteSpace(body.DecisionNote))
            throw AppException.BadRequest(ErrorCodes.ValidationRequired, "退回必須填寫原因（decisionNote）。");

        var review = await db.ContentReviews.FirstOrDefaultAsync(r => r.Id == reviewId, ct)
            ?? throw AppException.NotFound("送審單");
        if (review.Status != ReviewStatus.Pending)
            throw AppException.Conflict(ErrorCodes.ConflictState, "此送審單已被處理，無法重複退回。");

        var contentItem = await db.ContentItems.FirstOrDefaultAsync(ci => ci.Id == review.ContentItemId, ct)
            ?? throw AppException.NotFound("內容");

        var userId = RequestContext.UserId(req);
        var now = Clock.UtcNow;

        review.Status = ReviewStatus.Rejected;
        review.DecisionNote = body.DecisionNote;
        review.DecidedByUserId = userId;
        review.DecidedAt = now;

        // 退回 → 回草稿（docs/11 §7 狀態圖）。⚠️ 不寄信——退回通知改由儀表板待辦清單呈現，
        // 查 ContentReviews WHERE Status=3 AND SubmittedByUserId=@me（docs/08 §B-3）。
        contentItem.Status = ContentStatus.Draft;
        contentItem.UpdatedByUserId = userId;
        contentItem.UpdatedAt = now;

        await db.SaveChangesAsync(ct);

        return new OkObjectResult(ApiResponse.Ok<object?>(null));
    }

    /// <summary>⚠️ 重建失敗不得讓審核操作失敗——狀態已經改好，重建失敗要獨立告警（docs/11 §10）。</summary>

    private static ReviewQueueItemDto ToDto(ReviewQueueRow r) => new(
        r.Id, r.ContentItemId, UnitFromContentType(r.ContentType), r.Title, r.UrlPath,
        r.VersionId, r.VersionNo, r.SubmittedByUserId, r.SubmittedByName, r.SubmittedAt,
        ParseRiskFlags(r.RiskFlags));

    /// <summary>送審時掃出的高風險字詞（docs/02 §5）：只取字詞本身供審核者一眼掃過，不阻擋核准／退回。</summary>
    internal static string[] ParseRiskFlags(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];
        try
        {
            using var doc = JsonDocument.Parse(json);
            return doc.RootElement.EnumerateArray()
                .Select(e => e.TryGetProperty("term", out var t) ? t.GetString() : null)
                .OfType<string>()
                .ToArray();
        }
        catch (JsonException)
        {
            return [];
        }
    }

    internal static string UnitFromContentType(byte contentType) => (ContentType)contentType switch
    {
        ContentType.Treatment => UnitCodes.Treatment,
        ContentType.Doctor => UnitCodes.Doctor,
        ContentType.Concern => UnitCodes.Concern,
        ContentType.Article => UnitCodes.Article,
        ContentType.Case => UnitCodes.Case,
        ContentType.Faq => UnitCodes.Faq,
        ContentType.Clinic => UnitCodes.Clinic,
        ContentType.Page => UnitCodes.Page,
        ContentType.Term => UnitCodes.Term,
        _ => "unknown",
    };

    private static int ParseId(string id)
        => int.TryParse(id, out var n) ? n : throw AppException.BadRequest(ErrorCodes.ValidationFormat, "識別碼格式錯誤。");

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
}
