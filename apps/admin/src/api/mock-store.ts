// 後台 mock 的小型持久化工具。
//
// 九個內容模型的 mock 共用 client.ts 裡那一個 `Db` 物件；**第二輪的系統類畫面
// （301／未命中題目／全站設定／選單／首頁版位／帳號／角色）各自用這支開一份獨立的 store**。
//
// 為什麼不塞進同一個 Db：那個介面每加一個集合就要動 client.ts，而這些畫面是平行開發的，
// 集中在一個檔案只會互相踩。正式站沒有這個問題 —— 真正的資料層是 SQL，
// 一張表就是一張表（docs/08-database.md），這裡的切分只存在於 mock。
//
// ⚠️ 這不是設計模式，是 mock 的權宜。接上 api.20skin.tw 時整個 src/api/ 換掉，
//    上層畫面只認 client.ts 匯出的門面，不會知道差別（docs/09-frontend.md §8）。

const PREFIX = '20skin-admin-mock'

export interface MockStore<T> {
  read(): T
  write(next: T): void
  /** 改一份可變的副本並寫回，回傳改完的值。 */
  mutate<R>(fn: (draft: T) => R): R
  /** 清掉本機資料，下次 read() 會重新種子。 */
  reset(): void
}

export function createStore<T>(name: string, seed: () => T, version = 1): MockStore<T> {
  const key = `${PREFIX}-${name}-v${version}`
  let cache: T | null = null

  function read(): T {
    if (cache !== null) return cache
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = window.localStorage.getItem(key)
        if (raw) {
          cache = JSON.parse(raw) as T
          return cache
        }
      } catch {
        // 壞掉的本機資料，視同沒有，重新種子
      }
    }
    cache = seed()
    write(cache)
    return cache
  }

  function write(next: T): void {
    cache = next
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // 配額滿或隱私模式：記憶體那份仍然有效，重整才會掉
      }
    }
  }

  return {
    read,
    write,
    mutate<R>(fn: (draft: T) => R): R {
      const draft = read()
      const result = fn(draft)
      write(draft)
      return result
    },
    reset(): void {
      cache = null
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          window.localStorage.removeItem(key)
        } catch {
          /* 同上 */
        }
      }
    },
  }
}
