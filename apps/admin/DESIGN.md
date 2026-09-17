# 後台設計系統契約（第一階段產出）

給第二階段（14 個 pages ＋ 7 個 components 的切版）的人看。只看這份文件與
`src/admin.css` 就應該能動工，不必回頭問設計決策為什麼這樣定。

範圍：這一階段只重做了 `src/admin.css`（全部）、`src/AdminLayout.vue`（外框）、
`src/pages/Login.vue`（獨立版面）。**其餘 14 個 pages 與 7 個 components 完全
沒有動過任何一行**——它們現在看到的視覺提升，全部來自 `admin.css` 沿用舊
class 名稱但重新定義了樣式，不是巧合，是刻意設計成這樣（見下方「相容策略」）。

---

## 1. 設計決策與理由

### 1.1 方向：延續 mockup A，不是另立一套後台美學
後台與前台（`apps/web`，樣式抄自 `mockup/`）必須讀起來是同一個機構。沿用
的東西：白底、直角＋細框（`--radius-sm`/`--radius-md` 而非大圓角）、暖金
`--accent`、宋體標題×黑體內文的對比。**沒有沿用**的東西：前台的大留白／
藝廊感——後台是工具，密度要高，用邊框與表格分組，不是留白分段。

### 1.2 核心排版規則：「標題宋體、操作黑體」
這是整份重做**唯一**的字體規則，套用到後台自己的每一個元件：

- **宋體**（`--font-serif`）：`.adm-page__title`、`.adm-card__title`、
  `.adm-stat-card__value`、登入頁 `.adm-login__title`／`.adm-login__wordmark`。
  這些是「標題」，位階等同前台的 h1/h2。
- **黑體**（`--font-base`，其實就是不覆寫，因為 `body` 預設就是黑體）：
  按鈕、表格、表單欄位、標籤、麵包屑、側欄選單、`.adm-fieldset__legend`
  （這是「結構標籤」不是「標題」，刻意不用宋體，跟卡片標題拉開位階）。

新增元件一律照這條規則分類，不要看心情選字體。

### 1.3 側欄維持深色，但接上前台頁尾的視覺語彙，不是憑空一塊深色
前台頁尾（`.c-footer`）是深色（`--brand-700`）＋ 頂端一道暖金細線
（`.c-footer::before`）＋ 一圈白色描邊的月洞門（`.c-ring--footer`，
base.css 「簽名視覺語言」三處之一）。後台側欄現在**直接借用同一套語彙**：

- `.adm-sidebar::before` 是同一道暖金線（顏色、透明度、高度都對齊
  `.c-footer::before`）。
- `.adm-brand__ring` 套用 base.css 的 `.c-ring` 基底 class＋自己補位置尺寸，
  是白色描邊圓框，貼齊品牌區塊右上角裁切——直接呼應 `.c-ring--footer`。
- 登入頁的品牌欄（`.adm-login__aside`）比照辦理，多一個 `.adm-login__ring`。

這不是裝飾抽屜，是全後台**僅有的兩處**暖金用色之一（另一處見下）——
base.css 自己的規矩是「暖金全站僅兩處」，後台比照辦理，不要因為喜歡這個
顏色就到處加。

### 1.4 側欄選中狀態：左側 2px 金線，不是整塊底色高亮
舊版是 `background: rgba(255,255,255,.14)` 整塊高亮，是最常見的後台樣板
（哪個開源後台模板都長這樣）。新版把它換成 `border-left: 2px solid
var(--accent)` ＋ 微弱的背景（`.06` 透明度，只是讓可點區域看得出來，
不是重點），讓「選中」這件事跟側欄頂端的暖金線是同一個訊號，而不是
另外發明一種高亮語言。這是後台裡暖金用色的**第二處，也是最後一處**。

### 1.5 卡片不用陰影
`.adm-card`、`.adm-stat-card` 都只有 1px 邊框，沒有 `box-shadow`。這是刻意
的：前台的 `.c-card` 在 2026-08-15 的視覺收斂裡就拿掉了陰影跟邊框（改用
留白分層），道理寫在 `mockup/assets/base.css` §11 開頭注解。後台雖然還是
需要邊框做資料分組（不是雜誌排版，這點跟前台不同），但「處處一層淡淡
灰色陰影」是最容易讓介面看起來像套版樣板的手法之一，這裡刻意不用。

### 1.6 狀態色收斂成具名 token，徽章與訊息框共用同一套
舊版每個元件各自寫一次 hex（`.adm-badge--review` 的 `#8A5A22`、
`.adm-risk-hit` 的 `#8A5A22`……相同顏色出現在三個地方，寫死三次）。
現在收進 `admin.css` §1 的 `--adm-danger`/`--adm-danger-bg`、
`--adm-warn`/`--adm-warn-bg`、`--adm-ok`/`--adm-ok-bg`、
`--adm-info`/`--adm-info-bg`（= `--brand-700`/`--brand-050`，因為
「已排程」在語意上就是品牌藍，不是新造一個顏色）。**新增任何徽章／
訊息／警示樣式，一律引用這幾個 token，不要再寫一次 hex。**

### 1.7 訊息元件重新命名：`.adm-login__error`／`.adm-workflow__banner` 是舊債
這兩個 class 名字本身就是問題：`.adm-login__error` 只該出現在登入頁，卻被
`ListPage.vue`、`EditPage.vue` 拿去當一般錯誤訊息用；`.adm-workflow__banner`
名字綁死「工作流」，但其實只是一般的成功／提示訊息。新增了 `.adm-alert`
家族（`--danger`/`--success`/`--info`/`--warn`）取代它們，語意與命名對得起來。
**舊 class 名保留成視覺相同的別名**（見 admin.css §12），所以現有頁面
現在看起來完全正常，不用馬上改；但新畫面、以及第二階段真的動到那幾行
的時候，請直接換成 `.adm-alert.adm-alert--danger` 這種寫法，別名只是
過渡期的安全網，不是長期契約（詳見第 4 節對照表）。

### 1.8 登入頁獨立設計：左右分欄
登入頁是唯一不套 `AdminLayout` 的畫面，舊版是「深色背景置中一張白卡」——
能用但沒有識別度，跟任何後台模板長得一樣。新版改成左右分欄：左側深色
品牌欄（宋體 wordmark「20SKIN」＋月洞門，見 1.3）、右側白底表單。840px
以下品牌欄收成一條橫向窄欄（見 admin.css §15 的 RWD），保留識別但不擠
壓表單——手機上登入後台是會發生的事（醫師在診間用手機處理），不能砍掉。

品牌欄整塊 `aria-hidden="true"`：裡面的「20SKIN」文字對螢幕報讀器是重複
資訊（`<title>` 已經是「20SKIN 後台管理」），沒有必要再唸一次，真正需要
被讀到的標題是表單那側的 `<h1>登入</h1>`。

### 1.9 可及性
- 全站沿用 base.css 的 `:focus-visible`（品牌藍外框），沒有在 admin.css
  裡覆寫或關閉過。
- 表單一律 `<label for="...">` 對應 `id`（既有慣例，維持）。
- `.adm-spinner` 的轉動尊重 `prefers-reduced-motion: reduce`：不是變慢，
  是整個關掉、退化成一個靜止的灰圈（旋轉本身就是唯一的訊息載體，慢下來
  沒有意義）。側欄 accordion 的四項硬性行為（見 admin.css §5 開頭注解）
  一併保留，包含 reduced-motion 分支。
- 登入頁的錯誤訊息 `.adm-alert--danger` 加了 `role="alert"`（原本沒有）。

---

## 2. Token 用法

**顏色、字體、間距、圓角一律用 `mockup/assets/base.css` 的變數**
（`--brand`/`--brand-600`/`--brand-700`/`--brand-050`/`--ink`/`--ink-70`/
`--ink-50`/`--line`/`--line-soft`/`--paper`/`--surface-alt`/`--fill-hover`/
`--fill-media`/`--accent`/`--sp-1`…`--sp-10`/`--fs-eyebrow`…`--fs-display`/
`--font-serif`/`--font-base`/`--radius-sm`/`--radius-md`/`--ease`/`--dur`/
`--dur-slow`）。**不要改 base.css**，它是前台的檔案；後台看得到它是因為
`index.html` 有 `<link rel="stylesheet" href="/assets/base.css">`。

後台專屬的 token 在 `admin.css` 的 `:root`（`--adm-` 前綴），現在有：

| Token | 值 | 用途 |
|---|---|---|
| `--adm-sidebar-w` | 240px | 側欄寬度 |
| `--adm-topbar-h` | 60px | 頂列高度 |
| `--adm-radius` | `var(--radius-md)` | 後台元件統一圓角，不要另外寫數字 |
| `--adm-content-max` | 1280px | `.adm-main` 內容寬度上限 |
| `--adm-danger` / `--adm-danger-bg` | `#B3452C` / `#F5E9E6` | 危險／刪除／錯誤 |
| `--adm-warn` / `--adm-warn-bg` | `#8A5A22` / `#FBF3E9` | 審核中／風險字詞提示 |
| `--adm-ok` / `--adm-ok-bg` | `#2F6B4F` / `#E9F3EC` | 已發布／成功 |
| `--adm-info` / `--adm-info-bg` | `var(--brand-700)` / `var(--brand-050)` | 已排程／一般提示 |

新增元件需要狀態色時，一律從這張表挑，不要新增第五種顏色，也不要繞過
token 直接寫 hex。

---

## 3. 元件目錄（`.adm-*`）

以下每個元件給「用途」＋「正確標記範例」。範例是精簡過的，實際欄位
以 `src/unit-schema.ts`／各 `units/*.ts` 為準。

### 3.1 頁面外框
```html
<section class="adm-page">                 <!-- 系統類畫面（帳號、角色、301…）用它包整頁 -->
  <div class="adm-page__head">
    <div>
      <h1 class="adm-page__title">帳號管理</h1>
      <p class="adm-page__desc">共 12 筆</p>
    </div>
    <div class="adm-page__actions">
      <button type="button" class="btn btn--primary">＋ 新增帳號</button>
    </div>
  </div>
  <!-- 其餘內容：.adm-card / .adm-table-wrap / .adm-form … -->
</section>
```
`ListPage.vue`／`EditPage.vue`／`Dashboard.vue` 沒有套 `.adm-page`（它們的
根節點是裸的 `<div>`），這是既有寫法，這階段沒有改，不算遺漏。

### 3.2 卡片
```html
<div class="adm-card">
  <p class="adm-card__title">工作流</p>   <!-- 或 <h2>，語意上是標題就用 h1~h6 -->
  …內容…
</div>
```
連續多張卡片直接相鄰即可，`.adm-card + .adm-card` 已經處理間距，不用額外包 wrapper。

### 3.3 列表頁（`ListPage.vue` 現在的樣子，供參考）
`.adm-page__head` → `.adm-filters`（篩選列，含 `.adm-filters__spacer` 把批次
操作按鈕推到最右）→ `.adm-table-wrap > table.adm-table` → `.adm-pagination`。
表格列的「標題」欄位用 `.adm-table__title`（會 hover 變品牌色）。排序是**拖曳**
（2026-09-17）：第一欄 `.adm-table__handle` 放 `<DragHandle>`（`.adm-drag-handle`），
機制在 `src/drag-sort.ts`，樣式在 admin.css §18。
⚠️ 把手只在「這個單元排得動」時才出現 —— 一次排序超過 100 筆會被 API 擋下，
所以文章與分類標籤那種量級不給拖，改在表格下方說明原因。
⚠️ `.adm-table__drag` 是**另一回事**：它是 `StructuredNode`／關聯選擇器那些
仍用 ↑↓ 的小圖示按鈕，不要跟拖曳把手混用。

### 3.4 編輯表單
`.adm-form` 包住整個編輯區；每個欄位群組用 `.adm-fieldset`
（`.adm-fieldset__legend` 是段落標籤，黑體，不是標題）；欄位排列用
`.adm-field-grid`（預設 2 欄，`--single` 改 1 欄，700px 以下自動收 1 欄）；
單一欄位是 `.adm-field`（`__label`／`__required`／`__hint`／`__count`／
`__error` 四個子元素視情況搭配）：
```html
<div class="adm-field adm-field--span2">
  <label class="adm-field__label">標題<span class="adm-field__required">＊</span></label>
  <input class="adm-input" type="text" required>
  <p class="adm-field__hint">…</p>
</div>
```
輸入元件三選一：`.adm-input`／`.adm-textarea`（`--tall` 給長文字）／
`.adm-select`。checkbox 用 `.adm-checkbox`（`<label>` 包 `<input>` ＋ 文字）。

### 3.5 狀態徽章
```html
<StatusBadge :status="record.status" :publish-at="record.publishAt" />
<!-- 元件內部渲染： -->
<span class="adm-badge adm-badge--published">已發布</span>
```
五個 modifier：`--draft`／`--review`／`--published`／`--scheduled`／
`--unpublished`。顏色全部來自 §2 的 token，不要新增第六種狀態顏色。

### 3.6 訊息元件（新）
```html
<!-- 錯誤 -->
<p class="adm-alert adm-alert--danger" role="alert">儲存失敗。</p>
<!-- 成功 -->
<p class="adm-alert adm-alert--success">本文已儲存。</p>
<!-- 一般提示（品牌藍色調，語意上等同「資訊」） -->
<p class="adm-alert adm-alert--info">已更新排程。到這個時間點，前台就會看得到。</p>
<!-- 提醒（審核中一類，暖黃色調） -->
<p class="adm-alert adm-alert--warn">送審後本文會鎖定，無法再編輯。</p>
```
⚠️ **`.adm-login__error` 與 `.adm-workflow__banner` 已經不存在**（2026-09-17）。
第一階段把它們保留成別名當過渡，第二階段把全部呼叫端改完之後，那兩條選擇器
就沒有消費者了，已從 `admin.css` 刪除。看到舊名的話那是還沒改到的殘留，
不是另一種合法寫法。

### 3.7 空狀態／載入中
```html
<!-- 最小寫法（現有 14 個畫面都是這樣，不用強制升級） -->
<div class="adm-empty">目前沒有資料。</div>

<!-- 完整寫法（新畫面請用這個） -->
<div class="adm-empty">
  <div class="adm-empty__icon"><svg …></svg></div>
  <p class="adm-empty__title">目前沒有資料</p>
  <p class="adm-empty__desc">新增第一筆內容，或調整篩選條件再試一次。</p>
</div>

<!-- 載入中：新元件，取代拿 .adm-empty 裝文字的舊寫法 -->
<div class="adm-loading">
  <span class="adm-spinner" aria-hidden="true"></span>
  <span>載入中…</span>
</div>
```
「載入中」「找不到資料」「沒有權限」現在全部擠在同一個 `.adm-empty` 裡
（純文字），視覺上分不出差異。第二階段有餘裕時，`loading` 狀態請換成
`.adm-loading`（有轉圈动畫，使用者才知道「正在動」而不是「壞了」）。

### 3.8 按鈕與標籤
完全沿用 `base.css` 的 `.btn`（`--primary`/`--ghost`/`--line`/`--sm`/`--block`）
與 `.c-tag`，後台沒有自己的按鈕樣式。分寸：
`--primary` 給主要動作（儲存、送審、發布）、`--ghost` 給次要但仍是正面
動作（新增分類）、`--line` 給中性或收斂動作（下架、上一頁、登出）。

### 3.9 專用表單元件
`Repeater.vue`（`.adm-repeater*`）、`HoursEditor.vue`（`.adm-hours-editor*`）、
`RelationPicker.vue`（`.adm-relation*`）、`ImageField.vue`（`.adm-upload*`）、
標籤欄位（`.adm-tags*`）——這五個 component 的樣式沒有結構性改動，只是
共用了新的 token（圓角、間距、顏色 token 化）。標記方式維持原樣，直接看
對應的 `.vue` 檔案即可，不需要重新設計。

### 3.10 編輯畫面版面
`.adm-editor-layout`（主欄 1fr ＋ 右側 300px 工作流欄，1000px 以下收 1 欄）
＋ `.adm-workflow`（`position: sticky`，跟著捲動）。內部沿用 `.adm-card`／
`.adm-workflow__row`／`__label`／`__actions`／`__note`。

---

## 4. 改名／刪除對照表

| 舊 class | 現況 | 新寫法／備註 |
|---|---|---|
| `.adm-sidebar__brand`（含內部裸 `img`/`strong`/`span`） | **已直接改掉**，只存在於 `AdminLayout.vue`，沒有其他頁面引用 | `.adm-brand` ＋ `.adm-brand__ring`／`__mark`／`__text`／`__name`／`__sub` |
| `.adm-login__error` | **已刪除**（2026-09-17）。第一階段保留成別名當過渡，第二階段改完呼叫端後沒有消費者了 | `class="adm-alert adm-alert--danger"` |
| `.adm-workflow__banner` | **已刪除**（2026-09-17），同上 | `class="adm-alert adm-alert--info"`，或依語意選 `--success`／`--warn` |
| `.adm-page`（裸 class，9 個系統頁在用） | **之前完全沒有對應的 CSS 規則**（套了等於沒套） | 現在有實際樣式（`display:flex; flex-direction:column; gap: var(--sp-5)`），HTML 不用改，畫面會自動變好看一點 |
| `AdminLayout.vue` 裡 topbar+main 外面那層裸 `<div>` | 加了 class，純命名，無視覺差異 | `.adm-body` |
| （新增）`.adm-alert` ＋ 4 個 modifier | — | 見 3.6，取代未來所有新的訊息用途 |
| （新增）`.adm-loading` ＋ `.adm-spinner` | — | 見 3.7，取代未來的載入中畫面 |
| （新增）`.adm-empty__icon`／`__title`／`__desc` | — | 見 3.7，`.adm-empty` 純文字舊寫法仍相容 |
| `.adm-nav__badge` | CSS 仍在，**目前沒有任何畫面使用**（沿用舊狀態，本階段沒有新增資料串接） | 保留給未來需求（例如審核佇列掛未讀數字），不是這階段的遺漏 |

**沒有列在表裡的 class，全部原封不動**（名稱與用途都沒變，只有視覺細節
調整）：`.adm-card`、`.adm-table*`、`.adm-field*`、`.adm-input`／
`.adm-textarea`／`.adm-select`、`.adm-badge*`、`.adm-form`、`.adm-fieldset*`、
`.adm-filters*`、`.adm-pagination*`、`.adm-stat-*`、`.adm-dashboard-grid`、
`.adm-list-item*`、`.adm-editor-layout`、`.adm-workflow*`、`.adm-repeater*`、
`.adm-relation*`、`.adm-tags*`、`.adm-hours-editor*`、`.adm-upload*`、
`.adm-risk-hit`、`.adm-checkbox`、`.adm-muted`、`.adm-divider`、
`.adm-inline-actions`。

---

## 5. 第二階段建議順序

按「換 class 就好」→「需要新版型」大致排列：

**只是換視覺 token、不用改標記**（`admin.css` 已經處理，開起來就會比較好看，
不需要動作）：`Dashboard.vue`、`Export.vue`、`Questions.vue`、`Roles.vue`、
`Settings.vue`、`SitemapSettings.vue`、`Users.vue`、`Menu.vue`、
`Redirects.vue`、`Review.vue`、`HomeSections.vue`、`UnitList.vue`、
`UnitEdit.vue`、`ListPage.vue`、`EditPage.vue`——以及 7 個 components
（`StatusBadge.vue`、`Repeater.vue`、`HoursEditor.vue`、`ImageField.vue`、
`RelationPicker.vue`）。

**建議在動到這些檔案時順手做的小升級**（不是必須，但既然要開檔案）：
1. `ListPage.vue`／`Dashboard.vue`：`載入中…` 的 `.adm-empty` 換成
   `.adm-loading` ＋ `.adm-spinner`（3.7）。
2. `ListPage.vue`：`目前沒有資料。` 升級成 `.adm-empty__icon/__title/__desc`
   完整寫法（3.7）。
3. `ListPage.vue`／`EditPage.vue`：`.adm-login__error` → `.adm-alert
   adm-alert--danger`；`EditPage.vue` 的 `.adm-workflow__banner` 依訊息
   語意拆成 `--success`（動作當場就完成了：本文已儲存／SEO 已儲存／
   已送出審核／已核准發布／已下架）與 `--info`（還有下文：已更新排程）兩種，
   不要全部塞同一個 modifier。
   ⚠️ **這份文件原本把「已核准發布，網站重建中」舉為 `--info` 的例子，那是錯的**
   （2026-09-17 更正）：那句文案本身是靜態站時代的殘留，SSR 之後沒有「重建中」
   這個會變的狀態（見 `EditPage.vue` 的 2026-09-16 註解），發布是工作流的完成點，
   所以它是 `--success`。唯一真正「還沒生效」的是排程。

**沒有版型變動**：這一階段沒有引入任何新的頁面骨架（沒有 tab、沒有
wizard、沒有 modal），所有 14 個頁面的資訊架構維持原樣，第二階段是換皮
不是重新設計版面。

---

## 6. 驗收指令（每次改完都要跑）

```bash
pnpm --filter admin exec vue-tsc --noEmit -p tsconfig.json
pnpm --filter admin build
```

⚠️ CLAUDE.md 的警告在這裡同樣成立：**Vue 讀不存在的東西不會報錯，只渲染成
空白，建置一律會成功。** 改完任何一個 `.vue` 檔案的 template，回頭對照同一
檔案的 `<script setup>`，確認每一個 binding（`v-model`、`:class`、
`v-if`、插值 `{{ }}`）都還指得到真實存在的變數或函式，不要只看 build
有沒有過。
