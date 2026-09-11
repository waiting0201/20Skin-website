// 媒體庫（docs/02-backend-cms.md §4 媒體庫、docs/09-frontend.md §9 直傳 Blob、
// docs/08-database.md §E `MediaAssets`／`MediaUsages`）。
//
// ⚠️ 持久化用 ./mock-store 開自己的 store，**不 import client.ts**——client.ts
// 已經 import 這支檔案（見對外門面 `adminApi.media`），互相 import 會循環相依
// （理由同 ./errors.ts 開頭的說明）。後果是這裡看不到九個內容模型的真實
// StoredRecord／真實 Id，`MediaUsages` 的種子資料只能用「單元＋標題」純文字
// 示意「這張圖被誰用」，不連到可點的編輯頁連結——正式站上這張表本來就是
// 由儲存內容時寫入的，Media.vue 顯示的是資料庫查回來的結果，不需要在前端反查。
//
// 上層畫面只透過 client.ts 匯出的 adminApi 取用，不直接 import 這個檔。
// 接上 api.20skin.tw 時整支換掉，畫面不必改（docs/09-frontend.md §8）。

import { ApiError } from './errors'
import { createStore } from './mock-store'
import type { UnitKey } from '../types'

// ── 型別 ────────────────────────────────────────────────────────────────

export type MediaUsageKind = 1 | 2 | 3 | 4 // 封面／圖庫／內文嵌入／OG 圖，docs/08 §E-2

export const USAGE_KIND_LABEL: Record<MediaUsageKind, string> = {
  1: '封面',
  2: '圖庫',
  3: '內文嵌入',
  4: 'OG 圖',
}

export interface MediaAsset {
  id: number
  /** 公開容器／私有容器（docs/08 §E-1）。mock 只示意兩個容器名稱。 */
  containerName: string
  /** 檔名用內容雜湊——這裡放的是示意用字串，不是真的 SHA-256。 */
  blobPath: string
  /** 私有檔案沒有可直接訪問的公開網址，讀取要另一組 SAS（本輪 mock 未做，見下方 note）。 */
  publicUrl: string | null
  originalFileName: string
  contentType: string
  byteSize: number
  width: number | null
  height: number | null
  /** ⚠️ 舊站 alt 普遍缺漏（docs/08 §E-1）；種子資料刻意留幾筆 null 示意這個缺口。 */
  altText: string | null
  caption: string | null
  isPrivate: boolean
  uploadedByUserId: number
  createdAt: string
}

export interface MediaUsage {
  id: number
  mediaId: number
  contentUnit: UnitKey
  contentTitle: string
  usageKind: MediaUsageKind
}

export interface MediaAssetWithUsage extends MediaAsset {
  usageCount: number
  usages: MediaUsage[]
}

export interface MediaListQuery {
  keyword?: string
  contentType?: 'image' | 'other' | ''
  /** 「只看未被引用」——清理孤兒檔用，docs/11-backend-design.md §9。 */
  unusedOnly?: boolean
}

interface MediaDb {
  version: number
  assets: MediaAsset[]
  usages: MediaUsage[]
}

// ── 種子資料 ────────────────────────────────────────────────────────────
//
// ⚠️ 寬高／檔案大小是示意用估算值，不是實測 EXIF——正式站由回報端點讀檔頭寫入
// （docs/11-backend-design.md §9）。檔名對應 mockup/assets/img/ 底下真實存在的檔案，
// 內容標題對齊 mock-seed.ts 的示意資料（'示範醫師一'／'示範藝術總監' 等），
// 兩邊都是示意資料，不是真人真事。

function seed(): MediaDb {
  const now = new Date().toISOString()

  const assets: MediaAsset[] = [
    { id: 1, containerName: 'public-media', blobPath: 'img/2024/09/1f3a9c7e2b41.jpg', publicUrl: '/assets/img/banner1.jpg', originalFileName: 'banner1.jpg', contentType: 'image/jpeg', byteSize: 482_000, width: 1600, height: 1000, altText: '四季診所大廳意象', caption: null, isPrivate: false, uploadedByUserId: 2, createdAt: now },
    { id: 2, containerName: 'public-media', blobPath: 'img/2024/09/6d0e5b8a13f2.jpg', publicUrl: '/assets/img/banner2.jpg', originalFileName: 'banner2.jpg', contentType: 'image/jpeg', byteSize: 455_000, width: 1600, height: 1000, altText: null, caption: null, isPrivate: false, uploadedByUserId: 2, createdAt: now },
    { id: 3, containerName: 'public-media', blobPath: 'img/2024/06/9a7c2d4e8f10.jpg', publicUrl: '/assets/img/doctor-anqiao.jpg', originalFileName: 'doctor-anqiao.jpg', contentType: 'image/jpeg', byteSize: 210_000, width: 900, height: 1200, altText: '示範藝術總監大頭照', caption: null, isPrivate: false, uploadedByUserId: 3, createdAt: now },
    { id: 4, containerName: 'public-media', blobPath: 'img/2024/06/3b5f8e1a9c72.jpg', publicUrl: '/assets/img/doctor-chao.jpg', originalFileName: 'doctor-chao.jpg', contentType: 'image/jpeg', byteSize: 198_000, width: 900, height: 1200, altText: null, caption: null, isPrivate: false, uploadedByUserId: 3, createdAt: now },
    { id: 5, containerName: 'public-media', blobPath: 'img/2024/06/8c1d4f7a2e93.jpg', publicUrl: '/assets/img/doctor-huang.jpg', originalFileName: 'doctor-huang.jpg', contentType: 'image/jpeg', byteSize: 205_000, width: 900, height: 1200, altText: '示範醫師二大頭照', caption: null, isPrivate: false, uploadedByUserId: 3, createdAt: now },
    { id: 6, containerName: 'public-media', blobPath: 'img/2024/08/4e7b1c9d3a56.jpg', publicUrl: '/assets/img/index-p01.jpg', originalFileName: 'index-p01.jpg', contentType: 'image/jpeg', byteSize: 320_000, width: 1200, height: 800, altText: '文章示意封面照', caption: null, isPrivate: false, uploadedByUserId: 2, createdAt: now },
    { id: 7, containerName: 'public-media', blobPath: 'img/2024/05/2a8f5c1e9b34.png', publicUrl: '/assets/img/product-p01.png', originalFileName: 'product-p01.png', contentType: 'image/png', byteSize: 96_000, width: 250, height: 250, altText: null, caption: null, isPrivate: false, uploadedByUserId: 2, createdAt: now },
    { id: 8, containerName: 'public-media', blobPath: 'img/2024/07/7f2e9a4c1d68.jpg', publicUrl: '/assets/img/photo-glass-facade.jpg', originalFileName: 'photo-glass-facade.jpg', contentType: 'image/jpeg', byteSize: 410_000, width: 1600, height: 900, altText: '診所外觀玻璃立面', caption: '據點外觀候選圖', isPrivate: false, uploadedByUserId: 4, createdAt: now },
    { id: 9, containerName: 'public-media', blobPath: 'img/2024/07/5d9b3f7a1c24.jpg', publicUrl: '/assets/img/stock-camellia.jpg', originalFileName: 'stock-camellia.jpg', contentType: 'image/jpeg', byteSize: 275_000, width: 1200, height: 800, altText: '山茶花意象照', caption: null, isPrivate: false, uploadedByUserId: 4, createdAt: now },
    // 私有容器示意：非圖片型別、無公開網址（docs/11-backend-design.md §9 第 3 點：容器隔離）
    { id: 10, containerName: 'private-docs', blobPath: 'private/2024/09/e1c4a7f2b935.pdf', publicUrl: null, originalFileName: 'informed-consent-template.pdf', contentType: 'application/pdf', byteSize: 184_000, width: null, height: null, altText: null, caption: '術前同意書範本（私有容器，讀取需另一組 SAS，本輪 mock 未實作）', isPrivate: true, uploadedByUserId: 1, createdAt: now },
  ]

  const usages: MediaUsage[] = [
    { id: 1, mediaId: 1, contentUnit: 'page', contentTitle: '首頁版位', usageKind: 1 },
    // 同一個檔案被兩處引用，示意 MediaUsages 的存在理由——FK 欄位（CoverMediaId）查得到
    // 第一筆，但「內文嵌入」這筆只有靠解析 BodyBlocks 寫入的這張表才查得到（docs/08 §E-2）。
    { id: 2, mediaId: 1, contentUnit: 'article', contentTitle: '（示意）淺談皮秒雷射的適應症', usageKind: 3 },
    { id: 3, mediaId: 3, contentUnit: 'doctor', contentTitle: '示範藝術總監', usageKind: 1 },
    { id: 4, mediaId: 4, contentUnit: 'doctor', contentTitle: '示範醫師一', usageKind: 1 },
    { id: 5, mediaId: 6, contentUnit: 'article', contentTitle: '（示意）淺談皮秒雷射的適應症', usageKind: 1 },
    { id: 6, mediaId: 7, contentUnit: 'treatment', contentTitle: '皮秒雷射（示意）', usageKind: 1 },
  ]

  return { version: 1, assets, usages }
}

const store = createStore<MediaDb>('media', seed, 1)

function usagesFor(db: MediaDb, mediaId: number): MediaUsage[] {
  return db.usages.filter((u) => u.mediaId === mediaId)
}

// ── 對外門面 ──────────────────────────────────────────────────────────

export const mediaApi = {
  /** docs/10-api.md §3.4：`GET /admin/media`，這裡先不分頁——媒體庫是總覽用途，量體遠小於九個內容模型。 */
  async list(query: MediaListQuery = {}): Promise<MediaAssetWithUsage[]> {
    const db = store.read()
    let items = [...db.assets]
    if (query.keyword) {
      const kw = query.keyword.trim()
      if (kw) {
        items = items.filter(
          (a) => a.originalFileName.includes(kw) || (a.altText ?? '').includes(kw) || (a.caption ?? '').includes(kw),
        )
      }
    }
    if (query.contentType === 'image') items = items.filter((a) => a.contentType.startsWith('image/'))
    else if (query.contentType === 'other') items = items.filter((a) => !a.contentType.startsWith('image/'))

    const withUsage: MediaAssetWithUsage[] = items.map((a) => {
      const usages = usagesFor(db, a.id)
      return { ...a, usageCount: usages.length, usages }
    })
    const filtered = query.unusedOnly ? withUsage.filter((a) => a.usageCount === 0) : withUsage
    return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)
  },

  /**
   * docs/10-api.md §3.4：`DELETE /admin/media`。
   * ⚠️ 刪除前必須檢查 `MediaUsages`——仍被引用就擋下並說明在哪幾筆內容用到
   * （docs/11-backend-design.md §9：不刪的話對按了「移除」的人來說就是沒移除；
   * 反過來，允許刪除仍被引用的檔案，對還在用的人來說圖就無聲消失了）。
   */
  async remove(id: number): Promise<void> {
    const db = store.read()
    const asset = db.assets.find((a) => a.id === id)
    if (!asset) throw new ApiError('NOT_FOUND', '找不到這個檔案。')
    const usages = usagesFor(db, id)
    if (usages.length) {
      const detail = usages.map((u) => `${u.contentTitle}（${USAGE_KIND_LABEL[u.usageKind]}）`).join('、')
      throw new ApiError('CONFLICT_STATE', `仍有 ${usages.length} 筆內容引用，無法刪除：${detail}`)
    }
    store.mutate((draft) => {
      draft.assets = draft.assets.filter((a) => a.id !== id)
    })
  },

  /** 補 alt 文字／圖說用（docs/08 §E-1：舊站 alt 普遍缺漏，遷移時要補）。media.edit 權限即可，不涉及本文審核。 */
  async updateMeta(id: number, patch: { altText?: string | null; caption?: string | null }): Promise<MediaAsset> {
    return store.mutate((draft) => {
      const asset = draft.assets.find((a) => a.id === id)
      if (!asset) throw new ApiError('NOT_FOUND', '找不到這個檔案。')
      if (patch.altText !== undefined) asset.altText = patch.altText || null
      if (patch.caption !== undefined) asset.caption = patch.caption || null
      return { ...asset }
    })
  },

  /**
   * 取短效寫入 SAS。docs/09-frontend.md §9：檔案**不經過 API 的 request body**，
   * 由瀏覽器直傳 Blob。
   *
   * ⚠️ 刻意丟錯而不是回假網址 —— 假裝上傳成功會讓人以為這條路徑已經通了。
   */
  async requestUploadSas(_fileName: string, _contentType: string): Promise<never> {
    throw new ApiError('INTERNAL', 'TODO：尚未串接 api.20skin.tw，媒體直傳流程待實作（docs/09-frontend.md §9）。')
  },
}
