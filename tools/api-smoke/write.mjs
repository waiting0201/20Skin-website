// 寫入路徑的端到端測試。
//
// 🔴 **它會真的建立、修改、發布、刪除內容 —— 絕對不要對正式環境或本機的 `20skin-website` 跑。**
//    （本機開發庫 2026-09-14 由 `Skin20_Dev` 更名為 `20skin-website`，與正式庫同名。）
//    請開一顆用完即丟的資料庫：
//
//      docker exec sqlserver /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P '…' -C \
//        -Q "CREATE DATABASE Skin20_WriteTest COLLATE Chinese_Taiwan_Stroke_CI_AS;"
//      cd functions && dotnet ef database update --connection '…Database=Skin20_WriteTest…'
//      SQL_DATABASE=Skin20_WriteTest SQL_CONNECTION_STRING='…' func start --port 7078
//      node tools/api-smoke/write.mjs
//
// 這裡刻意送出**後台門面實際會產生的形狀**（apps/admin/src/api/content-fields.ts 的輸出）：
// 數值已轉成 number、集合帶 sortOrder、醫師的兩組標籤合併成一個 tags 陣列。
// 這支測的是「後台送得出去的東西，API 真的收得下嗎」。
//
// ⚠️ 可重複執行：開頭會先清掉上一次留下的測試資料，登入也能認得已經換過的密碼。
const argv = process.argv.slice(2)
const apiArg = argv.indexOf('--api')
const BASE = apiArg >= 0 ? argv[apiArg + 1] : (process.env.SKIN20_API_BASE ?? 'http://localhost:7078/api/v1')
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
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}  ${detail}`) }
}

// ── 登入（種子帳號，首登強制改密碼）─────────────────────────────────────
console.log('\n【首登強制改密碼】')
// 這支測試可重複執行：第一次跑會走完整的「首登 → 強制改密碼」，之後密碼已經換過，直接登入。
let r = await call('POST', '/auth/login', { userName: 'sa@system.local', password: 'Admin@123' })
if (r.json?.success) {
  check('種子帳號登入照發 token', typeof r.json.data?.accessToken === 'string')
  check('且帶 mustChangePassword=true', r.json?.data?.mustChangePassword === true)
  token = r.json.data.accessToken
  r = await call('GET', '/admin/treatment')
  check('未改密碼前其他端點被擋', r.json?.code === 'AUTH_MUST_CHANGE_PASSWORD', `got ${r.json?.code}`)
  r = await call('POST', '/auth/change-password', { currentPassword: 'Admin@123', newPassword: 'Write@Test12345' })
  check('改密碼成功', r.json?.success === true, JSON.stringify(r.json)?.slice(0, 150))
} else {
  console.log('  · 密碼已於前一次執行換過，跳過首登流程')
}
r = await call('POST', '/auth/login', { userName: 'sa@system.local', password: 'Write@Test12345' })
token = r.json?.data?.accessToken
check('改完可正常登入', r.json?.data?.mustChangePassword === false, JSON.stringify(r.json)?.slice(0, 150))

// ── 清掉上一次沒刪乾淨的測試資料（讓這支可以重複執行）─────────────────
//
// ⚠️ 先把首頁版位清空再刪內容。版位的 HomeSectionItems 有外鍵指著內容，
//    還被引用時 DELETE 會失敗 —— 而失敗是靜默的（這裡不檢查回應），
//    下一次執行就會在「建立醫師」那一步撞上 409 slug 重複。
await call('PUT', '/admin/home-section', {
  sections: ['hero', 'specialties', 'featured-treatments', 'latest-articles', 'doctors', 'clinics', 'brand-story']
    .map((sectionKey, i) => ({ sectionKey, isEnabled: true, sortOrder: i + 1, settings: null, items: [] })),
})
// 轉址：測試用的兩條與內容改名時自動補的那幾條都要清掉，否則「首次匯入」不再是首次。
for (const keyword of ['old-a.php', 'old-b.php', 'write-test']) {
  const rows = (await call('GET', `/admin/redirect?keyword=${keyword}&page=1&pageSize=100`)).json?.data?.items ?? []
  for (const row of rows) await call('DELETE', `/admin/redirect/${row.id}`)
}

for (const [unit, slug] of [['treatment', 'write-test-treatment'], ['doctor', 'write-test-doctor'],
                            ['concern', 'write-test-concern'], ['term', 'write-test-tag'],
                            ['article', 'write-test-article']]) {
  const list = (await call('GET', `/admin/${unit}?page=1&pageSize=100`)).json?.data?.items ?? []
  const hit = list.find((i) => i.slug === slug)
  if (hit) {
    const del = await call('DELETE', `/admin/${unit}/${hit.id}`)
    if (!del.json?.success) {
      console.error(`\n清不掉上一次的 ${unit}/${slug}：${del.json?.message ?? del.status}\n請改用一顆乾淨的資料庫（見檔頭）。\n`)
      process.exit(2)
    }
  }
}

// ── 建立療程：後台門面實際送出的形狀 ───────────────────────────────────
console.log('\n【建立療程（後台門面的欄位形狀）】')
const terms = (await call('GET', '/admin/term?page=1&pageSize=100')).json.data.items
const treatmentCat = terms.find((t) => t.fields?.termType === 1)
check('找得到療程分類種子', Boolean(treatmentCat), JSON.stringify(terms[0]?.fields))

r = await call('POST', '/admin/treatment', {
  title: '寫入測試療程',
  slug: 'write-test-treatment',
  fields: {
    categoryTermId: treatmentCat.id,       // ← 畫面上是字串，content-fields.ts 轉成數字
    nameEn: 'Write Test',
    subtitle: '副標',
    indications: '適應症測試',
    mechanism: '原理測試',
    durationText: '30 分鐘',
    sessionsText: '3 次',
    steps: '流程測試',
    aftercare: '術後照護測試',
    contraindications: '禁忌症測試',
    deviceInfo: '儀器測試',
    facts: '規格數據列測試',
    cover: null,
    images: [],
  },
})
check('建立成功', r.json?.success === true, `${r.status} ${JSON.stringify(r.json)?.slice(0, 250)}`)
const treatmentId = r.json?.data?.id
check('urlPath 由分類 ＋ slug 推導', r.json?.data?.urlPath?.endsWith('/write-test-treatment/'), r.json?.data?.urlPath)
check('facts 有存進去', r.json?.data?.fields?.facts === '規格數據列測試')

// ── 更新：數值欄位必須是數字 ───────────────────────────────────────────
console.log('\n【型別把關】')
// 🔴 數值欄位傳字串**不會報錯，會被靜靜忽略**（JInt 對 JSON 字串回 null）——
//    這正是 content-fields.ts 一定要轉型的理由：<select> 吐的是字串，
//    不轉的話「換分類」按下去回 200、畫面重整後分類沒變，而且沒有任何錯誤訊息。
const otherCat = terms.find((t) => t.fields?.termType === 1 && t.id !== treatmentCat.id)
r = await call('PUT', `/admin/treatment/${treatmentId}`, { fields: { categoryTermId: String(otherCat.id) } })
check('數值欄位傳字串會被靜靜忽略（證明前端轉型是必要的）',
      r.json?.success === true && r.json.data.fields.categoryTermId === treatmentCat.id,
      `${r.status} categoryTermId=${r.json?.data?.fields?.categoryTermId}`)
r = await call('PUT', `/admin/treatment/${treatmentId}`, { fields: { categoryTermId: otherCat.id } })
check('轉成數字之後才真的寫得進去', r.json?.data?.fields?.categoryTermId === otherCat.id,
      `got ${r.json?.data?.fields?.categoryTermId}`)

// 🔴 換回原本的分類＝網址改回舊值（A→B→A）。原本會撞上 Redirects 的唯一索引，
//    回一個指向 slug 的 409，而且**整筆內容存不進去**。
r = await call('PUT', `/admin/treatment/${treatmentId}`, { fields: { categoryTermId: treatmentCat.id } })
check('網址改回舊值（A→B→A）不會被轉址表擋下', r.json?.success === true,
      `${r.status} ${JSON.stringify(r.json)?.slice(0, 200)}`)
r = await call('GET', `/admin/redirect?keyword=write-test-treatment`)
const shadow = (r.json?.data?.items ?? []).find((x) => x.fromPath === '/treatments/laser/write-test-treatment/')
check('不會留下「指向現用網址」的殭屍規則', !shadow,
      JSON.stringify(r.json?.data?.items?.map((x) => `${x.fromPath}→${x.toPath}`)))

// 讀回來的形狀直接改一改再送回去，必須要能寫進去（2026-09-12 踩到的那個坑）
r = await call('GET', `/admin/treatment/${treatmentId}`)
const roundTrip = r.json.data
roundTrip.fields.subtitle = '往返測試'
r = await call('PUT', `/admin/treatment/${treatmentId}`, { title: roundTrip.title, fields: roundTrip.fields })
check('把讀到的整包 fields 送回去可以寫入（讀寫對稱）',
      r.json?.success === true && r.json.data.fields.subtitle === '往返測試',
      `${r.status} ${JSON.stringify(r.json)?.slice(0, 200)}`)
check('往返之後其他欄位沒有被清掉', r.json?.data?.fields?.facts === '規格數據列測試', JSON.stringify(r.json?.data?.fields?.facts))

// ── 文章內文：區塊 JSON 的往返 ─────────────────────────────────────────
//
// 🔴 **這一段擋的是「存一次就毀一篇文章」。**
//    `BodyBlocks` 的回應端輸出的是字串，寫入端原本一律 `GetRawText()` ——
//    對字串節點它會連外層引號與跳脫一起取回，於是讀出來原樣存回去就多包一層編碼。
//    前台 `JSON.parse` 拿到字串不是陣列，`v-for` 跑字串會逐字元迭代、
//    每個字元都比不到 `block.type`，**整篇內文靜默消失**（HTTP 仍是 200）。
//
// ⚠️ 上面那段療程的往返測試擋不到它：`facts` 走 `JStr`，讀寫本來就對稱。
//    區別只在 `Article.BodyBlocks` 與 `Page.BodyBlocks` 這兩欄。
console.log('\n【文章內文的區塊 JSON 往返】')
const articleCat = terms.find((t) => t.fields?.termType === 2)
check('找得到文章分類種子', Boolean(articleCat))

const blocks = [
  { type: 'lead', text: '導言測試' },
  { type: 'heading', level: 2, id: 'why', text: '小標測試' },
  { type: 'paragraph', text: '段落測試' },
]
r = await call('POST', '/admin/article', {
  title: '寫入測試文章',
  slug: 'write-test-article',
  summary: '摘要測試',
  // ⚠️ 匯入腳本送的是**陣列本身**（tools/content-import/import.mjs:497），這裡照抄那個形狀。
  fields: { categoryTermId: articleCat.id, bodyBlocks: blocks, cover: null },
})
check('建立文章（bodyBlocks 送陣列）', r.json?.success === true, `${r.status} ${JSON.stringify(r.json)?.slice(0, 250)}`)
const articleId = r.json?.data?.id
check('回應把 bodyBlocks 給成字串', typeof r.json?.data?.fields?.bodyBlocks === 'string')
check('存進去的是內層 JSON，沒有多包一層',
      JSON.parse(r.json?.data?.fields?.bodyBlocks ?? 'null')?.[2]?.text === '段落測試',
      String(r.json?.data?.fields?.bodyBlocks).slice(0, 120))

// 🔴 核心：把讀到的整包 fields 原樣送回去（後台按「儲存本文」就是這個形狀）
r = await call('GET', `/admin/article/${articleId}`)
const articleRT = r.json.data
r = await call('PUT', `/admin/article/${articleId}`, { title: articleRT.title, fields: articleRT.fields })
check('原樣存回去不會多包一層編碼（後台存一次不會毀掉內文）',
      JSON.parse(r.json?.data?.fields?.bodyBlocks ?? 'null')?.[2]?.text === '段落測試',
      String(r.json?.data?.fields?.bodyBlocks).slice(0, 160))

// 再存一次：真的雙重編碼的話，第二次會再包一層，這裡會更明顯
r = await call('GET', `/admin/article/${articleId}`)
r = await call('PUT', `/admin/article/${articleId}`, { fields: { bodyBlocks: r.json.data.fields.bodyBlocks } })
check('連存兩次仍然是同一份內容',
      JSON.parse(r.json?.data?.fields?.bodyBlocks ?? 'null')?.length === 3,
      String(r.json?.data?.fields?.bodyBlocks).slice(0, 160))

// 形狀把關：文章的最外層必須是陣列，弄成物件就是整頁內文不渲染
r = await call('PUT', `/admin/article/${articleId}`, { fields: { bodyBlocks: { type: 'paragraph' } } })
check('最外層不是陣列會被擋下', r.json?.code === 'VALIDATION_FORMAT', `${r.status} ${r.json?.code}`)
r = await call('PUT', `/admin/article/${articleId}`, { fields: { bodyBlocks: '[{"type":' } })
check('壞掉的 JSON 會被擋下', r.json?.code === 'VALIDATION_FORMAT', `${r.status} ${r.json?.code}`)

// 新增分類：termType 在畫面上是唯讀，但新增時必須送得出去
r = await call('POST', '/admin/term', { title: '寫入測試標籤', slug: 'write-test-tag', fields: { termType: 4 } })
check('新增標籤（termType 在巢狀 fields 裡）', r.json?.success === true, `${r.status} ${JSON.stringify(r.json)?.slice(0, 200)}`)
const tagId = r.json?.data?.id

// ── 醫師：兩個輸入框 → 一張 DoctorTags 表 ──────────────────────────────
console.log('\n【醫師的兩組標籤合併】')
r = await call('POST', '/admin/doctor', {
  title: '寫入測試醫師',
  slug: 'write-test-doctor',
  fields: {
    jobTitle: '主治醫師',
    isPhysician: true,
    specialty: '皮膚科',
    photo: null,
    bio: '簡介',
    publications: '',
    credentials: [{ type: 4, text: '現職測試', sortOrder: 0 }],
    schedules: [],
    // content-fields.ts 的 mergeDoctorTags 輸出：type 1＝專長標籤、type 2＝專長領域
    tags: [
      { type: 1, tag: '專長A', sortOrder: 0 },
      { type: 1, tag: '專長B', sortOrder: 1 },
      { type: 2, tag: '擅長X', sortOrder: 0 },
    ],
  },
})
check('建立醫師成功', r.json?.success === true, `${r.status} ${JSON.stringify(r.json)?.slice(0, 250)}`)
const doctorId = r.json?.data?.id
const tags = r.json?.data?.fields?.tags ?? []
check('兩組標籤都存下來且分得開',
      tags.filter((t) => t.type === 1).length === 2 && tags.filter((t) => t.type === 2).length === 1,
      JSON.stringify(tags))
check('學經歷的「現職」型別保住（type=4）', r.json?.data?.fields?.credentials?.[0]?.type === 4)

// ── 關聯：PUT 是整筆取代 ───────────────────────────────────────────────
console.log('\n【關聯整筆取代】')
r = await call('POST', '/admin/concern', {
  title: '寫入測試困擾', slug: 'write-test-concern',
  fields: { symptoms: '症狀', causes: '成因', selfCheckGuide: '', whenToSeeDoctor: '', recommendationIntro: '', cover: null },
})
check('建立困擾成功', r.json?.success === true, `${r.status} ${JSON.stringify(r.json)?.slice(0, 200)}`)
const concernId = r.json?.data?.id

r = await call('PUT', `/admin/treatment/${treatmentId}/relations`, [
  { relationType: 1, toContentItemId: doctorId, sortOrder: 0, note: null },
])
check('寫入「關聯醫師」', r.json?.success === true, JSON.stringify(r.json)?.slice(0, 200))
r = await call('GET', `/admin/treatment/${treatmentId}`)
check('療程端看得到正向關聯', (r.json?.data?.relations ?? []).some((x) => x.relationType === 1 && !x.isReverse))

r = await call('GET', `/admin/doctor/${doctorId}`)
const rev = (r.json?.data?.relations ?? []).filter((x) => x.isReverse && x.relationType === 1)
check('醫師端看得到反向關聯（本次修的重點）', rev.length === 1, JSON.stringify(r.json?.data?.relations))
check('反向關聯的「對方」是療程而不是自己', rev[0]?.toContentItemId === treatmentId, JSON.stringify(rev[0]))

// 只送一個 relationType 會把其他的刪掉 —— 門面因此要先讀現況再合併
r = await call('PUT', `/admin/treatment/${treatmentId}/relations`, [
  { relationType: 2, toContentItemId: concernId, sortOrder: 0, note: null },
])
r = await call('GET', `/admin/treatment/${treatmentId}`)
const forward = (r.json?.data?.relations ?? []).filter((x) => !x.isReverse)
check('只送一種 relationType 會刪掉其他種（門面必須先合併）',
      forward.length === 1 && forward[0].relationType === 2, JSON.stringify(forward))

// ── 工作流：送審 → 審核佇列 → 核准 ─────────────────────────────────────
console.log('\n【工作流】')
r = await call('POST', `/admin/treatment/${treatmentId}/submit`, {})
check('送審成功', r.json?.success === true, JSON.stringify(r.json)?.slice(0, 200))
r = await call('PUT', `/admin/treatment/${treatmentId}`, { title: '送審中不該能改' })
check('送審中本文鎖定', r.json?.code === 'CONFLICT_STATE', `got ${r.json?.code}`)
r = await call('PUT', `/admin/treatment/${treatmentId}/seo`, { seoTitle: '送審中 SEO 仍可改', noIndex: false })
check('送審中 SEO 仍可改（docs/11 §7）', r.json?.success === true, JSON.stringify(r.json)?.slice(0, 150))

r = await call('GET', '/admin/review')
const review = (r.json?.data?.items ?? []).find((x) => x.contentItemId === treatmentId)
check('出現在共用審核佇列', Boolean(review), JSON.stringify(r.json?.data)?.slice(0, 200))
r = await call('POST', `/admin/review/${review.id}/reject`, {})
check('退回未填原因被擋', r.json?.success === false, `got ${r.json?.code}`)
r = await call('POST', `/admin/review/${review.id}/approve`, {})
check('核准成功', r.json?.success === true, JSON.stringify(r.json)?.slice(0, 150))
r = await call('GET', `/admin/treatment/${treatmentId}`)
check('核准後狀態為已發布', r.json?.data?.status === 3, `got ${r.json?.data?.status}`)

// ── 首頁版位：工作副本 ＋ 掛在首頁那筆 Page 上的工作流 ─────────────────
console.log('\n【首頁版位的工作流】')
const pages = (await call('GET', '/admin/page?page=1&pageSize=100')).json.data.items
const homePage = pages.find((p) => p.fields?.systemKey === 'home')
check('找得到首頁那筆系統頁', Boolean(homePage))
await call('PATCH', `/admin/page/${homePage.id}/publish`, { action: 'publish' })
r = await call('GET', `/admin/page/${homePage.id}`)
check('先把首頁設成已發布', r.json?.data?.status === 3, `got ${r.json?.data?.status}`)

r = await call('PUT', '/admin/home-section', {
  sections: [{ sectionKey: 'doctors', isEnabled: true, sortOrder: 4, settings: null, items: [{ contentItemId: doctorId, sortOrder: 0 }] }],
})
check('存版位成功', r.json?.success === true, JSON.stringify(r.json)?.slice(0, 200))
r = await call('GET', `/admin/page/${homePage.id}`)
check('存版位把首頁打回草稿（本次修的重點）', r.json?.data?.status === 1, `got ${r.json?.data?.status}`)

r = await call('POST', `/admin/page/${homePage.id}/submit`, {})
check('首頁可送審', r.json?.success === true, JSON.stringify(r.json)?.slice(0, 150))
r = await call('GET', '/admin/review')
const homeReview = (r.json?.data?.items ?? []).find((x) => x.contentItemId === homePage.id)
check('首頁進的是同一個共用審核佇列', Boolean(homeReview))
r = await call('POST', `/admin/review/${homeReview.id}/approve`, {})
check('核准首頁', r.json?.success === true)

// 核准後的快照要含版位
r = await call('GET', `/admin/page/${homePage.id}/versions`)
const versions = r.json?.data ?? []
// 核准時進入上線的是「送審」那一版（ContentReviews.VersionId）。
const submitted = versions.filter((v) => v.note === '送審').sort((a, b) => b.versionNo - a.versionNo)[0]
check('送審有產生自己的版本快照（本次修的 bug）', Boolean(submitted),
      JSON.stringify(versions.map((v) => `${v.versionNo}:${v.note}`)))
const maxNo = submitted?.versionNo ?? Math.max(...versions.map((v) => v.versionNo))
r = await call('GET', `/admin/page/${homePage.id}/versions/${maxNo}`)
let snapshot = null
try { snapshot = JSON.parse(r.json?.data?.snapshot) } catch {}
check('版本快照含 homeSections', Array.isArray(snapshot?.homeSections) && snapshot.homeSections.length === 7,
      `got ${snapshot?.homeSections?.length}`)
const doctorsSection = (snapshot?.homeSections ?? []).find((s) => s.sectionKey === 'doctors')
check('快照裡的版位帶著剛剛挑的醫師', (doctorsSection?.items ?? []).some((i) => i.contentItemId === doctorId),
      JSON.stringify(doctorsSection))

// ── 版本還原：要把版位一起還原（本次修的重點）───────────────────────────
console.log('\n【版本還原含版位】')
await call('PUT', '/admin/home-section', {
  sections: [{ sectionKey: 'doctors', isEnabled: true, sortOrder: 4, settings: null, items: [] }],
})
r = await call('GET', '/admin/home-section')
let doctorsNow = (r.json?.data ?? []).find((s) => s.sectionKey === 'doctors')
check('先把版位清空', (doctorsNow?.items ?? []).length === 0)
r = await call('POST', `/admin/page/${homePage.id}/versions/${maxNo}/restore`, {})
check('還原那一版', r.json?.success === true, JSON.stringify(r.json)?.slice(0, 200))
r = await call('GET', '/admin/home-section')
doctorsNow = (r.json?.data ?? []).find((s) => s.sectionKey === 'doctors')
check('版位跟著被還原回來（本次修的重點）', (doctorsNow?.items ?? []).some((i) => i.contentItemId === doctorId),
      JSON.stringify(doctorsNow?.items))

// ── 分類刪除：仍被引用要擋下 ───────────────────────────────────────────
console.log('\n【分類引用計數】')
r = await call('GET', `/admin/term/${treatmentCat.id}`)
check('分類詳情的 usageCount > 0', (r.json?.data?.fields?.usageCount ?? 0) > 0, `got ${r.json?.data?.fields?.usageCount}`)
r = await call('DELETE', `/admin/term/${treatmentCat.id}`)
check('仍被引用時刪除被擋', r.json?.success === false, `got ${r.json?.code} ${r.json?.message}`)

// ── 轉址：匯入覆蓋模式（本次新增）───────────────────────────────────────
console.log('\n【轉址匯入的覆蓋模式】')
r = await call('POST', '/admin/redirect/import', { csv: 'fromPath,toPath\n/old-a.php,/treatments/\n/old-b.php,/team/\n' })
check('首次匯入 2 筆', r.json?.data?.imported === 2, JSON.stringify(r.json?.data))
r = await call('POST', '/admin/redirect/import', { csv: 'fromPath,toPath\n/old-a.php,/concerns/\n' })
check('預設不覆蓋（重複視為跳過）', r.json?.data?.imported === 0 && r.json?.data?.skipped === 1, JSON.stringify(r.json?.data))
r = await call('POST', '/admin/redirect/import', { csv: 'fromPath,toPath\n/old-a.php,/concerns/\n', overwriteExisting: true })
check('帶 overwriteExisting 會更新', r.json?.data?.updated === 1, JSON.stringify(r.json?.data))
r = await call('GET', '/admin/redirect?keyword=old-a')
check('目標路徑確實被改掉', r.json?.data?.items?.[0]?.toPath === '/concerns/', JSON.stringify(r.json?.data?.items?.[0]))
r = await call('GET', '/admin/redirect/stats')
// ⚠️ 不是只有匯入那 2 筆 —— 前面改療程分類時，API 自動補了幾筆 Source=3（系統自動）的 301。
//    那正是 docs/08 §C-1 要的行為，所以這裡驗的是「匯入的那 2 筆算在 migrationCount」。
check('統計分來源計算正確', r.json?.data?.migrationCount === 2 && r.json?.data?.totalCount >= 2,
      JSON.stringify(r.json?.data))
r = await call('GET', '/admin/redirect?isActive=true&source=1&sortBy=fromPath&sortDir=asc')
check('篩選與排序參數可用', r.json?.success && r.json.data.items.length === 2, JSON.stringify(r.json?.data?.items?.map(i => i.fromPath)))

// ── 未命中題目的來源篩選（本次新增）─────────────────────────────────────
console.log('\n【未命中題目的來源篩選】')
const savedToken = token; token = null
await call('POST', '/questions/miss', { questionText: '這是搜尋來源的測試問題', source: 'search' })
token = savedToken
r = await call('GET', '/admin/question?source=1')
check('source=1 篩得到', (r.json?.data?.items ?? []).length >= 1, JSON.stringify(r.json?.data?.totalCount))
r = await call('GET', '/admin/question?source=4')
check('source=4 篩不到（證明是 SQL 層過濾）', (r.json?.data?.items ?? []).length === 0, JSON.stringify(r.json?.data?.totalCount))

// ── 清理 ───────────────────────────────────────────────────────────────
// ⚠️ 先清版位再刪內容，理由同開頭的清理。
await call('PUT', '/admin/home-section', {
  sections: [{ sectionKey: 'doctors', isEnabled: true, sortOrder: 5, settings: null, items: [] }],
})
await call('DELETE', `/admin/treatment/${treatmentId}`)
await call('DELETE', `/admin/doctor/${doctorId}`)
await call('DELETE', `/admin/concern/${concernId}`)
await call('DELETE', `/admin/term/${tagId}`)

console.log(`\n─────────────\n通過 ${pass}　失敗 ${fail}`)
process.exit(fail === 0 ? 0 : 1)
