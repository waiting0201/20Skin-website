using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Skin20.Api.Common;

namespace Skin20.Api.Services;

/// <summary>
/// 機器人驗證 —— <b>reCAPTCHA v3</b>（2026-09-12 定案，docs/10-api.md §5）。
///
/// <para>
/// ⚠️ <b>介面（<see cref="IBotCheckService"/>）刻意不帶供應商名稱</b>，換成 Turnstile 時
/// 只有這一個檔案要改，呼叫端一行都不用動。所以請不要把 <c>recaptcha</c> 這個字
/// 漏到 Handler 或 DTO 裡（欄位名是 <c>botCheckToken</c>，不是 <c>recaptchaToken</c>）。
/// </para>
///
/// <para>
/// 🔴 <b>v3 是分數制，不是通過／不通過。</b> 它永遠不會擋下任何人 —— 它回一個
/// 0.0–1.0 的分數，門檻由我們自己訂。所以有三件事缺一不可：
/// </para>
/// <list type="number">
///   <item><b>比對 <c>action</c></b>。少了這一步，攻擊者可以拿在首頁取得的 token 來打
///     <c>/auth/login</c> —— 同一把 site key 發出的 token 在任何動作上都驗得過。</item>
///   <item><b>套分數門檻</b>（<see cref="DefaultMinimumScore"/>）。</item>
///   <item><b>看 <c>success</c></b>。token 過期（2 分鐘）、重複使用、site key 不符都在這裡現形。</item>
/// </list>
///
/// <para>
/// 🔴 <b>連不上 Google 時「放行」，不是「擋下」。</b> 這看起來像把防護關掉，但另一邊更糟：
/// </para>
/// <list type="bullet">
///   <item><c>/contact</c> 擋下＝Google 有狀況的期間，院方收不到任何病人詢問。
///     少收一封詢問比多收一封垃圾信嚴重得多。</item>
///   <item><c>/auth/login</c> 擋下＝**後台整個登不進去**。而登入真正的硬防線是次數限制
///     （<b>只以帳號計數</b>，docs/02 §4），那一道不受 Google 影響。</item>
/// </list>
/// <para>
/// ⚠️ 所以「放行」只發生在<b>傳輸層失敗</b>（連不上、逾時、回應不是預期格式）。
/// Google 明確回答「這不是人」或分數太低時<b>一律擋下</b>。兩者不可混為一談。
/// ⚠️ 每一次放行都記 <c>Warning</c>，讓它在 Application Insights 上查得到 ——
/// 沉默的放行等於沒有防護。
/// </para>
///
/// <para>
/// ⚠️ <b>沒有設定金鑰時也是放行 ＋ 記 Warning。</b> 本機開發與尚未申請金鑰的期間要能用，
/// 但**正式環境上線前必須設定** <c>BotCheck__SecretKey</c>（STATUS.md §七 的 checklist）。
/// </para>
/// </summary>
public sealed class BotCheckService(
    IConfiguration configuration,
    IHttpClientFactory httpClientFactory,
    ILogger<BotCheckService> logger)
    : IBotCheckService
{
    private const string VerifyUrl = "https://www.google.com/recaptcha/api/siteverify";

    /// <summary>
    /// 分數門檻。Google 建議的起點就是 0.5。
    /// <para>
    /// ⚠️ <b>不要為了「乾淨」往上調。</b> v3 對少數真人也會給低分（隱私瀏覽、VPN、
    /// 輔助技術、極少互動就送出表單的人）。調到 0.7 擋掉的絕大多數是真的病人，
    /// 而且他們<b>不會知道自己被擋了</b> —— 沒有挑戰題可以解，只會看到送出失敗。
    /// 要調請先看 Application Insights 裡實際的分數分佈。
    /// </para>
    /// </summary>
    private const double DefaultMinimumScore = 0.5;

    /// <summary>
    /// ⚠️ 逾時要短。這是擋在使用者按下「送出」與真正處理之間的一次外部呼叫 ——
    /// Google 慢，整個表單就跟著慢。逾時之後走的是「放行」那條路（見類別註解）。
    /// </summary>
    private static readonly TimeSpan VerifyTimeout = TimeSpan.FromSeconds(5);

    private double MinimumScore =>
        double.TryParse(configuration["BotCheck:MinimumScore"], out var s) && s is >= 0 and <= 1
            ? s
            : DefaultMinimumScore;

    public async Task EnsureHumanAsync(string? token, string action, CancellationToken ct = default)
    {
        var secretKey = configuration["BotCheck:SecretKey"];
        if (string.IsNullOrWhiteSpace(secretKey))
        {
            logger.LogWarning(
                "BotCheck:SecretKey 未設定，機器人驗證直接放行（動作：{Action}）。上線前必須設定。", action);
            return;
        }

        // 🔴 沒帶 token 是**擋下**，不是放行。這一條與「連不上 Google」不同：
        //    前端沒送 token 代表它根本沒跑驗證（或有人直接打 API），那正是要擋的對象。
        if (string.IsNullOrWhiteSpace(token))
        {
            logger.LogInformation("機器人驗證未通過：請求沒有帶 token（動作：{Action}）。", action);
            throw BotCheckFailed();
        }

        RecaptchaVerifyResponse? result;
        try
        {
            using var client = httpClientFactory.CreateClient();
            client.Timeout = VerifyTimeout;

            using var content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["secret"] = secretKey,
                ["response"] = token,
            });

            using var response = await client.PostAsync(VerifyUrl, content, ct).ConfigureAwait(false);
            response.EnsureSuccessStatusCode();
            result = await response.Content.ReadFromJsonAsync<RecaptchaVerifyResponse>(ct).ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or NotSupportedException)
        {
            // 傳輸層失敗 → 放行（理由見類別註解）。⚠️ 不要改成擋下。
            logger.LogWarning(ex, "無法連上 reCAPTCHA 驗證服務，本次放行（動作：{Action}）。", action);
            return;
        }

        if (result is null)
        {
            logger.LogWarning("reCAPTCHA 回應無法解析，本次放行（動作：{Action}）。", action);
            return;
        }

        if (!result.Success)
        {
            // ⚠️ error-codes 只記 log，**不回給呼叫端** —— 那些字串會告訴攻擊者
            //    是 token 過期還是 site key 不符，等於幫他們除錯。
            logger.LogInformation(
                "機器人驗證未通過（動作：{Action}）：{Errors}", action, string.Join(",", result.ErrorCodes ?? []));
            throw BotCheckFailed();
        }

        // 🔴 action 必須相符。少了這一步，在任何一頁取得的 token 都能拿來打任何端點。
        if (!string.Equals(result.Action, action, StringComparison.Ordinal))
        {
            logger.LogWarning(
                "機器人驗證的 action 不符：預期 {Expected}、實際 {Actual}。", action, result.Action);
            throw BotCheckFailed();
        }

        if (result.Score < MinimumScore)
        {
            logger.LogInformation(
                "機器人驗證分數過低（動作：{Action}）：{Score} < {Threshold}", action, result.Score, MinimumScore);
            throw BotCheckFailed();
        }
    }

    /// <summary>
    /// ⚠️ 對外一律是同一句話，不透露是分數太低、token 過期還是 action 不符 ——
    /// 那些差別對真人沒有用，對想繞過的人很有用。細節在 log 裡。
    /// </summary>
    private static AppException BotCheckFailed() => AppException.BadRequest(
        ErrorCodes.BotCheckFailed, "自動化驗證未通過，請重新整理頁面後再試一次。");

    /// <summary>
    /// <c>siteverify</c> 的回應（Google 的欄位名是 snake_case 與 kebab-case 混用）。
    /// </summary>
    private sealed class RecaptchaVerifyResponse
    {
        [JsonPropertyName("success")]
        public bool Success { get; set; }

        /// <summary>0.0（極可能是機器人）–1.0（極可能是真人）。v2 沒有這一欄。</summary>
        [JsonPropertyName("score")]
        public double Score { get; set; }

        /// <summary>前端執行 <c>grecaptcha.execute()</c> 時傳入的動作名稱。</summary>
        [JsonPropertyName("action")]
        public string? Action { get; set; }

        [JsonPropertyName("error-codes")]
        public string[]? ErrorCodes { get; set; }
    }
}
