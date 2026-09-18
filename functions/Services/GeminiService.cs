using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Skin20.Api.Common;

namespace Skin20.Api.Services;

/// <summary>
/// Google Gemini 的嵌入與生成（CLAUDE.md 決策 28，Tim 2026-09-18 定案）。
///
/// <para>
/// 外部呼叫的形狀比照 <see cref="BotCheckService"/>：無名 <c>HttpClient</c>、每次自己設逾時、
/// 只攔傳輸層例外。<b>但失敗時的決定相反</b> —— 機器人驗證連不上時「放行」是有意義的，
/// 這裡沒有「放行」這個選項：答不出來就是答不出來，
/// <b>絕不可以退回用模型的一般知識回答醫療問題</b>（docs/04 §4）。
/// </para>
///
/// <para>
/// ⚠️ <b>模型代號與價格會變</b>，所以兩個模型都是 app setting
/// （<c>Gemini__EmbeddingModel</c>／<c>Gemini__ChatModel</c>）。實作當天請對照官方頁確認，
/// 不要把預設值當成保證存在的型號。
/// </para>
///
/// <para>
/// ⚠️ 金鑰未設定時<b>不假裝已接好</b>：直接丟 <c>AI_UNAVAILABLE</c> 並記 Warning，
/// 前台會顯示「線上諮詢暫時無法回覆」與轉真人出口。這與 <c>BotCheck__SecretKey</c> 留空
/// 就放行不同 —— 那一支留空是為了本機開發方便，這一支留空就是功能不存在。
/// </para>
/// </summary>
public sealed class GeminiService(
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration,
    ILogger<GeminiService> logger) : IAiEmbeddingService, IAiChatService
{
    private const string BaseUrl = "https://generativelanguage.googleapis.com/v1beta/models";

    /// <summary>
    /// 嵌入的逾時。⚠️ 這一段擋在使用者按下送出與看到回答之間，要短。
    /// </summary>
    private static readonly TimeSpan EmbedTimeout = TimeSpan.FromSeconds(10);

    /// <summary>
    /// 生成的逾時。
    /// <para>
    /// ⚠️ <b>不要因為平台允許 230 秒就放寬。</b> 約束是人的耐心，不是 Azure 的負載平衡器。
    /// 逾時之後<b>不重試</b> —— 使用者已經等了十幾秒，重試一次就是雙倍。
    /// </para>
    /// </summary>
    private static readonly TimeSpan ChatTimeout = TimeSpan.FromSeconds(20);

    /// <summary>一次送幾塊去嵌入。⚠️ 與 Timer 的單輪上限一起決定一輪要打幾次 API。</summary>
    public const int EmbedBatchSize = 100;

    public int Dimensions =>
        int.TryParse(configuration["AiIndex:Dimensions"], out var d) && d is >= 128 and <= 3072 ? d : 768;

    public string ModelId => configuration["Gemini:EmbeddingModel"] ?? "gemini-embedding-001";

    private string ChatModelId => configuration["Gemini:ChatModel"] ?? "gemini-2.5-flash";

    /// <summary>
    /// 有些嵌入模型吃 <c>taskType</c>（語料與查詢用不同值，能提升檢索品質），有些則不認這個欄位。
    /// <para>⚠️ 預設<b>不送</b>：送了不認得的欄位會整批 400，而那個錯誤訊息指不到這裡。
    /// 確認過模型支援再用 <c>AiIndex__UseTaskType</c> 打開。</para>
    /// </summary>
    private bool UseTaskType => configuration["AiIndex:UseTaskType"] is "true" or "True" or "1";

    // ════════════════════════════════════════════════════════════════════
    // 嵌入
    // ════════════════════════════════════════════════════════════════════

    public async Task<IReadOnlyList<float[]>> EmbedDocumentsAsync(
        IReadOnlyList<string> texts, CancellationToken ct = default)
    {
        if (texts.Count == 0) return [];

        var model = ModelId;

        // 🔴 一塊一個 request 項目。塞成同一個 content 的多個 part 會回**單一聚合向量**，
        //    而且不會報錯（見 IAiEmbeddingService 的註解）。
        var payload = new EmbedBatchRequest(texts
            .Select(text => new EmbedRequest(
                $"models/{model}",
                new GeminiContent([new GeminiPart(text)]),
                Dimensions,
                UseTaskType ? "RETRIEVAL_DOCUMENT" : null))
            .ToList());

        var response = await PostAsync<EmbedBatchRequest, EmbedBatchResponse>(
            $"{model}:batchEmbedContents", payload, EmbedTimeout, ct);

        if (response.Embeddings is null || response.Embeddings.Count != texts.Count)
        {
            // 數量對不上就是整批不能用 —— 對錯位置的向量比沒有向量更糟，
            // 它會讓檢索結果看起來合理但實際上指向別的內容。
            logger.LogError("嵌入回應數量不符：送出 {Sent} 段，收到 {Received} 個向量。",
                texts.Count, response.Embeddings?.Count ?? 0);
            throw Unavailable();
        }

        var result = new List<float[]>(texts.Count);
        foreach (var embedding in response.Embeddings)
        {
            var vector = embedding.Values ?? [];
            if (vector.Length != Dimensions)
            {
                logger.LogError("嵌入維度不符：預期 {Expected}，收到 {Actual}。", Dimensions, vector.Length);
                throw Unavailable();
            }
            AiIndexFormat.Normalize(vector);
            result.Add(vector);
        }

        return result;
    }

    public async Task<float[]> EmbedQueryAsync(string text, CancellationToken ct = default)
    {
        var model = ModelId;

        var payload = new EmbedRequest(
            $"models/{model}",
            new GeminiContent([new GeminiPart(text)]),
            Dimensions,
            UseTaskType ? "RETRIEVAL_QUERY" : null);

        var response = await PostAsync<EmbedRequest, EmbedSingleResponse>(
            $"{model}:embedContent", payload, EmbedTimeout, ct);

        var vector = response.Embedding?.Values ?? [];
        if (vector.Length != Dimensions)
        {
            logger.LogError("查詢向量維度不符：預期 {Expected}，收到 {Actual}。", Dimensions, vector.Length);
            throw Unavailable();
        }

        AiIndexFormat.Normalize(vector);
        return vector;
    }

    // ════════════════════════════════════════════════════════════════════
    // 生成
    // ════════════════════════════════════════════════════════════════════

    public async Task<string> CompleteAsync(
        string systemInstruction, string userMessage, CancellationToken ct = default)
    {
        var payload = new GenerateRequest(
            new GeminiContent([new GeminiPart(systemInstruction)]),
            [new GeminiTurn("user", [new GeminiPart(userMessage)])],
            // ⚠️ 低溫度是護欄的一部分，不是調味：這個場景要的是「照著片段講」，不是創意。
            new GenerationConfig(0.2, 800));

        var response = await PostAsync<GenerateRequest, GenerateResponse>(
            $"{ChatModelId}:generateContent", payload, ChatTimeout, ct);

        var candidate = response.Candidates?.FirstOrDefault();
        var text = candidate?.Content?.Parts?.FirstOrDefault()?.Text ?? "";

        if (text.Length == 0)
        {
            // 被安全設定擋下（醫療內容偶爾會中）或空回應。
            // ⚠️ 這**不是** 503 —— 服務是通的，只是這一題沒有答案。交給呼叫端當未命中處理。
            logger.LogInformation("生成回應為空（finishReason: {Reason}）。", candidate?.FinishReason ?? "unknown");
        }

        return text;
    }

    // ════════════════════════════════════════════════════════════════════

    private async Task<TResponse> PostAsync<TRequest, TResponse>(
        string path, TRequest payload, TimeSpan timeout, CancellationToken ct)
    {
        var apiKey = configuration["Gemini:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            logger.LogWarning("Gemini:ApiKey 未設定，AI 問答無法運作。");
            throw Unavailable();
        }

        try
        {
            using var client = httpClientFactory.CreateClient();
            client.Timeout = timeout;

            using var request = new HttpRequestMessage(HttpMethod.Post, $"{BaseUrl}/{path}")
            {
                Content = JsonContent.Create(payload, options: AiIndexFormat.Json),
            };
            // ⚠️ 金鑰走標頭不走 query string —— query string 會進各層的存取紀錄。
            request.Headers.Add("x-goog-api-key", apiKey);

            using var response = await client.SendAsync(request, ct).ConfigureAwait(false);

            if (!response.IsSuccessStatusCode)
            {
                // ⚠️ 回應內容只進 log，不回給呼叫端（同 BotCheckService：錯誤細節等於幫攻擊者除錯）。
                var detail = await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
                logger.LogError("Gemini {Path} 回 {Status}：{Detail}",
                    path, (int)response.StatusCode, Truncate(detail));
                throw Unavailable();
            }

            var parsed = await response.Content
                .ReadFromJsonAsync<TResponse>(AiIndexFormat.Json, ct).ConfigureAwait(false);

            if (parsed is null)
            {
                logger.LogError("Gemini {Path} 的回應無法解析。", path);
                throw Unavailable();
            }

            return parsed;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or NotSupportedException)
        {
            // 🔴 傳輸層失敗 → 503。**不要照抄 BotCheckService 的「放行」** ——
            //    那一支放行代表「當作是真人」，這一支沒有對應的概念。
            logger.LogWarning(ex, "無法連上 Gemini（{Path}）。", path);
            throw Unavailable();
        }
    }

    private static AppException Unavailable() =>
        new(ErrorCodes.AiUnavailable, "線上諮詢暫時無法回覆，請稍後再試。", 503);

    private static string Truncate(string text) => text.Length <= 400 ? text : text[..400];

    // ── 線路上的形狀（camelCase 由 AiIndexFormat.Json 統一處理）──────────

    private sealed record GeminiPart([property: JsonPropertyName("text")] string Text);

    private sealed record GeminiContent([property: JsonPropertyName("parts")] List<GeminiPart> Parts);

    private sealed record GeminiTurn(
        [property: JsonPropertyName("role")] string Role,
        [property: JsonPropertyName("parts")] List<GeminiPart> Parts);

    private sealed record EmbedRequest(
        [property: JsonPropertyName("model")] string Model,
        [property: JsonPropertyName("content")] GeminiContent Content,
        [property: JsonPropertyName("outputDimensionality")] int OutputDimensionality,
        [property: JsonPropertyName("taskType")] string? TaskType);

    private sealed record EmbedBatchRequest(
        [property: JsonPropertyName("requests")] List<EmbedRequest> Requests);

    private sealed record EmbedValues([property: JsonPropertyName("values")] float[]? Values);

    private sealed record EmbedBatchResponse(
        [property: JsonPropertyName("embeddings")] List<EmbedValues>? Embeddings);

    private sealed record EmbedSingleResponse(
        [property: JsonPropertyName("embedding")] EmbedValues? Embedding);

    private sealed record GenerationConfig(
        [property: JsonPropertyName("temperature")] double Temperature,
        [property: JsonPropertyName("maxOutputTokens")] int MaxOutputTokens);

    private sealed record GenerateRequest(
        [property: JsonPropertyName("systemInstruction")] GeminiContent SystemInstruction,
        [property: JsonPropertyName("contents")] List<GeminiTurn> Contents,
        [property: JsonPropertyName("generationConfig")] GenerationConfig GenerationConfig);

    private sealed record GenerateCandidate(
        [property: JsonPropertyName("content")] GeminiContent? Content,
        [property: JsonPropertyName("finishReason")] string? FinishReason);

    private sealed record GenerateResponse(
        [property: JsonPropertyName("candidates")] List<GenerateCandidate>? Candidates);
}
