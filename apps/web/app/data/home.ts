// 首頁七個版位的內容來源（模板 1，mockup/index.html）。
//
// 對應 docs/02-backend-cms.md §3 的 HomeSections 種子 key：
//   hero / specialties / featured-treatments / latest-articles / doctors / clinics / brand-story
// 正式站由 HomeSectionItems（HomeSectionId + ContentItemId + SortOrder）勾選既有內容組成 ——
// 每個版位只能引用已存在的內容，不能另打文案。這裡先把 mockup 的原文抽成同樣的形狀，
// 接上 CMS 時只換資料來源、不改元件。
//
// 欄位命名對齊 docs/08-database.md 的 ContentItems／各模型主幹（title／slug／urlPath／summary），
// 圖片用 imagePath 是建置期產物的簡化表示 —— 正式站對應的是內嵌圖片欄位
// （CoverUrl／CoverAlt／CoverWidth…，見 docs/08-database.md §0 決策五），不是資料庫的實際欄位名。


// ── 1. hero：主視覺輪播 ──────────────────────────────────────────────────
// 正式站對應 HomeSections.Settings 的 JSON（唯一沒有 ContentItemId 可引用的版位，
// 見 docs/02-backend-cms.md §3）。

export interface HeroSlide {
  imagePath: string
  imageWidth: number
  imageHeight: number
  alt: string
  caption: string
}

export interface SpecialtyEntry {
  title: string
  slug: string
  urlPath: string
  imagePath: string
  iconWidth: number
  iconHeight: number
}
export interface FeaturedTreatment {
  title: string
  categoryLabel: string
  categorySlug: string
  slug: string
  urlPath: string
  imagePath: string
  imageWidth: number
  imageHeight: number
  alt: string
}
export interface LatestArticle {
  title: string
  categoryLabel: string
  categorySlug: string
  urlPath: string
  summary: string
  imagePath: string
  imageWidth: number
  imageHeight: number
  alt: string
  authorLabel: string
  displayDate: string
  readingMinutes: number
}
export interface HomeDoctor {
  name: string
  jobTitle: string
  isPhysician: boolean
  urlPath: string
  photoPath: string
  photoWidth: number
  photoHeight: number
}
// 🔴 **時段表的形狀只有一份**：`ClinicHoursTableRow`（clinics.ts）。
//    這裡原本另外定義了一個 `ClinicHoursRow{timeRangeLabel, openDays}`，
//    與據點頁的 `{label, days}` 是同一個東西的第二個名字 ——
//    而首頁那一份**從來沒有被正確填過**（塞進去的是 NAP 的字串），
//    結果首頁的看診時段表只有表頭、一列資料都沒有。
//    2026-09-16 由 `nuxt typecheck` 抓到，並在正式站確認表格確實是空的。
export interface HomeClinic {
  name: string
  urlPath: string
  phone: string
  address: string
  hoursRows: ClinicHoursTableRow[]
  hoursFootnote: string
}
// ── 資料來源：content/home.json ＋ 各單元（docs/09 §3、docs/08 §G-2）──────
//
// ⚠️ 七個版位「只能引用既有內容，不能另打文案」（docs/02 §3）。
//    八大專科入口／精選療程／最新文章／醫師／據點走 Items（引用內容）；
//    只有主視覺輪播沒有可引用的內容，走版位的 Settings JSON。
// ⚠️ 版位勾到草稿時匯出端已經濾掉（content-export），這裡拿到的都是已發布的。

import { UNIT, img, loadCategoryTerms, loadUnit } from './_content'
import { concernIconFor } from './_presentation'
import { getClinics, type ClinicHoursTableRow } from './clinics'
import { getClinicNap } from './navigation'

interface HomeSection {
  sectionKey: string
  title: string
  subtitle: string | null
  isEnabled: boolean
  sortOrder: number
  settings: unknown
  items: { contentItemId: number; contentType: number; slug: string | null; urlPath: string | null; title: string; sortOrder: number }[]
}

/**
 * 主視覺以下六個版位的預設先後（＝ mockup 的順序）。
 * ⚠️ 只在「API 回來的資料裡根本沒有這個版位」時才用得到 —— 有的話一律照它的 `sortOrder`。
 *    主視覺不在這裡：它固定在最上面、永遠渲染（全頁唯一的 `<h1>` 在裡面）。
 */
const ORDERABLE_SECTIONS = [
  'specialties', 'featured-treatments', 'latest-articles', 'doctors', 'clinics', 'brand-story',
] as const

/**
 * 首頁的七個版位，一次取齊。
 *
 * 🔴 **醫師與據點兩個版位是「自動列出全部」**（2026-09-18，決策 30）——
 *    API 不看首頁快照裡那份名單，改成算繪當下取整個單元、依單元自己的
 *    `SortOrder` 排（`PublicContentHandler.AutoSections`）。在此之前那兩個版位
 *    是逐筆挑選的，而挑的就是整個單元（14/14、2/2）＝同一批內容有兩份順序：
 *    在後台「內容 → 醫師」拖一次，首頁不會跟，兩邊都沒有任何徵兆。
 *    ⚠️ 前台這裡**不必分辨哪個版位是自動的** —— 兩種都是 `items[]`，
 *    差別只在名單哪裡來。精選療程與最新文章仍是手挑（4/28、4/1100）。
 *
 * 🔴 **2026-09-15：由建置期內聯的 content/home.json 改成執行期取 `GET /home`。**
 *    那支端點讀的是「首頁那筆 Page **已核准版本**的快照」，不是 HomeSections 即時表
 *    —— 直接讀即時表等於「編輯者拖一拖版位、還沒送審就上線」，核准這關被繞過
 *    （docs/08 §G-2、決策 14）。
 *
 * ⚠️ **七個版位合成一支函式**，不是七個各自取值：它們共用同一次 `GET /home`，
 *    而首頁本來就要全部。拆開只會讓同一份資料被組七次。
 *
 * ⚠️ 版位勾到草稿時 API 端已經濾掉，這裡拿到的都是前台看得到的。
 */
export async function getHomeData() {
  const [sections, treatments, terms, doctors, clinics, nap] = await Promise.all([
    homeSections() as Promise<HomeSection[]>,
    loadUnit(UNIT.treatment),
    loadCategoryTerms(),
    loadUnit(UNIT.doctor),
    // ⚠️ 用 `getClinics()` 而不是 `loadUnit(UNIT.clinic)` —— 它已經把營業時間組成
    //    表格列了（`hoursTableOf`）。在這裡自己再組一次就是第二份實作。
    getClinics(),
    getClinicNap(),
  ])

  const section = (key: string): HomeSection | undefined =>
    sections.find((s) => s.sectionKey === key && s.isEnabled)
  const itemsOf = (key: string) =>
    section(key)?.items.slice().sort((a, b) => a.sortOrder - b.sortOrder) ?? []

  /**
   * 版位設定（目前只有 hero 的輪播圖；八大專科入口 2026-10-01 起改讀 items）。
   *
   * 🔴 **形狀不對就當成沒有，不要讓整個首頁掛掉。**
   *    `settings` 是資料庫裡的自由 JSON 欄位，後台寫得動它。2026-09-17 正式站
   *    真的發生過：舊版後台的「儲存草稿」把 hero 的陣列壓成
   *    `{"0":…,"1":…,eyebrow:…}`、把 specialties 清成 null，接著有人按了發布，
   *    於是 `(settings ?? []).map(...)` 當場丟
   *    `((intermediate value) ?? []).map is not a function` —— **整個首頁 500**，
   *    而其餘每一頁都好好的。
   *
   *    ⚠️ 一個裝飾性版位的資料壞掉，代價不該是整站門面回 5xx。這與 CLAUDE.md
   *    決策 14「主體內容拿不到 → 503」不衝突：那條講的是**取不到**，
   *    這裡是**取到了但形狀不對**，而且是裝飾性版位。
   *    ⚠️ 仍然要在伺服器日誌留下痕跡 —— 靜默回空陣列會讓「首頁少一區」變成
   *    沒有人查得到原因的謎題。
   */
  const settingsArrayOf = (key: string): unknown[] => {
    const raw = section(key)?.settings
    if (raw === null || raw === undefined) return []
    if (Array.isArray(raw)) return raw
    console.error(
      `[home] 版位「${key}」的 settings 不是陣列（${typeof raw}），這一區略過不渲染。`
      + ' 多半是後台的版位設定被寫壞了，需要還原首頁那筆 Page 的舊版本快照再重新發布。',
    )
    return []
  }

  // 「最新文章」版位引用的那幾篇。⚠️ 只取被引用的，不是全部 1100 篇。
  const articleItems = itemsOf('latest-articles')
  const articles = await recordsByIds(articleItems.map((i) => i.contentItemId))

  const heroSlides: HeroSlide[] =
    (settingsArrayOf('hero') as { image: unknown, caption: string }[]).map((s) => {
      const i = img(s.image)
      return {
        imagePath: i?.src ?? '',
        imageWidth: i?.width ?? 0,
        imageHeight: i?.height ?? 0,
        alt: i?.alt ?? '',
        caption: s.caption,
      }
    })

  // 🔴 **八大專科入口＝全部困擾，自動列出**（2026-10-01，與醫師、據點同一條，決策 30）。
  //    在此之前讀的是版位 `settings` 裡手打的八列（標題＋slug＋網址＋圖示）——
  //    那八列就是全部 8 個困擾、順序也一樣，等於困擾的名稱與網址在資料庫裡有第二份，
  //    而且後台改不到。現在名單與順序跟著「困擾」清單走（`PublicContentHandler.AutoSections`）。
  // ⚠️ 圖示是版面素材（決策 14），與困擾總覽頁同一份對照表；查不到就是空字串，
  //    模板用 `v-if` 跳過 —— **不退回某一張預設圖**（理由見 `concernIconFor`）。
  const specialties: SpecialtyEntry[] = itemsOf('specialties').map((item) => {
    const icon = concernIconFor(item.slug ?? '', item.title)
    return {
      title: item.title,
      slug: item.slug ?? '',
      urlPath: item.urlPath ?? '#',
      imagePath: icon?.src ?? '',
      // 首頁的圖示是 46×46（mockup/index.html），困擾總覽頁是 64×64 —— 同一張圖、不同顯示尺寸。
      iconWidth: 46,
      iconHeight: 46,
    }
  })

  const featuredTreatments: FeaturedTreatment[] = itemsOf('featured-treatments').map((item) => {
    const t = treatments.find((x) => x.id === item.contentItemId)
    const category = terms.find((c) => c.id === t?.fields.categoryTermId)
    const cover = img(t?.fields.cover)
    return {
      title: item.title,
      categoryLabel: category?.title ?? '',
      categorySlug: (category?.slug as string) ?? '',
      slug: (item.slug as string) ?? '',
      urlPath: item.urlPath ?? '#',
      imagePath: cover?.src ?? '',
      imageWidth: cover?.width ?? 0,
      imageHeight: cover?.height ?? 0,
      alt: cover?.alt ?? item.title,
    }
  })

  const latestArticles: LatestArticle[] = articleItems.map((item) => {
    const a = articles.find((x) => x.id === item.contentItemId)
    const category = terms.find((c) => c.id === a?.fields.categoryTermId)
    const cover = img(a?.fields.cover)
    return {
      title: item.title,
      categoryLabel: category?.title ?? '',
      categorySlug: (category?.slug as string) ?? '',
      urlPath: item.urlPath ?? '#',
      summary: a?.summary ?? '',
      imagePath: cover?.src ?? '',
      imageWidth: cover?.width ?? 0,
      imageHeight: cover?.height ?? 0,
      alt: cover?.alt ?? item.title,
      authorLabel: doctors.find((d) => d.id === a?.fields.authorDoctorId)?.title
        ?? ((a?.fields.authorName as string) ?? ''),
      displayDate: String(a?.fields.displayDate ?? '').slice(0, 10).replace(/-/g, '.'),
      readingMinutes: (a?.fields.readingMinutes as number) ?? 0,
    }
  })

  const featuredDoctors: HomeDoctor[] = itemsOf('doctors').map((item) => {
    const d = doctors.find((x) => x.id === item.contentItemId)
    const photo = img(d?.fields.photo)
    return {
      name: item.title,
      jobTitle: (d?.fields.jobTitle as string) ?? '',
      isPhysician: Boolean(d?.fields.isPhysician),
      urlPath: item.urlPath ?? '#',
      photoPath: photo?.src ?? '',
      photoWidth: photo?.width ?? 0,
      photoHeight: photo?.height ?? 0,
    }
  })

  const homeClinics: HomeClinic[] = itemsOf('clinics').map((item) => {
    // ⚠️ `Clinic` 是**前台的形狀**（clinics.ts），沒有帶資料庫 id —— 但它有 slug，
    //    而版位項目也帶 slug，所以比對 slug。
    // 🔴 **不要退回用 `item.title` 比名稱**：標題是院方改得動的欄位，一改就比不到，
    //    而症狀是首頁那張據點卡的電話、地址、看診時段**整組變空**，沒有任何錯誤訊息。
    const c = clinics.find((x) => x.slug === item.slug) ?? clinics.find((x) => x.name === item.title)
    // NAP 與據點頁同一個來源（據點內容，見 navigation.ts 的 getClinicNap），一樣比 slug。
    const n = nap.find((x) => x.slug === item.slug)
    return {
      name: c?.name ?? item.title,
      urlPath: item.urlPath ?? '#',
      phone: c?.phone ?? n?.phone ?? '',
      address: c?.address ?? n?.address ?? '',
      hoursRows: c?.hoursTable ?? [],
      hoursFootnote: c?.hoursFootnote ?? '',
    }
  })

  // 主視覺以下六個版位要渲染哪幾個、什麼順序（index.vue 的 SECTION_ORDER）。
  // 🔴 `isEnabled=false` 的版位**整區不渲染**，不是渲染一個只剩標題的空殼。
  // ⚠️ 資料裡沒有的版位當成「開著、排在預設位置」—— 快照壞掉時首頁至少長得跟 mockup 一樣，
  //    而不是只剩一個主視覺。
  const sectionOrder: string[] = ORDERABLE_SECTIONS
    .map((key, index) => ({ key, row: sections.find((s) => s.sectionKey === key), index }))
    .filter(({ row }) => row?.isEnabled ?? true)
    .sort((a, b) => (a.row?.sortOrder ?? a.index) - (b.row?.sortOrder ?? b.index) || a.index - b.index)
    .map(({ key }) => key)

  return { heroSlides, specialties, featuredTreatments, latestArticles, featuredDoctors, homeClinics, sectionOrder }
}

export const HOURS_WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const
