namespace Skin20.Api.Services;

/// <summary>
/// 直傳模式下唯一能判定檔案真實型別的地方（docs/11 §9）：不看副檔名、不看用戶端宣稱的
/// Content-Type，只看檔頭的 magic bytes。
///
/// <para>
/// ⚠️ 這是<b>白名單</b>，不是黑名單——辨識不出來的一律視為不允許，不要放行「看起來還好」的未知格式。
/// </para>
/// </summary>
public static class MediaSniffer
{
    public sealed record Detection(string Extension, string ContentType, bool IsImage);

    /// <summary>
    /// 依 magic bytes 判定型別。<paramref name="content"/> 至少要有前 12 個位元組才能判定 WEBP，
    /// 呼叫端應傳入完整內容或至少 64 位元組的檔頭。
    /// </summary>
    public static Detection? Detect(ReadOnlySpan<byte> content)
    {
        if (content.Length >= 3 && content[0] == 0xFF && content[1] == 0xD8 && content[2] == 0xFF)
            return new Detection(".jpg", "image/jpeg", true);

        if (content.Length >= 8
            && content[0] == 0x89 && content[1] == 0x50 && content[2] == 0x4E && content[3] == 0x47
            && content[4] == 0x0D && content[5] == 0x0A && content[6] == 0x1A && content[7] == 0x0A)
            return new Detection(".png", "image/png", true);

        if (content.Length >= 6
            && content[0] == 0x47 && content[1] == 0x49 && content[2] == 0x46 && content[3] == 0x38
            && (content[4] == 0x37 || content[4] == 0x39) && content[5] == 0x61)
            return new Detection(".gif", "image/gif", true);

        if (content.Length >= 12
            && content[0] == (byte)'R' && content[1] == (byte)'I' && content[2] == (byte)'F' && content[3] == (byte)'F'
            && content[8] == (byte)'W' && content[9] == (byte)'E' && content[10] == (byte)'B' && content[11] == (byte)'P')
            return new Detection(".webp", "image/webp", true);

        if (content.Length >= 4
            && content[0] == (byte)'%' && content[1] == (byte)'P' && content[2] == (byte)'D' && content[3] == (byte)'F')
            return new Detection(".pdf", "application/pdf", false);

        return null;
    }

    /// <summary>
    /// 讀圖片尺寸（僅支援 PNG／GIF／JPEG；WEBP 的 VP8/VP8L/VP8X 變體較複雜，暫不支援，
    /// 回傳 <c>null</c>——<c>MediaAssets.Width/Height</c> 允許 NULL，見 docs/08 §E-1）。
    /// <paramref name="content"/> 必須是完整檔案內容，不是只有檔頭（JPEG 的 SOF 標記位置不固定）。
    /// </summary>
    public static (int Width, int Height)? TryReadDimensions(string contentType, ReadOnlySpan<byte> content)
    {
        try
        {
            return contentType switch
            {
                "image/png" => TryReadPng(content),
                "image/gif" => TryReadGif(content),
                "image/jpeg" => TryReadJpeg(content),
                _ => null,
            };
        }
        catch (Exception)
        {
            // 尺寸只是輔助資訊，解析失敗不該讓整個上傳流程失敗——回傳 null 讓欄位維持 NULL。
            return null;
        }
    }

    private static (int Width, int Height)? TryReadPng(ReadOnlySpan<byte> c)
    {
        if (c.Length < 24) return null;
        var width = (c[16] << 24) | (c[17] << 16) | (c[18] << 8) | c[19];
        var height = (c[20] << 24) | (c[21] << 16) | (c[22] << 8) | c[23];
        return (width, height);
    }

    private static (int Width, int Height)? TryReadGif(ReadOnlySpan<byte> c)
    {
        if (c.Length < 10) return null;
        var width = c[6] | (c[7] << 8);
        var height = c[8] | (c[9] << 8);
        return (width, height);
    }

    private static (int Width, int Height)? TryReadJpeg(ReadOnlySpan<byte> c)
    {
        var i = 2; // 跳過 SOI（0xFFD8）
        while (i + 9 < c.Length)
        {
            if (c[i] != 0xFF) { i++; continue; }

            var marker = c[i + 1];
            // SOF0..SOF15，排除 DHT(0xC4)／JPG(0xC8)／DAC(0xCC) 這幾個非 SOF 的例外
            var isSof = marker is >= 0xC0 and <= 0xCF and not 0xC4 and not 0xC8 and not 0xCC;
            if (isSof)
            {
                var height = (c[i + 5] << 8) | c[i + 6];
                var width = (c[i + 7] << 8) | c[i + 8];
                return (width, height);
            }

            var segmentLength = (c[i + 2] << 8) | c[i + 3];
            i += 2 + segmentLength;
        }

        return null;
    }
}
