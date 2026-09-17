# tools/content-roundtrip

21 個結構化欄位的 **round-trip 回歸測試**。

```bash
node --experimental-strip-types --import ./tools/content-roundtrip/register.mjs \
     tools/content-roundtrip/check.mjs
```

## 它在驗什麼

後台的 `apps/admin/src/units/schemas/` 是**第二份形狀定義** —— 真實來源是前台的型別
（`apps/web/app/data/*.ts`）。抄錯不會有編譯錯誤，症狀是**前台那一區靜默消失**
（`parseBlocks()` 回 fallback，HTTP 仍是 200，仍收在 sitemap 裡）。

這支腳本把正式資料整批走一次：

```
parseStructured →（完全不編輯）→ toWire → 與原值深度相等比對
```

三個把關：

| 檢查 | 抓的是什麼 |
|---|---|
| 往返一致 | schema 抄錯、鍵名打錯、鍵被吃掉 |
| **未宣告的鍵有沒有活下來** | 560/1083 篇文章的段落帶著 `runs`，前台不讀但不可以刪 |
| 空白值 | 新建內容時每一欄要收斂成 `null`——吐 `{}` 的話文章與頁面的內文會被 API 擋下新增 |

## 讀懂輸出

- `ℹ 沒有 schema 而走原始 JSON 模式` —— 預期行為（沒有對應表單的頁面）
- `ℹ 空值正規化` —— `emptyIsNull` 把「每一格都空的物件」收斂成 null，刻意的
- `✗` —— 真的有問題，**不要忽略**

## ⚠️ 兩件事

1. 讀的是 `apps/web/content/` 的匯出快照，可能落後正式庫。要驗當下的資料請先
   `pnpm --filter web export:content`。
2. `register.mjs`／`ts-resolver.mjs` 只是讓 Node 吃得下後台那些沒有副檔名的
   TypeScript import，不做任何轉譯。
