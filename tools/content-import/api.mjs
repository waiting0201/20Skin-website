// 匯入用的 API 用戶端。
//
// 🔴 **匯入走真正的 API，不直寫 SQL。** docs/11 §8 警告過：遷移腳本產生的版本快照
//    必須與 API 產生的讀得通。與其在腳本裡重寫一份 BuildFieldsDict 並祈禱兩邊不分岔，
//    不如讓正式程式碼自己產生 —— 快照、UrlPath 計算、欄位驗證全部只有一份實作。
//    代價是幾百次 HTTP 往返，對百來筆內容完全不是問題。
//
// ⚠️ docs/07 §「已知差異」原本寫「800 篇匯入仍用本機腳本（Dapper 直寫）」。
//    本輪改走 API，理由同上。真要匯 800 篇時這個選擇仍成立（800 次請求而已）。

const ENVELOPE_FAIL = (r) => `${r.code ?? 'ERROR'}：${r.message ?? '未知錯誤'}`

export class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.token = null
  }

  async #send(method, path, body) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })

    const text = await res.text()
    let payload
    try {
      payload = JSON.parse(text)
    } catch {
      throw new Error(`${method} ${path} → HTTP ${res.status}，回應不是 JSON：${text.slice(0, 200)}`)
    }

    // ⚠️ 一律走統一信封（docs/10 §2）。HTTP 200 但 success=false 也是失敗。
    if (!res.ok || payload.success === false) {
      const detail = payload.errors?.length ? `｜${payload.errors.join('；')}` : ''
      throw new Error(`${method} ${path} → ${ENVELOPE_FAIL(payload)}${detail}`)
    }
    return payload.data
  }

  get = (p) => this.#send('GET', p)
  post = (p, b) => this.#send('POST', p, b)
  put = (p, b) => this.#send('PUT', p, b)

  /**
   * ⚠️ 種子帳號帶 MustChangePassword，登入**照發 token** 但除了改密碼以外全部 403
   * （docs/10 §3.2）。所以這裡遇到旗標就先把密碼換掉再重新登入 —— 匯入是一次性作業，
   * 不該要求人先手動去後台點一輪。
   */
  async login(userName, password, newPassword) {
    let data = await this.post('/auth/login', { userName, password })

    if (data.mustChangePassword) {
      if (!newPassword) throw new Error('帳號仍是首登狀態，需要提供新密碼才能繼續匯入。')
      this.token = data.accessToken
      await this.post('/auth/change-password', { currentPassword: password, newPassword })
      data = await this.post('/auth/login', { userName, password: newPassword })
    }

    this.token = data.accessToken
    return data
  }

  /** 取某個單元的全部內容，回傳 slug → 摘要。用來認出種子已經建好的資料列，不重複建。 */
  async indexBySlug(unit) {
    const map = new Map()
    for (let page = 1; ; page++) {
      const res = await this.get(`/admin/${unit}?page=${page}&pageSize=100`)
      for (const item of res.items) map.set(item.slug, item)
      if (page >= res.totalPages || res.items.length === 0) break
    }
    return map
  }

  /**
   * 建立或更新一筆內容，然後直接發布。
   *
   * ⚠️ 直接發布（`action: "publish"`）會寫一筆「直接發布」的版本快照並設定
   * PublishedVersionId —— 這正是建置期匯出要讀的那一版（docs/09 §3）。
   * 不發布的話前台匯出會看不到它。
   */
  async upsert(unit, slug, body, existing) {
    const item = existing
      ? await this.put(`/admin/${unit}/${existing.id}`, body)
      : await this.post(`/admin/${unit}`, { slug, ...body })
    return item
  }

  publish = (unit, id) => this.post(`/admin/${unit}/${id}/publish`, { action: 'publish' })
  seo = (unit, id, body) => this.put(`/admin/${unit}/${id}/seo`, body)
  relations = (unit, id, body) => this.put(`/admin/${unit}/${id}/relations`, body)
}
