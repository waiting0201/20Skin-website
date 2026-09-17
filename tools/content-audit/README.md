# tools/content-audit

21 個「區塊 JSON」欄位的**唯讀**稽核（`audit-json-fields.mjs`）。

```bash
node tools/content-audit/audit-json-fields.mjs            # 讀 apps/web/content/
SHOW_KEYS=1 node tools/content-audit/audit-json-fields.mjs # 連每一欄用到的鍵一起列
```

## 它在看什麼

| 項目 | 為什麼重要 |
|---|---|
| 非法 JSON | 前台 `parseBlocks()` 會靜默回 fallback —— 那一整區從頁面消失，HTTP 仍是 200 |
| **雙重編碼** | 指紋是「`JSON.parse` 一次之後還是字串」。成因見 `functions/Handlers/ContentHandler.cs` 的 `ReadBodyBlocks` 註解 |
| 最外層型別不符 | 文章要陣列、頁面要物件，弄反了就是整頁內文不渲染 |
| 實際用到的鍵 | 這些欄位要改成表單，**表單沒描述到的鍵不可以被吃掉**（例：560 篇文章的段落帶著 `runs`） |

## ⚠️ 讀的是匯出快照，不是資料庫

`apps/web/content/` 是離線稽核用的產物，**前台已經完全不使用它**（CLAUDE.md 決策 14）。
它可能落後正式庫 —— 要稽核當下的資料請先 `pnpm --filter web export:content`。

這支腳本不連資料庫、不打 API、不寫任何檔案。
