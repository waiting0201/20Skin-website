// 案例分享資料 —— 對應 docs/08-database.md §C-5 Cases ＋ CaseImages。
//
// ⚠️ 法規揭露欄位（個案差異聲明、當事人書面同意、拍攝條件）在資料庫層是 NOT NULL，
// 見 docs/02-backend-cms.md §1／docs/08-database.md §C-5。這四欄不是裝飾，
// 是「案例」內容模型的必填欄位，前端一律要渲染出來，不可省略。
//
// mockup/14-case-list.html 列了 10 則案例卡片，但只有第一則
// 「痘疤紋理的分次調理」在 mockup/15-case-detail.html 有完整內文
// （術前術後說明、個案條件表、療程歷程、醫師說明、法規揭露聲明、同意書索引）。
// 其餘 9 則目前只有列表卡片的摘要資訊（年齡層、次數、療程分類、tag），
// 沒有敘述內文與法規揭露資料 —— 不能無中生有，所以只有第一則有真正的內頁路由，
// 其餘 9 則列表卡片維持 mockup 原樣的無效連結（`href: null`），
// 等後台真正建立這些案例（含法規揭露欄位）後再補上內頁。

export interface Image {
  src: string
  alt: string
  width: number
  height: number
}

export interface CaseListItem {
  slug: string | null
  title: string
  ageGender: string
  sessions: string
  tags: string[]
  concernSlug?: string
}

export interface CaseTimelineItem {
  when: string
  title: string
  text: string
}

export interface CaseTreatmentRef {
  name: string
  href: string
  image: Image
  excerpt: string
}

export interface CaseDetail {
  slug: string
  title: string
  concernLabel: string
  concernHref: string
  lede: string
  shootingConditions: string
  facts: {
    condition: string
    mainConcern: string
    treatmentName: string
    treatmentHref: string
    sessions: string
    period: string
    doctorName: string
    doctorHref: string | null
    recovery: string
  }
  sections: { heading: string; paragraphs: string[] }[]
  timeline: CaseTimelineItem[]
  testimonial: string
  /** 個案差異聲明（docs/08 §C-5 IndividualVarianceStatement，NOT NULL）。 */
  individualVarianceStatement: string
  /** 當事人書面同意（docs/08 §C-5 HasWrittenConsent，NOT NULL）。 */
  hasWrittenConsent: true
  /** 同意書編號／存放位置（docs/08 §C-5 ConsentReference）。只存索引，同意書本身不進系統。 */
  consentReference: string
  doctorQuote: {
    name: string
    role: string
    href: string | null
    avatar: Image
    quote: string
  }
  treatmentsUsed: CaseTreatmentRef[]
  moreCaseSlugs: string[]
}

// ── 資料來源：content/cases.json（docs/09 §3）────────────────────────────
//
// 🔴 **案例只會有「資料庫裡有的那些」。**
//    mockup 列表上的 9 則裡，只有 1 則有內頁。另外 8 則缺四個法規揭露必填欄位
//    （個案差異聲明、拍攝條件、書面同意、同意書索引，docs/08 §C-5 全部 NOT NULL）。
//    **捏造那些欄位是法規紅線**，所以它們沒有進資料庫，也就不會出現在這裡。
//    要恢復列表，必須由院方補齊那四個欄位 —— 這是內容問題，不是程式問題。

import { REL, UNIT, img, loadUnit, parseBlocks, relationsOf, type ContentRecord } from './_content'

const toImage = (value: unknown, fallbackAlt = ''): Image => {
  const i = img(value)
  return { src: i?.src ?? '', alt: i?.alt || fallbackAlt, width: i?.width ?? 0, height: i?.height ?? 0 }
}

interface NarrativeDocument {
  facts: CaseDetail['facts'] | null
  sections: CaseDetail['sections'] | null
  timeline: CaseTimelineItem[] | null
  testimonial: string | null
  doctorQuote: CaseDetail['doctorQuote'] | null
}

const narrativeOf = (record: ContentRecord) =>
  parseBlocks<NarrativeDocument>(record.fields.narrative, {
    facts: null, sections: null, timeline: null, testimonial: null, doctorQuote: null,
  })

export async function getCaseList(): Promise<CaseListItem[]> {
  const cases = await loadUnit(UNIT.case)
  return cases
  .slice()
  .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
  .map((record) => {
    const n = narrativeOf(record)
    return {
      slug: record.slug,
      title: record.title,
      ageGender: n.facts?.condition ?? '',
      sessions: (record.fields.sessionsText as string) ?? '',
      tags: relationsOf(record, REL.treatmentToConcern).map((r) => r.toTitle as string),
    }
  })
}

export const CASE_FILTER_CONCERNS = [
  { label: '痘痘・粉刺', href: null },
  { label: '斑點・色素沉澱', href: null },
  { label: '抗老・緊緻', href: null },
  { label: '敏感肌', href: null },
]

export const CASE_FILTER_TREATMENTS = [
  { label: '光療美顏', href: '/treatments/laser/' },
  { label: '光電美容', href: null },
  { label: '微針美容', href: null },
]

export const CASE_HOW_TO_READ = [
  { title: '一、個案條件', text: '年齡層、性別與起點膚況不同，能參考的程度就不同。' },
  { title: '二、次數與期間', text: '做 1 次與做 6 次是兩回事，案例都會標註實際次數與歷時。' },
  { title: '三、拍攝條件', text: '光線、角度與妝容會影響觀感。院內案例照以固定條件拍攝。' },
]

export async function getCaseDetails(): Promise<CaseDetail[]> {
  const [cases, treatments] = await Promise.all([loadUnit(UNIT.case), loadUnit(UNIT.treatment)])
  return cases.map((record) => {
  const f = record.fields
  const n = narrativeOf(record)
  const treatment = treatments.find((t) => t.id === f.treatmentId)

  return {
    slug: record.slug as string,
    title: record.title,
    concernLabel: '',
    concernHref: '',
    lede: record.summary ?? '',
    shootingConditions: (f.shootingConditions as string) ?? '',
    facts: n.facts ?? ({} as CaseDetail['facts']),
    sections: n.sections ?? [],
    timeline: n.timeline ?? [],
    testimonial: n.testimonial ?? '',
    // 🔴 四個法規揭露欄位在資料庫是 NOT NULL（docs/08 §C-5）——
    //    它們是這一頁能不能存在的前提，不是可選欄位。
    individualVarianceStatement: (f.individualVarianceStatement as string) ?? '',
    hasWrittenConsent: Boolean(f.hasWrittenConsent) as true,
    consentReference: (f.consentReference as string) ?? '',
    doctorQuote: n.doctorQuote ?? ({} as CaseDetail['doctorQuote']),
    treatmentsUsed: treatment
      ? [{
          name: treatment.title,
          href: treatment.urlPath ?? '#',
          image: toImage(treatment.fields.cover, treatment.title),
          excerpt: treatment.summary ?? '',
        }]
      : [],
    moreCaseSlugs: cases.filter((c) => c.id !== record.id).map((c) => c.slug as string),
  }
  })
}

export async function findCaseDetail(slug: string): Promise<CaseDetail | undefined> {
  return (await getCaseDetails()).find((c) => c.slug === slug)
}
