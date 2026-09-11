#!/usr/bin/env bash
# 將 output/ 下的規劃書 HTML 轉為 PDF。
#
# 用法：./scripts/build-pdf.sh [檔名（不含副檔名）]
# 預設：20SKIN-網站改版規劃書
#
# 為什麼用 Chrome headless：本機沒有 pandoc / wkhtmltopdf / weasyprint，
# 且 CJK 字型 fallback 在 Chrome 下最穩（走系統 PingFang TC）。

set -euo pipefail

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NAME="${1:-20SKIN-網站改版規劃書}"
HTML="$ROOT/output/$NAME.html"
PDF="$ROOT/output/$NAME.pdf"

[[ -x "$CHROME" ]] || { echo "找不到 Google Chrome：$CHROME" >&2; exit 1; }
[[ -f "$HTML" ]]   || { echo "找不到來源 HTML：$HTML" >&2; exit 1; }

# file:// URL 需要 percent-encode 中文檔名
URL="file://$(python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1]))' "$HTML")"

"$CHROME" \
  --headless --disable-gpu --no-pdf-header-footer \
  --virtual-time-budget=8000 \
  --print-to-pdf="$PDF" \
  "$URL" 2>&1 | grep -i "bytes written" || true

python3 - "$PDF" <<'PY'
import re, sys, os
p = sys.argv[1]
d = open(p, 'rb').read()
pages = len(re.findall(rb'/Type\s*/Page[^s]', d))
print(f"→ {os.path.basename(p)}｜{pages} 頁｜{len(d)/1024/1024:.1f} MB")
PY

echo
echo "產出完成。請開啟 PDF 目視確認："
echo "  1. 中文字型是否正常（fallback 失敗會出現空白或豆腐字）"
echo "  2. 表格是否有被切在頁面邊界"
echo "  3. 章節開頭是否出現大片空白"
