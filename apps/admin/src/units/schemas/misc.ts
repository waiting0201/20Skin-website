// 醫師、據點、案例的區塊 JSON 欄位。
//
// 形狀來源：`apps/web/app/data/doctors.ts`、`clinics.ts:217-247`、`cases.ts:51-108`。

import type { StructuredSchema } from '../../structured-schema'

// ── 醫師 ──────────────────────────────────────────────────────────────

/** `{heroRole, yearsInPractice, paragraphs[]}` —— 個人頁的簡介區。 */
export const doctorBioSchema: StructuredSchema = {
  wire: 'json-string',
  emptyIsNull: true,
  preview: '醫師個人頁的簡介區：主視覺旁的頭銜與年資，加上數段自我介紹。',
  root: {
    kind: 'object',
    fields: [
      { key: 'heroRole', label: '主視覺頭銜', node: { kind: 'string', placeholder: '例如：院長・醫療技術總監' } },
      { key: 'yearsInPractice', label: '執業年資', node: { kind: 'string', placeholder: '例如：約 20 年' } },
      {
        key: 'paragraphs',
        label: '簡介段落',
        node: { kind: 'array', itemLabel: '段落', item: { kind: 'string' } },
        riskScan: true,
        hint: '一列一段。',
      },
    ],
  },
}

/** `{title, meta}[]` —— 著作與演講清單。 */
export const doctorPublicationsSchema: StructuredSchema = {
  wire: 'json-string',
  emptyIsNull: true,
  preview: '醫師個人頁的著作／演講清單。',
  root: {
    kind: 'array',
    itemLabel: '著作',
    summaryKeys: ['title'],
    item: {
      kind: 'object',
      fields: [
        { key: 'title', label: '標題', node: { kind: 'string', multiline: true }, required: true },
        { key: 'meta', label: '出處與日期', node: { kind: 'string', placeholder: '例如：中華民國醫用雷射醫學會・2026.05' } },
      ],
    },
  },
}

// ── 據點 ──────────────────────────────────────────────────────────────

/** `[{icon,title,points[]}]` —— 交通方式卡片（clinics/[slug].vue:273）。 */
export const clinicTransportSchema: StructuredSchema = {
  wire: 'json-string',
  emptyIsNull: true,
  preview: '據點頁「交通與停車」區：一種交通方式一張卡片。',
  root: {
    kind: 'array',
    itemLabel: '交通方式',
    summaryKeys: ['title'],
    item: {
      kind: 'object',
      fields: [
        {
          key: 'icon',
          label: '圖示',
          // 🔴 封閉的三個值，取自 `apps/web/app/data/clinics.ts:44`
          //    （`icon: 'car' | 'bus' | 'parking'`）。前台是逐個 v-if 比對，
          //    填別的字串就是那張卡片沒有圖示 —— 不會報錯。
          node: { kind: 'enum', options: [
            { value: 'car', label: '開車' },
            { value: 'bus', label: '大眾運輸' },
            { value: 'parking', label: '停車' },
          ] },
          required: true,
        },
        { key: 'title', label: '標題', node: { kind: 'string' }, required: true },
        { key: 'points', label: '說明', node: { kind: 'array', itemLabel: '說明', item: { kind: 'string' } } },
      ],
    },
  },
}

// ── 案例 ──────────────────────────────────────────────────────────────

/**
 * 案例的 `narrative`：**一個欄位裝了五個子結構**（cases.ts:99-108）。
 *
 * ⚠️ `facts` 是**九個固定鍵的物件**，不是陣列（療程的 facts 才是陣列）。
 *    前台是逐鍵渲染成表格的列（cases/[slug].vue:90-102），所以鍵名一個都不能改。
 * 🔴 `doctorQuote` 沒填時前台會讀 `doctorQuote.avatar.src` 而炸掉
 *    （cases.ts:171 的 `as` 轉型讓空物件過關）。要嘛整組填完，要嘛整組留空。
 */
export const caseNarrativeSchema: StructuredSchema = {
  wire: 'json-string',
  emptyIsNull: true,
  preview: '案例細節頁的主體：基本資料表、敘述段落、療程時間軸、當事人回饋、醫師的話。',
  root: {
    kind: 'object',
    fields: [
      {
        key: 'facts',
        label: '基本資料表',
        hint: '細節頁最上方那張表。九個欄位的順序與名稱由前台決定，不會因為留空而消失（會顯示空白列）。',
        node: {
          kind: 'object',
          fields: [
            { key: 'condition', label: '年齡與性別', node: { kind: 'string', placeholder: '例如：30–35 歲・女性' } },
            { key: 'mainConcern', label: '主要困擾', node: { kind: 'string' } },
            { key: 'treatmentName', label: '療程名稱', node: { kind: 'string' } },
            { key: 'treatmentHref', label: '療程頁連結', node: { kind: 'string', placeholder: '/treatments/laser/picosure-pro/' }, hint: '站內路徑，要自己打對——打錯是一個死連結，不會有錯誤訊息。' },
            { key: 'sessions', label: '次數', node: { kind: 'string' } },
            { key: 'period', label: '期間', node: { kind: 'string' } },
            { key: 'doctorName', label: '主治醫師', node: { kind: 'string' } },
            { key: 'doctorHref', label: '醫師頁連結', node: { kind: 'string', placeholder: '/team/huang/' } },
            { key: 'recovery', label: '恢復期', node: { kind: 'string' } },
          ],
        },
      },
      {
        key: 'sections',
        label: '敘述段落',
        node: {
          kind: 'array',
          itemLabel: '段落區塊',
          summaryKeys: ['heading'],
          item: {
            kind: 'object',
            fields: [
              { key: 'heading', label: '小標', node: { kind: 'string' }, required: true },
              { key: 'paragraphs', label: '內容', node: { kind: 'array', itemLabel: '段落', item: { kind: 'string' } }, riskScan: true },
            ],
          },
        },
      },
      {
        key: 'timeline',
        label: '療程時間軸',
        node: {
          kind: 'array',
          itemLabel: '時間點',
          summaryKeys: ['when', 'title'],
          item: {
            kind: 'object',
            fields: [
              { key: 'when', label: '時間', node: { kind: 'string' }, required: true },
              { key: 'title', label: '標題', node: { kind: 'string' } },
              { key: 'text', label: '說明', node: { kind: 'string', multiline: true }, riskScan: true },
            ],
          },
        },
      },
      { key: 'testimonial', label: '當事人回饋', node: { kind: 'string', multiline: true }, riskScan: true },
      {
        key: 'doctorQuote',
        label: '醫師的話',
        hint: '⚠️ 要填就整組填完（含頭像）——只填一半的話前台會讀不到頭像而出錯。整組留空是安全的。',
        node: {
          kind: 'object',
          fields: [
            { key: 'name', label: '醫師姓名', node: { kind: 'string' } },
            { key: 'role', label: '職稱', node: { kind: 'string' } },
            { key: 'href', label: '醫師頁連結', node: { kind: 'string', placeholder: '/team/huang/' } },
            { key: 'quote', label: '內容', node: { kind: 'string', multiline: true }, riskScan: true },
            { key: 'avatar', label: '頭像', node: { kind: 'image', shape: 'src-size' } },
          ],
        },
      },
    ],
  },
}
