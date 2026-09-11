#!/usr/bin/env bash
# 黃金比對：證明「內容搬進資料庫」沒有弄丟東西。
#
# 用法：
#   tools/content-import/golden-diff.sh snapshot   # 把目前的產物存成黃金樣本
#   tools/content-import/golden-diff.sh compare    # 重建後與黃金樣本比對
#
# ⚠️ 必須正規化掉每次建置都會變的值，否則 107 頁全部都會「不同」：
#      buildId（每次 build 一個新 GUID）、prerenderedAt（時間戳）、
#      _nuxt/*.js 的 chunk 雜湊、payload json 的檔名
#    —— 這些與內容無關。第一次跑沒有正規化時，107 頁全紅，看起來像災難。
#
# ⚠️ **預期內的差異有兩類**，不要試圖把它們「修掉」：
#      ① 圖片網址從 /assets/img/ 變成 Blob 網址 —— 內容圖本來就該存 Blob（docs/02 §4）
#      ② 草稿內容不再被連結 —— 26 項療程沒有站內內容，在資料庫裡是草稿，
#         正式站本來就不該產生那些頁面（STATUS §二）
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

GOLDEN="${SKIN20_GOLDEN_DIR:-.golden-html}"
BUILD=apps/web/.output/public

norm() {
  sed -E \
    -e 's/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/BUILDID/g' \
    -e 's#/_nuxt/[A-Za-z0-9_.-]+\.js#/_nuxt/CHUNK.js#g' \
    -e 's#/[A-Za-z0-9_./-]*\.json\?_b=BUILDID#/PAYLOAD.json?_b=BUILDID#g' \
    -e 's/"prerenderedAt":[0-9]+/"prerenderedAt":0/g' \
    -e 's/,1789[0-9]+\]/,0]/g' "$1"
}

case "${1:-compare}" in
  snapshot)
    rm -rf "$GOLDEN" && mkdir -p "$GOLDEN"
    (cd "$BUILD" && find . -name '*.html' -print0 | tar -cf - --null -T -) | (cd "$GOLDEN" && tar -xf -)
    echo "已存黃金樣本：$(find "$GOLDEN" -name '*.html' | wc -l | tr -d ' ') 頁 → $GOLDEN"
    ;;
  compare)
    [ -d "$GOLDEN" ] || { echo "找不到黃金樣本 $GOLDEN，先跑 snapshot。" >&2; exit 1; }
    same=0; diffs=()
    for f in $(cd "$GOLDEN" && find . -name '*.html' | sort); do
      if [ ! -f "$BUILD/$f" ]; then diffs+=("$f（產物中不存在）"); continue; fi
      if diff -q <(norm "$GOLDEN/$f") <(norm "$BUILD/$f") >/dev/null 2>&1; then
        same=$((same + 1))
      else
        img=$(diff <(norm "$GOLDEN/$f" | tr '<' '\n<') <(norm "$BUILD/$f" | tr '<' '\n<') \
              | grep '^[<>]' | grep -cv 'blob\.core\.windows\.net\|/assets/img/' || true)
        diffs+=("$f（非圖片差異 $img 行）")
      fi
    done
    echo "一致：$same 頁　不同：${#diffs[@]} 頁"
    [ ${#diffs[@]} -gt 0 ] && printf '  %s\n' "${diffs[@]}"
    ;;
  *) echo "用法：$0 [snapshot|compare]" >&2; exit 1 ;;
esac
