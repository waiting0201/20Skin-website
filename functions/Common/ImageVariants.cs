namespace Skin20.Api.Common;

/// <summary>
/// 圖片衍生尺寸（2026-10-02 定案：由 Function 端產，docs/07 §3、docs/11 §9.3）。
///
/// <para>
/// 🔴 <b>命名慣例就是契約，不寫資料庫。</b> 原檔 <c>2026/09/{32hex}.jpg</c> 旁邊固定有
/// <c>2026/09/{32hex}.w480.webp</c>、<c>.w800.webp</c>、<c>.w1200.webp</c>、<c>.w1600.webp</c>。
/// 前台只靠這個慣例組 <c>srcset</c>，對「blob 網域上、副檔名是 jpg／jpeg／png／webp」的
/// <b>任何</b>圖片都會去要四個尺寸 —— 所以<b>每一張這類圖片都必須四個尺寸齊全</b>，
/// 缺一個就是那個寬度的破圖，而且沒有任何錯誤訊息（<c>srcset</c> 選到哪個是瀏覽器的事）。
/// </para>
/// <para>
/// ⚠️ 為什麼不用 <c>UploadedImage.Variants</c> 那欄：圖片不只存在於具名圖片欄位，
/// 區塊 JSON 與舊站匯入的內文圖（只有 <c>src</c> 網址、沒有 <c>blobPath</c> 鍵）也有，
/// 只有「依檔名推」這個慣例能不改任何已發布快照就涵蓋全部。
/// </para>
/// <para>
/// ⚠️ <b>不放大</b>：原圖比目標寬時，那個尺寸的檔名照樣要寫，內容用原圖寬度編碼 ——
/// 這樣一組永遠是齊的，前台不必知道每張圖多寬。
/// </para>
/// <para>
/// 🔴 <b>這個檔案只放命名慣例，零相依</b>，被 <c>tools/image-variants</c> 與 <c>tools/blob-reconcile</c>
/// 以 <c>&lt;Compile Include&gt;</c> 連結共用（不是抄一份）。編碼的部分（要 SkiaSharp）在
/// <c>ImageVariants.Encode.cs</c>，是同一個 partial class —— 對帳工具不必為了判斷檔名而背上 Skia。
/// </para>
/// </summary>
public static partial class ImageVariants
{
    /// <summary>目標寬度。⚠️ 前台的 srcset 寫死同一組數字，改這裡要同步改前台，並重跑 tools/image-variants。</summary>
    public static readonly IReadOnlyList<int> Widths = [480, 800, 1200, 1600];

    public const string ContentType = "image/webp";

    /// <summary>與原檔相同：檔名是隨機唯一值、內容永遠不變，可以放心 immutable。</summary>
    public const string CacheControl = "public, max-age=31536000, immutable";

    /// <summary>
    /// 這個副檔名（含或不含點、大小寫不拘）要不要有衍生尺寸。
    /// ⚠️ gif 不處理（會把動畫壓成靜態）、svg 不是圖片上傳的允許類型；前台對這兩種也不會去要尺寸。
    /// </summary>
    public static bool HasVariants(string? extension)
    {
        if (string.IsNullOrEmpty(extension)) return false;
        var e = extension.TrimStart('.').ToLowerInvariant();
        return e is "jpg" or "jpeg" or "png" or "webp";
    }

    /// <summary>某個 blob 路徑（容器內的相對路徑）要不要有衍生尺寸：副檔名合格、而且它自己不是衍生檔。</summary>
    public static bool PathHasVariants(string blobPath)
        => HasVariants(Path.GetExtension(blobPath)) && !IsVariantPath(blobPath);

    /// <summary><c>a/b/xxx.jpg</c> + 800 → <c>a/b/xxx.w800.webp</c>。</summary>
    public static string VariantPath(string blobPath, int width)
        => $"{StemOf(blobPath)}.w{width}.webp";

    /// <summary>一張圖四個衍生檔的路徑，順序同 <see cref="Widths"/>。</summary>
    public static IReadOnlyList<string> AllVariantPaths(string blobPath)
        => Widths.Select(w => VariantPath(blobPath, w)).ToArray();

    /// <summary>這個路徑是不是衍生檔（以 <c>.w{寬度}.webp</c> 結尾，寬度必須是 <see cref="Widths"/> 之一）。</summary>
    public static bool IsVariantPath(string blobPath) => TryGetOriginalStem(blobPath, out _);

    /// <summary>
    /// 衍生檔對應的原檔「去掉副檔名的路徑」（<c>a/b/xxx.w800.webp</c> → <c>a/b/xxx</c>）。
    /// ⚠️ 回傳的是 stem 而不是完整原檔路徑：衍生檔的名字裡沒有原檔副檔名（jpg／png／webp 都可能），
    /// 想知道原檔是哪一個只能拿 stem 去比對容器裡實際存在的檔案。
    /// </summary>
    public static bool TryGetOriginalStem(string blobPath, out string stem)
    {
        stem = string.Empty;
        if (!blobPath.EndsWith(".webp", StringComparison.OrdinalIgnoreCase)) return false;

        var withoutExt = blobPath[..^".webp".Length];
        var dot = withoutExt.LastIndexOf('.');
        // 最後一個「.」之後必須是 w + 數字，而且數字是我們產的那四個寬度之一。
        if (dot < 0 || dot + 2 >= withoutExt.Length || withoutExt[dot + 1] != 'w') return false;
        if (!int.TryParse(withoutExt.AsSpan(dot + 2), out var w) || !Widths.Contains(w)) return false;
        // stem 不可以是空的，或只剩目錄。
        if (dot == 0 || withoutExt[dot - 1] == '/') return false;

        stem = withoutExt[..dot];
        return true;
    }

    /// <summary>
    /// 原檔去掉副檔名的路徑。原檔本身若是「.w800.webp」形狀（不該存在，上傳路徑用的是隨機名）也原樣當原檔看待，
    /// 只拿掉最後一個副檔名 —— 這個函式不判斷它是不是衍生檔，要判斷用 <see cref="IsVariantPath"/>。
    /// </summary>
    public static string StemOf(string blobPath)
    {
        var slash = blobPath.LastIndexOf('/');
        var dot = blobPath.LastIndexOf('.');
        return dot > slash ? blobPath[..dot] : blobPath;
    }
}
