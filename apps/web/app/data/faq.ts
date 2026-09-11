// FAQ 題庫（docs/08-database.md §C-6 `Faqs`）＋ FAQ 分類（§C-9 `Terms`，TermType=3）。
//
// 正式站題庫與分類是兩張表：Faqs.CategoryTermId FK → Terms（分類與標籤模型），
// 前端不自建第二份分類清單（docs/02-backend-cms.md §6 分界表）。這裡先用一份平面
// 資料模擬這個關聯，形狀對齊 —— 接上 CMS 時只換來源、不改元件。
//
// ⚠️ 分類命名尚未定案：docs/08-database.md §C-9 的 FAQ 分類種子是「品牌與診所／
// 療程相關／肌膚困擾／醫師與看診／費用與流程」，但 mockup/16-faq.html 實際做出來
// 的 5 個 tab 是「療程相關／術後照護／看診與預約／費用與付款／院所資訊」，兩者
// 對不起來。內容規則是「照抄 mockup 原文」，所以這裡採用 mockup 的 5 類（含其
// data-tab 的英文 slug），docs 那份種子清單需要內容／後端團隊回頭核對，不是前端
// 能單方面決定的事——見交付回報。
//
// 兩份答案都是 NOT NULL：WebAnswer 是頁面顯示用的完整說明（150–400 字），
// AiAnswer 是 60–100 字的語意自足摘要，供 FAQPage JSON-LD／faq.json／llms-full.txt
// 使用。mockup 只寫了網頁版一份文字，AiAnswer 由網頁版摘要濃縮而成（不是新事實，
// 只是縮寫既有內容以符合欄位長度限制），供後續編輯覆核。
// LastReviewedOn 是 date 型別；mockup 只標到月份（例如「2026-08」），這裡一律
// 補上當月 01 日，等內容團隊給出正式日期後再覆蓋。

export interface FaqCategory {
  /** Terms.Slug，同時是 mockup data-tab 的值。 */
  slug: string
  /** Terms 顯示名稱（= mockup 的 tab 文案）。 */
  label: string
}

export interface FaqItem {
  /** 對應 ContentItems.Title（問題本體）。 */
  question: string
  categorySlug: string
  /** WebAnswer，nvarchar(max)，150–400 字，頁面顯示用。 */
  webAnswer: string
  /** AiAnswer，nvarchar(500)，60–100 字，FAQPage JSON-LD 唯一來源。 */
  aiAnswer: string
  /** LastReviewedOn，date。 */
  lastReviewedOn: string
  /** mockup 顯示的審閱者（非 Faqs 表欄位，工作流走 ContentReviews，這裡僅供頁面顯示）。 */
  reviewedBy: string
}

export const FAQ_CATEGORIES: FaqCategory[] = [
  { slug: 'treatment', label: '療程相關' },
  { slug: 'aftercare', label: '術後照護' },
  { slug: 'visit', label: '看診與預約' },
  { slug: 'fee', label: '費用與付款' },
  { slug: 'clinic', label: '院所資訊' },
]

export const FAQ_ITEMS: FaqItem[] = [
  // ── 療程相關 ──────────────────────────────────────────────
  {
    question: '第一次做醫美，該從哪一項開始？',
    categorySlug: 'treatment',
    webAnswer:
      '沒有固定的起手式。門診會先由醫師檢視膚況、了解需求與可接受的恢復期，再一起討論哪些項目適合、優先順序如何排。若評估後認為調整保養方式即可，也會直接說明，不一定要做療程。',
    aiAnswer:
      '沒有固定起手式，門診會先由醫師了解膚況與需求，再共同討論適合項目與優先順序；若調整保養即可改善，也會直接建議，不一定需要療程。',
    lastReviewedOn: '2026-08-01',
    reviewedBy: '黃勇學 醫師',
  },
  {
    question: '做雷射會痛嗎？',
    categorySlug: 'treatment',
    webAnswer:
      '多數雷射療程過程中會有溫熱、輕微刺感，程度依機型、能量設定與個人耐受度而不同。施作前會依項目需要評估是否使用表面麻醉，過程中也可隨時反映感受，由醫師調整。',
    aiAnswer:
      '多數雷射過程有溫熱或輕微刺感，程度依機型、能量與個人耐受度而異；施作前可評估表面麻醉，過程中可隨時反映由醫師調整。',
    lastReviewedOn: '2026-08-01',
    reviewedBy: '鍾佩宜 醫師',
  },
  {
    question: '一次療程要做幾次才夠？',
    categorySlug: 'treatment',
    webAnswer:
      '次數會依困擾類型、嚴重程度與個人膚況而不同，沒有一體適用的答案。多數能量式療程會採分次進行，並在每次回診時依實際反應調整後續規劃。',
    aiAnswer:
      '次數依困擾類型、嚴重程度與膚況而不同，沒有一體適用的答案；多數能量式療程採分次進行，並依每次反應調整後續規劃。',
    lastReviewedOn: '2026-08-01',
    reviewedBy: '黃勇學 醫師',
  },
  {
    question: '同一天可以做多項療程嗎？',
    categorySlug: 'treatment',
    webAnswer:
      '視項目組合而定。部分項目在原理上會互相影響，或合併後會拉長恢復期，不建議同日進行。是否可以合併，需由醫師依當次膚況評估決定。',
    aiAnswer:
      '視項目組合而定，部分項目原理上互相影響或會拉長恢復期，不建議同日進行；能否合併需由醫師依當次膚況評估決定。',
    lastReviewedOn: '2026-08-01',
    reviewedBy: '施百潤 醫師',
  },
  {
    question: '懷孕或哺乳期間可以做療程嗎？',
    categorySlug: 'treatment',
    webAnswer:
      '多數醫學美容療程在懷孕與哺乳期間建議暫緩。請於面診時主動告知目前狀況，由醫師評估是否有適合的替代方向，或建議延後進行。',
    aiAnswer:
      '多數醫學美容療程建議懷孕與哺乳期間暫緩，請面診時主動告知目前狀況，由醫師評估替代方向或建議延後進行。',
    lastReviewedOn: '2026-08-01',
    reviewedBy: '楊嵐怡 醫師',
  },
  {
    question: '正在服用藥物，需要先告知嗎？',
    categorySlug: 'treatment',
    webAnswer:
      '需要。口服A酸、抗凝血劑、部分抗生素與慢性病用藥都可能影響療程的適用性與恢復狀況，請於面診時完整告知用藥情形，勿自行停藥。',
    aiAnswer:
      '需要，口服A酸、抗凝血劑、部分抗生素與慢性病用藥可能影響療程適用性與恢復狀況，請面診時完整告知用藥情形，勿自行停藥。',
    lastReviewedOn: '2026-08-01',
    reviewedBy: '蘇達華 醫師',
  },

  // ── 術後照護 ──────────────────────────────────────────────
  {
    question: '療程後多久可以化妝？',
    categorySlug: 'aftercare',
    webAnswer:
      '依項目與皮膚反應而不同，從當天即可到需等待數日都有可能。實際時間請以醫師當次的衛教說明為準；若治療部位仍有傷口或明顯紅腫，建議先暫停上妝。',
    aiAnswer:
      '依項目與皮膚反應而不同，從當天到需等待數日都有可能，實際時間以醫師當次衛教說明為準；治療部位仍有傷口或紅腫應暫停上妝。',
    lastReviewedOn: '2026-08-01',
    reviewedBy: '趙映程 醫師',
  },
  {
    question: '術後可以曬太陽嗎？',
    categorySlug: 'aftercare',
    webAnswer:
      '療程後皮膚對紫外線較敏感，建議依醫師指示加強防曬，並盡量避免長時間直接曝曬。防曬沒做好，是色素沉澱最常見的原因之一。',
    aiAnswer:
      '術後皮膚對紫外線較敏感，建議依醫師指示加強防曬並避免長時間曝曬，防曬不足是色素沉澱最常見的原因之一。',
    lastReviewedOn: '2026-08-01',
    reviewedBy: '鍾佩宜 醫師',
  },
  {
    question: '術後出現紅腫，是正常的嗎？',
    categorySlug: 'aftercare',
    webAnswer:
      '部分項目在術後出現輕微泛紅、腫脹屬常見反應，通常會隨時間緩解。若紅腫持續加劇、出現疼痛或分泌物，請儘速回診由醫師評估，勿自行處理。',
    aiAnswer:
      '部分項目術後輕微泛紅、腫脹屬常見反應，通常會隨時間緩解；若持續加劇、疼痛或有分泌物，應儘速回診由醫師評估，勿自行處理。',
    lastReviewedOn: '2026-08-01',
    reviewedBy: '黃勇學 醫師',
  },
  {
    question: '術後可以運動、泡溫泉嗎？',
    categorySlug: 'aftercare',
    webAnswer:
      '高溫、大量流汗與公共水域環境可能增加不適或感染風險，建議依醫師指示的時間內暫緩。恢復時間依項目而異，請以當次衛教說明為準。',
    aiAnswer:
      '高溫、大量流汗與公共水域可能增加不適或感染風險，建議依醫師指示時間內暫緩，恢復時間依項目而異，請以當次衛教說明為準。',
    lastReviewedOn: '2026-08-01',
    reviewedBy: '洪健睿 醫師',
  },
  {
    question: '需要搭配特定保養品嗎？',
    categorySlug: 'aftercare',
    webAnswer:
      '多數情況以溫和清潔、保濕與防曬三件事為主。是否需要搭配特定產品，會由醫師依療程項目與膚況說明，不需要為了療程更換整套保養品。',
    aiAnswer:
      '多數情況以溫和清潔、保濕與防曬三件事為主，是否需搭配特定產品由醫師依項目與膚況說明，不需為療程更換整套保養品。',
    lastReviewedOn: '2026-08-01',
    reviewedBy: '林鈺敏 醫師',
  },

  // ── 看診與預約 ──────────────────────────────────────────────
  {
    question: '初診需要準備什麼？',
    categorySlug: 'visit',
    webAnswer:
      '請攜帶健保卡與身分證件；若有慢性病用藥、過敏史或近期的其他療程紀錄，一併告知有助於醫師評估。建議預留較充裕的時間，初診的問診與說明時間通常較長。',
    aiAnswer:
      '請攜帶健保卡與身分證件，並告知慢性病用藥、過敏史或近期療程紀錄；初診問診時間較長，建議預留較充裕時間。',
    lastReviewedOn: '2026-08-01',
    reviewedBy: '編輯部',
  },
  {
    question: '可以指定醫師嗎？',
    categorySlug: 'visit',
    webAnswer:
      '可以。各醫師的看診院區與時段不同，預約時可指定；若指定醫師的時段已滿，也可由門診協助安排其他合適的醫師。',
    aiAnswer: '可以指定醫師，各醫師看診院區與時段不同；若指定時段已滿，門診可協助安排其他合適的醫師。',
    lastReviewedOn: '2026-08-01',
    reviewedBy: '編輯部',
  },
  {
    question: '需要提前多久預約？',
    categorySlug: 'visit',
    webAnswer:
      '視時段與醫師而定，週末與夜診較為熱門，建議提前預約。臨時有空檔時也可致電詢問當日候補。',
    aiAnswer: '視時段與醫師而定，週末與夜診較熱門建議提前預約；臨時有空檔也可致電詢問當日候補。',
    lastReviewedOn: '2026-08-01',
    reviewedBy: '編輯部',
  },
  {
    question: '沒有預約可以直接到現場嗎？',
    categorySlug: 'visit',
    webAnswer:
      '可以現場掛號，但需視當日名額與候診狀況；已預約者優先看診。建議先行預約以縮短等候時間。',
    aiAnswer: '可現場掛號，但需視當日名額與候診狀況，已預約者優先看診，建議先預約以縮短等候時間。',
    lastReviewedOn: '2026-08-01',
    reviewedBy: '編輯部',
  },
  {
    question: '需要取消或改期怎麼辦？',
    categorySlug: 'visit',
    webAnswer: '請於預約時段前透過線上系統或電話告知，以便將名額釋出給其他候診者。',
    aiAnswer: '請於預約時段前透過線上系統或電話告知，以便將名額釋出給其他候診者。',
    lastReviewedOn: '2026-08-01',
    reviewedBy: '編輯部',
  },

  // ── 費用與付款 ──────────────────────────────────────────────
  {
    question: '療程費用怎麼計算？',
    categorySlug: 'fee',
    webAnswer:
      '費用依項目、施作範圍與次數而不同。醫師面診並確認規劃內容後，會由服務人員完整說明費用，確認後再決定是否進行。',
    aiAnswer:
      '費用依項目、施作範圍與次數而不同，由醫師面診並確認規劃內容後，服務人員會完整說明費用，確認後再決定是否進行。',
    lastReviewedOn: '2026-08-01',
    reviewedBy: '編輯部',
  },
  {
    question: '門診諮詢需要收費嗎？',
    categorySlug: 'fee',
    webAnswer: '掛號與診察費用依院所公告收費標準辦理，實際金額請於預約或現場洽詢櫃檯。',
    aiAnswer: '掛號與診察費用依院所公告收費標準辦理，實際金額請於預約或現場洽詢櫃檯。',
    lastReviewedOn: '2026-08-01',
    reviewedBy: '編輯部',
  },
  {
    question: '可以使用哪些付款方式？',
    categorySlug: 'fee',
    webAnswer: '付款方式依院所公告為準，實際可用方式請於門診時洽詢櫃檯。',
    aiAnswer: '付款方式依院所公告為準，實際可用方式請於門診時洽詢櫃檯。',
    lastReviewedOn: '2026-08-01',
    reviewedBy: '編輯部',
  },
  {
    question: '療程有健保給付嗎？',
    categorySlug: 'fee',
    webAnswer:
      '一般皮膚疾病的診療依健保規定辦理；醫學美容類療程屬自費項目。個別項目的給付與否，請於面診時由醫師與服務人員說明。',
    aiAnswer:
      '一般皮膚疾病診療依健保規定辦理，醫學美容類療程屬自費項目，個別給付與否請於面診時由醫師與服務人員說明。',
    lastReviewedOn: '2026-08-01',
    reviewedBy: '編輯部',
  },

  // ── 院所資訊 ──────────────────────────────────────────────
  {
    question: '兩個院區有什麼不同？',
    categorySlug: 'clinic',
    webAnswer:
      '四季診所以醫學美容與光電療程為主；二林四季皮膚科以一般皮膚疾病門診為主，同時提供基礎光電與保養類療程。兩院區的門診時段與駐診醫師不同。',
    aiAnswer:
      '四季診所以醫學美容與光電療程為主，二林四季皮膚科以一般皮膚疾病門診為主並提供基礎光電與保養類療程，兩院區門診時段與駐診醫師不同。',
    lastReviewedOn: '2026-08-01',
    reviewedBy: '編輯部',
  },
  {
    question: '有停車位嗎？',
    categorySlug: 'clinic',
    webAnswer: '停車資訊請見各院區的據點頁面；周邊停車方式與特約停車，可於預約時洽詢櫃檯。',
    aiAnswer: '停車資訊請見各院區的據點頁面，周邊停車方式與特約停車可於預約時洽詢櫃檯。',
    lastReviewedOn: '2026-08-01',
    reviewedBy: '編輯部',
  },
  {
    question: '可以陪同看診嗎？',
    categorySlug: 'clinic',
    webAnswer: '可以。若為未成年人就診，建議由家長或監護人陪同，以利說明療程內容與後續照護。',
    aiAnswer: '可以陪同看診，若為未成年人就診建議由家長或監護人陪同，以利說明療程內容與後續照護。',
    lastReviewedOn: '2026-08-01',
    reviewedBy: '編輯部',
  },
  {
    question: '線上購物與線上預約是同一個系統嗎？',
    categorySlug: 'clinic',
    webAnswer: '不是。線上預約與線上購物為兩個獨立的外部系統，可分別由網站上方的按鈕進入。',
    aiAnswer: '不是，線上預約與線上購物為兩個獨立的外部系統，可分別由網站上方的按鈕進入。',
    lastReviewedOn: '2026-08-01',
    reviewedBy: '編輯部',
  },
]

export function faqItemsByCategory(slug: string): FaqItem[] {
  return FAQ_ITEMS.filter((item) => item.categorySlug === slug)
}

/** FAQPage JSON-LD（docs/03-seo-geo.md §2）。AiAnswer 是唯一來源。 */
export function faqPageJsonLd(items: FaqItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.aiAnswer,
      },
    })),
  }
}
