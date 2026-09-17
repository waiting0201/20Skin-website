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

section('側邊選單')
await step('登入後停在儀表板時，兩組都是收起來的', async () => {
  // 🔴 一定要在這裡驗：下面每一個 section 都會換頁，換過頁之後看到的是
  //    「使用者（腳本）自己開的那一組」，不是預設值。
  // ⚠️ 預設全關是 2026-09-17 Tim 指定的（原本寫死展開「系統」）。
  //    深連結進來時該頁所在的組仍然會自動打開 —— 那是 AdminLayout 的
  //    landedGroup，只在掛載時算一次，SPA 內部換頁不重算。
  await page.waitForSelector('.adm-nav__group', { timeout: 20000 })
  const groups = page.locator('.adm-nav__group')
  const open = []
  for (let i = 0; i < await groups.count(); i++) {
    const btn = groups.nth(i).locator('button').first()
    if (await btn.getAttribute('aria-expanded') === 'true') {
      open.push((await btn.locator('span').first().innerText()).trim())
    }
  }
  if (open.length) throw new Error(`還有 ${open.length} 組是展開的：${open.join('、')}`)
  return `${await groups.count()} 組、全關`
})

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

section('編輯頁的返回按鈕')
await step('編輯頁回得去列表', async () => {
  await openEdit(page, 'treatment', ids.treatment)
  const back = page.locator('.adm-page__back a')
  await back.waitFor({ timeout: 15000 })
  const label = await back.innerText()
  await back.click()
  await page.waitForTimeout(1200)
  if (!/\/admin\/treatment$/.test(page.url())) throw new Error(`按下去到了 ${page.url()}`)
  return JSON.stringify(label)
})

section('清單的拖曳排序（唯讀：只看有沒有、不真的拖）')
await step('療程：每一列都有把手，而且沒有 ↑↓ 了', async () => {
  // 🔴 真的拖一次在 publish-flow.mjs（那一支才會寫資料）。這裡只擋「把手不見了」
  //    與「↑↓ 又長回來」—— 兩者 typecheck 與 build 都看不到。
  await page.waitForSelector('.adm-table tbody tr', { timeout: 20000 })
  const rows = await page.locator('.adm-table tbody tr').count()
  const handles = await page.locator('.adm-table tbody tr .adm-drag-handle').count()
  if (rows !== handles) throw new Error(`${rows} 列只有 ${handles} 個把手`)
  const arrows = await page.locator('.adm-table button', { hasText: /^[↑↓]$/ }).count()
  if (arrows) throw new Error(`還有 ${arrows} 顆箭頭按鈕`)
  return `${handles} 個把手、0 顆箭頭`
})
await step('文章：超過上限就不給拖，而且說得出為什麼', async () => {
  // ⚠️ 排序送出的是**整個單元**的順序，超過 API 的 100 筆上限就整支被擋
  //    （ListPage.vue 檔頭）。不給拖是刻意的，但一定要讓人看得到原因。
  await navigate(page, '/admin/article')
  await page.waitForSelector('.adm-table tbody tr', { timeout: 25000 })
  await page.waitForTimeout(600)
  const handles = await page.locator('.adm-table .adm-drag-handle').count()
  if (handles) throw new Error(`文章有 ${handles} 個把手 —— 拖了會把 1100 筆的順序洗掉`)
  const hint = page.locator('.adm-field__hint', { hasText: '超過一次排序的上限' })
  if (!(await hint.count())) throw new Error('沒有說明為什麼不能拖')
  return (await hint.first().innerText()).replace(/\s+/g, ' ').slice(0, 34)
})

section('分類與標籤：型別篩選')
await step('篩得出那 4 筆療程分類', async () => {
  // 🔴 這一條擋的是「維護得到但找不到」：term 一張表混了四種東西，406 筆裡
  //    393 筆是文章標籤，而 ORDER BY SortOrder, Id 之下四個療程分類落在
  //    第 20–21 頁（共 21 頁）。2026-09-17 補上型別篩選（API 的 termType 參數）。
  await navigate(page, '/admin/term')
  await page.waitForSelector('.adm-table tbody tr', { timeout: 25000 })
  await page.waitForTimeout(800)
  const typeSelect = page.locator('.adm-filters select').nth(1)
  if (!(await typeSelect.count())) throw new Error('沒有型別篩選器')
  await typeSelect.selectOption({ label: '療程分類' })
  await page.waitForTimeout(1500)
  // ⚠️ 欄位順序是 [勾選, 名稱, 型別, 使用筆數, 狀態]，型別是第 3 欄。
  const types = [...new Set(await page.locator('.adm-table tbody tr td:nth-child(3)').allInnerTexts())]
  if (JSON.stringify(types) !== JSON.stringify(['療程分類'])) throw new Error(`混到：${types.join('、')}`)
  const names = await page.locator('.adm-table__title a').allInnerTexts()
  return `${names.length} 筆：${names.join('、')}`
})
await step('篩到 4 筆也不會冒出拖曳把手', async () => {
  // 🔴 排序送的是**整個單元**的順序（406 筆），篩選後的筆數不能拿來決定給不給拖 ——
  //    否則就是一個按了必定跳「超過上限」的把手（2026-09-17 加篩選時當場踩到）。
  const handles = await page.locator('.adm-table .adm-drag-handle').count()
  if (handles) throw new Error(`冒出 ${handles} 個把手`)
  const hint = page.locator('.adm-field__hint', { hasText: '超過一次排序的上限' })
  if (!(await hint.count())) throw new Error('也沒有說明為什麼不能拖')
  return '沒有把手，且說得出原因'
})

section('模式切換：選中的那顆要看得出來')
await step('表單／進階 JSON 的選中狀態沒有反過來', async () => {
  // 🔴 這一條擋的是「亮的是沒被選中的那一顆」（2026-09-17 修）：base.css 的
  //    btn--ghost 是藍框藍字、比中性的 btn--line 重，早先卻拿它當「未選」。
  //    typecheck 與 build 看不到 class 的輕重關係，只有真的看一眼才知道。
  // ⚠️ 刻意放在最後：切換模式會讓表單變成「有未儲存的變更」，之後再換頁會跳
  //    confirm，而 Playwright 預設會取消它 —— 後面的檢查就全部卡住了。
  await openEdit(page, 'treatment', ids.treatment)
  const modes = fieldByLabel(page, '適應症').locator('.adm-struct__modes')
  await modes.waitFor({ timeout: 20000 })
  const formBtn = modes.locator('button', { hasText: '表單' })
  const rawBtn = modes.locator('button', { hasText: '進階' })
  const lit = async (b) => /btn--primary/.test((await b.getAttribute('class')) ?? '')

  if (!(await lit(formBtn))) throw new Error('表單模式下，「表單」那顆不是實心（btn--primary）')
  if (await lit(rawBtn)) throw new Error('沒被選中的「進階」那顆是實心的 —— 選中狀態反了')

  await rawBtn.click()
  await page.waitForTimeout(400)
  if (!(await lit(rawBtn))) throw new Error('切到 JSON 模式後，「進階」那顆不是實心')
  if (await lit(formBtn)) throw new Error('切到 JSON 模式後，「表單」那顆還是實心 —— 選中狀態反了')
  return '選中＝實心藍、未選＝灰線框'
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
