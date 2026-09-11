// SWA Managed Function 的 composition root．NET 9 isolated worker
//
// 這個檔案刻意極小。它只有一支 function、一個查詢，而每個未命中的請求
// 都要吃一次冷啟動（Managed Functions 是 Consumption、沒有預熱），
// 冷啟動直接影響遷移期約 770 條 301 的回應速度。
// 見 docs/07-deployment.md §2。

using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var host = new HostBuilder()
    // ⚠️ 是 ConfigureFunctionsWorkerDefaults，**不是** ConfigureFunctionsWebApplication。
    //    functions/ 那邊用 ASP.NET Core Integration 是因為它有幾十個端點需要
    //    HttpRequest 的完整形狀；這裡只有一支，少載一整層管線換冷啟動時間。
    .ConfigureFunctionsWorkerDefaults()
    .ConfigureServices(services =>
    {
        // 🔴 SizeLimit 一定要設。Fallback 會把**未命中**也寫進快取
        //    （否則爬蟲密集打不存在的舊網址時每次都查 DB），
        //    沒有上限的話那就是一條隨機網址就能撐大的記憶體洩漏。
        //    每筆 entry 的 Size 是 1，所以這個數字就是「最多記住幾條路徑」。
        services.AddMemoryCache(options => options.SizeLimit = 20_000);
    })
    .Build();

host.Run();
