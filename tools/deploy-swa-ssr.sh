#!/usr/bin/env bash
# 把「執行期 SSR 版前台」部署到 SWA 的**預覽環境**。
#
# 本機的備援部署（正式路徑是 .github/workflows/web.yml）。
#
# 🔴 取代了原本的 tools/deploy-swa.sh —— 那支是靜態版的，2026-09-16 刪除。
#    SSR 換掉的是**部署形態**本身：
#      靜態版： output=.output/public（1846 頁 HTML）＋ api=api/（/api/fallback，.NET 9）
#      SSR 版： output=.output/public（只有靜態資產）＋ api=.output/server（Nuxt，Node 22）
#    兩者的 api_location 互斥，不可能共存，所以是換掉而不是並存。
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

# 正式 Function App。
# 🔴 **前台的每一頁都要它** —— 內容、轉址、SEO 產物全部走那台。
#    公開端點（/{unit}、/content、/content/batch、/redirects/resolve、/sitemap、
#    /home、/menu、/seo/*）必須先部署上去，否則預覽站會整站 503。
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
