// 端到端：**在後台改一筆內容 → 儲存 → 發布 → 確認前台真的跟著變**。
//
// 🔴 **這一支會真的改資料。** 它會備份、改動、驗證，最後還原並重新發布 ——
//    但中途失敗（瀏覽器掛掉、API 斷線）會把內容留在改動後的狀態。
//    ⚠️ 還原的是欄位的值；`ContentVersions` 會多出幾筆版本快照，那是發布機制
//    本身產生的，清不掉也不需要清。
//
// 為什麼值得留著這一支：它是唯一驗得到「整條鏈」的方法 ——
//   表單 → content-fields 的序列化 → API 的寫入路徑 → 版本快照 → 前台的 parseBlocks
// 中間任何一段錯了，症狀都是**前台那一區靜默消失**（HTTP 仍然是 200）。
//
// 它抓過的真實 bug（2026-09-17）：`Article.BodyBlocks` 的讀寫不對稱，
// 「開起來、什麼都不改、按儲存」就會把整篇內文毀掉，而且要等到下一次發布才看得出來。
// 所以下面的場景 A 刻意**不做任何編輯**就儲存 —— 那正是最容易出事的操作。

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openAdmin, openEdit, navigate, dragRow, assertStructured, fieldByLabel, apiLogin, api, findWithContent, step, section, summary, realErrors, ADMIN, API, WEB } from './_shared.mjs'

const MARKER = `（端到端驗證 ${new Date().toISOString().slice(11, 19)}）`
const backupDir = mkdtempSync(join(tmpdir(), 'skin20-e2e-'))
console.log(`後台 ${ADMIN}\nAPI  ${API}\n前台 ${WEB}\n備份 ${backupDir}`)

await apiLogin()

// ── 找出要驗的兩筆，並備份 ────────────────────────────────────────────

const article = await findWithContent('article', 'bodyBlocks', { requirePublished: true })
const treatment = await findWithContent('treatment', 'facts', { requirePublished: true })

const backup = async (unit, id) => {
  const res = await api(`/admin/${unit}/${id}`)
  const file = join(backupDir, `${unit}-${id}.json`)
  writeFileSync(file, JSON.stringify(res.data, null, 2))
  return res.data
}
const articleBefore = await backup('article', article.id)
const treatmentBefore = await backup('treatment', treatment.id)
console.log(`\n要驗的兩筆：\n  文章 ${article.id} ${article.urlPath}\n  療程 ${treatment.id} ${treatment.urlPath}`)

// ── 前台的基準線 ──────────────────────────────────────────────────────

const fetchPage = async (path) => {
  const res = await fetch(`${WEB}${path}`)
  if (!res.ok) throw new Error(`前台 ${path} 回 ${res.status}`)
  return res.text()
}
/** 文章內文那一塊。整段逐字元比對，比數段落嚴格得多。 */
const bodyOf = (html) => (html.match(/<article class="article-content"[\s\S]*?<\/article>/) ?? [''])[0]

section('前台基準線（動手之前）')
let articleBaseline = ''
await step('抓得到文章頁', async () => {
  articleBaseline = bodyOf(await fetchPage(articleBefore.urlPath))
  if (!articleBaseline) throw new Error('抓不到 <article class="article-content">')
  return `內文 ${articleBaseline.length} 字元`
})
await step('抓得到療程頁', async () => {
  const html = await fetchPage(treatmentBefore.urlPath)
  const facts = JSON.parse(treatmentBefore.fields.facts)
  if (!html.includes(facts[0].value)) throw new Error(`前台找不到第一列的值「${facts[0].value}」`)
  return `規格數據列第一列 = ${JSON.stringify(facts[0].value.slice(0, 24))}`
})

// ── 後台操作 ──────────────────────────────────────────────────────────

const { browser, page, errors } = await openAdmin()

const saveBody = async () => {
  await page.locator('button[type=submit]', { hasText: /儲存本文|上傳/ }).first().click()
  await page.waitForSelector('.adm-alert--success', { timeout: 25000 })
  return (await page.locator('.adm-alert--success').first().innerText()).trim()
}
// ⚠️ 2026-09-17 改：按鈕文字由「直接發布」變成「發布」，而且從右側工作流側欄
//    搬到標題列（EditPage.vue 的工作流側欄整個拿掉了）。用 `exact: true` 比對，
//    不然 `hasText: '發布'` 會同時命中「取消發布」。
const publish = async () => {
  await page.getByRole('button', { name: '發布', exact: true }).first().click()
  await page.waitForTimeout(3500)
  return (await page.locator('.adm-alert--success').first().innerText()).trim()
}

section('A. 文章：什麼都不改就儲存 → 發布')
await step('開編輯頁', () => openEdit(page, 'article', article.id))
await step('內文是表單', () => assertStructured(page, '內文'))
await step('按儲存本文（完全不編輯）', saveBody)
await step('發布', publish)

section('B. 療程：用表單改一格 → 儲存 → 發布')
await step('開編輯頁', () => openEdit(page, 'treatment', treatment.id))
await step('在規格數據列第一列的「內容」改字', async () => {
  const field = fieldByLabel(page, '規格數據列')
  await field.scrollIntoViewIfNeeded()
  const firstRow = field.locator('.adm-struct__row').first()
  if (!(await firstRow.locator('.adm-struct__row-body').count())) await firstRow.locator('.adm-struct__toggle').click()
  await page.waitForTimeout(400)
  // 一列兩格：0 = 項目、1 = 內容
  const input = firstRow.locator('.adm-struct__row-body input').nth(1)
  await input.fill(MARKER)
  return await input.inputValue()
})
await step('儲存本文', saveBody)
await step('發布', publish)
await step('後台操作全程沒有 console 錯誤', async () => {
  const real = realErrors(errors)
  if (real.length) throw new Error(`${real.length} 則：${real.slice(0, 2).join(' ｜ ')}`)
  return '乾淨'
})

// ── 前台有沒有跟著變 ──────────────────────────────────────────────────

section('前台（發布之後）')
await step('文章內文與基準線逐字元相同', async () => {
  // 🔴 這就是雙重編碼那個 bug 的照妖鏡：修正之前，這一步之後整篇內文會消失。
  const after = bodyOf(await fetchPage(articleBefore.urlPath))
  if (after !== articleBaseline) {
    throw new Error(`內文變了（${articleBaseline.length} → ${after.length} 字元）——「原樣儲存」不該改動任何東西`)
  }
  return `${after.length} 字元，一個不差`
})
await step('療程頁出現剛剛改的字', async () => {
  const html = await fetchPage(treatmentBefore.urlPath)
  const old = JSON.parse(treatmentBefore.fields.facts)[0].value
  if (!html.includes(MARKER)) throw new Error('前台看不到新值 —— 表單→資料庫→快照→前台 這條鏈斷在某一段')
  if (html.includes(old)) throw new Error('舊值還在')
  return '新值已生效、舊值已消失'
})

// ── C. 清單的拖曳排序 ─────────────────────────────────────────────────
//
// 🔴 這一段抓的是「拖對了、但寫錯範圍」——2026-09-17 導入拖曳時實際踩到：
//    原本送出的是**當頁那 20 筆**配 0..19，而資料庫裡的 `SortOrder` 幾乎整批
//    是 0，於是沒出現在那一頁的項目全部跟著洗牌。畫面上「拖動的那一列」看起來
//    是對的，要**重新載入**才看得出整個清單已經亂掉。
//    所以下面一定要「拖完 → 回 API 對整個單元的順序」，不能只看畫面。
//
// 用醫師（14 筆、一頁放得下）：拖完的順序可以整串驗，也拖得回來。
// ⚠️ 還原的是**順序**；`SortOrder` 的值會從全 0 變成 0..13，那是排序功能本來
//    就會做的事（也正是它修好撞號的方式），不視為未還原。

section('C. 醫師清單：拖曳排序（會寫 SortOrder）')

const doctorOrder = async () => (await api('/admin/doctor?page=1&pageSize=100')).data.items.map((i) => i.id)
const doctorRow = (i) => page.locator('.adm-table tbody tr').nth(i)
let doctorBefore = []

await step('把第 1 列拖到第 3 列下面', async () => {
  doctorBefore = await doctorOrder()
  if (doctorBefore.length < 4) throw new Error(`醫師只有 ${doctorBefore.length} 筆，驗不了排序`)
  await navigate(page, '/admin/doctor')
  await page.waitForSelector('.adm-table tbody tr .adm-drag-handle', { timeout: 25000 })
  await page.waitForTimeout(600)
  await dragRow(page, doctorRow(0).locator('.adm-drag-handle'), doctorRow(2), { below: true })

  const [a, b, c, ...rest] = doctorBefore
  const want = [b, c, a, ...rest]
  const now = await doctorOrder()
  if (JSON.stringify(now) !== JSON.stringify(want)) {
    throw new Error(`整個單元的順序不對\n      現在 ${now.join(',')}\n      預期 ${want.join(',')}`)
  }
  return `${doctorBefore.slice(0, 3).join(',')} → ${now.slice(0, 3).join(',')}`
})

await step('拖回原位，整串順序與動手之前相同', async () => {
  await dragRow(page, doctorRow(2).locator('.adm-drag-handle'), doctorRow(0), { below: false })
  const now = await doctorOrder()
  if (JSON.stringify(now) !== JSON.stringify(doctorBefore)) {
    throw new Error(`沒還原\n      現在 ${now.join(',')}\n      原本 ${doctorBefore.join(',')}`)
  }
  return '已還原'
})

// ── C-2. 分類與標籤：在「第 3 頁」拖一次 ────────────────────────────
//
// 🔴 **這一段擋的是「當頁內排序」最容易做錯的那一種**：把當頁的 id 配上
//    0..19 送出去。那樣做的話，在第 3 頁拖一次，那 20 筆會整批被洗到**最前面**，
//    而畫面上只會看到「這一頁的順序變了」，看起來完全正常。
//    正確作法是重新分配**它們原本佔住的那幾個排序值**（ListPage.vue 檔頭）。
// ⚠️ 分類與標籤有 406 筆，舊版因為超過 100 筆上限根本不給拖。

section('C-2. 分類與標籤：第 3 頁拖曳（會寫 SortOrder）')

const termPage3 = async () => (await api('/admin/term?page=3&pageSize=20')).data.items
const termIdsAt = async (page) => (await api(`/admin/term?page=${page}&pageSize=20`)).data.items.map((r) => r.id)

const termBefore3 = await termPage3()
const termBefore1 = await termIdsAt(1)
const termOrdersBefore = termBefore3.map((r) => r.sortOrder)

await step('第 3 頁的排序值不是 0..19（正規化過了）', async () => {
  if (termOrdersBefore[0] === 0) throw new Error(`第 3 頁的第一筆 sortOrder 是 0 —— 沒有正規化，拖曳會把它洗到最前面`)
  if (new Set(termOrdersBefore).size !== termOrdersBefore.length) throw new Error('第 3 頁有重複的排序值')
  return `${termOrdersBefore[0]}…${termOrdersBefore[termOrdersBefore.length - 1]}`
})

await step('在第 3 頁把第 1 列拖到第 3 列下面', async () => {
  await navigate(page, '/admin/term')
  await page.waitForSelector('.adm-table tbody tr .adm-drag-handle', { timeout: 25000 })
  for (let i = 0; i < 2; i++) {
    await page.locator('.adm-pagination button', { hasText: '下一頁' }).first().click()
    await page.waitForTimeout(1000)
  }
  const row = (i) => page.locator('.adm-table tbody tr').nth(i)
  await dragRow(page, row(0).locator('.adm-drag-handle'), row(2), { below: true })
  await page.waitForTimeout(1200)

  const [a, b, c, ...rest] = termBefore3.map((r) => r.id)
  const want = [b, c, a, ...rest]
  const now = await termIdsAt(3)
  if (JSON.stringify(now) !== JSON.stringify(want)) {
    throw new Error(`第 3 頁順序不對\n      現在 ${now.slice(0, 4).join(',')}\n      預期 ${want.slice(0, 4).join(',')}`)
  }
  return `${termBefore3.slice(0, 3).map((r) => r.id).join(',')} → ${now.slice(0, 3).join(',')}`
})

await step('🔴 第 1 頁一個都沒動（沒有被洗到最前面）', async () => {
  const now1 = await termIdsAt(1)
  if (JSON.stringify(now1) !== JSON.stringify(termBefore1)) {
    throw new Error(`第 1 頁被動到了\n      現在 ${now1.slice(0, 4).join(',')}\n      原本 ${termBefore1.slice(0, 4).join(',')}`)
  }
  const orders = (await termPage3()).map((r) => r.sortOrder)
  if (JSON.stringify(orders) !== JSON.stringify(termOrdersBefore)) {
    throw new Error(`第 3 頁佔住的排序值變了：${termOrdersBefore.join(',')} → ${orders.join(',')}`)
  }
  return '第 1 頁不動，第 3 頁仍佔住原本那幾個排序值'
})

await step('拖回原位', async () => {
  const row = (i) => page.locator('.adm-table tbody tr').nth(i)
  await dragRow(page, row(2).locator('.adm-drag-handle'), row(0), { below: false })
  await page.waitForTimeout(1200)
  const now = await termIdsAt(3)
  if (JSON.stringify(now) !== JSON.stringify(termBefore3.map((r) => r.id))) {
    throw new Error(`沒還原\n      現在 ${now.slice(0, 4).join(',')}\n      原本 ${termBefore3.map((r) => r.id).slice(0, 4).join(',')}`)
  }
  return '已還原'
})

// ── D. 首頁版位：停用一區 → 發布 → 前台真的少那一區 ──────────────────
//
// 🔴 **這一段抓的是一個真實發生過的資料流失**（2026-09-17）：
//    `putSections` 原本「hero 送 heroSettings、其餘一律送 null」，於是按一次
//    「儲存草稿」就把 `specialties` 的**八大專科入口（含圖示）清成 null**、
//    把 `hero` 的**四張輪播圖陣列**壓成 `{"0":…,"1":…}` 物件。
//    兩者都沒有任何錯誤訊息，症狀是前台首頁少掉那兩區。
//    ⚠️ 所以下面除了驗「停用真的生效」，也一定要驗「沒被碰到的那兩區還在」。
//
// ⚠️ 判斷「版位生效了沒」**不能看 <h2> 標題** —— 那是前台的版面字串
//    （`app/data/_presentation.ts`），停用之後標題照樣渲染，只是底下沒有東西。
//    要看只有資料才會產生的東西，例如醫師卡片的連結。

section('D. 首頁版位：停用一區 → 發布 → 前台')

const homeBefore = (await api('/admin/home-section')).data
writeFileSync(join(backupDir, 'home-sections.json'), JSON.stringify(homeBefore, null, 2))
const homeStrip = (rows) => JSON.stringify(rows.map((r) => ({
  k: r.sectionKey, t: r.title, e: r.isEnabled, s: r.settings, i: r.items.map((y) => y.contentItemId),
})))

const doctorItem = homeBefore.find((r) => r.sectionKey === 'doctors')?.items?.[0]
const doctorMarker = doctorItem
  ? (await api(`/admin/doctor/${doctorItem.contentItemId}`)).data.urlPath
  : null
const specialtyCount = (html) => (html.match(/痘痘/g) || []).length
const heroImgCount = (html) => (html.match(/class="[^"]*hero/g) || []).length

let home0 = ''
await step('基準線：首頁有醫師卡片、八大專科、主視覺', async () => {
  if (!doctorMarker) throw new Error('「醫師團隊」版位沒有任何項目，驗不了')
  home0 = await fetchPage('/')
  if (!home0.includes(doctorMarker)) throw new Error(`首頁上找不到 ${doctorMarker}`)
  if (specialtyCount(home0) === 0) throw new Error('首頁上找不到八大專科入口')
  return `醫師連結 ${doctorMarker}、專科 ${specialtyCount(home0)} 處、主視覺 ${heroImgCount(home0)} 處`
})

const putHome = async (rows) => {
  const body = {
    sections: rows.map((r) => ({
      sectionKey: r.sectionKey,
      isEnabled: r.isEnabled,
      sortOrder: r.sortOrder,
      settings: r.settings,
      items: r.items.map((i) => ({ contentItemId: i.contentItemId, sortOrder: i.sortOrder })),
    })),
  }
  const put = await api('/admin/home-section', { method: 'PUT', body: JSON.stringify(body) })
  if (!put.success) throw new Error(`版位寫入失敗：${put.code} ${put.message}`)
  const pub = await api(`/admin/page/${homePageId}/publish`, { method: 'PATCH', body: JSON.stringify({ action: 'publish' }) })
  if (!pub.success) throw new Error(`首頁發布失敗：${pub.code} ${pub.message}`)
}

const homePageId = (await api('/admin/page?page=1&pageSize=100')).data.items
  .find((p) => (p.fields || {}).systemKey === 'home')?.id
if (!homePageId) throw new Error('找不到 systemKey=home 的那筆 Page')

await step('停用「醫師團隊」並發布 → 前台少掉醫師卡片', async () => {
  await putHome(homeBefore.map((r) => (r.sectionKey === 'doctors' ? { ...r, isEnabled: false } : r)))
  const html = await fetchPage('/')
  if (html.includes(doctorMarker)) throw new Error('停用了，前台還看得到醫師卡片')
  return '停用生效'
})

await step('🔴 沒被碰到的版位沒有跟著消失（八大專科、主視覺）', async () => {
  const html = await fetchPage('/')
  const s = specialtyCount(html)
  if (s !== specialtyCount(home0)) throw new Error(`八大專科入口被存檔弄丟了：${specialtyCount(home0)} → ${s}`)
  const now = (await api('/admin/home-section')).data
  const heroSettings = now.find((r) => r.sectionKey === 'hero')?.settings
  if (heroSettings && !heroSettings.trimStart().startsWith('[')) {
    throw new Error('hero.settings 從陣列被壓成物件了（前台讀的是陣列）')
  }
  return `專科 ${s} 處、hero.settings 仍是陣列`
})

await step('還原並重新發布，版位資料與備份相同', async () => {
  await putHome(homeBefore)
  const now = (await api('/admin/home-section')).data
  if (homeStrip(now) !== homeStrip(homeBefore)) throw new Error('版位資料與備份不同，請比對 home-sections.json')
  const html = await fetchPage('/')
  if (!html.includes(doctorMarker)) throw new Error('還原了，前台卻還是看不到醫師卡片')
  return '已還原'
})

// ── 還原 ──────────────────────────────────────────────────────────────

await browser.close()

section('還原')
await step('把療程的 facts 改回原值並重新發布', async () => {
  const body = { title: treatmentBefore.title, slug: treatmentBefore.slug, fields: { facts: treatmentBefore.fields.facts } }
  const put = await api(`/admin/treatment/${treatment.id}`, { method: 'PUT', body: JSON.stringify(body) })
  if (!put.success) throw new Error(`還原失敗：${put.code} ${put.message}`)
  const pub = await api(`/admin/treatment/${treatment.id}/publish`, { method: 'PATCH', body: JSON.stringify({ action: 'publish' }) })
  if (!pub.success) throw new Error(`重新發布失敗：${pub.code} ${pub.message}`)
  return '已還原'
})
await step('療程頁回到動手之前的樣子', async () => {
  const html = await fetchPage(treatmentBefore.urlPath)
  const old = JSON.parse(treatmentBefore.fields.facts)[0].value
  if (html.includes(MARKER)) throw new Error('測試字樣還留在前台')
  if (!html.includes(old)) throw new Error('原值沒有回來')
  return '原值已回復、測試字樣已清除'
})
await step('兩筆內容的欄位值與備份相同', async () => {
  for (const [unit, id, key] of [['article', article.id, 'bodyBlocks'], ['treatment', treatment.id, 'facts']]) {
    const now = (await api(`/admin/${unit}/${id}`)).data
    const was = JSON.parse(readFileSync(join(backupDir, `${unit}-${id}.json`), 'utf8'))
    if (now.fields[key] !== was.fields[key]) throw new Error(`${unit}/${id} 的 ${key} 與備份不同`)
    if (now.status !== 3) throw new Error(`${unit}/${id} 的狀態是 ${now.status}，不是已發布`)
  }
  return '兩筆都與備份一致、都維持已發布'
})

const ok = summary()
if (!ok) console.log(`\n⚠️ 有檢查沒過，資料**可能停在改動後的狀態**。備份在 ${backupDir}`)
process.exit(ok ? 0 : 1)
