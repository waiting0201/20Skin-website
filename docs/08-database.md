# 08 — 資料庫規劃

> 範圍：**以功能單元為單位**規劃資料表。schema 由 `functions/Data/Migrations` 的 EF Core migrations 定義，是本專案的產出（[07-deployment.md](07-deployment.md) §5）。
>
> 建模依據：[02-backend-cms.md](02-backend-cms.md) 的 9 個內容模型與權限設計、[06-page-inventory.md](06-page-inventory.md) §5 的 31 個後台畫面、[04-ai-faq.md](04-ai-faq.md) 的題庫規格。

**三個本次指定的前提**（2026-09-07）：

| 指定 | 落實 |
|---|---|
| **以功能單元為劃分依據** | 全文以 §A–§H 八個功能單元組織，每個單元對應後台畫面群組 |
| **不做 log** | 不建操作日誌、登入紀錄、搜尋日誌。原與 [02-backend-cms.md](02-backend-cms.md) §4 相衝，**2026-09-11 已確認拿掉並同步全部文件**，見 §I |
| **後台帳號不用 email** | 登入識別為 `UserName`，email 降為選填的通知欄位。超級管理員種子帳號 `sa@system.local` / `Admin@123` |
| **不做雙因素**（2026-09-11 追加） | `Users` 移除三個 TwoFactor 欄位、`TwoFactorRecoveryCodes` 整張表刪除。⚠️ 連帶後果見 §A-5 |
| **不做媒體庫**（2026-09-11 追加） | `MediaAssets`／`MediaUsages` 整組刪除，圖片改成擁有者表上的內嵌欄位。見 §0 決策四 |

**合計 35 張表。**

---

## 0. 先講四個貫穿全域的決策

### 決策一：九個內容模型共用一張主幹表

三段式工作流、版本歷程、排程發布／下架、SEO 區塊這四件事，在療程、醫師、困擾、文章、案例、FAQ、據點、頁面、分類與標籤上**規則完全一致**。因此建 `ContentItems` 當主幹，九個模型各自只存專屬欄位，以 PK＝FK 對應（EF Core 的 **TPT，table-per-type**）。

換來四件事：

- 工作流、版本、審核、SEO 各寫一次，不是九次
- **全站網址唯一性由一個 unique index 保證** —— 950 個 URL 不可能有兩頁撞路徑
- 建置期一次撈出全站內容（[07](07-deployment.md) §4 的 Dapper 用途）是一個查詢，不是九個 union
- 排程發布的 Timer trigger 掃一張表

代價是讀單筆療程要 join 兩張表。全站內容量約 950 筆、關聯數千筆，**這個資料庫的每一張表都能整個放進記憶體**，join 成本可忽略。不要為了省一次 join 把工作流複製九份。

### 決策二：不預留未定案的欄位

[02-backend-cms.md](02-backend-cms.md) §6 明文要求：AI 問答的資料介接尚未規劃，**未定之前不要先寫進 schema**。理由是「加一個用不到的欄位事小，為它做一次遷移事大」—— 沒有 staging，每次遷移都要向後相容（[07](07-deployment.md) §5）。

因此以下一律不建：AI 對話紀錄、FAQ 的「已推送／待推送」狀態、巢狀分類的 `ParentId`、預約與購物相關的任何東西。

### 決策三：定序（collation）分兩套

| 對象 | collation | 理由 |
|---|---|---|
| 資料庫預設 | `Chinese_Taiwan_Stroke_CI_AS` | 內容欄位是繁中，後台列表要能正確排序 |
| **`Slug`／`UrlPath`／`Redirects.FromPath`／`ToPath`** | **`Latin1_General_100_BIN2`** | 網址是位元組比對，不該做語言排序。BIN2 讓 index seek 最快、比對結果可預測，也避免「大小寫不同的網址被視為同一筆」這種難查的問題 |

⚠️ 這要在 migration 的欄位定義上逐欄指定（EF Core `.UseCollation()`），不能只設資料庫預設。

### 決策四：不做媒體庫，圖片是欄位的一部分

**2026-09-11 定案**（客戶指定）。上傳不做成媒體庫 —— 沒有「所有檔案」的清單畫面、沒有挑圖瀏覽器、沒有獨立的刪除入口。上傳只發生在**需要那張圖的欄位裡**，上傳完成就是那個欄位的值。

因此 `MediaAssets`／`MediaUsages` 兩張表**不存在**，`CoverMediaId`／`PhotoMediaId`／`OgImageMediaId` 這類外鍵也不存在。取而代之的是一組內嵌欄位，以 EF Core 的 **owned type** 落在擁有者自己那張表上：

| 欄位 | 型別 | 說明 |
|---|---|---|
| `{前綴}Url` | nvarchar(600) | 對外網址。架構中沒有 CDN，圖片由 Blob 直接服務，靠長效 `Cache-Control` |
| `{前綴}BlobPath` | nvarchar(400) | 換圖與刪內容時要靠它把舊檔案從 Blob 刪掉 |
| `{前綴}Alt` | nvarchar(300) NULL | ⚠️ 舊站 alt 普遍缺漏，遷移時要補（[02](02-backend-cms.md) §7 步驟 6） |
| `{前綴}Width`／`{前綴}Height` | int NULL | 回報端點讀檔頭量到的尺寸 |
| `{前綴}Variants` | nvarchar(max) NULL | 衍生尺寸（WebP／AVIF、`srcset`）的 JSON。⚠️ 用 JSON 是刻意的：衍生尺寸誰來產尚未定案（[07](07-deployment.md) §3），兩種做法確定後都不必再做一次 migration |

前綴共十處：`Treatments.Cover`、`TreatmentImages.Image`、`Doctors.Photo`、`Concerns.Cover`、`Articles.Cover`、`CaseImages.Image`、`ClinicPhotos.Image`、`Pages.Cover`、`Terms.Cover`、`SeoMeta.OgImage`。**圖庫明細列（`TreatmentImages`／`CaseImages`／`ClinicPhotos`）的圖片欄位 NOT NULL** —— 那些列的存在理由就是那張圖。

三個連帶後果，**都不是疏漏**：

1. **一個欄位獨佔一個 blob，不跨內容去重。** 上傳時 blob 名稱是隨機唯一值而不是內容雜湊 —— 兩個欄位選了同一張圖就是兩份位元組。沒有 `MediaUsages` 之後「還有誰在用這個檔案」無從查起，去重會讓「換圖就刪舊檔」變成可能刪掉別人正在用的檔案。多存一份位元組遠比斷圖便宜
2. **換圖、移除、刪內容時，舊檔案當場從 Blob 刪掉**（[11](11-backend-design.md) §9）。連帶：**版本還原救不回已經被刪掉的圖片** —— 還原只還原記錄
3. **只收圖片。** 非圖片檔案在後台沒有任何欄位可以承接，`media-private` 容器因此沒有任何內容欄位會用到。日後要放 PDF 是「內文檔案區塊」這個獨立需求

---

## A. 帳號與權限（7 張）

> 後台畫面：登入、帳號管理、角色權限設定（[06](06-page-inventory.md) §5）

### A-1 `Users`

| 欄位 | 型別 | 說明 |
|---|---|---|
| `Id` | int PK | |
| **`UserName`** | nvarchar(64) NOT NULL **UNIQUE** | **登入識別。不是 email。** 允許 `a-z0-9._-@`，比對不分大小寫 |
| `DisplayName` | nvarchar(64) NOT NULL | 後台顯示名稱 |
| `PasswordHash` | nvarchar(256) NOT NULL | ASP.NET Core `PasswordHasher` v3（PBKDF2-HMAC-SHA512）或 Argon2id |
| `SecurityStamp` | nvarchar(64) NOT NULL | 改密碼／停權時更換，使既發權杖失效 |
| `NotifyEmail` | nvarchar(256) **NULL** | **選填，僅供通知，非登入識別、不唯一、可留空** |
| `IsActive` | bit NOT NULL | 停用不刪除（內容的 `CreatedByUserId` 還指著它） |
| `MustChangePassword` | bit NOT NULL | 種子帳號為 1 |
| `DoctorId` | int NULL FK → `Doctors` | **「醫師」角色綁定自己的個人頁用** |
| `CreatedAt` / `UpdatedAt` | datetime2 | |

⚠️ **`sa@system.local` 長得像 email，但它是使用者名稱。** API 端不可對 `UserName` 做 email 格式驗證，也不可拿它當寄信位址 —— 這是「後台帳號不用 email」最容易被寫錯的地方。

⚠️ `DoctorId` 是 [02](02-backend-cms.md) §4「醫師僅可編輯自己的個人頁與自己署名的文章」的資料基礎。授權判斷＝`Users.DoctorId` 對上 `ContentItems.OwnerUserId` 或 `Articles.AuthorDoctorId`。**沒有這一欄，醫師角色就只能靠人工比對姓名**。

### A-2 `Roles`／`UserRoles`／`Permissions`／`RolePermissions`

- `Roles`（`Id`, `Code`, `Name`, `IsSystem`）—— 五個角色為種子資料且 `IsSystem=1`，**不可刪除**：`SuperAdmin`／`Editor`／`Doctor`／`Marketing`／`Reviewer`
- `UserRoles`（`UserId`, `RoleId`）—— 複合 PK
- `Permissions`（`Id`, `Code`, `Name`, `GroupName`）—— 細粒度權限碼
- `RolePermissions`（`RoleId`, `PermissionId`）—— 複合 PK

角色固定但**權限可調**，因為 [06](06-page-inventory.md) §5 把「角色權限設定」列為一個獨立後台畫面。若權限寫死在程式碼裡，那個畫面就無事可做。

必須存在的權限碼（[02](02-backend-cms.md) §4 的權限歸屬表逐條對應）：

```
content.{type}.edit      content.{type}.publish     content.submit
review.approve           review.reject
seo.edit                 ← 行銷角色的核心：可寫 SeoMeta，不可寫本文
taxonomy.tag.create      taxonomy.category.manage   ← 後者限超級管理員（動 URL 結構）
page.legal.edit          ← 法務三頁，限超級管理員
home.arrange             menu.edit                  settings.edit
account.manage           redirect.manage            media.manage
```

⚠️ **`seo.edit` 與 `content.*.edit` 必須是兩個獨立權限。** 這是 SeoMeta 獨立成表的原因（§B-4）—— 權限檢查落在「表」的層級最不容易寫錯，落在「同一張表的某幾個欄位」則遲早有人漏掉。

### A-3 `LoginThrottles`

| 欄位 | 說明 |
|---|---|
| `Id` int PK | |
| `Dimension` tinyint | 1＝帳號、2＝來源 IP |
| `ThrottleKey` nvarchar(128) | `UserName` 或 IP 字串 |
| `FailedCount` int | |
| `FirstFailedAt` / `LastFailedAt` | datetime2 |
| `LockedUntil` | datetime2 NULL |

UNIQUE (`Dimension`, `ThrottleKey`)

[02](02-backend-cms.md) §4 定案：IP 白名單不做，因此登入次數限制必須**帳號與來源 IP 雙維度計數**（只鎖帳號擋不住撞庫，只鎖 IP 擋不住分散式嘗試）。`Dimension` 就是這兩個維度。

⚠️ **這是計數器，不是日誌。** 登入成功即刪除該帳號那筆、鎖定到期即歸零，不保留任何歷史。符合本次「不做 log」的指定。

### A-4 `RefreshTokens`

`Id`, `UserId` FK, `TokenHash`, `ExpiresAt`, `RevokedAt` NULL, `CreatedAt`

存權杖的 hash，不存明文。存在的理由只有一個：**停用帳號要能即時失效**。若改用短效（≤15 分）JWT ＋ `SecurityStamp` 檢查，這張表可以省掉 —— 開工前二選一，不要兩套都做。

### A-5 種子帳號

```
UserName            sa@system.local
DisplayName         系統管理員
Password            Admin@123          （寫進 migration 的是預先算好的固定 hash）
Roles               SuperAdmin
IsActive            1
MustChangePassword  1
```

三個必須知道的配套：

1. **hash 要預先算好、寫死在 migration 裡。** 不要在 migration 執行時即席計算 —— migration 必須可重現，同一份 migration 在不同環境跑出不同 hash 會很難查。
2. **`Admin@123` 是建置期預設密碼，上線前必須更換。** 後台路徑 `/admin/` 是客戶指定、且沒有 IP 白名單（[02](02-backend-cms.md) §4），登入端點直接暴露在公網掃描下，這組密碼不能留到正式環境。
3. 🔴 **沒有雙因素，所以這組密碼就是唯一憑證**（2026-09-11 院方決定不做雙因素）。原本三道防線（雙因素、IP 白名單、次數限制）現在只剩次數限制一道，而後台路徑 `/admin/` 是客戶指定、公開可猜。**上線前更換這組密碼不是建議事項，是必要條件**；密碼強度與輪替規則需一併訂定（[02](02-backend-cms.md) §4）。

---

## B. 內容主幹：工作流、版本、SEO（5 張）

> 後台畫面：審核佇列；SEO 區塊內嵌於九個模型的每一個編輯畫面

### B-1 `ContentItems`

| 欄位 | 型別 | 說明 |
|---|---|---|
| `Id` | int PK | |
| `ContentType` | tinyint NOT NULL | 1 療程／2 醫師／3 困擾／4 文章／5 案例／6 FAQ／7 據點／8 頁面／9 分類與標籤 |
| `Slug` | nvarchar(160) NULL | FAQ 用作頁內錨點；其餘為網址片段 |
| **`UrlPath`** | nvarchar(300) NULL | **完整路徑**，如 `/treatments/laser/picosure-pro/`。儲存時由應用程式計算寫入 |
| `Title` | nvarchar(200) NOT NULL | FAQ 的「問題」也放這裡 |
| `Status` | tinyint NOT NULL | 1 草稿／2 送審中／3 已發布／4 已下架 |
| `PublishAt` | datetime2 NULL | **排程發布：最早生效時間** |
| `UnpublishAt` | datetime2 NULL | 定時下架 |
| `PublishedVersionId` | int NULL FK → `ContentVersions` | 前台輸出的是這一版 |
| `SortOrder` | int NOT NULL | |
| `IncludeInSitemap` | bit NOT NULL DEFAULT 1 | 文章標籤種子為 0 |
| `IsSystemLocked` | bit NOT NULL | 系統頁與系統分類：不可刪、不可改 slug |
| `OwnerUserId` | int NULL FK → `Users` | 醫師角色「自己的內容」判定 |
| `CreatedByUserId`／`UpdatedByUserId` | int FK | |
| `CreatedAt`／`UpdatedAt` | datetime2 | |

索引：

```sql
UNIQUE INDEX IX_ContentItems_UrlPath  ON ContentItems(UrlPath) WHERE UrlPath IS NOT NULL;
UNIQUE INDEX IX_ContentItems_Id_Type  ON ContentItems(Id, ContentType);   -- 供 §D 的複合 FK
INDEX IX_ContentItems_Type_Status     ON ContentItems(ContentType, Status, SortOrder);
INDEX IX_ContentItems_PublishAt       ON ContentItems(PublishAt)   WHERE PublishAt IS NOT NULL;
INDEX IX_ContentItems_UnpublishAt     ON ContentItems(UnpublishAt) WHERE UnpublishAt IS NOT NULL;
```

⚠️ **`UrlPath` 的 filtered unique 是全站網址唯一性的唯一保證。** 950 個 URL 分散在九個模型裡，沒有這條約束就得靠九支程式各自檢查。

⚠️ **`PublishAt` 是「最早生效時間」，不是精確時間。** Timer trigger 到點後還要跑一次全站重建才會出現在網站上（[07](07-deployment.md) §4）。後台文案必須據此撰寫，不要寫「將於 14:00 發布」。

⚠️ **`Articles` 另有 `DisplayDate`，與 `PublishAt` 是兩回事**，見 §C-4。800 篇文章遷移時搞混這兩欄，全站文章日期就會變成遷移當天。

### B-2 `ContentVersions`

`Id`, `ContentItemId` FK, `VersionNo` int, `Title`, `Snapshot` nvarchar(max), `Note` nvarchar(300), `CreatedByUserId`, `CreatedAt`

UNIQUE (`ContentItemId`, `VersionNo`)

`Snapshot` 存 **JSON 完整快照**（主幹欄位 ＋ 該型別專屬欄位 ＋ SeoMeta ＋ 所有關聯 ＋ 首頁版位設定）。用 JSON 而不是「每個欄位一張歷史表」的理由：還原是整筆還原，不需要對單一歷史欄位下條件查詢；要比對差異時在應用層 diff 兩份 JSON 即可。

保留策略建議**每筆內容留最近 30 版**，超出的由 Timer trigger 清掉。

> ⚠️ **這是功能單元「版本歷程與還原」，不是操作日誌。** [02](02-backend-cms.md) §4 明列「可比對差異、一鍵還原」是後台功能，所以本次保留。若院方連版本功能也不要，刪掉這張表與 `ContentItems.PublishedVersionId` 即可，其餘 schema 不受影響。

### B-3 `ContentReviews`

`Id`, `ContentItemId` FK, `VersionId` FK, `SubmittedByUserId`, `SubmittedAt`, `Status` tinyint（1 待審／2 核准／3 退回）, `DecidedByUserId` NULL, `DecidedAt` NULL, `DecisionNote` nvarchar(1000) NULL, `RiskFlags` nvarchar(max) NULL

INDEX (`Status`, `SubmittedAt`) —— 審核佇列畫面的主查詢

- `DecisionNote` 在 `Status=3`（退回）時**必填**，對應「退回需填原因」
- `RiskFlags` 存送審時掃出的高風險字詞命中結果（JSON），供審核者重點檢視（[02](02-backend-cms.md) §5 兩層防護的第二層）

⚠️ **「退回需通知」怎麼實作**：帳號沒有必填 email，所以退回通知**不寄信**，改由後台儀表板的待辦清單呈現 —— 查 `ContentReviews WHERE Status=3 AND SubmittedByUserId=@me` 即可，**不需要額外的通知表**。日後若要 email 通知，再用選填的 `Users.NotifyEmail`。

### B-4 `SeoMeta`

| 欄位 | 說明 |
|---|---|
| `ContentItemId` int **PK ＋ FK**（1:1） | |
| `SeoTitle` nvarchar(200) NULL | 留空則由內容自動組出 |
| `MetaDescription` nvarchar(400) NULL | |
| `OgImage` 內嵌圖片欄位（`OgImageUrl`／`OgImageBlobPath`／`OgImageAlt`／…） | §0 決策四。**不是外鍵** —— 沒有媒體庫可以指 |
| `CanonicalOverride` nvarchar(300) NULL | |
| `NoIndex` bit NOT NULL DEFAULT 0 | **文章標籤種子為 1** |
| `StructuredDataOverride` nvarchar(max) NULL | JSON-LD 覆寫，一般情況留空由系統產生 |
| **`AiSummary`** nvarchar(300) NULL | **40–60 字直答式段落**，[03](03-seo-geo.md) GEO 策略的落地欄位 |
| `UpdatedByUserId`／`UpdatedAt` | |

獨立成表而非併入 `ContentItems` 的兩個理由：

1. **權限切分**（見 §A-2）—— 行銷角色可寫這張表、不可寫本文
2. SEO 欄位絕大多數為 NULL，分表省列寬

⚠️ **`NoIndex` 與 `ContentItems.IncludeInSitemap` 是兩件事**，標籤頁兩者都要設：`NoIndex=1` 管 robots，`IncludeInSitemap=0` 管 sitemap 產出。只設一邊會出現「sitemap 送出去但頁面 noindex」這種自相矛盾的訊號。

### B-5 `RiskTerms`

`Id`, `Term` nvarchar(64) UNIQUE, `Category` tinyint（1 療效保證／2 比較性／3 不當招徠／4 見證推薦）, `Note` nvarchar(300), `IsActive` bit

編輯器即時警示的字詞清單（[02](02-backend-cms.md) §5）。表小、讀取頻繁 → API 啟動時整份載入記憶體。

種子資料：保證、完全根治、零風險、永久有效、最好、第一、唯一、折扣、贈品、限時優惠……

> 本表為架構設計，具體用語之合法性請以主管機關函釋與院方法務／專業顧問意見為準。

---

## C. 九個內容模型（16 張）

> 後台畫面：9 個模型 ×（列表＋編輯）＝ 18 個畫面

九張主表的 `Id` **同時是 PK 與 FK → `ContentItems.Id`**（TPT）。共通欄位（標題、slug、狀態、排序、SEO）一律不在這裡重複。

### C-1 `Treatments` ＋ `TreatmentImages`

`CategoryTermId` int NOT NULL FK → `Terms`（療程分類）、`NameEn`、`Subtitle`、`Indications`（適應症）、`Mechanism`（原理）、`DurationText`（療程時間）、`SessionsText`（建議次數）、`Aftercare`（術後照護）、`Contraindications`（禁忌症與注意事項）、`DeviceInfo`（儀器／原廠資訊）、**`Steps`（療程流程，區塊 JSON）**、`Cover` 內嵌圖片欄位（§0 決策四）

`TreatmentImages`：`Id`, `TreatmentId` FK, `Image` 內嵌圖片欄位（**NOT NULL**）, `Caption`, `SortOrder`

⚠️ **`UrlPath` 依賴 `CategoryTermId`** —— `/treatments/{分類}/{slug}/`。換分類就會改網址，因此**換分類時應用程式必須自動寫一筆 `Redirects`**（§H，`Source=3`）。[02](02-backend-cms.md) §1 說「分類是實體之後，療程換分類是後台操作」，schema 要讓這件事可以安全執行，不是只讓它可以按。

⚠️ 28 項療程（2026-09-14 由 27 更正）**全部**缺療程時間／術後照護／禁忌症，需醫師撰寫（[06](06-page-inventory.md) §3）。適應症、許可證字號與產品圖已自舊站補齊，但前台的「有沒有完整內容」判斷看的是 `facts`，所以這 28 筆會長時間停在未完成狀態，列表畫面要能篩出來。

### C-2 `Doctors` ＋ `DoctorTags` ＋ `DoctorCredentials` ＋ `DoctorSchedules`

`Doctors`：`JobTitle`（職稱）、**`IsPhysician` bit NOT NULL**、`Specialty`（專科）、`Photo` 內嵌圖片欄位、`Bio`、`Publications`

⚠️ **`IsPhysician` 不是可有可無的欄位。** 14 位團隊成員是 **13 位醫師 ＋ 1 位藝術總監**（安喬／許媖琄，兼執行長與「新中式美學」創始人）。資料層若預設全部是醫師，前台的「本文由 ○○ 醫師審閱」與 `Physician` schema 就會掛錯人。

- `DoctorTags`（`Id`, `DoctorId`, **`Type` tinyint〔1 專長標籤／2 擅長項目〕**, `Tag` nvarchar(40), `SortOrder`）—— **刻意不走 `Terms`**：專長標籤不產生 URL、不需要 SEO 欄位，塞進 `Terms` 會破壞「每一筆 Term 都是 ContentItem、都可能有頁面」這條規則。
  ⚠️ **`Type` 不是可有可無的**：個人頁上「列表卡片的專長標籤」與「擅長項目」是兩個不同的區塊，少了這一欄兩組會混成同一串（2026-09-11 內容搬遷時發現）。
- `DoctorCredentials`（`Id`, `DoctorId`, `Type` tinyint〔1 學歷／2 經歷／3 證照與學會資格／**4 現職**〕, `Text` nvarchar(300), `SortOrder`）—— [02](02-backend-cms.md) §1 的「可重複欄位」
  ⚠️ **「現職」與「經歷」分開是刻意的**：個人頁時間軸把兩者當成不同標籤渲染，併成一種畫面上的標籤就變了（2026-09-11 內容搬遷時發現）。
- `DoctorSchedules`（`Id`, `DoctorId`, `ClinicId` FK, `DayOfWeek` tinyint 0–6, `StartTime` time(0), `EndTime` time(0), `Note`）—— 看診時段

「公開／隱藏」**不另開欄位**，用 `ContentItems.Status` 表達。同一件事有兩個開關，遲早會不同步。

### C-3 `Concerns`

`Symptoms`（症狀描述）、`Causes`（成因）、`SelfCheckGuide`（自我判斷指引）、`WhenToSeeDoctor`（何時該就醫）、`Cover` 內嵌圖片欄位

「建議療程（多選＋排序＋推薦理由）」走 §D 的 `ContentRelations`，`RelationType=5`，用上該表的 `SortOrder` 與 `Note`。**`Note` 欄位存在的唯一理由就是這個推薦理由**。

8 個困擾 slug 已定案：`acne`／`sensitive-skin`／`pigmentation`／`anti-aging`／`hair-loss`／`hair-removal`／`hyperhidrosis`／`dermatology`（[01](01-sitemap.md) §1）。

### C-4 `Articles`

| 欄位 | 說明 |
|---|---|
| `CategoryTermId` int NOT NULL FK → `Terms` | 文章分類 |
| `AuthorDoctorId` int NULL FK → `Doctors` | 作者（可指向醫師） |
| `AuthorName` nvarchar(100) NULL | 作者非團隊成員時的署名 |
| `ReviewerDoctorId` int NULL FK → `Doctors` | 審閱醫師 |
| `ReviewedOn` date NULL | 審閱日期 |
| **`DisplayDate`** datetime2 NOT NULL | **對外顯示的發布日期。遷移時保留舊站原始日期** |
| `Cover` 內嵌圖片欄位（§0 決策四） | |
| `Summary` nvarchar(500) | 摘要 |
| `BodyBlocks` nvarchar(max) | 區塊編輯器內容（JSON 區塊陣列） |
| `ReadingMinutes` int NULL | 可由字數自動算 |
| `SourceSite` tinyint | 1 主站 `share.php`／2 `20skinblog.com` |

⚠️ **`DisplayDate` ≠ `ContentItems.PublishAt`。** 前者是對外顯示與 `datePublished` 的來源，遷移 800 篇時必須帶入舊站原始日期；後者是排程用的「最早生效時間」，遷移進來的文章一律留 NULL。**把這兩欄搞混，全站 800 篇文章的日期會統一變成遷移當天**，`datePublished` 全錯，對 SEO 是直接傷害。

⚠️ `SourceSite=2` 的 101 篇**保留原 slug**（[01](01-sitemap.md) 決策三）。這一欄的用途是遷移後還能篩出這批文章 —— 跨網域 301 由院方自行處置，若日後要盤點就靠它。

### C-5 `Cases` ＋ `CaseImages`

`Cases`：`TreatmentId` int NOT NULL FK → `Treatments`、`SessionsText`（次數與週期）、`Narrative`（敘述）

**法規揭露欄位，四欄一律 NOT NULL**：

| 欄位 | 說明 |
|---|---|
| `IndividualVarianceStatement` nvarchar(500) NOT NULL | 個案差異聲明 |
| `HasWrittenConsent` bit NOT NULL | 當事人書面同意 |
| `ConsentReference` nvarchar(200) NOT NULL | 同意書編號／存放位置。**只存索引，同意書本身不進系統** |
| `ShootingConditions` nvarchar(500) NOT NULL | 拍攝條件 |

⚠️ **用 NOT NULL 在資料層強制，不是只在前端驗證。** [02](02-backend-cms.md) §7 定案內容遷移以本機腳本**直連 SQL** 執行 —— 腳本繞過 API，也就繞過所有前端與 API 層的驗證，這時候只有資料庫約束擋得住。

`CaseImages`：`Id`, `CaseId` FK, `Image` 內嵌圖片欄位（**NOT NULL**）, `Phase` tinyint（1 術前／2 術後）, `TakenOn` date NULL, `SortOrder`

### C-6 `Faqs`

| 欄位 | 說明 |
|---|---|
| `CategoryTermId` int NOT NULL FK → `Terms` | **引用「分類與標籤」模型，不自建第二份清單**（[02](02-backend-cms.md) §6 分界表） |
| `WebAnswer` nvarchar(max) **NOT NULL** | 網頁版 150–400 字 |
| `AiAnswer` nvarchar(500) **NOT NULL** | AI 摘要版 60–100 字，語意自足 |
| `LastReviewedOn` date NOT NULL | 最後更新日 |
| `ReviewedBy` nvarchar(100) NULL | 審閱者署名，如「黃勇學 醫師」。⚠️ **自由文字不是外鍵**：審閱者未必是站內有個人頁的醫師，且這一欄的用途是對外顯示「這則答案由誰確認過」，不該因為該醫師離職就跟著消失 |

- 問題本體＝`ContentItems.Title`
- FAQ **不產生獨立網址** → `ContentItems.UrlPath` 為 NULL；`Slug` 仍填，當 `/faq/` 的頁內錨點用
- 兩份答案**都是 NOT NULL**：`AiAnswer` 是 FAQPage JSON-LD、`faq.json`、`llms-full.txt` 的唯一來源，缺一則該題無法輸出結構化資料，也就白寫了
- `LastReviewedOn` 與 `ContentItems.UpdatedAt` 分開：前者是人工可控的內容時效標記（輸出 `dateModified`、前台顯示「最後更新：YYYY-MM」），**改個錯字不該讓它跳動**

⚠️ **不加「已推送／待推送」欄位**（[02](02-backend-cms.md) §6 明文要求）。AI 介接方式未定，未定不寫 schema。

### C-7 `Clinics` ＋ `ClinicBusinessHours` ＋ `ClinicPhotos`

`Clinics`：`Address`、`Phone`、`LineUrl`、`Latitude` decimal(9,6)、`Longitude` decimal(9,6)、`MapUrl`、`TransportInfo`（交通與停車）、`Intro`

座標用 `decimal(9,6)` 而非嵌入的地圖 iframe —— `LocalBusiness` schema 需要 `geo`，這是據點頁作為地區 SEO 主要落地頁（[06](06-page-inventory.md) §1）的必要輸出。

**`ClinicBusinessHours`**：`Id`, `ClinicId` FK, `DayOfWeek` tinyint 0–6, `StartTime` time(0), `EndTime` time(0), `SortOrder`

⚠️ **一天可以有多列，午休斷點就是這樣表達的**（09:00–12:00 ／ 14:30–21:00）。**不要用「開始／結束＋午休開始／午休結束」四個欄位** —— 那撐不住第三段診次，也很難輸出 `openingHoursSpecification`。休診日＝該 `DayOfWeek` 一列都沒有。

`ClinicPhotos`：`Id`, `ClinicId` FK, `Image` 內嵌圖片欄位（**NOT NULL**）, `Caption`, `SortOrder`

駐診醫師與可提供療程走 §D 的關聯表。

### C-8 `Pages`

| 欄位 | 說明 |
|---|---|
| `PageKind` tinyint NOT NULL | 1 自由頁／2 系統頁 |
| `SystemKey` nvarchar(40) NULL UNIQUE | 系統頁識別碼 |
| `Lead` nvarchar(max) | 導言 |
| `BodyBlocks` nvarchar(max) NULL | 自由頁內文；系統頁不用 |
| `Cover` 內嵌圖片欄位（§0 決策四） | |
| `ListSortRule` tinyint NULL | 系統頁：列表排序規則 |
| `PageSize` int NULL | 系統頁：每頁筆數 |
| `SuperAdminOnly` bit NOT NULL | 法務三頁為 1 |

`PageKind=2`（系統頁）一律 `ContentItems.IsSystemLocked=1` → **不可刪除、不可改 slug**。[02](02-backend-cms.md) §1 的理由：前台路由、麵包屑與 sitemap 分檔都依賴這些路徑存在，允許刪除等於允許編輯把站砍出 404。

`SystemKey` 種子（11 筆）：

```
home                 ← 見下方說明
team-index           treatments-index    concerns-index    blog-index
cases-index          faq-index           clinics-index
contact              search              not-found
```

⚠️ **`home` 這一筆是刻意的。** [02](02-backend-cms.md) §2 把首頁歸給「首頁版位編排」而非「頁面」模型，那是**後台畫面**的歸屬，沒有改變。資料層仍建一筆 `SystemKey='home'` 的系統頁，純粹為了讓首頁複用工作流、版本歷程與 SEO 區塊 —— [02](02-backend-cms.md) §3 要求「版位編排走一般的送審流程」，不掛在一筆 ContentItem 上就得為首頁另寫一套審核。**後台不因此多一個畫面**，`/admin/pages` 不列出 `home`。

⚠️ 自由頁 6 筆（`/about/` ×3、法務頁 ×3）為種子資料。法務三頁 `SuperAdminOnly=1`。

### C-9 `Terms`（分類與標籤）

| 欄位 | 說明 |
|---|---|
| `TermType` tinyint NOT NULL | 1 療程分類／2 文章分類／3 FAQ 分類／4 文章標籤 |
| `Intro` nvarchar(max) NULL | 介紹文案 |
| `Cover` 內嵌圖片欄位（§0 決策四） | |

UNIQUE (`TermType`, `Slug`)

- **不加 `ParentId`。** [02](02-backend-cms.md) 未要求巢狀分類，加上去會改變 URL 結構
- 文章標籤（`TermType=4`）種子與新增預設：`ContentItems.IncludeInSitemap=0` ＋ `SeoMeta.NoIndex=1`。30–60 個標籤頁內容單薄，全開會稀釋約 800 篇文章的索引預算
- 新增／刪除**分類**限超級管理員（動 URL 結構與 301 對照表）；新增**標籤**內容編輯即可

種子 13 筆：

```
療程分類 4   laser / photoelectric / microneedle / skincare
文章分類 4   medical-aesthetics / dermatology / media / lectures
FAQ 分類 5   品牌與診所 / 療程相關 / 肌膚困擾 / 醫師與看診 / 費用與流程
```

⚠️ **這 13 筆與 11 個系統頁必須在內容匯入之前由 migration 種子建立**，否則療程與文章沒有分類可掛（[02](02-backend-cms.md) §7 步驟 4）。趁此一併修正 DermaV、BTL Embody 的分類歸屬錯誤 —— **這是唯一一次不必付出 301 代價就能重新歸類的時機**。

---

## D. 內容關聯（1 張）

### `ContentRelations`

| 欄位 | 說明 |
|---|---|
| `Id` int PK | |
| `FromContentItemId` int NOT NULL | |
| `FromContentType` tinyint NOT NULL | 冗餘欄位，見下方 |
| `ToContentItemId` int NOT NULL | |
| `ToContentType` tinyint NOT NULL | 冗餘欄位 |
| `RelationType` tinyint NOT NULL | |
| `SortOrder` int NOT NULL DEFAULT 0 | |
| `Note` nvarchar(300) NULL | **目前唯一用途：困擾頁「建議療程」的推薦理由** |

```sql
UNIQUE (FromContentItemId, RelationType, ToContentItemId)
INDEX  (ToContentItemId, RelationType)      -- 反向查詢：這則 FAQ 出現在哪些療程頁

FOREIGN KEY (FromContentItemId, FromContentType) REFERENCES ContentItems(Id, ContentType)
FOREIGN KEY (ToContentItemId,   ToContentType)   REFERENCES ContentItems(Id, ContentType)
CHECK ((RelationType, FromContentType, ToContentType) IN (...合法組合...))
```

`RelationType` 清單：

| 值 | 從 → 到 | 排序 | 理由欄 |
|---|---|---|---|
| 1 | 療程 → 醫師 | ✅ | |
| 2 | 療程 → 困擾 | ✅ | |
| 3 | 療程 → 文章 | ✅ | |
| 4 | 療程 → FAQ | ✅ | |
| 5 | **困擾 → 建議療程** | ✅ | **✅ 推薦理由** |
| 6 | 困擾 → FAQ | ✅ | |
| 7 | 困擾 → 文章 | ✅ | |
| 8 | 據點 → 駐診醫師 | ✅ | |
| 9 | 據點 → 可提供療程 | ✅ | |
| 10 | 據點 → FAQ | ✅ | |
| 11 | 文章 → 標籤 | ✅ | |
| 12 | 頁面 → 精選項目 | ✅ | 系統頁的「精選項目」 |

**用一張表而不是 12 張 join table 的理由**：12 張表的結構完全同構（兩個 FK ＋ 排序），差別只有型別；版本快照要序列化全部關聯是一段程式碼不是十二段；刪一筆內容要清掉所有指向它的關聯是一個 DELETE。

**冗餘的 `FromContentType`／`ToContentType` 是為了把型別正確性交還給資料庫。** 沒有它們，資料庫無法保證「`RelationType=1` 的 To 一定是醫師」。做法是在 `ContentItems` 上補一條 `UNIQUE(Id, ContentType)`，再以**複合 FK** 指過去 —— 冗餘欄位就不可能與 `ContentItems.ContentType` 不一致，`CHECK` 也就能列舉合法組合。這是標準做法，值得那兩個 tinyint。

⚠️ **`RelationType` 2 與 5 都是療程↔困擾，刻意分開，不要合併。** 2 是療程頁列出的相關困擾；5 是困擾頁的「建議療程（多選＋排序＋推薦理由）」。兩者的排序屬於各自的頁面 —— 合併之後，編輯調整困擾頁的療程順序會連帶弄亂療程頁的困擾順序。

⚠️ **雙向關聯一律單向存。** 療程頁有「關聯文章」欄位、文章頁也有「關聯療程」欄位，但資料庫只有 `RelationType=3`（療程 → 文章）一筆。編輯文章時勾選療程，寫的仍是那一筆；反向顯示靠 `(ToContentItemId, RelationType)` 這條索引查。**存兩筆會出現兩份各自為政的排序。**

---

## E. 上傳（0 張）

> 後台畫面：**沒有**。上傳沒有自己的畫面，只發生在需要那張圖的欄位裡。

**2026-09-11 定案不做媒體庫**（§0 決策四），所以這個功能單元一張表都沒有 —— 原本的 `MediaAssets`／`MediaUsages` 整組刪除。圖片是欄位的一部分，欄位長什麼樣見 §0 決策四。

保留這個編號是為了讓 §F–§H 的段落編號與既有交叉引用不必重排。

⚠️ **孤兒檔仍然存在，只是換了成因。** 上傳是瀏覽器直傳（[07](07-deployment.md) §3：取 SAS → PUT Blob → 回報 API），回報那一步失敗就留下一個沒有任何欄位指向的 blob。少了 `MediaUsages`，對帳工具不能再查一張表，得掃過十個內嵌圖片欄位**以及 `BodyBlocks` 內文裡的插圖**。這支工具仍要列進上線前的驗收項目（[11](11-backend-design.md) §9）。

---

## F. FAQ 題庫成長（1 張）

> 後台畫面：未命中題目清單（[02](02-backend-cms.md) §6 明訂為**獨立畫面**，不是題庫列表的一個篩選分頁）

### `QuestionInbox`

| 欄位 | 說明 |
|---|---|
| `Id` int PK | |
| `QuestionText` nvarchar(500) | 原始提問 |
| `NormalizedText` nvarchar(500) **UNIQUE** | 去空白、轉小寫、全形轉半形後的比對鍵 |
| `Source` tinyint | 1 站內搜尋無結果／2 AI FAQ 未命中／3 聯絡表單提問／4 手動輸入（LINE 常見詢問） |
| `HitCount` int | |
| `FirstSeenAt`／`LastSeenAt` | datetime2 |
| `Status` tinyint | 1 待處理／2 已建題／3 忽略 |
| `LinkedFaqContentItemId` int NULL FK | 建題後回填 |
| `HandledByUserId`／`HandledAt` | NULL |

⚠️ **這是題庫成長的工作清單，不是搜尋日誌。** 同一句話只有一列，重複出現只累加 `HitCount`；處理完就結案。**不記錄誰在什麼時候搜的、不記 IP、不記 session。** 符合本次「不做 log」的指定，也讓這張表的成長速度與題庫規模掛勾，而不是與流量掛勾。

⚠️ **`Source=3`（聯絡表單提問）有一條硬界線**：[02](02-backend-cms.md) §2 已定案聯絡表單**只寄通知信、後台不留存收件紀錄**（避免個資留存責任）。寫進這張表的**只有問題文字本身** —— 不寫姓名、不寫電話、不寫 email，也不留任何能回連到送出者的欄位。表單處理程式必須明確只取問題欄位，這是實作時最容易破功的地方。

---

## G. 站台編排（4 張）

> 後台畫面：全站設定、首頁版位編排、導覽選單與頁尾

### G-1 `SiteSettings`

`SettingKey` nvarchar(100) PK, `SettingValue` nvarchar(max), `ValueType` tinyint, `UpdatedByUserId`, `UpdatedAt`

收納：站名、Logo、預設 OG 圖、全站 NAP 主資料、追蹤碼、`/contact/` 收件信箱、頁尾社群連結與版權文案、`robots.txt` 內容、**sitemap 五個分檔的設定**（`seo.sitemapFiles`，見 §H）、AI FAQ 的啟用開關／面板標題／歡迎文案／轉真人出口網址。

⚠️ **鍵是固定的，不能在執行期新增。** `PUT /admin/setting` 對不存在的 `SettingKey` 回 404 —— 要多一個設定就是一支 migration ＋ 一列種子（`seo.sitemapFiles` 就是 2026-09-12 這樣加的）。

**用 key-value 而非固定欄位**：這組設定會持續增加（AI FAQ 那四項就是後加的），固定欄位每加一項要一次 migration，而**沒有 staging，每次遷移都必須向後相容**（[07](07-deployment.md) §5）。設定類不值得付這個代價。

⚠️ **AI FAQ 的啟用開關必須是資料，不能是建置期常數。** [04](04-ai-faq.md) §4 的驗收標準第 4 條寫明「啟用與停用不需重新部署」。但前台是 Nuxt 純靜態 —— 這代表**這個開關要由瀏覽器在執行期打 `api.20skin.tw` 的公開設定端點讀取**，不能烘進預渲染的 HTML。這是本表唯一一個對前端架構有要求的欄位，開工前要跟前端確認。

### G-2 `HomeSections` ＋ `HomeSectionItems`

`HomeSections`：`Id`, `SectionKey` nvarchar(40) UNIQUE, `Title`, `Subtitle`, `IsEnabled` bit, `SortOrder`, `Settings` nvarchar(max)

七個版位為種子資料，**可停用、可排序，不可新增刪除** —— 否則首頁又會慢慢變回自由編輯頁：

```
hero  specialties  featured-treatments  latest-articles  doctors  clinics  brand-story
```

`HomeSectionItems`：`Id`, `HomeSectionId` FK, `ContentItemId` FK, `SortOrder`

⚠️ **這張表只有 `ContentItemId`，沒有任何 `Title` 或 `Text` 欄位，是刻意的。** [02](02-backend-cms.md) §3：「每個版位只能挑選已存在的內容，不能另打一份文案」—— 舊站 `index2.php` 的病根就是首頁自成一份資料、與內頁長期不同步。**在 schema 裡不給文案欄位，這件事就不可能再發生。**

唯一例外是 `hero` 的主視覺與外部導流 CTA（沒有對應的站內內容），放在 `HomeSections.Settings` 的 JSON 裡。

版位編排的送審與版本歷程掛在 `SystemKey='home'` 那筆 ContentItem 上（§C-8），快照時把 `HomeSections` ＋ `HomeSectionItems` 一併序列化進 `ContentVersions.Snapshot`。

### G-3 `MenuItems`

`Id`, `MenuKey` nvarchar(20)（`main`／`footer`）, `ParentId` int NULL FK self, `Depth` tinyint, `Label` nvarchar(100), `LinkKind` tinyint（1 站內內容／2 站內路徑／3 外部網址）, `ContentItemId` int NULL FK, `Url` nvarchar(400) NULL, `IsExternal` bit, `RelAttr` nvarchar(60) NULL, `OpenInNewTab` bit, `SortOrder`

`CHECK (Depth IN (1, 2))` —— 最多兩層。純靠 `ParentId` 無法在 SQL 表達深度上限，`Depth` 冗餘欄位讓約束可執行。

⚠️ **`booking.20skin.tw` 與 `20skinshop.com` 在這裡，而且只在這裡。** 兩個外部網域在整個 schema 的唯一落點就是本表的兩筆 `LinkKind=3` ＋ `IsExternal=1` 記錄。它們**不進內容表、不進 sitemap、不進 301 對照表**（CLAUDE.md 決策 4）。任何人想在別的表放這兩個網域，就是在把已排除的範圍偷渡回來。

---

## H. SEO 產出與 301（1 張）

> 後台畫面：sitemap 設定、301 轉址管理、FAQ／語料匯出

### `Redirects`

| 欄位 | 說明 |
|---|---|
| `Id` int PK | |
| **`FromPath`** nvarchar(400) NOT NULL **UNIQUE** | 舊路徑的正規化形式 |
| **`ToPath`** nvarchar(400) NOT NULL | 目標路徑 |
| `ToContentItemId` int NULL FK → `ContentItems` | 目標為站內內容時填 |
| `StatusCode` smallint NOT NULL DEFAULT 301 | |
| `IsActive` bit NOT NULL DEFAULT 1 | |
| `Source` tinyint | 1 遷移工具產生／2 人工新增／3 系統自動（改 slug、換分類時） |
| `IsVerified` bit NOT NULL DEFAULT 0 | 人工抽查 ≥ 20% 的勾稽欄位 |
| `CreatedAt` | datetime2 |

⚠️ **`FromPath` 要能表示 query string。** 舊站有 `share.php?class=醫美新知&year=2024` 這類**中文 query**（約 40 條年份組合，[06](06-page-inventory.md) §6）。存 path ＋ 排序後 query 的正規化完整相對路徑，`/api/fallback` 比對前跑同一套正規化。這件事不先講清楚，那 40 條會在上線後才發現對不上。

⚠️ **這張表是 `/api/fallback` 的唯一查詢對象，也是全 schema 唯一被公開流量高頻打到的表。** 三個由此推出的硬性要求：

1. **查詢只用 `FromPath` 的 unique index 做單筆 seek**，不做任何 join
2. **`ToPath` 必須是實體欄位，不能 join `ContentItems` 算出來。** `ToContentItemId` 只在後台維護時用（內容改 slug 時據以自動更新 `ToPath`，避免轉址鏈）。[07](07-deployment.md) §1 已經為了冷啟動速度讓 `api/` 不載入 EF Core、只用 Dapper 並停在 net9.0 —— 在那之後又讓每個未命中請求多 join 一張表，等於把省下來的又吐回去
3. **`/api/fallback` 的唯讀連線字串（SWA 上的明文密鑰，全架構唯一）所對應的 SQL 使用者，只能 SELECT 這一張表**，不是整個資料庫唯讀。這條密鑰放在 SWA 的應用程式設定裡，是整個架構暴露面最大的一個憑證

約 770 列，資料量微不足道，**不需要任何快取層**。

⚠️ **迴圈防護**：新增時檢查 `ToPath` 不得出現在任何 `FromPath`（擋一層）；上線前的驗收另跑一次遞移閉包檢查（擋多層鏈）。這是應用層與驗收腳本的事，不是資料庫約束。

sitemap 的 5 個分檔（pages／treatments／concerns／doctors／blog）**不需要資料表** —— `ContentItems.ContentType` ＋ `IncludeInSitemap` ＋ `Status` ＋ `UrlPath IS NOT NULL` 就足以在建置期分檔。`robots.txt` 內容放 `SiteSettings`（鍵 `seo.robotsTxt`）。

後台「sitemap 設定」畫面上的那幾個旋鈕（各分檔是否納入、預設 `changefreq`／`priority`）同樣放 `SiteSettings`，鍵 `seo.sitemapFiles`，值是一個 JSON 陣列 —— **不是新表**。
⚠️ 合併時以**程式碼裡的 5 個分檔為準**，資料庫只提供那三個旋鈕的值。反過來的話，日後程式碼新增一個分檔，舊資料庫沒有那一列，畫面上就會少一個分檔而且沒有任何提示。

---

## I. 刻意不建的表

| 不建 | 理由 |
|---|---|
| **`AuditLogs`（操作日誌）** | 🔴 **指定不做 log。原與 [02](02-backend-cms.md) §4 相衝，2026-09-11 已確認拿掉並同步全部文件，見下方** |
| 登入紀錄／失敗嘗試歷史 | 同上。`LoginThrottles` 只留當下計數，成功即清 |
| 站內搜尋日誌 | 只留 `QuestionInbox` 的去重清單 |
| 聯絡表單收件紀錄 | [02](02-backend-cms.md) §2 已定案：只寄通知信，不留存（個資責任） |
| AI 對話紀錄 | AI 介接方式未定，未定不寫 schema |
| FAQ 的「已推送／待推送」 | 同上，[02](02-backend-cms.md) §6 明文要求 |
| 通知（Notifications） | 退回通知改用儀表板待辦清單查 `ContentReviews`，見 §B-3 |
| 預約、購物相關 | 已排除於範圍（CLAUDE.md 決策 4） |
| 分類的 `ParentId` | [02](02-backend-cms.md) 未要求，且會改 URL 結構 |
| 資料表分區、讀寫分離 | 全站不到一萬列。過度設計 |

### ✅ 操作日誌：已同步（原為衝突）

[02-backend-cms.md](02-backend-cms.md) §4「必備機制」目前寫著：

> **操作日誌**：帳號、時間、動作、對象、前後值。至少保存 3 年。

而且該節還明訂「分類與標籤、導覽選單、全站設定屬設定類，**不走審核但一律入操作日誌**」—— 也就是說，拿掉操作日誌之後，**這三類設定變成完全沒有留痕的變更**。誰把 `/treatments/laser/` 這個分類刪掉、誰改了全站追蹤碼，事後查不到。

`ContentVersions`（§B-2）只涵蓋九個內容模型，**涵蓋不到 `SiteSettings`、`MenuItems`、`RolePermissions` 與帳號異動**。

**✅ 2026-09-11 已確認拿掉，連鎖八處全部改完：**

| 檔案 | 已做的事 |
|---|---|
| [docs/02-backend-cms.md](02-backend-cms.md) §4 | 刪「操作日誌」條目；設定類改為「不走審核，儲存即生效」並加註無留痕；鎖定事件改為「即時寄出告警通知信、不留存」 |
| [docs/06-page-inventory.md](06-page-inventory.md) §5 | 工作流群組 2 → 1 個畫面，**後台畫面總數 32 → 31** |
| [docs/README.md](README.md) 快速數字 | 後台畫面 32 → 31 |
| [CLAUDE.md](../CLAUDE.md) 專案關鍵數字 | 同上，並註明 32 是舊數字 |
| [docs/05-roadmap.md](05-roadmap.md) | 營運效率的指標來源改為「後台版本歷程（建立至發布的時間差）」；醫療廣告法規風險的控管改為「版本歷程與審核紀錄留存」 |
| [docs/07-deployment.md](07-deployment.md) §2、§4 | 鎖定事件告警改為不留存；EF Core 的職責清單移除「操作日誌」 |
| `output/20SKIN-網站改版規劃書.html` | 刪「操作日誌」條目；設定類敘述改寫；成效指標來源改為「後台版本歷程」 |
| `output/20SKIN-網站改版規劃書.pdf` | 已重跑 `./scripts/build-pdf.sh` 重新產出 |

⚠️ **殘留的風險沒有被解決，只是被接受了。** `SiteSettings`、`MenuItems`、`RolePermissions` 與帳號異動的變更依然無從回溯，唯一控管是「限超級管理員」。日後若院方要補，最小做法是只為這四類建一張窄表（誰、何時、改了哪個鍵、前後值），不必做成全站通用的 `AuditLogs`。

---

## J. EF Core 與遷移的落實要點

### J-1 對應方式

| 對象 | 做法 |
|---|---|
| `ContentItems` ＋ 九個模型 | **TPT（table-per-type）**，子表 `Id` 同時是 PK 與 FK |
| `SeoMeta` | 1:1，`ContentItemId` 為 PK ＋ FK。**不要用 owned type** —— owned type 會被塞進主表，SEO 權限的分表切分就沒了 |
| `BodyBlocks`／`Snapshot`／`Settings`／`Variants` | `nvarchar(max)` 存 JSON。EF 8+ 可用 `ToJson()`，但**遷移期的匯入腳本走 Dapper 直寫**，所以序列化格式要有一份獨立於 EF 的規格 |
| `ContentRelations` 的複合 FK | EF Core 支援替代索引鍵（`HasAlternateKey(x => new { x.Id, x.ContentType })`）＋ 複合 FK |
| `CHECK` 約束 | `ToTable(t => t.HasCheckConstraint(...))`，手寫 SQL |
| collation | 逐欄 `.UseCollation("Latin1_General_100_BIN2")`，見 §0 決策三 |

### J-2 三個不可退讓的原則（[07](07-deployment.md) §5）

1. **絕不在執行期呼叫 `Database.Migrate()`** —— 走 CI 的 `efbundle`
2. **遷移必須向後相容** —— 沒有 staging，順序是「先遷移、後部署」，中間有一段新 schema 配舊程式。改欄位用擴張／收縮兩階段
3. **遷移身分與執行期身分是兩個不同的 SQL 使用者**

### J-3 三組 SQL 身分

| 身分 | 權限 | 用途 |
|---|---|---|
| GitHub Actions 服務主體 | **DDL** | 跑 `efbundle` |
| Function App 的 Managed Identity | **DML**（全部資料表） | `api.20skin.tw` 執行期 |
| **`/api/fallback` 唯讀使用者** | **只有 `SELECT Redirects`** | SWA 上的明文連線字串，見 §H |

⚠️ 第三組是**新增項目**，[07](07-deployment.md) §6 的「待提供」清單目前寫「一組給 `/api/fallback` 的唯讀連線字串」，但沒有指明權限應收斂到單一資料表。請院方開帳號時一併說明。

### J-4 種子資料的建立順序

```
1  Roles → Permissions → RolePermissions
2  Users（sa@system.local）→ UserRoles
3  Terms 13 筆（療程分類 4／文章分類 4／FAQ 分類 5）
4  Pages 11 筆系統頁 ＋ 6 筆自由頁
5  HomeSections 7 筆
6  MenuItems（含 booking / shop 兩筆外部連結）
7  SiteSettings 預設值（AI FAQ 開關 = 關閉）
8  RiskTerms 初始字詞
--- 以上完成後，才能跑內容匯入腳本 ---
9  本機腳本直連 SQL 匯入約 800 篇文章與圖片（[02] §7、[07] §4）
10 遷移工具產生 Redirects 約 770 筆
```

⚠️ **步驟 3、4 沒跑完就匯內容，療程與文章沒有分類可掛**（[02](02-backend-cms.md) §7 步驟 4）。

---

## K. 表數清單

| 功能單元 | 表 | 數 |
|---|---|---|
| **A 帳號與權限** | `Users`／`Roles`／`UserRoles`／`Permissions`／`RolePermissions`／`LoginThrottles`／`RefreshTokens` | 7 |
| **B 內容主幹** | `ContentItems`／`ContentVersions`／`ContentReviews`／`SeoMeta`／`RiskTerms` | 5 |
| **C 九個內容模型** | `Treatments`／`TreatmentImages`／`Doctors`／`DoctorTags`／`DoctorCredentials`／`DoctorSchedules`／`Concerns`／`Articles`／`Cases`／`CaseImages`／`Faqs`／`Clinics`／`ClinicBusinessHours`／`ClinicPhotos`／`Pages`／`Terms` | 16 |
| **D 內容關聯** | `ContentRelations` | 1 |

| **F FAQ 題庫成長** | `QuestionInbox` | 1 |
| **G 站台編排** | `SiteSettings`／`HomeSections`／`HomeSectionItems`／`MenuItems` | 4 |
| **H SEO 與 301** | `Redirects` | 1 |
| **合計** | | **35** |

儀表板（[06](06-page-inventory.md) §5「系統」群組）**沒有專屬資料表**，全部是對上述表的聚合查詢。

### 概略關係

```
Users ──┬─ UserRoles ── Roles ── RolePermissions ── Permissions
        ├─ LoginThrottles / RefreshTokens
        └─ DoctorId ─────────────────────┐
                                          │
ContentItems ─┬─ SeoMeta (1:1)            │
              ├─ ContentVersions ── ContentReviews
              ├─ ContentRelations (From / To，複合 FK 帶型別)
              ├─ Redirects.ToContentItemId
              ├─ HomeSectionItems ── HomeSections
              ├─ MenuItems.ContentItemId
              ├─ QuestionInbox.LinkedFaqContentItemId
              │
              └─ TPT 子表（Id = PK = FK）
                   Treatments  ── TreatmentImages
                   Doctors  ◄───────────────────────┘
                     ├─ DoctorTags
                     ├─ DoctorCredentials
                     └─ DoctorSchedules ── Clinics
                   Concerns
                   Articles      （CategoryTermId / AuthorDoctorId / ReviewerDoctorId）
                   Cases    ── CaseImages
                   Faqs          （CategoryTermId）
                   Clinics  ── ClinicBusinessHours / ClinicPhotos
                   Pages
                   Terms
```

---

## L. 待確認

| 項目 | 影響 |
|---|---|
| **`RefreshTokens` vs 短效 JWT ＋ `SecurityStamp`** | 二選一，不要兩套都做。見 §A-4 |
| **衍生尺寸誰產**（[07](07-deployment.md) §3 待決） | 不影響 schema（`Variants` 用 JSON 承接），但影響上傳流程的實作 |
| **AI FAQ 開關的執行期讀取端點** | 純靜態前台要在執行期讀 `SiteSettings`，需與前端確認做法。見 §G-1 |
| `/api/fallback` 唯讀使用者的權限收斂 | 需在院方開帳號時指明只能 `SELECT Redirects`。見 §J-3 |
