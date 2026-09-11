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
/// docs/10 §3.4：導覽選單與頁尾。
/// ⚠️ `booking.20skin.tw` 與 `20skinshop.com` 在這裡，**而且只在這裡**（CLAUDE.md 決策 4）。
///
/// <para>
/// 設計取捨：<c>PUT</c> 對每個有提供的選單（<c>main</c>／<c>footer</c>）採<b>整棵樹整批替換</b>——
/// 刪掉該選單既有的所有列、依請求內容整批重建。選單只有十餘列、樹狀結構淺，整批替換比
/// 「逐節點比對新增／搬移／刪除」簡單可靠得多，也不需要處理「新節點還沒有資料庫 Id 時
/// 子節點要指向哪個父層」的問題——巢狀 JSON 直接對應 EF 的 <c>Children</c> 導覽屬性，
/// 由 EF 在 <c>SaveChanges</c> 時自動處理外鍵。
/// </para>
///
/// <para>
/// ⚠️ 分層鐵律（docs/11 §2）：Handler 內<b>禁止直接寫 SQL</b> —— 讀走 Dapper ReadService、
/// 寫走 <c>Skin20DbContext</c>；<b>禁止重複檢查權限碼</b> —— 授權集中在 <c>AppRouter</c>，
/// 唯一例外是資料列擁有者判定（§5.4）。
/// </para>
/// </summary>
public sealed class MenuHandler(Skin20DbContext db, ISqlConnectionFactory sqlFactory, IRebuildService rebuild)
{
    private readonly MenuReadService reads = new(sqlFactory);

    private const string MenuKeyMain = "main";
    private const string MenuKeyFooter = "footer";

    /// <summary>外部連結預設的 <c>rel</c>（docs/08 §G-3 種子資料同一套值）。</summary>
    private const string DefaultExternalRel = "noopener external";

    public async Task<IActionResult> GetAsync()
    {
        var tree = await reads.GetTreeAsync(CancellationToken.None);
        return new OkObjectResult(ApiResponse.Ok(tree));
    }

    public async Task<IActionResult> UpdateAsync(HttpRequest req)
    {
        var ct = req.HttpContext.RequestAborted;

        var dto = await req.ReadFromJsonAsync<MenuTreeDto>(ct)
            ?? throw AppException.BadRequest(ErrorCodes.ValidationRequired, "缺少請求內容。");

        if (dto.Main is null && dto.Footer is null)
            throw AppException.BadRequest(ErrorCodes.ValidationRequired, "沒有要更新的選單內容。");

        var referencedContentIds = new List<int>();
        if (dto.Main is not null) CollectContentItemIds(dto.Main, referencedContentIds);
        if (dto.Footer is not null) CollectContentItemIds(dto.Footer, referencedContentIds);

        if (referencedContentIds.Count > 0)
        {
            var existingIds = await reads.FilterExistingContentItemIdsAsync(referencedContentIds, ct);
            var missing = referencedContentIds.Where(id => !existingIds.Contains(id)).Distinct().ToArray();
            if (missing.Length > 0)
                throw AppException.BadRequest(
                    ErrorCodes.ValidationFormat, $"以下內容不存在，無法加入選單：{string.Join("、", missing)}");
        }

        var newMain = dto.Main?.Select((node, i) => BuildNode(MenuKeyMain, node, 1, i + 1)).ToList();
        var newFooter = dto.Footer?.Select((node, i) => BuildNode(MenuKeyFooter, node, 1, i + 1)).ToList();

        var strategy = db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);

            if (newMain is not null)
            {
                var existing = await db.MenuItems.Where(m => m.MenuKey == MenuKeyMain).ToListAsync(ct);
                db.MenuItems.RemoveRange(existing);
                await db.MenuItems.AddRangeAsync(newMain, ct);
            }

            if (newFooter is not null)
            {
                var existing = await db.MenuItems.Where(m => m.MenuKey == MenuKeyFooter).ToListAsync(ct);
                db.MenuItems.RemoveRange(existing);
                await db.MenuItems.AddRangeAsync(newFooter, ct);
            }

            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        });

        // 選單烘進每一頁的預渲染 HTML（Nuxt 純靜態），改了就要重建（docs/11 §10）。
        await rebuild.RequestAsync(ct);

        var updated = await reads.GetTreeAsync(ct);
        return new OkObjectResult(ApiResponse.Ok(updated, "已更新選單。"));
    }

    private static MenuItem BuildNode(string menuKey, MenuNodeDto node, byte depth, int sortOrder)
    {
        if (string.IsNullOrWhiteSpace(node.Label))
            throw AppException.BadRequest(ErrorCodes.ValidationRequired, "選單項目缺少名稱。");

        ValidateLinkTarget(node);

        // 🔴 強制標記為外部連結：新分頁、rel 設定（docs/02 §3）——不管前端有沒有勾選。
        var isExternal = node.LinkKind == MenuLinkKind.ExternalUrl;

        var entity = new MenuItem
        {
            MenuKey = menuKey,
            Depth = depth,
            Label = node.Label,
            LinkKind = node.LinkKind,
            ContentItemId = node.LinkKind == MenuLinkKind.ContentItem ? node.ContentItemId : null,
            Url = node.LinkKind == MenuLinkKind.ContentItem ? null : node.Url,
            IsExternal = isExternal,
            RelAttr = isExternal
                ? (string.IsNullOrWhiteSpace(node.RelAttr) ? DefaultExternalRel : node.RelAttr)
                : node.RelAttr,
            OpenInNewTab = isExternal || node.OpenInNewTab,
            SortOrder = sortOrder,
        };

        if (node.Children.Count > 0)
        {
            // CHECK (Depth IN (1, 2))（docs/08 §G-3）——最多兩層，第二層不能再有子節點。
            if (depth >= 2)
                throw AppException.BadRequest(ErrorCodes.ValidationFormat, $"「{node.Label}」已經是選單最深層，不能再有子項目。");

            var childSort = 1;
            foreach (var child in node.Children)
                entity.Children.Add(BuildNode(menuKey, child, (byte)(depth + 1), childSort++));
        }

        return entity;
    }

    private static void ValidateLinkTarget(MenuNodeDto node)
    {
        switch (node.LinkKind)
        {
            case MenuLinkKind.ContentItem when node.ContentItemId is null:
                throw AppException.BadRequest(ErrorCodes.ValidationRequired, $"「{node.Label}」缺少要連結的內容。");
            case MenuLinkKind.InternalPath or MenuLinkKind.ExternalUrl when string.IsNullOrWhiteSpace(node.Url):
                throw AppException.BadRequest(ErrorCodes.ValidationRequired, $"「{node.Label}」缺少連結網址。");
        }
    }

    private static void CollectContentItemIds(IEnumerable<MenuNodeDto> nodes, List<int> into)
    {
        foreach (var node in nodes)
        {
            if (node.LinkKind == MenuLinkKind.ContentItem && node.ContentItemId is { } id)
                into.Add(id);

            if (node.Children.Count > 0)
                CollectContentItemIds(node.Children, into);
        }
    }
}
