#!/usr/bin/env bash
# 產生 mockup 用的中文襯線字型子集（Noto Serif TC，SIL OFL 1.1，可自行託管）。
#
# 為什麼要自帶字型：
#   mockup 的視覺方向是「新中式編輯感」，標題用宋體是設計的核心。
#   但 Windows 的系統中文襯線體是新細明體（PMingLiU），在大字級下會毀掉整個設計，
#   而 macOS 的 Songti TC 又不在 Windows 上。只能自己帶。
#
# 為什麼要子集化：
#   Noto Serif TC 完整字重約 9.7 MB，三個字重近 30 MB，不可能直接上線。
#   這支腳本只保留三份 mockup 的 *.html 裡實際出現過的字，體積會降到數百 KB。
#
# ⚠️ 改過 mockup／mockup2／mockup3 的文案之後要重跑這支腳本，否則新字會掉回系統字型。
#
# 用法：./scripts/build-mockup-fonts.sh

set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
WORK="${TMPDIR:-/tmp}/20skin-fonts"
OUT_DIRS=("$ROOT/mockup/assets/fonts" "$ROOT/mockup2/assets/fonts" "$ROOT/mockup3/assets/fonts")
WEIGHTS="400 600 700"

mkdir -p "$WORK"
for d in "${OUT_DIRS[@]}"; do mkdir -p "$d"; done

# 1. 準備 fonttools（放在 work 目錄，不污染系統 Python）
if [ ! -x "$WORK/venv/bin/python" ]; then
  echo "── 建立 venv 並安裝 fonttools"
  python3 -m venv "$WORK/venv"
  "$WORK/venv/bin/pip" install --quiet fonttools brotli
fi
PY="$WORK/venv/bin/python"

# 2. 取得原始 TTF（Google Fonts 對通用 UA 會直接給完整 TTF）
if [ ! -f "$WORK/nstc-400.ttf" ]; then
  echo "── 下載 Noto Serif TC 原始字型"
  curl -sS "https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;600;700&display=swap" -o "$WORK/gf.css"
  "$PY" - "$WORK" <<'PYEOF'
import re, sys, urllib.request, os
work = sys.argv[1]
css = open(f"{work}/gf.css", encoding="utf-8").read()
for block in css.split("@font-face")[1:]:
    w = re.search(r"font-weight:\s*(\d+)", block)
    u = re.search(r"url\((https://[^)]+\.ttf)\)", block)
    if w and u:
        dst = f"{work}/nstc-{w.group(1)}.ttf"
        urllib.request.urlretrieve(u.group(1), dst)
        print(f"   {w.group(1)}  {os.path.getsize(dst)//1024} KB")
PYEOF
fi

# 3. 掃出三份 mockup 實際用到的字（字元集共用，三邊輸出同一份）
echo "── 收集字元集"
"$PY" - "$ROOT" "$WORK" <<'PYEOF'
import glob, re, sys
root, work = sys.argv[1], sys.argv[2]
chars = set()
for f in (glob.glob(f"{root}/mockup/*.html") + glob.glob(f"{root}/mockup2/*.html")
          + glob.glob(f"{root}/mockup3/*.html")):
    src = open(f, encoding="utf-8").read()
    # 只留畫面上看得到的文字：去掉 style/script/註解，再去掉標籤
    src = re.sub(r"<style\b.*?</style>|<script\b.*?</script>|<!--.*?-->", " ", src, flags=re.S)
    # alt / title 屬性的文字也會顯示，要保留
    attrs = " ".join(re.findall(r'(?:alt|title|aria-label|content)="([^"]*)"', src))
    chars |= set(re.sub(r"<[^>]+>", " ", src)) | set(attrs)
# 安全邊際：ASCII 可見字元、常用全形標點、數字符號
chars |= set(chr(c) for c in range(0x20, 0x7F))
chars |= set("　、。〈〉《》「」『』【】〔〕〖〗！＂＃＄％＆＇（）＊＋，－．／："
             "；＜＝＞？＠［＼］＾＿｀｛｜｝～·…—–‧∕⋯　○●◎★☆▲△□■◆◇→←↑↓↗↘⌂✓✕№℃±×÷≈≠≤≥∞")
chars |= set("０１２３４５６７８９ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ")
chars.discard("\n"); chars.discard("\r"); chars.discard("\t")
open(f"{work}/charset.txt", "w", encoding="utf-8").write("".join(sorted(chars)))
print(f"   {len(chars)} 個字元")
PYEOF

# 4. 子集化並輸出 woff2
echo "── 子集化"
for w in $WEIGHTS; do
  "$WORK/venv/bin/pyftsubset" "$WORK/nstc-$w.ttf" \
    --text-file="$WORK/charset.txt" \
    --output-file="$WORK/out-$w.woff2" \
    --flavor=woff2 \
    --layout-features='kern,liga,locl,ccmp,vert,vrt2' \
    --no-hinting --desubroutinize
  for d in "${OUT_DIRS[@]}"; do cp "$WORK/out-$w.woff2" "$d/noto-serif-tc-$w.woff2"; done
  printf "   %s  %s\n" "$w" "$(du -h "$WORK/out-$w.woff2" | cut -f1)"
done

for d in "${OUT_DIRS[@]}"; do
cat > "$d/LICENSE.txt" <<'EOF'
Noto Serif TC — SIL Open Font License, Version 1.1
Copyright 2014-2021 Adobe (http://www.adobe.com/), Google LLC.
https://openfontlicense.org/

本目錄的 woff2 為上述字型的子集化產物，授權條件相同。
重新產生：./scripts/build-mockup-fonts.sh
EOF
done

echo "── 完成，輸出於 mockup/、mockup2/、mockup3/ 的 assets/fonts/"
