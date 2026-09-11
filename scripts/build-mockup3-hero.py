#!/usr/bin/env python3
"""mockup3 的 Hero 輪播底圖：各裁切成 2400×1314。不調色、不放大。

用法：python3 scripts/build-mockup3-hero.py
輸出：mockup3/assets/img/hero-bamboo.jpg、hero-exterior.jpg

⚠️ **不做任何調色。** 出來的顏色就是原圖的顏色。
   這是客戶連續三次反映「霧霧的」之後定下來的（2026-08-20）：
   降飽和／冷調的本意是把暖色壓掉去配全站的藍白調，代價就是畫面變灰。
   **不要再加回任何 ImageEnhance 的調整**，也不要改用 CSS filter 去補
   （saturate()／brightness() 疊在 Hero 上是同一件事換個地方做）。

⚠️ 也**不做放大**。這是換圖的主因：舊的接待區實景只能從 1260×800 的
   banner1-L.jpg 裁出 840×460 再放大 2.9 倍，1440 視窗實際取樣 1.8 倍、
   Retina 3.6 倍，客戶反映「解析度很差」。現在的來源是 4000×5333，
   裁 2850×1561 之後是**縮小**到 2400×1314，每一個像素都是實的。
   ⚠️ 換任何新來源都要守這一條：裁切區的短邊 ≥1314，否則又會回到放大。

來源與授權見 reference/hero-bamboo-source.txt。**那是素材庫的意象圖，
不是院方實景**，正式上線前要請院方確認去留。

---------------------------------------------------------------------
舊版（院方接待區實景）的配方，要換回去的話用這組
---------------------------------------------------------------------
SRC  = reference/banner1-L.jpg   (1260×800)
CROP = (250, 250, 1090, 710)     # 840×460
⚠️ 那張的裁切三面都受限，不要自己重裁：天花板彩色燈箱在 y<250、
   左側紅色聖誕裝飾在 x<250、右側粉紅糖果罐在 x>1090。三者都是暖色。
放大到 2400×1314，前後各補一次 UnsharpMask（先 (1.0,90) 再 (2.6,55)）——
細節在原生解析度時最實，先銳化才有東西可以放大。
產物仍留在 mockup3/assets/img/hero-clinic.jpg，沒有刪。
拿到院方的 banner1 原始檔（見 CLAUDE.md「待客戶提供」）之後，
這張實景就不必放大了，換回去會比現在更好。
"""
from pathlib import Path
from PIL import Image, ImageStat

ROOT = Path(__file__).resolve().parent.parent
SIZE = (2400, 1314)

# ⚠️ 兩張都必須「中央是乾淨的亮面」——Hero 是**置中壓字**，輪播每一張都要能
#    托住同一組墨藍文字。這是選圖的硬條件，比構圖好不好看更優先。
#    ⚠️ 加第三張之前先量：把新圖丟進 Hero，量主標／副標／eyebrow 的 p5
#    對比，全部 ≥4.5:1 才收。不要憑肉眼判斷「應該還好」。
SLIDES = [
    # 1. 竹影白牆（Unsplash 意象圖，非院方實景，見 hero-bamboo-source.txt）
    #    竹葉壓左側約四分之一，中央到右側是白牆。
    ("reference/hero-bamboo-source.jpg", (1600, 500, 4000, 1814),
     "mockup3/assets/img/hero-bamboo.jpg"),
    # 2. 四季診所外觀（院方實景，banner3-L 7877×5254）
    #    ⚠️ 這個裁切區是避開東西選的，不要往下或往右擴：
    #    黃色三角錐在 y>3700、紅白柵欄桿與「診所專屬機車入口」藍色告示牌在
    #    x>5300。黃與紅都會破壞全站的藍白調，告示牌則讓 Hero 變成「停車導引」。
    #    中央落在白色磚牆上，是這張唯一乾淨的亮面。
    ("reference/banner3-L.jpg", (900, 300, 5280, 2698),
     "mockup3/assets/img/hero-exterior.jpg"),
]

# ⚠️ 竹葉只佔左邊約四分之一是刻意的。1440 視窗下 cover 只會左右各裁掉 45px
#    （版位 1.719 對圖 1.826），預覽看到的比例就是瀏覽器裡的比例，
#    不要用「預覽很空」當理由把竹葉往中間搬——墨藍字壓在綠葉上會掉到 3:1 以下。
for src, crop, out in SLIDES:
    im = Image.open(ROOT / src).convert("RGB").crop(crop)
    assert im.size[1] >= SIZE[1], f"{src} 裁切高度 {im.size[1]} < {SIZE[1]}，會變成放大"
    if im.size != SIZE:
        im = im.resize(SIZE, Image.LANCZOS)
    dst = ROOT / out
    im.save(dst, quality=88, optimize=True, progressive=True)
    st = ImageStat.Stat(im.convert("L"))
    print(f"{out}  {im.size[0]}×{im.size[1]}  "
          f"L 平均 {st.mean[0]:.1f} / 標準差 {st.stddev[0]:.1f}  "
          f"{dst.stat().st_size/1024:.0f} KB")
