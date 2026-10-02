using Skin20.Api.Handlers;

namespace Skin20.Api.Tests;

/// <summary>AI 問答的輸出判斷（決策 28）。</summary>
public class AiHandlerTests
{
    [Theory]
    [InlineData("無法回答")]
    [InlineData("無法回答。")]
    [InlineData("抱歉，我不知道。")]
    [InlineData("參考片段中沒有相關資訊。")]
    public void 沒照格式的短拒答_當成未命中(string answer)
        => Assert.True(AiHandler.IsBareRefusal(answer));

    [Theory]
    [InlineData("費用依項目、施作範圍與次數而不同，目前無法提供固定價格，由醫師面診並確認規劃內容後，服務人員會完整說明。")]
    [InlineData("多數雷射療程過程中會有溫熱、輕微刺感。")]
    public void 正常回答_即使含有無法二字也不誤殺(string answer)
        => Assert.False(AiHandler.IsBareRefusal(answer));
}
