using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Skin20.Api.Data.Migrations
{
    /// <summary>
    /// <c>Doctors.JobTitle</c> 由 <c>nvarchar(100)</c> 放寬到 <c>nvarchar(300)</c>
    /// （對齊同表的 <c>Specialty</c>）。
    ///
    /// <para>
    /// 🔴 <b>為什麼</b>：職稱 2026-09-18 起是多行的 —— 後台一行打一個，前台的醫師卡與
    /// 個人頁主視覺逐行顯示。而<b>全鏈路沒有任何一層驗長度</b>：
    /// <c>ContentHandler.ApplyDoctorFields</c> 直接賦值，後台那個 <c>maxLength: 100</c>
    /// 只是建議字數提示。超過就是 SQL 例外，症狀是存檔收到一個看不出原因的 500。
    /// 單行 input 時代打不到 100，換成多行文字框之後打得到。
    /// </para>
    /// <para>
    /// ✅ <b>向後相容</b>（docs/07 §5 的先遷移後部署）：放寬欄位是線上作業，
    /// 中間那段「新 schema 配舊程式」完全正常 —— 舊程式寫的值本來就在 100 以內。
    /// </para>
    /// <para>
    /// ⚠️ <c>Down</c> 會把欄位縮回 100。**已經有超過 100 字的職稱時它會失敗**
    /// （SQL Server 不會默默截斷，會擋下 ALTER）。要回退就得先把那幾筆改短。
    /// </para>
    /// <para>
    /// ⚠️ 前台讀的是已核准的版本快照，但職稱存在 <c>Doctors</c> 這張子表、
    /// 跟著快照一起被讀 —— 放寬欄位不需要重新發布任何內容。
    /// </para>
    /// </summary>
    public partial class WidenDoctorJobTitle : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "JobTitle",
                table: "Doctors",
                type: "nvarchar(300)",
                maxLength: 300,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(100)",
                oldMaxLength: 100,
                oldNullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "JobTitle",
                table: "Doctors",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(300)",
                oldMaxLength: 300,
                oldNullable: true);
        }
    }
}
