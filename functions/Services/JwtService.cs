using System.Globalization;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Skin20.Api.Common;

namespace Skin20.Api.Services;

/// <summary>
/// HS256 自簽 JWT ＋ refresh token（docs/11-backend-design.md §5.2）。
///
/// <para>
/// ⚠️ <b>沒有引用任何 JWT 函式庫。</b> <c>Skin20.Api.csproj</c> 沒有帶
/// <c>System.IdentityModel.Tokens.Jwt</c>／<c>Microsoft.IdentityModel.*</c>，
/// 而本檔案不在允許修改 csproj 的範圍內（見交接說明「不要碰」清單）。
/// docs/11 §5.2 本來就要求「自己驗證比接管線可控」，這裡進一步做到
/// <b>手刻編碼／簽章／驗證</b>：header 固定為 <c>{"alg":"HS256","typ":"JWT"}</c>，
/// payload 用 <see cref="JsonObject"/> 手動組裝，簽章用 <see cref="HMACSHA256"/>。
/// 如果之後要換回標準函式庫，只要 csproj 加套件、重寫這一檔，介面
/// （<see cref="IJwtService"/>）與呼叫端完全不用動。
/// </para>
/// </summary>
public sealed class JwtService : IJwtService
{
    private const string HeaderJson = """{"alg":"HS256","typ":"JWT"}""";
    private static readonly byte[] HeaderBytes = Encoding.UTF8.GetBytes(HeaderJson);
    private static readonly string HeaderB64 = Base64UrlEncode(HeaderBytes);

    /// <summary>驗證參數全開，ClockSkew = 30s（docs/11 §5.2）。</summary>
    private static readonly TimeSpan ClockSkew = TimeSpan.FromSeconds(30);

    private readonly byte[] _key;
    private readonly string _issuer;
    private readonly string _audience;
    private readonly TimeSpan _accessTokenLifetime;
    private readonly ILogger<JwtService> _logger;

    public JwtService(IConfiguration configuration, ILogger<JwtService> logger)
    {
        _logger = logger;

        var secret = configuration["Jwt:Secret"];
        if (string.IsNullOrWhiteSpace(secret))
        {
            // 正式環境的 Function App Application Settings 一定要覆蓋 Jwt__Secret
            // （docs/11 §12：全架構僅存的兩個明文密鑰之一）。這裡只是讓本機開發
            // 在沒設定時也能跑起來，絕對不能是唯一的把關。
            _logger.LogWarning(
                "Jwt:Secret 未設定，改用僅供本機開發的預設值。正式環境的 Application Settings 必須覆蓋這個 key。");
            secret = "INSECURE-LOCAL-DEV-ONLY-DO-NOT-USE-IN-PRODUCTION-32BYTES";
        }

        _key = Encoding.UTF8.GetBytes(secret);
        _issuer = configuration["Jwt:Issuer"] ?? "skin20-api";
        _audience = configuration["Jwt:Audience"] ?? TokenClaims.AdminAudience;

        var minutes = int.TryParse(configuration["Jwt:AccessTokenMinutes"], out var m) ? m : 30;
        _accessTokenLifetime = TimeSpan.FromMinutes(Math.Max(1, minutes));
    }

    public string IssueAccessToken(
        int userId, string userName, IEnumerable<string> roles, IEnumerable<string> permissions, bool isSuperAdmin,
        bool mustChangePassword = false)
    {
        var now = DateTimeOffset.UtcNow;
        var exp = now.Add(_accessTokenLifetime);

        var payload = new JsonObject
        {
            [TokenClaims.Subject] = userId.ToString(CultureInfo.InvariantCulture),
            ["unique_name"] = userName,
            [TokenClaims.Roles] = new JsonArray([.. roles.Select(r => (JsonNode)r)]),
            [TokenClaims.Permissions] = new JsonArray([.. permissions.Select(p => (JsonNode)p)]),
            [TokenClaims.IsSuperAdmin] = isSuperAdmin ? "true" : "false",
            [TokenClaims.MustChangePassword] = mustChangePassword ? "true" : "false",
            ["iss"] = _issuer,
            ["aud"] = _audience,
            ["iat"] = now.ToUnixTimeSeconds(),
            ["nbf"] = now.ToUnixTimeSeconds(),
            ["exp"] = exp.ToUnixTimeSeconds(),
        };

        var payloadB64 = Base64UrlEncode(Encoding.UTF8.GetBytes(payload.ToJsonString()));
        var toSign = $"{HeaderB64}.{payloadB64}";
        var signature = ComputeSignature(toSign);
        return $"{toSign}.{Base64UrlEncode(signature)}";
    }

    public (string Token, string Hash) IssueRefreshToken()
    {
        // 256-bit 亂數，不透明字串——DB 只存 hash（docs/08 §A-4）。
        var token = Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
        return (token, HashRefreshToken(token));
    }

    public string HashRefreshToken(string token)
        => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    public ClaimsPrincipal? ValidateRequest(HttpRequest req)
    {
        try
        {
            var header = req.Headers.Authorization.ToString();
            if (string.IsNullOrWhiteSpace(header) ||
                !header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
                return null;

            return Validate(header["Bearer ".Length..].Trim());
        }
        catch
        {
            // ⚠️ 驗證失敗一律回 null，不讓例外冒出——由呼叫端轉 401（docs/11 §5.2）。
            return null;
        }
    }

    private ClaimsPrincipal? Validate(string token)
    {
        var parts = token.Split('.');
        if (parts.Length != 3) return null;

        var expectedSignature = ComputeSignature($"{parts[0]}.{parts[1]}");
        byte[] actualSignature;
        try
        {
            actualSignature = Base64UrlDecode(parts[2]);
        }
        catch (FormatException)
        {
            return null;
        }

        if (!CryptographicOperations.FixedTimeEquals(actualSignature, expectedSignature))
            return null;

        JsonObject? payload;
        try
        {
            payload = JsonNode.Parse(Encoding.UTF8.GetString(Base64UrlDecode(parts[1])))?.AsObject();
        }
        catch
        {
            return null;
        }

        if (payload is null) return null;

        var now = DateTimeOffset.UtcNow;

        if (!TryGetLong(payload, "exp", out var exp)) return null;
        if (now > DateTimeOffset.FromUnixTimeSeconds(exp).Add(ClockSkew)) return null;

        if (TryGetLong(payload, "nbf", out var nbf) &&
            now < DateTimeOffset.FromUnixTimeSeconds(nbf).Subtract(ClockSkew))
            return null;

        if (payload["iss"]?.GetValue<string>() != _issuer) return null;
        if (payload["aud"]?.GetValue<string>() != _audience) return null;

        var sub = payload[TokenClaims.Subject]?.GetValue<string>();
        if (string.IsNullOrEmpty(sub)) return null;

        var claims = new List<Claim>
        {
            new(TokenClaims.Subject, sub),
            new(TokenClaims.IsSuperAdmin, payload[TokenClaims.IsSuperAdmin]?.GetValue<string>() ?? "false"),
            // ⚠️ 這個 claim 漏掉的話，AppRouter 的「首登未改密碼就擋下」整條失效 ——
            //    而且是靜默失效：token 發得出來、端點也打得通，只是那道閘等於不存在。
            new(TokenClaims.MustChangePassword,
                payload[TokenClaims.MustChangePassword]?.GetValue<string>() ?? "false"),
        };

        if (payload["unique_name"]?.GetValue<string>() is { } userName)
            claims.Add(new Claim(ClaimTypes.Name, userName));

        if (payload[TokenClaims.Roles] is JsonArray roleArray)
            claims.AddRange(roleArray
                .Select(n => n?.GetValue<string>())
                .Where(v => !string.IsNullOrEmpty(v))
                .Select(v => new Claim(TokenClaims.Roles, v!)));

        if (payload[TokenClaims.Permissions] is JsonArray permissionArray)
            claims.AddRange(permissionArray
                .Select(n => n?.GetValue<string>())
                .Where(v => !string.IsNullOrEmpty(v))
                .Select(v => new Claim(TokenClaims.Permissions, v!)));

        // AuthenticationType 給一個非 null 值，ClaimsIdentity.IsAuthenticated 才會是 true。
        return new ClaimsPrincipal(new ClaimsIdentity(claims, "Bearer"));
    }

    private static bool TryGetLong(JsonObject payload, string key, out long value)
    {
        value = 0;
        var node = payload[key];
        if (node is null) return false;
        try
        {
            value = node.GetValue<long>();
            return true;
        }
        catch (FormatException)
        {
            return false;
        }
        catch (InvalidOperationException)
        {
            return false;
        }
    }

    private byte[] ComputeSignature(string data) => HMACSHA256.HashData(_key, Encoding.UTF8.GetBytes(data));

    private static string Base64UrlEncode(byte[] bytes)
        => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[] Base64UrlDecode(string value)
    {
        var padded = value.Replace('-', '+').Replace('_', '/');
        padded += (padded.Length % 4) switch { 2 => "==", 3 => "=", _ => "" };
        return Convert.FromBase64String(padded);
    }
}
