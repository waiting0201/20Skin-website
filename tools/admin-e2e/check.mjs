// 後台的端到端檢查（🟢 **不寫任何資料**）。
//
// 為什麼需要它：typecheck、build 與 `tools/content-roundtrip` 都只看得到資料，
// 看不到畫面。2026-09-17 第一次用它跑，當場抓到三個那些閘門全部放行的問題：
//
//   ① 摺疊列顯示的是原始代碼（`lead`、`why-ages-faster`、`info`）而不是內容
//   ② `collapsible` 宣告了卻沒有人讀 —— 28 個區塊的文章一次渲染 104 個輸入欄位
//   （①② 是舊的區塊表單；文章／困擾／案例的內文 2026-11-11 起換成單一編輯器）
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

section('療程：六個區塊 JSON 欄位 ＋ 原理的編輯器')
await step('開得起編輯頁', () => openEdit(page, 'treatment', ids.treatment))
for (const label of ['規格數據列', '儀器／原廠資訊', '適應症', '療程流程', '術後照護', '禁忌症與注意事項']) {
  await step(`${label} → 表單`, () => assertStructured(page, label))
}
// Tim 指定 2026-11-12：原理比照文章內文改成單一編輯器（決策 32 的第四個欄位）。
await step('原理是一個編輯器，不是「標題／段落／搭配圖」三格', async () => {
  const field = fieldByLabel(page, '原理')
  await field.locator('.adm-rte .ProseMirror').waitFor({ timeout: 20000 })
  if (await field.locator('.adm-struct__row').count()) throw new Error('還有舊的區塊列')
  if (await field.locator('.adm-struct__raw').count()) throw new Error('掉進原始 JSON 模式了')
  return '是'
})

section('文章內文：單一編輯器')
// Tim 指定 2026-11-11：「內文不要像現在這樣用分段的方式，要用一個編輯器就好」。
// ⚠️ 存進去的仍是區塊陣列（換算的正確性由 tools/content-roundtrip/editor-check.mjs 用正式資料驗），
//    這裡只驗畫面：編輯器開得起來、內容真的載進去了、沒有前台渲染不出來的格式按鈕。
await step('開得起編輯頁', () => openEdit(page, 'article', ids.article))
await step('內文是一個編輯器，不是一列一列的區塊表單', async () => {
  const field = fieldByLabel(page, '內文')
  await field.locator('.adm-rte .ProseMirror').waitFor({ timeout: 20000 })
  const rows = await field.locator('.adm-struct__row').count()
  if (rows) throw new Error(`還有 ${rows} 個舊的區塊列`)
  if (await field.locator('.adm-struct__raw').count()) throw new Error('掉進原始 JSON 模式了')
  return '是'
})
await step('既有內容載得進來（有段落、有標題）', async () => {
  const pm = fieldByLabel(page, '內文').locator('.ProseMirror')
  const ps = await pm.locator(':scope > p').count()
  const hs = await pm.locator(':scope > h2, :scope > h3').count()
  const figs = await pm.locator('.adm-rte-figure').count()
  if (!ps) throw new Error('一個段落都沒有——內容沒有載進編輯器')
  return `段落 ${ps}・標題 ${hs}・圖片 ${figs}`
})
// 🔴 2026-11-12 前每打一個字編輯器就重設整份文件、游標被丟到文章結尾（BodyBlocksEditor 的
//    proxy 比對）：只有第一個字落在原位。這裡不儲存，打完就離開。
await step('🔴 在段落中間連續打字，字都落在游標所在的那一段', async () => {
  const p = fieldByLabel(page, '內文').locator('.ProseMirror > p').first()
  await p.scrollIntoViewIfNeeded()
  await p.click()
  await page.keyboard.type('ABCDEF測試')
  await page.waitForTimeout(400)
  if (!(await p.innerText()).includes('ABCDEF測試')) throw new Error('打的字沒有連續落在同一段——游標跳走了')
  return '連續'
})
await step('🔴 工具列沒有粗體／斜體／連結（前台的段落是純文字，決策 17）', async () => {
  const bar = fieldByLabel(page, '內文').locator('.adm-rte__toolbar')
  const bad = await bar.locator('button', { hasText: /粗體|斜體|連結|^B$|^I$/ }).count()
  if (bad) throw new Error(`有 ${bad} 顆前台渲染不出來的格式按鈕`)
  return '沒有'
})
await step('游標停在大標題（H2）時出現錨點 id 欄位', async () => {
  const field = fieldByLabel(page, '內文')
  const h2 = field.locator('.ProseMirror > h2').first()
  if (!(await h2.count())) return '（這一篇沒有 H2，跳過）'
  await h2.click()
  await page.waitForTimeout(300)
  if (!(await field.locator('.adm-rte__anchor input').count())) throw new Error('沒有出現錨點 id 欄位')
  return '有'
})

section('困擾與據點')
await step('困擾：內文也是同一個編輯器，而且舊的四區已經換算進來', async () => {
  // ⚠️ 這一筆的 bodyBlocks 可能還是空的（還沒在新編輯器存過）——那時編輯器要預先帶入
  //    症狀／成因／自我判斷／何時就醫換算出來的區塊（units/schemas/legacy-body.ts）。
  //    空的編輯器會讓人以為內容不見了，一按儲存就真的把前台那幾區換成空白。
  await openEdit(page, 'concern', ids.concern)
  const field = fieldByLabel(page, '內文')
  await field.locator('.adm-rte .ProseMirror').waitFor({ timeout: 20000 })
  const hs = await field.locator('.ProseMirror > h2').count()
  if (!hs) throw new Error('編輯器裡沒有任何標題——舊欄位沒有換算進來')
  if (await fieldByLabel(page, '自我判斷指引').count()) throw new Error('舊的「自我判斷指引」表單還在')
  return `${hs} 個大標題`
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

/** ImageField 那句「換圖會真的刪掉舊檔」的警告，用一小段夠獨特的原文比對。 */
const DELETE_WARNING = '舊的圖片檔會在存檔時真的刪掉'

section('首頁版位編排：兩欄版面、排序與顯示開關')
await step('開得起來，而且是兩欄（右欄＝主視覺）', async () => {
  await navigate(page, '/admin/home-sections')
  await page.waitForSelector('.adm-editor-side--hero', { timeout: 30000 })
  await page.waitForTimeout(1200)
  const main = await page.locator('.adm-editor-main').first().boundingBox()
  const side = await page.locator('.adm-editor-side--hero').boundingBox()
  if (!side || side.x < main.x) throw new Error('右欄不在主欄右邊')
  return `主欄 ${Math.round(main.width)}px ／ 右欄 ${Math.round(side.width)}px`
})
await step('主欄六個版位各有拖曳把手，主視覺沒有', async () => {
  // 決策 23：2026-10-01 起前台照 sortOrder 排（index.vue 的 SECTION_ORDER），把手回來了。
  // 🔴 主視覺固定在最上面（全頁唯一的 <h1> 在裡面），它不可以有把手。
  const main = await page.locator('.adm-editor-main .adm-drag-handle').count()
  const hero = await page.locator('.adm-editor-side--hero .adm-drag-handle').count()
  if (main !== 6) throw new Error(`主欄有 ${main} 個把手（應為 6）`)
  if (hero) throw new Error('主視覺也有把手')
  return '主欄 6 個、主視覺 0 個'
})
await step('主欄六個版位各有「在首頁顯示」，主視覺沒有', async () => {
  // 決策 23：2026-10-01 起前台的 <section> 有 v-if，關掉就是整區不渲染。
  const main = await page.locator('.adm-editor-main .adm-checkbox').filter({ hasText: '在首頁顯示' }).count()
  const hero = await page.locator('.adm-editor-side--hero .adm-checkbox').filter({ hasText: '在首頁顯示' }).count()
  if (main !== 6) throw new Error(`主欄有 ${main} 個（應為 6）`)
  if (hero) throw new Error('主視覺也有顯示開關')
  return '主欄 6 個、主視覺 0 個'
})
await step('🔴 八大專科入口、醫師與據點沒有挑選器（自動列出全部，順序跟著內容清單）', async () => {
  // 決策 30：那兩個版位挑的本來就是整個單元（14/14、2/2）—— 等於同一批內容
  // 有兩份順序，在「內容 → 醫師」拖一次首頁不會跟，而且兩邊都沒有任何徵兆。
  // 🔴 精選療程（4/28）與最新文章（4/1100）**必須還有**挑選器，它們是真的策展。
  const cardOf = (title) => page.locator('.adm-card').filter({ hasText: title }).first()
  for (const title of ['看皮膚　找四季', '醫師團隊', '據點資訊']) {
    const card = cardOf(title)
    if (await card.locator('.adm-relation').count()) throw new Error(`「${title}」還有挑選器`)
    if (!(await card.innerText()).includes('自動列出全部')) throw new Error(`「${title}」沒有說明它是自動的`)
  }
  for (const title of ['精選療程', '最新文章']) {
    if (!(await cardOf(title).locator('.adm-relation').count())) throw new Error(`「${title}」的挑選器不見了`)
  }
  // 品牌理念摘要：前台那一區是寫死的版面，挑了也不會生效（2026-10-01 拿掉）。
  if (await cardOf('品牌理念摘要').locator('.adm-relation').count()) throw new Error('「品牌理念摘要」還有挑選器')
  return '八大專科入口／醫師／據點 0 個，精選療程／最新文章各 1 個'
})
await step('🔴 主視覺的圖片欄位：照實說「發布時」刪舊檔，不是通用的「存檔時」', async () => {
  // 2026-11-12 起首頁重新發布時上一版獨有的輪播圖會被清掉（快照掃描修好之後）。
  // ImageField 的通用警告寫的是「存檔時」，在這一頁不準確 —— schema 仍用 deletesOldFile: false 關掉它，
  // 改由 hint 講「按下發布舊的圖片檔就會刪除」。
  const txt = await page.locator('.adm-editor-side--hero').innerText()
  // ⚠️ 比對的字串**要跟著 ImageField 的文案走**。2026-09-18 踩到一次：決策 27 把
  //    「從 Blob 刪除」改成中文說法之後，這裡還在找舊字串 —— 這一條因此變成
  //    「永遠通過」（要找的字本來就不可能出現），下面那一條則變成永遠失敗。
  if (txt.includes(DELETE_WARNING)) throw new Error('顯示了「舊檔會被刪」——那在這一頁是錯的')
  if (!txt.includes('建議橫幅比例')) throw new Error('建議尺寸不見了')
  if (!txt.includes('按下「發布」舊的圖片檔就會刪除')) throw new Error('發布時刪舊檔的提示不見了')
  return '建議尺寸＋發布時刪檔的提示'
})
await step('🔴 但九個內容模型那邊的刪檔警告還在', async () => {
  // Vue 對 boolean prop 有「缺席即 false」的轉型 —— 用 `!== false` 寫防呆的話，
  // 這裡**每一個圖片欄位的警告都會靜默消失**（2026-09-18 實際踩到）。
  await openEdit(page, 'doctor', (await api('/admin/doctor?page=1&pageSize=1')).data.items[0].id)
  const txt = await page.locator('.adm-editor-main').innerText()
  if (!txt.includes(DELETE_WARNING)) throw new Error('那裡的警告也跟著不見了（多半是 withDefaults 被拿掉）')
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

section('必填沒填：紅字在那一格，畫面跳到那一格')
// Tim 指定 2026-09-18：「如果有必填沒填，紅色警訊要顯示在那個欄位下，然後畫面要跳到那邊」。
//
// 🔴 **typecheck 與 build 都看不到這一件事**：紅字有沒有渲染、畫面有沒有捲過去、
//    摺疊起來的那一列有沒有自己展開，全都只發生在真的瀏覽器裡。
// ⚠️ 這一段會動**表單**，但不寫任何資料 —— `saveBody()` 的順序是
//    「驗證 → 上傳圖片 → 送出」，驗證沒過在第一步就 return，一個請求都不會發出去。
// ⚠️ 因此離開編輯頁時會跳出「有尚未儲存的變更」的確認框，這裡一律接受。
page.on('dialog', (d) => d.accept());

await step('標題清空後按儲存：捲回標題欄、紅字在它下面、游標也在裡面', async () => {
  await openEdit(page, 'treatment', ids.treatment)
  const titleField = page.locator('[data-error-key="title"]')
  await titleField.waitFor({ timeout: 20000 })
  const input = titleField.locator('input')
  const original = await input.inputValue()
  await input.fill('')

  // 先捲到最底讓標題欄離開畫面——不這樣做的話「有沒有捲過去」根本驗不到。
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(500)
  const before = await titleField.boundingBox()
  if (before && before.y > 0) throw new Error(`捲到底之後標題欄還在畫面裡（y=${Math.round(before.y)}），這一條驗不到東西`)

  // 釘在標題列上的那顆「儲存本文」（長表單捲到一半時按得到的就是它）。
  await page.locator('.adm-page__head button[form="adm-body-form"]').click()
  await page.waitForTimeout(1500)

  const err = titleField.locator('.adm-field__error')
  if (!(await err.count())) throw new Error('標題欄下面沒有紅字')
  const box = await err.boundingBox()
  const vh = page.viewportSize().height
  if (!box || box.y < 0 || box.y + box.height > vh) {
    throw new Error(`紅字沒有進到畫面裡（y=${Math.round(box?.y ?? -1)}、視窗高 ${vh}）`)
  }
  // 🔴 釘住的標題列不可以蓋住它——那看起來就像「跳過去了，但什麼都沒有」。
  const head = await page.locator('.adm-editor > .adm-page__head').boundingBox()
  if (box.y < head.y + head.height) throw new Error('紅字被釘住的標題列蓋住了')
  if (!(await input.evaluate((el) => el === document.activeElement))) throw new Error('游標沒有落在那一格裡')

  await input.fill(original) // 還原（沒有存過，所以只是把表單改回去）
  return `${JSON.stringify((await err.innerText()).slice(0, 12))}　y=${Math.round(box.y)}`
})

await step('內文清空後按儲存：紅字在內文下面、畫面跳過去', async () => {
  // ⚠️ 不寫任何資料：驗證沒過在第一步就 return（見本段開頭）。清空之後用「復原」還原表單。
  await openEdit(page, 'article', ids.article)
  const body = page.locator('[data-error-key="bodyBlocks"]')
  const pm = body.locator('.ProseMirror')
  await pm.waitFor({ timeout: 20000 })
  await pm.click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
  await page.keyboard.press('Backspace')
  await page.waitForTimeout(300)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(300)

  await page.locator('.adm-page__head button[form="adm-body-form"]').click()
  await page.waitForTimeout(1500)

  const err = body.locator(':scope > .adm-field__error')
  if (!(await err.count())) throw new Error('內文下面沒有紅字')
  const box = await body.boundingBox()
  const vh = page.viewportSize().height
  if (!box || box.y + 40 < 0 || box.y > vh) throw new Error(`畫面沒有跳到內文（y=${Math.round(box?.y ?? -1)}）`)

  await pm.click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z')
  await page.waitForTimeout(300)
  if (!(await pm.locator(':scope > p').count())) throw new Error('復原之後內容沒有回來')
  return JSON.stringify((await err.innerText()).slice(0, 16))
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
