// `GET|PUT /admin/setting` 的薄封裝（docs/10 §3.4、docs/08 §G-1）。
//
// 全站設定在資料庫是一張**鍵值表**，不是一個結構化文件。後台有兩個畫面在用它：
// 「全站設定」（site.ts）與「sitemap／robots 設定」（seo.ts）。兩支都要讀寫同一支端點，
// 所以把鍵值層抽在這裡，避免兩邊各寫一份解析與序列化。
//
// 🔴 **鍵是固定的，不能新增。** API 對不存在的 SettingKey 回 404（種子建好的那幾個鍵
//    才寫得進去）。要多一個設定就是一支 migration ＋ 一列種子，不是在前端多送一個鍵。

import { request } from './http'

export interface SettingItem {
  settingKey: string
  settingValue: string
  valueType: string
  updatedByUserId: number | null
  updatedByUserName: string | null
  updatedAt: string
}

export type SettingMap = Map<string, SettingItem>

export async function readSettings(): Promise<SettingMap> {
  const items = (await request<SettingItem[]>('/admin/setting')) ?? []
  return new Map(items.map((i) => [i.settingKey, i]))
}

export function settingText(map: SettingMap, key: string, fallback = ''): string {
  const value = map.get(key)?.settingValue
  return value === undefined || value === '' ? fallback : value
}

export function settingBool(map: SettingMap, key: string, fallback = false): boolean {
  const value = map.get(key)?.settingValue
  if (value === undefined || value === '') return fallback
  return value.toLowerCase() === 'true'
}

/**
 * 讀一個存成 JSON 的設定值。
 * ⚠️ 解析失敗回 fallback 而不是拋例外 —— 這幾個鍵的值是可以在後台手改的，
 * 一個打錯的引號不該讓整個設定畫面開不起來。
 */
export function settingJson<T>(map: SettingMap, key: string, fallback: T): T {
  const raw = map.get(key)?.settingValue
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/**
 * 寫回若干個鍵。
 * ⚠️ **只送有改動的鍵。** 整份送回去的話，兩個人同時開著設定畫面時，
 * 後存的那個人會把前一個人改的欄位一起覆蓋回舊值（設定類不走審核、儲存即生效，
 * 而且沒有留痕可以追 —— docs/10 §4 末段）。
 */
export async function writeSettings(changes: Record<string, string>): Promise<void> {
  const items = Object.entries(changes).map(([settingKey, settingValue]) => ({ settingKey, settingValue }))
  if (items.length === 0) return
  await request<null>('/admin/setting', { method: 'PUT', body: { items } })
}
