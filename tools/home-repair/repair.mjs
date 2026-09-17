// 首頁版位的災難復原：找出最後一版「版位設定還是好的」快照，還原並重新發布。
//
// 🔴 **為什麼需要它**：2026-09-17 正式站踩到 —— 舊版後台的 `putSections`
//    把 `hero.settings` 的陣列壓成物件、把 `specialties.settings` 清成 null
//    （工作表早就壞了，只是沒人重新發布），有人按了發布之後快照也跟著壞，
//    前台首頁當場 500。程式面已經修掉（不會再被弄壞、壞了也只降級不 500），
//    但**已經壞掉的值救不回來** —— 那要靠這一支。
//
// ⚠️ 後台的「版本歷程」畫面 2026-09-16 移除了，端點刻意保留，就是為了這種時候
//    （見 apps/admin/src/components/EditPage.vue 檔尾）。這支工具是那些端點的門面。
//
// ## 用法
//
//   # 只看不改（預設）
//   node tools/home-repair/repair.mjs --api https://…/api/v1
//   # 真的還原並重新發布
//   node tools/home-repair/repair.mjs --api https://…/api/v1 --apply
//
// ## 🔴 正式環境要自己帶 token
//
// `/auth/login` 掛著 reCAPTCHA v3（決策 15），**命令列拿不到 token**，
// 一律回 `BOT_CHECK_FAILED`。請在已登入的後台分頁開 DevTools →
// Network → 任何一支 `/admin/…` 請求 → Request Headers → 複製 `Authorization:
// Bearer …` 後面那一段：
//
//   SKIN20_ADMIN_TOKEN='eyJ…' node tools/home-repair/repair.mjs --api https://…/api/v1 --apply
//
// ⚠️ token 有效期很短，複製完就馬上跑。
// 本機開發環境沒設 `BotCheck:SecretKey`，不帶 token 時會自動用帳密登入。

const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : fallback
}
const API = arg('api', process.env.SKIN20_API_BASE ?? 'http://127.0.0.1:7071/api/v1')
const APPLY = argv.includes('--apply')
const USER = process.env.SKIN20_ADMIN_USER ?? 'sa@system.local'
const PASS = process.env.SKIN20_ADMIN_PASSWORD ?? 'Admin@123'

let token = process.env.SKIN20_ADMIN_TOKEN ?? null

async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, json }
}

async function ensureToken() {
  if (token) return '（用 SKIN20_ADMIN_TOKEN）'
  const r = await call('POST', '/auth/login', { userName: USER, password: PASS })
  if (!r.json?.success) {
    const hint = r.json?.code === 'BOT_CHECK_FAILED'
      ? '\n  🔴 這個環境開了 reCAPTCHA，命令列登不進去 —— 請改帶 SKIN20_ADMIN_TOKEN（用法見檔頭）。'
      : ''
    throw new Error(`登入失敗：${r.json?.code} ${r.json?.message}${hint}`)
  }
  token = r.json.data.accessToken
  return `（帳密登入 ${USER}）`
}

/** 版位設定好不好？hero 要是陣列、specialties 要有東西。 */
function inspectSections(sections) {
  const of = (key) => sections.find((s) => s.sectionKey === key)
  const parse = (raw) => {
    if (raw === null || raw === undefined) return null
    try { return typeof raw === 'string' ? JSON.parse(raw) : raw } catch { return undefined }
  }
  const hero = parse(of('hero')?.settings)
  const specialties = parse(of('specialties')?.settings)
  return {
    heroOk: Array.isArray(hero) && hero.length > 0,
    specialtiesOk: Array.isArray(specialties) && specialties.length > 0,
    heroShape: Array.isArray(hero) ? `陣列 ${hero.length}` : hero === null ? 'null' : hero === undefined ? '非法 JSON' : `物件 keys=${Object.keys(hero).slice(0, 5)}`,
    specialtiesShape: Array.isArray(specialties) ? `陣列 ${specialties.length}` : specialties === null ? 'null' : specialties === undefined ? '非法 JSON' : `物件 keys=${Object.keys(specialties).slice(0, 5)}`,
  }
}

const ok = (b) => (b ? '✓' : '✗')

console.log(`API  ${API}\n模式 ${APPLY ? '🔴 會真的還原並重新發布' : '🟢 只看不改（加 --apply 才動手）'}\n`)
console.log('登入', await ensureToken())

// ── 1. 首頁那筆 Page ──────────────────────────────────────────────────
const pages = await call('GET', '/admin/page?page=1&pageSize=100')
const home = (pages.json?.data?.items ?? []).find((p) => (p.fields ?? {}).systemKey === 'home')
if (!home) throw new Error('找不到 systemKey=home 的那筆 Page')
console.log(`首頁 Page id = ${home.id}（${home.title}）\n`)

// ── 2. 現況 ───────────────────────────────────────────────────────────
const live = (await call('GET', '/admin/home-section')).json?.data ?? []
const now = inspectSections(live)
console.log('【現在的工作表】')
console.log(`  hero        ${ok(now.heroOk)} ${now.heroShape}`)
console.log(`  specialties ${ok(now.specialtiesOk)} ${now.specialtiesShape}`)

if (now.heroOk && now.specialtiesOk) {
  console.log('\n工作表是好的，不需要還原。')
  console.log('（若前台仍然不對，代表只是沒有重新發布 —— 到後台的首頁版位編排按一次「發布」。）')
  process.exit(0)
}

// ── 3. 在版本歷程裡找最後一版好的 ─────────────────────────────────────
const versions = (await call('GET', `/admin/page/${home.id}/versions`)).json?.data ?? []
if (!versions.length) throw new Error('這筆 Page 沒有任何版本快照，救不回來。')
console.log(`\n【版本歷程】共 ${versions.length} 版，由新到舊檢查：`)

const numbers = versions.map((v) => v.versionNo).sort((a, b) => b - a)
let good = null
for (const no of numbers) {
  const snap = (await call('GET', `/admin/page/${home.id}/versions/${no}`)).json?.data
  const raw = snap?.snapshot ?? snap
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
  const sections = parsed?.homeSections ?? []
  if (!Array.isArray(sections) || !sections.length) {
    console.log(`  v${String(no).padStart(3)}  —  快照裡沒有 homeSections`)
    continue
  }
  const state = inspectSections(sections)
  console.log(`  v${String(no).padStart(3)}  hero ${ok(state.heroOk)} ${state.heroShape}　specialties ${ok(state.specialtiesOk)} ${state.specialtiesShape}`)
  if (state.heroOk && state.specialtiesOk) { good = no; break }
}

if (good === null) {
  console.error('\n🔴 所有版本快照的版位設定都是壞的 —— 沒有東西可以還原。')
  console.error('   改用 tools/content-import 重新產出 hero 與 specialties 的設定（見 import.mjs §13）。')
  process.exit(1)
}

console.log(`\n→ 最後一版好的是 v${good}`)
if (!APPLY) {
  console.log('\n🟢 只看不改。要真的動手請加 --apply（會把工作表還原成 v' + good + ' 並重新發布首頁）。')
  process.exit(0)
}

// ── 4. 還原並重新發布 ─────────────────────────────────────────────────
// ⚠️ restore 只還原**工作副本**，前台讀的是已核准快照 —— 一定要再發布一次。
const restored = await call('POST', `/admin/page/${home.id}/versions/${good}/restore`, {})
if (!restored.json?.success) throw new Error(`還原失敗：${restored.json?.code} ${restored.json?.message}`)
console.log(`✓ 已把工作表還原成 v${good}`)

const published = await call('PATCH', `/admin/page/${home.id}/publish`, { action: 'publish' })
if (!published.json?.success) throw new Error(`重新發布失敗：${published.json?.code} ${published.json?.message}`)
console.log('✓ 已重新發布首頁')

// ── 5. 用公開端點覆核（那才是前台真的讀到的東西）──────────────────────
const publicHome = await fetch(`${API}/home`).then((r) => r.json()).catch(() => null)
const after = inspectSections(publicHome?.data ?? [])
console.log('\n【公開端點 GET /home（前台真的讀到的）】')
console.log(`  hero        ${ok(after.heroOk)} ${after.heroShape}`)
console.log(`  specialties ${ok(after.specialtiesOk)} ${after.specialtiesShape}`)
if (!after.heroOk || !after.specialtiesOk) {
  console.error('\n🔴 還原完了，公開端點仍然不對 —— 不要就此收工，請回報。')
  process.exit(1)
}
console.log('\n完成。請實際打開前台首頁確認主視覺輪播與八大專科入口都回來了。')
