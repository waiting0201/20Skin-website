#!/usr/bin/env node
// 階段三之二：WP REST 快取 → 正規化的文章 JSON。
//
// 用法：node tools/legacy-import/parse-blog.mjs [輸出]
//
// ⚠️ **不連網**，只讀 .cache/blog。
//
// 🔴 **46 個 WP 分類要壓進 4 個站內分類。** `ArticleCategorySlug` 只有四個值且是定案值
//    （docs/01-sitemap.md §1、CLAUDE.md 關鍵數字），前台的 `/blog/{category}/` 與英文小標
//    （`_presentation.ts`）都綁在這四個上。新增分類＝新增前台分類頁 ＋ 改型別，
//    不是搬遷該做的事。**原本的 46 個分類一個不漏地轉成標籤**，所以資訊沒有丟。
//
// ⚠️ **有兩篇 date 的年份是 `0206`**（`2026` 打錯，WP 照收）。以 `modified` 的年份修正。

import { readFileSync, writeFileSync } from 'node:fs'
import { htmlToBlocks } from './blocks.mjs'
import { hasClass } from './html.mjs'

const OUT = process.argv[2] ?? 'tools/legacy-import/parsed-blog.json'
const DIR = 'tools/legacy-import/.cache/blog'
const read = (n) => JSON.parse(readFileSync(`${DIR}/${n}.json`, 'utf8'))

const posts = read('posts')
const cats = new Map(read('categories').map((c) => [c.id, c]))
const tags = new Map(read('tags').map((t) => [t.id, t]))
const media = new Map(read('media').map((m) => [m.id, m]))

// ── 分類映射 ────────────────────────────────────────────────────────
/** WP 的**根**分類 → 站內分類 slug。子分類跟著自己的根走。 */
const ROOT_TO_CATEGORY = {
  'skin-issues': 'dermatology',          // 肌膚問題整支 → 皮膚新知
  media: 'media',                        // 演講和媒體 → 媒體報導
  // 其餘一律醫美新知：雷射光電／針劑注射／其他療程／彩妝式輕醫美／新中式美學／
  // 肝斑治療／真童妍拉提術／20Skin／醫療團隊
}
const DEFAULT_CATEGORY = 'medical-aesthetics'
/** 同時落在多個站內分類時的取用順序 —— 媒體報導最具體，先給它。 */
const PRIORITY = ['media', 'dermatology', 'medical-aesthetics']

const rootOf = (id) => {
  let c = cats.get(id)
  const seen = new Set()
  while (c?.parent && !seen.has(c.id)) { seen.add(c.id); c = cats.get(c.parent) ?? c; if (!c.parent) break }
  return c
}

// ── 樣板剝除 ────────────────────────────────────────────────────────
/** 出現在全部 391 篇的圖片，是頁尾樣板不是內容（2026-09-14 實測）。 */
const BOILERPLATE_IMG = [
  '20S-211026A看皮膚找4季_工作區域-1-1.jpg',
  '/2020/11/logo-800.png',
  '/2020/11/logo-800-150x150.png',
]
const isBoilerplateImg = (src) => BOILERPLATE_IMG.some((b) => src.includes(b))

/**
 * 要整個丟掉的節點。
 * ⚠️ ez-toc 是「內容目錄」外掛的產物 —— 前台自己會從 heading 區塊算目錄
 *    （blog/[slug].vue:27），搬過來會變成兩份目錄，而且裡面的錨點指向舊網域。
 */
function dropNode(n) {
  if (n.attrs?.id === 'ez-toc-container') return true
  if ((n.attrs?.class ?? '').includes('ez-toc')) return true
  if (n.attrs?.['data-nosnippet'] !== undefined) return true
  // 頁尾灰底 CTA 區塊（logo ＋「看皮膚，找四季」＋ 短網址）
  if (/background-color:\s*#e8e8e8/i.test(n.attrs?.style ?? '')) return true
  if (n.tag === 'img' && isBoilerplateImg(n.attrs?.src ?? '')) return true
  return false
}

// ── 逐篇轉換 ────────────────────────────────────────────────────────
const out = []
const warnings = []

for (const p of posts) {
  const slug = decodeURIComponent(p.slug)
  const blocks = htmlToBlocks(p.content.rendered, dropNode)

  // 站內互連改寫成新網址。⚠️ 這些 href 只活在 runs 裡（前台目前不渲染行內連結），
  //    但現在不改，日後要開行內連結時整批都指向舊網域。
  for (const b of blocks) {
    for (const r of b.runs ?? []) {
      if (!r.href) continue
      const m = /^https?:\/\/20skinblog\.com\/([^?#]*)/i.exec(r.href)
      if (m) {
        const path = m[1].replace(/^\/+|\/+$/g, '')
        r.href = path && !path.startsWith('category/') && !path.startsWith('wp-content/')
          ? `/blog/${decodeURIComponent(path)}/`
          : '/blog/'
      }
    }
  }

  // 日期：年份 < 1900 視為打錯，改用 modified 的年份（docs 檔頭說明）
  let date = p.date.slice(0, 10)
  if (Number(date.slice(0, 4)) < 1900) {
    const fixed = `${p.modified.slice(0, 4)}${date.slice(4)}`
    warnings.push({ slug, warn: `日期年份異常 ${date} → 依 modified 修正為 ${fixed}` })
    date = fixed
  }

  // 分類
  const targets = p.categories.map((id) => ROOT_TO_CATEGORY[rootOf(id)?.slug] ?? DEFAULT_CATEGORY)
  const category = PRIORITY.find((c) => targets.includes(c)) ?? DEFAULT_CATEGORY

  // 標籤＝WP 標籤 ＋ WP 分類（分類壓縮後不能憑空消失）
  const tagNames = [
    ...p.tags.map((id) => tags.get(id)?.name).filter(Boolean),
    ...p.categories.map((id) => cats.get(id)?.name).filter(Boolean),
  ]

  const fm = media.get(p.featured_media)
  const cover = fm?.source_url
    ? { src: fm.source_url, alt: (fm.alt_text || '').trim(), width: fm.media_details?.width ?? null, height: fm.media_details?.height ?? null }
    : null
  if (!cover) warnings.push({ slug, warn: p.featured_media ? `精選圖 id=${p.featured_media} 取不到媒體` : '沒有精選圖' })
  if (!blocks.length) warnings.push({ slug, warn: '內文是空的' })

  out.push({
    source: 'blog',
    legacyId: p.id,
    legacyUrl: p.link,
    slug,
    title: decodeEntities(p.title.rendered),
    category,
    date,
    cover,
    excerpt: stripTags(p.excerpt?.rendered ?? ''),
    tagNames: [...new Set(tagNames)],
    wpCategories: p.categories.map((id) => cats.get(id)?.name).filter(Boolean),
    blocks,
  })
}

function stripTags(s) { return decodeEntities(s.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim() }
function decodeEntities(s) {
  return s.replace(/&(#x([0-9a-fA-F]+)|#(\d+)|([a-zA-Z][a-zA-Z0-9]*));/g, (full, _b, hex, dec, name) => {
    if (hex) return String.fromCodePoint(parseInt(hex, 16))
    if (dec) return String.fromCodePoint(Number(dec))
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', mdash: '—', ndash: '–' }[name] ?? full
  })
}

writeFileSync(OUT, JSON.stringify({ source: '20skinblog.com', parsedAt: new Date().toISOString(), count: out.length, articles: out }, null, 2) + '\n')

const figs = out.reduce((n, a) => n + a.blocks.filter((b) => b.type === 'figure').length, 0)
const images = new Set(out.flatMap((a) => [a.cover?.src, ...a.blocks.filter((b) => b.type === 'figure').map((b) => b.image.src)]).filter(Boolean))
const byCat = out.reduce((m, a) => ({ ...m, [a.category]: (m[a.category] ?? 0) + 1 }), {})
console.log(`解析 ${out.length} 篇 → ${OUT}`)
console.log(`  分類分布：${Object.entries(byCat).map(([k, v]) => `${k} ${v}`).join('　')}`)
console.log(`  有封面 ${out.filter((a) => a.cover).length} 篇　內文圖 ${figs} 張　唯一圖片 ${images.size} 張`)
console.log(`  唯一標籤 ${new Set(out.flatMap((a) => a.tagNames)).size} 個　平均區塊 ${(out.reduce((n, a) => n + a.blocks.length, 0) / out.length).toFixed(1)}`)
console.log(`  空內文 ${out.filter((a) => !a.blocks.length).length} 篇`)
if (warnings.length) {
  writeFileSync('tools/legacy-import/.cache/blog-parse-warnings.json', JSON.stringify(warnings, null, 2) + '\n')
  console.log(`  ⚠️ ${warnings.length} 筆警告 → .cache/blog-parse-warnings.json`)
  for (const w of warnings.slice(0, 6)) console.log(`     ${w.slug}：${w.warn}`)
}
