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
/// docs/10 §3.4：首頁版位編排。
/// 🔴 **只能引用既有內容，不收自由文案**（docs/02 §3）—— 這是舊站 index2.php 的病根。
/// schema 本身就沒有文案欄位（docs/08 §G-2），這裡不要繞過它。
///
/// <para>
/// ⚠️ <b>已知缺口（已於交付報告中回報，未自行另寫一套）</b>：docs/08 §G-2 與 docs/11 §8
/// 要求版位編排的送審與版本歷程掛在 <c>SystemKey='home'</c> 的 <c>ContentItem</c> 上，
/// 快照時把 <c>HomeSections</c>／<c>HomeSectionItems</c> 序列化進 <c>ContentVersions.Snapshot</c>。
/// 這套版本快照機制屬於 <c>ContentHandler</c> 那組負責、本次交付時尚未存在可呼叫的服務，
/// 因此本檔案目前是<b>直接寫入</b>，未經草稿／送審／核准流程。等該服務就緒後，
/// <see cref="UpdateAsync"/> 寫入 <c>HomeSections</c>／<c>HomeSectionItems</c> 的段落
/// 需要改為「寫草稿版本 → 走 submit/approve → 核准後才落地」，並在核准時呼叫版本快照服務。
/// </para>
///
/// <para>
/// ⚠️ 分層鐵律（docs/11 §2）：Handler 內<b>禁止直接寫 SQL</b> —— 讀走 Dapper ReadService、
/// 寫走 <c>Skin20DbContext</c>；<b>禁止重複檢查權限碼</b> —— 授權集中在 <c>AppRouter</c>，
/// 唯一例外是資料列擁有者判定（§5.4）。
/// </para>
/// </summary>
public sealed class HomeSectionHandler(Skin20DbContext db, ISqlConnectionFactory sqlFactory, IRebuildService rebuild)
{
    private readonly HomeSectionReadService reads = new(sqlFactory);

    public async Task<IActionResult> GetAsync()
    {
        var sections = await reads.GetAllAsync(CancellationToken.None);
        return new OkObjectResult(ApiResponse.Ok(sections));
    }

    public async Task<IActionResult> UpdateAsync(HttpRequest req)
    {
        var ct = req.HttpContext.RequestAborted;

        var dto = await req.ReadFromJsonAsync<HomeSectionUpdateRequestDto>(ct)
            ?? throw AppException.BadRequest(ErrorCodes.ValidationRequired, "缺少請求內容。");

        if (dto.Sections is not { Count: > 0 })
            throw AppException.BadRequest(ErrorCodes.ValidationRequired, "至少要更新一個版位。");

        // 🔴 七個版位是種子資料，可停用、可排序，不可新增刪除（docs/08 §G-2）。
        var existingSections = await db.HomeSections
            .Include(s => s.Items)
            .ToListAsync(ct);
        var byKey = existingSections.ToDictionary(s => s.SectionKey);

        foreach (var section in dto.Sections)
        {
            if (!byKey.ContainsKey(section.SectionKey))
                throw AppException.BadRequest(
                    ErrorCodes.ValidationFormat, $"未知的版位：{section.SectionKey}（版位不可新增，只能編排既有七個）。");

            if (!string.IsNullOrWhiteSpace(section.Settings))
            {
                try
                {
                    using var _ = JsonDocument.Parse(section.Settings);
                }
                catch (JsonException)
                {
                    throw AppException.BadRequest(ErrorCodes.ValidationFormat, $"版位 {section.SectionKey} 的 settings 不是合法 JSON。");
                }
            }
        }

        // 每個版位只能挑選「已存在的內容」（docs/02 §3）——批次驗證，避免一筆一筆查資料庫。
        var allContentItemIds = dto.Sections.SelectMany(s => s.Items.Select(i => i.ContentItemId)).ToArray();
        var existingContentIds = await reads.FilterExistingContentItemIdsAsync(allContentItemIds, ct);
        var missingIds = allContentItemIds.Where(id => !existingContentIds.Contains(id)).Distinct().ToArray();
        if (missingIds.Length > 0)
            throw AppException.BadRequest(
                ErrorCodes.ValidationFormat, $"以下內容不存在，無法加入版位：{string.Join("、", missingIds)}");

        // HomeSections + HomeSectionItems 兩張表的多表寫入，包在交易裡（docs/11 §6.1）。
        var strategy = db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);

            foreach (var section in dto.Sections)
            {
                var entity = byKey[section.SectionKey];
                entity.IsEnabled = section.IsEnabled;
                entity.SortOrder = section.SortOrder;
                entity.Settings = section.Settings;

                db.HomeSectionItems.RemoveRange(entity.Items);
                entity.Items.Clear();
                foreach (var item in section.Items)
                {
                    entity.Items.Add(new HomeSectionItem
                    {
                        ContentItemId = item.ContentItemId,
                        SortOrder = item.SortOrder,
                    });
                }
            }

            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        });

        // 首頁組成變了，觸發重建（docs/11 §10）。RebuildService 內部已做聚合，失敗也不會拋出。
        await rebuild.RequestAsync(ct);

        var updated = await reads.GetAllAsync(ct);
        return new OkObjectResult(ApiResponse.Ok(updated, "已更新首頁版位。"));
    }
}
