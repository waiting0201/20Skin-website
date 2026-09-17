// 兩支後台端到端腳本共用的東西。
//
// ⚠️ 這裡的每一個「奇怪的寫法」都有原因，動之前先看註解 —— 它們都是 2026-09-17
//    第一次把 Playwright 接上後台時，一個一個踩出來的。

import { chromium } from 'playwright'

const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : fallback
}

export const ADMIN = arg('admin', process.env.SKIN20_ADMIN_URL ?? 'http://localhost:3300/admin/')
export const API = arg('api', process.env.SKIN20_API_BASE ?? 'http://127.0.0.1:7071/api/v1')
export const WEB = arg('web', process.env.SKIN20_WEB_URL ?? 'http://localhost:3100')
export const USER = process.env.SKIN20_SMOKE_USER ?? 'sa@system.local'
export const PASS = process.env.SKIN20_SMOKE_PASSWORD ?? 'Admin@123'

// ── 計分 ──────────────────────────────────────────────────────────────

let pass = 0
let fail = 0
export const counts = () => ({ pass, fail })

export function section(title) {
  console.log(`\n【${title}】`)
}

/** 一個檢查。回傳字串的話會附在後面當作實測值。 */
export async function step(name, fn) {
  try {
    const detail = await fn()
    pass += 1
    console.log(`  ✓ ${name}${detail ? `  ${detail}` : ''}`)
    return true
  } catch (e) {
    fail += 1
    console.log(`  ✗ ${name}\n      ${String(e.message).split('\n')[0].slice(0, 180)}`)
    return false
  }
}

export function summary() {
  console.log('\n─────────────')
  console.log(`通過 ${pass}　${fail ? `✗ 失敗 ${fail}` : '失敗 0'}`)
  return fail === 0
}

// ── API（用來備份、還原、找出可以驗的資料）────────────────────────────

let token = null

export async function apiLogin() {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userName: USER, password: PASS }),
  }).catch((e) => {
    throw new Error(`連不上 API ${API}（${e?.cause?.code ?? e.message}）—— func start 起來了嗎？`)
  })
  const json = await res.json()
  if (!json.success) {
    // ⚠️ 兩個最常見的原因，訊息要講出來，不然只看到「帳號或密碼錯誤」會查錯方向。
    throw new Error(
      `${json.code}：${json.message}\n` +
      '      ① 密碼不是種子值（read.mjs 的預設是 Import@2026x，這裡是 Admin@123）\n' +
      '      ② 登入失敗 5 次會鎖 15 分鐘，且只算帳號、換機器也解不開',
    )
  }
  token = json.data.accessToken
  return json.data
}

export async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  })
  return res.json()
}

// ── 瀏覽器 ────────────────────────────────────────────────────────────

export async function openAdmin() {
  const browser = await chromium.launch()
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1100 } })).newPage()

  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })
  page.on('response', (r) => { if (r.status() === 404) errors.push(`404: ${r.url()}`) })

  // ⚠️ **不要用 waitUntil: 'networkidle'。** Vite 的 HMR 是一條長連線，
  //    networkidle 永遠等不到，整支腳本會卡住不動（第一次接的時候卡了兩輪）。
  await page.goto(ADMIN)
  await page.fill('#userName', USER)
  await page.fill('#password', PASS)
  await page.click('button[type=submit]')
  await page.waitForSelector('.adm-page__title', { timeout: 30000 })

  return { browser, page, errors }
}

/**
 * 在後台裡換頁。
 *
 * 🔴 **不可以用 `page.goto()` 或 `reload()`。** 後台是 `createWebHistory` 的 SPA，
 *    而且 access token **只放記憶體**（`src/auth.ts`：重新整理分頁就會登出）——
 *    整頁載入等於被踢回登入頁，後面每一個檢查都會失敗，而失敗訊息只會說
 *    「找不到某個選擇器」，完全看不出真正的原因。
 */
export async function navigate(page, path) {
  await page.evaluate((p) => {
    window.history.pushState({}, '', p)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
  await page.waitForTimeout(600)
}

export async function openEdit(page, unit, id) {
  await navigate(page, `/admin/${unit}/${id}`)
  await page.waitForSelector('.adm-fieldset__legend', { timeout: 30000 })
  // 編輯畫面掛載後還要等各欄位的下拉選項載完，不然欄位可能還沒渲染出來。
  await page.waitForTimeout(1500)
}

/** 某個欄位標籤底下的那一塊（用來斷言它是不是結構化表單）。 */
export function fieldByLabel(page, labelText) {
  return page
    .locator('.adm-field__label', { hasText: labelText })
    .first()
    .locator('xpath=ancestor::div[contains(@class,"adm-field")][1]')
}

/**
 * 用真的滑鼠把一列拖到另一列的上半／下半（後台的原生 HTML5 拖放排序，
 * 實作見 `apps/admin/src/drag-sort.ts`）。
 *
 * ⚠️ **兩列必須同時在視窗內。** 合成滑鼠不會像真人那樣「拖到視窗邊緣自動捲動」，
 *    目標在畫面外時放開等於什麼都沒發生 —— 而且畫面上看起來一切正常。
 *    選單頁的頂層項目區塊很高（欄位＋子項目，實測相鄰兩塊差約 1600px），
 *    要測那一頁得先 `page.setViewportSize()` 把視窗拉高。
 * ⚠️ **按下把手之後要等一拍。** 那一列的 `draggable` 是 mousedown 之後才由 Vue
 *    補上的，馬上移動的話瀏覽器不會判定成拖曳（症狀：draggable 還是 false）。
 */
export async function dragRow(page, handle, target, { below = true } = {}) {
  await target.scrollIntoViewIfNeeded()
  await handle.scrollIntoViewIfNeeded()
  await page.waitForTimeout(250)
  const h = await handle.boundingBox()
  const t = await target.boundingBox()
  if (!h || !t) throw new Error('抓不到把手或目標的 boundingBox')
  const vh = page.viewportSize().height
  if (h.y < 0 || t.y < 0 || h.y > vh || t.y > vh) {
    throw new Error(`兩列不在同一個畫面裡（把手 y=${Math.round(h.y)}、目標 y=${Math.round(t.y)}、視窗高 ${vh}）`)
  }

  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(200)
  const ty = below ? t.y + t.height * 0.8 : t.y + t.height * 0.2
  // 分段移動：一步到位的話 Chromium 不會判定成拖曳。
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2 + 15, { steps: 6 })
  await page.mouse.move(t.x + t.width / 2, ty, { steps: 14 })
  await page.mouse.move(t.x + t.width / 2, ty, { steps: 3 })
  await page.mouse.up()
  await page.waitForTimeout(1200)
}

/**
 * 斷言某個欄位已經是**結構化表單**，不是裸的 JSON 文字框。
 * 回傳目前是表單模式還是原始 JSON 模式。
 */
export async function assertStructured(page, labelText) {
  const field = fieldByLabel(page, labelText)
  await field.waitFor({ timeout: 20000 })
  if (!(await field.locator('.adm-struct').count())) {
    throw new Error(`「${labelText}」沒有 .adm-struct —— 可能還是舊的 textarea`)
  }
  return (await field.locator('.adm-struct__raw').count()) ? '（原始 JSON 模式）' : '（表單模式）'
}

/**
 * 找一筆「這個欄位真的有內容」的紀錄。
 *
 * 🔴 **不能只看清單的回應。** `GET /admin/{unit}` 每一列只帶回**幾個顯示用的欄位**
 *    （docs/10 §3.3：「不是完整詳情 —— 一頁 20 列撈詳情等於 20 份內文」），
 *    `bodyBlocks`／`facts` 這種長欄位根本不在裡面。只看清單會永遠找不到，
 *    或者更糟 —— 靜靜地挑到一筆沒有內容的，後面每個檢查都在驗空的東西。
 *    所以這裡逐筆去拿詳情，直到找到有內容的那一筆。
 *
 * @param requirePublished 要不要限定已發布（端到端那一支需要，因為要比對前台）
 */
export async function findWithContent(unit, field, { requirePublished = false, limit = 12 } = {}) {
  const list = await api(`/admin/${unit}?pageSize=100`)
  const items = (list.data?.items ?? []).filter((r) => (requirePublished ? r.status === 3 && r.urlPath : true))
  for (const row of items.slice(0, limit)) {
    const detail = (await api(`/admin/${unit}/${row.id}`)).data
    if (detail?.fields?.[field]) return detail
  }
  throw new Error(
    `找不到「${field} 有內容${requirePublished ? '、且已發布' : ''}」的 ${unit}` +
    `（看了前 ${Math.min(items.length, limit)} 筆）`,
  )
}

/** 過濾掉與這次驗收無關的雜訊。 */
export function realErrors(errors) {
  return errors.filter((e) => !/favicon|DevTools|ERR_ABORTED|\[vite\]/i.test(e))
}
