// 首頁版位的設定 JSON（`HomeSections.Settings`）。
//
// 🔴 **形狀的真實來源是前台**（`apps/web/app/data/home.ts`），與九個內容模型的
//    區塊 JSON 同一條規則：抄錯不會有編譯錯誤，症狀是前台那一區靜默消失。
//
// ⚠️ 七個版位裡只有 hero 與 specialties 走 Settings（其餘四個走 Items、
//    brand-story 走 Items）。這裡目前只宣告 hero —— **沒有宣告的版位會維持
//    「原樣送回」**（`HomeSection.rawSettings`），不是被清空，見 api/site.ts。

import type { HomeSectionKey } from '../../api/site'
import type { StructuredSchema } from '../../structured-schema'

/**
 * 主視覺輪播：`{image, caption}[]`。
 *
 * 對應 `apps/web/app/data/home.ts` 的 `HeroSlide`
 * （`settingsArrayOf('hero') as { image, caption }[]` → `img(s.image)`）。
 *
 * ⚠️ **alt 在圖片值裡面**（`image.alt`），不是平行的一個鍵 —— `img()` 取的是
 *    `image.alt`。ImageField 自己就有 alt 輸入框，所以這裡不另外宣告。
 *
 * 🔴 **最外層一定是陣列。** 2026-09-17 正式站踩過：舊版後台把它壓成
 *    `{"0":…,"1":…,eyebrow:…}` 這種物件，前台的 `(settings ?? []).map()` 當場丟
 *    `.map is not a function`，**整個首頁 500**。前台現在會擋下非陣列（回空陣列
 *    ＋ 伺服器日誌），但那是止血，不是可以依賴的行為。
 */
export const heroSlidesSchema: StructuredSchema = {
  wire: 'json-string',
  emptyIsNull: true,
  preview: '首頁最上方的主視覺輪播。一列一張圖，每 5.5 秒換一張；圖說顯示在輪播下方，也是輪播圓點的語音標籤。',
  root: {
    kind: 'array',
    itemLabel: '輪播圖',
    summaryKeys: ['caption'],
    item: {
      kind: 'object',
      fields: [
        {
          key: 'image',
          label: '圖片',
          // 🔴 `deletesOldFile: false` —— 版位設定的圖**不會**在存檔時被刪掉
          //    （沒有走內容模型那條「發布時清掉上一版獨有 blob」的路，孤兒檔靠
          //    tools/blob-reconcile 離線對帳）。少了這個旗標，ImageField 會顯示
          //    一句與事實相反的警告。
          node: { kind: 'image', shape: 'content-image', deletesOldFile: false },
          required: true,
          hint: '建議橫幅比例（現有四張是 320×220）。替代文字在圖片下方那一欄填。',
        },
        {
          key: 'caption',
          label: '圖說',
          node: { kind: 'string', placeholder: '例如：四季診所．大廳與候診區' },
          required: true,
          hint: '顯示在輪播下方的一行小字，不是替代文字。',
        },
      ],
    },
  },
}

/**
 * 哪些版位的 `Settings` JSON 是**表單編得動的**。
 *
 * 🔴 **沒有列在這裡的版位，`settings` 一律原樣送回**（`HomeSection.rawSettings`）——
 *    不是清空。少了這條，按一次「儲存草稿」就會把 `specialties` 的八大專科入口
 *    整組洗掉，而且沒有任何錯誤訊息（2026-09-17 實際踩到）。
 *
 * ⚠️ `specialties` 目前**刻意不開放**：它的每一列都帶著 `slug` 與 `urlPath`，
 *    而那兩個值必須跟困擾頁實際的網址對得上 —— 開成自由文字等於給一個
 *    「填了就壞、而且壞得很安靜」的欄位。要開放的話正確做法是做成困擾內容的
 *    挑選器（像其餘六個版位那樣），不是再宣告一份 schema。
 *
 * ⚠️ 這裡只 `import type` 拿 `HomeSectionKey`（型別在編譯與 `--experimental-strip-types`
 *    之下都會被抹掉），所以與 api/site.ts 之間**沒有執行期的循環相依** ——
 *    `tools/content-roundtrip` 要能直接 import 這個檔，不能把整包 API client 拖進 Node。
 */
export const HOME_SECTION_SETTINGS_SCHEMA: Partial<Record<HomeSectionKey, StructuredSchema>> = {
  hero: heroSlidesSchema,
}
