#!/usr/bin/env bash
# 把「執行期 SSR 版前台」部署到 SWA 的**預覽環境**。
#
# 🔴 這支是 ssr-migration 分支專用的驗證工具，不是正式部署腳本。
#    正式站目前仍是靜態版，由 tools/deploy-swa.sh 與 .github/workflows/web.yml 負責。
#
# 為什麼需要它：SSR 換掉的是**部署形態**本身 ——
#   靜態版： output=.output/public（1846 頁 HTML）＋ api=api/（/api/fallback，.NET 9）
#   SSR 版： output=.output/public（只有靜態資產）＋ api=.output/server（Nuxt，Node 22）
# 兩者的 api_location 互斥，所以不能共存，也沒辦法用同一支腳本切換。
#
# ⚠️ **--env 一定要給非 production 的名字。** 給 production 會直接蓋掉正式站。
#    Standard 方案的預覽環境是獨立主機名（<default>-<env>.<region>.azurestaticapps.net），
#    與 default 環境完全隔離。
#
# ⚠️ **設定檔位置不同。** azure-swa preset 把 staticwebapp.config.json 寫到
#    apps/web/（專案根目錄），不是 .output/public —— 所以 --swa-config-location
#    指的是 apps/web，不是靜態版那個 apps/web/public。
#
# 用法：
#   ./tools/deploy-swa-ssr.sh [環境名稱]      # 預設 ssr
set -euo pipefail

RG=rg-20skin-web-prod
SWA=swa-20skin-web-prod
ENV_NAME="${1:-ssr}"

if [[ "$ENV_NAME" == "production" || "$ENV_NAME" == "default" ]]; then
  echo "✗ 拒絕部署到 $ENV_NAME —— 這支腳本只用於預覽環境。" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

# 正式 Function App。⚠️ 新增的公開內容端點（/content、/{unit}、/redirects/resolve、
#    /sitemap）**尚未部署到這台**，所以預覽站上的轉址會是 404，其餘頁面照常
#    —— 資料仍來自建置期內聯的 content/*.json。
API_BASE="${NUXT_PUBLIC_API_BASE_URL:-https://func-20skin-web-api-prod.azurewebsites.net/api/v1}"

echo "── 建置後台 SPA（順序不可顛倒：先 admin 後 web）──"
pnpm --filter admin build

echo "── 建置前台（azure-swa preset，執行期 SSR）──"
NUXT_PUBLIC_API_BASE_URL="$API_BASE" pnpm --filter web build

if [[ ! -d apps/web/.output/server ]]; then
  echo "✗ 找不到 .output/server —— 建置出來的不是 SSR 產物，檢查 nuxt.config 的 nitro.preset" >&2
  exit 1
fi

echo "── 取得部署權杖 ──"
# ⚠️ 不要 echo 這個值，也不要寫進檔案。
TOKEN="$(az staticwebapp secrets list -n "$SWA" -g "$RG" --query 'properties.apiKey' -o tsv)"

echo "── 部署到預覽環境：$ENV_NAME ──"
npx --yes @azure/static-web-apps-cli deploy apps/web/.output/public \
  --api-location apps/web/.output/server \
  --api-language node \
  --api-version 22 \
  --swa-config-location apps/web \
  --deployment-token "$TOKEN" \
  --env "$ENV_NAME"

echo "── 完成 ──"
echo "預覽網址請見上方輸出，或："
echo "  az staticwebapp environment list -n $SWA -g $RG -o table"
