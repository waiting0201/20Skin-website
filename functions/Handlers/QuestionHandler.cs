using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Skin20.Api.Common;
using Skin20.Api.Data;
using Skin20.Api.Models.Dtos;
using Skin20.Api.Models.Entities;
using Skin20.Api.Services;
using Skin20.Api.Services.Dapper;

namespace Skin20.Api.Handlers;

/// <summary>
/// docs/10 §3.4：未命中題目清單。
/// 🔴 <b>這是題庫成長的工作清單，不是搜尋日誌</b>（docs/08 §F）：同一句話只有一列，
/// 重複出現只累加 <c>HitCount</c>；處理完就結案。不記錄誰在什麼時候搜的、不記 IP、不記 session。
/// ⚠️ <c>Source = 3</c>（聯絡表單提問）只存問題文字本身，本 Handler 完全不碰姓名／電話／email。
///
/// <para>
/// ⚠️ 分層鐵律（docs/11 §2）：Handler 內<b>禁止直接寫 SQL</b> —— 讀走 Dapper ReadService、
/// 寫走 <c>Skin20DbContext</c>；<b>禁止重複檢查權限碼</b> —— 授權集中在 <c>AppRouter</c>，
/// 唯一例外是資料列擁有者判定（§5.4，本單元不適用）。
/// </para>
/// </summary>
public sealed class QuestionHandler(Skin20DbContext db, ISqlConnectionFactory sqlFactory)
{
    // 與 RedirectHandler 相同的取捨：不動 Program.cs，直接組裝這個無狀態的 ReadService
    // （只依賴已註冊的 Singleton ISqlConnectionFactory）。
    private readonly IQuestionReadService reads = new QuestionReadService(sqlFactory);

    public async Task<IActionResult> ListAsync(HttpRequest req)
    {
        var page = Paging.Page(req.Query["page"]);
        var pageSize = Paging.PageSize(req.Query["pageSize"]);
        var keyword = req.Query["keyword"].FirstOrDefault();

        byte? status = null;
        if (byte.TryParse(req.Query["status"].FirstOrDefault(), out var parsedStatus))
            status = parsedStatus;

        var (items, total) = await reads.ListAsync(status, keyword, page, pageSize, req.HttpContext.RequestAborted);

        return new OkObjectResult(ApiResponse.Ok(Paging.Build(items, total, page, pageSize)));
    }

    /// <summary>
    /// 標記處理結果：<c>Status=2</c>（已建題）需回填 <c>LinkedFaqContentItemId</c>；
    /// <c>Status=3</c>（忽略）則清空該欄；<c>Status=1</c>（改回待處理）也清空，代表決定被撤銷。
    /// </summary>
    public async Task<IActionResult> UpdateAsync(HttpRequest req, string id)
    {
        if (!int.TryParse(id, out var questionId))
            throw AppException.NotFound("題目");

        var ct = req.HttpContext.RequestAborted;
        var entity = await db.QuestionInboxItems.FindAsync([questionId], ct)
            ?? throw AppException.NotFound("題目");

        var body = await req.ReadFromJsonAsync<QuestionUpdateRequest>()
            ?? throw AppException.BadRequest(ErrorCodes.ValidationRequired, "缺少請求內容。");

        if (body.Status is not byte statusValue || !Enum.IsDefined((QuestionStatus)statusValue))
            throw AppException.BadRequest(ErrorCodes.ValidationRequired, "status 為必填，且須為 1（待處理）／2（已建題）／3（忽略）之一。");

        var status = (QuestionStatus)statusValue;

        if (status == QuestionStatus.Created)
        {
            if (body.LinkedFaqContentItemId is not int faqId)
                throw AppException.BadRequest(ErrorCodes.ValidationRequired, "標記為已建題時，linkedFaqContentItemId 為必填。");

            if (!await reads.IsFaqContentItemAsync(faqId, ct))
                throw AppException.NotFound("FAQ 內容");

            entity.LinkedFaqContentItemId = faqId;
            entity.HandledByUserId = RequestContext.UserId(req);
            entity.HandledAt = Clock.UtcNow;
        }
        else if (status == QuestionStatus.Ignored)
        {
            entity.LinkedFaqContentItemId = null;
            entity.HandledByUserId = RequestContext.UserId(req);
            entity.HandledAt = Clock.UtcNow;
        }
        else // Pending：撤銷先前的處理決定
        {
            entity.LinkedFaqContentItemId = null;
            entity.HandledByUserId = null;
            entity.HandledAt = null;
        }

        entity.Status = status;

        await db.SaveChangesAsync(ct);

        return new OkObjectResult(ApiResponse.Ok("更新成功。"));
    }

    public async Task<IActionResult> DeleteAsync(string id)
    {
        if (!int.TryParse(id, out var questionId))
            throw AppException.NotFound("題目");

        var entity = await db.QuestionInboxItems.FindAsync(questionId)
            ?? throw AppException.NotFound("題目");

        db.QuestionInboxItems.Remove(entity);
        await db.SaveChangesAsync();

        return new OkObjectResult(ApiResponse.Ok("刪除成功。"));
    }
}
