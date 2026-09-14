// 從檔案標頭讀出影像尺寸。JPEG／PNG／GIF／WebP／BMP。
//
// ⚠️ **為什麼不用 sips 或 PIL**：一張圖開一個 process，3300 張要多花十幾分鐘，
//    而且 sips 對壞掉的檔案會卡住不回。標頭解析是純計算，壞檔就回 null。
//
// ⚠️ **JPEG 要走完 marker 鏈**。很多人用「找 0xFFC0」的寫法 —— 那在漸進式 JPEG
//    （marker 是 0xFFC2）與帶 EXIF 縮圖的檔案上會讀到縮圖的尺寸，不是圖片本身的。

/** SOFn：C0–C3、C5–C7、C9–CB、CD–CF。⚠️ C4/C8/CC 不是 SOF（是 DHT／JPG／DAC）。 */
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])

export function imageSize(buf) {
  if (buf.length < 16) return null

  // PNG
  if (buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), type: 'png' }
  }

  // GIF
  if (buf.subarray(0, 3).toString('latin1') === 'GIF') {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8), type: 'gif' }
  }

  // WebP（RIFF….WEBP）—— 三種變體的尺寸位置各不相同
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') {
    const fourcc = buf.subarray(12, 16).toString('latin1')
    if (fourcc === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff, type: 'webp' }
    if (fourcc === 'VP8L') {
      const b = buf.readUInt32LE(21)
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1, type: 'webp' }
    }
    if (fourcc === 'VP8X') {
      const rd = (o) => buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16)
      return { width: rd(24) + 1, height: rd(27) + 1, type: 'webp' }
    }
    return null
  }

  // BMP
  if (buf[0] === 0x42 && buf[1] === 0x4d) {
    return { width: Math.abs(buf.readInt32LE(18)), height: Math.abs(buf.readInt32LE(22)), type: 'bmp' }
  }

  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue }          // 對不齊時往前找下一個 0xFF，不要整個放棄
      const marker = buf[i + 1]
      if (marker === 0xff) { i++; continue }          // fill byte
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9) || marker === 0x01) { i += 2; continue }
      const len = buf.readUInt16BE(i + 2)
      if (len < 2) return null
      if (SOF.has(marker)) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7), type: 'jpeg' }
      }
      if (marker === 0xda) return null                // 進到影像資料還沒遇到 SOF＝壞檔
      i += 2 + len
    }
    return null
  }

  return null
}
