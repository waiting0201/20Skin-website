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

// 🔴 **發布必須是最後一輪。**
//    UpdateAsync 與 UpdateRelationsAsync 都遵守 docs/11 §7 規則 2：「已發布的內容被編輯，
//    工作副本回到草稿」。所以先發布、後寫關聯的話，關聯那一步會把整批內容打回草稿 ——
//    而建置期匯出只讀已發布快照，那批頁面就從網站上消失了，過程中沒有任何錯誤訊息。
const publishQueue = []
const enqueuePublish = (unit, id) => publishQueue.push({ unit, id })

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
      // 簡介是一份區塊文件：段落 ＋ 兩個沒有專屬欄位的內容字串。
      // ⚠️ heroRole（個人頁 Hero 的職稱，與列表卡片的 jobTitle 刻意不同）與
      //    yearsInPractice（執業年資）都是院方會改的內容，但各自加一欄不划算 ——
      //    它們只出現在個人頁，且天生屬於「簡介」這份文件。
      bio: blocks({
        heroRole: d.heroRole ?? null,
        yearsInPractice: d.yearsInPractice ?? null,
        paragraphs: d.bio ?? [],
      }),
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

    enqueuePublish('doctor', item.id)
    ids.doctor.set(d.slug, item.id)
  }
  report('doctor', created, updated)
}

// ── 3. 療程 ──────────────────────────────────────────────────────────
// ⚠️ 27 項中多數沒有站內內容（docs/06 §3 的 12 項需從零撰寫）。沒有內容的照樣建，
//    但**留在草稿**：建置期匯出只讀已發布快照，草稿不會產生頁面 —— 這正是我們要的，
//    前台現在那句「內容建置中」在正式站上根本不該存在（STATUS §二）。
{
  const existing = await api.indexBySlug('treatment')
  let created = 0, updated = 0, drafts = 0

  for (const t of data.treatments.treatments) {
    const u = `treatment/${t.slug}`
    const hasDetail = Boolean(t.facts || t.indications || t.mechanismParagraphs)

    const body = {
      title: t.title,
      summary: t.cardExcerpt ?? null,
      categoryTermId: ids.term.get(`1:${t.categorySlug}`),
      nameEn: t.nameEn ?? null,
      subtitle: t.summary ?? null,
      cover: imageField(u + '/cover', t.cardImage?.src, {
        alt: t.cardImage?.alt ?? null, width: t.cardImage?.width ?? null, height: t.cardImage?.height ?? null,
      }),
      facts: blocks(t.facts),
      // 區段標題與插圖跟著它們所屬的區段走，這正是區塊 JSON 的用途。
      indications: blocks(t.indications && { heading: t.indicationsHeading ?? null, items: t.indications }),
      mechanism: blocks(t.mechanismParagraphs && {
        heading: t.mechanismHeading ?? null,
        paragraphs: t.mechanismParagraphs,
        image: t.mechanismImage ? imageField(u + '/mechanism', t.mechanismImage.src, {
          alt: t.mechanismImage.alt, width: t.mechanismImage.width, height: t.mechanismImage.height,
        }) : null,
      }),
      steps: blocks(t.steps),
      aftercare: blocks(t.aftercare),
      contraindications: blocks(t.precautionsList && { items: t.precautionsList, note: t.precautionsNote ?? null }),
      deviceInfo: blocks(t.device),
      durationText: t.facts?.find((f) => f.label === '療程時間')?.value ?? null,
      sessionsText: t.facts?.find((f) => f.label === '建議次數')?.value ?? null,
      images: (t.gallery ?? []).map((g, i) => ({
        image: imageField(`${u}/gallery/${i}`, g.src, { alt: g.alt, width: g.width, height: g.height }),
        caption: g.caption ?? null,
        sortOrder: i,
      })),
    }

    const item = existing.has(t.slug)
      ? (updated++, await api.put(`/admin/treatment/${existing.get(t.slug).id}`, body))
      : (created++, await api.post('/admin/treatment', { slug: t.slug, ...body }))

    if (hasDetail) enqueuePublish('treatment', item.id)
    else drafts++
    ids.treatment.set(t.slug, item.id)
  }
  report('treatment', created, updated)
  console.log(`             （其中 ${drafts} 項無站內內容，留在草稿：不會產生頁面）`)
}

// ── 4. 困擾 ──────────────────────────────────────────────────────────
{
  const existing = await api.indexBySlug('concern')
  let created = 0, updated = 0

  for (const c of data.concerns.CONCERNS) {
    const u = `concern/${c.slug}`
    const d = c.detail ?? {}
    const body = {
      title: c.title,
      summary: c.lede ?? c.overviewDesc ?? null,
      cover: imageField(u + '/cover', c.heroImage?.src, {
        alt: c.heroImage?.alt ?? null, width: c.heroImage?.width ?? null, height: c.heroImage?.height ?? null,
      }),
      symptoms: blocks(d.symptomParagraphs && {
        heading: d.symptomHeading ?? null,
        paragraphs: d.symptomParagraphs,
        media: d.symptomMedia ? imageField(u + '/symptom', d.symptomMedia.src, {
          alt: d.symptomMedia.alt, width: d.symptomMedia.width, height: d.symptomMedia.height,
        }) : null,
      }),
      causes: blocks(d.causesFacts && { heading: d.causesHeading ?? null, intro: d.causesIntro ?? null, facts: d.causesFacts }),
      selfCheckGuide: blocks(d.types && { heading: d.selfCheckHeading ?? null, intro: d.selfCheckIntro ?? null, types: d.types }),
      whenToSeeDoctor: blocks(d.warnItems && { heading: d.warnHeading ?? null, items: d.warnItems }),
      recommendationIntro: blocks({
        treatmentsIntro: d.treatmentsIntro ?? null,
        treatmentsNote: d.treatmentsNote ?? null,
        doctorsIntro: d.doctorsIntro ?? null,
      }),
    }
    const item = existing.has(c.slug)
      ? (updated++, await api.put(`/admin/concern/${existing.get(c.slug).id}`, body))
      : (created++, await api.post('/admin/concern', { slug: c.slug, ...body }))

    // aiSummary 屬 SEO 區塊（40–60 字直答段落，docs/03 §4 ②）
    if (c.aiSummary) await api.seo('concern', item.id, { aiSummary: c.aiSummary, noIndex: false })
    enqueuePublish('concern', item.id)
    ids.concern.set(c.slug, item.id)
  }
  report('concern', created, updated)
}

// ── 5. 據點 ──────────────────────────────────────────────────────────
{
  const existing = await api.indexBySlug('clinic')
  let created = 0, updated = 0

  for (const c of data.clinics.CLINICS) {
    const u = `clinic/${c.slug}`
    const body = {
      title: c.name,
      summary: c.desc ?? c.lede ?? null,
      address: c.address,
      phone: c.phone,
      lineUrl: c.lineUrl ?? null,
      // ⚠️ 經緯度為必填（docs/08 §C-7）。前台資料沒有，先給 0 —— 待院方提供實際座標。
      latitude: c.latitude ?? 0,
      longitude: c.longitude ?? 0,
      mapUrl: c.mapUrl ?? null,
      transportInfo: blocks(c.transportInfo),
      intro: blocks(c.lede ? { lede: c.lede } : null),
      businessHours: (c.businessHours ?? []).map((h, i) => ({
        dayOfWeek: h.day, startTime: h.start, endTime: h.end, sortOrder: i,
      })),
      photos: c.heroPhoto ? [{
        image: imageField(u + '/photo/0', c.heroPhoto.src, {
          alt: c.heroPhoto.alt, width: c.heroPhoto.width, height: c.heroPhoto.height,
        }),
        caption: c.heroPhoto.caption ?? null,
        sortOrder: 0,
      }] : [],
    }
    const item = existing.has(c.slug)
      ? (updated++, await api.put(`/admin/clinic/${existing.get(c.slug).id}`, body))
      : (created++, await api.post('/admin/clinic', { slug: c.slug, ...body }))

    if (c.pageDescription) await api.seo('clinic', item.id, { metaDescription: c.pageDescription, noIndex: false })
    enqueuePublish('clinic', item.id)
    ids.clinic.set(c.slug, item.id)
  }
  report('clinic', created, updated)
}

// ── 6. 文章 ──────────────────────────────────────────────────────────
{
  const existing = await api.indexBySlug('article')
  let created = 0, updated = 0

  for (const a of data.articles.ARTICLES) {
    const u = `article/${a.slug}`
    const body = {
      title: a.title,
      summary: a.summary ?? null,
      categoryTermId: ids.term.get(`2:${a.categorySlug}`),
      // 作者可能是站內醫師，也可能只是署名（docs/08 §C-4）。
      authorDoctorId: a.author?.doctorSlug ? ids.doctor.get(a.author.doctorSlug) ?? null : null,
      authorName: a.author?.doctorSlug ? null : (a.author?.name ?? null),
      reviewerDoctorId: a.reviewer?.doctorSlug ? ids.doctor.get(a.reviewer.doctorSlug) ?? null : null,
      reviewedOn: a.reviewedOn ?? null,
      // 🔴 DisplayDate ≠ PublishAt：前者是對外顯示與 datePublished 的來源（CLAUDE.md 關鍵數字）。
      displayDate: a.displayDate ?? null,
      cover: imageField(u + '/cover', a.cover?.src, {
        alt: a.cover?.alt ?? null, width: a.cover?.width ?? null, height: a.cover?.height ?? null,
      }),
      bodyBlocks: a.body ?? null,
      readingMinutes: a.readingMinutes ?? null,
      sourceSite: 1,
    }
    const item = existing.has(a.slug)
      ? (updated++, await api.put(`/admin/article/${existing.get(a.slug).id}`, body))
      : (created++, await api.post('/admin/article', { slug: a.slug, ...body }))

    if (a.metaDescription || a.aiSummary) {
      await api.seo('article', item.id, {
        metaDescription: a.metaDescription ?? null,
        aiSummary: a.aiSummary ?? null,
        noIndex: false,
      })
    }
    enqueuePublish('article', item.id)
    ids.article.set(a.slug, item.id)
  }
  report('article', created, updated)
}

// ── 7. FAQ ───────────────────────────────────────────────────────────
// ⚠️ FAQ 不產生獨立網址（docs/08 §C-6）—— slug 只當 /faq/ 的頁內錨點。
{
  const existing = await api.indexBySlug('faq')
  let created = 0, updated = 0

  for (const [i, f] of data.faq.FAQ_ITEMS.entries()) {
    const slug = f.slug ?? `faq-${String(i + 1).padStart(2, '0')}`
    const body = {
      title: f.question,
      categoryTermId: ids.term.get(`3:${f.categorySlug}`),
      webAnswer: f.webAnswer,
      aiAnswer: f.aiAnswer,
      lastReviewedOn: f.lastReviewedOn ?? null,
      reviewedBy: f.reviewedBy ?? null,
      sortOrder: i,
    }
    const item = existing.has(slug)
      ? (updated++, await api.put(`/admin/faq/${existing.get(slug).id}`, body))
      : (created++, await api.post('/admin/faq', { slug, ...body }))

    enqueuePublish('faq', item.id)
    ids.faq.set(slug, item.id)
  }
  report('faq', created, updated)
}

// ── 8. 案例 ──────────────────────────────────────────────────────────
// 🔴 **只匯入有內頁的那一則。** `Cases` 的四個法規揭露欄位全部 NOT NULL（docs/08 §C-5），
//    而列表上另外 8 則只有標題與標籤，沒有個案差異聲明、拍攝條件與同意書索引。
//    **捏造那些欄位是法規紅線**（STATUS §二 已載明），所以不建，也不用空字串矇混過去。
{
  const existing = await api.indexBySlug('case')
  let created = 0, updated = 0
  const skipped = []

  for (const c of data.cases.CASE_DETAILS) {
    const u = `case/${c.slug}`
    const body = {
      title: c.title,
      summary: c.lede ?? null,
      treatmentId: ids.treatment.get(c.treatmentsUsed?.[0]?.slug) ?? [...ids.treatment.values()][0],
      sessionsText: c.facts?.sessions ?? null,
      // 內頁的敘事區塊全部收進 Narrative：段落、時間軸、見證、醫師評述與數據列。
      narrative: blocks({
        facts: c.facts ?? null,
        sections: c.sections ?? null,
        timeline: c.timeline ?? null,
        testimonial: c.testimonial ?? null,
        doctorQuote: c.doctorQuote ?? null,
      }),
      individualVarianceStatement: c.individualVarianceStatement,
      hasWrittenConsent: c.hasWrittenConsent,
      consentReference: c.consentReference,
      shootingConditions: c.shootingConditions,
    }
    const item = existing.has(c.slug)
      ? (updated++, await api.put(`/admin/case/${existing.get(c.slug).id}`, body))
      : (created++, await api.post('/admin/case', { slug: c.slug, ...body }))

    enqueuePublish('case', item.id)
    ids.case.set(c.slug, item.id)
  }

  const detailSlugs = new Set(data.cases.CASE_DETAILS.map((c) => c.slug))
  for (const c of data.cases.CASE_LIST) {
    if (c.slug && !detailSlugs.has(c.slug)) skipped.push(c.slug)
    else if (!c.slug) skipped.push(c.title)
  }
  report('case', created, updated)
  console.log(`             （${skipped.length} 則只有列表資料，缺法規揭露欄位，未建立 —— 見 STATUS §二）`)
}

// ── 9. 頁面 ──────────────────────────────────────────────────────────
// ⚠️ 17 個頁面都由種子建好了（系統頁不可刪、不可改 slug），這裡只補內容。
{
  const existing = await api.indexBySlug('page')
  let updated = 0

  const put = async (slug, body) => {
    const row = existing.get(slug)
    if (!row) { console.log(`             ⚠️ 找不到頁面 ${slug}，略過`); return null }
    const item = await api.put(`/admin/page/${row.id}`, body)
    enqueuePublish('page', item.id)
    ids.page.set(slug, item.id)
    updated++
    return item
  }

  // 品牌理念 /about/
  await put('about', {
    lead: null,
    bodyBlocks: blocks({
      pillars: data.pages.ABOUT_PILLARS,
      timeline: data.pages.ABOUT_TIMELINE,
      teamPreview: data.pages.ABOUT_TEAM_PREVIEW,
      clinics: data.pages.ABOUT_CLINICS,
    }),
  })

  // 長版故事頁 ×2
  for (const [slug, p] of Object.entries(data.pages.STORY_PAGES)) {
    await put(slug, {
      title: p.title,
      summary: p.lede ?? null,
      lead: p.lede ?? null,
      bodyBlocks: blocks({
        meta: p.meta ?? null,
        heroImage: p.heroImage ? imageField(`page/${slug}/hero`, p.heroImage.src, {
          alt: p.heroImage.alt, width: p.heroImage.w ?? null, height: p.heroImage.h ?? null,
        }) : null,
        heroCaption: p.heroCaption ?? null,
        toc: p.toc ?? null,
        body: p.body ?? null,
        faqs: p.faqs ?? null,
        sister: p.sisterSlug ? { slug: p.sisterSlug, label: p.sisterLabel } : null,
      }),
    })
  }

  // 法務三頁。⚠️ 限超級管理員可編（docs/02 §4）——這支腳本以 sa 身分跑，通得過。
  for (const doc of data.pages.LEGAL_DOCS) {
    await put(doc.slug, {
      title: doc.title,
      bodyBlocks: blocks({ updatedOn: doc.updatedOn ?? null, sections: doc.sections ?? [] }),
    })
  }

  report('page', 0, updated)
}

// ── 10. 關聯 ─────────────────────────────────────────────────────────
// ⚠️ **雙向關聯一律單向存**（docs/08 §D）：療程頁有「關聯文章」、文章頁也有「關聯療程」，
//    但資料庫只有 RelationType=3 那一筆，反向顯示靠索引查。存兩筆會出現兩份各自為政的排序。
//    所以這裡只從「擁有那個排序的那一端」寫入。
{
  const R = { treatmentToDoctor: 1, treatmentToConcern: 2, treatmentToArticle: 3, treatmentToFaq: 4,
              concernToTreatment: 5, concernToFaq: 6, concernToArticle: 7,
              clinicToDoctor: 8, clinicToTreatment: 9, clinicToFaq: 10, articleToTag: 11,
              doctorToConcern: 13 }
  let written = 0

  const save = async (unit, id, items) => {
    // ⚠️ 去重：(relationType, toContentItemId) 在資料庫上是唯一鍵（docs/08 §D）。
    //    來源資料會產生重複 —— 例如療程的兩個標籤同時對應到同一個困擾。
    //    不先去重就會撞 2601，而且那個錯誤在修好 ExceptionMiddleware 之前是一句 500。
    const seen = new Set()
    const clean = []
    for (const i of items) {
      if (!i.toContentItemId) continue
      const key = `${i.relationType}:${i.toContentItemId}`
      if (seen.has(key)) continue
      seen.add(key)
      clean.push({ ...i, sortOrder: clean.length })
    }
    if (!clean.length) return
    await api.relations(unit, id, clean)
    written += clean.length
  }

  // 療程 → 醫師／困擾。⚠️ 前台的 detailTags 是「此療程可改善的困擾」的標籤列，
  //    它本來就該是關聯而不是一組字串欄位。
  for (const t of data.treatments.treatments) {
    const id = ids.treatment.get(t.slug)
    if (!id) continue
    const items = []
    ;(t.doctors ?? []).forEach((d, i) =>
      items.push({ relationType: R.treatmentToDoctor, toContentItemId: ids.doctor.get(d.slug), sortOrder: i }))
    ;(t.cardTags ?? []).forEach((label, i) => {
      const c = data.concerns.CONCERNS.find((x) => x.title === label || x.overviewTags?.includes(label))
      if (c) items.push({ relationType: R.treatmentToConcern, toContentItemId: ids.concern.get(c.slug), sortOrder: i })
    })
    await save('treatment', id, items)
  }

  // 困擾 → 療程（帶推薦理由）／文章
  for (const c of data.concerns.CONCERNS) {
    const id = ids.concern.get(c.slug)
    if (!id) continue
    const items = []
    ;(c.detail?.treatments ?? []).forEach((t, i) => {
      const slug = t.href?.split('/').filter(Boolean).pop()
      items.push({
        relationType: R.concernToTreatment,
        toContentItemId: ids.treatment.get(slug),
        sortOrder: i,
        // ⚠️ Note 是逐筆的推薦理由（docs/08 §D），不是整段引言 —— 後者在 RecommendationIntro。
        note: t.excerpt ?? null,
      })
    })
    ;(c.detail?.articles ?? []).forEach((a, i) => {
      const slug = a.href?.split('/').filter(Boolean).pop()
      if (ids.article.has(slug)) items.push({ relationType: R.concernToArticle, toContentItemId: ids.article.get(slug), sortOrder: i })
    })
    await save('concern', id, items)
  }

  // 醫師 → 困擾（擅長處理的困擾，2026-09-11 新增的關聯型別 13）
  for (const d of data.doctors.DOCTORS) {
    const id = ids.doctor.get(d.slug)
    if (!id) continue
    const items = (d.concerns ?? []).map((c, i) => ({
      relationType: R.doctorToConcern, toContentItemId: ids.concern.get(c.slug), sortOrder: i,
    }))
    await save('doctor', id, items)
  }

  // 醫師的相關療程 → 寫在**療程那一端**（型別 1）。
  // ⚠️ 雙向關聯一律單向存（docs/08 §D）：個人頁的「相關療程」與療程頁的「主治醫師」
  //    是同一筆資料的兩面，存兩份會出現兩份各自為政的排序。
  {
    const byTreatment = new Map()
    for (const d of data.doctors.DOCTORS) {
      for (const t of d.treatments ?? []) {
        if (!byTreatment.has(t.slug)) byTreatment.set(t.slug, [])
        byTreatment.get(t.slug).push(d.slug)
      }
    }
    for (const [slug, doctorSlugs] of byTreatment) {
      const id = ids.treatment.get(slug)
      if (!id) continue
      const current = (await api.detail('treatment', id)).relations
        .map((r) => ({ relationType: r.relationType, toContentItemId: r.toContentItemId, sortOrder: r.sortOrder, note: r.note }))
      const add = doctorSlugs.map((ds, i) => ({
        relationType: R.treatmentToDoctor, toContentItemId: ids.doctor.get(ds), sortOrder: i,
      }))
      await save('treatment', id, [...current, ...add])
    }
  }

  // 文章 → 標籤
  for (const a of data.articles.ARTICLES) {
    const id = ids.article.get(a.slug)
    if (!id) continue
    const items = (a.tags ?? []).map((tag, i) => ({
      relationType: R.articleToTag,
      toContentItemId: ids.term.get(`4:${typeof tag === 'string' ? tag : tag.slug}`),
      sortOrder: i,
    }))
    await save('article', id, items)
  }

  // 據點 → 醫師。⚠️ 駐診時段備註（「一 上午／四 下午」）放進關聯的 Note ——
  //    DoctorSchedules 是「星期＋起訖時間」的結構，而前台資料只有一句自由文字，
  //    塞不進去也不該為了塞進去而編出假的時間。
  for (const c of data.clinics.CLINICS) {
    const id = ids.clinic.get(c.slug)
    if (!id) continue
    const items = []
    data.doctors.DOCTORS.forEach((d, i) => {
      const assignment = (d.clinics ?? []).find((x) => x.clinicSlug === c.slug)
      if (!assignment) return
      items.push({
        relationType: R.clinicToDoctor,
        toContentItemId: ids.doctor.get(d.slug),
        sortOrder: i,
        note: assignment.scheduleNote ?? null,
      })
    })
    await save('clinic', id, items)
  }

  // 療程 → 文章／FAQ。前台的療程細節頁有這兩區，且排序屬於療程頁。
  for (const t of data.treatments.treatments) {
    const id = ids.treatment.get(t.slug)
    if (!id) continue
    const items = []
    ;(t.articles ?? []).forEach((a, i) => {
      const slug = a.href?.split('/').filter(Boolean).pop()
      if (ids.article.has(slug)) items.push({ relationType: R.treatmentToArticle, toContentItemId: ids.article.get(slug), sortOrder: i })
    })
    if (items.length) {
      // ⚠️ 與上面那輪是同一筆內容的關聯，必須合併送出 —— relations 端點是整組覆寫，
      //    分兩次送第二次會把第一次的洗掉。
      const current = (await api.detail('treatment', id)).relations
        .map((r) => ({ relationType: r.relationType, toContentItemId: r.toContentItemId, sortOrder: r.sortOrder, note: r.note }))
      await save('treatment', id, [...current, ...items])
    }
  }

  console.log(`  relation   寫入 ${written} 筆`)
}

// ── 11. 全站設定 ─────────────────────────────────────────────────────
{
  const s = data['site-settings'].SITE_SETTINGS
  // ⚠️ 端點收的是 { items: [{ settingKey, settingValue }] }，而且**只能更新既有的鍵**
  //    —— key-value 表的彈性是給 schema 演進用的，不是讓呼叫端任意塞新鍵（docs/08 §G-1）。
  const existingKeys = new Set((await api.get('/admin/setting')).map((r) => r.settingKey))
  const wanted = [
    ['site.name', s.siteName],
    ['site.description', s.description],
    ['aifaq.enabled', String(Boolean(s.aiFaqEnabled))],
  ]
  const items = wanted
    .filter(([k, v]) => v != null && existingKeys.has(k))
    .map(([settingKey, settingValue]) => ({ settingKey, settingValue: String(settingValue) }))

  const missing = wanted.filter(([k]) => !existingKeys.has(k)).map(([k]) => k)
  if (items.length) await api.put('/admin/setting', { items })
  console.log(`  setting    已更新 ${items.length} 項${missing.length ? `（種子沒有這些鍵，略過：${missing.join('、')}）` : ''}`)
}

// ── 12. 發布（最後一輪）────────────────────────────────────────────
// 見檔案上方 publishQueue 的說明：寫關聯會把內容打回草稿，所以發布只能在這裡做。
{
  let published = 0
  for (const { unit, id } of publishQueue) {
    const item = await api.detail(unit, id)
    if (item.status === 3 && item.publishedVersionId) continue
    await api.publish(unit, id)
    published++
  }

  // 種子建立的內容（13 個分類 ＋ 11 個系統頁）是「已發布但沒有快照」，見 api.mjs ensurePublished。
  let backfilled = 0
  for (const unit of ['term', 'page']) {
    for (const row of await api.list(unit)) {
      const item = await api.detail(unit, row.id)
      if (item.status === 3 && item.publishedVersionId) continue
      await api.publish(unit, row.id)
      backfilled++
    }
  }
  console.log(`  publish    發布 ${published} 筆（佇列 ${publishQueue.length}）＋ 補快照 ${backfilled} 筆（種子資料）`)
}

console.log('\n完成。')
