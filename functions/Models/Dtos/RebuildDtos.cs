namespace Skin20.Api.Models.Dtos;

/// <summary>
/// <c>GET /admin/rebuild</c> 的狀態（docs/10-api.md §3.4、docs/11 §10）。
///
/// <para>
/// 🔴 <b>這不是「建置進度」，是「有沒有把重建請求送出去」。</b> 送出之後這裡就變回
/// <c>pending=false</c> —— GitHub Actions 跑到哪裡、成功還是失敗，本 API 完全不知道
/// （<c>repository_dispatch</c> 是射後不理）。後台的「發布中／已上線」是<b>樂觀顯示</b>，
/// 不要拿它當部署成功的證據。
/// </para>
/// <para>
/// <see cref="Pending"/> 為 <c>true</c> 代表「有異動累積在冷卻期裡、還沒真正觸發」——
/// 也就是 <c>PendingSince</c> 有值。
/// </para>
/// </summary>
public sealed record RebuildStatusDto(
    bool Pending,
    DateTime? PendingSince,
    DateTime? LastDispatchedAt,
    int CooldownMinutes);
