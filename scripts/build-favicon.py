#!/usr/bin/env python3
"""站台圖示：由 20SKIN 的標誌產出 favicon.ico 與 apple-touch-icon.png。

用法：python3 scripts/build-favicon.py
輸出：apps/web/public/favicon.ico        （16／32／48／64 四個尺寸包在同一個檔）
      apps/web/public/apple-touch-icon.png（180×180）

⚠️ **來源是 `mockup/assets/logo.jpg`，不是 `mockup/assets/img/banner-logo.png`。**
   後者是**白色浮水印版**（LA 模式、幾乎純白），拿它做圖示會得到一個在淺色
   分頁列上完全看不見的白方塊 —— 檔名裡沒有任何字說明這件事，只有打開來看才知道。
   `reference/logo.jpg` 與 `mockup/assets/logo.jpg` 是同一張（167×164 藍字白底）。

⚠️ **白底是刻意的，不要改成透明。** 這個標誌是細線條的藍色橢圓外框，
   透明底在深色分頁列上會只剩幾根藍線、糊成一團。白底讓它變成一塊有邊界的
   「晶片」，深淺兩種分頁列上都認得出來。代價是深色模式下是白方塊，這是
   多數品牌圖示的做法，可以接受。

⚠️ **不留內距。** 原圖的橢圓本來就貼齊四邊（內容 bbox 164×164／全圖 167×164），
   16px 時每一個像素都珍貴，再往內縮字就糊掉了。

⚠️ **16px 那張縮完之後要加一次對比，其餘尺寸不要加。**
   這個標誌是細線條，直接 LANCZOS 縮到 16 會糊成一塊淺藍、在分頁列上跟
   「還沒載入完的空白圖示」分不出來。縮完 `Contrast(1.9)` 之後外框變回實心
   藍環，認得出是哪個分頁 —— 裡面的「2 SKIN 0」在 16px 一定讀不出來，
   那是解析度的極限，不是可以調出來的。
   試過但**不要用**的兩種：先銳化再縮（灰邊更糊）、縮完銳化再加對比
   （邊緣壓成黑色，變成另一個標誌）。32 以上直接縮就很清楚，加了反而刺眼。

⚠️ **不加 `<link rel="icon">` 標記。** 瀏覽器會自己去要 `/favicon.ico` 與
   `/apple-touch-icon.png`，放進 `apps/web/public/` 就生效。前台的標記是逐頁
   照抄 `mockup/` 的、由 `pnpm --filter web verify:css` 逐 byte 把關（CLAUDE.md
   決策 11），能不動就不動。

⚠️ 這是**版面素材不是內容圖**，所以進建置產物、不進 Blob（CLAUDE.md 決策 14）。

🔴 來源只有 167×164。48 與 64 那兩個尺寸是**放大**出來的，看得出軟。
   拿到院方的原始向量檔（AI／EPS／SVG）之後應該重跑這支，並把 SIZES 補到 256。
"""

from pathlib import Path

from PIL import Image, ImageChops, ImageEnhance

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "mockup/assets/logo.jpg"
OUT_ICO = ROOT / "apps/web/public/favicon.ico"
OUT_APPLE = ROOT / "apps/web/public/apple-touch-icon.png"

# .ico 裡包這幾個尺寸。16＝分頁列、32＝書籤與 Retina 分頁、48＝Windows 捷徑、
# 64＝部分桌面環境。多包幾個比讓瀏覽器自己縮好，縮圖演算法各家不同。
SIZES = [16, 32, 48, 64]
APPLE_SIZE = 180

# 縮到這個尺寸以下就要補對比，否則細線條糊掉（見檔頭）。
CONTRAST_AT_OR_BELOW = 16
CONTRAST_FACTOR = 1.9


def trimmed_square(im: Image.Image) -> Image.Image:
    """去掉純白邊之後補成正方形。來源不是正方形（167×164），直接縮會壓扁。"""
    rgb = im.convert("RGB")
    diff = ImageChops.difference(rgb, Image.new("RGB", rgb.size, (255, 255, 255)))
    # 門檻 12 是為了吃掉 JPEG 在白底上的雜訊，不是為了裁掉淺色內容。
    bbox = diff.convert("L").point(lambda p: 255 if p > 12 else 0).getbbox()
    cropped = rgb.crop(bbox)

    side = max(cropped.size)
    canvas = Image.new("RGB", (side, side), (255, 255, 255))
    canvas.paste(cropped, ((side - cropped.width) // 2, (side - cropped.height) // 2))
    return canvas


def render(square: Image.Image, size: int) -> Image.Image:
    out = square.resize((size, size), Image.LANCZOS)
    if size <= CONTRAST_AT_OR_BELOW:
        out = ImageEnhance.Contrast(out).enhance(CONTRAST_FACTOR)
    return out


def main() -> None:
    square = trimmed_square(Image.open(SRC))

    # ⚠️ 逐尺寸自己縮，不要只丟一張進去讓 `sizes=` 代勞 —— 那樣每一格都是同一套
    #    處理，16px 就補不了對比。`append_images` 要 Pillow ≥ 9.3。
    # 🔴 **基準圖必須是最大的那張。** Pillow 的 ICO 匯出拿基準圖的尺寸當上限
    #    （`IcoImagePlugin._save`：`size[0] > width` 就 continue），拿 16×16 當
    #    基準的話 32／48／64 會被**靜默丟掉**，存出來的 .ico 只有一格 ——
    #    不會有任何警告，檔案也開得起來。存完請檢查 `info['sizes']`。
    frames = sorted((render(square, s) for s in SIZES), key=lambda f: -f.width)
    frames[0].save(
        OUT_ICO,
        format="ICO",
        sizes=[(s, s) for s in SIZES],
        append_images=frames[1:],
    )

    written = sorted(Image.open(OUT_ICO).info["sizes"])
    assert written == [(s, s) for s in SIZES], f"ico 只寫進 {written}"

    render(square, APPLE_SIZE).save(OUT_APPLE, format="PNG", optimize=True)

    print(f"✓ {OUT_ICO.relative_to(ROOT)}（{'／'.join(str(s) for s in SIZES)}）")
    print(f"✓ {OUT_APPLE.relative_to(ROOT)}（{APPLE_SIZE}×{APPLE_SIZE}）")


if __name__ == "__main__":
    main()
