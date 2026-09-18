using Skin20.Api.Models.Entities;

namespace Skin20.Api.Common;

/// <summary>
/// 內容型別的中文顯示標籤。
///
/// <para>
/// 🔴 <b>只能有一份。</b> 站內搜尋的結果標籤（<c>SearchHandler</c>）、AI 問答的來源標籤
/// （<c>AiHandler</c>）與語料的麵包屑（<c>AiChunker</c>）用的是同一組字 ——
/// 分成三份之後，使用者會在同一個站看到同一種內容有三種叫法，而且不會有任何錯誤。
/// </para>
/// <para>⚠️ 這組字與 mockup 19-search 的篩選 tab 一致，改字要一起看那一頁。</para>
/// </summary>
public static class ContentTypeLabels
{
    private static readonly Dictionary<ContentType, string> Map = new()
    {
        [ContentType.Treatment] = "療程",
        [ContentType.Concern] = "肌膚困擾",
        [ContentType.Article] = "文章",
        [ContentType.Doctor] = "醫師",
        [ContentType.Clinic] = "據點",
        [ContentType.Case] = "案例",
        [ContentType.Faq] = "常見問題",
        [ContentType.Page] = "頁面",
        [ContentType.Term] = "分類",
    };

    public static string Of(ContentType type) => Map.GetValueOrDefault(type, "");

    public static string Of(byte contentType) => Of((ContentType)contentType);
}
