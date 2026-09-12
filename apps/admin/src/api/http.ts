// 後台唯一的 HTTP 出口。src/api/ 底下每一支模組都經過這裡，畫面元件不直接碰 fetch。
//
// docs/10-api.md §2 的契約在這裡落地：
//   - 位址 `https://api.20skin.tw/api/v1/...`（`routePrefix` 已含在 base 裡）
//   - 請求與回應一律 camelCase、一律 JSON
//   - 回應一律是統一信封，**不回裸 data** —— 拆信封是這一層的工作，
//     上層拿到的就是 `data`，拿不到就是丟 ApiError
//   - 前端一律以 `code` 分支，**不得比對 message 字串**
//
// ⚠️ 這一層不做任何權限判斷。畫面上的 hasPermission() 只管「按鈕要不要出現」，
//    擋得住的授權在 API 的 AppRouter（docs/11 §5.3，預設拒絕）。

import { ApiError, NETWORK_ERROR_CODE } from './errors'

// ── 位址 ──────────────────────────────────────────────────────────────
//
// ⚠️ 後台與 API **不同網域**（docs/10 §2、docs/07 §1）：後台在 20skin.tw/admin/，
//    API 在 api.20skin.tw。所以這裡一定是絕對網址，不能寫成 '/api/v1' ——
//    寫成相對路徑會打到 SWA 自己的 /api（那裡只有 fallback 一支，見 CLAUDE.md 決策 7）。
const DEFAULT_BASE = 'https://api.20skin.tw/api/v1'

export const API_BASE: string = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') || DEFAULT_BASE

// ── 信封 ──────────────────────────────────────────────────────────────

interface Envelope<T> {
  success: boolean
  code: string | null
  data: T | null
  message: string | null
  errors: string[] | null
  timestamp: string
}

// ── 憑證 ──────────────────────────────────────────────────────────────
//
// 🔴 docs/09-frontend.md §8：「access token 只放記憶體，refresh 走端點。放
//    localStorage 等於把 token 交給任何一次 XSS」。
//
// ⚠️ refresh token **也只放記憶體**，這不是漏做。正常作法是把它放 httpOnly cookie，
//    但本專案明文決定**不使用跨來源 cookie**（docs/07 §1），而後台與 API 不同網域 ——
//    cookie 這條路從架構上就被關掉了。連帶後果：**重新整理分頁就會登出**。
//    這是已知且刻意的取捨，不要為了「使用者體驗」把任何一個 token 寫進
//    localStorage／sessionStorage —— 後台的唯一憑證就是帳密（CLAUDE.md 決策 10：
//    IP 白名單不做、雙因素不做），token 外洩沒有第二道防線接得住。

interface Tokens {
  accessToken: string
  refreshToken: string
}

let tokens: Tokens | null = null

/** 憑證失效時通知外層（auth.ts 用它把畫面導回登入頁）。 */
let onSessionLost: (() => void) | null = null

export function setTokens(next: Tokens | null) {
  tokens = next
}

export function hasTokens(): boolean {
  return tokens !== null
}

export function onSessionExpired(handler: () => void) {
  onSessionLost = handler
}

// ── 換發 ──────────────────────────────────────────────────────────────
//
// ⚠️ 併發時只能換一次。後端的 refresh 是**輪替制**（docs/10 §3.2、§5：撤銷重用即
//    撤銷該使用者全部 token）—— 三個請求同時 401 各自去換發，第二、三個會拿著
//    已經被輪替掉的舊 token，後端判定為「重用」，整個使用者的 token 全部被撤銷，
//    使用者當場被踢出去。所以這裡用一個共用的 Promise 收斂成一次。
let refreshInFlight: Promise<boolean> | null = null

async function refreshTokens(): Promise<boolean> {
  if (!tokens) return false

  refreshInFlight ??= (async () => {
    try {
      const res = await rawFetch('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: tokens!.refreshToken }),
      })
      const envelope = (await res.json()) as Envelope<{ accessToken: string; refreshToken: string }>
      if (!res.ok || !envelope.success || !envelope.data) return false
      tokens = { accessToken: envelope.data.accessToken, refreshToken: envelope.data.refreshToken }
      return true
    } catch {
      return false
    } finally {
      // 下一次 401 要能重新換發，不能永遠卡在這一顆 Promise 上。
      queueMicrotask(() => {
        refreshInFlight = null
      })
    }
  })()

  return refreshInFlight
}

// ── 送出 ──────────────────────────────────────────────────────────────

async function rawFetch(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (init.auth && tokens) {
    headers.set('Authorization', `Bearer ${tokens.accessToken}`)
  }

  try {
    return await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      // ⚠️ 不帶 cookie（docs/07 §1「不使用跨來源 cookie」）。憑證一律走 Authorization 標頭。
      credentials: 'omit',
    })
  } catch {
    throw new ApiError(
      NETWORK_ERROR_CODE,
      `連不上 ${API_BASE}。可能是網路中斷，也可能是 API 的 CORS 沒有放行這個來源 —— 瀏覽器對這兩種情況給的錯誤一模一樣，請一併檢查（docs/10 §2）。`,
    )
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | boolean | null | undefined>
  /** 預設帶 Bearer。只有登入／換發這類「本身就是在取得憑證」的端點要關掉。 */
  auth?: boolean
}

function buildQuery(query: RequestOptions['query']): string {
  if (!query) return ''
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === '') continue
    params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

async function parseEnvelope<T>(res: Response): Promise<Envelope<T>> {
  try {
    return (await res.json()) as Envelope<T>
  } catch {
    // 502／504 這類由平台（而非我們的 Function）產生的回應不是 JSON。
    return {
      success: false,
      code: res.status >= 500 ? 'INTERNAL' : 'NOT_FOUND',
      data: null,
      message: `API 回應不是預期的格式（HTTP ${res.status}）。`,
      errors: [],
      timestamp: new Date().toISOString(),
    }
  }
}

/**
 * 送出一次請求，回傳信封裡的 `data`。
 *
 * ⚠️ 401 只會自動換發並重試**一次**。換發也失敗就拋 AUTH_TOKEN_INVALID 並通知外層登出 ——
 * 不要改成無限重試，那會在 token 真的失效時把使用者卡在一個不斷打 API 的白畫面裡。
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, auth = true } = options
  const url = `${path}${buildQuery(query)}`
  const init: RequestInit & { auth?: boolean } = {
    method,
    auth,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }

  let res = await rawFetch(url, init)

  if (res.status === 401 && auth && tokens) {
    const refreshed = await refreshTokens()
    if (refreshed) {
      res = await rawFetch(url, init)
    } else {
      tokens = null
      onSessionLost?.()
      throw new ApiError('AUTH_TOKEN_INVALID', '登入已逾期，請重新登入。', [], 401)
    }
  }

  const envelope = await parseEnvelope<T>(res)

  if (!res.ok || !envelope.success) {
    throw new ApiError(
      envelope.code ?? 'INTERNAL',
      envelope.message ?? `請求失敗（HTTP ${res.status}）。`,
      envelope.errors ?? [],
      res.status,
    )
  }

  // ⚠️ `data` 可以合法地是 null（DELETE 這類沒有回傳值的端點）。
  //    不要在這裡把 null 當成錯誤。
  return envelope.data as T
}

/**
 * 分頁回應。docs/10 §2 的雙模式：帶分頁參數時 `data` 是
 * `{ items, totalCount, page, pageSize, totalPages }`，不帶時是平面陣列。
 * 這裡把兩種都收成前者，讓呼叫端不必分辨。
 */
export interface ServerPaged<T> {
  items: T[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}

export function normalizePaged<T>(data: ServerPaged<T> | T[] | null): ServerPaged<T> {
  if (Array.isArray(data)) {
    return { items: data, totalCount: data.length, page: 1, pageSize: data.length, totalPages: 1 }
  }
  if (!data) return { items: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 1 }
  return data
}

/** docs/10 §2：pageSize 上限 100。⚠️ 這不是保守估計，是硬上限 —— 後端會拒絕更大的值。 */
export const MAX_PAGE_SIZE = 100

export function clampPageSize(pageSize: number | undefined): number {
  return Math.min(MAX_PAGE_SIZE, Math.max(1, pageSize ?? 20))
}

/**
 * 把一支分頁端點整份抓回來（下拉選單、一致性檢查這類需要全量的畫面用）。
 *
 * ⚠️ 存在的理由正是 docs/10 §2 那句警告：「一個 `pageSize=99999` 就能拖垮 API 與資料庫」。
 * 後端把上限壓在 100，前端要全量就得自己翻頁。**不要為了少寫這幾行而去調高後端上限。**
 * ⚠️ 有 800 篇文章的單元請不要呼叫這支 —— 那是 8 趟往返。
 */
export async function fetchAllPages<T>(
  fetchPage: (page: number, pageSize: number) => Promise<ServerPaged<T>>,
  hardLimit = 2000,
): Promise<T[]> {
  const all: T[] = []
  let page = 1
  for (;;) {
    const result = await fetchPage(page, MAX_PAGE_SIZE)
    all.push(...result.items)
    if (all.length >= hardLimit) break
    if (page >= result.totalPages || result.items.length === 0) break
    page += 1
  }
  return all
}
