using System.Text.Json;
using Skin20.Api.Common;

namespace Skin20.Api.Tests;

/// <summary>AI 索引的 manifest 格式。🔴 它存在 Blob 上，新程式一定會讀到舊程式寫的那一份。</summary>
public class AiIndexFormatTests
{
    [Fact]
    public void 舊版兩欄的_manifest_視為切塊版本_1()
    {
        var manifest = JsonSerializer.Deserialize<AiIndexFormat.Manifest>(
            """{"builtAt":"2026-10-01T00:00:00Z","model":"m","dim":768,"count":3,"includeMainSiteArticles":true,"items":[[1001,10231],[1002,10225,2]]}""",
            AiIndexFormat.Json)!;

        var map = manifest.AsMap();
        Assert.Equal((10231, 1), map[1001]);
        Assert.Equal((10225, 2), map[1002]);
    }

    [Fact]
    public void 切塊版本從_1_起跳_舊索引一定會被重切()
        => Assert.True(AiChunker.Version > 1);
}
