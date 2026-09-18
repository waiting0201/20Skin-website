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

import { openAdmin, openEdit, navigate, assertStructured, fieldByLabel, apiLogin, api, findWithContent, step, section, summary, realErrors, ADMIN, API } from './_shared.mjs'

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
  // ⚠️ 返回連結 2026-09-17 起會帶 `?restore=1`（回到進入編輯頁之前的頁碼與篩選），
  //    清單頁套用完就會把它從網址拿掉，所以兩種網址都算對。
  if (!/\/admin\/treatment(\?restore=1)?$/.test(page.url())) throw new Error(`按下去到了 ${page.url()}`)
  return JSON.stringify(label)
})

await step('🔴 返回清單會回到進入時的頁碼與篩選', async () => {
  // Tim 指定 2026-09-17：從第 2 頁點進某一筆，存完返回不該掉回第 1 頁。
  await navigate(page, '/admin/article')
  await page.waitForSelector('.adm-table tbody tr', { timeout: 25000 })
  await page.locator('.adm-pagination button', { hasText: '下一頁' }).first().click()
  await page.waitForTimeout(1200)
  const pagerBefore = (await page.locator('.adm-pagination').innerText()).replace(/\s+/g, ' ')
  const firstTitleBefore = await page.locator('.adm-table__title a').first().innerText()

  await page.locator('.adm-table__title a').first().click()
  await page.waitForSelector('.adm-page__back a', { timeout: 25000 })
  await page.waitForTimeout(800)
  await page.locator('.adm-page__back a').click()
  await page.waitForSelector('.adm-table tbody tr', { timeout: 25000 })
  await page.waitForTimeout(1000)

  const pagerAfter = (await page.locator('.adm-pagination').innerText()).replace(/\s+/g, ' ')
  const firstTitleAfter = await page.locator('.adm-table__title a').first().innerText()
  if (firstTitleAfter !== firstTitleBefore) {
    throw new Error(`回來之後第一筆變成「${firstTitleAfter}」，離開前是「${firstTitleBefore}」—— 掉回第 1 頁了`)
  }
  return pagerAfter === pagerBefore ? pagerAfter.slice(0, 28) : `${pagerBefore} → ${pagerAfter}`
})

section('清單的拖曳排序（唯讀：只看有沒有、不真的拖）')
await step('療程：每一列都有把手，而且沒有 ↑↓ 了', async () => {
  // 🔴 真的拖一次在 publish-flow.mjs（那一支才會寫資料）。這裡只擋「把手不見了」
  //    與「↑↓ 又長回來」—— 兩者 typecheck 與 build 都看不到。
  // ⚠️ **自己導頁，不要靠上一步剛好停在療程清單。** 原本沒有這一行，於是在中間
  //    插入任何一個會換頁的檢查時，這一條就悄悄變成在驗別的單元（實際踩到）。
  await navigate(page, '/admin/treatment')
  await page.waitForSelector('.adm-table tbody tr', { timeout: 20000 })
  const rows = await page.locator('.adm-table tbody tr').count()
  const handles = await page.locator('.adm-table tbody tr .adm-drag-handle').count()
  if (rows !== handles) throw new Error(`${rows} 列只有 ${handles} 個把手`)
  const arrows = await page.locator('.adm-table button', { hasText: /^[↑↓]$/ }).count()
  if (arrows) throw new Error(`還有 ${arrows} 顆箭頭按鈕`)
  return `${handles} 個把手、0 顆箭頭`
})
await step('文章：刻意不給拖，而且說得出為什麼', async () => {
  // ⚠️ 2026-09-17 起「不給拖」的理由換了：不再是「超過 100 筆上限」（排序改成
  //    當頁內重新分配，沒有上限了），而是**前台根本不看 SortOrder** ——
  //    /blog/、分類頁、標籤頁一律 sort=latest。給把手等於給一個假功能。
  await navigate(page, '/admin/article')
  await page.waitForSelector('.adm-table tbody tr', { timeout: 25000 })
  await page.waitForTimeout(600)
  const handles = await page.locator('.adm-table .adm-drag-handle').count()
  if (handles) throw new Error(`文章有 ${handles} 個把手 —— 但前台的文章列表依發布日期排，拖了看不出差別`)
  const hint = page.locator('.adm-field__hint', { hasText: '不提供拖曳排序' })
  if (!(await hint.count())) throw new Error('沒有說明為什麼不能拖')
  return (await hint.first().innerText()).replace(/\s+/g, ' ').slice(0, 34)
})

await step('🔴 分類與標籤（406 筆）現在拖得動了', async () => {
  // 舊行為：超過 100 筆就整個不給拖。現在是當頁內排序，與單元大小無關。
  await navigate(page, '/admin/term')
  await page.waitForSelector('.adm-table tbody tr', { timeout: 25000 })
  await page.waitForTimeout(600)
  const rows = await page.locator('.adm-table tbody tr').count()
  const handles = await page.locator('.adm-table .adm-drag-handle').count()
  if (rows !== handles) throw new Error(`${rows} 列只有 ${handles} 個把手`)
  return `${handles} 個把手`
})

await step('🔴 這一頁的排序值不重複（拖曳的前提）', async () => {
  // 值全都一樣的話「拖了等於沒拖」—— migration NormalizeSortOrder 就是為了這個。
  for (const unit of ['term', 'case', 'treatment']) {
    const rows = (await api(`/admin/${unit}?page=1&pageSize=20`)).data.items
    if (rows.length < 2) continue
    const orders = rows.map((r) => r.sortOrder)
    if (new Set(orders).size !== orders.length) {
      throw new Error(`${unit} 第 1 頁的 sortOrder 有重複：${orders.join(',')}`)
    }
  }
  return '分類與標籤／案例／療程都沒有重複值'
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
  // ⚠️ **欄號要從表頭算出來，不可以寫死。** 原本寫死第 3 欄，而 2026-09-17
  //    分類與標籤長出拖曳把手（多一個前導欄）之後，第 3 欄變成了「名稱」——
  //    斷言開始比對分類名稱而不是型別，錯誤訊息還寫「混到：光療美顏…」。
  const headers = await page.locator('.adm-table thead th').allInnerTexts()
  const typeColumn = headers.findIndex((h) => h.trim() === '型別') + 1
  if (!typeColumn) throw new Error(`表頭裡找不到「型別」欄：${headers.join('｜')}`)
  const types = [...new Set(await page.locator(`.adm-table tbody tr td:nth-child(${typeColumn})`).allInnerTexts())]
  if (JSON.stringify(types) !== JSON.stringify(['療程分類'])) throw new Error(`混到：${types.join('、')}`)
  const names = await page.locator('.adm-table__title a').allInnerTexts()
  return `${names.length} 筆：${names.join('、')}`
})
await step('篩選中一樣拖得動（當頁內排序）', async () => {
  // ⚠️ 舊行為是「篩選後不給拖」，因為排序送的是整個單元的順序（406 筆，超過上限）。
  //    2026-09-17 改成當頁內重新分配那幾筆自己的排序值 —— 篩選中完全成立：
  //    它們各自保有全域位置，只是彼此對調。
  const rows = await page.locator('.adm-table tbody tr').count()
  const handles = await page.locator('.adm-table .adm-drag-handle').count()
  if (rows !== handles) throw new Error(`${rows} 列只有 ${handles} 個把手`)
  return `${handles} 個把手`
})

await step('🔴 新增按鈕只有一顆，型別在對話框裡問', async () => {
  // Tim 的評語：「一個下拉跟兩顆新增按鈕，看不懂在做啥」。那個裸下拉只決定
  // 「按了旁邊那顆會建出哪一種分類」，與清單無關 —— 已搬進新增表單成為有標題的欄位。
  const headerSelects = await page.locator('.adm-page__actions select').count()
  if (headerSelects) throw new Error(`頁首還有 ${headerSelects} 個下拉`)
  const buttons = await page.locator('.adm-page__actions button').allInnerTexts()
  if (buttons.length !== 1) throw new Error(`頁首有 ${buttons.length} 顆按鈕：${buttons.join('、')}`)
  await page.locator('.adm-page__actions button').click()
  await page.waitForTimeout(600)
  const labelled = page.locator('.adm-field__label', { hasText: '型別' })
  if (!(await labelled.count())) throw new Error('新增對話框裡沒有「型別」這個有標題的欄位')
  // 🔴 而且要是**下拉**不是文字框。`type: 'select'` 但沒有動態選項來源的欄位
  //    原本在這個對話框裡沒有對應分支，會掉到最後的 <input> —— 變成「請自己打出 4」。
  const typeField = page.locator('.adm-field').filter({ has: page.locator('.adm-field__label', { hasText: '型別' }) })
  if (!(await typeField.locator('select').count())) throw new Error('「型別」渲染成文字框，不是下拉')
  const options = await typeField.locator('select option').allInnerTexts()
  if (options.length < 5) throw new Error(`「型別」下拉只有 ${options.length} 個選項：${options.join('、')}`)
  await page.locator('button', { hasText: '取消' }).last().click()
  await page.waitForTimeout(400)
  return `一顆「${buttons[0].trim()}」，型別在對話框裡`
})

section('首頁版位編排：兩欄版面與那三個被拿掉的東西')
await step('開得起來，而且是兩欄（右欄＝主視覺）', async () => {
  await navigate(page, '/admin/home-sections')
  await page.waitForSelector('.adm-editor-side--hero', { timeout: 30000 })
  await page.waitForTimeout(1200)
  const main = await page.locator('.adm-editor-main').first().boundingBox()
  const side = await page.locator('.adm-editor-side--hero').boundingBox()
  if (!side || side.x < main.x) throw new Error('右欄不在主欄右邊')
  return `主欄 ${Math.round(main.width)}px ／ 右欄 ${Math.round(side.width)}px`
})
await step('🔴 沒有拖曳把手（前台不讀版位順序）', async () => {
  // 決策 23：給把手等於給一個「拖了不會有事情發生」的假功能。
  const n = await page.locator('.adm-drag-handle').count()
  if (n) throw new Error(`還有 ${n} 個把手`)
  return '0 個'
})
await step('🔴 沒有「在首頁顯示這個版位」（關掉只會留下空區塊）', async () => {
  // 決策 23：關掉只讓那一區變空，前台那個 <section> 沒有 v-if，會留下一塊
  // 只有標題與英文小標的空白區 —— 比關不掉更糟。
  const n = await page.locator('.adm-checkbox').filter({ hasText: '在首頁顯示' }).count()
  if (n) throw new Error(`還有 ${n} 個`)
  return '0 個'
})
await step('🔴 主視覺的圖片欄位不談刪檔，只給建議尺寸', async () => {
  // 版位設定的圖換掉**不會**被刪（沒走發布那條清 blob 的路），
  // 顯示 ImageField 那句通用警告等於說謊 —— schema 用 deletesOldFile: false 關掉它。
  const txt = await page.locator('.adm-editor-side--hero').innerText()
  if (txt.includes('從 Blob 刪除')) throw new Error('顯示了「舊檔會被刪」——那在這一頁是錯的')
  if (!txt.includes('建議橫幅比例')) throw new Error('建議尺寸不見了')
  return '只剩建議尺寸'
})
await step('🔴 但九個內容模型那邊的刪檔警告還在', async () => {
  // Vue 對 boolean prop 有「缺席即 false」的轉型 —— 用 `!== false` 寫防呆的話，
  // 這裡**每一個圖片欄位的警告都會靜默消失**（2026-09-18 實際踩到）。
  await openEdit(page, 'doctor', (await api('/admin/doctor?page=1&pageSize=1')).data.items[0].id)
  const txt = await page.locator('.adm-editor-main').innerText()
  if (!txt.includes('從 Blob 刪除')) throw new Error('那裡的警告也跟著不見了（多半是 withDefaults 被拿掉）')
  return '還在'
})

section('編輯畫面的標題列：分隔線不黏著下方的白卡片')
await step('🔴 線畫在 ::after 上，線的下面還有一段同色留白', async () => {
  // Tim 指出 2026-09-18：「表單上方那條灰線跟下方白色表單區塊會黏在一起」。
  // 🔴 用 border-bottom 的話，線的正下方立刻就是卡片的白色，看起來像卡片自己
  //    多了一道邊；而標題列是 sticky 的，改用 margin 也沒有用（margin 不跟著釘住）。
  //    所以留白要在標題列**自己的 padding 裡**，線畫在 ::after 上。
  await openEdit(page, 'doctor', (await api('/admin/doctor?page=1&pageSize=1')).data.items[0].id)
  const head = page.locator('.adm-editor > .adm-page__head')
  await head.waitFor({ timeout: 20000 })
  const m = await head.evaluate((el) => {
    const own = getComputedStyle(el)
    const after = getComputedStyle(el, '::after')
    return {
      top: parseFloat(own.paddingTop),
      bottom: parseFloat(own.paddingBottom),
      border: parseFloat(own.borderBottomWidth),
      line: parseFloat(after.borderTopWidth),
    }
  })
  if (m.border > 0) throw new Error('又改回 border-bottom 了——線會貼著卡片')
  if (!(m.line >= 1)) throw new Error('::after 那條線不見了')
  if (!(m.bottom - m.top >= 12)) throw new Error(`線下面沒有留白（上 ${m.top} / 下 ${m.bottom}）`)
  return `上 ${m.top}px ／ 下 ${m.bottom}px（差 ${m.bottom - m.top}px 是線下的留白）`
})

section('區塊 JSON 欄位：只有表單，沒有 JSON 逃生口')
await step('🔴 沒有「表單／進階：直接編輯 JSON」的切換鈕', async () => {
  // Tim 指定 2026-09-18：「只接顯示表單的部分就好，進階直接編輯 JSON 客戶不會用」。
  // ⚠️ 擋的是「哪天有人覺得少了逃生口又把它加回來」——切換鈕一回來，
  //    客戶就有機會在 JSON 模式裡把表單沒顯示的鍵（例如文章段落的 runs）順手清掉。
  await openEdit(page, 'treatment', ids.treatment)
  const field = fieldByLabel(page, '適應症')
  await field.locator('.adm-struct').waitFor({ timeout: 20000 })
  const n = await field.locator('.adm-struct__modes').count()
  if (n) throw new Error('切換鈕又回來了')
  return '0 顆'
})
await step('而且那一欄真的渲染成表單（不是空的）', async () => {
  // 🔴 沒有這一條，上面那條「切換鈕不見了」也可以靠「整個元件壞掉」通過。
  //    原始 JSON 模式的 textarea **刻意留著**（資料形狀對不上時的唯一入口），
  //    但正常資料不該落到那裡。
  const field = fieldByLabel(page, '適應症')
  if (await field.locator('.adm-struct__raw').count()) {
    throw new Error('掉進原始 JSON 模式了——多半是 schema 與正式資料的形狀對不上')
  }
  const inputs = await field.locator('.adm-struct input, .adm-struct textarea, .adm-struct select').count()
  if (!inputs) throw new Error('表單裡一個輸入框都沒有')
  return `${inputs} 個輸入框`
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
