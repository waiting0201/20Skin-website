#!/usr/bin/env bash
# 把獨立的 Azure Functions App（functions/ → func-20skin-web-api-prod）部署到正式環境。
#
# CLAUDE.md 決策 5：只有正式環境，不設 staging、不設 PR 預覽。這支腳本跑的就是正式部署。
# CLAUDE.md 決策 7：這個 App 與 SWA 是**兩件事** —— tools/deploy-swa.sh 不含它
#                   （那支只管前台、後台 SPA 與 /api/fallback），它也不隨內容重建。
#
# 用法：
#   tools/deploy-api.sh             # pre-flight ＋ 部署 ＋ smoke test
#   tools/deploy-api.sh --skip-checks # 跳過 pre-flight，直接部署
#
# 🔴 **這支腳本尚未對 Azure 實跑驗證。**
#    寫於 2026-09-11；在此之前正式環境的 Function App 是手動部署的，repo 裡沒有紀錄。
#    權威來源是 docs/templates/deploy-api.yml（CI 版本，用 Azure/functions-action
#    ＋ sku: flexconsumption）；本腳本是它的本機等價物，在 workflow 進 repo 之前頂著用。
#    **第一次跑請盯著輸出**，跑通之後把這段警告拿掉並更新 STATUS.md §六。
#
# ── 四件不寫下來就會忘記的事 ────────────────────────────────────────────
#
#  1. **先遷移，後部署。**
#     docs/11 §13 第 2 條：沒有 staging，順序是「先遷移、後部署」，中間有一段
#     新 schema 配舊程式。這支腳本**不跑遷移** —— 遷移走 efbundle，是另一件事、
#     也是另一個 SQL 身分（DDL vs DML，docs/08 §J-3）。下方的 pre-flight 只擋得住
#     「模型改了卻忘了 migrations add」，擋不住「migration 加了卻忘了套用到正式庫」。
#
#  2. **這個 App 是 net10.0，SWA 的 api/ 是 net9.0。**
#     後者卡在平台限制（SWA managed functions 的 apiRuntime 上限就是
#     dotnet-isolated:9.0，docs/07 §1）。兩者不要混，也不要把 api/ 改成 net10.0。
#
#  3. **routePrefix 是 api/v1**（functions/host.json），不是預設的 api。
#     所以健康檢查在 /api/v1/health —— 文件裡寫的「GET /health」是邏輯路由的簡寫。
#
#  4. **func 要在 functions/ 目錄裡跑，而且由它自己 build。**
#     Core Tools 認的是「目前目錄」有沒有 host.json，不是吃參數指專案；
#     部署時它會自己跑 `dotnet build --output bin/publish --configuration release`。
#     ⚠️ 下方那次 `dotnet build -c Release` **是 pre-flight 檢查、不是產出**
#     （它不會產生 bin/publish）—— 所以這裡不能帶 --no-build，否則會部署到
#     一份不存在或過期的產物。重複建置一次是刻意付的代價。
#
set -euo pipefail

RG=rg-20skin-web-prod
APP=func-20skin-web-api-prod
BASE="https://${APP}.azurewebsites.net"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

CHECKS=1
[[ "${1:-}" == "--skip-checks" ]] && CHECKS=0

cd "$ROOT/functions"

echo "── 確認 Azure 登入身分 ──"
# func 沿用 az 的認證。沒登入的話它會在部署到一半才失敗，不如先問清楚。
# ⚠️ JMESPath 的鍵必須是 ASCII 識別字（中文要加引號才合法），而 -o tsv 本來就不印鍵名
#    —— 所以這裡直接取值，不要寫成 {訂閱:name, ...}（實測 invalid jmespath_type）。
az account show --query "[name, user.name]" -o tsv

if [[ $CHECKS == 1 ]]; then
  echo "── pre-flight：建置（docs/11 §15：0 errors / 0 warnings）──"
  dotnet build -c Release --nologo

  echo "── pre-flight：模型與 migration 是否同步 ──"
  # ⚠️ 這一條只比對「模型 vs migration 檔案」，**不連資料庫**。
  #    它擋的是「改了 entity 卻忘了 migrations add」——這個組合最常見的錯誤
  #    （docs/11 §13 配套）。擋不住「migration 加了卻沒套用到正式庫」，那要看
  #    dotnet ef migrations list 對正式庫跑的結果。
  if ! dotnet ef migrations has-pending-model-changes --no-build 2>&1 | grep -q "No changes"; then
    echo "   🔴 模型有未產生 migration 的變更。先 dotnet ef migrations add，不要部署。" >&2
    exit 1
  fi
  echo "   ✓ 模型與 migration 一致"
fi

echo "── 部署到 ${APP}（Flex Consumption）──"
# App 本身已經是 dotnet-isolated 10.0（STATUS.md §六），不需要 --dotnet-version 去改它。
func azure functionapp publish "$APP"

echo "── smoke test ──"
# 冷啟動會讓第一次請求慢，所以給重試。docs/07 §8：部署後 smoke test 是三道攔截之一。
CODE=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 60 --retry 5 --retry-delay 10 \
  --retry-all-errors "${BASE}/api/v1/health" || true)
echo "   GET ${BASE}/api/v1/health → ${CODE}"
[[ "$CODE" == "200" ]] || { echo "   🔴 健康檢查失敗（${CODE}）" >&2; exit 1; }

echo "── 完成 ──"
echo "⚠️ 前台與後台 SPA 是另一支：tools/deploy-swa.sh"
