#!/usr/bin/env bash
# 本機開發用的資料庫：docker 的 SQL Server 2022 ＋ EF Core 遷移。
#
# 用法：
#   ./scripts/local-db.sh up                 起容器（已在跑就什麼都不做）
#   ./scripts/local-db.sh create [DB]        建庫（定序固定）＋ 套用全部遷移。預設 DB＝20skin-website
#   ./scripts/local-db.sh migrate [DB] [遷移] 套用到最新，或退／進到指定遷移（"0"＝全部退掉）
#   ./scripts/local-db.sh list               列出這台 SQL Server 上的資料庫（含定序與建立日期）
#   ./scripts/local-db.sh drop Skin20_xxx    刪掉一顆用完即丟的庫（只收 Skin20_ 開頭，見下方）
#   ./scripts/local-db.sh rehearse           遷移回滾演練（docs/07 §8「遷移在正式資料庫的實際行為」）
#   ./scripts/local-db.sh rehearse-data [N]  同上，但拿開發庫的副本、帶著真資料退最近 N 支再進回來（預設 3）
#
# 密碼：SKIN20_SA_PASSWORD；沒設的話從容器自己的 MSSQL_SA_PASSWORD 讀（不會印出來）。
#
# 🔴 這台 SQL Server 是多個專案共用的，上面有一顆 `20Skin` 是**別的專案**的庫，
#    名字跟本專案的 `20skin-website` 只差後綴。所以 drop 刻意只收 `Skin20_` 開頭的名字，
#    再加驗定序（Chinese_Taiwan_Stroke_CI_AS）與建立日期（2026-09-11 之後）——
#    只看名字不夠。本機開發庫 `20skin-website` 也不給這支腳本刪，要重建請手動。
#
# ⚠️ 這支腳本只碰 localhost。正式庫的遷移一律走 CI 的 efbundle（CLAUDE.md 決策 8），
#    不要拿 migrate 去指正式環境。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="$ROOT/functions"
CONTAINER="${SKIN20_SQL_CONTAINER:-sqlserver}"
IMAGE="mcr.microsoft.com/mssql/server:2022-latest"
COLLATION="Chinese_Taiwan_Stroke_CI_AS"
DEV_DB="20skin-website"
REHEARSAL_DB="Skin20_Rehearsal"
SQLCMD="/opt/mssql-tools18/bin/sqlcmd"

die() { echo "✗ $*" >&2; exit 1; }

sa_password() {
  if [[ -n "${SKIN20_SA_PASSWORD:-}" ]]; then
    printf '%s' "$SKIN20_SA_PASSWORD"; return
  fi
  docker inspect "$CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
    | sed -n 's/^MSSQL_SA_PASSWORD=//p' | head -1
}

# 密碼走 SQLCMDPASSWORD，不放進 argv（ps 看得到）
sql() {
  docker exec -e SQLCMDPASSWORD="$(sa_password)" "$CONTAINER" \
    "$SQLCMD" -S localhost -U sa -C -b -h -1 -W -s '|' -Q "SET NOCOUNT ON; $1"
}

conn() {
  printf 'Server=localhost,1433;Database=%s;User Id=sa;Password=%s;Encrypt=True;TrustServerCertificate=True' \
    "$1" "$(sa_password)"
}

cmd_up() {
  local state
  state="$(docker inspect "$CONTAINER" --format '{{.State.Status}}' 2>/dev/null || true)"
  case "$state" in
    running) ;;
    "")
      [[ -n "${SKIN20_SA_PASSWORD:-}" ]] || die "容器 $CONTAINER 不存在。第一次建立請先設 SKIN20_SA_PASSWORD（SQL Server 的複雜度規則：8 碼以上、含大小寫數字符號）"
      echo "→ 建立容器 ${CONTAINER}（資料放在 volume ${CONTAINER}-data）"
      docker run -d --name "$CONTAINER" --restart unless-stopped \
        -e ACCEPT_EULA=Y -e MSSQL_SA_PASSWORD="$SKIN20_SA_PASSWORD" \
        -p 1433:1433 -v "${CONTAINER}-data:/var/opt/mssql" "$IMAGE" >/dev/null ;;
    *)
      echo "→ 啟動容器 ${CONTAINER}（目前 ${state}）"
      docker start "$CONTAINER" >/dev/null ;;
  esac
  # SQL Server 起得比容器慢，等它真的收連線
  for _ in $(seq 1 30); do
    sql "SELECT 1" >/dev/null 2>&1 && { echo "✓ SQL Server 就緒（$CONTAINER, localhost:1433）"; return; }
    sleep 2
  done
  die "SQL Server 60 秒內沒有回應：docker logs $CONTAINER"
}

cmd_list() {
  echo "名稱|定序|建立日期"
  sql "SELECT name, collation_name, CONVERT(char(10), create_date, 23) FROM sys.databases WHERE database_id > 4 ORDER BY name"
}

db_exists() { [[ "$(sql "SELECT COUNT(*) FROM sys.databases WHERE name = N'$1'")" == "1" ]]; }

valid_name() { [[ "$1" =~ ^[A-Za-z0-9_-]+$ ]] || die "資料庫名稱只收英數、底線、連字號：$1"; }

cmd_create() {
  local db="${1:-$DEV_DB}"; valid_name "$db"
  if db_exists "$db"; then
    echo "→ $db 已存在，只套用遷移"
  else
    echo "→ 建立 ${db}（COLLATE ${COLLATION}）"
    sql "CREATE DATABASE [$db] COLLATE $COLLATION"
  fi
  cmd_migrate "$db"
}

cmd_migrate() {
  local db="${1:-$DEV_DB}" target="${2:-}"; valid_name "$db"
  db_exists "$db" || die "$db 不存在，先 create"
  echo "→ 遷移 $db ${target:+到 $target}"
  # ⚠️ dotnet ef 會重建專案，正在跑的 func start 會因此掛掉（tools/api-smoke/README.md）
  ( cd "$PROJECT" && dotnet ef database update ${target:+"$target"} --connection "$(conn "$db")" )
}

cmd_drop() {
  local db="${1:-}"; [[ -n "$db" ]] || die "要指定資料庫名稱"
  valid_name "$db"
  [[ "$db" == Skin20_* ]] || die "只刪 Skin20_ 開頭的拋棄式資料庫。$db 不是（20Skin 是別的專案、20skin-website 是開發庫）"
  db_exists "$db" || { echo "→ $db 不存在，略過"; return; }
  local info coll created
  info="$(sql "SELECT collation_name + '|' + CONVERT(char(10), create_date, 23) FROM sys.databases WHERE name = N'$db'")"
  coll="${info%%|*}"; created="${info##*|}"
  [[ "$coll" == "$COLLATION" ]] || die "$db 的定序是 ${coll}，不是本專案的 $COLLATION —— 拒絕刪除"
  [[ "$created" > "2026-09-10" ]] || die "$db 建立於 ${created}，早於本專案 —— 拒絕刪除"
  echo "→ 刪除 ${db}（${coll}，$created 建立）"
  sql "ALTER DATABASE [$db] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$db]"
}

# 結構 ＋ 各表列數的指紋。演練用它比對「退到 0 再進回來」是不是同一個資料庫。
fingerprint() {
  docker exec -e SQLCMDPASSWORD="$(sa_password)" "$CONTAINER" \
    "$SQLCMD" -S localhost -U sa -C -b -h -1 -W -s '|' -d "$1" -Q "SET NOCOUNT ON;
      SELECT 'col', TABLE_NAME, COLUMN_NAME, DATA_TYPE, ISNULL(CHARACTER_MAXIMUM_LENGTH, -1), IS_NULLABLE, ISNULL(COLLATION_NAME, '')
        FROM INFORMATION_SCHEMA.COLUMNS ORDER BY TABLE_NAME, COLUMN_NAME;
      SELECT 'idx', OBJECT_NAME(i.object_id), i.name, i.is_unique, ISNULL(i.filter_definition, '')
        FROM sys.indexes i JOIN sys.tables t ON t.object_id = i.object_id WHERE i.name IS NOT NULL ORDER BY 2, 3;
      SELECT 'fk', OBJECT_NAME(parent_object_id), name, delete_referential_action FROM sys.foreign_keys ORDER BY 2, 3;
      SELECT 'rows', t.name, SUM(p.rows) FROM sys.tables t JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
        WHERE t.name <> '__EFMigrationsHistory' GROUP BY t.name ORDER BY t.name;"
}

cmd_rehearse() {
  local work; work="$(mktemp -d)"
  trap 'rm -rf "$work"' RETURN
  local bundle="$work/efbundle"

  echo "== 0. 模型與遷移一致（CI 同一道檢查）"
  ( cd "$PROJECT" && dotnet ef migrations has-pending-model-changes )

  echo "== 1. 建 bundle（與 CI 同一種產物，只是 runtime 換成本機）"
  ( cd "$PROJECT" && dotnet ef migrations bundle -o "$bundle" --force >/dev/null )

  local -a migrations
  while IFS= read -r m; do migrations+=("$m"); done < <(
    ls "$PROJECT/Data/Migrations" | grep -E '^[0-9]{14}_.*\.cs$' | grep -v Designer | sed 's/\.cs$//' | sort)
  echo "   共 ${#migrations[@]} 支遷移"

  echo "== 2. 拋棄式庫 ${REHEARSAL_DB}：從零進到最新"
  cmd_drop "$REHEARSAL_DB"
  sql "CREATE DATABASE [$REHEARSAL_DB] COLLATE $COLLATION"
  local c; c="$(conn "$REHEARSAL_DB")"
  "$bundle" --connection "$c" >/dev/null
  fingerprint "$REHEARSAL_DB" > "$work/up1.txt"
  echo "   ✓ $(grep -c '^col' "$work/up1.txt") 個欄位、$(grep -c '^rows' "$work/up1.txt") 張表"

  echo "== 3. 逐支往回退（每一支的 Down 單獨跑一次）"
  local i fail=0 t0
  for (( i=${#migrations[@]}-1; i>=0; i-- )); do
    local target="0"; (( i > 0 )) && target="${migrations[i-1]}"
    t0=$(date +%s)
    if "$bundle" --connection "$c" "$target" > "$work/down.log" 2>&1; then
      printf '   ✓ Down %s（%ss）\n' "${migrations[i]}" "$(( $(date +%s) - t0 ))"
    else
      printf '   ✗ Down %s 失敗：\n' "${migrations[i]}"; tail -20 "$work/down.log" | sed 's/^/     /'
      fail=1; break
    fi
  done
  (( fail == 0 )) || { cmd_drop "$REHEARSAL_DB"; die "回滾演練失敗（見上方）"; }

  local left; left="$(sql "SELECT COUNT(*) FROM [$REHEARSAL_DB].sys.tables WHERE name <> '__EFMigrationsHistory'")"
  [[ "$left" == "0" ]] || { cmd_drop "$REHEARSAL_DB"; die "全部退完還剩 $left 張表 —— 某支 Down 沒有把自己建的東西收乾淨"; }
  echo "   ✓ 退到 0，資料表全部收乾淨"

  echo "== 4. 再從零進到最新，與第 2 步比對"
  "$bundle" --connection "$c" >/dev/null
  fingerprint "$REHEARSAL_DB" > "$work/up2.txt"
  if diff -u "$work/up1.txt" "$work/up2.txt" > "$work/diff.txt"; then
    echo "   ✓ 結構與各表列數完全相同"
  else
    echo "   ✗ 兩次的結果不一樣："; sed 's/^/     /' "$work/diff.txt" | head -40
    fail=1
  fi

  cmd_drop "$REHEARSAL_DB"
  (( fail == 0 )) || die "回滾演練：退了再進回來不是同一個資料庫"
  echo "✓ 遷移回滾演練通過（${#migrations[@]} 支）"
}

# 空庫的演練只證明 Down 寫得對；帶著真資料退回去才看得到「Down 把資料丟了」。
# 開發庫是正式內容的匯入，拿它的 COPY_ONLY 備份還原成拋棄式庫來演練 —— 開發庫本身不動。
cmd_rehearse_data() {
  local n="${1:-3}" copy="Skin20_RehearsalData" work
  [[ "$n" =~ ^[0-9]+$ && "$n" -ge 1 ]] || die "N 要是正整數"
  db_exists "$DEV_DB" || die "開發庫 $DEV_DB 不存在"
  work="$(mktemp -d)"; trap 'rm -rf "$work"' RETURN
  local bak="/var/opt/mssql/data/${copy}.bak"

  echo "== 1. 開發庫 → 拋棄式副本 ${copy}（COPY_ONLY，不影響開發庫的備份鏈）"
  cmd_drop "$copy"
  sql "BACKUP DATABASE [$DEV_DB] TO DISK = N'$bak' WITH COPY_ONLY, INIT" >/dev/null
  local data log
  data="$(sql "SELECT name FROM [$DEV_DB].sys.database_files WHERE type = 0")"
  log="$(sql "SELECT name FROM [$DEV_DB].sys.database_files WHERE type = 1")"
  sql "RESTORE DATABASE [$copy] FROM DISK = N'$bak' WITH
         MOVE N'$data' TO N'/var/opt/mssql/data/${copy}.mdf',
         MOVE N'$log'  TO N'/var/opt/mssql/data/${copy}_log.ldf'" >/dev/null
  docker exec "$CONTAINER" rm -f "$bak"

  local -a applied
  while IFS= read -r m; do [[ -n "$m" ]] && applied+=("$m"); done < <(
    sql "SELECT MigrationId FROM [$copy].dbo.__EFMigrationsHistory ORDER BY MigrationId")
  (( ${#applied[@]} > n )) || { cmd_drop "$copy"; die "副本只套用了 ${#applied[@]} 支遷移，退不了 $n 支"; }
  local latest="${applied[${#applied[@]}-1]}" target="${applied[${#applied[@]}-1-n]}"

  local bundle="$work/efbundle" c; c="$(conn "$copy")"
  ( cd "$PROJECT" && dotnet ef migrations bundle -o "$bundle" --force >/dev/null )
  "$bundle" --connection "$c" >/dev/null   # 開發庫若落後於程式，先補到最新
  fingerprint "$copy" > "$work/before.txt"

  echo "== 2. 帶著真資料退到 ${target}（退掉最近 $n 支）"
  "$bundle" --connection "$c" "$target" > "$work/run.log" 2>&1 || {
    grep -E 'Reverting|fail|rror|Msg [0-9]+' "$work/run.log" | tail -12 | sed 's/^/     /'
    cmd_drop "$copy"; die "退回 $target 時失敗（見上方）"; }
  echo "== 3. 再進到最新"
  "$bundle" --connection "$c" > "$work/run.log" 2>&1 || {
    grep -E 'Applying|fail|rror|Msg [0-9]+' "$work/run.log" | tail -12 | sed 's/^/     /'
    cmd_drop "$copy"; die "重新進到最新時失敗（見上方）"; }
  fingerprint "$copy" > "$work/after.txt"

  local fail=0
  if diff -u "$work/before.txt" "$work/after.txt" > "$work/diff.txt"; then
    echo "   ✓ 結構與各表列數完全相同"
  else
    echo "   ✗ 退了再進回來，資料或結構變了："; sed 's/^/     /' "$work/diff.txt" | head -40
    fail=1
  fi
  cmd_drop "$copy"
  (( fail == 0 )) || die "帶資料的回滾演練沒有通過"
  echo "✓ 帶資料的回滾演練通過（最新 ${latest}，退 $n 支）"
}

case "${1:-}" in
  up)       cmd_up ;;
  list)     cmd_list ;;
  create)   shift; cmd_create "$@" ;;
  migrate)  shift; cmd_migrate "$@" ;;
  drop)     shift; cmd_drop "$@" ;;
  rehearse) cmd_rehearse ;;
  rehearse-data) shift; cmd_rehearse_data "$@" ;;
  *) sed -n '2,21p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
