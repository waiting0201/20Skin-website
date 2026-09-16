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
export async function apiGet<T>(
  path: string,
  query: Record<string, string | number | undefined> = {},
): Promise<T | null> {
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
    return envelope.success ? (envelope.data ?? null) : null
  }
  catch {
    return null
  }
}

/**
 * 某個單元的全部可見內容（不含內文）。
 * ⚠️ 文章不要用這一支 —— 它有 1100 筆，一定要分頁（{@link articlePage}）。
 */
export const unitRecords = (unit: string) =>
  apiGet<ContentRecord[]>(`/${unit}`).then((rows) => rows ?? [])

/** 文章列表（分頁）。拿不到時回空的一頁，而不是丟例外。 */
export const articlePage = (page = 1, pageSize = 12) =>
  apiGet<PagedContent>('/article', { page, pageSize })
    .then((r) => r ?? { items: [], page, pageSize, totalCount: 0 })

/**
 * 依網址取單筆（含內文）。
 *
 * ⚠️ **回 `null` 的意思是「這一頁不存在」，呼叫端應該 404。**
 *    連不上後端時也會是 `null` —— 兩者在這一層分不出來，這是刻意的取捨：
 *    真的要分，得讓 `apiGet` 把狀態碼透出來，而那會讓每一個呼叫端都得處理三種情況。
 *    代價是後端掛掉期間爬蟲會拿到 404 而不是 503。
 *    🔴 如果之後決定要區分，改這裡一個地方就好，不要在各頁自己 try/catch。
 */
export const contentByPath = (path: string) =>
  apiGet<ContentRecord>('/content', { path })

/** 舊網址解析。命中回 `{ toPath, statusCode }`，未命中或失敗回 `null`。 */
export const resolveRedirect = (path: string) =>
  apiGet<{ toPath: string, statusCode: number }>('/redirects/resolve', { path })
