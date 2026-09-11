using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Skin20.Api.Services;

/// <summary>
/// 機器人驗證（docs/10-api.md §5：供應商未定，開工前定案）。
///
/// <para>
/// ⚠️ <b>這不是真正接好的驗證，是刻意的過渡實作。</b> reCAPTCHA v3 與 Cloudflare Turnstile
/// 都還在候選，介面（<see cref="IBotCheckService"/>）刻意不帶供應商名稱。
/// 在供應商定案前：<b>沒有設定金鑰就直接放行，並記一筆 warning</b>——
/// 不假裝已經驗證過，也不讓 <c>/contact</c>、<c>/questions/miss</c>、<c>/auth/login</c>
/// 在開發與過渡期間被擋死。
/// </para>
/// <para>
/// ⚠️ 若有人真的設定了 <c>BotCheck:SecretKey</c>（代表供應商已定案、有人開始接線），
/// 這裡<b>不會悄悄放行</b>——會丟 <see cref="NotImplementedException"/> 逼著把真正呼叫
/// 該供應商 siteverify API 的程式碼補上，而不是留著一個看起來有檢查、實際上永遠通過的驗證。
/// </para>
/// </summary>
public sealed class BotCheckService(IConfiguration configuration, ILogger<BotCheckService> logger)
    : IBotCheckService
{
    public Task EnsureHumanAsync(string? token, string action, CancellationToken ct = default)
    {
        var secretKey = configuration["BotCheck:SecretKey"];
        if (string.IsNullOrWhiteSpace(secretKey))
        {
            logger.LogWarning(
                "BotCheck:SecretKey 未設定，機器人驗證直接放行（動作：{Action}）。" +
                "供應商尚未定案（docs/10 §5），正式上線前必須補上真正的驗證呼叫。",
                action);
            return Task.CompletedTask;
        }

        throw new NotImplementedException(
            "BotCheckService.EnsureHumanAsync：偵測到已設定 BotCheck:SecretKey，" +
            "但供應商尚未定案（docs/10 §5），沒有對應的驗證呼叫可執行。" +
            "請先完成供應商選型，再把這裡換成真正呼叫該供應商 siteverify API 的程式碼。");
    }
}
