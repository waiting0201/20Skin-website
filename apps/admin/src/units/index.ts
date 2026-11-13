// 單元宣告登記表。ListPage／EditPage 與各 admin 頁面一律透過這裡取得
// UnitDefinition，不直接 import 個別檔案——之後要拿掉或新增單元只改這一處。
import type { UnitKey } from '../types'
import type { UnitDefinition } from '../unit-schema'
import { treatmentUnit } from './treatment'
import { doctorUnit } from './doctor'
import { concernUnit } from './concern'
import { articleUnit } from './article'
import { caseUnit } from './case'
import { faqUnit } from './faq'
import { clinicUnit } from './clinic'
import { pageUnit } from './page'
import { termUnit } from './term'

export const UNIT_REGISTRY: Record<UnitKey, UnitDefinition> = {
  treatment: treatmentUnit,
  doctor: doctorUnit,
  concern: concernUnit,
  article: articleUnit,
  case: caseUnit,
  faq: faqUnit,
  clinic: clinicUnit,
  page: pageUnit,
  term: termUnit,
}

/**
 * 出現在後台選單、儀表板與「選單連到哪一種內容」下拉裡的單元。
 *
 * 🔴 **「案例」不在裡面**（Tim 定案 2026-11-13，決策 34）：案例分享由允赫齒科頁取代，
 *    既有案例已全部下架、舊網址 301 到 `/dental/`。在選單留著入口等於留一個
 *    「編了、發布了，前台沒有任何地方會出現」的畫面（決策 33 的同一條）。
 * ⚠️ 拿掉的是入口，不是單元：`UNIT_REGISTRY.case`、API 端點與資料都還在，
 *    網址 `/admin/case` 仍打得開（給工程端查舊資料用）。**不要因為看到它還在就把入口加回來。**
 */
export const NAV_UNIT_KEYS = (Object.keys(UNIT_REGISTRY) as UnitKey[]).filter((key) => key !== 'case')

export function getUnitDefinition(key: string): UnitDefinition | undefined {
  return UNIT_REGISTRY[key as UnitKey]
}

export { treatmentUnit, doctorUnit, concernUnit, articleUnit, caseUnit, faqUnit, clinicUnit, pageUnit, termUnit }
