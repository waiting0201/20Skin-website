// 端到端：**已發布的內容只改 SEO**，能不能上線。
//
// 🔴 會改資料，只能對本機資料庫跑（腳本自己會擋）。改一筆已發布困擾的「搜尋結果標題」→
//    驗狀態回到草稿、前台還是舊的 → 發布 → 驗前台換了 → 還原 → 再發布。
//
// 為什麼需要它（2026-11-13）：存 SEO 原本不會把狀態改回草稿，而已發布狀態下後台只有
// 「取消發布」沒有「發布」—— 院方改了搜尋標題、分享縮圖、「不要收錄」，畫面說已儲存，
// 前台永遠不變。`field-effect.mjs` 看不到：它先存本文再存 SEO，本文那一步已經把狀態改回草稿。
//
// 用法（要起 func 與 web；admin 不需要）：
//   node tools/admin-e2e/seo-only.mjs --web http://localhost:3000

import { api, apiLogin, step, section, summary, API, WEB } from './_shared.mjs'

if (!/127\.0\.0\.1|localhost/.test(API)) {
  console.error(`🔴 拒絕執行：API 是 ${API}。這一支會改資料，只能對本機跑。`)
  process.exit(1)
}

const MARKER = `SEO 端到端 ${Date.now()}`
const PUBLISHED = 3

await apiLogin()
const list = await api('/admin/concern?status=3&pageSize=5')
const row = list.data?.items?.[0]
if (!row) { console.error('找不到已發布的困擾可以測。'); process.exit(1) }
const before = (await api(`/admin/concern/${row.id}`)).data
const path = before.urlPath ?? `/concerns/${before.slug}/`

// 送給 API 的 SEO 形狀＝讀回來的那一份；沒有 SEO 列時補上全部的鍵。
const seoBefore = {
  seoTitle: null, metaDescription: null, ogImage: null, canonicalOverride: null,
  noIndex: false, structuredDataOverride: null, aiSummary: null, ...(before.seo ?? {}),
}
const putSeo = (seo) => api(`/admin/concern/${row.id}/seo`, { method: 'PUT', body: JSON.stringify(seo) })
const publish = () => api(`/admin/concern/${row.id}/publish`, { method: 'PATCH', body: JSON.stringify({ action: 'publish' }) })
const titleOf = async () => ((await (await fetch(`${WEB}${path}`)).text()).match(/<title>([^<]*)<\/title>/) ?? [])[1] ?? ''

section(`只改 SEO：${before.title}（${path}）`)
let changed = false
try {
  await step('動手之前是已發布', () => { if (before.status !== PUBLISHED) throw new Error(`status=${before.status}`) })
  const titleBefore = await titleOf()

  await step('存 SEO（只改搜尋結果標題）', async () => {
    const r = await putSeo({ ...seoBefore, seoTitle: MARKER })
    changed = true
    if (!r.success) throw new Error(`${r.code} ${r.message}`)
  })
  await step('🔴 狀態回到草稿（後台才會出現「發布」）', async () => {
    const s = (await api(`/admin/concern/${row.id}`)).data.status
    if (s === PUBLISHED) throw new Error('仍是已發布：畫面上只有「取消發布」，這次的 SEO 沒有入口能上線')
  })
  await step('還沒發布：前台標題不變', async () => {
    const t = await titleOf()
    if (t !== titleBefore) throw new Error(`前台已經變成「${t}」`)
  })
  await step('發布', async () => { const r = await publish(); if (!r.success) throw new Error(`${r.code} ${r.message}`) })
  await step('前台標題換成新的', async () => {
    const t = await titleOf()
    if (!t.includes(MARKER)) throw new Error(`前台是「${t}」`)
    return t
  })
} finally {
  if (changed) {
    section('還原')
    await step('SEO 寫回原值並發布', async () => {
      const r = await putSeo(seoBefore)
      if (!r.success) throw new Error(`${r.code} ${r.message}`)
      const p = await publish()
      if (!p.success) throw new Error(`${p.code} ${p.message}`)
    })
    await step('前台標題不再帶記號', async () => {
      const t = await titleOf()
      if (t.includes(MARKER)) throw new Error(`前台仍是「${t}」`)
      return t
    })
  }
}

process.exit(summary() ? 0 : 1)
