using System.Data;
using Microsoft.Data.SqlClient;

namespace Skin20.Api.Data;

/// <summary>
/// Dapper 讀取路徑的連線來源（docs/11-backend-design.md §6）。
///
/// <para>
/// EF Core 負責寫入與 schema，Dapper 負責讀取密集的查詢（後台清單、建置期的
/// 內容匯出、301 對照表）。兩者<b>共用同一條連線字串</b>，不要各自維護一份。
/// </para>
/// <para>
/// ⚠️ 連線字串用 <c>Authentication=Active Directory Default</c>，走
/// <c>DefaultAzureCredential</c>：在 Azure 上是 Function App 的 Managed Identity、
/// 本機是開發者的 <c>az login</c> 身分。<b>兩邊都沒有帳號密碼</b>（docs/07 §6）。
/// </para>
/// <para>
/// ⚠️ 這是 Singleton，但<b>每次呼叫都回傳新的 <see cref="SqlConnection"/></b> ——
/// 連線本身不是執行緒安全的。共用的是字串與連線池，不是連線物件。
/// </para>
/// </summary>
public interface ISqlConnectionFactory
{
    IDbConnection Create();
}

/// <inheritdoc cref="ISqlConnectionFactory"/>
public sealed class SqlConnectionFactory(string connectionString) : ISqlConnectionFactory
{
    public IDbConnection Create() => new SqlConnection(connectionString);
}
