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

async function fetchEnvelope<T>(
  path: string,
  query: Record<string, string | number | undefined>,
): Promise<FetchOutcome<T>> {
  const base = useRuntimeConfig().public.apiBaseUrl

  try {
    const envelope = await $fetch<Envelope<T>>(base + path, {
      query: Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined)),
      headers: { Accept: 'application/json' },
      // ⚠️ 逾時要短。這是**使用者正在等**的請求，不是背景工作 ——
      //    後端沒回應時，快點算繪出空狀態，好過讓訪客盯著白畫面等 30 秒。
      timeout: 8000,
      retry: 1,
    })
    return { ok: true, data: envelope.success ? (envelope.data ?? null) : null }
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
export async function unitRecords(unit: string): Promise<ContentRecord[]> {
  const outcome = await fetchEnvelope<ContentRecord[]>(`/${unit}`, {})
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
export const articlePage = (
  page = 1,
  pageSize = 12,
  opts: { authorDoctorId?: number, latest?: boolean } = {},
) =>
  apiGet<PagedContent>('/article', {
    page,
    pageSize,
    authorDoctorId: opts.authorDoctorId,
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
 * 依 id 批次取（含內文）。
 *
 * ⚠️ 給「關聯目標需要的欄位不只標題」的情況用 —— 療程卡片要顯示關聯文章的封面與
 *    日期，而 `relations[]` 只帶 slug／title／urlPath。文章 1100 筆，不可能為了
 *    11 筆關聯把整批載回來。
 * ⚠️ 找不到的 id 會被靜默略過（已下架的關聯目標是正常情況）。
 */
export const recordsByIds = (ids: number[]) =>
  ids.length === 0
    ? Promise.resolve<ContentRecord[]>([])
    : apiGet<ContentRecord[]>('/content/batch', { ids: ids.join(',') }).then((r) => r ?? [])

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

  const outcome = await fetchEnvelope<SearchHit[]>('/search', { q })
  return { ok: outcome.ok, hits: outcome.data ?? [] }
}
