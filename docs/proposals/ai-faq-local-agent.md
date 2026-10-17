# 提案：AI FAQ 連本地端（院內 OpenClaw agent）

> **狀態：提案 · 未實作 · 未定案**（2026-10-17 規劃，Tim 指示「先不要實作，記錄到文件」）
>
> 🔴 **定案前，CLAUDE.md 決策 28 照舊有效**：AI 問答只依站上已發布內容回答、不使用模型的一般知識。
> 本提案要推翻其中兩條規則（見 §0），**不要因為這份文件存在就照它改程式**。
>
> 關鍵字：AI FAQ 連本地端、院內 agent、本地端 agent、OpenClaw、Telegram、Azure Service Bus、FAQ 批次上傳、FAQ 匯入接口

---

## 0. 需求與取捨

客戶在院內自架了一套 **OpenClaw**（目前接 Telegram），訓練了大量院內資訊。希望：

1. **網站 AI 問答改由院內 OpenClaw 回答**，連線方式**跟 Telegram 一樣**：院內主動連 Azure 取題、回答，Azure 不連進院內。
   院方因此**不用開 port、不用網域、不用 tunnel**。
2. **網站 FAQ 文字內容由院內批次上傳**，寫入即發布。

規劃過程中由 Tim 選定、**與現行決策衝突**的兩條：

| 取捨 | 衝突的現行規則 | 代價 |
|---|---|---|
| 問答**允許用 agent 自己的知識**回答 | 決策 28「絕不可退回用模型的一般知識回答醫療問題」 | agent 的知識不在站上 → 列不出來源；網站不存對話紀錄（docs/08 §I）→ 無從抽查它對外說了什麼；伺服器端護欄只剩確定性的風險字詞掃描 |
| agent 上傳的 FAQ **不經人確認直接上線** | docs/04 的 FAQ 應有審閱者 | 網站上會出現沒人看過的醫療問答，會被 Google 收錄 |

醫療廣告法規相關敘述請以主管機關函釋及院方法務意見為準。

---

## 1. AI 問答：院內主動取題 → 回答（Azure Service Bus）

```
病人 → POST /ai/ask ─▶ Function：檢索 → 送題到 Service Bus「ai-jobs」→ 在「ai-replies」等 session=jobId 的回覆（最多 30 秒）
                                              ▲ 院內 connector 用 AMQP 長連線收題（院內主動連出 443／5671）
                                              └─ 問本機 OpenClaw → 回覆送進「ai-replies」（SessionId=jobId）
```

### 1.1 中繼：Azure Service Bus（Standard，佇列 ＋ sessions）

- 新資源 `sb-20skin-web-prod`，建在 **`rg-20skin-web-prod`**（🔴 不是 `rg-20skin-prod`，那是預約系統）。
- 佇列 `ai-jobs`（訊息 TTL 30 秒）、`ai-replies`（**啟用 sessions**，`SessionId = jobId` 做一問一答配對 ——
  多個 Function 執行個體各自只收自己那一題的回覆）。sessions 只有 Standard 有。成本約每月 US$10 起（估算，上線前查價）。
- 身分：
  - Function App 的 MI：**Azure Service Bus Data Sender**（ai-jobs）＋ **Data Receiver**（ai-replies），不存金鑰。
  - 院內 connector：兩組 **entity 層級**的 SAS —— `ai-jobs` 只有 Listen、`ai-replies` 只有 Send。外流也只能收題、回答。
- 院內是否在線：connector 每 30 秒 `POST /agent/heartbeat`（整合鑰匙）→ 心跳 blob `system-state/agent-heartbeat.json`。
  60 秒沒更新就直接走 Gemini，不讓每題白等 30 秒。
- 新增套件 `Azure.Messaging.ServiceBus`；**不加 migration**。

### 1.2 `POST /ai/ask`（對前台契約不變，`SiteConsult.vue` 不用改）

`functions/Handlers/AiHandler.cs` 的 `AskAsync` 拆成三段，前後兩段兩條路共用：

1. **前段（不變）**：`aifaq.enabled` 開關、驗證、reCAPTCHA、頻率限制、嵌入、檢索。
2. **生成**：
   - 心跳 60 秒內有更新 → 送 job `{jobId, question, history, references:[{id:"S1",title,text}], createdAt}` 到 `ai-jobs`，
     `AcceptSessionAsync("ai-replies", jobId)` 等回覆，最多 30 秒。
   - 心跳過期、或 30 秒沒等到 → **退回現行 Gemini 路徑**（`IAiChatService.CompleteAsync`，只依站內內容），記 App Insights 事件。
   - agent 路徑下「沒有可引用片段就判未命中」不適用（否則 agent 的知識永遠用不到）。
3. **後段（不變）**：`StripSourceLine`、`UnsafeReasonAsync`（`RiskTerms` ＋ 金額掃描）、`ResolveSources`、`MissAsync`。
   🔴 agent 模式下風險掃描是**唯一剩下的伺服器端護欄**，一定要經過。

`IAiEmbeddingService` **維持 Gemini**：索引由 `AiIndexRefresh` Timer 在 Azure 建，不能綁院內那台開不開機；查詢與語料的向量也必須同一個模型。

### 1.3 回覆格式與整合鑰匙

- 回覆：`{jobId, answered, answer, sources:["S1"]}`。agent 不碰網址，來源由伺服器對映（決策 28 那條照留）。
  逾時才到的回覆沒有人收，由 TTL 自然清掉。
- 整合鑰匙（心跳與 FAQ 上傳共用）：header `X-Integration-Key`，Function App 只存 SHA-256 雜湊
  （app setting `Integration__ClinicKeySha256`）。不走後台帳密 —— 登入有 reCAPTCHA，機器過不了；後台帳號權限也太大。
  新 `functions/Handlers/AgentHandler.cs`，掛在 `functions/Routing/AppRouter.Public.cs`。

### 1.4 院內 connector（我們交付：`tools/clinic-agent-connector/`）

- **Node 程式**（OpenClaw 本身就是 Node，院內機器一定有 Node 22+），唯一相依 `@azure/service-bus`。
  設定值：網站網址、整合鑰匙、Service Bus 兩組連線字串（我們產生後交付）、OpenClaw gateway token。
- 流程：從 `ai-jobs` 收題 → 呼叫本機 `http://127.0.0.1:18789/v1/chat/completions`
  （`model: "openclaw/website"`、**不帶 `user`／`x-openclaw-session-key`**，每題獨立 session）→ 解析 → 送回 `ai-replies`。
  同時最多 3 題；超過 25 秒放棄該題；斷線指數退避重連。
- 附 README：安裝成常駐服務（Windows 服務／launchd／systemd）、怎麼確認在線。

### 1.5 🔴 OpenClaw 的安全事項（2026-10-17 查官方文件）

- OpenClaw Gateway 的 OpenAI 相容端點 **`/v1/chat/completions` 預設關閉**，設定 `gateway.http.endpoints.chatCompletions.enabled: true` 才會開。
- **它的 token 等同擁有者／管理者權限**：官方原文是「treat the endpoint as full operator access」，帶 shared-secret 時
  `x-openclaw-scopes` 也縮不了範圍；目標 agent 允許的工具它都能用。官方建議**只放 loopback／tailnet／私有入口，不要對公網開放**。
- 所以：**Gateway 只聽 localhost，gateway token 只存在院內 connector 的設定裡**，不會送到網站；網站與院內之間只走 Service Bus。
- 每次請求預設是新的 session；帶 `user` 才會延續同一段對話 —— connector **刻意不帶**，避免 A 病人的內容出現在 B 病人的答案裡。

### 1.6 院方的步驟

1. **新增網站專用 agent**：在 `agents.entries` 加 `website`（新版是以 id 為鍵的物件；舊版是 `agents.list` 陣列，以 `openclaw config schema` 為準）：
   - `tools.deny` 列 exec／write／edit／apply_patch／browser／訊息類；`tools.elevated.enabled: false`；只留讀取。
   - ⚠️ 各 agent 的 workspace 是分開的 —— 院內知識若在 `main` 的 workspace，要**複製或指向**到 `website`，否則它答不出來。
   - 系統指示：繁體中文、不報價、不保證療效、不知道就說不知道、依格式回來源編號。
   - ✅ 確認：跟 `website` 聊幾句答得出院內資訊；叫它「傳一則 Telegram 訊息」做不到。
2. **打開問答入口**：`gateway.http.endpoints.chatCompletions.enabled: true`，重新啟動。只給本機連，**不開防火牆、不接 tunnel**。
3. **安裝 connector**：填設定值、設開機自動啟動。✅ connector 的狀態指令顯示「已連上」。
4. **一起測試**：我們問 20 題常見問題，院方一起看答案，沒問題才開。

上線後：那台**不能關機、不能睡眠**（關掉時網站自動改回 Gemini，不會壞）；鑰匙外流要立刻通知換鑰；
調整 agent 的知識後網站答案會立刻改變，重要修改先在 Telegram 自己問過。

---

## 2. FAQ 批次上傳接口

### 2.1 `PUT /integrations/faq`（新 `functions/Handlers/FaqIntegrationHandler.cs`，同一把整合鑰匙）

- 一次最多 100 筆；**以 `slug` 為冪等鍵**（同 slug 再傳＝更新）→ 0 支 migration。
- 欄位對應 `functions/Models/Entities/ContentModels.cs` 的 `Faq`：`slug`、`question`（Title）、`webAnswer`、
  `aiAnswer`（必填，`CK_Faqs_AiAnswer_NotEmpty`）、`categorySlug`（見下方「分類規則」）、
  選填 `relatedTreatmentSlugs`。
- 寫入後**直接發布**，走 `ContentHandler` 既有的發布流程（版本快照、`SearchText` 重算）—— **不另寫一份**，
  否則公開端點讀快照讀不到（決策 14）。之後由既有的 `AiIndexRefresh` 進 AI 索引。
- `ReviewedBy` **留空**、`LastReviewedOn` 填上傳日 —— 那一欄對外代表「由誰確認過」，沒有人看過不能填醫師名。
- 逐筆回報 `created／updated／rejected(原因)`，一筆錯不擋整批。
- **不做刪除**：沒傳到的舊題不會被下架（避免一次漏傳就整批消失），要下架由後台處理。

### 2.2 分類規則：以網站「當下」的分類為準

**前提**：FAQ 分類是後台「分類與標籤」的資料，院方管理者可以隨時新增、改名、改 slug、刪除。
所以**不交付固定清單**（交出去就開始過期），改成院內隨時能查網站當下的清單。

- **查詢端點** `GET /integrations/faq/catalog`（同一把整合鑰匙）回三份清單：
  FAQ 分類（`TermType.FaqCategory`、可見）的 `name／slug`、療程的 `name／slug`、
  現有 FAQ 的 `slug／question／reviewed`（`ReviewedBy` 有沒有值）。**不快取**，後台一改，下一次查詢就看得到。
  connector 對應指令：`categories`、`treatments`、`faqs`（可加 `--json`，交給 OpenClaw 產生 FAQ 時直接挑）。
- **預檢** `PUT /integrations/faq?dryRun=true`：跑完全部驗證、逐筆回報結果，但不寫入。connector：`push-faq --check`。
- **比對用 slug，不用名稱**：分類改名不影響上傳。上傳時把 slug 解析成 `CategoryTermId` 存進去（FK），
  所以之後後台改 slug，**已上傳的題目不受影響**，只有沿用舊 slug 的新上傳會被退回。
- 比對不到 → 該筆 `rejected`，原因附上**網站當下可用的分類 slug 清單**。
- **換分類**：同 slug、改 `categorySlug` 重傳即可（upsert 會更新 `CategoryTermId`）。已有 `ReviewedBy` 的題目上傳會被退回（§3.5），那些要在後台改分類。
- **刪除分類**：既有規則已擋下 —— `ContentHandler.DeleteAsync` 對仍被引用的 term 回 409
  「仍有 N 筆內容引用此分類／標籤，無法刪除」。院方要先把題目換到別的分類再刪，**不會出現孤兒 FAQ**。
- **不自動建立分類**：分類會開出 `/faq/{category}/` 獨立頁，名稱、介紹文案與 SEO 由「分類與標籤」模型維護
  （docs/04 §3）；整合鑰匙能開新分類，等於外流時也能在網站上開新頁。需要新分類由院方在後台新增，再查 `categories` 拿 slug。
- **不退到預設分類（「其他」）**：題目會被放到錯的分類頁且沒有人發現；退回才會被看見。
- `relatedTreatmentSlugs` 同一套規則：任一個查不到 → **整筆退回**，不是略過那一個（略過的話院方以為已關聯，療程頁卻沒有出現）。
- 院方文件 8-4 有一張「分類變動時怎麼處理」對照表，改這裡的規則要同步那一張。
- **正式站實況（2026-10-17 查 `GET /term`、`GET /faq`）**：FAQ 分類 **6 個**、FAQ **51 題**（其中 25 題已有 `ReviewedBy`，上傳不會覆蓋）。

  | 分類 | slug | 題數 |
  |---|---|---|
  | 療程相關 | `treatment` | 25 |
  | 術後照護 | `aftercare` | 5 |
  | 看診與預約 | `visit` | 5 |
  | 費用與付款 | `fee` | 4 |
  | 院所資訊 | `clinic` | 12 |
  | 疾病相關 | 🔴 `untitled-1792027590012` | 0 |

  - 前五個就是種子的 mockup 那一組，STATUS「FAQ 五大分類兩份對不上」在正式站上**實際已是 mockup 版**，對本提案不再是前置條件。
  - 🔴 **「疾病相關」是院方 2026-10-15 在後台自己新增的**，證實分類真的會被院方增修 —— 但 slug 沿用了新增對話框的佔位值
    （`apps/admin/src/components/ListPage.vue` 的 `defaultSlug()` ＝ `untitled-${Date.now()}`），
    所以正式站上已經有 `/faq/untitled-1792027590012/` 這個網址，而且收進 sitemap。
    院內上傳時得填這串 slug 才歸得進去 —— **只靠 slug 比對對院方不友善**，見下方待決。

### 2.3 院內怎麼用

connector 附指令 `node connector.mjs push-faq faqs.json`（JSON 範例與欄位說明寫在 README）。
院方可請 OpenClaw 產出這個格式的檔案再上傳，或任何程式直接打這支 API。

---

## 3. 安全性

### 3.1 憑證盤點

| 憑證 | 存在哪裡 | 能做什麼 | 外流的後果 | 怎麼收回 |
|---|---|---|---|---|
| Function App 的 MI | Azure（不是密鑰） | 送題到 `ai-jobs`、收 `ai-replies` | — | — |
| **整合鑰匙** `X-Integration-Key` | 院內 connector 設定檔；Function 只存 SHA-256 雜湊 | 心跳、**FAQ 上傳（直接發布）** | 🔴 **最嚴重**：可以在網站上發布任意 FAQ | 換 app setting 的雜湊，立即失效 |
| `ai-jobs` 的 SAS（只有 Listen） | 院內 connector 設定檔 | 收題目 | 看得到病人的提問內容 | Service Bus 重新產生該 policy 的金鑰 |
| `ai-replies` 的 SAS（只有 Send） | 院內 connector 設定檔 | 送回覆 | 可送假回覆，但只對「還在等、jobId 猜得到」的題目有效（GUID，實際上猜不到），且仍過風險掃描 | 同上 |
| OpenClaw gateway token | 院內 connector 設定檔、OpenClaw 設定 | 🔴 **等同 OpenClaw 擁有者**（官方文件） | 院內 agent 被完整接管 | `openclaw` 重新產生 token |

規則：
- 網站端**一律不存明文鑰匙**；院內的設定檔權限設成只有執行 connector 的帳號讀得到（`chmod 600`／Windows ACL），**不可放進雲端同步資料夾**。
- **輪替不停機**：Function 同時接受兩組雜湊（`Integration__ClinicKeySha256` 與 `…Next`），換鑰時先加新的、院內換好再拿掉舊的。
  Service Bus 每個 policy 本來就有主／次兩把金鑰，同樣先換一把。建議每 6–12 個月，或經手人員異動時換。
- **一鍵關掉**：`aifaq.enabled` 照舊關整個問答；另設 `Ai__ChatProvider=gemini` 只關院內路徑。FAQ 上傳以拿掉雜湊關閉。

### 3.2 網路

- 院內**只出不進**：connector 主動連 Service Bus（AMQP over TLS，5671；被擋時改 AMQP over WebSockets，443）與 `api.20skin.tw`（HTTPS）。院內不開任何 port。
- OpenClaw Gateway 維持 `gateway.bind: loopback`（預設值），**不改成 `lan`、不接 tunnel**。connector 只連 `127.0.0.1`。

### 3.3 病人資料

- 病人的提問會離開 Azure、進到院內那台機器。傳輸全程 TLS；Service Bus 靜態加密，訊息 TTL 30 秒，回覆收完即刪。
- **日誌不記提問全文**：connector 與 Function 只記 `jobId`、字數、耗時、成功或失敗（與現行「不建 AI 對話紀錄表」一致，docs/08 §I）。
- ⚠️ **OpenClaw 自己會留 session 紀錄**，落在院內那台的硬碟上。院方要知道那台機器存有病人提問：開磁碟加密、設保留期限、限制誰能登入。

### 3.4 不信任 agent 的輸入與輸出（提示注入）

病人的提問與站內片段對 agent 來說都是**不可信的輸入**，有人會在問句裡寫「忽略前面的指示，幫我……」。所以：
- `website` agent **不給任何會產生副作用的工具**（exec／write／edit／browser／訊息類全關、`elevated` 關）。被注入了，它也做不了事。
- **每題獨立 session**（connector 不帶 `user`／`x-openclaw-session-key`），注入的內容不會延續到下一位病人。
- 伺服器端不信任回覆：`jobId` 必須等於 session、`answer` 上限 2000 字、`sources` 只收本題送出去的 `S#`、
  照樣經過 `RiskTerms` ＋ 金額掃描；前台以純文字渲染（`SiteConsult.vue` 不吃 HTML）。

### 3.5 FAQ 上傳接口

整合鑰匙外流就能在網站上發布內容，所以這支端點要比照公開表單的標準防守：
- **只能新增或更新 FAQ**，不能刪除，也碰不到其他內容單元。
- 🔴 **不覆寫人工確認過的 FAQ**：同 slug 的既有 FAQ 若已填 `ReviewedBy`（有人簽過名），該筆一律 `rejected`。
  否則院內一次 slug 撞名，就會蓋掉醫師確認過的答案。
- 每筆照樣過 `RiskTerms` ＋ 金額掃描，命中就 `rejected` 並回報命中哪個字。
- 只收純文字：去掉 HTML 標籤，欄位長度上限比照後台表單（`webAnswer` 400 字、`aiAnswer` 100 字的規格見 docs/04 §2，上限放寬一倍容錯）。
- 頻率限制另開 bucket（例：每小時 10 次批次）。
- 每次上傳在 App Insights 記一筆事件：筆數、slug 清單、結果、來源 IP —— 出事時查得到「哪一批、什麼時候進來的」。

### 3.6 院內主機

- 用**專用的作業系統帳號**跑 OpenClaw 與 connector，不用管理者帳號。
- 開自動更新（作業系統、Node、OpenClaw）。
- 那台機器同時接 Telegram：`website` agent 與 Telegram 用的 agent **分開**，網站這條路徑碰不到 Telegram 那一個的工具與記憶。

## 4. 網站端要提供給院方的資訊

給院方的文件（`output/20SKIN-院內AI助理串接說明`）第 02 章列的是同一份清單；這裡多記「怎麼產生、注意什麼」。

| 項目 | 什麼時候給 | 怎麼產生 | 注意 |
|---|---|---|---|
| 連接程式 `tools/clinic-agent-connector/` | 開始設定前 | 實作產出：`connector.mjs`（`check`／`run`／`status`／`push-faq [--check]`／`categories`／`treatments`／`faqs [--json]`）、`connector.config.example.json`、`install-service.ps1`／`install-launchd.sh`／`install-systemd.sh` | 院方文件已寫死這幾個指令與檔名，**實作要照著做**，改名就要同步改院方文件 |
| 網站整合鑰匙 | 開始設定前 | `openssl rand -base64 32` 產生；SHA-256 雜湊寫進 Function App 的 `Integration__ClinicKeySha256` | 明文**不留在我們這邊**（交付後刪除），只留雜湊 |
| 收題連線字串 | 開始設定前 | `ai-jobs` 佇列建一條**只有 Listen** 的 SAS policy，取其連線字串（`az servicebus queue authorization-rule create --rights Listen` → `keys list`） | entity 層級，不是 namespace 層級 |
| 回答連線字串 | 開始設定前 | `ai-replies` 佇列建一條**只有 Send** 的 SAS policy | 同上 |
| 網站 API 位址 | 開始設定前 | `https://api.20skin.tw/api/v1`，預填在範例設定檔 | 自訂網域上線前要改成 `*.azurewebsites.net` 那一個 |
| 分類、療程、現有 FAQ 的查詢 | 隨時 | **不交付固定清單**：connector 的 `categories`／`treatments`／`faqs` 即時查 `GET /integrations/faq/catalog`（§2.2） | 分類在後台可增修刪，固定清單會過期 |
| 回答規範文字 | 已附在院方文件第 03 章 | 由 `AiHandler.SystemInstruction` 改寫成院方看得懂的版本 | 改了 `SystemInstruction` 的規則要同步院方文件 |
| 聯合測試題組 | 聯合測試前 | 沿用 `ai-index-inspect --query` 的驗收題組，補到約 20 題（加入價格、保證療效、懷孕、指定醫師、要求忽略指示這幾類） | 同一份題組在切換前後各跑一次比對 |
| 聯絡窗口 | 開始設定前 | 指定一位聯絡人 | 鑰匙外流時的停用流程由這個人接 |

**交付方式**：鑰匙與兩組連線字串用一次性的加密連結交付，不走 Telegram、LINE、email；測試題組可以一般方式寄送。

## 5. 定案後要同步的文件

- CLAUDE.md：改寫決策 28（agent 路徑、允許 agent 知識、退回 Gemini、護欄只剩確定性掃描、附法規註記）；
  新增「院內整合」決策（Service Bus 院內主動連出、sessions 配對、整合鑰匙、FAQ 以 slug upsert 並直接發布、`ReviewedBy` 留空）。
- docs/04 §4、docs/02 §6（「AI 介接方式未定」作廢）、docs/07（Service Bus 資源、MI 角色、SAS 範圍、app settings）、
  docs/10 與 `openapi.yaml`（`/agent/heartbeat`、`/integrations/faq`、`/integrations/faq/catalog`）、STATUS.md。

## 6. 驗證（實作時）

1. 本機 `func start` ＋ 開發用 Service Bus namespace ＋ connector 接一個假的 OpenAI 相容服務 → `curl POST /ai/ask` 拿到 agent 的答案與來源。
2. 停掉 connector → 60 秒後 `/ai/ask` 自動走 Gemini；回覆超過 30 秒 → 該題走 Gemini、遲到的回覆被丟棄。
3. 假 agent 回「保證有效」→ 被掃描改成未命中文案。
4. `push-faq` 傳 3 筆（新增／同 slug 更新／缺 `aiAnswer`）→ 回報正確；`/faq/` 與分類頁看得到。
5. `node tools/api-smoke/read.mjs` 全綠；接真 OpenClaw 後跑 `ai-index-inspect --query` 題組比對。

## 7. 待決

1. **上傳的分類要不要也接受「名稱」**（例：`"category": "疾病相關"`）：OpenClaw 與院方人員想的都是中文名稱，
   而 slug 可能是 `untitled-…` 這種佔位值。做法是 `categorySlug` 與 `category`（名稱，完全相同才算）擇一必填，兩者都給時必須指向同一個分類。
   代價是名稱在後台改了之後，用舊名稱的上傳會被退回（與 slug 改了一樣，退回時附可用清單）。
2. **`untitled-…` 佔位 slug 是後台的問題，不只是本提案的**：新增對話框給佔位值、使用者沒改就存檔，網址就這樣上線。
   要嘛新增時強制改掉（驗證拒絕 `untitled-` 開頭），要嘛至少在清單上標示出來。「疾病相關」那一筆目前 0 題，現在改 slug 只影響一個空的分類頁。

## 8. 待向院方確認

1. 那台機器是否 24 小時開機。
2. FAQ 能否提供穩定的 slug，以及對得上站上分類的 `categorySlug`。
3. OpenClaw 單題回應時間、可同時處理幾題。

## 參考

- 給院方的串接說明：`output/20SKIN-院內AI助理串接說明.html`（PDF 同名）

- [OpenClaw — OpenAI HTTP API（Gateway）](https://docs.openclaw.ai/gateway/openai-http-api)
- [OpenClaw — Multi-Agent Sandbox & Tools](https://docs.openclaw.ai/hi/tools/multi-agent-sandbox-tools.md)
