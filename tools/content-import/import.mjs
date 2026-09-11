#!/usr/bin/env node
// 把 mockup 的內容搬進資料庫。
//
// 前置：node tools/content-import/dump.mjs <frontend-data.json>
// 用法：node tools/content-import/import.mjs <frontend-data.json> [--api http://localhost:7077/api/v1]
//
// 🔴 **走真正的 API，不直寫 SQL**（見 api.mjs 檔頭）。
//
// ⚠️ **分類原則**（CLAUDE.md 決策 13 之後定的）：
//      內容 → 資料庫；版面 → 留在前台。
//    所以 eyebrow（英文小標）、icon、roleLabel、jsonLdDescription 這類純展示字串
//    **刻意不搬** —— 它們不是院方會在後台改的東西，搬進去只會讓內容模型長出
//    一堆沒人維護的欄位。判斷不確定時的標準是：「院方會想改它嗎？」
//
// ⚠️ **可重複執行**：以 slug 認人，已存在就更新。種子已經建好 13 個分類與 17 個頁面，
//    這支腳本必須認得它們而不是重複建（`indexBySlug`）。

import { readFileSync } from 'node:fs'
import { ApiClient } from './api.mjs'
import { imageField } from './images.mjs'

const [, , dataPath, ...rest] = process.argv
if (!dataPath) {
  console.error('用法：node tools/content-import/import.mjs <frontend-data.json> [--api <baseUrl>]')
  process.exit(1)
}
const apiArg = rest.indexOf('--api')
const BASE = apiArg >= 0 ? rest[apiArg + 1] : 'http://localhost:7077/api/v1'

const data = JSON.parse(readFileSync(dataPath, 'utf8'))
const api = new ApiClient(BASE)

// 匯入過程中累積「slug → contentItemId」，第二輪寫關聯時要用。
const ids = { treatment: new Map(), doctor: new Map(), concern: new Map(), article: new Map(),
              case: new Map(), faq: new Map(), clinic: new Map(), page: new Map(), term: new Map() }

const stats = []
function report(unit, created, updated) {
  stats.push({ unit, created, updated })
  console.log(`  ${unit.padEnd(10)} 新建 ${String(created).padStart(3)}　更新 ${String(updated).padStart(3)}`)
}

/** 區塊 JSON：前台的結構化內容存進既有長文欄位，格式與後台富文本一致（docs/09 §8）。 */
const blocks = (value) => (value === undefined || value === null ? null : JSON.stringify(value))

// ── 0. 登入 ──────────────────────────────────────────────────────────
const IMPORT_PASSWORD = process.env.SKIN20_IMPORT_PASSWORD ?? 'Import@2026x'
const me = await api.login('sa@system.local', process.env.SKIN20_SEED_PASSWORD ?? 'Admin@123', IMPORT_PASSWORD)
  .catch(async (e) => {
    // 密碼可能已經換過（重跑時）——直接用新密碼登入。
    if (!String(e).includes('AUTH_INVALID_CREDENTIALS')) throw e
    return api.login('sa@system.local', IMPORT_PASSWORD)
  })
console.log(`已登入：${me.displayName}（超級管理員 ${me.isSuperAdmin}）\n`)

// ── 1. 分類與標籤 ────────────────────────────────────────────────────
// 種子已建 13 筆（4 療程分類／4 文章分類／5 FAQ 分類）。文章標籤 8 個是新的。
//
// 🔴 **以「型別＋slug」認人，不能只看 slug。**
//    種子的 FAQ 分類「術後照護」slug 是 aftercare，而前台的文章標籤也有 aftercare ——
//    只比對 slug 會把那個 FAQ 分類當成標籤重用，兩個不同的東西從此共用一筆資料。
//    docs/08 §C-9 已註明 UNIQUE(TermType, Slug) 在 TPT 下做不出來，**資料庫不會擋這件事**。
const TERM_TYPE = { treatmentCategory: 1, articleCategory: 2, faqCategory: 3, articleTag: 4 }

const termKey = (type, slug) => `${type}:${slug}`
const termIndex = new Map()
for (const row of await api.list('term')) {
  // 清單摘要不含 termType，逐筆取詳情。20 筆而已，換來的是不會認錯人。
  const full = await api.detail('term', row.id)
  termIndex.set(termKey(full.fields.termType, row.slug), full)
}

/** 取得（必要時建立）一筆分類或標籤，回傳 id。 */
async function ensureTerm(type, slug, title) {
  const key = termKey(type, slug)
  let item = termIndex.get(key)
  if (!item) {
    item = await api.post('/admin/term', { slug, title, termType: type })
    termIndex.set(key, item)
  }
  await api.ensurePublished('term', item)
  return item.id
}

{
  const before = termIndex.size
  for (const tag of data.articles.POPULAR_TAGS) {
    // ⚠️ 標籤預設 IncludeInSitemap=0 ＋ NoIndex=1（docs/08 §C-9），由 API 依 termType 處理，這裡不覆寫。
    ids.term.set(termKey(TERM_TYPE.articleTag, tag.slug), await ensureTerm(TERM_TYPE.articleTag, tag.slug, tag.label))
  }
  // 既有的分類也要確認是已發布狀態（種子建的是草稿還是發布，不該用猜的）。
  for (const [key, item] of [...termIndex]) {
    if (item.status !== 3) await api.ensurePublished('term', item)
    ids.term.set(key, item.id)
  }
  report('term', termIndex.size - before, before)
}

// ── 2. 醫師 ──────────────────────────────────────────────────────────
// ⚠️ 14 位是 13 醫師 ＋ 1 藝術總監（CLAUDE.md）。isPhysician 逐筆照抄，不給預設。
{
  const existing = await api.indexBySlug('doctor')
  let created = 0, updated = 0

  for (const d of data.doctors.DOCTORS) {
    const fields = {
      isPhysician: d.isPhysician,
      jobTitle: d.jobTitle ?? null,
      specialty: d.specialty ?? null,
      photo: imageField(`doctor/${d.slug}/photo`, d.photo?.src, {
        alt: `${d.name} ${d.jobTitle ?? ''}`.trim(),
        width: d.photo?.width ?? null,
        height: d.photo?.height ?? null,
      }),
      // 簡介是段落陣列 → 區塊 JSON（與後台富文本同格式）。
      bio: blocks(d.bio),
      // 媒體與講座紀錄。前台叫 media，資料庫的語意是「著作」。
      publications: blocks(d.media),
      // 兩組標籤合成一個陣列，用 type 區分（docs/08 §C-2）。
      tags: [
        ...(d.tags ?? []).map((tag, i) => ({ type: 1, tag, sortOrder: i })),
        ...(d.expertiseTags ?? []).map((tag, i) => ({ type: 2, tag, sortOrder: i })),
      ],
      // 時間軸 ＋ 證照 → DoctorCredentials。⚠️ 現職是 4，與經歷分開（2026-09-11 補的列舉值）。
      credentials: [
        ...(d.timeline ?? []).map((t, i) => ({
          type: { 現職: 4, 學歷: 1, 經歷: 2 }[t.label] ?? 2,
          text: t.text,
          sortOrder: i,
        })),
        ...(d.certifications ?? []).map((text, i) => ({ type: 3, text, sortOrder: i })),
      ],
    }

    // ⚠️ summary 是主幹欄位（ContentItems.Summary）不是型別欄位，與 title 一樣走 body 頂層。
    const body = { title: d.name, summary: d.lede ?? null, ...fields }
    const item = existing.has(d.slug)
      ? (updated++, await api.put(`/admin/doctor/${existing.get(d.slug).id}`, body))
      : (created++, await api.post('/admin/doctor', { slug: d.slug, ...body }))

    await api.ensurePublished('doctor', { ...item, status: 1 })
    ids.doctor.set(d.slug, item.id)
  }
  report('doctor', created, updated)
}

console.log('\n完成。')
