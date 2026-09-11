namespace Skin20.Api.Models.Entities;

/// <summary>
/// 內容型別（docs/08-database.md §B-1 的 <c>ContentItems.ContentType</c>）。
/// <para>
/// ⚠️ 這些數值是 <c>ContentRelations</c> 複合外鍵與 CHECK 約束的一部分，
/// <b>已經寫進資料庫就不能改</b>。新增型別只能往後加。
/// </para>
/// </summary>
public enum ContentType : byte
{
    Treatment = 1,
    Doctor = 2,
    Concern = 3,
    Article = 4,
    Case = 5,
    Faq = 6,
    Clinic = 7,
    Page = 8,
    Term = 9,
}

/// <summary>
/// 工作流四態（docs/08 §B-1、docs/11 §7）。
/// <para>
/// ⚠️ <b>「已排程」不是第五種狀態</b>，它是 <c>Published</c> ＋ <c>PublishAt &gt; now</c>
/// 推導出來的顯示狀態。核准即 <c>Published</c>，不管 <c>PublishAt</c> 有沒有到 ——
/// 前台可見性由查詢條件決定，不由狀態欄決定。
/// </para>
/// </summary>
public enum ContentStatus : byte
{
    Draft = 1,
    InReview = 2,
    Published = 3,
    Unpublished = 4,
}

/// <summary>送審單狀態（docs/08 §B-3）。</summary>
public enum ReviewStatus : byte
{
    Pending = 1,
    Approved = 2,
    Rejected = 3,
}

/// <summary>高風險字詞分類（docs/08 §B-5、docs/02 §5）。</summary>
public enum RiskTermCategory : byte
{
    EfficacyGuarantee = 1,
    Comparative = 2,
    ImproperSolicitation = 3,
    Testimonial = 4,
}

/// <summary>分類與標籤的型別（docs/08 §C-9）。</summary>
public enum TermType : byte
{
    TreatmentCategory = 1,
    ArticleCategory = 2,
    FaqCategory = 3,
    ArticleTag = 4,
}

/// <summary>醫師的可重複欄位型別（docs/08 §C-2）。</summary>
public enum CredentialType : byte
{
    Education = 1,
    Experience = 2,
    Certification = 3,

    /// <summary>
    /// 現職。⚠️ 與 <see cref="Experience"/> 分開是刻意的：醫師個人頁的時間軸把
    /// 「現職」與「經歷」當成兩種標籤渲染，併成一種會讓畫面上的標籤變掉（2026-09-11 內容搬遷時發現）。
    /// </summary>
    CurrentPosition = 4,
}

/// <summary>
/// 醫師標籤的分組（docs/08 §C-2）。
/// <para>
/// ⚠️ 兩組標籤在個人頁是**兩個不同的區塊**：<see cref="Specialty"/> 是列表卡片上的專長標籤，
/// <see cref="Expertise"/> 是個人頁「擅長項目」。沒有這一欄就會混成同一串。
/// </para>
/// </summary>
public enum DoctorTagType : byte
{
    Specialty = 1,
    Expertise = 2,
}

/// <summary>案例照片的階段（docs/08 §C-5）。</summary>
public enum CasePhase : byte
{
    Before = 1,
    After = 2,
}

/// <summary>頁面型別（docs/08 §C-8）。系統頁一律 <c>IsSystemLocked = 1</c>。</summary>
public enum PageKind : byte
{
    Free = 1,
    System = 2,
}

/// <summary>文章來源站（docs/08 §C-4）。<c>Blog</c> 的 101 篇保留原 slug。</summary>
public enum ArticleSourceSite : byte
{
    MainSite = 1,
    Blog = 2,
}

/// <summary>
/// 內容關聯型別（docs/08 §D）。
/// <para>
/// ⚠️ <c>TreatmentToConcern</c>(2) 與 <c>ConcernToTreatment</c>(5) <b>刻意分開，不要合併</b>：
/// 兩者的排序屬於各自的頁面，合併之後編輯困擾頁的療程順序會連帶弄亂療程頁的困擾順序。
/// </para>
/// <para>⚠️ <b>雙向關聯一律單向存</b>，反向顯示靠 <c>(ToContentItemId, RelationType)</c> 索引查。</para>
/// </summary>
public enum RelationType : byte
{
    TreatmentToDoctor = 1,
    TreatmentToConcern = 2,
    TreatmentToArticle = 3,
    TreatmentToFaq = 4,
    ConcernToTreatment = 5,
    ConcernToFaq = 6,
    ConcernToArticle = 7,
    ClinicToDoctor = 8,
    ClinicToTreatment = 9,
    ClinicToFaq = 10,
    ArticleToTag = 11,
    PageToFeatured = 12,

    /// <summary>
    /// 醫師 → 困擾（「這位醫師擅長處理的困擾」）。
    /// ⚠️ 2026-09-11 補：個人頁本來就有這一區，但原本沒有對應的關聯型別，
    /// 導致這份內容在後台既編不到、也存不下來。
    /// </summary>
    DoctorToConcern = 13,

    /// <summary>
    /// 困擾 → 困擾（「此困擾相關」）。
    /// ⚠️ 2026-09-11 補：困擾頁本來就有這一區，且**推導不出來** —— 8 個困擾裡有 7 個
    /// 沒有任何建議療程，沒有共同點可以算。這是編輯判斷，只能存下來。
    /// </summary>
    ConcernToConcern = 14,
}

/// <summary>未命中題目的來源（docs/08 §F）。</summary>
public enum QuestionSource : byte
{
    SiteSearchNoResult = 1,
    AiFaqMiss = 2,
    ContactForm = 3,
    Manual = 4,
}

/// <summary>未命中題目的處理狀態（docs/08 §F）。</summary>
public enum QuestionStatus : byte
{
    Pending = 1,
    Created = 2,
    Ignored = 3,
}

/// <summary>轉址規則的來源（docs/08 §H）。</summary>
public enum RedirectSource : byte
{
    MigrationTool = 1,
    Manual = 2,
    SystemAuto = 3,
}

/// <summary>登入次數限制的計數維度（docs/08 §A-3）。</summary>
public enum ThrottleDimension : byte
{
    Account = 1,
    IpAddress = 2,
}

/// <summary>選單項目的連結型別（docs/08 §G-3）。</summary>
public enum MenuLinkKind : byte
{
    ContentItem = 1,
    InternalPath = 2,
    ExternalUrl = 3,
}

/// <summary>全站設定的值型別（docs/08 §G-1）。</summary>
public enum SettingValueType : byte
{
    Text = 1,
    Number = 2,
    Boolean = 3,
    Json = 4,
    Url = 5,
}
