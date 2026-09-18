# tools/ai-index-inspect — AI 語料切塊的唯讀檢查

站內 AI 問答（CLAUDE.md 決策 28）的語料長什麼樣子，用這支看。

🔴 **它不建索引，也不會花任何 API 費用。** 索引一律由 API 的 `AiIndexRefresh` Timer 建 ——
全量約 2,500 塊分 25 批嵌入約兩分鐘，放得進 Timer 的 5 分鐘預算，
而「全量」本來就等於「manifest 為空的增量」，沒有理由維護第二套接線。

---

## 兩種用法

```bash
# ① 乾跑：只連唯讀 SQL、只切塊，不碰 Gemini、不碰 Blob
SKIN20_EXPORT_SQL='Server=localhost,1433;Database=20skin-website;...' \
  dotnet run --project tools/ai-index-inspect -- --dry-run --out /tmp/chunks.txt

# ② 倒出線上索引：AI 現在到底看得到什麼
STORAGE_ACCOUNT=st20skinweb \
  dotnet run --project tools/ai-index-inspect -- --dump --out /tmp/chunks.txt
```

`--dry-run` 是**零成本、必跑的驗收**：切壞了不會有任何錯誤訊息，
症狀是「AI 答非所問」或「站上明明有寫卻說不知道」。

`--dump` 是上線後除錯唯一有用的工具 —— 回答怪怪的時候，先看它讀到的是什麼。

---

## 報告裡要看什麼

| 欄位 | 怎麼判斷 |
|---|---|
| 各型別塊數 | 療程只有個位數是**正常的**：28 項裡只有 1 項有完整內容，其餘被 `Indexability` 擋掉 |
| 平均字元 | 目標 350–700。醫師偏低是資料問題（13/14 位個人資料仍空白），不是切法問題 |
| **超過 900 字的塊** | **必須是 0**。不是 0 代表打包沒生效 |
| 短於 100 字的塊 | 少量正常（FAQ 的 AI 摘要版本來就 60–100 字），大量代表相鄰小段沒有被合併 |
| 不可引用的比例 | 約 35%（主站 692 篇舊文）。它們**降權且不列入來源清單**，只當背景 |

⚠️ 另外**一定要用眼睛抽查 10 塊**：逐一開對應頁面，確認那段文字真的原樣在那一頁上。
切塊把相鄰兩篇的內容串在一起這種錯，統計數字看不出來。

---

## 與 API 共用原始碼，不是抄一份

`AiIndexInspect.csproj` 以 `<Compile Include>` 連結
`Visibility.cs`／`Indexability.cs`／`SearchTextBuilder.cs`／`ContentTypeLabels.cs`／
`AiChunker.cs`／`AiIndexFormat.cs`／`Enums.cs`（理由與 `ContentExport.csproj` 逐字相同）。

🔴 切塊規則若在這裡分岔，這支工具就會「檢查一份 API 根本不會產生的語料」，
而那種錯誤**看起來完全正常**。

⚠️ 被連結的檔案的相依上限是 `Models/Entities/Enums.cs`（它本身無相依）。
往 `AiChunker.cs` 加相依之前，先在這裡 build 一次。
