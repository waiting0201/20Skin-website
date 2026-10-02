using SkiaSharp;

namespace Skin20.Api.Common;

/// <summary>
/// <see cref="ImageVariants"/> 的編碼部分（需要 SkiaSharp）。命名慣例與設計理由見 <c>ImageVariants.cs</c>。
/// 這個檔案被 <c>tools/image-variants</c> 連結共用，只能相依 SkiaSharp 與 <c>ImageVariants.cs</c>。
/// </summary>
public static partial class ImageVariants
{
    private const int Quality = 78;

    /// <summary>
    /// 解碼前的像素上限。上傳上限是 10 MB 檔案大小，但壓縮率極高的圖（例如純色 PNG）
    /// 可以是幾億像素，解碼就是 1 GB+ 的記憶體 —— 要在配置之前就拒絕。
    /// </summary>
    private const long MaxSourcePixels = 64L * 1000 * 1000;

    /// <summary>一個編好的衍生檔。<see cref="Width"/> 是檔名上的目標寬度，<see cref="ActualWidth"/> 是實際像素寬。</summary>
    public sealed record Variant(int Width, int ActualWidth, int Height, byte[] Data)
    {
        public string Path(string blobPath) => VariantPath(blobPath, Width);
    }

    /// <summary>
    /// 純函式：原圖位元組 → 四個 WebP。不碰 Azure，單元測試直接呼叫。
    /// <para>
    /// 解不開或像素過大時丟 <see cref="ImageVariantException"/>（呼叫端據此讓上傳失敗，
    /// 而不是留下一張沒有衍生尺寸的圖）。EXIF 方向會先轉正 —— 手機直拍的 JPEG 常常是
    /// 「像素橫的、標記要轉 90 度」，不處理的話縮圖會整張橫躺。
    /// </para>
    /// </summary>
    public static IReadOnlyList<Variant> Generate(byte[] source)
    {
        using var data = SKData.CreateCopy(source);
        using var codec = SKCodec.Create(data)
            ?? throw new ImageVariantException("無法解碼圖片。");

        var info = codec.Info;
        if (info.Width <= 0 || info.Height <= 0 || (long)info.Width * info.Height > MaxSourcePixels)
            throw new ImageVariantException($"圖片像素過大（{info.Width}×{info.Height}）。");

        using var decoded = SKBitmap.Decode(codec, new SKImageInfo(info.Width, info.Height, SKColorType.Rgba8888, SKAlphaType.Premul))
            ?? throw new ImageVariantException("無法解碼圖片。");
        using var oriented = ApplyOrigin(decoded, codec.EncodedOrigin);
        var src = oriented ?? decoded;

        var result = new List<Variant>(Widths.Count);
        // 原圖比目標窄的時候，好幾個尺寸會是同一個實際寬度 —— 編一次、共用位元組。
        var encodedByActualWidth = new Dictionary<int, (int Height, byte[] Data)>();

        foreach (var target in Widths)
        {
            var actual = Math.Min(target, src.Width);
            if (!encodedByActualWidth.TryGetValue(actual, out var enc))
            {
                enc = Encode(src, actual);
                encodedByActualWidth[actual] = enc;
            }
            result.Add(new Variant(target, actual, enc.Height, enc.Data));
        }

        return result;
    }

    private static (int Height, byte[] Data) Encode(SKBitmap src, int width)
    {
        // 高度四捨五入、至少 1，保持原比例。
        var height = Math.Max(1, (int)Math.Round((double)src.Height * width / src.Width));

        SKBitmap? resized = null;
        try
        {
            var target = src;
            if (width != src.Width)
            {
                // mipmap ＋ 線性：從 6000px 縮到 480px 這種大比例縮小，單純雙線性會有明顯的鋸齒與摩爾紋。
                resized = src.Resize(new SKImageInfo(width, height, SKColorType.Rgba8888, SKAlphaType.Premul),
                    new SKSamplingOptions(SKFilterMode.Linear, SKMipmapMode.Linear))
                    ?? throw new ImageVariantException("縮圖失敗。");
                target = resized;
            }

            using var image = SKImage.FromBitmap(target);
            using var encoded = image.Encode(SKEncodedImageFormat.Webp, Quality)
                ?? throw new ImageVariantException("WebP 編碼失敗。");
            return (height, encoded.ToArray());
        }
        finally
        {
            resized?.Dispose();
        }
    }

    /// <summary>
    /// 依 EXIF 方向把像素真的轉正。已經是正的就回 <c>null</c>（呼叫端用原圖，省一次複製）。
    /// 方向 5–8 會把寬高對調。
    /// </summary>
    private static SKBitmap? ApplyOrigin(SKBitmap src, SKEncodedOrigin origin)
    {
        if (origin == SKEncodedOrigin.TopLeft || origin == SKEncodedOrigin.Default) return null;

        float w = src.Width, h = src.Height;
        // (x', y') = M · (x, y)。矩陣逐一對照 EXIF 方向定義：
        //   2 水平鏡射／3 轉 180／4 垂直鏡射／5 轉置／6 順時針 90／7 反轉置／8 順時針 270
        SKMatrix m;
        bool swap;
        switch (origin)
        {
            case SKEncodedOrigin.TopRight: m = new SKMatrix(-1, 0, w, 0, 1, 0, 0, 0, 1); swap = false; break;
            case SKEncodedOrigin.BottomRight: m = new SKMatrix(-1, 0, w, 0, -1, h, 0, 0, 1); swap = false; break;
            case SKEncodedOrigin.BottomLeft: m = new SKMatrix(1, 0, 0, 0, -1, h, 0, 0, 1); swap = false; break;
            case SKEncodedOrigin.LeftTop: m = new SKMatrix(0, 1, 0, 1, 0, 0, 0, 0, 1); swap = true; break;
            case SKEncodedOrigin.RightTop: m = new SKMatrix(0, -1, h, 1, 0, 0, 0, 0, 1); swap = true; break;
            case SKEncodedOrigin.RightBottom: m = new SKMatrix(0, -1, h, -1, 0, w, 0, 0, 1); swap = true; break;
            case SKEncodedOrigin.LeftBottom: m = new SKMatrix(0, 1, 0, -1, 0, w, 0, 0, 1); swap = true; break;
            default: return null;
        }

        var dst = new SKBitmap(new SKImageInfo(swap ? src.Height : src.Width, swap ? src.Width : src.Height,
            SKColorType.Rgba8888, SKAlphaType.Premul));
        using var canvas = new SKCanvas(dst);
        canvas.Clear(SKColors.Transparent);
        canvas.SetMatrix(m);
        using var img = SKImage.FromBitmap(src);
        // 整數座標、不縮放，取樣方式不影響結果；用最近鄰避免多餘的運算。
        canvas.DrawImage(img, 0, 0, new SKSamplingOptions(SKFilterMode.Nearest));
        return dst;
    }
}

/// <summary>圖片無法產生衍生尺寸（解不開、像素過大、編碼失敗）。</summary>
public sealed class ImageVariantException(string message) : Exception(message);
