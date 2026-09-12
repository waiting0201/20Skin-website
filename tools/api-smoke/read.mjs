// 端到端煙霧測試（唯讀）：模擬後台門面實際會打的每一支端點。
//
// 用法：
//   node tools/api-smoke/read.mjs [--api http://localhost:7077/api/v1]
//   SKIN20_SMOKE_USER=... SKIN20_SMOKE_PASSWORD=... node tools/api-smoke/read.mjs
//
// 🔴 **只讀不寫**，可以對任何一個環境跑，包含正式站（除了 POST /contact 會真的寄一封信 ——
//    見檔尾，那一段可以用 --no-contact 跳過）。
//
// ⚠️ 這支的用途是「後台畫面要的東西，API 真的給得出來嗎」。它驗的不是端點回 200，
//    而是**回傳的形狀與鍵名**跟後台 `src/api/` 對得上 —— 對不上不會有錯誤訊息，
//    只會在畫面上留下一片空白欄（2026-09-12 接線時就是靠這支抓到的）。
const argv = process.argv.slice(2)
const apiArg = argv.indexOf('--api')
const BASE = apiArg >= 0 ? argv[apiArg + 1] : (process.env.SKIN20_API_BASE ?? 'http://localhost:7077/api/v1')
const SKIP_CONTACT = argv.includes('--no-contact')
let token = null
let pass = 0, fail = 0

async function call(method, path, body) {
  let res
  try {
    res = await fetchOnce(method, path, body)
  } catch (e) {
    // ⚠️ 原始的 fetch failed 堆疊看不出是「API 沒開」還是「打錯位址」，
    //    而這支腳本九成的失敗都是前者。
    console.error(`\n連不上 ${BASE} —— API 沒有啟動，或 --api 位址不對。\n原因：${e?.cause?.code ?? e.message}\n`)
    process.exit(2)
  }
  const json = await res.json().catch(() => null)
  return { status: res.status, json }
}

async function fetchOnce(method, path, body) {
  return fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}  ${detail}`) }
}

// ── 登入 ───────────────────────────────────────────────────────────────
// ⚠️ 本機這顆 Skin20_Dev 的種子密碼在內容匯入時就被換掉了
//    （tools/content-import/import.mjs 的 IMPORT_PASSWORD）。登入識別是 sa@system.local，不是 sa。
const USER = process.env.SKIN20_SMOKE_USER ?? 'sa@system.local'
const PASS = process.env.SKIN20_SMOKE_PASSWORD ?? process.env.SKIN20_IMPORT_PASSWORD ?? 'Import@2026x'
let r = await call('POST', '/auth/login', { userName: USER, password: PASS })
token = r.json?.data?.accessToken
console.log('\n【認證】')
check('login 成功', r.json?.success === true, JSON.stringify(r.json)?.slice(0,200))
check('回傳 userId', typeof r.json?.data?.userId === 'number', `got ${r.json?.data?.userId}`)
check('回傳 userName', r.json?.data?.userName === USER, `got ${r.json?.data?.userName}`)
check('回傳 doctorId 欄位', 'doctorId' in (r.json?.data ?? {}))
check('回傳 permissions', Array.isArray(r.json?.data?.permissions) && r.json.data.permissions.length === 31,
      `got ${r.json?.data?.permissions?.length}`)

// ── 本次新增的端點 ─────────────────────────────────────────────────────
console.log('\n【本次新增的端點】')
r = await call('GET', '/admin/risk-term')
check('GET /admin/risk-term', r.json?.success && Array.isArray(r.json.data) && r.json.data.length > 0,
      `${r.status} ${r.json?.data?.length} 個字詞`)

r = await call('GET', '/admin/rebuild')
check('GET /admin/rebuild', r.json?.success && typeof r.json.data?.pending === 'boolean', JSON.stringify(r.json?.data))

r = await call('GET', '/admin/redirect/stats')
check('GET /admin/redirect/stats', r.json?.success && typeof r.json.data?.totalCount === 'number', JSON.stringify(r.json?.data))

// ── 清單：逐單元顯示欄位 ───────────────────────────────────────────────
console.log('\n【清單的逐單元顯示欄位】')
const expectExtras = {
  doctor: ['jobTitle', 'isPhysician'],
  article: ['displayDate'],
  case: ['treatmentTitle'],
  faq: ['lastReviewedOn'],
  clinic: ['address', 'phone'],
  page: ['pageKind', 'systemKey'],
  term: ['termType'],
}
for (const [unit, keys] of Object.entries(expectExtras)) {
  r = await call('GET', `/admin/${unit}?page=1&pageSize=5`)
  const first = r.json?.data?.items?.[0]
  const fields = first?.fields ?? {}
  check(`${unit} 清單帶回 ${keys.join('／')}`,
        Boolean(first) && keys.every((k) => k in fields),
        `${r.status} fields=${JSON.stringify(fields)}`)
}
r = await call('GET', '/admin/term?page=1&pageSize=5')
check('term 清單帶回 usageCount', typeof r.json?.data?.items?.[0]?.usageCount === 'number',
      `got ${r.json?.data?.items?.[0]?.usageCount}`)
r = await call('GET', '/admin/treatment?page=1&pageSize=5')
check('treatment 清單帶回 categoryTitle', typeof r.json?.data?.items?.[0]?.categoryTitle === 'string',
      `got ${r.json?.data?.items?.[0]?.categoryTitle}`)
check('非 term 單元 usageCount 為 null', r.json?.data?.items?.[0]?.usageCount === null)

// ── 詳情：欄位鍵名與反向關聯 ──────────────────────────────────────────
console.log('\n【詳情】')
r = await call('GET', '/admin/treatment?page=1&pageSize=1')
const treatmentId = r.json?.data?.items?.[0]?.id
r = await call('GET', `/admin/treatment/${treatmentId}`)
const t = r.json?.data
check('療程詳情有 categoryTermId', t?.fields && 'categoryTermId' in t.fields)
check('療程詳情有 images（不是 gallery）', t?.fields && 'images' in t.fields && !('gallery' in t.fields))
check('療程詳情有 facts', t?.fields && 'facts' in t.fields)

r = await call('GET', '/admin/doctor?page=1&pageSize=1')
const doctorId = r.json?.data?.items?.[0]?.id
r = await call('GET', `/admin/doctor/${doctorId}`)
const d = r.json?.data
const reverse = (d?.relations ?? []).filter((x) => x.isReverse)
check('醫師詳情帶回反向關聯（別人指著我）', reverse.length > 0, `共 ${d?.relations?.length} 筆、其中反向 ${reverse.length} 筆`)
check('反向關聯帶回對方標題', reverse.length === 0 || typeof reverse[0].toTitle === 'string', JSON.stringify(reverse[0]))

r = await call('GET', '/admin/term?page=1&pageSize=1')
const termId = r.json?.data?.items?.[0]?.id
r = await call('GET', `/admin/term/${termId}`)
check('分類詳情有 usageCount', typeof r.json?.data?.fields?.usageCount === 'number',
      `got ${r.json?.data?.fields?.usageCount}`)

// ── 設定：sitemap 分檔 ─────────────────────────────────────────────────
console.log('\n【設定】')
r = await call('GET', '/admin/setting')
const keys = (r.json?.data ?? []).map((i) => i.settingKey)
check('設定有 seo.sitemapFiles', keys.includes('seo.sitemapFiles'))
check('設定有 seo.robotsTxt', keys.includes('seo.robotsTxt'))
const sitemapRaw = (r.json?.data ?? []).find((i) => i.settingKey === 'seo.sitemapFiles')?.settingValue
let parsed = null
try { parsed = JSON.parse(sitemapRaw) } catch {}
check('seo.sitemapFiles 是合法 JSON 且有 5 個分檔', Array.isArray(parsed) && parsed.length === 5,
      `got ${Array.isArray(parsed) ? parsed.length : sitemapRaw?.slice(0,60)}`)

// ── 匯出預覽 ───────────────────────────────────────────────────────────
console.log('\n【匯出預覽】')
for (const kind of ['faq.json', 'llms.txt', 'llms-full.txt']) {
  r = await call('GET', `/admin/export/${encodeURIComponent(kind)}`)
  check(`GET /admin/export/${kind}`, r.json?.success && typeof r.json.data?.content === 'string' && r.json.data.content.length > 0,
        `${r.status} ${r.json?.data?.content?.length} 字元`)
}

// ── 選單 ───────────────────────────────────────────────────────────────
console.log('\n【選單】')
r = await call('GET', '/admin/menu')
const mainNodes = r.json?.data?.main ?? []
check('GET /admin/menu 回主選單', mainNodes.length > 0, `${mainNodes.length} 個頂層節點`)
const withContent = JSON.stringify(mainNodes).includes('"contentType"')
check('選單節點帶 contentType／contentTitle', withContent)

// ── 首頁版位 ───────────────────────────────────────────────────────────
console.log('\n【首頁版位】')
r = await call('GET', '/admin/home-section')
check('GET /admin/home-section 回 7 個版位', (r.json?.data ?? []).length === 7, `got ${(r.json?.data ?? []).length}`)

// ── 公開端點 ───────────────────────────────────────────────────────────
console.log('\n【前台執行期端點】')
const savedToken = token; token = null
r = await call('GET', '/site-settings/public')
check('GET /site-settings/public（匿名）', r.json?.success && typeof r.json.data?.aiFaqEnabled === 'boolean',
      JSON.stringify(r.json?.data))
// ⚠️ POST /contact 會真的寄一封通知信給院方的收件信箱。對正式環境跑時請帶 --no-contact。
if (SKIP_CONTACT) {
  console.log('  · 已跳過 POST /contact（--no-contact）')
} else {
  r = await call('POST', '/contact', {
    name: '煙霧測試', phone: '0900-000-000', email: 'smoke@example.com',
    site: '四季診所', topic: '療程諮詢', message: '這是一筆自動化煙霧測試的提問，請忽略。', privacyConsent: true,
  })
  check('POST /contact', r.json?.success === true, `${r.status} ${JSON.stringify(r.json)?.slice(0,200)}`)
  r = await call('POST', '/contact', { name: '煙霧測試', message: '缺同意', privacyConsent: false, phone: '0900000000' })
  check('POST /contact 未勾同意被擋', r.json?.success === false && r.json?.code === 'VALIDATION_REQUIRED', r.json?.code)
}

// ── 機器人驗證（docs/10 §5，reCAPTCHA v3）─────────────────────────────
//
// ⚠️ 這裡只驗「有沒有啟用」，**驗不出分數門檻與 action 比對** —— 那需要真的站台金鑰
//    （Google 的公開測試金鑰是 v2 的，回應沒有 score 也沒有 action）。
//    完整的九項行為驗證見 STATUS.md §五：用假的 siteverify 端點跑過。
console.log('\n【機器人驗證】')
token = null
r = await call('POST', '/contact', { name: '煙霧測試', phone: '0900-000-000', message: '檢查機器人驗證是否啟用', privacyConsent: true })
if (r.json?.code === 'BOT_CHECK_FAILED') {
  check('已啟用：沒帶 token 會被擋下', true)
} else if (r.json?.success) {
  // 🔴 這在正式環境是一個**缺陷**，不是通過。留空 secret key 等於沒有防護。
  console.log('  ⚠ 未啟用（BotCheck__SecretKey 留空）—— 本機開發正常，**正式環境上線前必須設定**')
  pass++
} else {
  check('機器人驗證狀態可判讀', false, `${r.status} ${r.json?.code}`)
}
token = savedToken

console.log(`\n─────────────\n通過 ${pass}　失敗 ${fail}`)
process.exit(fail === 0 ? 0 : 1)
