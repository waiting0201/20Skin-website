#!/usr/bin/env bash
# 把前台（含 /admin 後台 SPA）與 SWA Managed Function（/api/fallback）部署到
# Azure Static Web Apps 的 production 環境。
#
# CLAUDE.md 決策 5：只有正式環境，不設 staging、不設 PR 預覽。
# 這支腳本跑的就是正式部署。
#
# 用法：
#   tools/deploy-swa.sh            # 建置 ＋ 部署
#   tools/deploy-swa.sh --no-build # 沿用現有產物直接部署
#
# ── 四件不寫下來就會忘記的事 ────────────────────────────────────────────
#
#  1. **建置順序：admin 先於 web。**
#     apps/admin 的 vite 產物直接輸出到 apps/web/public/admin/，
#     反過來跑的話 nuxt generate 會把上一版的後台打包進去。
#
#  2. **`--api-language` / `--api-version` 一定要給。**
#     SWA CLI 2.0.8 不會從 staticwebapp.config.json 的 platform.apiRuntime
#     讀出這兩個值，少了就直接拒絕部署（實測訊息：
#     "Cannot deploy to the function app because Function language info isn't provided"）。
#     設定檔裡的 apiRuntime 還是要留著——那是 SWA 執行期要看的。
#
#  3. **404.html 要複製進 function 的產物。**
#     SWA 的 responseOverrides.404 對 function 回的 404 不生效（2026-09-11 實測），
#     而 navigationFallback 會把全站每一個找不到的請求都送進 /api/fallback，
#     所以 404 版面只能由那支 function 自己送。它讀的是產物根目錄的 404.html。
#     ⚠️ 這代表**改了 404 頁的版面要重新部署 API**，不是只重新部署前台。
#
#  4. **api/ 是 net9.0，不是 net10.0。**
#     SWA 的 apiRuntime 上限就是 dotnet-isolated:9.0（docs/07 §1）。
#     functions/ 那個獨立 Function App 才是 net10.0，兩者不要混。
#     那個 App 不由這支腳本部署——它不隨內容重建（CLAUDE.md 決策 7）。

set -euo pipefail

RG=rg-20skin-web-prod
SWA=swa-20skin-web-prod
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_OUT="${TMPDIR:-/tmp}/20skin-api-publish"

BUILD=1
[[ "${1:-}" == "--no-build" ]] && BUILD=0

cd "$ROOT"

if [[ $BUILD == 1 ]]; then
  echo "── 建置後台 SPA（必須在前台之前）──"
  pnpm --filter admin build

  echo "── 建置前台（nuxt generate）──"
  pnpm --filter web build
fi

echo "── 發布 /api/fallback（net9.0、只用 Dapper）──"
rm -rf "$API_OUT"
dotnet publish api/Skin20.Fallback.csproj -c Release -o "$API_OUT" --nologo

# 見上方第 3 點。前台沒建置過就沒有這個檔案，此時不要讓部署失敗——
# function 端有內嵌的最小版面當保底。
if [[ -f apps/web/.output/public/404.html ]]; then
  cp apps/web/.output/public/404.html "$API_OUT/404.html"
  echo "   404.html 已複製進 API 產物（$(wc -c < "$API_OUT/404.html") bytes）"
else
  echo "   ⚠️ 找不到 apps/web/.output/public/404.html，API 將使用內嵌的最小 404 版面"
fi

echo "── 取得部署權杖 ──"
# ⚠️ 不要 echo 這個值，也不要寫進檔案。
TOKEN="$(az staticwebapp secrets list -n "$SWA" -g "$RG" --query 'properties.apiKey' -o tsv)"

echo "── 部署到 production ──"
# ⚠️ --swa-config-location 一定要指定。CLI 會自己往下找 staticwebapp.config.json，
#    從專案根目錄跑的話它會先撿到 docs/templates/ 那份**範本**（實測過）。
#    真正生效的是產物根目錄那份，所以撿錯不會壞掉，但訊息會誤導人 ——
#    而且哪天 CLI 改成用它決定路由就會真的出事。
npx --yes @azure/static-web-apps-cli deploy apps/web/.output/public \
  --api-location "$API_OUT" \
  --api-language dotnetisolated \
  --api-version 9.0 \
  --swa-config-location apps/web/public \
  --deployment-token "$TOKEN" \
  --env production

rm -rf "$API_OUT"
echo "── 完成 ──"
