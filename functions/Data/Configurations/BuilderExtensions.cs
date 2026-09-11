using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Skin20.Api.Data.Configurations;

/// <summary>
/// 各 Configuration 共用的小工具。放在這裡是為了讓「定序」與「約束命名」
/// 這兩件全域規則只有一個寫法，而不是 37 張表各寫各的。
/// </summary>
public static class BuilderExtensions
{
    /// <summary>
    /// 網址類欄位的定序（docs/08-database.md §0 決策三）。
    ///
    /// <para>
    /// 資料庫預設是 <c>Chinese_Taiwan_Stroke_CI_AS</c>（內容欄位是繁中，後台列表要能正確排序），
    /// 但<b>網址不是語言</b> —— 它是位元組比對。<c>BIN2</c> 讓 index seek 最快、比對結果可預測，
    /// 也避免「大小寫不同的網址被視為同一筆」這種難查的問題。
    /// </para>
    /// <para>
    /// ⚠️ <b>必須逐欄指定，不能只設資料庫預設。</b> 適用於 <c>Slug</c>／<c>UrlPath</c>／
    /// <c>Redirects.FromPath</c>／<c>Redirects.ToPath</c>。
    /// </para>
    /// </summary>
    /// <remarks>
    /// ⚠️ 這裡是泛型而不是 <c>string</c> 與 <c>string?</c> 兩個多載 —— 可為 null 的註記
    /// 不影響 CLR 簽章，兩個多載在編譯期就是重複定義（CS0111）。
    /// </remarks>
    public static PropertyBuilder<TProperty> UseUrlCollation<TProperty>(this PropertyBuilder<TProperty> builder)
        => builder.UseCollation(UrlCollation);

    public const string UrlCollation = "Latin1_General_100_BIN2";
}
