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

export function getUnitDefinition(key: string): UnitDefinition | undefined {
  return UNIT_REGISTRY[key as UnitKey]
}

export { treatmentUnit, doctorUnit, concernUnit, articleUnit, caseUnit, faqUnit, clinicUnit, pageUnit, termUnit }
