using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Skin20.Api.Services;

/// <summary>
/// SMTP 通知信（docs/11-backend-design.md §12）。
///
/// <para>
/// ⚠️ <b>寄信失敗不得讓呼叫端的請求跟著失敗</b>——<c>/contact</c> 是「只寄信不落庫」，
/// 使用者送出後看到錯誤卻不知道有沒有寄到，比慢一點更糟；登入鎖定的告警信也一樣，
/// 鎖定本身（<c>LoginThrottles</c> 的狀態）不能因為信寄不出去而跟著失敗。
/// 因此本類別<b>吞掉所有例外，只記 log，不對外拋</b>。
/// </para>
/// <para>
/// 🔴 <b>日誌不得寫入表單內容</b>：那批資料刻意不落庫（docs/02 §2 個資責任），
/// 寫進日誌等於繞過該決策。這裡只記主旨與收件人，<b>絕不記 <paramref name="body"/> 的內容</b>。
/// </para>
/// </summary>
public sealed class EmailService(IConfiguration configuration, ILogger<EmailService> logger) : IEmailService
{
    public async Task SendAsync(string to, string subject, string body, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(to))
        {
            logger.LogWarning("EmailService.SendAsync：收件人為空，略過寄送。主旨：{Subject}", subject);
            return;
        }

        var host = configuration["Smtp:Host"];
        if (string.IsNullOrWhiteSpace(host))
        {
            // 本機開發或尚未設定 SMTP 時不應讓呼叫端跟著失敗（docs/11 §12）。
            logger.LogWarning("Smtp:Host 未設定，略過寄送通知信。主旨：{Subject}", subject);
            return;
        }

        try
        {
            var port = int.TryParse(configuration["Smtp:Port"], out var p) ? p : 587;
            var useSsl = !bool.TryParse(configuration["Smtp:UseSsl"], out var explicitSsl) || explicitSsl;
            var fromAddress = configuration["Smtp:FromAddress"] ?? "noreply@20skin.tw";
            var fromName = configuration["Smtp:FromName"] ?? "20SKIN 網站系統通知";
            var userName = configuration["Smtp:UserName"];
            var password = configuration["Smtp:Password"];

            using var client = new SmtpClient(host, port) { EnableSsl = useSsl };
            if (!string.IsNullOrWhiteSpace(userName))
                client.Credentials = new NetworkCredential(userName, password);

            using var message = new MailMessage
            {
                From = new MailAddress(fromAddress, fromName),
                Subject = subject,
                Body = body,
                IsBodyHtml = false,
            };
            message.To.Add(to);

            await client.SendMailAsync(message, ct);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "寄送通知信失敗。主旨：{Subject}", subject);
        }
    }
}
