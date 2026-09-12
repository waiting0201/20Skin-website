// 站內搜尋索引（docs/09-frontend.md §4）。
//
// 🔴 **索引與頁面同源。** 讀的是 `content/*.json` —— 頁面渲染用的就是這一份，
//    所以不可能出現「搜尋得到、點進去 404」。改成另外查一次資料庫就會有那個風險。
//
// ⚠️ **產物是一支獨立的 `/search-index.json`，不內聯進 bundle。**
//    現在只有 139 筆，但文章有約 800 篇（CLAUDE.md 關鍵數字）—— 內聯等於讓
//    **每一個**訪客都下載整份索引，而其中絕大多數不會用搜尋。獨立檔案只在
//    使用者真的搜尋時才抓。
//
// ⚠️ 中文沒有空白分詞，所以這裡**不做斷詞**，用子字串比對。
//    對站內這個量級（約 950 筆）完全夠用，而且引進斷詞器要嘛體積大、
//    要嘛對醫療專有名詞切得很差（「皮秒雷射」被切成「皮」「秒」「雷射」）。
//
// ⚠️ 只收**已發布**的內容 —— content/*.json 本身就只有已發布的（匯出時就篩過了，
//    docs/09 §3），所以這裡不需要、也不應該再判一次狀態。

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const CONTENT = join(ROOT, 'content')
const OUT = join(ROOT, 'public', 'search-index.json')

/**
 * 哪些單元進索引、顯示成什麼型別標籤、內文要收哪幾個欄位。
 *
 * ⚠️ `term` 只收**分類**（termType 1–3），不收文章標籤（4）——
 * 30–60 個標籤頁內容單薄，混進搜尋結果只會稀釋掉真正有內容的頁面
 * （與 docs/08 §C-9 讓標籤頁 noIndex 是同一個理由）。
 */
const UNITS = [
  { file: 'treatments.json', label: '療程', body: ['subtitle', 'indications', 'mechanism', 'deviceInfo'] },
  { file: 'concerns.json', label: '肌膚困擾', body: ['symptoms', 'causes', 'selfCheckGuide', 'whenToSeeDoctor'] },
  { file: 'articles.json', label: '文章', body: ['bodyBlocks'] },
  { file: 'doctors.json', label: '醫師', body: ['jobTitle', 'specialty', 'bio'] },
  { file: 'clinics.json', label: '據點', body: ['address', 'intro', 'transportInfo'] },
  { file: 'cases.json', label: '案例', body: ['narrative'] },
  { file: 'faqs.json', label: '常見問題', body: ['webAnswer'] },
  { file: 'pages.json', label: '頁面', body: ['lead', 'bodyBlocks'] },
  { file: 'terms.json', label: '分類', body: ['intro'], onlyCategories: true },
]

/** 區塊 JSON 或純文字都可能，統一攤成一串可比對的文字。 */
function flatten(value, depth = 0) {
  if (depth > 6 || value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map((v) => flatten(v, depth + 1)).join(' ')
  if (typeof value === 'object') {
    // ⚠️ 跳過圖片欄位：blobPath 與網址進索引只會讓使用者搜到一堆莫名其妙的結果。
    if ('blobPath' in value && 'url' in value) return value.alt ?? ''
    return Object.values(value).map((v) => flatten(v, depth + 1)).join(' ')
  }
  return ''
}

function collapse(text) {
  return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

const json = async (name) => JSON.parse(await readFile(join(CONTENT, name), 'utf8'))

const terms = await json('terms.json')
const termById = new Map(terms.map((t) => [t.id, t]))

/**
 * FAQ 不產生獨立網址（docs/08 §C-6），結果要指到它所屬的分類頁。
 * ⚠️ 找不到分類就整筆跳過 —— 收一筆點不到的結果比少收一筆糟。
 */
function urlFor(item) {
  if (item.urlPath) return item.urlPath
  if (item.unit === 'faq') {
    const category = termById.get(item.fields?.categoryTermId)
    return category?.urlPath ?? null
  }
  return null
}

const entries = []
let skipped = 0

for (const unit of UNITS) {
  const items = await json(unit.file)
  for (const item of items) {
    if (unit.onlyCategories && Number(item.fields?.termType) === 4) continue
    // 搜尋頁與 404 自己不該出現在搜尋結果裡。
    if (item.unit === 'page' && ['search', 'not-found'].includes(item.fields?.systemKey)) continue

    const url = urlFor(item)
    if (!url) {
      skipped++
      continue
    }

    const summary = collapse(item.summary ?? '')
    const body = collapse(unit.body.map((key) => flatten(item.fields?.[key])).join(' '))
    // 摘要優先用一句話導言；沒有的話從內文截一段（例如 FAQ 用網頁版答案）。
    const excerpt = (summary || body).slice(0, 120)

    entries.push({
      t: unit.label,
      u: url,
      ti: item.title,
      ex: excerpt,
      // 比對用的小寫全文。⚠️ 只存一份小寫版本，避免每次搜尋都對整份索引做 toLowerCase()。
      k: `${item.title} ${summary} ${body}`.toLowerCase().slice(0, 600),
    })
  }
}

await writeFile(OUT, JSON.stringify({ count: entries.length, entries }) + '\n', 'utf8')

const kb = (await readFile(OUT)).length / 1024
console.log(`✓ 搜尋索引 ${entries.length} 筆 → public/search-index.json（${kb.toFixed(0)} KB）`)
if (skipped > 0) console.log(`  · 略過 ${skipped} 筆沒有可連結網址的內容`)

// ⚠️ 索引會隨文章數成長（約 800 篇時大約 400–600 KB）。超過 1 MB 就該改成
//    分片或改用建置期產生的倒排索引 —— 現在還遠不到，不要提前優化。
if (kb > 1024) console.warn(`⚠ 索引已超過 1 MB（${kb.toFixed(0)} KB），該考慮分片了`)
