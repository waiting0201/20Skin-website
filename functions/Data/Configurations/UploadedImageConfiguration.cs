using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Skin20.Api.Models.Entities;

namespace Skin20.Api.Data.Configurations;

// ── 內嵌圖片欄位（docs/08 §0 決策五）──────────────────────────────────────
// 不做媒體庫之後，圖片沒有自己的表：owned type 直接落在擁有者那一張表上，
// 欄位名為「前綴 ＋ 屬性」（Cover → CoverUrl／CoverBlobPath／…）。
// 十個圖片欄位共用這一支設定，避免十份各自為政的長度與可空性。

public static class UploadedImageConfigurationExtensions
{
    /// <summary>
    /// 把一個 <see cref="UploadedImage"/> 導覽屬性設定成內嵌欄位組。
    /// </summary>
    /// <param name="prefix">欄位前綴，例如 <c>Cover</c> → <c>CoverUrl</c>。</param>
    /// <param name="required">
    /// 圖庫明細列（<c>TreatmentImages</c>／<c>CaseImages</c>／<c>ClinicPhotos</c>）為 <c>true</c>——
    /// 那些列的存在理由就是那張圖，沒有圖的列沒有意義。封面與照片欄位為 <c>false</c>。
    /// </param>
    public static void OwnsImage<TOwner>(
        this EntityTypeBuilder<TOwner> b,
        Expression<Func<TOwner, UploadedImage?>> nav,
        string prefix,
        bool required = false)
        where TOwner : class
    {
        b.OwnsOne(nav, i =>
        {
            i.Property(x => x.BlobPath).HasColumnName($"{prefix}BlobPath").HasMaxLength(400).IsRequired();
            i.Property(x => x.Url).HasColumnName($"{prefix}Url").HasMaxLength(600).IsRequired();
            i.Property(x => x.Alt).HasColumnName($"{prefix}Alt").HasMaxLength(300);
            i.Property(x => x.Width).HasColumnName($"{prefix}Width");
            i.Property(x => x.Height).HasColumnName($"{prefix}Height");
            i.Property(x => x.Variants).HasColumnName($"{prefix}Variants");
        });

        b.Navigation(nav).IsRequired(required);
    }
}
