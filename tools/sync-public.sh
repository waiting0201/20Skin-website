#!/usr/bin/env bash
# 將 master 的新 commit 去除非公開路徑後接到 public 分支上。
#
# 為什麼需要這支腳本：git 無法對不同 remote 過濾路徑，同一分支推到哪裡內容都一樣。
# 因此維持兩條分支：master（完整）→ Remote_NAS；public（精簡）→ Remote_GitHub。
#
# 作法沿用 /Users/tim/webapps/NTI/tools/sync-public.sh（同一套雙 remote 機制）。
#
# ⚠️ EXCLUDE 必須涵蓋「歷史上出現過的路徑」，不只是現在的路徑：
#   reference/   院方提供的原始照片與設計樣板（32MB，最大的單檔 17MB）
#   output/      客戶交付的 PDF 與其 HTML 來源（4.7MB）—— 交付物不公開
#   mockup/      客戶定案的設計稿（13MB）—— ⚠️ **mockup/assets 例外，要留下**：
#                CI 建前台靠它（`sync:assets` 找不到就 exit 1），那些檔案本來就公開
#                掛在網站上。擋的是設計稿 HTML 與院方實景照。
#   mockup2/     落選方向 B（2.7MB，今已 gitignore）
#   mockup3/     落選方向 C（4.1MB，今已 gitignore）
#   .wrangler/   Cloudflare 部署快取
#
# 三份 mockup 的**設計稿本體**被 .gitignore 擋著、根本不會進 master，列在這裡是因為
# NTI 踩過的坑：`planning/` 當初只存在於舊 commit，光看現在的樹會漏掉。
# 這份清單防的是「日後有人把它們 commit 進去、之後才發現」。
#
# 結尾的體積斷言才是真正的安全網：路徑清單永遠可能漏掉某個歷史目錄，體積不會。
# 兩層，各防各的失效模式：
#   MAX_BLOB_MB  單一檔案上限 —— 素材目錄的特徵就是「少數幾個巨大的二進位檔」，
#                這條當場擋下並指出檔名，且不隨原始碼成長漂移
#   MAX_PACK_MB  封包總量上限 —— 對應 GitHub 的 2GB 單次推送上限
#
# ⚠️ 量的是「封包後」而不是未壓縮總和。未壓縮總和把每個檔案的每一版都算一次全文，
#    純文字又壓得很兇，兩者差可到 7 倍。用未壓縮總和會被原始碼的正常成長先撐爆，
#    到時候擋下推送、訊息卻寫「EXCLUDE 漏了大目錄」—— 一個會謊報的安全網比沒有更糟。
#
# 作法：用暫存 index 重建 tree，不動工作目錄。每個 public commit 保留來源的訊息、
# 作者與日期，並加註 X-Source-Commit 供下次判斷進度。append-only，永不需要 force push。
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

SRC=master
DST=public
# ⚠️ `:!mockup/assets` 是 git 的排除型 pathspec —— 讓 mockup 其餘內容照樣被剔除，
#    只留下 CI 需要的素材。拿掉它，public 分支就建不起前台。
EXCLUDE="reference output mockup mockup2 mockup3 .wrangler :!mockup/assets"
MAX_PACK_MB=50    # 封包總量
MAX_BLOB_MB=2     # 單一檔案

if git rev-parse --verify -q "refs/heads/$DST" >/dev/null; then
    parent=$(git rev-parse "$DST")
    last=$(git log -1 --format=%B "$DST" | sed -n 's/^X-Source-Commit: //p' | tail -1)
else
    parent=""
    last=""
fi

range="$SRC"
[ -n "$last" ] && range="$last..$SRC"

commits=$(git rev-list --reverse "$range" 2>/dev/null || true)
if [ -z "$commits" ]; then
    echo "public 已與 $SRC 同步，無需動作。"
    exit 0
fi

tmpidx=$(mktemp -t skin20-sync-idx)
trap 'rm -f "$tmpidx"' EXIT

n=0
for c in $commits; do
    rm -f "$tmpidx"
    export GIT_INDEX_FILE="$tmpidx"
    git read-tree "$c"
    # 純 index plumbing：不碰工作目錄，也不做 git rm 的工作目錄掃描（快上數千倍）
    # shellcheck disable=SC2086
    git ls-files -z -- $EXCLUDE | xargs -0 -r git update-index --force-remove --
    tree=$(git write-tree)
    unset GIT_INDEX_FILE

    GIT_AUTHOR_NAME=$(git log -1 --format=%an "$c")
    GIT_AUTHOR_EMAIL=$(git log -1 --format=%ae "$c")
    GIT_AUTHOR_DATE=$(git log -1 --format=%aI "$c")
    GIT_COMMITTER_NAME=$(git log -1 --format=%cn "$c")
    GIT_COMMITTER_EMAIL=$(git log -1 --format=%ce "$c")
    GIT_COMMITTER_DATE=$(git log -1 --format=%cI "$c")
    export GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_AUTHOR_DATE \
           GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL GIT_COMMITTER_DATE

    msg="$(git log -1 --format=%B "$c")
X-Source-Commit: $c"

    if [ -n "$parent" ]; then
        new=$(printf '%s\n' "$msg" | git commit-tree "$tree" -p "$parent")
    else
        new=$(printf '%s\n' "$msg" | git commit-tree "$tree")
    fi
    parent=$new
    n=$((n + 1))
    printf '  %s → %s  %s\n' "$(git rev-parse --short "$c")" "$(git rev-parse --short "$new")" \
        "$(git log -1 --format=%s "$c")"
done

# 第一層：單一檔案。漏網的素材目錄會在這裡當場現形，附上檔名。
big=$(git rev-list --objects "$parent" \
    | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' 2>/dev/null \
    | awk -v max="$((MAX_BLOB_MB * 1048576))" '$1=="blob" && $3+0>max {
          p=""; for (i=4; i<=NF; i++) p = p (i>4 ? " " : "") $i
          if (p == "") p = "(無路徑)"
          printf "%8.2f MB  %s\n", $3/1048576, p
      }' | sort -rn | head -5)

if [ -n "$big" ]; then
    echo "" >&2
    echo "中止：$DST 的歷史含超過 ${MAX_BLOB_MB} MB 的檔案。" >&2
    echo "$big" >&2
    echo "  多半代表 EXCLUDE 漏掉了某個（可能只存在於舊 commit 的）素材目錄。" >&2
    echo "  $DST 分支未更新。" >&2
    exit 1
fi

# 第二層：封包總量，即實際推給 GitHub 的位元組數。
pack_mb=$(git rev-list --objects "$parent" | awk '{print $1}' \
    | git pack-objects --stdout 2>/dev/null | wc -c \
    | awk '{printf "%.1f", $1/1048576}')

if [ "$(printf '%.0f' "$pack_mb")" -gt "$MAX_PACK_MB" ]; then
    echo "" >&2
    echo "中止：$DST 封包後 ${pack_mb} MB，超過上限 ${MAX_PACK_MB} MB。" >&2
    echo "  單檔都在上限內卻總量過大，代表混進了大量檔案而不是單一大檔。" >&2
    echo "  查法：git rev-list <sha> | while read c; do git ls-tree --name-only \$c; done | sort -u" >&2
    echo "  $DST 分支未更新。" >&2
    exit 1
fi

git update-ref "refs/heads/$DST" "$parent"
echo "已同步 $n 個 commit 到 ${DST}（$(git rev-parse --short "$DST")），封包後 ${pack_mb} MB。"
echo "推送：git push Remote_GitHub"
