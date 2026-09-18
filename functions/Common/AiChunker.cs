using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Skin20.Api.Models.Entities;

namespace Skin20.Api.Common;

/// <summary>
/// 把一份**已核准的版本快照**切成 AI 問答檢索用的片段（CLAUDE.md 決策 28）。
///
/// <para>
/// 🔴 <b>不要用 <see cref="SearchTextBuilder.Build"/> 代替這一支。</b> 那一支是給站內搜尋用的：
/// 整份 <c>fields</c> 壓成一行、截 4000 字，<b>結構全丟</b>。檢索要的剛好相反 ——
/// 「這一段在講什麼」（段落標題）與「這一段屬於哪一頁」（麵包屑）決定了命中率。
/// 但葉節點的處理沿用 <see cref="SearchTextBuilder.Collapse"/>，不另寫一份。
/// </para>
///
/// <para>
/// ⚠️ <b>這個檔案的相依僅限 <c>Models.Entities</c>（取 <c>ContentType</c>）</b>，
/// 比照 <see cref="Indexability"/> —— <c>tools/ai-index-inspect</c> 以
/// <c>&lt;Compile Include&gt;</c> 連結同一份原始碼，加別的相依會讓那邊編不過。
/// </para>
///
/// <para>
/// ⚠️ <b>切壞了不會有任何錯誤訊息</b>，症狀是「AI 答非所問」或「明明站上有寫卻說不知道」。
/// 所以 <c>tools/ai-index-inspect --dry-run</c> 是零成本的、必跑的驗收 ——
/// 它不碰 Gemini、不碰 Blob，只把切出來的片段倒成人看得懂的文字檔。
/// </para>
/// </summary>
public static class AiChunker
{
    /// <summary>一塊的目標長度下限。低於這個長度會試著與相鄰段落合併。</summary>
    private const int MinChunkChars = 350;

    /// <summary>一塊的目標長度上限。</summary>
    private const int TargetChunkChars = 700;

    /// <summary>硬上限。超過就以句號為界切開，相鄰塊重疊一句。</summary>
    private const int HardChunkChars = 900;

    /// <summary>
    /// 主站舊文的權重（<c>fields.sourceSite == 1</c>，692 篇社群行銷貼文）。
    ///
    /// <para>
    /// 🔴 它們<b>同時</b>被降權與標成不可引用（<see cref="AiChunk.Citable"/> = false）——
    /// 那批文字是「無恢復期」「立即有感」「維持長達 24 月」這種廣告語氣，
    /// 讓 AI 把它們當衛教依據附連結出去，是醫療廣告面的曝險（相關敘述請以主管機關函釋
    /// 及院方法務意見為準）。Tim 2026-09-18 定案：納入檢索、降權、不可引用。
    /// </para>
    /// </summary>
    private const double LegacyMainSiteWeight = 0.75;

    /// <summary>
    /// FAQ 的 AI 摘要版答案加成。docs/04 §2 就是為了「給機器抽取」而寫的那一欄
    /// （60–100 字、語意自足、第一句直接回答），它天生就是最好的檢索目標。
    /// </summary>
    private const double FaqAiAnswerWeight = 1.15;

    /// <summary>主站舊文的 <c>sourceSite</c> 值（2 是 blog 站，docs/06 §4）。</summary>
    private const int SourceSiteMain = 1;

    /// <summary>文章標籤。⚠️ 與 <c>SearchHandler</c> 排除標籤是同一條理由：內容單薄，混進來只會稀釋。</summary>
    private const int TermTypeTag = 4;

    /// <summary>
    /// 進索引的一塊。
    /// <para>⚠️ <see cref="Breadcrumb"/> 只進**嵌入的輸入**，不併進 <see cref="Text"/> ——
    /// 併進去模型會把它當內文念出來。</para>
    /// </summary>
    public sealed record AiChunk(
        int ContentItemId,
        int PublishedVersionId,
        byte ContentType,
        string Url,
        string Title,
        string Heading,
        double Weight,
        bool Citable,
        string Text)
    {
        public string Breadcrumb =>
            string.IsNullOrEmpty(Heading)
                ? $"【{ContentTypeLabels.Of(ContentType)}】{Title}"
                : $"【{ContentTypeLabels.Of(ContentType)}】{Title} — {Heading}";

        /// <summary>送去嵌入的完整文字：麵包屑一行 ＋ 內容。</summary>
        public string EmbeddingInput => $"{Breadcrumb}\n{Text}";
    }

    /// <summary>
    /// 要切的一筆內容。<paramref name="Url"/> 由呼叫端解析好
    /// （FAQ 沒有獨立網址，要指到所屬分類頁 —— 見 <c>AiIndexBuilder</c>）。
    /// </summary>
    public sealed record AiChunkSource(
        int ContentItemId, int PublishedVersionId, byte ContentType, string? Url, string SnapshotJson);

    /// <summary>
    /// 切塊。回空陣列代表這一筆不進索引（沒有網址、內容不值得索引、或切不出文字）。
    /// </summary>
    public static IReadOnlyList<AiChunk> Build(AiChunkSource source)
    {
        if (string.IsNullOrWhiteSpace(source.Url)) return [];

        JsonNode? root;
        try { root = JsonNode.Parse(source.SnapshotJson); }
        catch (JsonException) { return []; }
        if (root is not JsonObject snapshot) return [];

        // 🔴 「值不值得被索引」全專案只有一份判斷（27 個骨架療程、空的法務頁、seo.noIndex）。
        //    不要在這裡另寫一套 —— 那正是 2026-09-15 那個「sitemap 收了 29 個 noindex 網址」的形狀。
        if (!Indexability.IsIndexable(source.ContentType, snapshot)) return [];

        var type = (ContentType)source.ContentType;
        var fields = snapshot["fields"] as JsonObject;

        // 搜尋頁與 404 自己不該進語料（同 SearchHandler 的理由）。
        if (type == ContentType.Page && SystemKeyOf(fields) is "search" or "not-found") return [];
        if (type == ContentType.Term && IntOf(fields, "termType") == TermTypeTag) return [];

        var title = snapshot["title"]?.GetValue<string>() ?? "";
        var sections = SectionsOf(type, snapshot, fields).ToList();
        if (sections.Count == 0) return [];

        var isLegacyMainSite = type == ContentType.Article && IntOf(fields, "sourceSite") == SourceSiteMain;
        var weight = isLegacyMainSite ? LegacyMainSiteWeight : 1.0;
        var citable = !isLegacyMainSite;

        var chunks = new List<AiChunk>();
        foreach (var section in Merge(sections))
        {
            foreach (var text in Pack(section.Text))
            {
                chunks.Add(new AiChunk(
                    source.ContentItemId, source.PublishedVersionId, source.ContentType,
                    source.Url!, title, section.Heading,
                    section.Boost * weight, citable, text));
            }
        }

        return chunks;
    }

    // ════════════════════════════════════════════════════════════════════
    // 各單元的段落切法
    // ════════════════════════════════════════════════════════════════════

    private sealed record Section(string Heading, string Text, double Boost = 1.0);

    private static IEnumerable<Section> SectionsOf(ContentType type, JsonObject snapshot, JsonObject? fields)
    {
        var summary = Collapse(snapshot["summary"]?.GetValue<string>() ?? "");
        if (summary.Length > 0) yield return new Section("", summary);

        if (fields is null) yield break;

        IEnumerable<Section> body = type switch
        {
            ContentType.Treatment => TreatmentSections(fields),
            ContentType.Concern => ConcernSections(fields),
            ContentType.Doctor => DoctorSections(fields),
            ContentType.Clinic => ClinicSections(fields),
            ContentType.Case => CaseSections(fields),
            ContentType.Faq => FaqSections(snapshot, fields),
            ContentType.Term => [new Section("", Collapse(Flatten(fields["intro"])))],
            ContentType.Article or ContentType.Page => BodyBlockSections(fields["bodyBlocks"], fields["lead"]),
            _ => [],
        };

        foreach (var section in body)
        {
            if (section.Text.Length > 0) yield return section;
        }
    }

    /// <summary>
    /// 文章與頁面的內文。
    /// <para>
    /// 文章的 <c>bodyBlocks</c> 是區塊陣列（<c>paragraph</c>／<c>heading</c>／<c>list</c>／
    /// <c>figure</c>／<c>note</c>／<c>table</c>），**每個 heading 開一個新段** ——
    /// 實測 1083 篇共 20,600 個區塊、1,598 個 H2，而 docs/03 §4 ② 要求的「H2 用完整問句」
    /// 讓那些標題天生就是好的檢索錨點。
    /// </para>
    /// <para>
    /// ⚠️ 頁面的 <c>bodyBlocks</c> 形狀是**每一頁自己一套**（品牌理念是 pillars／timeline／
    /// teamPreview，新中式美學是 meta／toc／faqs／sister），不是區塊陣列。
    /// 那種情況退回「每個最上層鍵一段」，用鍵名當不了標題就不給標題。
    /// </para>
    /// </summary>
    private static IEnumerable<Section> BodyBlockSections(JsonNode? bodyBlocks, JsonNode? lead)
    {
        var leadText = Collapse(Flatten(lead));
        if (leadText.Length > 0) yield return new Section("", leadText);

        var parsed = ParseMaybeJsonString(bodyBlocks);

        if (parsed is JsonArray blocks)
        {
            var heading = "";
            var buffer = new StringBuilder();

            foreach (var block in blocks)
            {
                if (block is not JsonObject b) continue;
                var kind = b["type"]?.GetValue<string>() ?? "";

                if (kind == "heading")
                {
                    if (buffer.Length > 0)
                    {
                        yield return new Section(heading, Collapse(buffer.ToString()));
                        buffer.Clear();
                    }
                    heading = Collapse(b["text"]?.GetValue<string>() ?? "");
                    continue;
                }

                var text = BlockText(b, kind);
                if (text.Length > 0) buffer.Append(text).Append('\n');
            }

            if (buffer.Length > 0) yield return new Section(heading, Collapse(buffer.ToString()));
            yield break;
        }

        if (parsed is JsonObject obj)
        {
            foreach (var (key, value) in obj)
            {
                var text = Collapse(Flatten(value));
                if (text.Length > 0) yield return new Section("", text);
            }
        }
    }

    private static string BlockText(JsonObject block, string kind) => kind switch
    {
        // ⚠️ 圖片只取說明文字，不取網址（`figure.image.src` 進了語料就是一串沒有意義的雜訊）。
        "figure" => Collapse(block["caption"]?.GetValue<string>() ?? ""),
        "list" => Collapse(Flatten(block["items"])),
        "table" => Collapse($"{Flatten(block["headers"])} {Flatten(block["rows"])}"),
        _ => Collapse(block["text"]?.GetValue<string>() ?? ""),
    };

    private static IEnumerable<Section> TreatmentSections(JsonObject f)
    {
        yield return new Section("", Collapse(Text(f, "subtitle")));

        yield return HeadedSection(f["indications"], "適應症", node =>
            Join(Items(node, "items").Select(i => $"{Text(i, "title")}：{Text(i, "desc")}")));

        yield return HeadedSection(f["mechanism"], "療程原理", node => Join(Strings(node, "paragraphs")));

        var duration = Text(f, "durationText");
        var sessions = Text(f, "sessionsText");
        if (duration.Length > 0 || sessions.Length > 0)
            yield return new Section("療程時間與建議次數", Collapse($"療程時間：{duration}。建議次數：{sessions}。"));

        yield return HeadedSection(f["aftercare"], "術後照護", node =>
            Join(Items(node).Select(i => $"{Text(i, "when")}：{Text(i, "desc")}")));

        yield return HeadedSection(f["contraindications"], "禁忌症與注意事項", node =>
            Join([.. Strings(node, "items"), Text(ParseMaybeJsonString(node) as JsonObject, "note")]));

        yield return HeadedSection(f["facts"], "療程事實一覽", LabelValue);
        yield return HeadedSection(f["deviceInfo"], "儀器資訊", LabelValue);

        yield return HeadedSection(f["steps"], "療程流程", node =>
            Join(Items(node).Select(i => $"{Text(i, "title")}：{Text(i, "desc")}")));
    }

    private static IEnumerable<Section> ConcernSections(JsonObject f)
    {
        yield return HeadedSection(f["symptoms"], "常見症狀", node => Join(Strings(node, "paragraphs")));

        yield return HeadedSection(f["causes"], "成因", node =>
            Join([Text(ParseMaybeJsonString(node) as JsonObject, "intro"),
                  .. Items(node, "facts").Select(i => $"{Text(i, "label")}：{Text(i, "text")}")]));

        yield return HeadedSection(f["selfCheckGuide"], "自我檢視", node =>
            Join([Text(ParseMaybeJsonString(node) as JsonObject, "intro"),
                  .. Items(node, "types").Select(i => $"{Text(i, "title")}：{Collapse(Flatten(i?["points"]))}")]));

        yield return HeadedSection(f["whenToSeeDoctor"], "什麼時候該就醫", node => Join(Strings(node, "items")));
    }

    private static IEnumerable<Section> DoctorSections(JsonObject f)
    {
        // ⚠️ 14 位團隊成員裡有一位不是醫師（藝術總監，`isPhysician`）——
        //    語料裡一律稱醫師的話，AI 就會把她講成醫師（CLAUDE.md 關鍵數字）。
        var isPhysician = f["isPhysician"]?.GetValueKind() == JsonValueKind.True;
        var role = isPhysician ? "醫師" : "團隊成員";
        var jobTitle = Collapse(Text(f, "jobTitle").Replace("\n", "、"));
        var specialty = Text(f, "specialty");

        yield return new Section("職稱與專長",
            Collapse($"身分：{role}。職稱：{jobTitle}。專長：{specialty}。"));

        yield return HeadedSection(f["bio"], "簡介", node => Join(Strings(node, "paragraphs")));
        yield return HeadedSection(f["publications"], "著作與發表", node =>
            Join(Items(node).Select(i => $"{Text(i, "title")} {Text(i, "meta")}")));

        var credentials = Join(Items(f["credentials"]).Select(i => Text(i, "text")));
        if (credentials.Length > 0) yield return new Section("經歷與資格", credentials);
    }

    private static IEnumerable<Section> ClinicSections(JsonObject f)
    {
        yield return new Section("地址與聯絡方式",
            Collapse($"地址：{Text(f, "address")}。電話：{Text(f, "phone")}。"));

        // 🔴 營業時間**必須合成人看得懂的中文**。原始資料是
        //    `[{dayOfWeek:1, startTime:"09:00:00", endTime:"13:00:00"}, …]` 十列 ——
        //    直接攤平就是一串數字，「幾點營業」這種最常見的問題永遠檢索不到。
        var hours = BusinessHours(f["businessHours"]);
        if (hours.Length > 0) yield return new Section("營業時間", hours);

        yield return HeadedSection(f["transportInfo"], "交通方式", node =>
            Join(Items(node).Select(i => $"{Text(i, "title")}：{Collapse(Flatten(i?["points"]))}")));

        yield return new Section("關於這個據點", Collapse(Flatten(f["intro"])));
    }

    /// <summary>⚠️ <c>dayOfWeek</c> <b>0 是星期日</b>（docs/08 §C-7）。差一格整排錯開。</summary>
    private static string BusinessHours(JsonNode? node)
    {
        string[] names = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
        var byDay = new SortedDictionary<int, List<string>>();

        foreach (var item in Items(node))
        {
            if (item is null) continue;
            var day = item["dayOfWeek"]?.GetValue<int>() ?? -1;
            if (day is < 0 or > 6) continue;

            var start = Text(item, "startTime");
            var end = Text(item, "endTime");
            if (start.Length == 0 || end.Length == 0) continue;

            // "09:00:00" → "09:00"
            var span = $"{start[..Math.Min(5, start.Length)]}–{end[..Math.Min(5, end.Length)]}";
            if (!byDay.TryGetValue(day, out var list)) byDay[day] = list = [];
            list.Add(span);
        }

        if (byDay.Count == 0) return "";

        // 週一排前面、週日排最後，與前台的 HOURS_WEEKDAY_LABELS 一致。
        var ordered = byDay.Keys.OrderBy(d => (d + 6) % 7);
        return Collapse(string.Join("；", ordered.Select(d => $"{names[d]} {string.Join("、", byDay[d])}")));
    }

    private static IEnumerable<Section> CaseSections(JsonObject f)
    {
        var narrative = ParseMaybeJsonString(f["narrative"]) as JsonObject;

        if (narrative?["facts"] is JsonObject facts)
        {
            var labels = new Dictionary<string, string>
            {
                ["condition"] = "狀況", ["mainConcern"] = "主要困擾", ["treatmentName"] = "療程",
                ["sessions"] = "次數", ["period"] = "療程期間", ["doctorName"] = "醫師", ["recovery"] = "恢復期",
            };
            var parts = labels
                .Where(kv => Text(facts, kv.Key).Length > 0)
                .Select(kv => $"{kv.Value}：{Text(facts, kv.Key)}");
            yield return new Section("個案基本資料", Collapse(string.Join("。", parts)));
        }

        foreach (var section in Items(narrative?["sections"]))
        {
            yield return new Section(
                Text(section, "heading"),
                Collapse(Flatten(section?["paragraphs"])));
        }

        var timeline = Join(Items(narrative?["timeline"])
            .Select(i => $"{Text(i, "when")} {Text(i, "title")}：{Text(i, "text")}"));
        if (timeline.Length > 0) yield return new Section("療程時間軸", timeline);

        var variance = Text(f, "individualVarianceStatement");
        if (variance.Length > 0) yield return new Section("個別差異說明", variance);
    }

    /// <summary>
    /// FAQ：問題是 <c>ContentItems.Title</c>，答案有兩版（docs/04 §2）。
    /// <para>AI 摘要版單獨成一塊並加成 —— 它是唯一「為了給機器抽取」而寫的欄位。</para>
    /// </summary>
    private static IEnumerable<Section> FaqSections(JsonObject snapshot, JsonObject f)
    {
        var question = Collapse(snapshot["title"]?.GetValue<string>() ?? "");
        var ai = Text(f, "aiAnswer");
        var web = Text(f, "webAnswer");

        if (ai.Length > 0) yield return new Section(question, ai, FaqAiAnswerWeight);
        if (web.Length > 0 && web != ai) yield return new Section(question, web);
    }

    private static Section HeadedSection(JsonNode? node, string fallbackHeading, Func<JsonNode?, string> body)
    {
        var parsed = ParseMaybeJsonString(node);
        var heading = parsed is JsonObject obj ? Collapse(Text(obj, "heading")) : "";
        return new Section(heading.Length > 0 ? heading : fallbackHeading, Collapse(body(node)));
    }

    private static string LabelValue(JsonNode? node) =>
        Join(Items(node).Select(i => $"{Text(i, "label")}：{Text(i, "value")}"));

    // ════════════════════════════════════════════════════════════════════
    // 打包：把段落切成 350–700 字元、硬上限 900 的塊
    // ════════════════════════════════════════════════════════════════════

    /// <summary>
    /// 把相鄰的小段併起來，直到接近 <see cref="MinChunkChars"/>。
    ///
    /// <para>
    /// 🔴 <b>不合併的話，三分之一的塊會短於 100 字</b>（2026-09-18 實測 4,883 塊裡有 1,723 塊）——
    /// 一個 heading 配一句話就自成一塊，而那種塊在檢索時只會是雜訊：
    /// 它既搶了 top-K 的名額，本身又沒有足以回答問題的資訊。
    /// </para>
    /// <para>
    /// ⚠️ <b>加成不同的段落不可以併</b>（FAQ 的 AI 摘要版是唯一「為機器而寫」的欄位，
    /// 併進網頁版答案就等於把那個加成稀釋掉）。
    /// </para>
    /// <para>
    /// ⚠️ 併進來的段落，它的標題要**寫進內文**（<c>標題：內容</c>）——
    /// 中繼資料只留得下第一個標題，丟掉其餘的等於丟掉「這段在講什麼」。
    /// </para>
    /// </summary>
    private static IEnumerable<Section> Merge(List<Section> sections)
    {
        var buffer = new List<Section>();
        var length = 0;

        foreach (var section in sections)
        {
            if (buffer.Count > 0 && (buffer[0].Boost != section.Boost || length >= MinChunkChars))
            {
                yield return Flush(buffer);
                buffer.Clear();
                length = 0;
            }

            buffer.Add(section);
            length += section.Text.Length;
        }

        if (buffer.Count > 0) yield return Flush(buffer);

        static Section Flush(List<Section> group)
        {
            if (group.Count == 1) return group[0];

            var text = string.Join("\n", group.Select((s, i) =>
                i > 0 && s.Heading.Length > 0 ? $"{s.Heading}：{s.Text}" : s.Text));

            return new Section(group[0].Heading, text, group[0].Boost);
        }
    }

    /// <summary>
    /// ⚠️ 超長段落以句號為界切開，**相鄰塊重疊一句** ——
    /// 按固定字元數切會把中文句子劈半，那一半在檢索與生成兩邊都沒有用。
    /// </summary>
    private static IEnumerable<string> Pack(string text)
    {
        if (text.Length == 0) yield break;
        if (text.Length <= HardChunkChars) { yield return text; yield break; }

        var sentences = SplitSentences(text);
        var buffer = new StringBuilder();
        string? previous = null;

        foreach (var sentence in sentences)
        {
            if (buffer.Length > 0 && buffer.Length + sentence.Length > TargetChunkChars)
            {
                yield return buffer.ToString();
                buffer.Clear();

                // 重疊一句，但**不可以讓下一塊一開始就超過硬上限** ——
                // 2026-09-18 實測：少了這個判斷，一句長句配一句重疊會切出 1157 字的塊。
                if (previous is not null && previous.Length + sentence.Length <= HardChunkChars)
                    buffer.Append(previous);
            }
            buffer.Append(sentence);
            previous = sentence;
        }

        if (buffer.Length > 0) yield return buffer.ToString();
    }

    private static List<string> SplitSentences(string text)
    {
        var result = new List<string>();
        var start = 0;
        for (var i = 0; i < text.Length; i++)
        {
            if (text[i] is not ('。' or '！' or '？' or '\n' or ';' or '；')) continue;
            result.Add(text[start..(i + 1)]);
            start = i + 1;
        }
        if (start < text.Length) result.Add(text[start..]);

        // 一句就超過硬上限（沒有標點的長段）才退回硬切。
        var safe = new List<string>(result.Count);
        foreach (var sentence in result)
        {
            for (var i = 0; i < sentence.Length; i += HardChunkChars)
                safe.Add(sentence[i..Math.Min(i + HardChunkChars, sentence.Length)]);
        }
        return safe;
    }

    // ════════════════════════════════════════════════════════════════════
    // 小工具
    // ════════════════════════════════════════════════════════════════════

    /// <summary>區塊欄位在快照裡是<b>一個 JSON 字串</b>（API 存的是 <c>GetRawText()</c>），要再 parse 一次。</summary>
    private static JsonNode? ParseMaybeJsonString(JsonNode? value)
    {
        if (value is null || value.GetValueKind() == JsonValueKind.Null) return null;
        if (value.GetValueKind() != JsonValueKind.String) return value;

        var raw = value.GetValue<string>();
        if (raw.Length == 0 || (raw[0] != '[' && raw[0] != '{')) return value;

        try { return JsonNode.Parse(raw); }
        catch (JsonException) { return value; }
    }

    private static IEnumerable<JsonObject?> Items(JsonNode? node, string? key = null)
    {
        var parsed = ParseMaybeJsonString(node);
        var target = key is null ? parsed : (parsed as JsonObject)?[key];
        if (target is not JsonArray array) return [];
        return array.Select(x => x as JsonObject);
    }

    private static IEnumerable<string> Strings(JsonNode? node, string key)
    {
        var parsed = ParseMaybeJsonString(node);
        if ((parsed as JsonObject)?[key] is not JsonArray array) return [];
        return array.Select(x => x?.GetValueKind() == JsonValueKind.String ? x.GetValue<string>() : "");
    }

    private static string Text(JsonObject? obj, string key)
    {
        if (obj?[key] is not JsonNode node) return "";
        return node.GetValueKind() == JsonValueKind.String ? Collapse(node.GetValue<string>()) : "";
    }

    /// <summary>
    /// 以句號串起來。⚠️ 原本就以句號結尾的要先去掉，否則會串出「…執行。。痘疤…」這種疊字
    /// ——嵌入模型與生成模型都會照單全收。
    /// </summary>
    private static string Join(IEnumerable<string> parts) =>
        Collapse(string.Join("。", parts
            .Where(p => !string.IsNullOrWhiteSpace(p) && p != "：")
            .Select(p => p.TrimEnd('。', '．', '.', ' '))
            .Where(p => p.Length > 0)));

    private static int? IntOf(JsonObject? fields, string key) =>
        fields?[key] is JsonValue v && v.TryGetValue<int>(out var i) ? i : null;

    private static string? SystemKeyOf(JsonObject? fields) =>
        fields?["systemKey"]?.GetValueKind() == JsonValueKind.String
            ? fields["systemKey"]!.GetValue<string>()
            : null;

    private static string Flatten(JsonNode? node) => SearchTextBuilder.Flatten(node);

    private static string Collapse(string text) => SearchTextBuilder.Collapse(text);
}
