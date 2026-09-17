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
import { openAdmin, openEdit, assertStructured, fieldByLabel, apiLogin, api, findWithContent, step, section, summary, realErrors, ADMIN, API, WEB } from './_shared.mjs'

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
const publish = async () => {
  await page.locator('button', { hasText: '直接發布' }).first().click()
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

await browser.close()

// ── 還原 ──────────────────────────────────────────────────────────────

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
