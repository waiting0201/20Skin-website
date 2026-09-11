# 03 — SEO 與 GEO 策略

SEO 追求「在搜尋結果中被點擊」，GEO（Generative Engine Optimization）追求「在 AI 的回答中被引用」。

兩者共用同一批內容資產，但對**內容結構**與**可存取性**的要求不同。

---

## 1. 技術 SEO

| 項目 | 執行內容 |
|---|---|
| **WAF 爬蟲放行** 🔴 最高優先 | 現行 Mod_Security 對非瀏覽器 UA 回 406。須 allowlist：`Googlebot`、`Bingbot`、`GPTBot`、`OAI-SearchBot`、`ChatGPT-User`、`ClaudeBot`、`PerplexityBot`、`Google-Extended`、`Applebot`、`Applebot-Extended`。**放行後須以實際 UA 逐一驗證回應 200**，不能只改設定不驗收。 |
| **sitemap.xml** | 分檔並以 sitemap index 串接：`sitemap-pages.xml`、`-treatments.xml`、`-concerns.xml`、`-doctors.xml`、`-blog.xml`。由後台自動生成、發布時即時更新，提交 Search Console 與 Bing Webmaster。 |
| **robots.txt** | 加入 `Sitemap:` 指令；封鎖 `/search/` 等無價值參數頁；**不封鎖 AI 爬蟲**。**不再列 `Disallow: /admin/`** —— 後台實際位於 `/admin/`（[07](07-deployment.md) §1），寫進公開檔案等於標示位置；擋索引改由該 route 的 `X-Robots-Tag: noindex, nofollow` 負責（範本已含），且後台無對外連結，爬蟲本來就發現不到。 |
| **Canonical** | 每頁唯一自我 canonical。分頁列表、年份／標籤篩選頁指向主版本 —— 約 800 篇文章的列表很容易產生大量重複頁。 |
| **網址正規化** | 統一 https、統一 www 或非 www（擇一並全站 301）、統一結尾斜線、全小寫。四者不一致會憑空製造四倍重複內容。 |
| **Core Web Vitals** | 目標 LCP < 2.5s、INP < 200ms、CLS < 0.1。醫美網站圖片量大，重點在圖片策略：WebP／AVIF、響應式 srcset、首屏外 lazy load、明確 width/height 防位移。 |
| **行動優先** | 醫美流量行動裝置佔比極高。導覽、預約按鈕、LINE 諮詢入口須全程可觸及。⚠️ **常駐的 sticky CTA 點開是 AI 問答面板，不是預約或 LINE 的捷徑**（見 [04-ai-faq.md](04-ai-faq.md) §4），且**該按鈕在 AI 串接完成前預設關閉** —— 因此 Phase 1 的預約與 LINE 入口須由導覽與頁尾承擔。 |
| **麵包屑** | 全站啟用並輸出 BreadcrumbList，讓搜尋結果顯示層級路徑，也讓 AI 理解頁面在架構中的位置。 |
| **404 與軟 404** | 設計有用的 404 頁（搜尋框＋熱門療程＋據點資訊）。改版後持續監控軟 404 —— 這是 301 沒做好的主要徵兆。 |

---

## 2. 結構化資料（JSON-LD）

| Schema | 套用頁面 | 關鍵屬性與作用 |
|---|---|---|
| **Organization** | 全站 | 品牌名、logo、`sameAs`（LINE、FB、IG、YouTube 等所有官方帳號）。**`sameAs` 是 AI 建立品牌實體的核心依據**，遺漏會讓 AI 難以確認你是誰。 |
| **MedicalClinic** / LocalBusiness | `/clinics/` 各據點 | name、address、telephone、geo、`openingHoursSpecification`（支援午休斷點）、medicalSpecialty、availableService。兩據點各自標記，對應各自的 Google 商家。 |
| **Physician** | `/team/` 每位醫師 | name、medicalSpecialty、alumniOf、hasCredential、worksFor、availableAtOrFrom。**醫療領域最有價值的 schema**，直接支撐 E-E-A-T。 |
| **MedicalProcedure** / MedicalTherapy | `/treatments/` 每個療程 | name、howPerformed、preparation、followup、bodyLocation、`indication`、contraindication。 |
| **MedicalCondition** | `/concerns/` 每個困擾 | name、signOrSymptom、cause、possibleTreatment（指向療程頁）。與 MedicalProcedure 形成語意關聯。 |
| **Article** / MedicalWebPage | `/blog/` 每篇文章 | headline、**author**（指向 Physician）、**reviewedBy**、datePublished、**dateModified**、publisher。 |
| **FAQPage** | `/faq/` 及內嵌 FAQ 的頁面 | Question / acceptedAnswer 配對。**AI 引用率最高的 schema 類型**。 |
| **BreadcrumbList** | 全站 | 層級路徑。 |

---

## 3. 關鍵字架構

以四軸建立關鍵字地圖，每組明確對應到一個頁面，避免多頁互相競食。

| 軸線 | 關鍵字型態 | 對應頁面 | 策略 |
|---|---|---|---|
| **困擾軸** | 「臉上痘疤怎麼消」「敏感肌泛紅 怎麼辦」「眼周細紋 改善」 | `/concerns/{困擾}/` | **量體最大、競爭最低、目前完全沒有承接頁。**改版後前六個月的內容投入重心。 |
| **療程軸** | 「蜂巢皮秒雷射」「EMFACE」「ONDA 超微波」「DermaV」 | `/treatments/{分類}/{療程}/` | 意圖明確、轉換率高但競爭激烈。重點在內容深度與醫師背書，而非關鍵字堆疊。 |
| **地區軸** | 「彰化 皮膚科」「二林 皮膚科」「員林 醫美」「溪湖 除毛」 | `/clinics/{據點}/` | **本案被嚴重低估的機會。**地區競爭遠低於全國型，搜尋意圖直接指向到店。須搭配 Google 商家與 NAP 一致性。 |
| **品牌軸** | 「20SKIN」「四季診所」「黃勇學 醫師」「新中式美學」 | `/`、`/about/`、`/team/{醫師}/` | 目前**醫師人名流量完全流失**。建立 14 個醫師頁即可立刻承接。 |

---

## 4. GEO：生成式引擎最佳化

當使用者在 ChatGPT、Perplexity 或 Google AI Overviews 問「彰化有推薦的皮膚科嗎」「皮秒雷射會痛嗎」時，AI 會抓取、摘要並**引用**少數幾個來源。GEO 的目標就是成為那個來源。

依「先決條件 → 內容結構 → 實體信任 → 監測」順序：

### ① 可存取性（先決條件）

見 §1 第一列。**若 AI 爬蟲拿到 406，以下三項全部無效。**

此外，關鍵內容不可僅靠 JavaScript 渲染 —— 多數 AI 爬蟲不執行 JS，療程說明、FAQ、醫師資料必須存在於初始 HTML 中。

### ② 內容結構：寫給人看，但排版給機器抽取

- **直答式開頭** — 每頁開頭放 40–60 字直接回答。不要用「隨著現代人生活壓力增加……」暖場，AI 抽取摘要時會直接取用開頭段落。後台已為此設計「AI 摘要」欄位。
- **H2 使用完整問句** — 「皮秒雷射術後多久可以化妝？」優於「術後照護」。與使用者向 AI 提問的語句形式一致，比對命中率高得多。
- **關鍵事實用清單與表格** — 療程時間、恢復期、建議次數、禁忌症。AI 從結構化區塊抽取事實的準確度遠高於長段落。
- **每個段落自足** — 避免「如上所述」「前面提到的」。AI 常只取用單一段落，指涉性語句被抽出後會失去意義甚至產生錯誤。
- **數字與具體事實** — 「二十年皮膚科臨床經驗」「兩個據點、13 位醫師」比「經驗豐富的專業團隊」有用得多。

### ③ 實體信任訊號

- **NAP 一致性** — 品牌名、地址、電話在官網、Google 商家、Facebook、LINE、各醫療目錄必須**逐字一致**。AI 靠交叉比對多來源建立實體信心，任何不一致都會降低確信度。
- **具名與時效** — 每篇醫療內容標註作者醫師、審閱醫師、審閱日期。
- **可驗證的機構事實** — `/about/` 清楚寫出成立年份、據點數、醫師人數、專科別、主要儀器。這是 AI 描述「20SKIN 是什麼」時的原始素材，不寫它就自己猜。
- **法務與免責頁面** — `/privacy/`、`/terms/`、`/medical-disclaimer/` 的存在本身就是可信度訊號。
- **第三方提及** — 媒體報導與演講授課（現有約 290 篇，是被低估的資產）應在 `/about/` 與醫師頁彙整並外連原始來源。

### ④ llms.txt（低成本先做）

根目錄放置 `/llms.txt`，以 Markdown 條列核心資訊與重要頁面索引，搭配 `/llms-full.txt` 提供完整內容。

此為 2024 年後興起的社群慣例，**並非正式標準、各 AI 引擎支援程度不一**，但製作成本極低（可由後台自動生成）。

### ⑤ 監測：GEO 沒有 Search Console

- 建立 **30–50 題目標問句清單**（涵蓋困擾、療程、地區、品牌四軸），每月在 ChatGPT、Perplexity、Google AI Overviews、Gemini 實測。
- 記錄三個指標：**是否被提及**、**是否被列為引用來源**、**AI 對品牌的描述是否正確**（描述錯誤代表實體訊號不足，需回頭補 ③）。
- 在 GA4 建立區隔，追蹤來自 `chatgpt.com`、`perplexity.ai`、`claude.ai` 的 referral 流量成長。
