namespace Skin20.Api.Models.Entities;

// ── C. 九個內容模型（16 張表）────────────────────────────────────────────
// docs/08-database.md §C。九張主表以 TPT 掛在 ContentItem 底下，Id 同時是 PK 與 FK。
// 共通欄位（標題、slug、狀態、排序、SEO）一律不在這裡重複，見 ContentItem（ContentTrunk.cs）。

/// <summary>
/// 療程（docs/08 §C-1）。
/// <para>
/// ⚠️ <see cref="UrlPath"/>（在 <see cref="ContentItem"/> 上）依賴 <see cref="CategoryTermId"/>
/// —— <c>/treatments/{分類}/{slug}/</c>。換分類會改網址，應用程式必須在同一筆交易裡
/// 對 <see cref="Redirects"/> 自動寫入一筆（<c>Source=SystemAuto</c>）。
/// </para>
/// <para>27 項療程中 12 項無站內內容，長時間停在 <c>Status=Draft</c>，列表畫面要能篩出來。</para>
/// </summary>
public sealed class Treatment : ContentItem
{
    public int CategoryTermId { get; set; }
    public string? NameEn { get; set; }
    public string? Subtitle { get; set; }

    /// <summary>適應症。</summary>
    public string? Indications { get; set; }

    /// <summary>原理。</summary>
    public string? Mechanism { get; set; }

    /// <summary>療程時間。</summary>
    public string? DurationText { get; set; }

    /// <summary>建議次數。</summary>
    public string? SessionsText { get; set; }

    /// <summary>術後照護。</summary>
    public string? Aftercare { get; set; }

    /// <summary>禁忌症與注意事項。</summary>
    public string? Contraindications { get; set; }

    /// <summary>儀器／原廠資訊。</summary>
    public string? DeviceInfo { get; set; }

    /// <summary>
    /// 療程流程（區塊 JSON）。
    /// ⚠️ 與 <see cref="Mechanism"/> 分開是刻意的：「原理」講的是為什麼有效，
    /// 「流程」講的是當天會發生什麼事，兩者在細節頁是兩個區塊，併成一格會讓後台編輯看到兩件事混在一起。
    /// </summary>
    public string? Steps { get; set; }

    /// <summary>封面圖（docs/08 §0 決策五：內嵌欄位，不是媒體庫的外鍵）。</summary>
    public UploadedImage? Cover { get; set; }

    public Term Category { get; set; } = null!;
    public ICollection<TreatmentImage> Images { get; set; } = [];
    public ICollection<Case> Cases { get; set; } = [];
}

/// <summary>療程圖庫（docs/08 §C-1）。</summary>
public sealed class TreatmentImage
{
    public int Id { get; set; }
    public int TreatmentId { get; set; }
    public UploadedImage Image { get; set; } = new();
    public string? Caption { get; set; }
    public int SortOrder { get; set; }

    public Treatment Treatment { get; set; } = null!;
}

/// <summary>
/// 醫師（docs/08 §C-2）。
/// <para>
/// ⚠️ <see cref="IsPhysician"/> 不是可有可無的欄位。14 位團隊成員是
/// <b>13 位醫師 ＋ 1 位藝術總監</b>（安喬／許媖琄，兼執行長與「新中式美學」創始人）。
/// 資料層若預設全部是醫師，前台的「本文由 ○○ 醫師審閱」與 <c>Physician</c> JSON-LD
/// 就會掛錯人 —— <b>本欄故意不給資料庫預設值</b>，逼寫入端每次明確給值。
/// </para>
/// <para>「公開／隱藏」不另開欄位，用 <c>ContentItems.Status</c> 表達。</para>
/// </summary>
public sealed class Doctor : ContentItem
{
    public string? JobTitle { get; set; }
    public bool IsPhysician { get; set; }
    public string? Specialty { get; set; }
    public UploadedImage? Photo { get; set; }
    public string? Bio { get; set; }
    public string? Publications { get; set; }

    public ICollection<DoctorTag> Tags { get; set; } = [];
    public ICollection<DoctorCredential> Credentials { get; set; } = [];
    public ICollection<DoctorSchedule> Schedules { get; set; } = [];
}

/// <summary>
/// 醫師專長標籤（docs/08 §C-2）。
/// <para>刻意不走 <see cref="Term"/>：專長標籤不產生 URL、不需要 SEO 欄位，
/// 塞進 <see cref="Term"/> 會破壞「每一筆 Term 都是 ContentItem、都可能有頁面」這條規則。</para>
/// </summary>
public sealed class DoctorTag
{
    public int Id { get; set; }
    public int DoctorId { get; set; }

    /// <summary>列表卡片的專長標籤／個人頁的「擅長項目」是兩個區塊，見 <see cref="DoctorTagType"/>。</summary>
    public DoctorTagType Type { get; set; }

    public string Tag { get; set; } = string.Empty;
    public int SortOrder { get; set; }

    public Doctor Doctor { get; set; } = null!;
}

/// <summary>醫師可重複欄位：學歷／經歷／證照與學會資格（docs/08 §C-2）。</summary>
public sealed class DoctorCredential
{
    public int Id { get; set; }
    public int DoctorId { get; set; }
    public CredentialType Type { get; set; }
    public string Text { get; set; } = string.Empty;
    public int SortOrder { get; set; }

    public Doctor Doctor { get; set; } = null!;
}

/// <summary>醫師看診時段（docs/08 §C-2）。</summary>
public sealed class DoctorSchedule
{
    public int Id { get; set; }
    public int DoctorId { get; set; }
    public int ClinicId { get; set; }

    /// <summary>0–6，對應 <see cref="DayOfWeek"/> 的數值（0＝星期日）。</summary>
    public byte DayOfWeek { get; set; }

    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }
    public string? Note { get; set; }

    public Doctor Doctor { get; set; } = null!;
    public Clinic Clinic { get; set; } = null!;
}

/// <summary>困擾（docs/08 §C-3）。「建議療程」走 <see cref="ContentRelation"/>，<c>RelationType=ConcernToTreatment</c>。</summary>
public sealed class Concern : ContentItem
{
    /// <summary>症狀描述。</summary>
    public string? Symptoms { get; set; }

    /// <summary>成因。</summary>
    public string? Causes { get; set; }

    /// <summary>自我判斷指引。</summary>
    public string? SelfCheckGuide { get; set; }

    /// <summary>何時該就醫。</summary>
    public string? WhenToSeeDoctor { get; set; }

    public UploadedImage? Cover { get; set; }
}

/// <summary>
/// 文章（docs/08 §C-4）。
/// <para>
/// 🔴 <b><see cref="DisplayDate"/> ≠ <see cref="ContentItem.PublishAt"/>。</b>
/// 前者是對外顯示與 <c>datePublished</c> 的來源，遷移 800 篇時必須帶入舊站原始日期；
/// 後者是排程用的「最早生效時間」，遷移進來的文章一律留 NULL。
/// <b>把這兩欄搞混，全站 800 篇文章的日期會統一變成遷移當天</b>，對 SEO 是直接傷害。
/// </para>
/// </summary>
public sealed class Article : ContentItem
{
    public int CategoryTermId { get; set; }

    /// <summary>作者（可指向醫師）。</summary>
    public int? AuthorDoctorId { get; set; }

    /// <summary>作者非團隊成員時的署名。</summary>
    public string? AuthorName { get; set; }

    /// <summary>審閱醫師。</summary>
    public int? ReviewerDoctorId { get; set; }

    public DateOnly? ReviewedOn { get; set; }

    /// <summary>對外顯示的發布日期。遷移時保留舊站原始日期，見上方警告。</summary>
    public DateTime DisplayDate { get; set; }

    public UploadedImage? Cover { get; set; }

    /// <summary>區塊編輯器內容（JSON 區塊陣列）。</summary>
    public string? BodyBlocks { get; set; }

    /// <summary>可由字數自動算。</summary>
    public int? ReadingMinutes { get; set; }

    /// <summary>
    /// 1 主站 <c>share.php</c>／2 <c>20skinblog.com</c>。
    /// <c>Blog</c> 的 101 篇保留原 slug（docs/01 決策三）——跨網域 301 不在本專案範圍，
    /// 若日後要盤點就靠這一欄篩出。
    /// </summary>
    public ArticleSourceSite SourceSite { get; set; }

    public Term Category { get; set; } = null!;
    public Doctor? AuthorDoctor { get; set; }
    public Doctor? ReviewerDoctor { get; set; }
}

/// <summary>
/// 案例（docs/08 §C-5）。
/// <para>
/// 🔴 <b>四個法規揭露欄位一律 NOT NULL。</b> 內容遷移是本機腳本直連 SQL，繞過 API
/// 也就繞過所有前端與 API 層的驗證——這時候只有資料庫約束擋得住，不要放寬成 NULL。
/// </para>
/// </summary>
public sealed class Case : ContentItem
{
    public int TreatmentId { get; set; }

    /// <summary>次數與週期。</summary>
    public string? SessionsText { get; set; }

    /// <summary>敘述。</summary>
    public string? Narrative { get; set; }

    /// <summary>個案差異聲明。</summary>
    public string IndividualVarianceStatement { get; set; } = string.Empty;

    /// <summary>當事人書面同意。</summary>
    public bool HasWrittenConsent { get; set; }

    /// <summary>同意書編號／存放位置。只存索引，同意書本身不進系統。</summary>
    public string ConsentReference { get; set; } = string.Empty;

    /// <summary>拍攝條件。</summary>
    public string ShootingConditions { get; set; } = string.Empty;

    public Treatment Treatment { get; set; } = null!;
    public ICollection<CaseImage> Images { get; set; } = [];
}

/// <summary>案例術前術後照（docs/08 §C-5）。</summary>
public sealed class CaseImage
{
    public int Id { get; set; }
    public int CaseId { get; set; }
    public UploadedImage Image { get; set; } = new();
    public CasePhase Phase { get; set; }
    public DateOnly? TakenOn { get; set; }
    public int SortOrder { get; set; }

    public Case Case { get; set; } = null!;
}

/// <summary>
/// FAQ（docs/08 §C-6）。
/// <para>問題本體＝<c>ContentItems.Title</c>。<b>不產生獨立網址</b>
/// → <c>ContentItems.UrlPath</c> 為 NULL；<c>Slug</c> 仍填，當 <c>/faq/</c> 的頁內錨點用。</para>
/// <para>
/// 🔴 <see cref="WebAnswer"/> 與 <see cref="AiAnswer"/> <b>都是 NOT NULL</b>：
/// <see cref="AiAnswer"/> 是 FAQPage JSON-LD、<c>faq.json</c>、<c>llms-full.txt</c> 的唯一來源，
/// 缺一則該題無法輸出結構化資料。
/// </para>
/// <para>⚠️ 不加「已推送／待推送」欄位（docs/02 §6 明文要求）——AI 介接方式未定，未定不寫 schema。</para>
/// </summary>
public sealed class Faq : ContentItem
{
    /// <summary>引用「分類與標籤」模型，不自建第二份清單。</summary>
    public int CategoryTermId { get; set; }

    /// <summary>網頁版 150–400 字。</summary>
    public string WebAnswer { get; set; } = string.Empty;

    /// <summary>AI 摘要版 60–100 字，語意自足。</summary>
    public string AiAnswer { get; set; } = string.Empty;

    /// <summary>
    /// 最後更新日。與 <c>ContentItems.UpdatedAt</c> 分開：前者是人工可控的內容時效標記
    /// （輸出 <c>dateModified</c>），改個錯字不該讓它跳動。
    /// </summary>
    public DateOnly LastReviewedOn { get; set; }

    /// <summary>
    /// 審閱者署名，例如「黃勇學 醫師」。
    /// ⚠️ 是**自由文字不是外鍵**：審閱者未必是站內有個人頁的醫師，而且這一欄的用途是
    /// 對外顯示「這則答案由誰確認過」，不需要、也不該因為該醫師離職就跟著消失。
    /// </summary>
    public string? ReviewedBy { get; set; }

    public Term Category { get; set; } = null!;
}

/// <summary>
/// 據點（docs/08 §C-7）。
/// <para>
/// <see cref="Address"/>／<see cref="Phone"/>／<see cref="Latitude"/>／<see cref="Longitude"/>
/// 為 NOT NULL：據點頁是地區 SEO 主要落地頁，<c>LocalBusiness</c> 的 <c>geo</c> 是「必要輸出」
/// （docs/08 §C-7），且據點數量少、開幕前資料齊全，不像療程有 12 項尚無內容的情況。
/// </para>
/// </summary>
public sealed class Clinic : ContentItem
{
    public string Address { get; set; } = string.Empty;
    public string Phone { get; set; } = string.Empty;
    public string? LineUrl { get; set; }
    public decimal Latitude { get; set; }
    public decimal Longitude { get; set; }
    public string? MapUrl { get; set; }

    /// <summary>交通與停車。</summary>
    public string? TransportInfo { get; set; }

    public string? Intro { get; set; }

    public ICollection<ClinicBusinessHour> BusinessHours { get; set; } = [];
    public ICollection<ClinicPhoto> Photos { get; set; } = [];
    public ICollection<DoctorSchedule> DoctorSchedules { get; set; } = [];
}

/// <summary>
/// 據點營業時段（docs/08 §C-7）。
/// <para>
/// ⚠️ <b>一天可以有多列</b>，午休斷點就是這樣表達的（09:00–12:00 ／ 14:30–21:00）。
/// 不要做成「開始／結束＋午休開始／午休結束」四個欄位——撐不住第三段診次，
/// 也很難輸出 <c>openingHoursSpecification</c>。休診日＝該 <see cref="DayOfWeek"/> 一列都沒有。
/// </para>
/// </summary>
public sealed class ClinicBusinessHour
{
    public int Id { get; set; }
    public int ClinicId { get; set; }

    /// <summary>0–6，對應 <see cref="DayOfWeek"/> 的數值（0＝星期日）。</summary>
    public byte DayOfWeek { get; set; }

    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }
    public int SortOrder { get; set; }

    public Clinic Clinic { get; set; } = null!;
}

/// <summary>據點照片（docs/08 §C-7）。駐診醫師與可提供療程走 <see cref="ContentRelation"/>。</summary>
public sealed class ClinicPhoto
{
    public int Id { get; set; }
    public int ClinicId { get; set; }
    public UploadedImage Image { get; set; } = new();
    public string? Caption { get; set; }
    public int SortOrder { get; set; }

    public Clinic Clinic { get; set; } = null!;
}

/// <summary>
/// 頁面（docs/08 §C-8）：自由頁與系統頁。
/// <para>
/// <c>PageKind.System</c> 一律 <c>ContentItems.IsSystemLocked = 1</c> → 不可刪除、不可改 slug。
/// 前台路由、麵包屑與 sitemap 分檔都依賴這些路徑存在，允許刪除等於允許編輯把站砍出 404。
/// </para>
/// <para>
/// ⚠️ <c>SystemKey = "home"</c> 這一筆是刻意的：首頁歸給「首頁版位編排」是後台畫面的歸屬，
/// 資料層仍建一筆系統頁純粹為了讓首頁複用工作流、版本歷程與 SEO 區塊。
/// <b><c>/admin/pages</c> 不列出 <c>home</c></b>，這是應用層的顯示規則，不是資料庫規則。
/// </para>
/// </summary>
public sealed class Page : ContentItem
{
    public PageKind PageKind { get; set; }

    /// <summary>系統頁識別碼，如 <c>home</c>／<c>contact</c>／<c>not-found</c>。</summary>
    public string? SystemKey { get; set; }

    /// <summary>導言。</summary>
    public string? Lead { get; set; }

    /// <summary>自由頁內文；系統頁不用。</summary>
    public string? BodyBlocks { get; set; }

    public UploadedImage? Cover { get; set; }

    /// <summary>系統頁：列表排序規則。</summary>
    public byte? ListSortRule { get; set; }

    /// <summary>系統頁：每頁筆數。</summary>
    public int? PageSize { get; set; }

    /// <summary>法務三頁為 1。</summary>
    public bool SuperAdminOnly { get; set; }
}

/// <summary>
/// 分類與標籤（docs/08 §C-9）。
/// <para>⚠️ <b>不加 <c>ParentId</c></b>——未要求巢狀分類，加上去會改變 URL 結構。</para>
/// <para>
/// 🔴 <b>docs/08 要求 <c>UNIQUE (TermType, Slug)</c>，這裡刻意沒有實作</b>——
/// <c>TermType</c> 是本表（TPT 子表）的欄位，<c>Slug</c> 卻在父表 <see cref="ContentItem"/>
/// 上，兩者物理上是兩張不同的資料表。EF Core 的 <c>HasIndex</c>／SQL Server 的 UNIQUE INDEX
/// 都要求所有欄位落在同一張實體表，TPT 下無法直接表示這條跨表複合唯一約束
/// （indexed view 或觸發器可以做到，但都超出「一個 aggregate 一個 Configuration」的範圍，
/// 且 docs/11 §13 不允許在 migration 手寫這類非靜態 DDL）。<b>已回報，不自行加鏡射欄位補洞。</b>
/// </para>
/// </summary>
public sealed class Term : ContentItem
{
    public TermType TermType { get; set; }

    /// <summary>介紹文案。</summary>
    public string? Intro { get; set; }

    public UploadedImage? Cover { get; set; }
}
