# mockup 圖片來源與授權

分兩類，**檔名前綴就是分類，不要混用**：

| 前綴 | 意義 | 可以怎麼用 |
|---|---|---|
| `photo-*` | **院方自有照片**，由 `reference/banner*-L.jpg`（7900px 原檔）裁切 | 可標示為四季診所／二林四季皮膚科的實景 |
| `stock-*` | **授權素材圖**，非院方場地與人員 | 只能當意象圖。**不得**標示為院方院區、醫師、患者或療程實績 |
| 其餘（`banner*` / `index-p*` / `product-*` / `doctor-*` / `spec-*`） | 自現行線上網站抓取 | 見 CLAUDE.md 的解析度限制 |

---

## 一、院方自有照片（自 7900px 原檔裁切）

| 檔案 | 尺寸 | 內容 | 原檔 |
|---|---|---|---|
| `photo-glass-facade.jpg` | 1488×1800 | 玻璃立面與 20SKIN 蝕刻標誌（直式） | `reference/banner3-L.jpg` |
| `photo-glass-facade-wide.jpg` | 1800×1200 | 同上，橫式 3:2（品牌理念頁 Hero 用） | `reference/banner3-L.jpg` |
| `photo-facade-detail.jpg` | 1800×1167 | 白磚立面、大理石柱與招牌 | `reference/banner3-L.jpg` |
| `photo-street-green.jpg` | 1800×1119 | 診所周邊行道樹與街景 | `reference/banner3-L.jpg` |
| `photo-brand-detail.jpg` | 1800×1038 | 品牌氣球與大理石牆細節 | `reference/banner2-L.jpg` |

裁切原則：只取原檔的**對焦清晰區域**。`banner2-L` 的對焦落在氣球上，牆面銘牌是散景，
因此沒有從它裁出「品牌牆」大圖 —— 那張要清楚的版本仍須請院方提供。

重新產生：見本檔末的裁切座標。

---

## 二、授權素材圖（Unsplash License）

**Unsplash License：可免費商用、可修改、不強制標註來源**（<https://unsplash.com/license>）。
以下皆為免費授權圖，**不含 Unsplash+ 付費內容**。

| 檔案 | 攝影 | 來源 | 用途定位 |
|---|---|---|---|
| `stock-bamboo-wall.jpg` | pei_jinshu | <https://unsplash.com/photos/jo3h5rfqokw> | 竹影白牆，新中式主意象（mockup3 已用過，見 `reference/hero-bamboo-source.txt`） |
| `stock-garden-window.jpg` | Sang Kwak | <https://unsplash.com/photos/tYk1ZuxGjt0> | 開窗框景，對應「以框取景／留白」 |
| `stock-bamboo-corridor.jpg` | Zion C | <https://unsplash.com/photos/-XXvbeNXTRA> | 木格柵長廊與竹 |
| `stock-zen-garden.jpg` | Yosuke Ota | <https://unsplash.com/photos/uC5UlYnAbZ4> | 枯山水庭園 |
| `stock-camellia.jpg` | 𝕡𝕒𝕨𝕤 𝕒𝕟𝕕 𝕡𝕣𝕚𝕟𝕥𝕤 | <https://unsplash.com/photos/uI1UDF9SATI> | 白山茶，季節與細節意象 |
| `stock-stones.jpg` | Camilo Contreras | <https://unsplash.com/photos/zXRi9SSh7w8> | 黑白疊石，水墨感抽象圖 |
| `stock-reception.jpg` | 何青蓝 | <https://unsplash.com/photos/ECBg5FQkBXI> | 白色弧形接待空間（**非本院**） |
| `stock-corridor.jpg` | — | <https://unsplash.com/photos/jH05wxjmAWE> | 明亮診間走廊（**非本院**） |
| `stock-facial-calm.jpg` | Masum Rahimi | <https://unsplash.com/photos/MGKzomg0Dts> | 閉眼臉部特寫，療程情境 |
| `stock-skincare-smile.jpg` | Look Studio | <https://unsplash.com/photos/TQSPgNqeCo8> | 白底保養情境 |
| `stock-clinical-hands.jpg` | karelys Ruiz | <https://unsplash.com/photos/PqyzuzFiQfY> | 戴手套的療程操作 |
| `stock-injection.jpg` | Sum Sum | <https://unsplash.com/photos/NshDDYxfGUg> | 注射類療程情境（黑手套、側臉） |

### ⚠️ 使用限制（不可違反）

1. **不得標示為院方場地或人員。** 圖說與 alt 一律寫成情境／意象描述，不寫「四季診所○○室」。
2. **不得作為案例前後對比、療效佐證或患者照片。** 案例頁的術前術後一律留佔位框。
3. **不得與醫師姓名、職稱並列**，避免被誤讀為該醫師本人或其執行的療程。
4. 正式上線前請院方確認每一張的去留；若沿用，建議在頁尾標註攝影者姓名（授權沒有強制，是業界慣例）。

---

## 三、裁切座標（重新產生用）

```python
from PIL import Image
b2 = Image.open('reference/banner2-L.jpg')   # 7911x5277
b3 = Image.open('reference/banner3-L.jpg')   # 7877x5254
b3.crop((900, 1200, 2900, 3620))  # photo-glass-facade
b3.crop((700, 800, 3700, 2800))   # photo-glass-facade-wide
b3.crop((1500, 0, 5200, 2400))    # photo-facade-detail
b3.crop((4500, 0, 7877, 2100))    # photo-street-green
b2.crop((2400, 3200, 6000, 5277)) # photo-brand-detail
# 一律 LANCZOS 縮到長邊 1800、JPEG q82 progressive
```

⚠️ 裁圖不要用 `sips --cropOffset`（相對中心偏移，超界會靜默失效），用 PIL 的 `crop((l,u,r,lo))`。
