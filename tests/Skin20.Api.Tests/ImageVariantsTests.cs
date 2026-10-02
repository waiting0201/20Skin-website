using SkiaSharp;
using Skin20.Api.Common;

namespace Skin20.Api.Tests;

/// <summary>
/// 圖片衍生尺寸（Common/ImageVariants.cs）。純函式，不碰 Azure。
/// 🔴 前台只靠檔名慣例組 srcset，所以命名與「四個一定齊」是這組測試要守的兩件事。
/// </summary>
public class ImageVariantsTests
{
    [Theory]
    [InlineData("2026/09/0123456789abcdef0123456789abcdef.jpg", 480, "2026/09/0123456789abcdef0123456789abcdef.w480.webp")]
    [InlineData("2026/09/0123456789abcdef0123456789abcdef.png", 1600, "2026/09/0123456789abcdef0123456789abcdef.w1600.webp")]
    [InlineData("a/b.c/xx.webp", 800, "a/b.c/xx.w800.webp")] // 目錄名裡有點不能被當成副檔名
    [InlineData("noext", 1200, "noext.w1200.webp")]
    public void VariantPath_FollowsConvention(string original, int width, string expected)
        => Assert.Equal(expected, ImageVariants.VariantPath(original, width));

    [Fact]
    public void VariantPath_RoundTripsToOriginalStem()
    {
        var original = "2026/09/0123456789abcdef0123456789abcdef.png";
        foreach (var w in ImageVariants.Widths)
        {
            var v = ImageVariants.VariantPath(original, w);
            Assert.True(ImageVariants.TryGetOriginalStem(v, out var stem));
            Assert.Equal(ImageVariants.StemOf(original), stem);
        }
    }

    [Theory]
    [InlineData("2026/09/abc.w480.webp", true)]
    [InlineData("2026/09/abc.w1600.WEBP", true)]
    [InlineData("2026/09/abc.w999.webp", false)]  // 不是我們產的寬度
    [InlineData("2026/09/abc.webp", false)]       // 一般 webp 原檔
    [InlineData("2026/09/abc.w480.jpg", false)]
    [InlineData("2026/09/.w480.webp", false)]     // 沒有 stem
    [InlineData("w480.webp", false)]
    [InlineData("2026/09/abc.wx.webp", false)]
    public void IsVariantPath_OnlyMatchesOurFourWidths(string path, bool expected)
        => Assert.Equal(expected, ImageVariants.IsVariantPath(path));

    [Theory]
    [InlineData(".jpg", true)]
    [InlineData("JPEG", true)]
    [InlineData(".png", true)]
    [InlineData(".webp", true)]
    [InlineData(".gif", false)]
    [InlineData(".svg", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void HasVariants_ByExtension(string? ext, bool expected)
        => Assert.Equal(expected, ImageVariants.HasVariants(ext));

    [Fact]
    public void PathHasVariants_ExcludesVariantsThemselves()
    {
        Assert.True(ImageVariants.PathHasVariants("2026/09/abc.webp"));
        Assert.False(ImageVariants.PathHasVariants("2026/09/abc.w480.webp"));
        Assert.False(ImageVariants.PathHasVariants("2026/09/abc.gif"));
    }

    [Fact]
    public void Generate_Wide_ProducesAllFourAtTargetWidthsKeepingAspect()
    {
        var variants = ImageVariants.Generate(MakePng(2400, 1200));

        Assert.Equal(ImageVariants.Widths, variants.Select(v => v.Width));
        Assert.Equal(ImageVariants.Widths, variants.Select(v => v.ActualWidth));
        foreach (var v in variants)
        {
            Assert.Equal(v.Width / 2, v.Height);
            using var decoded = SKBitmap.Decode(v.Data);
            Assert.NotNull(decoded); // webp 真的可以解回來
            Assert.Equal(v.ActualWidth, decoded.Width);
            Assert.Equal(v.Height, decoded.Height);
        }
        Assert.Equal("WEBP", System.Text.Encoding.ASCII.GetString(variants[0].Data, 8, 4));
    }

    [Fact]
    public void Generate_Narrow_NeverUpscales_ButStillWritesAllFourNames()
    {
        var variants = ImageVariants.Generate(MakePng(600, 300));

        Assert.Equal(4, variants.Count);
        Assert.Equal(ImageVariants.Widths, variants.Select(v => v.Width));
        // 480 → 縮小；800／1200／1600 → 原寬 600（不放大）
        Assert.Equal([480, 600, 600, 600], variants.Select(v => v.ActualWidth));
        Assert.Equal([240, 300, 300, 300], variants.Select(v => v.Height));
        foreach (var v in variants)
        {
            using var decoded = SKBitmap.Decode(v.Data);
            Assert.Equal(v.ActualWidth, decoded.Width);
        }
    }

    [Fact]
    public void Generate_PreservesAlpha()
    {
        using var bmp = new SKBitmap(new SKImageInfo(100, 100, SKColorType.Rgba8888, SKAlphaType.Premul));
        bmp.Erase(SKColors.Transparent);
        using var img = SKImage.FromBitmap(bmp);
        var png = img.Encode(SKEncodedImageFormat.Png, 100).ToArray();

        var v = ImageVariants.Generate(png)[0];
        using var decoded = SKBitmap.Decode(v.Data);
        Assert.Equal(0, decoded.GetPixel(50, 50).Alpha);
    }

    [Fact]
    public void Generate_Garbage_ThrowsImageVariantException()
        => Assert.Throws<ImageVariantException>(() => ImageVariants.Generate([1, 2, 3, 4, 5, 6, 7, 8]));

    [Fact]
    public void Generate_AppliesExifOrientation_SwapsDimensions()
    {
        // 像素是 1000×500 的橫圖，EXIF 方向 6（順時針轉 90 度）→ 轉正後應是 500×1000 的直圖。
        var jpeg = WithExifOrientation(MakeJpeg(1000, 500), 6);

        var variants = ImageVariants.Generate(jpeg);

        // 轉正後寬 500：480 縮小，其餘三個不放大＝500
        Assert.Equal([480, 500, 500, 500], variants.Select(v => v.ActualWidth));
        using var decoded = SKBitmap.Decode(variants[3].Data);
        Assert.Equal(500, decoded.Width);
        Assert.Equal(1000, decoded.Height);
    }

    private static byte[] MakeJpeg(int width, int height)
    {
        using var bmp = new SKBitmap(new SKImageInfo(width, height, SKColorType.Rgba8888, SKAlphaType.Premul));
        bmp.Erase(SKColors.SeaGreen);
        using var img = SKImage.FromBitmap(bmp);
        return img.Encode(SKEncodedImageFormat.Jpeg, 90).ToArray();
    }

    /// <summary>在 SOI 之後插入一段只含方向標籤的 EXIF APP1。</summary>
    private static byte[] WithExifOrientation(byte[] jpeg, ushort orientation)
    {
        byte[] app1 =
        [
            0xFF, 0xE1, 0x00, 0x22,                         // APP1，長度 34（含長度欄位本身）
            0x45, 0x78, 0x69, 0x66, 0x00, 0x00,             // "Exif\0\0"
            0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, // TIFF header：little-endian，IFD0 在 offset 8
            0x01, 0x00,                                     // 1 個項目
            0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, // tag 0x0112、SHORT、count 1
            (byte)(orientation & 0xFF), (byte)(orientation >> 8), 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,                         // 沒有下一個 IFD
        ];
        return [.. jpeg[..2], .. app1, .. jpeg[2..]];
    }

    private static byte[] MakePng(int width, int height)
    {
        using var bmp = new SKBitmap(new SKImageInfo(width, height, SKColorType.Rgba8888, SKAlphaType.Premul));
        using (var canvas = new SKCanvas(bmp))
        {
            canvas.Clear(SKColors.CornflowerBlue);
            using var paint = new SKPaint { Color = SKColors.OrangeRed };
            canvas.DrawRect(0, 0, width / 2f, height / 2f, paint);
        }
        using var img = SKImage.FromBitmap(bmp);
        return img.Encode(SKEncodedImageFormat.Png, 100).ToArray();
    }
}
