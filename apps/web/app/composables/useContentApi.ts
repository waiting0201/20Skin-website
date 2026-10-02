import type { ContentRecord } from '~/data/_content'

/**
 * 內容 API（`api.20skin.tw`）的取值層。
 *
 * <p>
 * 🔴 **2026-09-15 起前台是執行期 SSR**：療程、文章、醫師這些資料不再於建置期烤進
 * HTML，而是算繪當下去拿 —— 院方按下發布，下一個請求就看得到。
 * </p>
 *
 * 作法取自姊妹專案 VicRound（`apps/web/lib/api.ts`），三個關鍵性質照抄：
 *
 * 1. **失敗回 `null`，絕不丟例外。** 後端掛掉時要能算繪出骨架，
 *    由呼叫端決定「列表顯示空狀態」還是「詳情頁 404」——
 *    而不是讓一個區塊的失敗變成整站 500。
 * 2. **信封在這一層就拆掉。** 呼叫端拿到的是 `data` 本身，
 *    不必每一頁各寫一次 `.data`，也就不會有人忘了檢查 `success`。
 * 3. **不做逐頁全站快照。** 每一頁只取自己要的那幾個單元 ——
 *    全部取回來是 11 MB，而且會整包進 hydration payload。
 */

/** API 的統一信封（docs/10 §2）。所有端點都回這個形狀，沒有裸 data。 */
interface Envelope<T> {
  success: boolean
  code: string | null
  data: T | null
  message: string
  errors: string[]
}

/** 文章列表這種分頁端點的回應。 */
export interface PagedContent {
  items: ContentRecord[]
  page: number
  pageSize: number
  totalCount: number
}

/**
 * 取一筆內容。**失敗一律回 `null`，不丟例外。**
 *
 * ⚠️ 這裡吞掉的是「拿不到資料」，不是「資料有問題」——
 *    呼叫端看到 `null` 只能解讀成「這次沒拿到」，不可以解讀成「這筆不存在」。
 *    要區分 404 與連不上，請用 {@link contentByPath}（它把 404 與失敗分開）。
 */
/**
 * 取值的結果。
 *
 * 🔴 **「查不到」與「拿不到」一定要分開。** 兩者都回 `null` 的話，內頁在 API 掛掉時
 *    會回 **404** —— 而那是個對搜尋引擎說「這一頁永久不存在」的訊號。
 *    2026-09-15 實測：把 API 停掉，`/clinics/siji/` 當場變成 404。
 *    API 掛十分鐘，Google 就會看到一批 404。正確的行為是 5xx（暫時性錯誤）。
 */
type FetchOutcome<T> =
  /** 拿到了（`data` 可能是 null，代表端點明確說「沒有這一筆」）。 */
  | { ok: true, data: T | null }
  /** 沒拿到：連不上、逾時、5xx。**這不代表資料不存在。** */
  | { ok: false, data: null }

/** payload 裡放 SSR 取值結果的那一格。 */
const PAYLOAD_KEY = '$contentApi'

type Query = Record<string, string | number | undefined>

/** 同一組 path＋query 一定得到同一個鍵（參數順序不影響）。 */
function requestKey(path: string, query: Query): string {
  const qs = Object.entries(query)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  return qs ? `${path}?${qs}` : path
}

/**
 * 🔴 **SSR 拿到的結果要交給瀏覽器，hydration 時不可以再打一次 API。**
 *
 * 頁面是在 setup 最上層直接 `await getClinics()` 這類函式，沒有包 `useAsyncData` ——
 * 所以 hydration 時 setup 會在瀏覽器裡整個重跑一次。2026-10-02 之前這一層照樣打 API，
 * 三個後果（STATUS.md「2026-10-02」）：
 *   1. 每一次瀏覽都是兩倍的 API／SQL 負載；
 *   2. **瀏覽器那一輪失敗，算繪好的頁面會被換成 503 錯誤頁並帶上 `noindex`** ——
 *      CORS 白名單少了一個來源、或 API 逾時一次，Googlebot（會執行 JS）看到的就是那一頁；
 *   3. 瀏覽器那一輪會吃到公開端點的 `max-age=300`。
 *
 * 作法：伺服器端把**成功的**回應寫進 `payload.data`，瀏覽器在 hydration 期間
 * 同一個鍵就直接讀 payload。hydration 結束之後（站內換頁）照常打 API。
 *
 * ⚠️ payload 只會有這一頁 SSR 時真的取過的東西 —— 這一層本來就「每一頁只取自己要的」
 *    （見檔頭第 3 點），所以不會變成全站快照。
 * ⚠️ 已經用 `useAsyncData` 包住的呼叫（站內搜尋）要傳 `hydrate: false`，
 *    否則同一份資料會在 payload 裡出現兩次。
 * ⚠️ 失敗不寫進 payload：伺服器那一輪失敗的話，頁面早就是 503 或降級版了。
 */
async function fetchEnvelope<T>(
  path: string,
  query: Query,
  opts: { hydrate?: boolean, omitFields?: string[], lite?: boolean } = {},
): Promise<FetchOutcome<T>> {
  // ⚠️ 兩個 composable 都要在第一個 await 之前取 —— 之後 Nuxt 的 context 可能已經不在了。
  const nuxtApp = useNuxtApp()
  const base = useRuntimeConfig().public.apiBaseUrl
  const hydrate = opts.hydrate !== false
  // 🔴 瘦身方式要算進鍵裡：同一個 `/page`，頁尾要精簡版、`/about/` 要完整版 ——
  //    共用一個鍵的話，hydration 會讓 `/about/` 讀到精簡版，整區靜默消失。
  const shape = opts.lite ? '#lite' : opts.omitFields?.length ? `#-${opts.omitFields.join(',')}` : ''
  const key = requestKey(path, query) + shape
  const store = (nuxtApp.payload.data[PAYLOAD_KEY] ??= {}) as Record<string, unknown>

  if (import.meta.client) {
    if (hydrate && nuxtApp.isHydrating && key in store) {
      return { ok: true, data: store[key] as T | null }
    }
    return requestEnvelope<T>(base, path, query, opts)
  }

  // 伺服器端：同一個請求內同一個鍵只真的打一次（例如文章內頁的標頭與內文取的是同一筆）。
  // ⚠️ 掛在 nuxtApp 上＝每個請求一份；掛在模組層級會變成跨請求共用（決策 14）。
  const app = nuxtApp as unknown as { _contentApiInflight?: Map<string, Promise<FetchOutcome<unknown>>> }
  app._contentApiInflight ??= new Map()
  const inflight = app._contentApiInflight.get(key)
  if (inflight) return inflight as Promise<FetchOutcome<T>>

  const pending = requestEnvelope<T>(base, path, query, opts).then((outcome) => {
    if (hydrate && outcome.ok) store[key] = outcome.data
    return outcome
  })
  app._contentApiInflight.set(key, pending)
  return pending
}

/** 前台一個地方都沒讀的頂層欄位。 */
const UNUSED_RECORD_KEYS = ['ownerUserId', 'homeSections']
/** `seo` 裡前台沒讀的欄位（後台的稽核資訊）。 */
const UNUSED_SEO_KEYS = ['updatedByUserId', 'updatedAt']

function dropNulls(obj: Record<string, unknown>, drop: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && !drop.includes(k)) out[k] = v
  }
  return out
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function slimRecord(r: Record<string, unknown>, omitFields: string[]): Record<string, unknown> {
  if (!('fields' in r)) return r
  const out: Record<string, unknown> = { ...r }
  for (const k of UNUSED_RECORD_KEYS) delete out[k]
  if (isRecord(r.seo)) out.seo = dropNulls(r.seo, UNUSED_SEO_KEYS)
  if (isRecord(r.fields)) out.fields = dropNulls(r.fields, omitFields)
  if (Array.isArray(r.relations)) {
    out.relations = r.relations.map((x) => (isRecord(x) ? dropNulls(x) : x))
  }
  return out
}

/**
 * 🔴 **內容紀錄進 payload 之前先瘦身**（2026-10-02）。
 *
 * SSR 結果整包進 payload 之後，首頁 HTML 由 gzip 8 KB 長到 116 KB —— 大頭是 `/term`
 * （406 筆、211 KB，其中 393 筆是標籤），而它幾乎每一頁都要載。空間主要被
 * 每一筆都帶著、多半是 null 的 `seo` 區塊吃掉。
 *
 * 規則刻意保守：只拿掉 `seo`／`fields`／`relations[]` **第一層**值為 null 的屬性，
 * 加上前台沒讀的幾個欄位；不遞迴進區塊 JSON，頂層的 null（`slug`、`summary`…）也不動。
 * 前台讀這些欄位一律是 `?? 預設值`／`!= null`，null 與「沒有這個鍵」是同一件事。
 *
 * 🔴 **伺服器端算繪用的也是瘦過的這一份**，不是只有 payload —— 兩邊吃同一份資料，
 *    hydration 的一致性靠構造保證，而不是靠「每個讀取點都恰好把 null 與 undefined 當成一樣」。
 *    ⚠️ 新增讀取點時若要區分「明確是 null」，要用 `== null`，不可以用 `=== null`。
 */
function slim<T>(data: T, omitFields: string[] = []): T {
  if (Array.isArray(data)) return data.map((x) => (isRecord(x) ? slimRecord(x, omitFields) : x)) as T
  if (isRecord(data)) {
    if (Array.isArray(data.items)) return { ...data, items: slim(data.items, omitFields) } as T
    return slimRecord(data, omitFields) as T
  }
  return data
}

/** 只留連結需要的欄位（標題、網址）。給頁尾這種只畫連結的地方用。 */
const LITE_KEYS = ['id', 'unit', 'slug', 'urlPath', 'title', 'sortOrder']

function shapeData<T>(data: T, opts: { omitFields?: string[], lite?: boolean }): T {
  if (opts.lite && Array.isArray(data)) {
    return data.map((x) => {
      if (!isRecord(x)) return x
      const out: Record<string, unknown> = Object.fromEntries(LITE_KEYS.filter((k) => k in x).map((k) => [k, x[k]]))
      // 分類與標籤要靠 termType 分辨（slug 會跨型別撞名，見 `termBy`），這一欄留著。
      if (isRecord(x.fields) && x.fields.termType !== undefined) out.fields = { termType: x.fields.termType }
      return out
    }) as T
  }
  return slim(data, opts.omitFields ?? [])
}

async function requestEnvelope<T>(
  base: string,
  path: string,
  query: Query,
  opts: { omitFields?: string[], lite?: boolean } = {},
): Promise<FetchOutcome<T>> {
  try {
    const envelope = await $fetch<Envelope<T>>(base + path, {
      query: Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined)),
      headers: { Accept: 'application/json' },
      // ⚠️ 逾時要短。這是**使用者正在等**的請求，不是背景工作 ——
      //    後端沒回應時，快點算繪出空狀態，好過讓訪客盯著白畫面等 30 秒。
      timeout: 8000,
      retry: 1,
    })
    return { ok: true, data: envelope.success ? shapeData(envelope.data ?? null, opts) : null }
  }
  catch (error) {
    // 404 是「後端明確說沒有這一筆」，不是故障 —— 要與連不上分開。
    const status = (error as { status?: number, statusCode?: number })?.status
      ?? (error as { statusCode?: number })?.statusCode
    if (status === 404) return { ok: true, data: null }
    return { ok: false, data: null }
  }
}

/**
 * 取一筆內容。**失敗一律回 `null`，不丟例外。**
 *
 * ⚠️ 給「拿不到就顯示空狀態」的地方用（列表、側欄、選單）。
 *    內頁請用 {@link contentByPath} —— 它會把「拿不到」表達成 5xx 而不是 404。
 */
export async function apiGet<T>(
  path: string,
  query: Record<string, string | number | undefined> = {},
): Promise<T | null> {
  return (await fetchEnvelope<T>(path, query)).data
}

/**
 * 某個單元的全部可見內容（不含內文）。
 *
 * 🔴 **連不上時丟 503，不是回空陣列。**
 *    這是「頁面的主體內容」—— 拿不到就算繪不出這一頁。回 200 配一個空畫面更糟：
 *    Google 可能把那個空殼收進索引，而且訪客看到的是一個看起來正常、
 *    卻什麼都沒有的網站。5xx 才是「暫時出問題，晚點再來」的正確表達。
 *    2026-09-15 實測過反面：`unitRecords` 回空陣列時，`/clinics/siji/` 變成 **404**
 *    （因為 `find()` 找不到），而 404 對 Google 是「永久不存在」。
 *
 * ⚠️ **空結果不算失敗。** 端點正常回應但沒有資料（例如某個分類還沒有內容）
 *    照樣回空陣列 —— 那是內容狀態，不是故障。
 *
 * ⚠️ 裝飾性的資料（選單、熱門標籤、全站設定）不走這條規則，它們拿不到就降級。
 *
 * ⚠️ 文章不要用這一支 —— 它有 1100 筆，一定要分頁（{@link articlePage}）。
 */
export async function unitRecords(unit: string, query: Query = {}): Promise<ContentRecord[]> {
  const outcome = await fetchEnvelope<ContentRecord[]>(`/${unit}`, query)
  if (!outcome.ok) {
    throw createError({
      statusCode: 503,
      statusMessage: '內容服務暫時無法連線',
      fatal: true,
    })
  }
  return outcome.data ?? []
}

/**
 * 文章列表（分頁）。拿不到時回空的一頁，而不是丟例外。
 *
 * ⚠️ `authorDoctorId` 一定要交給 API 篩 —— 撈回 1100 筆再用前端過濾，
 *    等於每次開醫師個人頁都傳 2.3 MB。
 */
/**
 * 文章列表的一頁。
 *
 * 🔴 **`opts` 每加一個篩選條件，下面的 query 也要跟著加。**
 *    2026-09-16 踩過：`categoryTermId` 與 `tagTermId` 有人從 `data/articles.ts` 傳進來，
 *    但這裡的型別沒宣告、query 也沒帶 —— 參數就這樣被默默丟掉，
 *    結果是 **4 個分類頁與 393 個標籤頁全部顯示未篩選的全站文章列表**
 *    （每一頁都是 1111 篇、93 頁分頁器），而畫面看起來完全正常。
 *    ⚠️ 這個專案沒有跑 tsc，型別的多餘屬性檢查擋不到它 —— 是 `verify:links`
 *    爬出 `/blog/tag/{每一個標籤}/page/93/` 這種網址才露出馬腳。
 */
export const articlePage = (
  page = 1,
  pageSize = 12,
  opts: {
    authorDoctorId?: number
    latest?: boolean
    categoryTermId?: number
    tagTermId?: number
  } = {},
) =>
  apiGet<PagedContent>('/article', {
    page,
    pageSize,
    authorDoctorId: opts.authorDoctorId,
    categoryTermId: opts.categoryTermId,
    tagTermId: opts.tagTermId,
    sort: opts.latest ? 'latest' : undefined,
  }).then((r) => r ?? { items: [], page, pageSize, totalCount: 0 })

/**
 * 依網址取單筆（含內文）。
 *
 * ⚠️ **回 `null` 的意思是「這一頁不存在」，呼叫端應該 404。**
 *    連不上後端時也會是 `null` —— 兩者在這一層分不出來，這是刻意的取捨：
 *    真的要分，得讓 `apiGet` 把狀態碼透出來，而那會讓每一個呼叫端都得處理三種情況。
 *    代價是後端掛掉期間爬蟲會拿到 404 而不是 503。
 *    🔴 如果之後決定要區分，改這裡一個地方就好，不要在各頁自己 try/catch。
 */
/**
 * 內頁專用：依網址取一筆，**「拿不到」與「查不到」分開表達**。
 *
 * - 後端說沒有這一筆 → 回 `null`，呼叫端應該 404（那一頁真的不存在）
 * - 連不上／逾時／5xx → **丟 503**，呼叫端不必處理
 *
 * 🔴 這個區分是 SEO 的必要條件，不是潔癖：把「後端暫時掛掉」講成 404，
 *    等於對 Google 說這一頁永久消失了。
 */
export async function contentByPath(path: string): Promise<ContentRecord | null> {
  const outcome = await fetchEnvelope<ContentRecord>('/content', { path })
  if (!outcome.ok) {
    throw createError({
      statusCode: 503,
      statusMessage: '內容服務暫時無法連線',
      fatal: true,
    })
  }
  return outcome.data
}

/**
 * 依 id 批次取（**不含內文**）。
 *
 * ⚠️ 給「關聯目標需要的欄位不只標題」的情況用 —— 療程卡片要顯示關聯文章的封面與
 *    日期，而 `relations[]` 只帶 slug／title／urlPath。文章 1100 筆，不可能為了
 *    11 筆關聯把整批載回來。
 * ⚠️ 找不到的 id 會被靜默略過（已下架的關聯目標是正常情況）。
 */
/**
 * 🔴 **`bodyBlocks` 在這一層就丟掉**（2026-10-02）：三個呼叫端（首頁最新文章、療程與困擾的
 *    關聯文章）都只畫卡片，而端點回的是整篇內文 —— 首頁那 11 篇在 payload 裡佔 94 KB，
 *    比其餘所有資料加起來還多。真的要內文的地方請用 `contentByPath()`。
 */
export const recordsByIds = (ids: number[]) =>
  ids.length === 0
    ? Promise.resolve<ContentRecord[]>([])
    : fetchEnvelope<ContentRecord[]>('/content/batch', { ids: ids.join(',') }, { omitFields: ['bodyBlocks'] })
        .then((r) => r.data ?? [])

/**
 * 某個單元的**精簡清單**：每筆只有 id／slug／urlPath／title／sortOrder（分類與標籤另帶
 * `fields.termType`），沒有其餘 fields 與 seo。
 * 取不到回空陣列（給頁尾這種裝飾性的地方用，拿不到就降級）。
 *
 * ⚠️ 要畫內容的地方不要用它 —— 拿到的紀錄 `fields` 是 undefined。
 */
export type IndexRecord = Pick<ContentRecord, 'id' | 'unit' | 'slug' | 'urlPath' | 'title' | 'sortOrder'>
  & { fields?: { termType?: number } }

export const unitIndex = (unit: string, query: Query = {}) =>
  fetchEnvelope<IndexRecord[]>(`/${unit}`, query, { lite: true })
    .then((r) => r.data ?? [])

/** 首頁的七個版位（已核准快照）。取不到回空陣列。 */
export const homeSections = () =>
  apiGet<unknown[]>('/home').then((r) => r ?? [])

/** 導覽選單與頁尾。取不到回空的兩區。 */
export const siteMenu = () =>
  apiGet<{ main: unknown[], footer: unknown[] }>('/menu').then((r) => r ?? { main: [], footer: [] })

/** 舊網址解析。命中回 `{ toPath, statusCode }`，未命中或失敗回 `null`。 */
export const resolveRedirect = (path: string) =>
  apiGet<{ toPath: string, statusCode: number }>('/redirects/resolve', { path })

/** 搜尋命中的一筆。欄位名沿用舊靜態索引的縮寫，前端樣板不用跟著改。 */
export interface SearchHit {
  /** 型別標籤（療程／文章／常見問題…） */
  t: string
  /** 網址 */
  u: string
  /** 標題 */
  ti: string
  /** 摘要 */
  ex: string
  /** 縮圖（已核准快照裡的代表圖）。案例、FAQ、頁面一律沒有 —— 理由見 SearchHandler.ThumbOf。 */
  im?: { u: string; w: number; h: number } | null
}

/**
 * 站內搜尋。
 *
 * 🔴 **回傳保留「查無結果」與「連不上」的區別，不要簡化成一個陣列。**
 *    兩者在這一頁會觸發完全不同的行為：查無結果要把這句查詢回寫題庫
 *    （`POST /questions/miss`，那是內容團隊的工作清單），連不上則**絕對不能回寫** ——
 *    否則 API 掛掉的那段時間，每一次搜尋都會變成一筆假的「使用者問了我們答不出來的問題」，
 *    而題庫的去重會讓這些假資料留下來。
 *
 * ⚠️ 空字串不打 API。
 */
export async function searchSite(keyword: string): Promise<{ ok: boolean, hits: SearchHit[] }> {
  const q = keyword.trim()
  if (!q) return { ok: true, hits: [] }

  // 已經包在 search.vue 的 useAsyncData 裡，由它負責 hydration。
  const outcome = await fetchEnvelope<SearchHit[]>('/search', { q }, { hydrate: false })
  return { ok: outcome.ok, hits: outcome.data ?? [] }
}
