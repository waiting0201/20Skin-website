using System.Net.Http.Headers;
using System.Net.Http.Json;
using Azure.Storage.Blobs;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Skin20.Api.Common;
using Skin20.Api.Models.Dtos;

namespace Skin20.Api.Services;

/// <summary>
/// 觸發全站重建（docs/11 §10）：SWA 沒有 ISR，內容變更一定要重跑 build，
/// 作法是呼叫 GitHub API 的 <c>repository_dispatch</c>。
///
/// <para>
/// ⚠️ <b>聚合策略是「前緣觸發＋冷卻期」，不是嚴格的尾端 debounce。</b>
/// 尾端 debounce（連續呼叫只在「安靜下來」之後的某個時間點真正觸發一次）需要一個
/// 延遲執行的機制（Durable Functions 的 delay，或另一支 Timer trigger）；
/// 本次交付的 Timer 只有 <c>ScheduledPublish</c>／<c>VersionPrune</c>／<c>ThrottleSweep</c>
/// 三支（docs/11 §11），沒有專門負責「補觸發」的 Timer，而 <c>Functions/**</c> 不在本組
/// 可修改的檔案範圍內，因此無法自行加一支。改用「第一次請求立刻觸發，之後冷卻期內的
/// 請求只記錄『有未觸發的異動』，等下一次任何呼叫方（含 <c>ScheduledPublish</c> 自己的
/// 15 分鐘輪詢）在冷卻期過後再呼叫一次時才會真正觸發」——已經足夠達成
/// 「連續發布 10 篇不觸發 10 次 build」，但極端情況下（冷卻期內是最後一次異動、
/// 之後很久沒有人再呼叫）該次異動要等到下一次任何操作觸發重建才會真正建置。
/// 已在交付報告中回報，若需要嚴格的尾端 debounce，需要新增一支 Timer trigger
/// （不在本組檔案範圍內）。
/// </para>
/// <para>
/// ⚠️ 窗口狀態存 Blob（一個小 JSON 檔），不用 <c>MemoryCache</c>——Flex Consumption
/// 是多執行個體，記憶體狀態互相看不到。
/// </para>
/// <para>⚠️ 失敗不 throw：內容狀態已經改好了，這裡只記錄錯誤，不讓呼叫端的流程整個重跑。</para>
/// </summary>
public sealed class RebuildService(
    BlobServiceClient blobServiceClient,
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration,
    ILogger<RebuildService> logger) : IRebuildService
{
    /// <summary>
    /// 聚合窗口（docs/11 §10：「聚合窗口內（3–5 分鐘）只保留一次待觸發」）。
    /// 讀 <c>Rebuild__AggregateWindowMinutes</c>（<c>local.settings.example.json</c> 已建立此鍵，
    /// 預設值 5），沒設定時退回 5 分鐘。
    /// </summary>
    private TimeSpan CooldownWindow => TimeSpan.FromMinutes(
        int.TryParse(configuration["Rebuild:AggregateWindowMinutes"], out var m) ? Math.Max(1, m) : 5);

    private const string StateContainerName = "system-state";
    private const string StateBlobPath = "rebuild-state.json";

    public async Task RequestAsync(CancellationToken ct = default)
    {
        try
        {
            var containerClient = blobServiceClient.GetBlobContainerClient(StateContainerName);
            await containerClient.CreateIfNotExistsAsync(cancellationToken: ct).ConfigureAwait(false);
            var blobClient = containerClient.GetBlobClient(StateBlobPath);

            var state = await ReadStateAsync(blobClient, ct).ConfigureAwait(false);
            var now = Clock.UtcNow;

            if (state.LastDispatchedAt is { } last && now - last < CooldownWindow)
            {
                // 冷卻期內：只記錄「還有異動沒有真正觸發」，不重複呼叫 GitHub API。
                await WriteStateAsync(blobClient, state with { PendingSince = state.PendingSince ?? now }, ct)
                    .ConfigureAwait(false);
                var cooldown = CooldownWindow;
                logger.LogInformation("重建請求已聚合，距上次觸發不到 {Minutes} 分鐘，暫不重複觸發。", cooldown.TotalMinutes);
                return;
            }

            var dispatched = await DispatchAsync(ct).ConfigureAwait(false);
            if (dispatched)
            {
                await WriteStateAsync(blobClient, new RebuildState(now, null), ct).ConfigureAwait(false);
            }
            else
            {
                // 觸發失敗：不更新 LastDispatchedAt，讓下一次呼叫可以立刻重試，
                // 而不是被冷卻期擋住（失敗不該比成功還難重試）。
                await WriteStateAsync(blobClient, state with { PendingSince = state.PendingSince ?? now }, ct)
                    .ConfigureAwait(false);
            }
        }
        catch (Exception ex)
        {
            // ⚠️ 重建失敗（含窗口狀態的 Blob I/O 失敗）不能讓呼叫端的內容狀態轉換跟著失敗
            // 或重跑一次——這裡只獨立記錄錯誤（docs/11 §10 第 2 條）。
            logger.LogError(ex, "觸發重建流程發生未預期錯誤。");
        }
    }

    /// <inheritdoc />
    public async Task FlushPendingAsync(CancellationToken ct = default)
    {
        try
        {
            var containerClient = blobServiceClient.GetBlobContainerClient(StateContainerName);
            await containerClient.CreateIfNotExistsAsync(cancellationToken: ct).ConfigureAwait(false);
            var blobClient = containerClient.GetBlobClient(StateBlobPath);

            var state = await ReadStateAsync(blobClient, ct).ConfigureAwait(false);

            // 沒有積欠就什麼都不做 —— 否則等於每個 Timer 週期都建置一次。
            if (state.PendingSince is null) return;

            var now = Clock.UtcNow;
            if (state.LastDispatchedAt is { } last && now - last < CooldownWindow) return;

            var dispatched = await DispatchAsync(ct).ConfigureAwait(false);
            if (dispatched)
            {
                logger.LogInformation(
                    "送出積欠的重建（自 {PendingSince} 起累積）。", state.PendingSince);
                await WriteStateAsync(blobClient, new RebuildState(now, null), ct).ConfigureAwait(false);
            }
            // 失敗不更新狀態：旗標留著，下一輪再試。
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "送出積欠重建時發生未預期錯誤。");
        }
    }

    /// <inheritdoc />
    public async Task<RebuildStatusDto> GetStatusAsync(CancellationToken ct = default)
    {
        var cooldown = (int)CooldownWindow.TotalMinutes;
        try
        {
            var containerClient = blobServiceClient.GetBlobContainerClient(StateContainerName);
            var blobClient = containerClient.GetBlobClient(StateBlobPath);
            var state = await ReadStateAsync(blobClient, ct).ConfigureAwait(false);
            return new RebuildStatusDto(state.PendingSince is not null, state.PendingSince, state.LastDispatchedAt, cooldown);
        }
        catch (Exception ex)
        {
            // ⚠️ 與 RequestAsync 一樣不 throw —— 這支只是後台右上角一個狀態字，
            // 讀不到窗口狀態不該讓整個編輯畫面掛掉。回「沒有積欠」是安全的預設：
            // 顯示成「已上線」比顯示成「永遠發布中」誤導性小。
            logger.LogWarning(ex, "讀取重建窗口狀態失敗，回傳預設值。");
            return new RebuildStatusDto(false, null, null, cooldown);
        }
    }

    /// <summary>回傳 <c>true</c> 代表 GitHub 已接受 <c>repository_dispatch</c>（回 204）。</summary>
    private async Task<bool> DispatchAsync(CancellationToken ct)
    {
        // 鍵名沿用 local.settings.example.json 已建立的 GITHUB_REPO／GITHUB_DISPATCH_TOKEN。
        var repository = configuration["GITHUB_REPO"];
        var token = configuration["GITHUB_DISPATCH_TOKEN"];

        if (string.IsNullOrWhiteSpace(repository) || string.IsNullOrWhiteSpace(token))
        {
            logger.LogError("缺少 GITHUB_REPO 或 GITHUB_DISPATCH_TOKEN 設定，無法觸發重建。");
            return false;
        }

        using var client = httpClientFactory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, $"https://api.github.com/repos/{repository}/dispatches")
        {
            Content = JsonContent.Create(new { event_type = "content-published" }),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github+json"));
        request.Headers.UserAgent.ParseAdd("20skin-api");
        request.Headers.Add("X-GitHub-Api-Version", "2022-11-28");

        using var response = await client.SendAsync(request, ct).ConfigureAwait(false);
        if (response.IsSuccessStatusCode) return true;

        var body = await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
        logger.LogError(
            "GitHub repository_dispatch 失敗：{StatusCode} {Body}", (int)response.StatusCode, body);
        return false;
    }

    private static async Task<RebuildState> ReadStateAsync(BlobClient blobClient, CancellationToken ct)
    {
        try
        {
            var download = await blobClient.DownloadContentAsync(ct).ConfigureAwait(false);
            return download.Value.Content.ToObjectFromJson<RebuildState>() ?? new RebuildState(null, null);
        }
        catch (Azure.RequestFailedException ex) when (ex.Status == 404)
        {
            return new RebuildState(null, null);
        }
    }

    private static async Task WriteStateAsync(BlobClient blobClient, RebuildState state, CancellationToken ct)
        => await blobClient.UploadAsync(
            new BinaryData(state), overwrite: true, cancellationToken: ct).ConfigureAwait(false);

    private sealed record RebuildState(DateTime? LastDispatchedAt, DateTime? PendingSince);
}
