// 後台的端到端檢查（🟢 **不寫任何資料**）。
//
// 為什麼需要它：typecheck、build 與 `tools/content-roundtrip` 都只看得到資料，
// 看不到畫面。2026-09-17 第一次用它跑，當場抓到三個那些閘門全部放行的問題：
//
//   ① 摺疊列顯示的是原始代碼（`lead`、`why-ages-faster`、`info`）而不是內容
//   ② `collapsible` 宣告了卻沒有人讀 —— 28 個區塊的文章一次渲染 104 個輸入欄位
//   ③ 本機 dev 的 `/assets/base.css` 與 logo 一律 404（設計 token 全部落回預設值）
//
// ⚠️ 要驗的是「開得起來、讀得懂、擋得住」。內容真的寫得進去、前台真的跟著變，
//    是另一支 `publish-flow.mjs` 的事（那一支會改資料）。

import { openAdmin, openEdit, navigate, assertStructured, fieldByLabel, apiLogin, findWithContent, step, section, summary, realErrors, ADMIN, API } from './_shared.mjs'

console.log(`後台 ${ADMIN}\nAPI  ${API}`)

// 先用 API 找出「有內容可以驗」的那幾筆 —— 不要寫死 id，各環境的 id 不一樣。
await apiLogin()
const ids = {
  treatment: (await findWithContent('treatment', 'facts')).id,
  article: (await findWithContent('article', 'bodyBlocks')).id,
  concern: (await findWithContent('concern', 'selfCheckGuide')).id,
  clinic: (await findWithContent('clinic', 'transportInfo')).id,
}

const { browser, page, errors } = await openAdmin()

section('療程：七個區塊 JSON 欄位')
await step('開得起編輯頁', () => openEdit(page, 'treatment', ids.treatment))
for (const label of ['規格數據列', '儀器／原廠資訊', '適應症', '原理', '療程流程', '術後照護', '禁忌症與注意事項']) {
  await step(`${label} → 表單`, () => assertStructured(page, label))
}

section('文章內文：七種區塊的清單')
await step('開得起編輯頁', () => openEdit(page, 'article', ids.article))
await step('內文 → 表單', () => assertStructured(page, '內文'))
await step('有區塊列', async () => {
  const n = await page.locator('.adm-struct__row').count()
  if (!n) throw new Error('一個區塊列都沒有')
  return `${n} 個區塊`
})
await step('摺疊列讀得出「型別 ＋ 內容」', async () => {
  // 🔴 這一條擋的是①：摘要要顯示「前言　眼周皮膚厚度…」，
  //    不是 `lead`；標題要顯示標題文字，不是錨點 id。
  const rows = await page.locator('.adm-struct__summary').allInnerTexts()
  const bad = rows.filter((t) => /^(lead|paragraph|heading|figure|table|list|note)$/.test(t.trim()))
  if (bad.length) throw new Error(`${bad.length} 列顯示的是原始型別代碼：${bad.slice(0, 3).join('、')}`)
  const looksLikeAnchor = rows.filter((t) => /^標題\s+[a-z0-9-]+$/.test(t.trim()))
  if (looksLikeAnchor.length) throw new Error(`${looksLikeAnchor.length} 列的標題顯示的是錨點 id：${looksLikeAnchor[0]}`)
  return JSON.stringify(rows[0]?.slice(0, 32) ?? '')
})
await step('預設收合（區塊多的時候不要一次全開）', async () => {
  // 🔴 這一條擋的是②。
  const open = await page.locator('.adm-struct__row-body').count()
  if (open > 0) throw new Error(`預設就展開了 ${open} 列`)
  return '0 列展開'
})
await step('展開一列只開那一列', async () => {
  await page.locator('.adm-struct__toggle').first().click()
  await page.waitForTimeout(400)
  const bodies = await page.locator('.adm-struct__row-body').count()
  if (bodies !== 1) throw new Error(`展開了 ${bodies} 列`)
  const inputs = await page.locator('.adm-struct__row-body textarea, .adm-struct__row-body input, .adm-struct__row-body select').count()
  return `1 列、${inputs} 個欄位`
})
await step('全部展開／全部收合', async () => {
  await page.locator('button', { hasText: '全部展開' }).first().click()
  await page.waitForTimeout(800)
  const all = await page.locator('.adm-struct__row-body').count()
  await page.locator('button', { hasText: '全部收合' }).first().click()
  await page.waitForTimeout(500)
  const none = await page.locator('.adm-struct__row-body').count()
  if (none !== 0) throw new Error(`收合後還有 ${none} 列開著`)
  return `展開 ${all} 列 → 收合 0 列`
})
await step('「不由表單管理的欄位」提示', async () => {
  // schema 沒描述到的鍵（例如 560/1083 篇文章段落上的 runs）必須原樣保留，
  // 而且要讓編輯者知道它存在 —— 否則會有人在 JSON 模式裡把它清掉。
  const hint = page.locator('.adm-field__hint', { hasText: '不由表單管理' })
  return (await hint.count()) ? (await hint.first().innerText()).slice(0, 48) : '（這一筆沒有未宣告的鍵）'
})

section('困擾與據點')
await step('困擾：自我判斷指引 → 表單', async () => {
  await openEdit(page, 'concern', ids.concern)
  return await assertStructured(page, '自我判斷指引')
})
await step('據點：交通與停車 → 表單', async () => {
  await openEdit(page, 'clinic', ids.clinic)
  return await assertStructured(page, '交通與停車')
})
await step('交通方式的圖示是下拉不是自由文字', async () => {
  const field = fieldByLabel(page, '交通與停車')
  if (!(await field.locator('.adm-struct__row').count())) return '（這一筆沒有交通資料）'
  const firstRow = field.locator('.adm-struct__row').first()
  if (!(await firstRow.locator('.adm-struct__row-body').count())) await firstRow.locator('.adm-struct__toggle').click()
  await page.waitForTimeout(400)
  if (!(await firstRow.locator('select').count())) throw new Error('圖示還是自由文字輸入')
  return '是 <select>'
})

section('全站設定：追蹤碼只收 ID')
await step('開得起全站設定', async () => {
  await navigate(page, '/admin/settings')
  await page.waitForSelector('.adm-page__title', { timeout: 20000 })
  await page.waitForTimeout(1500)
})
await step('貼整段程式碼會被當場擋下', async () => {
  // ⚠️ 這一步會按下「儲存設定」，但**不會寫進資料庫**：前端驗證先擋下來，
  //    就算前端壞了，API 端也有白名單正規表示式（SettingHandler）會回 400。
  const input = page.locator('input[placeholder*="G-ABCD1234"]')
  await input.waitFor({ timeout: 15000 })
  await input.fill('<script>alert(1)</script>')
  await page.locator('form button[type=submit]').last().click()
  await page.waitForSelector('.adm-field__error', { timeout: 8000 })
  return JSON.stringify((await page.locator('.adm-field__error').first().innerText()).slice(0, 30))
})

section('瀏覽器')
await step('console 沒有錯誤、沒有 404', async () => {
  // 🔴 這一條擋的是③：dev 的 /assets/base.css 與 logo 曾經一律 404，
  //    而畫面「看起來還好」（admin.css 自己撐得住版面），只有 console 看得出來。
  const real = realErrors(errors)
  if (real.length) throw new Error(`${real.length} 則：${real.slice(0, 3).join(' ｜ ')}`)
  return '乾淨'
})

await browser.close()
process.exit(summary() ? 0 : 1)
